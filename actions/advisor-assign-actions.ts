"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Result = { success: true } | { success: false; message: string };

async function getEffectiveOwnerId(): Promise<string | null> {
  const user = await currentUser();
  if (!user?.id) return null;
  return (user as any).effectiveId ?? user.id;
}

async function requireOwnerOrAdmin(): Promise<{ userId: string; ownerId: string } | null> {
  const user = await currentUser();
  if (!user?.id) return null;
  const ownerId = (user as any).ownerId ?? null;
  const advisorRole = (user as any).advisorRole ?? null;
  // Permitido: dueño (sin ownerId) o asesor administrador
  if (!ownerId || advisorRole === "administrador") {
    return { userId: user.id, ownerId: ownerId ?? user.id };
  }
  return null;
}

export async function assignSessionToAdvisor(
  sessionId: number,
  advisorId: string | null
): Promise<Result> {
  const auth = await requireOwnerOrAdmin();
  if (!auth) return { success: false, message: "No autorizado." };

  await db.$executeRaw`
    UPDATE "Session"
    SET assigned_advisor_id = ${advisorId}
    WHERE id = ${sessionId}
  `;
  return { success: true };
}

export async function takeSession(sessionId: number): Promise<Result> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  const ownerId = (user as any).ownerId ?? null;
  if (!ownerId) return { success: false, message: "Solo asesores pueden tomar conversaciones." };

  // Solo tomar si está sin asignar
  const rows = await db.$queryRaw<{ assigned_advisor_id: string | null }[]>`
    SELECT assigned_advisor_id FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };
  if (rows[0].assigned_advisor_id && rows[0].assigned_advisor_id !== user.id) {
    return { success: false, message: "Esta conversación ya fue tomada por otro asesor." };
  }

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = ${user.id} WHERE id = ${sessionId}
  `;
  return { success: true };
}
