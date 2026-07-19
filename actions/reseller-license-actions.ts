"use server";

import { db } from "@/lib/db";
import { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { getEnrichedClients } from "@/actions/userClientDataActions";
import type { ClientInterface } from "@/lib/types";

export type LicensePoolItem = {
  id: string;
  resellerUserId: string;
  subscriptionPlanId: string;
  plan: Plan;
  assistanceType: string;
  totalLicenses: number;
  usedLicenses: number;
  availableLicenses: number;
  priceWholesale: number | null;
};

export type ResellerWithPools = {
  id: string;
  name: string | null;
  email: string;
  company: string;
  demoLimit: number;
  demosUsed: number;
  pools: LicensePoolItem[];
};

// ── Admin: lista todos los resellers con sus pools ──────────────────────────

export async function getResellersWithPools() {
  try {
    const resellers = await db.user.findMany({
      where: { role: "reseller" },
      select: {
        id: true, name: true, email: true, company: true,
        reseller_reseller_reselleridToUser: {
          select: { demoLimit: true },
        },
        resellerLicensePools: {
          include: { subscriptionPlan: true },
        },
        demoAccounts: {
          where: { isDemo: true },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Uso DINÁMICO por (reseller, pool): clientes activos reales.
    const usage = await db.user.groupBy({
      by: ["demoResellerId", "resellerSubscriptionPlanId"],
      where: { isDemo: false, demoResellerId: { not: null }, resellerSubscriptionPlanId: { not: null } },
      _count: { _all: true },
    });
    const usedMap = new Map<string, number>();
    for (const row of usage) {
      if (row.demoResellerId && row.resellerSubscriptionPlanId) {
        usedMap.set(`${row.demoResellerId}::${row.resellerSubscriptionPlanId}`, row._count._all);
      }
    }

    return {
      success: true,
      data: resellers.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        company: r.company,
        demoLimit: r.reseller_reseller_reselleridToUser[0]?.demoLimit ?? 3,
        demosUsed: r.demoAccounts.length,
        pools: r.resellerLicensePools.map((pool) => {
          const used = usedMap.get(`${pool.resellerUserId}::${pool.subscriptionPlanId}`) ?? 0;
          return {
          id: pool.id,
          resellerUserId: pool.resellerUserId,
          subscriptionPlanId: pool.subscriptionPlanId,
          plan: pool.subscriptionPlan.plan,
          assistanceType: pool.subscriptionPlan.assistanceType,
          totalLicenses: pool.totalLicenses,
          usedLicenses: used,
          availableLicenses: pool.totalLicenses - used,
          priceWholesale: pool.subscriptionPlan.priceWholesale != null
            ? Number(pool.subscriptionPlan.priceWholesale)
            : null,
          };
        }),
      })) as ResellerWithPools[],
    };
  } catch (e) {
    console.error("[getResellersWithPools]", e);
    return { success: false, data: [] as ResellerWithPools[] };
  }
}

// ── Admin: asignar/ajustar licencias a un reseller ─────────────────────────

export async function assignLicenses(
  resellerUserId: string,
  subscriptionPlanId: string,
  totalLicenses: number
) {
  try {
    const user = await currentUser();
    if (!user || !isAdminLike(user.role)) return { success: false, message: "Sin permisos" };

    await db.resellerLicensePool.upsert({
      where: { resellerUserId_subscriptionPlanId: { resellerUserId, subscriptionPlanId } },
      create: { resellerUserId, subscriptionPlanId, totalLicenses, usedLicenses: 0 },
      update: { totalLicenses },
    });

    revalidatePath("/admin/reseller");
    return { success: true, message: "Licencias asignadas" };
  } catch (e) {
    console.error("[assignLicenses]", e);
    return { success: false, message: "Error al asignar licencias" };
  }
}

// ── Admin: migrar clientes del método viejo (tabla reseller) al pool nuevo ──
// Toma los clientes asignados por la UI vieja (tabla reseller) y los pasa al
// sistema nuevo: setea demoResellerId + el plan del pool, y borra la asignación
// vieja. Así cuentan en el pool, entran al cobro del reseller y reciben avisos
// desde su línea.
export async function migrateLegacyClientsToPool(
  resellerUserId: string,
  subscriptionPlanId: string,
) {
  try {
    const user = await currentUser();
    if (!user || !isAdminLike(user.role)) return { success: false, message: "Sin permisos" };

    const pool = await db.resellerLicensePool.findUnique({
      where: { resellerUserId_subscriptionPlanId: { resellerUserId, subscriptionPlanId } },
    });
    if (!pool) return { success: false, message: "El reseller no tiene un pool de ese plan." };

    const legacy = await db.reseller.findMany({
      where: { resellerid: resellerUserId, userId: { not: null } },
      select: { userId: true },
    });
    const legacyUserIds = legacy.map((l) => l.userId).filter(Boolean) as string[];
    if (legacyUserIds.length === 0) {
      return { success: false, message: "No hay clientes del método antiguo para migrar." };
    }

    const used = await db.user.count({
      where: { demoResellerId: resellerUserId, isDemo: false, resellerSubscriptionPlanId: subscriptionPlanId },
    });
    const available = pool.totalLicenses - used;
    if (legacyUserIds.length > available) {
      return {
        success: false,
        message: `El pool tiene ${available} licencia(s) libre(s) y hay ${legacyUserIds.length} para migrar. Sube el total del pool primero.`,
      };
    }

    await db.user.updateMany({
      where: { id: { in: legacyUserIds } },
      data: { demoResellerId: resellerUserId, resellerSubscriptionPlanId: subscriptionPlanId, isDemo: false },
    });
    await db.reseller.deleteMany({
      where: { resellerid: resellerUserId, userId: { in: legacyUserIds } },
    });

    revalidatePath("/admin/reseller");
    revalidatePath("/panel/reseller");
    return { success: true, message: `${legacyUserIds.length} cliente(s) migrados al pool.` };
  } catch (e) {
    console.error("[migrateLegacyClientsToPool]", e);
    return { success: false, message: "Error al migrar clientes." };
  }
}

// ── Admin: eliminar pool de licencias de un reseller ──────────────────────

export async function deleteLicensePool(poolId: string) {
  try {
    const user = await currentUser();
    if (!user || !isAdminLike(user.role)) return { success: false, message: "Sin permisos" };

    await db.resellerLicensePool.delete({ where: { id: poolId } });

    revalidatePath("/admin/reseller");
    return { success: true, message: "Pool eliminado" };
  } catch (e) {
    console.error("[deleteLicensePool]", e);
    return { success: false, message: "Error al eliminar el pool" };
  }
}

// ── Admin: cambiar demo limit de un reseller ───────────────────────────────

export async function updateDemoLimit(resellerUserId: string, demoLimit: number) {
  try {
    const user = await currentUser();
    if (!user || !isAdminLike(user.role)) return { success: false, message: "Sin permisos" };

    await db.reseller.updateMany({
      where: { resellerid: resellerUserId },
      data: { demoLimit },
    });

    revalidatePath("/admin/reseller");
    return { success: true, message: "Límite de demos actualizado" };
  } catch (e) {
    console.error("[updateDemoLimit]", e);
    return { success: false, message: "Error al actualizar límite" };
  }
}

// ── Reseller: obtener su propio dashboard ─────────────────────────────────

export async function getMyResellerDashboard() {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") return { success: false, data: null };

    const pools = await db.resellerLicensePool.findMany({
      where: { resellerUserId: user.id },
      include: { subscriptionPlan: true },
    });

    const resellerProfile = await db.reseller.findFirst({
      where: { resellerid: user.id },
      select: { demoLimit: true },
    });

    const demosUsed = await db.user.count({
      where: { demoResellerId: user.id, isDemo: true },
    });

    // Uso DINÁMICO por pool: clientes activos reales.
    const usage = await db.user.groupBy({
      by: ["resellerSubscriptionPlanId"],
      where: { demoResellerId: user.id, isDemo: false, resellerSubscriptionPlanId: { not: null } },
      _count: { _all: true },
    });
    const usedByPlan = new Map<string, number>();
    for (const row of usage) {
      if (row.resellerSubscriptionPlanId) usedByPlan.set(row.resellerSubscriptionPlanId, row._count._all);
    }

    return {
      success: true,
      data: {
        demoLimit: resellerProfile?.demoLimit ?? 3,
        demosUsed,
        demosAvailable: Math.max(0, (resellerProfile?.demoLimit ?? 3) - demosUsed),
        pools: pools.map((pool) => {
          const used = usedByPlan.get(pool.subscriptionPlanId) ?? 0;
          return {
            id: pool.id,
            subscriptionPlanId: pool.subscriptionPlanId,
            plan: pool.subscriptionPlan.plan,
            assistanceType: pool.subscriptionPlan.assistanceType,
            credits: pool.subscriptionPlan.credits,
            totalLicenses: pool.totalLicenses,
            usedLicenses: used,
            availableLicenses: pool.totalLicenses - used,
          };
        }),
      },
    };
  } catch (e) {
    console.error("[getMyResellerDashboard]", e);
    return { success: false, data: null };
  }
}

// ── Reseller: lista sus clientes ──────────────────────────────────────────

export async function getMyResellerClients(): Promise<{ success: boolean; data: ClientInterface[] }> {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") return { success: false, data: [] };

    // Sistema viejo: asignados via tabla reseller
    const oldAssignments = await db.reseller.findMany({
      where: { resellerid: user.id },
      select: { userId: true },
    });
    const oldIds = oldAssignments.map(r => r.userId).filter(Boolean) as string[];

    // Sistema nuevo: creados con demoResellerId
    const newClients = await db.user.findMany({
      where: { demoResellerId: user.id, isDemo: false },
      select: { id: true },
    });
    const newIds = newClients.map(c => c.id);

    const allIds = Array.from(new Set([...oldIds, ...newIds]));
    if (allIds.length === 0) return { success: true, data: [] };

    const result = await getEnrichedClients({ userIds: allIds });
    return { success: result.success, data: result.data ?? [] };
  } catch (e) {
    console.error("[getMyResellerClients]", e);
    return { success: false, data: [] };
  }
}

// ── Reseller: lista sus demos ─────────────────────────────────────────────

export async function getMyResellerDemos() {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") return { success: false, data: [] };

    const demos = await db.user.findMany({
      where: { demoResellerId: user.id, isDemo: true },
      select: {
        id: true, name: true, email: true, company: true,
        demoExpiresAt: true, demoCredits: true, createdAt: true,
        iaCredits: { select: { total: true, used: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: demos };
  } catch (e) {
    console.error("[getMyResellerDemos]", e);
    return { success: false, data: [] };
  }
}

// ── Reseller: crear cuenta demo ───────────────────────────────────────────

export async function createDemoAccount(data: {
  name: string;
  email: string;
  company: string;
  password: string;
}) {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") return { success: false, message: "Sin permisos" };

    const resellerProfile = await db.reseller.findFirst({
      where: { resellerid: user.id },
      select: { demoLimit: true },
    });
    const demoLimit = resellerProfile?.demoLimit ?? 3;
    const demosUsed = await db.user.count({
      where: { demoResellerId: user.id, isDemo: true },
    });

    if (demosUsed >= demoLimit) {
      return { success: false, message: `Límite de ${demoLimit} demos alcanzado. Contacta al administrador para aumentarlo.` };
    }

    const exists = await db.user.findUnique({ where: { email: data.email } });
    if (exists) return { success: false, message: "Ya existe una cuenta con ese email" };

    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.hash(data.password, 10);

    const demoExpiresAt = new Date();
    demoExpiresAt.setDate(demoExpiresAt.getDate() + 7);

    const demo = await db.user.create({
      data: {
        name: data.name,
        email: data.email,
        company: data.company,
        password: hashed,
        role: "user",
        plan: "lite",
        isDemo: true,
        demoExpiresAt,
        demoResellerId: user.id,
        demoCredits: 1000,
      },
    });

    await db.iaCredit.create({
      data: {
        userId: demo.id,
        total: 1000,
        used: 0,
        renewalDate: demoExpiresAt,
      },
    });

    revalidatePath("/panel/mis-clientes");
    return { success: true, message: "Demo creada exitosamente", data: { id: demo.id, email: demo.email } };
  } catch (e) {
    console.error("[createDemoAccount]", e);
    return { success: false, message: "Error al crear la demo" };
  }
}

// ── Reseller: crear cuenta cliente real (consume licencia) ────────────────

export async function createClientAccount(data: {
  name: string;
  email: string;
  company: string;
  password: string;
  subscriptionPlanId: string;
  plan: Plan;
}) {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") return { success: false, message: "Sin permisos" };

    const pool = await db.resellerLicensePool.findUnique({
      where: { resellerUserId_subscriptionPlanId: { resellerUserId: user.id, subscriptionPlanId: data.subscriptionPlanId } },
      include: { subscriptionPlan: true },
    });

    if (!pool) return { success: false, message: "No tienes licencias de ese plan" };
    const usedNow = await db.user.count({
      where: { demoResellerId: user.id, isDemo: false, resellerSubscriptionPlanId: data.subscriptionPlanId },
    });
    if (usedNow >= pool.totalLicenses) {
      return { success: false, message: `Sin licencias disponibles para ese plan. Tienes ${pool.totalLicenses - usedNow} disponibles.` };
    }

    const exists = await db.user.findUnique({ where: { email: data.email } });
    if (exists) return { success: false, message: "Ya existe una cuenta con ese email" };

    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.hash(data.password, 10);

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);

    const client = await db.user.create({
      data: {
        name: data.name,
        email: data.email,
        company: data.company,
        password: hashed,
        role: "user",
        plan: data.plan,
        isDemo: false,
        demoResellerId: user.id,
        resellerSubscriptionPlanId: data.subscriptionPlanId,
        demoCredits: 0,
      },
    });

    await db.iaCredit.create({
      data: {
        userId: client.id,
        total: pool.subscriptionPlan.credits,
        used: 0,
        renewalDate,
      },
    });

    // El uso del pool se cuenta dinámicamente (clientes activos con este plan);
    // no se toca usedLicenses. Eliminar al cliente libera el cupo solo.

    revalidatePath("/panel/mis-clientes");
    return { success: true, message: "Cliente creado exitosamente", data: { id: client.id, email: client.email } };
  } catch (e) {
    console.error("[createClientAccount]", e);
    return { success: false, message: "Error al crear el cliente" };
  }
}

// ── Admin: reconciliar el histórico (etiquetar clientes viejos con su pool) ──
// Asigna resellerSubscriptionPlanId a los clientes que aún no lo tienen,
// emparejando por (reseller + plan). Best-effort: si un reseller tiene varios
// pools con el mismo plan, usa el primero. Sirve para que el conteo dinámico
// incluya a los clientes creados antes de este cambio.
export async function reconcileResellerLicenses() {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) return { success: false, message: "Sin permisos", updated: 0 };

    const clients = await db.user.findMany({
      where: { isDemo: false, demoResellerId: { not: null }, resellerSubscriptionPlanId: null },
      select: { id: true, demoResellerId: true, plan: true },
    });

    const pools = await db.resellerLicensePool.findMany({ include: { subscriptionPlan: true } });
    const poolByResellerPlan = new Map<string, string>();
    for (const p of pools) {
      const key = `${p.resellerUserId}::${p.subscriptionPlan.plan}`;
      if (!poolByResellerPlan.has(key)) poolByResellerPlan.set(key, p.subscriptionPlanId);
    }

    let updated = 0;
    for (const c of clients) {
      if (!c.demoResellerId) continue;
      const planId = poolByResellerPlan.get(`${c.demoResellerId}::${c.plan}`);
      if (!planId) continue;
      await db.user.update({ where: { id: c.id }, data: { resellerSubscriptionPlanId: planId } });
      updated++;
    }

    revalidatePath("/admin/reseller");
    revalidatePath("/panel/clientes");
    return { success: true, message: `Reconciliados ${updated} clientes.`, updated };
  } catch (e) {
    console.error("[reconcileResellerLicenses]", e);
    return { success: false, message: "Error al reconciliar", updated: 0 };
  }
}

// ── Reseller: convertir una DEMO en cliente de pago (conserva todos los datos) ──
// Promueve la cuenta (isDemo:false), le asigna el plan/pool elegido (consume 1
// licencia), renueva el billing a PAID/ACTIVE (+30 días) y recarga los créditos
// del plan. La cuenta es la misma: chats, contactos y config se conservan.
export async function convertDemoToClient(demoUserId: string, subscriptionPlanId: string) {
  try {
    const me = await currentUser();
    if (!me || me.role !== "reseller") return { success: false, message: "Sin permisos" };

    const demo = await db.user.findUnique({
      where: { id: demoUserId },
      select: { id: true, isDemo: true, demoResellerId: true },
    });
    if (!demo || demo.demoResellerId !== me.id) {
      return { success: false, message: "Demo no encontrada o no pertenece a tu cuenta." };
    }
    if (!demo.isDemo) {
      return { success: false, message: "Esta cuenta ya es cliente de pago." };
    }

    const pool = await db.resellerLicensePool.findUnique({
      where: { resellerUserId_subscriptionPlanId: { resellerUserId: me.id, subscriptionPlanId } },
      include: { subscriptionPlan: true },
    });
    if (!pool) return { success: false, message: "No tienes licencias de ese plan." };

    const usedNow = await db.user.count({
      where: { demoResellerId: me.id, isDemo: false, resellerSubscriptionPlanId: subscriptionPlanId },
    });
    if (usedNow >= pool.totalLicenses) {
      return { success: false, message: `Sin licencias disponibles para ese plan. Tienes ${pool.totalLicenses - usedNow} disponibles.` };
    }

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);
    const renewalDate = new Date(now);
    renewalDate.setMonth(renewalDate.getMonth() + 1);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: demoUserId },
        data: {
          isDemo: false,
          plan: pool.subscriptionPlan.plan,
          resellerSubscriptionPlanId: subscriptionPlanId,
          demoExpiresAt: null,
          trialEndsAt: null,
        },
      });

      await tx.userBilling.update({
        where: { userId: demoUserId },
        data: {
          billingStatus: "PAID",
          accessStatus: "ACTIVE",
          dueDate,
          serviceStartAt: now,
          serviceEndsAt: dueDate,
          suspendedAt: null,
          suspendedReason: null,
          preDeleteWarnedAt: null,
          lastPaymentAt: now,
        },
      });

      const upd = await tx.iaCredit.updateMany({
        where: { userId: demoUserId },
        data: { total: pool.subscriptionPlan.credits, used: 0, renewalDate },
      });
      if (upd.count === 0) {
        await tx.iaCredit.create({
          data: { userId: demoUserId, total: pool.subscriptionPlan.credits, used: 0, renewalDate },
        });
      }
    });

    revalidatePath("/panel/mis-clientes");
    revalidatePath("/panel/clientes");
    return { success: true, message: "Demo convertida a cliente de pago." };
  } catch (e) {
    console.error("[convertDemoToClient]", e);
    return { success: false, message: "Error al convertir la demo." };
  }
}
