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

    return {
      success: true,
      data: resellers.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        company: r.company,
        demoLimit: r.reseller_reseller_reselleridToUser[0]?.demoLimit ?? 3,
        demosUsed: r.demoAccounts.length,
        pools: r.resellerLicensePools.map((pool) => ({
          id: pool.id,
          resellerUserId: pool.resellerUserId,
          subscriptionPlanId: pool.subscriptionPlanId,
          plan: pool.subscriptionPlan.plan,
          assistanceType: pool.subscriptionPlan.assistanceType,
          totalLicenses: pool.totalLicenses,
          usedLicenses: pool.usedLicenses,
          availableLicenses: pool.totalLicenses - pool.usedLicenses,
          priceWholesale: pool.subscriptionPlan.priceWholesale != null
            ? Number(pool.subscriptionPlan.priceWholesale)
            : null,
        })),
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

    return {
      success: true,
      data: {
        demoLimit: resellerProfile?.demoLimit ?? 3,
        demosUsed,
        demosAvailable: Math.max(0, (resellerProfile?.demoLimit ?? 3) - demosUsed),
        pools: pools.map((pool) => ({
          id: pool.id,
          subscriptionPlanId: pool.subscriptionPlanId,
          plan: pool.subscriptionPlan.plan,
          assistanceType: pool.subscriptionPlan.assistanceType,
          credits: pool.subscriptionPlan.credits,
          totalLicenses: pool.totalLicenses,
          usedLicenses: pool.usedLicenses,
          availableLicenses: pool.totalLicenses - pool.usedLicenses,
        })),
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
        passPlainTxt: data.password,
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
    if (pool.usedLicenses >= pool.totalLicenses) {
      return { success: false, message: `Sin licencias disponibles para ese plan. Tienes ${pool.totalLicenses - pool.usedLicenses} disponibles.` };
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
        passPlainTxt: data.password,
        role: "user",
        plan: data.plan,
        isDemo: false,
        demoResellerId: user.id,
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

    await db.resellerLicensePool.update({
      where: { id: pool.id },
      data: { usedLicenses: { increment: 1 } },
    });

    revalidatePath("/panel/mis-clientes");
    return { success: true, message: "Cliente creado exitosamente", data: { id: client.id, email: client.email } };
  } catch (e) {
    console.error("[createClientAccount]", e);
    return { success: false, message: "Error al crear el cliente" };
  }
}
