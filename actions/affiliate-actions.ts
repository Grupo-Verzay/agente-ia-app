"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminOrReseller, isAffiliate } from "@/lib/rbac";

type Result<T = undefined> =
  | { success: true; data: T }
  | { success: false; message: string };

function generateCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${suffix}`;
}

// ---------------------------------------------------------------------------
// Afiliado: su propio perfil y datos
// ---------------------------------------------------------------------------

export async function getMyAffiliateProfileAction(): Promise<Result<{
  id: string;
  code: string;
  commissionRate: number;
  notes: string | null;
  totalReferrals: number;
  activeReferrals: number;
  pendingAmount: number;
  totalEarned: number;
  registerUrl: string;
}>> {
  const actor = await currentUser();
  if (!actor) return { success: false, message: "No autorizado." };
  if (!isAffiliate(actor.role) && !isAdminOrReseller(actor.role)) {
    return { success: false, message: "No autorizado." };
  }

  const profile = await db.affiliateProfile.findUnique({
    where: { userId: actor.id },
    include: {
      referrals: { select: { referredUserId: true } },
      commissions: { select: { amount: true, status: true } },
    },
  });

  if (!profile) return { success: false, message: "Perfil de afiliado no encontrado." };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agente.ia-app.com";
  const registerUrl = `${baseUrl}/register?aff=${profile.code}`;

  const pendingAmount = profile.commissions
    .filter((c) => c.status === "pending" || c.status === "approved")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const totalEarned = profile.commissions
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  return {
    success: true,
    data: {
      id: profile.id,
      code: profile.code,
      commissionRate: profile.commissionRate,
      notes: profile.notes,
      totalReferrals: profile.referrals.length,
      activeReferrals: profile.referrals.length,
      pendingAmount,
      totalEarned,
      registerUrl,
    },
  };
}

export async function getMyReferralsAction(): Promise<Result<{
  id: string;
  referredUser: { name: string | null; email: string; company: string; createdAt: Date };
  createdAt: Date;
  commissionsCount: number;
}[]>> {
  const actor = await currentUser();
  if (!actor) return { success: false, message: "No autorizado." };

  const profile = await db.affiliateProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!profile) return { success: false, message: "Perfil no encontrado." };

  const referrals = await db.affiliateReferral.findMany({
    where: { affiliateId: profile.id },
    include: {
      referredUser: { select: { name: true, email: true, company: true, createdAt: true } },
      commissions: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: referrals.map((r) => ({
      id: r.id,
      referredUser: r.referredUser,
      createdAt: r.createdAt,
      commissionsCount: r.commissions.length,
    })),
  };
}

export async function getMyCommissionsAction(): Promise<Result<{
  id: string;
  amount: number;
  currencyCode: string;
  status: string;
  paymentRef: string | null;
  createdAt: Date;
  paidAt: Date | null;
  referredUserName: string | null;
}[]>> {
  const actor = await currentUser();
  if (!actor) return { success: false, message: "No autorizado." };

  const profile = await db.affiliateProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!profile) return { success: false, message: "Perfil no encontrado." };

  const commissions = await db.affiliateCommission.findMany({
    where: { affiliateId: profile.id },
    include: {
      referral: {
        include: { referredUser: { select: { name: true, company: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: commissions.map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      currencyCode: c.currencyCode,
      status: c.status,
      paymentRef: c.paymentRef,
      createdAt: c.createdAt,
      paidAt: c.paidAt,
      referredUserName: c.referral.referredUser.name ?? c.referral.referredUser.company,
    })),
  };
}

// ---------------------------------------------------------------------------
// Admin: gestión de afiliados
// ---------------------------------------------------------------------------

export async function getAllAffiliatesAction(): Promise<Result<{
  id: string;
  code: string;
  commissionRate: number;
  notes: string | null;
  user: { name: string | null; email: string; company: string };
  totalReferrals: number;
  pendingAmount: number;
  totalEarned: number;
}[]>> {
  const actor = await currentUser();
  if (!actor || !isAdminOrReseller(actor.role)) {
    return { success: false, message: "No autorizado." };
  }

  const profiles = await db.affiliateProfile.findMany({
    include: {
      user: { select: { name: true, email: true, company: true } },
      referrals: { select: { id: true } },
      commissions: { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: profiles.map((p) => ({
      id: p.id,
      code: p.code,
      commissionRate: p.commissionRate,
      notes: p.notes,
      user: p.user,
      totalReferrals: p.referrals.length,
      pendingAmount: p.commissions
        .filter((c) => c.status === "pending" || c.status === "approved")
        .reduce((s, c) => s + Number(c.amount), 0),
      totalEarned: p.commissions
        .filter((c) => c.status === "paid")
        .reduce((s, c) => s + Number(c.amount), 0),
    })),
  };
}

export async function createAffiliateProfileAction(input: {
  userId: string;
  commissionRate?: number;
  notes?: string;
}): Promise<Result<{ id: string; code: string }>> {
  const actor = await currentUser();
  if (!actor || !isAdminOrReseller(actor.role)) {
    return { success: false, message: "No autorizado." };
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { name: true, company: true },
  });
  if (!user) return { success: false, message: "Usuario no encontrado." };

  const existing = await db.affiliateProfile.findUnique({ where: { userId: input.userId } });
  if (existing) return { success: false, message: "Este usuario ya tiene un perfil de afiliado." };

  let code = generateCode(user.name ?? user.company ?? "AFF");
  // Ensure uniqueness
  const taken = await db.affiliateProfile.findUnique({ where: { code } });
  if (taken) code = generateCode((user.name ?? user.company ?? "AFF") + Date.now());

  const profile = await db.affiliateProfile.create({
    data: {
      userId: input.userId,
      code,
      commissionRate: input.commissionRate ?? 0.2,
      notes: input.notes ?? null,
    },
  });

  return { success: true, data: { id: profile.id, code: profile.code } };
}

export async function updateAffiliateProfileAction(input: {
  profileId: string;
  code?: string;
  commissionRate?: number;
  notes?: string;
}): Promise<Result<undefined>> {
  const actor = await currentUser();
  if (!actor || !isAdminOrReseller(actor.role)) {
    return { success: false, message: "No autorizado." };
  }

  const { profileId, ...data } = input;

  if (data.code) {
    const conflict = await db.affiliateProfile.findFirst({
      where: { code: data.code.toUpperCase(), NOT: { id: profileId } },
    });
    if (conflict) return { success: false, message: "Ese código ya está en uso." };
    data.code = data.code.toUpperCase();
  }

  await db.affiliateProfile.update({ where: { id: profileId }, data });
  return { success: true, data: undefined };
}

export async function updateCommissionStatusAction(input: {
  commissionId: string;
  status: "approved" | "paid" | "rejected";
}): Promise<Result<undefined>> {
  const actor = await currentUser();
  if (!actor || !isAdminOrReseller(actor.role)) {
    return { success: false, message: "No autorizado." };
  }

  await db.affiliateCommission.update({
    where: { id: input.commissionId },
    data: {
      status: input.status,
      paidAt: input.status === "paid" ? new Date() : undefined,
    },
  });

  return { success: true, data: undefined };
}

export async function getAffiliateDetailAction(profileId: string): Promise<Result<{
  profile: { id: string; code: string; commissionRate: number; notes: string | null };
  user: { name: string | null; email: string; company: string };
  referrals: { id: string; referredUser: { name: string | null; email: string; company: string }; createdAt: Date }[];
  commissions: { id: string; amount: number; currencyCode: string; status: string; createdAt: Date; paidAt: Date | null; referredUserName: string | null }[];
}>> {
  const actor = await currentUser();
  if (!actor || !isAdminOrReseller(actor.role)) {
    return { success: false, message: "No autorizado." };
  }

  const profile = await db.affiliateProfile.findUnique({
    where: { id: profileId },
    include: {
      user: { select: { name: true, email: true, company: true } },
      referrals: {
        include: { referredUser: { select: { name: true, email: true, company: true } } },
        orderBy: { createdAt: "desc" },
      },
      commissions: {
        include: { referral: { include: { referredUser: { select: { name: true, company: true } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!profile) return { success: false, message: "Perfil no encontrado." };

  return {
    success: true,
    data: {
      profile: { id: profile.id, code: profile.code, commissionRate: profile.commissionRate, notes: profile.notes },
      user: profile.user,
      referrals: profile.referrals.map((r) => ({ id: r.id, referredUser: r.referredUser, createdAt: r.createdAt })),
      commissions: profile.commissions.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        currencyCode: c.currencyCode,
        status: c.status,
        createdAt: c.createdAt,
        paidAt: c.paidAt,
        referredUserName: c.referral.referredUser.name ?? c.referral.referredUser.company,
      })),
    },
  };
}
