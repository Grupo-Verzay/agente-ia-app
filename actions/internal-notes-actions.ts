"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

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

    const session = await db.session.findUnique({
      where: { id: parsed.sessionId },
      select: { userId: true, remoteJid: true },
    });
    if (!session) return { success: false, message: "Sesión no encontrada." };

    // No mencionarse a sí mismo; sin duplicados.
    const mentioned = Array.from(new Set(parsed.mentionedUserIds)).filter(
      (id) => id && id !== user.id,
    );

    const note = await (db as any).internalNote.create({
      data: {
        sessionId: parsed.sessionId,
        authorId: user.id,
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
            actorId: user.id,
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
    if (note.authorId !== user.id) return { success: false, message: "Solo el autor puede eliminar la nota." };

    await (db as any).internalNote.delete({ where: { id: noteId } });
    return { success: true, message: "Nota eliminada." };
  } catch (error) {
    console.error("[deleteInternalNoteAction]", error);
    return { success: false, message: "Error al eliminar la nota." };
  }
}
