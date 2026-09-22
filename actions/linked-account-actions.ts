"use server";

import { auth } from "@/auth";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminLike } from "@/lib/rbac";
import { rolQueManda } from "@/lib/cuenta-que-manda";
import { cookies } from "next/headers";
import type { Plan } from "@prisma/client";

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
  image: string | null;
  plan: Plan;
};

export type LinkedAccountsPayload = {
  realUserId: string;
  activeAccountId: string;
  currentAccount: { id: string; name: string | null; email: string; company: string; image: string | null; plan: Plan } | null;
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
    const [selfRows, legacyCurrent] = await Promise.all([
      db.$queryRaw<{ id: string; name: string | null; email: string; company: string; image: string | null; plan: Plan }[]>`
        SELECT id, name, email, company, image, plan FROM "User" WHERE id = ${realUserId} LIMIT 1
      `,
      activeAccountId === realUserId
        ? Promise.resolve([] as { id: string; name: string | null; email: string; company: string; image: string | null; plan: Plan; role: AccountRole | null }[])
        : db.$queryRaw<{ id: string; name: string | null; email: string; company: string; image: string | null; plan: Plan; role: AccountRole | null }[]>`
          SELECT u.id, u.name, u.email, u.company, u.image, u.plan, u.advisor_role AS role
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
              select: { id: true, name: true, email: true, company: true, image: true, plan: true },
            }).then((row) => row ?? selfRows[0] ?? null)
          : selfRows[0] ?? null
        : legacyCurrent[0] ?? selfRows[0] ?? null;

    const currentRole =
      activeAccountId === realUserId
        ? realUser?.ownerId
          ? (realUser.advisorRole as AccountRole | null) ?? null
          : null
        : legacyCurrent[0]?.role ?? null;

    /**
     * Las cuentas que uno mismo vinculó bajo SU cuenta.
     *
     * Se busca por `realUserId` -quién está sentado delante- y no por la cuenta
     * activa. Es la diferencia entre "cuentas donde yo puedo entrar" y "cuentas
     * vinculadas a esta empresa", que no son lo mismo.
     *
     * Con la cuenta activa, a un asesor de Grupo Verzay se le listaban las otras
     * cuentas de Grupo Verzay -sus hermanas, no las suyas-. Aparecían en el
     * menú, se podían pulsar, y al pulsarlas salía "Cuenta no vinculada":
     * `switchToAccount` sí comprueba el vínculo contra `realUserId`, así que
     * dejaba fuera justo lo que el menú acababa de ofrecer.
     *
     * Buscando por `realUserId` la lista queda igual a lo que el cambio de
     * cuenta acepta de verdad. Para un dueño en su propia cuenta no cambia nada:
     * ahí las dos cosas son la misma.
     */
    const outgoingRows = await db.$queryRaw<LinkedAccountInfo[]>`
      SELECT la.id,
             la."linked_user_id" AS "accountUserId",
             la.role,
             la.label,
             u.name,
             u.email,
             u.company,
             u.image,
             u.plan
      FROM "linked_accounts" la
      JOIN "User" u ON u.id = la."linked_user_id"
      WHERE la."master_user_id" = ${realUserId}
      ORDER BY la."createdAt" ASC
    `;

    const accessibleAccountsMap = new Map<string, LinkedAccountInfo>();
    // Solo las que cuelgan de uno (`outgoingRows`). Las de arriba —las que me
    // vincularon bajo la suya (`incomingRows`)— ya no se ofrecen: el conmutador
    // solo baja, y ofrecerlas sería un menú que abre una puerta cerrada.
    for (const row of outgoingRows) {
      if (row.accountUserId !== currentAccount?.id) accessibleAccountsMap.set(row.accountUserId, row);
    }
    const accessibleAccounts = Array.from(accessibleAccountsMap.values());

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
    const selfRows = await db.$queryRaw<{ id: string; name: string | null; email: string; company: string; image: string | null; plan: Plan }[]>`
      SELECT id, name, email, company, image, plan FROM "User" WHERE id = ${realUserId} LIMIT 1
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

  // Solo se BAJA: a una cuenta que uno vinculó bajo la suya. La otra dirección
  // —una hija cambiándose a su madre— se cerró: una cuenta hija no actúa como
  // su madre. `currentUser()` aplica la misma regla a la cookie, así que esto
  // es la fachada de esa puerta, no la puerta.
  let link: { id: string }[];
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

  const linkedRows = await db.$queryRaw<{ id: string; name: string | null; email: string; company: string; image: string | null; plan: Plan }[]>`
    SELECT id, name, email, company, image, plan FROM "User" WHERE LOWER(email) = ${trimmedEmail} LIMIT 1
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
      VALUES (${newId}, ${context.accountUserId}, ${linked.id}, ${role}::"LinkedAccountRole")
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
      image: linked.image,
      plan: linked.plan,
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
  if (!isAdminLike(await rolQueManda(user))) return { success: false, message: "Solo un administrador puede reiniciar los vínculos." };

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
