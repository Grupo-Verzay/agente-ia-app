'use server';

import { db as _db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import type { StageActionType, StageActionConfig } from './stage-automation-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any;

export type TaskTypeAutomationActionRow = {
  id: string;
  type: StageActionType;
  order: number;
  config: StageActionConfig;
  delayMinutes: number;
};

export type TaskTypeAutomationRow = {
  id: string;
  taskType: string;
  name: string;
  enabled: boolean;
  actions: TaskTypeAutomationActionRow[];
};

async function getUserId(): Promise<string> {
  const user = await currentUser();
  if (!user?.id) throw new Error('No autenticado');
  return user.id;
}

export async function getTaskTypeAutomations(taskType?: string): Promise<{
  success: boolean; data?: TaskTypeAutomationRow[]; message?: string;
}> {
  try {
    const userId = await getUserId();
    const automations = await db.taskTypeAutomation.findMany({
      where: { userId, ...(taskType ? { taskType } : {}) },
      include: { actions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: automations as TaskTypeAutomationRow[] };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function createTaskTypeAutomation(data: { taskType: string; name: string }): Promise<{
  success: boolean; data?: TaskTypeAutomationRow; message?: string;
}> {
  try {
    const userId = await getUserId();
    const automation = await db.taskTypeAutomation.create({
      data: { userId, taskType: data.taskType, name: data.name },
      include: { actions: true },
    });
    return { success: true, data: automation as TaskTypeAutomationRow };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function updateTaskTypeAutomation(id: string, data: { name?: string; enabled?: boolean }): Promise<{
  success: boolean; message?: string;
}> {
  try {
    const userId = await getUserId();
    await db.taskTypeAutomation.updateMany({ where: { id, userId }, data });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function deleteTaskTypeAutomation(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.taskTypeAutomation.deleteMany({ where: { id, userId } });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function addTaskTypeAutomationAction(
  automationId: string,
  data: { type: StageActionType; config: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; data?: TaskTypeAutomationActionRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.taskTypeAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    const count = await db.taskTypeAutomationAction.count({ where: { automationId } });
    const action = await db.taskTypeAutomationAction.create({
      data: { automationId, type: data.type, config: data.config, delayMinutes: data.delayMinutes ?? 0, order: count },
    });
    return { success: true, data: action as TaskTypeAutomationActionRow };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function updateTaskTypeAutomationAction(
  actionId: string, automationId: string,
  data: { type?: StageActionType; config?: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.taskTypeAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.taskTypeAutomationAction.update({ where: { id: actionId }, data });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}

export async function deleteTaskTypeAutomationAction(actionId: string, automationId: string): Promise<{
  success: boolean; message?: string;
}> {
  try {
    const userId = await getUserId();
    const automation = await db.taskTypeAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.taskTypeAutomationAction.delete({ where: { id: actionId } });
    return { success: true };
  } catch (e: any) { return { success: false, message: e.message }; }
}
