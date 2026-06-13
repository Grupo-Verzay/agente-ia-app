'use server';

import { db as _db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import type { StageActionType, StageActionConfig } from './stage-automation-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any;

export type ReminderGroupAutomationActionRow = {
  id: string;
  type: StageActionType;
  order: number;
  config: StageActionConfig;
  delayMinutes: number;
};

export type ReminderGroupAutomationRow = {
  id: string;
  reminderGroup: string;
  name: string;
  enabled: boolean;
  actions: ReminderGroupAutomationActionRow[];
};

async function getUserId(): Promise<string> {
  const user = await currentUser();
  if (!user?.id) throw new Error('No autenticado');
  return user.id;
}

export async function getReminderGroupAutomations(reminderGroup?: string): Promise<{
  success: boolean; data?: ReminderGroupAutomationRow[]; message?: string;
}> {
  try {
    const userId = await getUserId();
    const automations = await db.reminderGroupAutomation.findMany({
      where: { userId, ...(reminderGroup ? { reminderGroup } : {}) },
      include: { actions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: automations as ReminderGroupAutomationRow[] };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function createReminderGroupAutomation(data: { reminderGroup: string; name: string }): Promise<{
  success: boolean; data?: ReminderGroupAutomationRow; message?: string;
}> {
  try {
    const userId = await getUserId();
    const automation = await db.reminderGroupAutomation.create({
      data: { userId, reminderGroup: data.reminderGroup, name: data.name },
      include: { actions: true },
    });
    return { success: true, data: automation as ReminderGroupAutomationRow };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function updateReminderGroupAutomation(id: string, data: { name?: string; enabled?: boolean }): Promise<{
  success: boolean; message?: string;
}> {
  try {
    const userId = await getUserId();
    await db.reminderGroupAutomation.updateMany({ where: { id, userId }, data });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function deleteReminderGroupAutomation(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.reminderGroupAutomation.deleteMany({ where: { id, userId } });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function addReminderGroupAutomationAction(
  automationId: string,
  data: { type: StageActionType; config: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; data?: ReminderGroupAutomationActionRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.reminderGroupAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    const count = await db.reminderGroupAutomationAction.count({ where: { automationId } });
    const action = await db.reminderGroupAutomationAction.create({
      data: { automationId, type: data.type, config: data.config, delayMinutes: data.delayMinutes ?? 0, order: count },
    });
    return { success: true, data: action as ReminderGroupAutomationActionRow };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function updateReminderGroupAutomationAction(
  actionId: string, automationId: string,
  data: { type?: StageActionType; config?: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.reminderGroupAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.reminderGroupAutomationAction.update({ where: { id: actionId }, data });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function deleteReminderGroupAutomationAction(actionId: string, automationId: string): Promise<{
  success: boolean; message?: string;
}> {
  try {
    const userId = await getUserId();
    const automation = await db.reminderGroupAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.reminderGroupAutomationAction.delete({ where: { id: actionId } });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}
