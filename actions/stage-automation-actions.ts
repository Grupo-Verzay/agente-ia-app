'use server';

import { db as _db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { LeadStatus } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any;

export type StageActionType =
  | 'TAG_ADD' | 'TAG_REMOVE' | 'TASK' | 'ASSIGN' | 'EXECUTE_FLOW'
  | 'MESSAGE' | 'REMINDER' | 'NOTIFY_ADVISOR' | 'TOGGLE_AI'
  | 'SEND_FILE' | 'WEBHOOK' | 'CHANGE_STATUS' | 'AI_CALL';

export type StageActionConfig = Record<string, unknown>;

export type StageAutomationActionRow = {
  id: string;
  type: StageActionType;
  order: number;
  config: StageActionConfig;
  delayMinutes: number;
};

export type StageAutomationRow = {
  id: string;
  stage: LeadStatus;
  name: string;
  enabled: boolean;
  actions: StageAutomationActionRow[];
};

async function getUserId(): Promise<string> {
  const user = await currentUser();
  if (!user?.id) throw new Error('No autenticado');
  return user.id;
}

export async function getStageAutomations(stage?: LeadStatus): Promise<{
  success: boolean;
  data?: StageAutomationRow[];
  message?: string;
}> {
  try {
    const userId = await getUserId();
    const automations = await db.stageAutomation.findMany({
      where: { userId, ...(stage ? { stage } : {}) },
      include: { actions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: automations as StageAutomationRow[] };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function createStageAutomation(data: {
  stage: LeadStatus;
  name: string;
}): Promise<{ success: boolean; data?: StageAutomationRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.stageAutomation.create({
      data: { userId, stage: data.stage, name: data.name },
      include: { actions: true },
    });
    return { success: true, data: automation as StageAutomationRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateStageAutomation(
  id: string,
  data: { name?: string; enabled?: boolean },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.stageAutomation.updateMany({ where: { id, userId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteStageAutomation(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.stageAutomation.deleteMany({ where: { id, userId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function addStageAutomationAction(
  automationId: string,
  data: { type: StageActionType; config: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; data?: StageAutomationActionRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.stageAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };

    const count = await db.stageAutomationAction.count({ where: { automationId } });
    const action = await db.stageAutomationAction.create({
      data: {
        automationId,
        type: data.type,
        config: data.config,
        delayMinutes: data.delayMinutes ?? 0,
        order: count,
      },
    });
    return { success: true, data: action as StageAutomationActionRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateStageAutomationAction(
  actionId: string,
  automationId: string,
  data: { type?: StageActionType; config?: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.stageAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.stageAutomationAction.update({ where: { id: actionId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteStageAutomationAction(
  actionId: string,
  automationId: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.stageAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.stageAutomationAction.delete({ where: { id: actionId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
