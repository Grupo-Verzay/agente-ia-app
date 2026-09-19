"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";

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
 * Lo que **no** se toca es `getSessionIdsWithNotesAction`, que filtra por
 * `session.userId`: eso es ALCANCE —de qué cuenta son esas conversaciones— y
 * el alcance se pregunta a la fila efectiva. Resolver la persona ahí es
 * exactamente lo que rompió la cartera de clientes en el #783.
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

    const session = await db.session.findUnique({
      where: { id: parsed.sessionId },
      select: { userId: true, remoteJid: true },
    });
    if (!session) return { success: false, message: "Sesión no encontrada." };

    // No mencionarse a sí mismo; sin duplicados. Se descuenta la PERSONA: los
    // ids que llegan salen del desplegable de asesores, que son personas, así
    // que descontando la fila efectiva uno podría mencionarse a sí mismo desde
    // dentro de otra cuenta y saltarse su propio aviso.
    const mentioned = Array.from(new Set(parsed.mentionedUserIds)).filter(
      (id) => id && id !== yo,
    );

    const note = await (db as any).internalNote.create({
      data: {
        sessionId: parsed.sessionId,
        authorId: yo,
        content: parsed.content,
        mentionedUserIds: mentioned,
      },
      include: { author: { select: { name: true, email: true } } },
    });

    // Notificación por mención (campanita) para cada asesor mencionado.
    if (mentioned.length > 0) {
      try {
        const preview = parsed.content.slice(0, 140);
        await (db as any).collabNotification.createMany({
          data: mentioned.map((recipientId) => ({
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
    const rows = await (db as any).internalNote.findMany({
      where: { session: { userId: user.id } },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });
    return rows.map((r: { sessionId: number }) => r.sessionId);
  } catch {
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
