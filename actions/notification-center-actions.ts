"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { laClaveDelServidorDeLaCuenta } from "@/lib/clave-del-servidor.server";
import { fetchChatsFromEvolution } from "@/actions/chat-actions";
import { isEvolutionRestInstance } from "@/lib/instance-display-name";
import { avisosDeLaCampanita } from "@/lib/avisos-de-tarea";
import { enlaceDeLaMencion } from "@/lib/acceso-por-mencion";
import { elDestinatarioDeLosAvisos } from "@/lib/avisos-de-tarea-tipos";
import { aDondeLleva } from "@/lib/avisos-de-tarea-tipos";
import { pagaElClienteSuIa } from "@/lib/llaves-de-verzay";
import { elSaldoDeLaFila } from "@/lib/saldo-de-la-cuenta";
import { elAvisoDeCreditos, elTextoDelAvisoDeCreditos, losCambiosDeAsignacion } from "@/lib/campana";

export type NotificationKind =
  | "task"
  | "appointment"
  | "connection"
  | "chat"
  | "mention"
  | "followup"
  /**
   * Lo que pasa DENTRO de una tarea: te la asignaron, alguien la dio por hecha,
   * alguien comentó. Aparte de `task` —que son las vencidas— a propósito: una
   * es trabajo que se pasó de fecha y la otra es alguien hablándote.
   */
  | "tarea"
  /** Correos sin leer: el número lo pide la campana aparte (`correosSinLeerAction`). */
  | "correo"
  /** Te asignaron o te quitaron una conversación (`AssignmentLog`). */
  | "asignacion"
  /** El mismo aviso de créditos bajos que el motor manda por WhatsApp. */
  | "creditos";

export type NotificationCenterItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  description?: string | null;
  href: string;
  date?: string | null;
};

export type NotificationCenterData = {
  total: number;
  counts: Record<NotificationKind, number>;
  items: NotificationCenterItem[];
};

const EMPTY_COUNTS: Record<NotificationKind, number> = {
  task: 0,
  appointment: 0,
  connection: 0,
  chat: 0,
  mention: 0,
  followup: 0,
  tarea: 0,
  correo: 0,
  asignacion: 0,
  creditos: 0,
};

const ITEMS_PER_KIND_LIMIT = 50;

/** Cuántos días atrás se miran las asignaciones. Más viejo que esto no es un aviso. */
const DIAS_DE_ASIGNACIONES = 7;
/** Tope de conversaciones cuya historia se recorre en una vuelta. */
const TOPE_DE_CONVERSACIONES = 200;

/** La tabla es del motor; sin ella (42P01) no hay avisos, y no es un error. */
function faltaLaTabla(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; message?: string };
  return e?.meta?.code === "42P01" || e?.code === "42P01" || /does not exist|no existe/i.test(e?.message ?? "");
}

/**
 * El aviso de créditos bajos de la cuenta, leído de las MISMAS filas con las
 * que el motor decide no repetir el WhatsApp (`ia_credit_alerts`). Lo que
 * decide cuál enseñar es `elAvisoDeCreditos`, puro.
 */
async function losAvisosDeCreditos(cuenta: string): Promise<NotificationCenterItem[]> {
  let enviados: { umbral: number; enviadoEn: string }[] = [];
  try {
    const filas = await db.$queryRaw<{ threshold: number; createdAt: Date }[]>`
      SELECT "threshold", "createdAt" FROM "ia_credit_alerts" WHERE "userId" = ${cuenta}
    `;
    enviados = filas.map((f) => ({ umbral: Number(f.threshold), enviadoEn: new Date(f.createdAt).toISOString() }));
  } catch (error) {
    if (!faltaLaTabla(error)) console.warn("[notification-center] avisos de créditos", error);
    return [];
  }
  if (enviados.length === 0) return [];

  const [pagaSuIa, fila] = await Promise.all([
    pagaElClienteSuIa(cuenta),
    db.iaCredit.findUnique({ where: { userId: cuenta }, select: { total: true, used: true } }),
  ]);
  const saldo = elSaldoDeLaFila({ fila, pagaSuIa });
  const aviso = elAvisoDeCreditos(
    enviados,
    saldo.estado === "quedan"
      ? { estado: "quedan", disponibles: saldo.creditos, total: fila?.total ?? 0 }
      : saldo,
  );
  if (!aviso) return [];
  const texto = elTextoDelAvisoDeCreditos(aviso);
  return [
    {
      // El umbral y la fecha van en el id: marcado como leído, un umbral NUEVO
      // —o el mismo en el ciclo siguiente— vuelve a salir.
      id: `creditos:${aviso.umbral}:${aviso.enviadoEn}`,
      kind: "creditos",
      title: texto.titulo,
      description: texto.descripcion,
      href: "/profile",
      date: aviso.enviadoEn,
    },
  ];
}

/**
 * Las conversaciones que le asignaron o le quitaron a la PERSONA en los
 * últimos días. La historia de cada conversación se trae entera —también lo
 * de antes de la ventana— porque sin ella no se sabe quién la llevaba al
 * empezar (ver `losCambiosDeAsignacion`).
 */
async function losAvisosDeAsignacion(persona: string): Promise<NotificationCenterItem[]> {
  const desde = new Date(Date.now() - DIAS_DE_ASIGNACIONES * 24 * 60 * 60 * 1000);
  const filas = await db.$queryRaw<
    { id: number; sessionId: number; advisorId: string | null; assignedBy: string | null; action: string; createdAt: Date }[]
  >`
    WITH candidatas AS (
      SELECT DISTINCT r."sessionId"
      FROM "AssignmentLog" r
      WHERE r."createdAt" >= ${desde}
        AND EXISTS (
          SELECT 1 FROM "AssignmentLog" x
          WHERE x."sessionId" = r."sessionId" AND x."advisorId" = ${persona}
        )
      LIMIT ${TOPE_DE_CONVERSACIONES}
    )
    SELECT al.id, al."sessionId", al."advisorId", al."assignedBy", al.action, al."createdAt"
    FROM "AssignmentLog" al
    WHERE al."sessionId" IN (SELECT "sessionId" FROM candidatas)
  `;
  const cambios = losCambiosDeAsignacion(
    filas.map((f) => ({ ...f, id: Number(f.id), sessionId: Number(f.sessionId), createdAt: new Date(f.createdAt).toISOString() })),
    persona,
    desde.toISOString(),
  ).slice(0, ITEMS_PER_KIND_LIMIT);
  if (cambios.length === 0) return [];

  const sesionIds = Array.from(new Set(cambios.map((c) => c.sessionId)));
  const quienes = Array.from(new Set(cambios.map((c) => c.porQuien).filter(Boolean))) as string[];
  const [sesiones, gente] = await Promise.all([
    db.session.findMany({
      where: { id: { in: sesionIds } },
      select: { id: true, pushName: true, customName: true, remoteJid: true },
    }),
    quienes.length
      ? db.user.findMany({ where: { id: { in: quienes } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string | null }[]),
  ]);
  const sesion = new Map(sesiones.map((s) => [s.id, s]));
  const nombre = new Map(gente.map((g) => [g.id, g.name]));

  return cambios.flatMap((c) => {
    const s = sesion.get(c.sessionId);
    if (!s) return [];
    const contacto = s.customName || s.pushName || cleanJidNumber(s.remoteJid);
    const quien = c.porQuien ? nombre.get(c.porQuien) || "Un asesor" : "El reparto automático";
    return [
      {
        id: `asignacion:${c.id}`,
        kind: "asignacion" as const,
        title: c.tipo === "asignada" ? `Te asignaron el chat con ${contacto}` : `Te quitaron el chat con ${contacto}`,
        description: c.tipo === "asignada" ? `${quien} te lo asignó.` : `${quien} lo movió.`,
        // Asignada: lleva a ESA conversación. Quitada: ya no es suya, así que a
        // la bandeja.
        href: c.tipo === "asignada" ? `/chats?jid=${encodeURIComponent(s.remoteJid)}` : "/chats",
        date: c.en,
      },
    ];
  });
}

/** Número limpio de un JID (sin @s.whatsapp.net ni sufijo :dispositivo). */
const cleanJidNumber = (jid?: string | null) => {
  const raw = (jid ?? "").replace(/@.*/, "").split(":")[0];
  return raw || (jid ?? "");
};

export async function getNotificationCenterData(): Promise<{
  success: boolean;
  data: NotificationCenterData;
  message?: string;
}> {
  const user = await currentUser();
  if (!user) {
    return { success: false, data: { total: 0, counts: EMPTY_COUNTS, items: [] }, message: "No autorizado." };
  }

  const ownerId = user.ownerId ?? user.id;
  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // El «Compromiso:» se queda aunque ya nadie escriba tareas con ese titulo: la
  // deteccion que las creaba —la ventana de «Compromiso detectado»— se retiro,
  // pero sus filas siguen en la base y son tareas de verdad, con su fecha y su
  // asesor. Quitar esta linea no borraria ninguna: las sacaria del grupo de
  // Seguimientos y las mandaria a Vencidas, que es cambiarle la campanita a
  // quien no ha pedido nada. «Promesa cliente:» si sigue escribiendose.
  const followupWhere = {
    ownerId,
    status: "pending",
    dueDate: { lte: next24Hours },
    OR: [
      { type: "Seguimiento" },
      { title: { startsWith: "Compromiso:", mode: "insensitive" } },
      { title: { startsWith: "Promesa cliente:", mode: "insensitive" } },
    ],
  };

  try {
    const [
      overdueTasks,
      taskCount,
      followups,
      followupCount,
      pendingAppointments,
      appointmentCount,
      instances,
      owner,
    ] = await Promise.all([
      (db as any).task.findMany({
        where: {
          ownerId,
          status: "pending",
          dueDate: { lt: now },
          NOT: { OR: followupWhere.OR },
        },
        orderBy: { dueDate: "asc" },
        take: ITEMS_PER_KIND_LIMIT,
      }),
      (db as any).task.count({
        where: {
          ownerId,
          status: "pending",
          dueDate: { lt: now },
          NOT: { OR: followupWhere.OR },
        },
      }),
      (db as any).task.findMany({
        where: followupWhere,
        orderBy: { dueDate: "asc" },
        take: ITEMS_PER_KIND_LIMIT,
      }),
      (db as any).task.count({ where: followupWhere }),
      db.appointment.findMany({
        where: { userId: ownerId, status: "PENDIENTE", startTime: { gte: now } },
        include: { session: { select: { pushName: true, remoteJid: true } }, service: { select: { name: true } } },
        orderBy: { startTime: "asc" },
        take: ITEMS_PER_KIND_LIMIT,
      }),
      db.appointment.count({
        where: { userId: ownerId, status: "PENDIENTE", startTime: { gte: now } },
      }),
      db.instancia.findMany({
        where: { userId: ownerId },
        select: { id: true, instanceName: true, instanceType: true },
      }),
      db.user.findUnique({
        where: { id: ownerId },
        select: { apiKeyId: true },
      }),
    ]);

    // Chats sin leer: mensajes con unreadCount > 0 en Evolution (bajan a 0 al abrir el chat)
    let unreadChats: {
      remoteJid: string;
      pushName?: string | null;
      updatedAt?: string | null;
      lastMessage?: { key?: { id?: string | null } | null } | null;
    }[] = [];
    if (instances.length > 0 && owner?.apiKeyId) {
      // Solo instancias servibles por Evolution. El último fallback ya NO
      // es instances[0]: si solo hay Meta/Telegram, no se llama al endpoint de
      // Evolution (daba 404 "Cannot GET /chat/findChats/<meta>"); esos chats se
      // leen del store unificado, no de aquí.
      const instance =
        instances.find((i) => i.instanceType === "Whatsapp") ??
        instances.find((i) => i.instanceType == null) ??
        instances.find((i) => isEvolutionRestInstance(i.instanceType));

      if (instance) {
        // La clave se lee en el servidor y se queda aquí: con ella solo se
        // consulta Evolution, no viaja en la respuesta.
        const apiKey = await laClaveDelServidorDeLaCuenta(ownerId);
        if (apiKey) {
          const chatsResult = await fetchChatsFromEvolution(
            { url: apiKey.url, key: apiKey.key },
            instance.instanceName,
          );

          if (chatsResult.success && chatsResult.data) {
            // Solo mensajes REALMENTE sin leer (unreadCount > 0). Al abrir el chat
            // se marcan como leídos en Evolution → desaparece de la campanita; un
            // mensaje nuevo lo vuelve a mostrar. (Antes se incluían también las
            // sesiones con el agente pausado, que reaparecían aunque ya se hubieran
            // visto, porque ese estado no cambia al leer el chat.)
            unreadChats = chatsResult.data
              .filter((c) => {
                if (!c.lastMessage || c.lastMessage.key?.fromMe) return false;
                return (c.unreadCount ?? 0) > 0;
              })
              .slice(0, ITEMS_PER_KIND_LIMIT);
          }
        }
      }
    }
    const chatCount = unreadChats.length;

    // Notificaciones de colaboración (menciones / agregado como participante).
    let collabItems: NotificationCenterItem[] = [];
    try {
      const collabRows = await (db as any).collabNotification.findMany({
        // La PERSONA, como los avisos de tarea de más abajo: `recipientId` se
        // escribe con ids del equipo —personas— y leerlo con la fila efectiva
        // dejaba sin campanita a quien estuviera dentro de otra cuenta.
        where: { recipientId: elDestinatarioDeLosAvisos(user) ?? user.id, readAt: null },
        orderBy: { createdAt: "desc" },
        take: ITEMS_PER_KIND_LIMIT,
      });
      const actorIds = Array.from(
        new Set(collabRows.map((r: any) => r.actorId).filter(Boolean)),
      ) as string[];
      const actors = actorIds.length
        ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
        : [];
      const actorName = new Map(actors.map((a) => [a.id, a.name]));
      collabItems = collabRows.map((r: any) => {
        const who = r.actorId ? actorName.get(r.actorId) || "Un asesor" : "Un asesor";
        const title =
          r.type === "mention"
            ? `${who} te mencionó en una conversación`
            : `${who} te agregó a una conversación`;
        return {
          id: `collab:${r.id}`,
          kind: "mention" as const,
          title,
          description: r.content ?? null,
          // El mismo enlace que la campanita del navegador (`enlaceDeLaMencion`):
          // lleva a ESA conversación y dice que se entra por una mención.
          href: enlaceDeLaMencion({ remoteJid: r.remoteJid ?? null, sessionId: r.type === "mention" ? r.sessionId ?? null : null }),
          date: r.createdAt.toISOString(),
        };
      });
    } catch (e) {
      console.error("[notification-center] collab", e);
    }

    // Lo que pasó dentro de una tarea. El registro de todo lo que salta en la
    // ventana emergente: si la persona no estaba delante cuando pasó, lo lee
    // aquí. Nada se pierde.
    //
    // Se enseña lo que no está **leído** (`atendido`), no lo que no está visto.
    // Son dos marcas distintas a propósito: el clic de la ventana —abrir o
    // cerrar— marca leído y descuenta de aquí; el punto del tablero es la otra,
    // y solo se apaga abriendo la tarea.
    let avisosDeTareas: NotificationCenterItem[] = [];
    try {
      // La PERSONA, no la fila efectiva: dentro de otra cuenta los avisos se
      // escriben con su id y se leían con el de la cuenta, así que no salían.
      avisosDeTareas = (await avisosDeLaCampanita(elDestinatarioDeLosAvisos(user) ?? user.id))
        .filter((a) => !a.atendido)
        .map((a) => ({
          id: `tarea:${a.id}`,
          kind: "tarea" as const,
          title: a.titulo,
          description: a.texto,
          href: aDondeLleva(a),
          date: a.creadoEn,
        }));
    } catch (e) {
      // Mudo aquí se lee como «no me llegó nada», que es el fallo que esto vino
      // a arreglar.
      console.warn("[notification-center] avisos de tarea", e);
    }

    // Asignaciones y créditos bajos: cada uno en su `try`, como los de arriba.
    // Un fallo de uno no puede dejar la campana sin chats ni citas, pero
    // tampoco es mudo.
    const persona = elDestinatarioDeLosAvisos(user) ?? user.id;
    const [asignacionItems, creditosItems] = await Promise.all([
      losAvisosDeAsignacion(persona).catch((e) => {
        console.warn("[notification-center] asignaciones", e);
        return [] as NotificationCenterItem[];
      }),
      losAvisosDeCreditos(ownerId).catch((e) => {
        console.warn("[notification-center] créditos", e);
        return [] as NotificationCenterItem[];
      }),
    ]);

    const connectionItems: NotificationCenterItem[] = [];
    if (instances.length === 0) {
      connectionItems.push({
        id: "connection-no-instance",
        kind: "connection",
        title: "Sin instancia de WhatsApp",
        description: "Crea o conecta una instancia para enviar y recibir mensajes.",
        href: "/profile",
      });
    }
    if (!owner?.apiKeyId) {
      connectionItems.push({
        id: "connection-no-apikey",
        kind: "connection",
        title: "API Key sin configurar",
        description: "Configura una API Key para habilitar envios y automatizaciones.",
        href: "/profile",
      });
    }
    const items: NotificationCenterItem[] = [
      ...avisosDeTareas,
      ...collabItems,
      ...asignacionItems,
      ...creditosItems,
      ...connectionItems,
      ...unreadChats.map((chat) => ({
        // El último mensaje va dentro del identificador a propósito. La campanita
        // recuerda lo que ya se abrió; con un id fijo por contacto, haberlo
        // abierto una vez lo callaría para siempre y no se volvería a avisar de
        // sus mensajes nuevos. Cambiando el id con cada mensaje, lo visto se
        // queda visto y lo nuevo vuelve a salir.
        id: `chat-${chat.remoteJid}-${chat.lastMessage?.key?.id ?? chat.updatedAt ?? ""}`,
        kind: "chat" as const,
        title: chat.pushName || cleanJidNumber(chat.remoteJid),
        description: "Mensaje sin leer",
        href: `/chats?jid=${encodeURIComponent(chat.remoteJid)}`,
        date: chat.updatedAt ?? null,
      })),
      ...pendingAppointments.map((appointment) => ({
        id: `appointment-${appointment.id}`,
        kind: "appointment" as const,
        title: appointment.clientName || appointment.session.pushName || cleanJidNumber(appointment.session.remoteJid),
        description: appointment.service?.name ? `Cita pendiente: ${appointment.service.name}` : "Cita pendiente",
        href: "/schedule",
        date: appointment.startTime.toISOString(),
      })),
      ...overdueTasks.map((task: any) => ({
        id: `task-${task.id}`,
        kind: "task" as const,
        title: task.title,
        description: task.contactName ? `Tarea vencida con ${task.contactName}` : "Tarea vencida",
        href: "/tareas",
        date: task.dueDate?.toISOString?.() ?? null,
      })),
      ...followups.map((task: any) => ({
        id: `followup-${task.id}`,
        kind: "followup" as const,
        title: task.title,
        description: task.contactName
          ? `Seguimiento con ${task.contactName}`
          : "Seguimiento pendiente",
        href: "/tareas",
        date: task.dueDate?.toISOString?.() ?? null,
      })),
    ];

    const counts = {
      task: taskCount,
      appointment: appointmentCount,
      connection: connectionItems.length,
      chat: chatCount,
      mention: collabItems.length,
      followup: followupCount,
      tarea: avisosDeTareas.length,
      // El número de correos lo pide la campana aparte: pregunta a Gmail,
      // Outlook o IMAP, y un buzón lento no puede retener todo lo demás.
      correo: 0,
      asignacion: asignacionItems.length,
      creditos: creditosItems.length,
    };

    return {
      success: true,
      data: {
        counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        items,
      },
    };
  } catch (error) {
    console.error("[getNotificationCenterData]", error);
    return {
      success: false,
      data: { total: 0, counts: EMPTY_COUNTS, items: [] },
      message: "Error al cargar notificaciones.",
    };
  }
}
