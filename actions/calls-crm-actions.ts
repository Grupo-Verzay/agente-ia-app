'use server';

// CRM de Llamadas: lee las llamadas registradas en chat_messages (messageType
// 'call') y devuelve KPIs + serie por día + lista, para el dashboard de llamadas.
// Las salientes las registra el front en vivo; las entrantes el backend (evento
// CALL de Evolution). Aquí solo se LEE y agrega.

import { Prisma } from '@prisma/client';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isCallDisposition } from '@/lib/call-dispositions';
import { elCallRowDesdeLaFila, type CallRow, type CallDirection } from '@/lib/fila-de-llamada';
import { lasCuentasQueConsultaElCrm } from '@/lib/cuentas-del-crm';
import { elTopeDelCrm } from '@/lib/crm-de-la-familia';
import { laLineaDeWhatsappDeLaCuenta, porQueNoHayLineaQr } from '@/lib/linea-de-whatsapp';

export type { CallRow, CallDirection };

export interface CallsKpis {
  total: number;
  outgoing: number;
  incoming: number;
  missed: number;
  answered: number;
  totalDurationSecs: number;
  avgDurationSecs: number;
}

export interface CallsCrmData {
  kpis: CallsKpis;
  byDay: { date: string; outgoing: number; incoming: number }[];
  calls: CallRow[];
}

/**
 * Cuantas llamadas se leen por cuenta elegida. Esta lista viaja ENTERA al
 * navegador, asi que crece con las cuentas y con techo (`elTopeDelCrm`):
 * dejando el tope de una sola cuenta al unificar tres, las tres se reparten las
 * mismas filas —van ordenadas por fecha, asi que se intercalan— y cada una
 * ensena menos de lo que ensena sola.
 */
const TOPE_DE_LLAMADAS_POR_CUENTA = 1000;

const EMPTY: CallsCrmData = {
  kpis: { total: 0, outgoing: 0, incoming: 0, missed: 0, answered: 0, totalDurationSecs: 0, avgDurationSecs: 0 },
  byDay: [],
  calls: [],
};

interface RawCallRow {
  id: unknown;
  userId: string;
  instanceName: string | null;
  remoteJid: string;
  fromMe: boolean;
  content: string | null;
  raw: unknown;
  messageTimestamp: Date;
  pushName: string | null;
}

export async function getCallsCrmData(params?: {
  days?: number;
  direction?: 'all' | CallDirection;
  /**
   * Las cuentas que el filtro tiene puestas. Se re-resuelven en el servidor:
   * una accion ES un endpoint y esta lista llega del navegador.
   */
  cuentas?: readonly string[] | null;
}): Promise<CallsCrmData> {
  const me = await currentUser();
  if (!me?.effectiveId) return EMPTY;

  const cuentas = await lasCuentasQueConsultaElCrm(me.effectiveId, params?.cuentas);

  // Las llamadas pueden quedar guardadas bajo cualquiera de los ids ligados al
  // usuario (cuenta activa, dueño del equipo, la propia o la sesión real del
  // admin). Leemos bajo TODOS para que el historial no desaparezca al cambiar de
  // cuenta/equipo. Son ids de su propia identidad, no hay fuga entre clientes.
  //
  // Pero esas variantes SOLO entran cuando la cuenta propia esta entre las
  // elegidas: reduciendo el filtro a una sola cuenta hermana, el respaldo de
  // identidad volveria a arrastrar las filas de la propia y el filtro no
  // filtraria nada — «un filtro que ofrece un numero tiene que poder llegar a
  // el», por la otra puerta.
  const laPropiaEstaElegida = cuentas.includes(me.effectiveId);
  const scopeIds = Array.from(
    new Set(
      [
        ...cuentas,
        ...(laPropiaEstaElegida
          ? [me?.ownerId, me?.id, (me as any)?.sessionUserId]
          : []),
      ].filter(Boolean),
    ),
  ) as string[];
  if (scopeIds.length === 0) return EMPTY;

  const days = Math.min(Math.max(params?.days ?? 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000);

  let rows: RawCallRow[] = [];
  try {
    rows = await db.$queryRaw<RawCallRow[]>`
      SELECT m."id", m."userId", m."instanceName", m."remoteJid", m."fromMe", m."content", m."raw", m."messageTimestamp", c."pushName"
      FROM "chat_messages" m
      LEFT JOIN "chat_conversations" c
        ON c."userId" = m."userId" AND c."instanceName" = m."instanceName" AND c."remoteJid" = m."remoteJid"
      WHERE m."userId" IN (${Prisma.join(scopeIds)}) AND m."messageType" = 'call' AND m."messageTimestamp" >= ${since}
      ORDER BY m."messageTimestamp" DESC
      LIMIT ${elTopeDelCrm(TOPE_DE_LLAMADAS_POR_CUENTA, cuentas.length)}
    `;
  } catch (err) {
    console.error('[getCallsCrmData]', err);
    return EMPTY;
  }

  const calls: CallRow[] = rows.map(elCallRowDesdeLaFila);

  // El nombre puesto a mano del lead, por teléfono. La columna Detalle ya NO
  // lee la síntesis del lead (eso es contexto del chat y se queda allá): lee
  // el resumen de ESTA llamada. Aquí solo queda el nombre.
  try {
    const phones = Array.from(new Set(calls.map((c) => c.phone).filter(Boolean)));
    if (phones.length > 0) {
      const jids = phones.map((p) => `${p}@s.whatsapp.net`);
      const sessions = await db.session.findMany({
        where: { userId: { in: scopeIds }, remoteJid: { in: jids } },
        select: { remoteJid: true, customName: true },
      });

      // El nombre puesto a mano manda sobre el que da WhatsApp. Es el mismo
      // campo que se edita en Registros, así que el contacto se llama igual en
      // toda la App y un mensaje nuevo del cliente no lo pisa.
      const jidToCustomName = new Map<string, string>();
      for (const s of sessions) {
        const propio = s.customName?.trim();
        if (propio && !jidToCustomName.has(s.remoteJid)) jidToCustomName.set(s.remoteJid, propio);
      }
      for (const c of calls) {
        const propio = jidToCustomName.get(`${c.phone}@s.whatsapp.net`);
        if (propio) c.contactName = propio;
      }
    }
  } catch (err) {
    console.error('[getCallsCrmData] nombres', err);
  }

  const outgoing = calls.filter((c) => c.direction === 'outgoing');
  const incoming = calls.filter((c) => c.direction === 'incoming');
  const answered = outgoing.filter((c) => c.durationSecs > 0);
  const totalDurationSecs = outgoing.reduce((s, c) => s + c.durationSecs, 0);

  const kpis: CallsKpis = {
    total: calls.length,
    outgoing: outgoing.length,
    incoming: incoming.length,
    missed: incoming.length, // entrantes = perdidas (no se contestan por el dispositivo vinculado)
    answered: answered.length,
    totalDurationSecs,
    avgDurationSecs: answered.length ? Math.round(totalDurationSecs / answered.length) : 0,
  };

  const byDayMap = new Map<string, { outgoing: number; incoming: number }>();
  for (const c of calls) {
    const d = new Date(c.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const e = byDayMap.get(key) ?? { outgoing: 0, incoming: 0 };
    if (c.direction === 'outgoing') e.outgoing += 1;
    else e.incoming += 1;
    byDayMap.set(key, e);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, outgoing: v.outgoing, incoming: v.incoming }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const filtered =
    params?.direction && params.direction !== 'all'
      ? calls.filter((c) => c.direction === params.direction)
      : calls;

  return { kpis, byDay, calls: filtered };
}

/**
 * El MISMO alcance con el que `getCallsCrmData` enseñó la fila: la cuenta
 * propia, lo que cuelga de ella HACIA ABAJO y las variantes de su identidad.
 * Con solo las de su identidad, la llamada de una cuenta hija se veía y no se
 * podía marcar (la pantalla pintaba un «—»). Nunca la madre ni una hermana:
 * eso lo decide `lasCuentasQueConsultaElCrm`, no el navegador.
 */
async function elAlcanceDeEscritura(me: NonNullable<Awaited<ReturnType<typeof currentUser>>>): Promise<string[]> {
  return Array.from(
    new Set(
      [
        ...(await lasCuentasQueConsultaElCrm(me.effectiveId!)),
        me.effectiveId,
        me.ownerId,
        me.id,
        (me as any).sessionUserId,
      ].filter(Boolean),
    ),
  ) as string[];
}

/**
 * Guarda/actualiza la disposición (resultado) de una llamada concreta.
 * La llamada es una fila de chat_messages (messageType='call'); el resultado se
 * fusiona dentro de raw.call.disposition sin tocar el resto del JSON.
 */
export async function setCallDisposition(
  callId: string,
  disposition: string,
): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  if (!me?.effectiveId) return { success: false, message: 'No autorizado.' };
  if (!isCallDisposition(disposition)) return { success: false, message: 'Resultado inválido.' };
  const scopeIds = await elAlcanceDeEscritura(me);

  let id: bigint;
  try {
    id = BigInt(callId);
  } catch {
    return { success: false, message: 'ID de llamada inválido.' };
  }

  try {
    // Sólo la fila del propio usuario/equipo y de tipo 'call'.
    //
    // Y un MERGE en la base, no leer-cambiar-escribir el objeto entero: la
    // transcripción de la misma llamada se guarda en paralelo (se procesa al
    // colgar, justo cuando se elige el resultado), y escribir `raw` tal como se
    // leyó borraba la transcripción recién guardada. `dispositionSource:
    // 'manual'` es lo que hace que la propuesta de la IA ya no la pise.
    const filas = await db.$executeRaw`
      UPDATE "chat_messages"
         SET "raw" = COALESCE("raw", '{}'::jsonb)
                  || jsonb_build_object(
                       'call',
                       COALESCE("raw" -> 'call', '{}'::jsonb)
                       || jsonb_build_object('disposition', ${disposition}::text, 'dispositionSource', 'manual')
                     ),
             "updatedAt" = NOW()
       WHERE "id" = ${id}
         AND "messageType" = 'call'
         AND "userId" IN (${Prisma.join(scopeIds)})
    `;
    if (filas < 1) return { success: false, message: 'Llamada no encontrada.' };
    return { success: true };
  } catch (err) {
    console.error('[setCallDisposition]', err);
    return { success: false, message: 'No se pudo guardar el resultado.' };
  }
}

/**
 * El detalle de UNA llamada, leído de la base al abrir su diálogo.
 *
 * El diálogo pintaba la fila tal como vino con la lista, y la lista se carga
 * UNA vez al abrir la pantalla: una llamada cuya transcripción y resumen se
 * guardaron después —se procesan al colgar, tardan de segundos a minutos—
 * abría vacía aunque en la base ya los tuviera, hasta recargar la página.
 * Mismo alcance que `setCallDisposition` (lo propio y lo de abajo).
 */
export async function getCallDetailAction(callId: string): Promise<CallRow | null> {
  const me = await currentUser();
  if (!me?.effectiveId) return null;
  const scopeIds = await elAlcanceDeEscritura(me);
  let id: bigint;
  try {
    id = BigInt(callId);
  } catch {
    return null;
  }
  try {
    const rows = await db.$queryRaw<RawCallRow[]>`
      SELECT m."id", m."userId", m."instanceName", m."remoteJid", m."fromMe", m."content", m."raw", m."messageTimestamp", c."pushName"
      FROM "chat_messages" m
      LEFT JOIN "chat_conversations" c
        ON c."userId" = m."userId" AND c."instanceName" = m."instanceName" AND c."remoteJid" = m."remoteJid"
      WHERE m."id" = ${id} AND m."messageType" = 'call' AND m."userId" IN (${Prisma.join(scopeIds)})
      LIMIT 1
    `;
    return rows[0] ? elCallRowDesdeLaFila(rows[0]) : null;
  } catch (err) {
    console.error('[getCallDetailAction]', err);
    return null;
  }
}

/** Elimina las llamadas perdidas/entrantes del historial del usuario. */
export async function clearMissedCallsAction(): Promise<{ success: boolean; deleted?: number; message?: string }> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id].filter(Boolean)),
  ) as string[];
  if (scopeIds.length === 0) return { success: false, message: 'No autorizado.' };
  try {
    const res = await db.chatMessage.deleteMany({
      where: { userId: { in: scopeIds }, messageType: 'call', fromMe: false },
    });
    return { success: true, deleted: res.count };
  } catch (err) {
    console.error('[clearMissedCallsAction]', err);
    return { success: false, message: 'No se pudieron limpiar las llamadas perdidas.' };
  }
}

/** Elimina una llamada concreta del historial. */
export async function deleteCallAction(callId: string): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id, (me as any)?.sessionUserId].filter(Boolean)),
  ) as string[];
  if (scopeIds.length === 0) return { success: false, message: 'No autorizado.' };
  let id: bigint;
  try {
    id = BigInt(callId);
  } catch {
    return { success: false, message: 'ID inválido.' };
  }
  try {
    await db.chatMessage.deleteMany({ where: { id, userId: { in: scopeIds }, messageType: 'call' } });
    return { success: true };
  } catch (err) {
    console.error('[deleteCallAction]', err);
    return { success: false, message: 'No se pudo eliminar la llamada.' };
  }
}

/** Elimina TODAS las llamadas del historial del usuario. */
export async function deleteAllCallsAction(): Promise<{ success: boolean; deleted?: number; message?: string }> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id, (me as any)?.sessionUserId].filter(Boolean)),
  ) as string[];
  if (scopeIds.length === 0) return { success: false, message: 'No autorizado.' };
  try {
    const res = await db.chatMessage.deleteMany({ where: { userId: { in: scopeIds }, messageType: 'call' } });
    return { success: true, deleted: res.count };
  } catch (err) {
    console.error('[deleteAllCallsAction]', err);
    return { success: false, message: 'No se pudieron eliminar las llamadas.' };
  }
}

/*
 * Aquí vivía `getSessionIdByPhone`, que usaba el diálogo de detalle para
 * editar la síntesis del lead. La síntesis es contexto del CHAT y se quedó
 * allá; sin pantalla que la llame, la acción se va con ella — una acción de
 * servidor ES un endpoint.
 */

/**
 * Crea una tarea interna de "volver a llamar" (callback) para el asesor.
 * Usa la tabla `tasks` (sistema interno de tareas), NO el sistema de seguimientos
 * que envía WhatsApp al cliente. dueDate es ISO; se asigna al dueño de la cuenta.
 */
export async function scheduleCallbackAction(input: {
  phone: string;
  contactName?: string | null;
  dueDate: string; // ISO
  note?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  if (!me?.id) return { success: false, message: 'No autorizado.' };
  const ownerId = me.ownerId ?? me.id;

  const digits = (input.phone || '').replace(/\D/g, '');
  if (!digits) return { success: false, message: 'Número inválido.' };

  const due = new Date(input.dueDate);
  if (isNaN(due.getTime())) return { success: false, message: 'Fecha inválida.' };

  const contactJid = `${digits}@s.whatsapp.net`;
  const baseTitle = input.note?.trim()
    ? input.note.trim()
    : `Volver a llamar a ${input.contactName?.trim() || `+${digits}`}`;

  try {
    // Intentar enlazar con la sesión/lead por remoteJid (no es obligatorio).
    const session = await db.session.findFirst({
      where: { userId: ownerId, remoteJid: contactJid },
      select: { id: true, pushName: true },
    });

    await (db as any).task.create({
      data: {
        ownerId,
        assignedToId: ownerId,
        assignedToName: null,
        sessionId: session?.id ?? null,
        contactName: input.contactName?.trim() || session?.pushName || null,
        contactJid,
        title: baseTitle,
        type: 'Llamada',
        dueDate: due,
        status: 'pending',
        createdById: me.id,
      },
    });
    return { success: true };
  } catch (err) {
    console.error('[scheduleCallbackAction]', err);
    return { success: false, message: 'No se pudo agendar el callback.' };
  }
}

/** Diagnóstico: cuántas llamadas hay por cada id del usuario, la última y las instancias. */
export async function diagnoseCallsAction(): Promise<{
  scopeIds: string[];
  perScope: { id: string; calls: number }[];
  totalInScope: number;
  lastCall: { ts: number; userId: string; content: string } | null;
  instances: { instanceName: string | null; instanceType: string | null }[];
}> {
  const me = await currentUser();
  const scopeIds = Array.from(
    new Set([me?.effectiveId, me?.ownerId, me?.id, (me as any)?.sessionUserId].filter(Boolean)),
  ) as string[];
  const perScope: { id: string; calls: number }[] = [];
  for (const id of scopeIds) {
    const calls = await db.chatMessage.count({ where: { userId: id, messageType: 'call' } }).catch(() => 0);
    perScope.push({ id, calls });
  }
  const totalInScope = await db.chatMessage
    .count({ where: { userId: { in: scopeIds }, messageType: 'call' } })
    .catch(() => 0);
  const last = await db.chatMessage
    .findFirst({
      where: { userId: { in: scopeIds }, messageType: 'call' },
      orderBy: { messageTimestamp: 'desc' },
      select: { messageTimestamp: true, userId: true, content: true },
    })
    .catch(() => null);
  const insts = await db.instancia
    .findMany({ where: { userId: { in: scopeIds } }, select: { instanceName: true, instanceType: true } })
    .catch(() => [] as { instanceName: string | null; instanceType: string | null }[]);
  return {
    scopeIds,
    perScope,
    totalInScope,
    lastCall: last
      ? { ts: new Date(last.messageTimestamp).getTime(), userId: last.userId, content: last.content ?? '' }
      : null,
    instances: insts.map((i) => ({ instanceName: i.instanceName ?? null, instanceType: i.instanceType ?? null })),
  };
}

/**
 * Pone (o quita) el nombre del contacto de una llamada.
 *
 * Se guarda en el nombre propio del lead —el mismo que se edita en Registros—
 * y no en el que manda WhatsApp: ese lo vuelve a escribir el próximo mensaje
 * del cliente y el nombre puesto a mano se perdería. Si el número todavía no
 * tiene lead se crea uno mínimo, igual que al marcarle un estado.
 *
 * Pasar el nombre vacío lo borra y vuelve a verse el de WhatsApp.
 */
export async function setCallContactNameAction(input: {
  phone: string;
  name: string | null;
}): Promise<{ success: boolean; message?: string; name?: string | null }> {
  const me = await currentUser();
  const ownerId = me?.ownerId ?? me?.id;
  if (!ownerId) return { success: false, message: 'No autorizado.' };

  const digits = (input.phone || '').replace(/\D/g, '');
  if (!digits) return { success: false, message: 'Número inválido.' };
  const remoteJid = `${digits}@s.whatsapp.net`;

  const nombre = (input.name ?? '').trim().slice(0, 120) || null;

  try {
    // Todas las cuentas del mismo equipo, para que el contacto se llame igual
    // entre el dueño y sus asesores.
    const equipo = await db.user.findMany({
      where: { OR: [{ id: ownerId }, { ownerId }] },
      select: { id: true },
    });
    const idsDelEquipo = equipo.map((u) => u.id);

    const actualizadas = await db.session.updateMany({
      where: { userId: { in: idsDelEquipo }, remoteJid },
      data: { customName: nombre },
    });
    if (actualizadas.count > 0) return { success: true, name: nombre };

    // Sin nombre que guardar no hace falta inventar un lead.
    if (!nombre) return { success: true, name: null };

    // La línea por QR, sea cual sea su proveedor. Pidiendo `instanceType:
    // 'Whatsapp'` a secas, una cuenta con su línea en WhatsApp Mensajería
    // —que es como nacen hoy— recibía «No hay instancia de WhatsApp» con la
    // línea conectada delante. Es la misma hermana del aviso del voicebot.
    const { linea, todas } = await laLineaDeWhatsappDeLaCuenta(ownerId);
    const instanceId = linea?.instanceId;
    if (!instanceId) {
      return { success: false, message: porQueNoHayLineaQr(todas.map((i) => i.instanceType)) };
    }

    await db.session.create({
      data: {
        userId: ownerId,
        remoteJid,
        pushName: nombre,
        customName: nombre,
        instanceId,
        status: true,
      },
    });
    return { success: true, name: nombre };
  } catch (err) {
    console.error('[setCallContactNameAction]', err);
    return { success: false, message: 'No se pudo guardar el nombre.' };
  }
}

/*
 * Aquí vivía `setCallLeadStatusAction`, el estado del lead cambiado desde la
 * columna «Estado» de CRM › Llamadas. La columna se fue —Llamadas se alinea con
 * Leads, y el estado del lead se cambia en Leads, en el CRM y en Chats— y con
 * ella su único llamador. **Una acción de servidor ES un endpoint**: dejarla
 * publicada sin ninguna pantalla que la abra es una puerta que ya no vigila
 * nadie. El dato (`Session.leadStatus`) no se toca.
 */
