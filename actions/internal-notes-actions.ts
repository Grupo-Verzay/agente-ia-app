"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { lasCuentasQueVeLaBandeja } from "@/lib/cuentas-asociadas";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { laCuentaDeLaConversacion } from "@/lib/dueno-del-dato.server";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";
import {
  TOPE_DE_ADJUNTOS_DE_LA_NOTA,
  comoSeGuardanLosAdjuntosDeLaNota,
  elTextoDeLaNotaParaElAviso,
  laCuentaDelArchivoDeLaNota,
  type AdjuntoDeLaNota,
} from "@/lib/adjuntos-de-la-nota";
import {
  guardarLosAdjuntosDeLaNota,
  losAdjuntosDeLasNotas,
  prepararLosAdjuntosDeLasNotas,
  quitarLosAdjuntosDeLaNota,
  soltarLosArchivosDelBucket,
} from "@/lib/adjuntos-de-la-nota-db";
import { elEquipoDeLaCuenta } from "@/lib/equipo-de-la-cuenta.server";
import { darAccesoPorMencion } from "@/lib/acceso-por-mencion-db";
import { enlaceDeLaMencion, quienesRecibenAcceso } from "@/lib/acceso-por-mencion";
import { randomUUID } from "crypto";
import { crearLosAvisos } from "@/lib/avisos-de-tarea";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { separarLasMenciones, tituloDeLaMencionEnNota } from "@/lib/menciones-de-la-madre";
import {
  comoUltimaNota,
  TOPE_DEL_TEXTO_DE_LA_NOTA,
  type NotaDeLaFila,
} from "@/lib/nota-en-la-vista-previa";
import {
  losAdministradoresDeLaMadre,
  type AdministradorDeLaMadre,
} from "@/lib/administradores-de-la-madre.server";

/**
 * # Quién firma una nota interna, y quién la puede borrar
 *
 * `internal_notes.authorId` es una FIRMA —la pantalla pinta su nombre y su
 * correo por la relación `author`— así que va con la **PERSONA**
 * (`sessionUserId ?? id`) y no con la fila efectiva. Dentro de otra cuenta
 * —«Ingresar» o el conmutador— la fila efectiva es la del cliente, y la nota
 * salía firmada por él: el equipo leía su propio nombre diciendo cosas que no
 * había dicho nadie de allí. Es el mismo fallo que ya se arregló en el chat de
 * equipo (#761) y en `task_comments` (#785).
 *
 * Y **las dos puntas se mueven juntas**: `deleteInternalNoteAction` compara
 * `authorId` con quien llama para decidir si puede borrarla. Eso es identidad,
 * no alcance, así que se compara también con la persona; cambiando solo el
 * lado de escribir, el autor no podría borrar su propia nota.
 *
 * # Y la conversación tiene que ser de una cuenta que se alcanza
 *
 * Crear y leer las notas de una conversación preguntaban solo «¿hay sesión?»:
 * con cualquier cuenta y otro `sessionId` se leían —y se escribían— las notas
 * internas de una conversación ajena. Ahora las dos pasan por
 * `laCuentaDeLaConversacion` (`lib/dueno-del-dato.server.ts`), que saca el
 * dueño de la FILA y lo pregunta con la puerta de siempre.
 *
 * Lo que **no** se toca es `lasNotasDeLaBandejaAction`, que filtra por
 * `session.userId`: eso es ALCANCE —de qué cuenta son esas conversaciones— y
 * el alcance se pregunta a la fila efectiva (con las cuentas que la bandeja
 * enseña, `lasCuentasQueVeLaBandeja`). Resolver la persona ahí es exactamente
 * lo que rompió la cartera de clientes en el #783.
 *
 * # Y la nota puede llevar archivos
 *
 * Imagen, video, audio o documento, hasta `TOPE_DE_ADJUNTOS_DE_LA_NOTA`. Suben
 * antes al bucket (`lib/subir-adjuntos-de-la-nota.ts`) y aquí llegan solo sus
 * direcciones, que se vuelven a comprobar: de NUESTRO bucket, en la carpeta de
 * las notas y de una cuenta que se alcanza. Se guardan en `adjuntos_de_notas`
 * (`lib/adjuntos-de-la-nota-db.ts`) en la MISMA transacción que la nota: o
 * quedan las dos cosas o ninguna. Una nota puede ser SOLO un archivo.
 */

export type InternalNoteData = {
  id: number;
  sessionId: number;
  authorId: string;
  authorName: string | null;
  authorEmail: string;
  content: string;
  mentionedUserIds: string[];
  adjuntos: AdjuntoDeLaNota[];
  createdAt: string;
};

const createSchema = z.object({
  sessionId: z.number().int().positive(),
  // Vacío solo si la nota lleva un archivo: se comprueba abajo.
  content: z.string().trim().default(""),
  mentionedUserIds: z.array(z.string()).optional().default([]),
  // Lo que llega del navegador: se vuelve a comprobar entero abajo.
  adjuntos: z
    .array(
      z.object({
        url: z.string().max(2048).optional(),
        nombre: z.string().max(300).nullish(),
        mime: z.string().max(200).nullish(),
        tamano: z.number().optional(),
      }),
    )
    .max(TOPE_DE_ADJUNTOS_DE_LA_NOTA)
    .optional()
    .default([]),
});

async function assertAuthorized() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return user;
}

export async function createInternalNoteAction(
  input: z.input<typeof createSchema>,
): Promise<{ success: boolean; message: string; data?: InternalNoteData }> {
  try {
    const parsed = createSchema.parse(input);
    const user = await assertAuthorized();
    const yo = laPersonaQueActua(user).id;

    // De quién es la conversación lo dice la fila; «no existe» y «no es tuya»
    // se contestan igual.
    const alcanzada = await laCuentaDeLaConversacion(parsed.sessionId);
    if (!alcanzada) return { success: false, message: "Sesión no encontrada." };
    const session = alcanzada.sesion;

    // Una nota es texto, archivos o las dos cosas; vacía no.
    if (!parsed.content && parsed.adjuntos.length === 0) {
      return { success: false, message: "Escribe la nota o adjunta un archivo." };
    }
    // Los archivos, por la misma puerta que el chat del equipo: nuestra
    // dirección, la carpeta de las notas y una cuenta que se alcanza. Si uno
    // falla NO se guarda la nota sin él: se creería adjunto y no lo está.
    const bucket = { publicUrl: process.env.S3_PUBLIC_URL, nombre: process.env.S3_BUCKET_NAME || "verzay-media" };
    const { adjuntos, rechazados } = comoSeGuardanLosAdjuntosDeLaNota(parsed.adjuntos, bucket);
    if (rechazados > 0) {
      console.warn("[notas internas] llegaron adjuntos que no valen: la nota no se guarda", {
        sessionId: parsed.sessionId,
        rechazados,
      });
      return { success: false, message: "No se pudo adjuntar uno de los archivos." };
    }
    const carpetas = new Set(adjuntos.map((a) => laCuentaDelArchivoDeLaNota(a.url, bucket)));
    for (const carpeta of carpetas) {
      if (!carpeta || !(await laCuentaDeLaAccion(carpeta))) {
        console.warn("[notas internas] un adjunto está en la carpeta de una cuenta que no se alcanza", {
          sessionId: parsed.sessionId,
        });
        return { success: false, message: "No se pudo adjuntar uno de los archivos." };
      }
    }

    // No mencionarse a sí mismo; sin duplicados. Se descuenta la PERSONA: los
    // ids que llegan salen del desplegable de asesores, que son personas, así
    // que descontando la fila efectiva uno podría mencionarse a sí mismo desde
    // dentro de otra cuenta y saltarse su propio aviso.
    //
    // Y la lista de gente manda, no el navegador: una mención ahora ABRE la
    // conversación a quien se nombra, así que un id de fuera del equipo sería
    // la forma de abrírsela a cualquiera. Es la MISMA lista con la que se
    // agrega un participante (`elEquipoDeLaCuenta`), con el alcance de la
    // cuenta por la que se actúa (`ownerId ?? id`).
    const cuentaPropia: string = (user as any).ownerId ?? user.id;
    const equipo = await elEquipoDeLaCuenta(cuentaPropia);
    // Los administradores de la cuenta MADRE se piden solo si hace falta: si
    // todo lo mencionado es del equipo no hay nada que preguntar.
    const faltan = parsed.mentionedUserIds.some((id) => id && id !== yo && !equipo.has(id));
    const deLaMadre = faltan ? await losAdministradoresDeLaMadre(cuentaPropia) : [];
    const reparto = separarLasMenciones(
      parsed.mentionedUserIds,
      equipo,
      new Set(deLaMadre.map((a) => a.id)),
      yo,
    );
    // Lo guardado en la nota son TODOS los mencionados: la burbuja los nombra.
    const mentioned = [...reparto.delEquipo, ...reparto.deLaMadre];
    const descartados = reparto.descartados;
    if (descartados.length) {
      console.warn("[notas internas] menciones fuera del equipo, se ignoran", {
        sessionId: parsed.sessionId,
        descartados,
      });
    }

    // La tabla de adjuntos se asegura FUERA de la transacción: un DDL con su
    // plazo de candado no debe vivir dentro de ella.
    if (adjuntos.length) await prepararLosAdjuntosDeLasNotas();
    const note = await db.$transaction(async (tx) => {
      const creada = await (tx as any).internalNote.create({
        data: {
          sessionId: parsed.sessionId,
          authorId: yo,
          content: parsed.content,
          mentionedUserIds: mentioned,
        },
        include: { author: { select: { name: true, email: true } } },
      });
      await guardarLosAdjuntosDeLaNota(tx, creada.id, adjuntos);
      return creada;
    });

    // El acceso va ANTES del aviso: quien pulse la notificación en el acto
    // tiene que encontrar la puerta abierta. Solo a los agentes —los demás ya
    // ven la conversación—, y un fallo aquí no tumba la nota, pero se dice:
    // un acceso que no se dio se ve como «me mencionaron y no puedo entrar».
    // Solo los del EQUIPO: una mención a un administrador de la madre avisa y
    // nada más, no abre ninguna conversación.
    const conAcceso = quienesRecibenAcceso(reparto.delEquipo, equipo, yo);
    if (conAcceso.length) {
      try {
        await darAccesoPorMencion(parsed.sessionId, conAcceso, yo);
      } catch (accesoErr) {
        console.error("[createInternalNoteAction] no se pudo dar el acceso por mención", {
          sessionId: parsed.sessionId,
          conAcceso,
          accesoErr,
        });
      }
    }

    // Notificación por mención (campanita) para cada asesor mencionado.
    if (reparto.delEquipo.length > 0) {
      try {
        const preview = elTextoDeLaNotaParaElAviso(parsed.content, adjuntos).slice(0, 140);
        await (db as any).collabNotification.createMany({
          data: reparto.delEquipo.map((recipientId) => ({
            recipientId,
            actorId: yo,
            type: "mention",
            sessionId: parsed.sessionId,
            noteId: note.id,
            remoteJid: session.remoteJid,
            content: preview,
          })),
        });
      } catch (notifErr) {
        console.error("[createInternalNoteAction] notif menciones falló", notifErr);
      }
    }

    // Y a los administradores de la cuenta MADRE, la MISMA ventana que
    // interrumpe de una mención del chat de equipo (`task_alerts`, tipo
    // `mencion`), con la nota ENTERA dentro. Solo el aviso: ni acceso por
    // mención ni campanita de colaboración. `crearLosAvisos` no lanza y no es
    // mudo.
    if (reparto.deLaMadre.length > 0) {
      await avisarALaMadre({
        destinatarios: reparto.deLaMadre,
        autor: laPersonaQueActua(user),
        cuentaDeLaConversacion: session.userId,
        sessionId: parsed.sessionId,
        remoteJid: session.remoteJid,
        contenido: elTextoDeLaNotaParaElAviso(parsed.content, adjuntos),
      });
    }

    return {
      success: true,
      message: "Nota creada.",
      data: {
        id: note.id,
        sessionId: note.sessionId,
        authorId: note.authorId,
        authorName: note.author.name,
        authorEmail: note.author.email,
        content: note.content,
        mentionedUserIds: note.mentionedUserIds ?? [],
        adjuntos,
        createdAt: note.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("[createInternalNoteAction]", error);
    return { success: false, message: error instanceof Error ? error.message : "Error al crear la nota." };
  }
}

export async function getInternalNotesBySessionAction(
  sessionId: number,
): Promise<{ success: boolean; data?: InternalNoteData[]; message?: string }> {
  try {
    await assertAuthorized();
    if (!(await laCuentaDeLaConversacion(sessionId))) {
      return { success: false, message: "No autorizado." };
    }

    const notes = await (db as any).internalNote.findMany({
      where: { sessionId },
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Los archivos de todas las notas en UNA consulta. Si no se pueden leer, las
    // notas salen igual —el texto no se pierde— pero se dice: no es mudo.
    let adjuntosPorNota = new Map<number, AdjuntoDeLaNota[]>();
    try {
      adjuntosPorNota = await losAdjuntosDeLasNotas(notes.map((n: any) => n.id));
    } catch (adjuntosErr) {
      console.warn("[getInternalNotesBySessionAction] no se pudieron leer los adjuntos de las notas", adjuntosErr);
    }

    return {
      success: true,
      data: notes.map((n: any) => ({
        id: n.id,
        sessionId: n.sessionId,
        authorId: n.authorId,
        authorName: n.author.name,
        authorEmail: n.author.email,
        content: n.content,
        mentionedUserIds: n.mentionedUserIds ?? [],
        adjuntos: adjuntosPorNota.get(n.id) ?? [],
        createdAt: n.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[getInternalNotesBySessionAction]", error);
    return { success: false, message: "Error al cargar las notas." };
  }
}

/**
 * La ÚLTIMA nota interna de cada conversación que enseña la bandeja: su texto
 * (una línea) y cuándo se escribió.
 *
 * La lista la usa para dos cosas, y por eso viaja el texto y no solo el id:
 * el candado ámbar de la fila (la conversación tiene notas) y la VISTA PREVIA
 * cuando la nota es lo último que pasó en la conversación
 * (`lib/nota-en-la-vista-previa.ts`). Antes solo llegaban los ids, así que la
 * fila podía pintar el candado y nunca el texto.
 *
 * Una consulta para toda la bandeja: `DISTINCT ON` por conversación con su
 * nota más reciente, entrando por `internal_notes(sessionId)`. Y el texto se
 * corta en la base (`left`): la fila enseña una línea, y una nota de varios
 * párrafos no tiene por qué viajar entera cada minuto.
 */
export async function lasNotasDeLaBandejaAction(): Promise<NotaDeLaFila[]> {
  try {
    const user = await assertAuthorized();
    // Las cuentas que ENSEÑA la bandeja, no solo la fila efectiva: con
    // `user.id` a secas, una conversación de una cuenta que cuelga de esta
    // nunca pintaba su candado aunque tuviera notas.
    const cuentas = await lasCuentasQueVeLaBandeja(user);
    const alcance = cuentas.length ? cuentas : [user.id];
    // Una nota que es SOLO un archivo no tiene texto: la fila dice que lo lleva.
    const filas = await db.$queryRaw<Array<{ sessionId: number; contenido: string | null; creadaEn: Date | null }>>`
      SELECT DISTINCT ON (n."sessionId")
             n."sessionId" AS "sessionId",
             CASE WHEN btrim(n."content") = '' THEN '📎 Archivo adjunto'
                  ELSE left(n."content", ${TOPE_DEL_TEXTO_DE_LA_NOTA * 2}::int) END AS "contenido",
             n."createdAt" AS "creadaEn"
        FROM "internal_notes" n
        JOIN "Session" s ON s."id" = n."sessionId"
       WHERE s."userId" = ANY(${alcance}::text[])
       ORDER BY n."sessionId", n."createdAt" DESC, n."id" DESC`;
    const notas: NotaDeLaFila[] = [];
    for (const f of filas) {
      const nota = comoUltimaNota({ contenido: f.contenido, creadaEn: f.creadaEn });
      if (nota) notas.push({ sessionId: Number(f.sessionId), ...nota });
    }
    return notas;
  } catch (error) {
    console.warn("[chats] no se pudieron leer las notas internas de la bandeja", error);
    return [];
  }
}

export async function deleteInternalNoteAction(
  noteId: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await assertAuthorized();
    const note = await (db as any).internalNote.findUnique({ where: { id: noteId }, select: { authorId: true } });
    if (!note) return { success: false, message: "Nota no encontrada." };
    // Con la PERSONA, la misma con la que se firmó al crearla.
    if (note.authorId !== laPersonaQueActua(user).id) {
      return { success: false, message: "Solo el autor puede eliminar la nota." };
    }

    // Sus archivos van con ella —en la misma transacción— y luego se sueltan
    // del bucket. `losAdjuntosDeLasNotas` dice antes si hay alguno: así una
    // nota sin archivos no toca la tabla.
    const adjuntos = (await losAdjuntosDeLasNotas([noteId])).get(noteId) ?? [];
    await db.$transaction(async (tx) => {
      if (adjuntos.length) await quitarLosAdjuntosDeLaNota(tx, noteId);
      await (tx as any).internalNote.delete({ where: { id: noteId } });
    });
    if (adjuntos.length) await soltarLosArchivosDelBucket(adjuntos);
    return { success: true, message: "Nota eliminada." };
  } catch (error) {
    console.error("[deleteInternalNoteAction]", error);
    return { success: false, message: "Error al eliminar la nota." };
  }
}

/**
 * Los administradores de la cuenta MADRE a los que se puede mencionar desde
 * una nota interna. Vacío si la cuenta no tiene madre. Se pide al abrir el
 * selector de `@`, no al cargar Chats.
 */
export async function mencionablesDeLaMadreAction(): Promise<AdministradorDeLaMadre[]> {
  try {
    const user = await assertAuthorized();
    const lista = await losAdministradoresDeLaMadre((user as any).ownerId ?? user.id);
    // Uno mismo no se menciona.
    const yo = laPersonaQueActua(user).id;
    return lista.filter((a) => a.id !== yo);
  } catch (error) {
    console.warn("[notas internas] no se pudieron leer los mencionables de la madre", error);
    return [];
  }
}

async function avisarALaMadre(x: {
  destinatarios: string[];
  autor: { id: string; nombre: string | null };
  cuentaDeLaConversacion: string;
  sessionId: number;
  remoteJid: string | null;
  contenido: string;
}): Promise<void> {
  try {
    const hija = await db.user.findUnique({
      where: { id: x.cuentaDeLaConversacion },
      select: { name: true, company: true, email: true },
    });
    const titulo = tituloDeLaMencionEnNota(x.autor.nombre, hija ? nombreDeLaCuenta(hija) : null);
    await crearLosAvisos(
      x.destinatarios.map((destinatarioId) => ({
        id: randomUUID(),
        taskId: null,
        projectId: null,
        ownerId: x.cuentaDeLaConversacion,
        destinatarioId,
        actorId: x.autor.id,
        actorNombre: x.autor.nombre,
        tipo: "mencion" as const,
        titulo,
        texto: x.contenido,
        enlace: enlaceDeLaMencion({ remoteJid: x.remoteJid, sessionId: x.sessionId }),
      })),
    );
  } catch (error) {
    console.error("[createInternalNoteAction] no se pudo avisar a la cuenta madre", {
      sessionId: x.sessionId,
      destinatarios: x.destinatarios,
      error,
    });
  }
}
