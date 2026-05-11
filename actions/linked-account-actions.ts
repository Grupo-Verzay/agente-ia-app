"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

type Result<T = undefined> =
  | { success: true; data?: T; warning?: string }
  | { success: false; message: string };

export type LinkedAccountInfo = {
  id: string;
  linkedUserId: string;
  label: string | null;
  name: string | null;
  email: string;
  company: string;
};

export type LinkedAccountsPayload = {
  realUserId: string;
  activeAccountId: string;
  masterUser: { id: string; name: string | null; email: string; company: string } | null;
  accounts: LinkedAccountInfo[];
};

async function getRealUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getMyLinkedAccounts(): Promise<Result<LinkedAccountsPayload>> {
  const realUserId = await getRealUserId();
  if (!realUserId) return { success: false, message: "No autorizado." };

  const activeAccountId = cookies().get("active_account_id")?.value ?? realUserId;

  try {
    const [masterRows, linkedRows] = await Promise.all([
      db.$queryRaw<{ id: string; name: string | null; email: string; company: string }[]>`
        SELECT id, name, email, company FROM "User" WHERE id = ${realUserId} LIMIT 1
      `,
      db.$queryRaw<LinkedAccountInfo[]>`
        SELECT la.id, la."linked_user_id" AS "linkedUserId", la.label,
               u.name, u.email, u.company
        FROM "linked_accounts" la
        JOIN "User" u ON u.id = la."linked_user_id"
        WHERE la."master_user_id" = ${realUserId}
        ORDER BY la."createdAt" ASC
      `,
    ]);

    return {
      success: true,
      data: {
        realUserId,
        activeAccountId,
        masterUser: masterRows[0] ?? null,
        accounts: linkedRows,
      },
    };
  } catch {
    // Tabla linked_accounts no existe aún — devolver sin cuentas vinculadas
    const masterRows = await db.$queryRaw<{ id: string; name: string | null; email: string; company: string }[]>`
      SELECT id, name, email, company FROM "User" WHERE id = ${realUserId} LIMIT 1
    `.catch(() => []);
    return {
      success: true,
      data: { realUserId, activeAccountId: realUserId, masterUser: masterRows[0] ?? null, accounts: [] },
    };
  }
}

export async function switchToAccount(targetUserId: string): Promise<Result> {
  const realUserId = await getRealUserId();
  if (!realUserId) return { success: false, message: "No autorizado." };

  if (targetUserId === realUserId) {
    cookies().delete("active_account_id");
    return { success: true };
  }

  let link: { id: string }[];
  try {
    link = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "linked_accounts"
      WHERE "master_user_id" = ${realUserId} AND "linked_user_id" = ${targetUserId}
      LIMIT 1
    `;
  } catch {
    return { success: false, message: "Las cuentas vinculadas no están disponibles." };
  }

  if (link.length === 0) return { success: false, message: "Cuenta no vinculada." };

  cookies().set("active_account_id", targetUserId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { success: true };
}

export async function addLinkedAccount(linkedEmail: string): Promise<Result<LinkedAccountInfo>> {
  const realUserId = await getRealUserId();
  if (!realUserId) return { success: false, message: "No autorizado." };

  const trimmedEmail = linkedEmail.trim().toLowerCase();
  if (!trimmedEmail) return { success: false, message: "El email no puede estar vacío." };

  const linkedRows = await db.$queryRaw<{ id: string; name: string | null; email: string; company: string }[]>`
    SELECT id, name, email, company FROM "User" WHERE LOWER(email) = ${trimmedEmail} LIMIT 1
  `;

  if (linkedRows.length === 0)
    return { success: false, message: "No existe una cuenta con ese email." };

  const linked = linkedRows[0];
  if (linked.id === realUserId)
    return { success: false, message: "No puedes vincularte a tu misma cuenta." };

  const existing = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "linked_accounts"
    WHERE "master_user_id" = ${realUserId} AND "linked_user_id" = ${linked.id}
    LIMIT 1
  `;
  if (existing.length > 0)
    return { success: false, message: "Esa cuenta ya está vinculada." };

  const newId = crypto.randomUUID();
  try {
    await db.$executeRaw`
      INSERT INTO "linked_accounts" (id, "master_user_id", "linked_user_id")
      VALUES (${newId}, ${realUserId}, ${linked.id})
    `;
  } catch {
    return { success: false, message: "Error al vincular. Contacta al soporte si el problema persiste." };
  }

  return {
    success: true,
    data: { id: newId, linkedUserId: linked.id, label: null, name: linked.name, email: linked.email, company: linked.company },
  };
}

export async function removeLinkedAccount(linkedUserId: string): Promise<Result> {
  const realUserId = await getRealUserId();
  if (!realUserId) return { success: false, message: "No autorizado." };

  try {
    await db.$executeRaw`
      DELETE FROM "linked_accounts"
      WHERE "master_user_id" = ${realUserId} AND "linked_user_id" = ${linkedUserId}
    `;
  } catch {
    return { success: false, message: "Error al desvincular cuenta." };
  }

  const activeAccountId = cookies().get("active_account_id")?.value;
  if (activeAccountId === linkedUserId) {
    cookies().delete("active_account_id");
  }

  return { success: true };
}
