'use server';

import { db as _db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { AppointmentStatus } from '@prisma/client';
import type { StageActionType, StageActionConfig } from './stage-automation-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any;

export type ApptAutomationActionRow = {
  id: string;
  type: StageActionType;
  order: number;
  config: StageActionConfig;
  delayMinutes: number;
};

export type ApptAutomationRow = {
  id: string;
  apptStatus: AppointmentStatus;
  name: string;
  enabled: boolean;
  actions: ApptAutomationActionRow[];
};

async function getUserId(): Promise<string> {
  const user = await currentUser();
  if (!user?.id) throw new Error('No autenticado');
  return user.id;
}

export async function getApptAutomations(apptStatus?: AppointmentStatus): Promise<{
  success: boolean;
  data?: ApptAutomationRow[];
  message?: string;
}> {
  try {
    const userId = await getUserId();
    const automations = await db.apptAutomation.findMany({
      where: { userId, ...(apptStatus ? { apptStatus } : {}) },
      include: { actions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: automations as ApptAutomationRow[] };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function createApptAutomation(data: {
  apptStatus: AppointmentStatus;
  name: string;
}): Promise<{ success: boolean; data?: ApptAutomationRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.apptAutomation.create({
      data: { userId, apptStatus: data.apptStatus, name: data.name },
      include: { actions: true },
    });
    return { success: true, data: automation as ApptAutomationRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateApptAutomation(
  id: string,
  data: { name?: string; enabled?: boolean },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.apptAutomation.updateMany({ where: { id, userId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteApptAutomation(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    await db.apptAutomation.deleteMany({ where: { id, userId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function addApptAutomationAction(
  automationId: string,
  data: { type: StageActionType; config: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; data?: ApptAutomationActionRow; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.apptAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    const count = await db.apptAutomationAction.count({ where: { automationId } });
    const action = await db.apptAutomationAction.create({
      data: { automationId, type: data.type, config: data.config, delayMinutes: data.delayMinutes ?? 0, order: count },
    });
    return { success: true, data: action as ApptAutomationActionRow };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function updateApptAutomationAction(
  actionId: string,
  automationId: string,
  data: { type?: StageActionType; config?: StageActionConfig; delayMinutes?: number },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.apptAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.apptAutomationAction.update({ where: { id: actionId }, data });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function deleteApptAutomationAction(
  actionId: string,
  automationId: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getUserId();
    const automation = await db.apptAutomation.findFirst({ where: { id: automationId, userId } });
    if (!automation) return { success: false, message: 'Automación no encontrada' };
    await db.apptAutomationAction.delete({ where: { id: actionId } });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
