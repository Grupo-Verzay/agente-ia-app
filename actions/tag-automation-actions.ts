'use server';

import { db as _db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import type { StageActionType, StageActionConfig } from './stage-automation-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any;

export type TagAutomationActionRow = {
  id: string;
  type: StageActionType;
  order: number;
  config: StageActionConfig;
  delayMinutes: number;
};

export type TagAutomationRow = {
  id: string;
  tagId: number | null;
  name: string;
  enabled: boolean;
  actions: TagAutomationActionRow[];
};

async function getUserId(): Promise<string> {
  const user = await currentUser();
  if (!user?.id) throw new Error('No autenticado');
  return user.id;
}

export async function getTagAutomations(tagId?: number | null): Promise<{
  success: boolean;
  data?: TagAutomationRow[];
  message?: string;
}> {
  try {
    const userId = await getUserId();
    const where: Record<string, unknown> = { userId };
    if (tagId !== undefined) where.tagId = tagId;
    const automations = await db.tagAutomation.findMany({
      where,
      include: { actions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: automations as TagAutomationRow[] };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function createTagAutomation(data: {
  tagId: number | null;
  name: string;
}): Promise<{ success: boolean; data?: TagAutomationRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.tagAutomation.create({
      data: { userId, tagId: data.tagId, name: data.name },
      include: { actions: true },
    });
    return { success: true, data: automation as TagAutomationRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateTagAutomation(
  id: string,
  data: { name?: string; enabled?: boolean },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.tagAutomation.updateMany({ where: { id, userId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteTagAutomation(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.tagAutomation.deleteMany({ where: { id, userId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function addTagAutomationAction(
  automationId: string,
  data: { type: StageActionType; config: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; data?: TagAutomationActionRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.tagAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    const count = await db.tagAutomationAction.count({ where: { automationId } });
    const action = await db.tagAutomationAction.create({
      data: { automationId, type: data.type, config: data.config, delayMinutes: data.delayMinutes ?? 0, order: count },
    });
    return { success: true, data: action as TagAutomationActionRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateTagAutomationAction(
  actionId: string,
  automationId: string,
  data: { type?: StageActionType; config?: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.tagAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.tagAutomationAction.update({ where: { id: actionId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteTagAutomationAction(
  actionId: string,
  automationId: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.tagAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.tagAutomationAction.delete({ where: { id: actionId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
