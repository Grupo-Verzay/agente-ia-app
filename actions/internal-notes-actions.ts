"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { lasCuentasQueVeLaBandeja } from "@/lib/cuentas-asociadas";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { laCuentaDeLaConversacion } from "@/lib/dueno-del-dato.server";
import { elEquipoDeLaCuenta } from "@/lib/equipo-de-la-cuenta.server";
import { darAccesoPorMencion } from "@/lib/acceso-por-mencion-db";
import { enlaceDeLaMencion, quienesRecibenAcceso } from "@/lib/acceso-por-mencion";
import { randomUUID } from "crypto";
import { crearLosAvisos } from "@/lib/avisos-de-tarea";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { separarLasMenciones, tituloDeLaMencionEnNota } from "@/lib/menciones-de-la-madre";
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
 * Lo que **no** se toca es `getSessionIdsWithNotesAction`, que filtra por
 * `session.userId`: eso es ALCANCE —de qué cuenta son esas conversaciones— y
 * el alcance se pregunta a la fila efectiva (con las cuentas que la bandeja
 * enseña, `lasCuentasQueVeLaBandeja`). Resolver la persona ahí es exactamente
 * lo que rompió la cartera de clientes en el #783.
 */

export type InternalNoteData = {
  id: number;
  sessionId: number;
  authorId: string;
  authorName: string | null;
  authorEmail: string;
  content: string;
  mentionedUserIds: string[];
  createdAt: string;
};

const createSchema = z.object({
  sessionId: z.number().int().positive(),
  content: z.string().trim().min(1),
  mentionedUserIds: z.array(z.string()).optional().default([]),
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

    const note = await (db as any).internalNote.create({
      data: {
        sessionId: parsed.sessionId,
        authorId: yo,
        content: parsed.content,
        mentionedUserIds: mentioned,
      },
      include: { author: { select: { name: true, email: true } } },
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
        const preview = parsed.content.slice(0, 140);
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
        contenido: parsed.content,
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
        createdAt: n.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[getInternalNotesBySessionAction]", error);
    return { success: false, message: "Error al cargar las notas." };
  }
}

export async function getSessionIdsWithNotesAction(): Promise<number[]> {
  try {
    const user = await assertAuthorized();
    // Las cuentas que ENSEÑA la bandeja, no solo la fila efectiva: con
    // `user.id` a secas, una conversación de una cuenta que cuelga de esta
    // nunca pintaba su candado aunque tuviera notas.
    const cuentas = await lasCuentasQueVeLaBandeja(user);
    const rows = await (db as any).internalNote.findMany({
      where: { session: { userId: { in: cuentas.length ? cuentas : [user.id] } } },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });
    return rows.map((r: { sessionId: number }) => r.sessionId);
  } catch (error) {
    console.warn("[chats] no se pudieron leer las conversaciones con notas internas", error);
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

    await (db as any).internalNote.delete({ where: { id: noteId } });
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
