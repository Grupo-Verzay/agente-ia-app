'use server';

import { db as _db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import type { StageActionType, StageActionConfig } from './stage-automation-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any;

export type AdvisorAutomationActionRow = {
  id: string;
  type: StageActionType;
  order: number;
  config: StageActionConfig;
  delayMinutes: number;
};

export type AdvisorAutomationRow = {
  id: string;
  advisorId: string | null;
  name: string;
  enabled: boolean;
  actions: AdvisorAutomationActionRow[];
};

async function getUserId(): Promise<string> {
  const user = await currentUser();
  if (!user?.id) throw new Error('No autenticado');
  // Las automatizaciones pertenecen al dueño de la cuenta (no a cada asesor).
  return user.ownerId ?? user.id;
}

export async function getAdvisorAutomations(advisorId?: string | null): Promise<{
  success: boolean;
  data?: AdvisorAutomationRow[];
  message?: string;
}> {
  try {
    const userId = await getUserId();
    const where: Record<string, unknown> = { userId };
    if (advisorId !== undefined) where.advisorId = advisorId;
    const automations = await db.advisorAutomation.findMany({
      where,
      include: { actions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: automations as AdvisorAutomationRow[] };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function createAdvisorAutomation(data: {
  advisorId: string | null;
  name: string;
}): Promise<{ success: boolean; data?: AdvisorAutomationRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.advisorAutomation.create({
      data: { userId, advisorId: data.advisorId, name: data.name },
      include: { actions: true },
    });
    return { success: true, data: automation as AdvisorAutomationRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateAdvisorAutomation(
  id: string,
  data: { name?: string; enabled?: boolean },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.advisorAutomation.updateMany({ where: { id, userId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteAdvisorAutomation(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.advisorAutomation.deleteMany({ where: { id, userId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function addAdvisorAutomationAction(
  automationId: string,
  data: { type: StageActionType; config: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; data?: AdvisorAutomationActionRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.advisorAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    const count = await db.advisorAutomationAction.count({ where: { automationId } });
    const action = await db.advisorAutomationAction.create({
      data: { automationId, type: data.type, config: data.config, delayMinutes: data.delayMinutes ?? 0, order: count },
    });
    return { success: true, data: action as AdvisorAutomationActionRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateAdvisorAutomationAction(
  actionId: string,
  automationId: string,
  data: { type?: StageActionType; config?: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.advisorAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.advisorAutomationAction.update({ where: { id: actionId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteAdvisorAutomationAction(
  actionId: string,
  automationId: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.advisorAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.advisorAutomationAction.delete({ where: { id: actionId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
