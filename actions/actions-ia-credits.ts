'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { isAdminLike } from '@/lib/rbac';
import { IaCredit, Plan } from '@prisma/client';
import { randomUUID } from 'crypto';

interface IaCreditResponse {
  success: boolean;
  message: string;
  data?: IaCredit[];
}

export interface PlanConfigItem {
  plan: Plan;
  credits: number;
}

const PLAN_CREDIT_DEFAULTS: Record<Plan, number> = {
  lite: 1_000,
  basico: 3_000,
  intermedio: 5_000,
  avanzado: 8_000,
  enterprise: 10_000,
  personalizado: 0,
};

// ── Plan Config ───────────────────────────────────────────────────

export async function getAllPlanConfigs(): Promise<{
  success: boolean;
  message: string;
  data?: PlanConfigItem[];
}> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    const configs = await db.planConfig.findMany();

    const data: PlanConfigItem[] = (Object.keys(PLAN_CREDIT_DEFAULTS) as Plan[]).map((plan) => {
      const existing = configs.find((c) => c.plan === plan);
      return { plan, credits: existing?.credits ?? PLAN_CREDIT_DEFAULTS[plan] };
    });

    return { success: true, message: 'OK', data };
  } catch (error) {
    console.error('[GET_PLAN_CONFIGS_ERROR]', error);
    return { success: false, message: 'Error al obtener configuración de planes' };
  }
}

export async function updatePlanConfigAction(
  plan: Plan,
  credits: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    await db.planConfig.upsert({
      where: { plan },
      create: { id: randomUUID(), plan, credits },
      update: { credits },
    });

    return { success: true, message: `Plan ${plan} actualizado a ${credits} créditos` };
  } catch (error) {
    console.error('[UPDATE_PLAN_CONFIG_ERROR]', error);
    return { success: false, message: 'Error al actualizar configuración del plan' };
  }
}

/** Returns the credits configured for a given plan (falls back to defaults). */
export async function getPlanCredits(plan: Plan): Promise<number> {
  try {
    const config = await db.planConfig.findUnique({ where: { plan } });
    return config?.credits ?? PLAN_CREDIT_DEFAULTS[plan] ?? 0;
  } catch {
    return PLAN_CREDIT_DEFAULTS[plan] ?? 0;
  }
}

// ── Own Credits (para el usuario autenticado) ────────────────────

export async function getOwnIaCredits(): Promise<{
  success: boolean;
  message: string;
  data?: { total: number; used: number; available: number; renewalDate: Date };
}> {
  try {
    const me = await currentUser();
    if (!me?.id) return { success: false, message: 'No autenticado' };

    const record = await db.iaCredit.findUnique({ where: { userId: me.id } });
    if (!record) return { success: false, message: 'Sin créditos configurados' };

    const usedCredits = Math.floor(record.used / 3085);
    const available = Math.max(0, record.total - usedCredits);

    return {
      success: true,
      message: 'OK',
      data: { total: record.total, used: usedCredits, available, renewalDate: record.renewalDate },
    };
  } catch (error) {
    console.error('[GET_OWN_CREDITS_ERROR]', error);
    return { success: false, message: 'Error al obtener créditos' };
  }
}

// ── Per-user Credits ──────────────────────────────────────────────

export async function getIaCreditByUser(userId: string): Promise<IaCreditResponse> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    if (!userId) {
      return { success: false, message: 'userId es requerido' };
    }

    const record = await db.iaCredit.findUnique({ where: { userId } });

    if (!record) {
      return { success: false, message: 'No se encontraron créditos para este usuario' };
    }

    return { success: true, message: 'Créditos encontrados', data: [record] };
  } catch (error) {
    console.error('[GET_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al obtener créditos de IA' };
  }
}

export async function createIaCreditForUser(
  userId: string,
  total: number,
  renewalDate: Date,
  used?: number,
): Promise<IaCreditResponse> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    if (!userId || total == null || !renewalDate) {
      return { success: false, message: 'Faltan datos obligatorios' };
    }

    const existing = await db.iaCredit.findUnique({ where: { userId } });
    if (existing) {
      return { success: false, message: 'El usuario ya tiene créditos asignados' };
    }

    const created = await db.iaCredit.create({
      data: { userId, total, used, renewalDate },
    });

    return { success: true, message: 'Créditos creados correctamente', data: [created] };
  } catch (error) {
    console.error('[CREATE_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al crear créditos de IA' };
  }
}

export async function rechargeIaCredit(
  userId: string,
  newTotal: number,
  newRenewalDate?: Date,
  used?: number,
): Promise<IaCreditResponse> {
  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: 'No autorizado' };
    }

    if (!userId) {
      return { success: false, message: 'Usuario desconocido.' };
    }

    const updated = await db.iaCredit.update({
      where: { userId },
      data: {
        total: newTotal,
        used,
        ...(newRenewalDate && { renewalDate: newRenewalDate }),
      },
    });

    return { success: true, message: 'Créditos recargados correctamente', data: [updated] };
  } catch (error) {
    console.error('[RECHARGE_IA_CREDIT_ERROR]', error);
    return { success: false, message: 'Error al recargar créditos de IA' };
  }
}
