"use server";

import { auth } from "@/auth";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminLike } from "@/lib/rbac";
import { cookies } from "next/headers";
import type { Instancia } from "@prisma/client";

type Result<T = undefined> =
  | { success: true; data?: T; warning?: string }
  | { success: false; message: string };

type AccountRole = "agente" | "administrador";

export type LinkedAccountInfo = {
  id: string;
  accountUserId: string;
  role: AccountRole;
  label: string | null;
  name: string | null;
  email: string;
  company: string;
};

export type LinkedAccountsPayload = {
  realUserId: string;
  activeAccountId: string;
  currentAccount: { id: string; name: string | null; email: string; company: string } | null;
  currentRole: AccountRole | null;
  accounts: LinkedAccountInfo[];
};

async function getRealUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

async function getCurrentAccountContext() {
  const user = await currentUser();
  if (!user) return null;

  const accountUserId = user.ownerId ?? user.id;
  const canManage = !user.ownerId || user.advisorRole === "administrador";

  return {
    user,
    accountUserId,
    canManage,
  };
}

export async function getMyLinkedAccounts(): Promise<Result<LinkedAccountsPayload>> {
  const realUserId = await getRealUserId();
  if (!realUserId) return { success: false, message: "No autorizado." };

  const activeAccountId = cookies().get("active_account_id")?.value ?? realUserId;

  const realUser = await db.user.findUnique({
    where: { id: realUserId },
    select: { id: true, ownerId: true, advisorRole: true },
  });

  try {
    const [selfRows, incomingRows, currentMembership, legacyCurrent] = await Promise.all([
      db.$queryRaw<{ id: string; name: string | null; email: string; company: string }[]>`
        SELECT id, name, email, company FROM "User" WHERE id = ${realUserId} LIMIT 1
      `,
      db.$queryRaw<LinkedAccountInfo[]>`
        SELECT la.id,
               la."master_user_id" AS "accountUserId",
               la.role,
               la.label,
               u.name,
               u.email,
               u.company
        FROM "linked_accounts" la
        JOIN "User" u ON u.id = la."master_user_id"
        WHERE la."linked_user_id" = ${realUserId}
        ORDER BY la."createdAt" ASC
      `,
      activeAccountId === realUserId
        ? Promise.resolve([] as { role: AccountRole }[])
        : db.$queryRaw<{ role: AccountRole }[]>`
            SELECT role
            FROM "linked_accounts"
            WHERE "master_user_id" = ${activeAccountId}
              AND "linked_user_id" = ${realUserId}
            LIMIT 1
          `,
      activeAccountId === realUserId
        ? Promise.resolve([] as { id: string; name: string | null; email: string; company: string; role: AccountRole | null }[])
        : db.$queryRaw<{ id: string; name: string | null; email: string; company: string; role: AccountRole | null }[]>`
          SELECT u.id, u.name, u.email, u.company, u.advisor_role AS role
          FROM "linked_accounts" la
          JOIN "User" u ON u.id = la."linked_user_id"
          WHERE la."master_user_id" = ${realUserId}
              AND la."linked_user_id" = ${activeAccountId}
          LIMIT 1
        `,
    ]);

    const currentAccount =
      activeAccountId === realUserId
        ? realUser?.ownerId
          ? await db.user.findUnique({
              where: { id: realUser.ownerId },
              select: { id: true, name: true, email: true, company: true },
            }).then((row) => row ?? selfRows[0] ?? null)
          : selfRows[0] ?? null
        : currentMembership[0]
          ? await db.user.findUnique({
              where: { id: activeAccountId },
              select: { id: true, name: true, email: true, company: true },
            }).then((row) => row ?? selfRows[0] ?? null)
          : legacyCurrent[0] ?? selfRows[0] ?? null;

    const currentRole =
      activeAccountId === realUserId
        ? realUser?.ownerId
          ? realUser.advisorRole ?? null
          : null
        : currentMembership[0]?.role ?? legacyCurrent[0]?.role ?? null;

    const scopeAccountId = currentAccount?.id ?? activeAccountId;
    const outgoingRows = scopeAccountId
      ? await db.$queryRaw<LinkedAccountInfo[]>`
          SELECT la.id,
                 la."linked_user_id" AS "accountUserId",
                 la.role,
                 la.label,
                 u.name,
                 u.email,
                 u.company
          FROM "linked_accounts" la
          JOIN "User" u ON u.id = la."linked_user_id"
          WHERE la."master_user_id" = ${scopeAccountId}
          ORDER BY la."createdAt" ASC
        `
      : [];

    const accessibleAccountsMap = new Map<string, LinkedAccountInfo>();
    for (const row of incomingRows) {
      if (row.accountUserId !== currentAccount?.id) accessibleAccountsMap.set(row.accountUserId, row);
    }
    for (const row of outgoingRows) {
      if (row.accountUserId !== currentAccount?.id) accessibleAccountsMap.set(row.accountUserId, row);
    }
    const accessibleAccounts = [...accessibleAccountsMap.values()];

    return {
      success: true,
      data: {
        realUserId,
        activeAccountId: currentAccount?.id ?? realUserId,
        currentAccount,
        currentRole,
        accounts: accessibleAccounts,
      },
    };
  } catch {
    const selfRows = await db.$queryRaw<{ id: string; name: string | null; email: string; company: string }[]>`
      SELECT id, name, email, company FROM "User" WHERE id = ${realUserId} LIMIT 1
    `.catch(() => []);

    return {
      success: true,
      data: {
        realUserId,
        activeAccountId: realUserId,
        currentAccount: selfRows[0] ?? null,
        currentRole: null,
        accounts: [],
      },
    };
  }
}

export async function switchToAccount(targetAccountId: string): Promise<Result> {
  const realUserId = await getRealUserId();
  if (!realUserId) return { success: false, message: "No autorizado." };

  const realUser = await db.user.findUnique({
    where: { id: realUserId },
    select: { id: true, ownerId: true },
  });

  if (targetAccountId === realUserId) {
    cookies().delete("active_account_id");
    return { success: true };
  }

  let link: { id: string }[];
  try {
    link = await db.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "linked_accounts"
      WHERE "master_user_id" = ${targetAccountId}
        AND "linked_user_id" = ${realUserId}
      LIMIT 1
    `;
  } catch {
    link = [];
  }

  if (link.length === 0) {
    try {
      link = await db.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM "linked_accounts"
        WHERE "master_user_id" = ${realUserId}
          AND "linked_user_id" = ${targetAccountId}
        LIMIT 1
      `;
    } catch {
      link = [];
    }
  }

  if (link.length === 0 && realUser?.ownerId === targetAccountId) {
    cookies().set("active_account_id", targetAccountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return { success: true };
  }

  if (link.length === 0) return { success: false, message: "Cuenta no vinculada." };

  cookies().set("active_account_id", targetAccountId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { success: true };
}

export async function addLinkedAccount(
  linkedEmail: string,
  role: AccountRole = "agente",
): Promise<Result<LinkedAccountInfo>> {
  const context = await getCurrentAccountContext();
  if (!context) return { success: false, message: "No autorizado." };
  if (!context.canManage) return { success: false, message: "Solo un administrador puede vincular cuentas." };

  const trimmedEmail = linkedEmail.trim().toLowerCase();
  if (!trimmedEmail) return { success: false, message: "El email no puede estar vacío." };

  const linkedRows = await db.$queryRaw<{ id: string; name: string | null; email: string; company: string }[]>`
    SELECT id, name, email, company FROM "User" WHERE LOWER(email) = ${trimmedEmail} LIMIT 1
  `;

  if (linkedRows.length === 0) {
    return { success: false, message: "No existe una cuenta con ese email." };
  }

  const linked = linkedRows[0];
  if (linked.id === context.accountUserId) {
    return { success: false, message: "No puedes vincularte a tu misma cuenta." };
  }

  const existing = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "linked_accounts"
    WHERE "master_user_id" = ${context.accountUserId}
      AND "linked_user_id" = ${linked.id}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return { success: false, message: "Esa cuenta ya está vinculada." };
  }

  const newId = crypto.randomUUID();
  try {
    await db.$executeRaw`
      INSERT INTO "linked_accounts" (id, "master_user_id", "linked_user_id", role)
      VALUES (${newId}, ${context.accountUserId}, ${linked.id}, ${role})
    `;
  } catch {
    return { success: false, message: "Error al vincular. Contacta al soporte si el problema persiste." };
  }

  return {
    success: true,
    data: {
      id: newId,
      accountUserId: context.accountUserId,
      role,
      label: null,
      name: linked.name,
      email: linked.email,
      company: linked.company,
    },
  };
}

export async function removeLinkedAccount(linkedUserId: string): Promise<Result> {
  const context = await getCurrentAccountContext();
  if (!context) return { success: false, message: "No autorizado." };
  if (!context.canManage) return { success: false, message: "Solo un administrador puede desvincular cuentas." };

  try {
    await db.$executeRaw`
      DELETE FROM "linked_accounts"
      WHERE "master_user_id" = ${context.accountUserId}
        AND "linked_user_id" = ${linkedUserId}
    `;
  } catch {
    return { success: false, message: "Error al desvincular cuenta." };
  }

  return { success: true };
}

export async function resetAllLinkedAccounts(): Promise<Result> {
  const user = await currentUser();
  if (!user) return { success: false, message: "No autorizado." };
  if (!isAdminLike(user.role)) return { success: false, message: "Solo un administrador puede reiniciar los vínculos." };

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "linked_accounts"`;
      await tx.$executeRaw`
        UPDATE "User"
        SET owner_id = NULL,
            advisor_role = NULL
        WHERE owner_id IS NOT NULL
      `;
    });

    cookies().delete("active_account_id");
    cookies().delete("impersonate_user_id");

    return { success: true, warning: "Se eliminaron todos los vínculos entre cuentas." };
  } catch (error) {
    console.error("[resetAllLinkedAccounts]", error);
    return { success: false, message: "No se pudieron reiniciar los vínculos." };
  }
}

export type LinkedAccountInstances = {
  linkedUserId: string;
  company: string;
  instances: Instancia[];
};

export async function getLinkedAccountsInstances(
  masterUserId: string,
): Promise<{ success: true; data: LinkedAccountInstances[] } | { success: false; message: string }> {
  if (!masterUserId) return { success: true, data: [] };

  try {
    type LinkedRow = { linkedUserId: string; company: string };
    const linkedRows = await db.$queryRaw<LinkedRow[]>`
      SELECT la."linked_user_id" AS "linkedUserId", u.company
      FROM "linked_accounts" la
      JOIN "User" u ON u.id = la."linked_user_id"
      WHERE la."master_user_id" = ${masterUserId}
    `;

    if (linkedRows.length === 0) return { success: true, data: [] };

    const linkedIds = linkedRows.map((r) => r.linkedUserId);

    const instances = await db.instancia.findMany({
      where: {
        userId: { in: linkedIds },
        instanceType: { in: ["Whatsapp", "baileys"] },
      },
    });

    const data: LinkedAccountInstances[] = linkedRows.map((row) => ({
      linkedUserId: row.linkedUserId,
      company: row.company,
      instances: instances.filter((inst) => inst.userId === row.linkedUserId),
    }));

    return { success: true, data };
  } catch (error) {
    console.error("[getLinkedAccountsInstances]", error);
    return { success: true, data: [] };
  }
}
