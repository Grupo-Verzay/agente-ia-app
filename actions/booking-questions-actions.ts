'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { BookingQuestionType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export type BookingQuestionItem = {
  id: string;
  teamServiceId: string | null;
  label: string;
  type: BookingQuestionType;
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
};

async function getEffectiveUserId() {
  const user = await currentUser();
  if (!user) return null;
  return (user as any).effectiveId ?? user.id;
}

async function serviceBelongsToUser(teamServiceId: string, userId: string) {
  const service = await db.teamService.findFirst({
    where: { id: teamServiceId, team: { userId } },
    select: { id: true },
  });
  return Boolean(service);
}

async function getOwnedQuestion(id: string, userId: string) {
  return db.bookingQuestion.findFirst({
    where: { id, userId },
    select: { id: true },
  });
}

export async function getBookingQuestions(userId: string, teamServiceId?: string | null): Promise<BookingQuestionItem[]> {
  try {
    const rows = await db.bookingQuestion.findMany({
      where: { userId, teamServiceId: teamServiceId ?? null },
      orderBy: { order: 'asc' },
      select: { id: true, teamServiceId: true, label: true, type: true, options: true, required: true, order: true, active: true },
    });
    return rows;
  } catch {
    return [];
  }
}

export async function getActiveBookingQuestions(userId: string): Promise<BookingQuestionItem[]> {
  try {
    const rows = await db.bookingQuestion.findMany({
      where: { userId, active: true, teamServiceId: null },
      orderBy: { order: 'asc' },
      select: { id: true, teamServiceId: true, label: true, type: true, options: true, required: true, order: true, active: true },
    });
    return rows;
  } catch {
    return [];
  }
}

export async function getActiveServiceBookingQuestions(userId: string): Promise<BookingQuestionItem[]> {
  try {
    const rows = await db.bookingQuestion.findMany({
      where: { userId, active: true, teamServiceId: { not: null } },
      orderBy: [{ teamServiceId: 'asc' }, { order: 'asc' }],
      select: { id: true, teamServiceId: true, label: true, type: true, options: true, required: true, order: true, active: true },
    });
    return rows;
  } catch {
    return [];
  }
}

export async function createBookingQuestion(data: {
  label: string;
  type: BookingQuestionType;
  options?: string[];
  required?: boolean;
  teamServiceId?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getEffectiveUserId();
    if (!userId) return { success: false, message: 'No autorizado' };

    if (data.teamServiceId && !(await serviceBelongsToUser(data.teamServiceId, userId))) {
      return { success: false, message: 'Servicio no autorizado' };
    }

    const lastQ = await db.bookingQuestion.findFirst({
      where: { userId, teamServiceId: data.teamServiceId ?? null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    await db.bookingQuestion.create({
      data: {
        userId,
        teamServiceId: data.teamServiceId ?? null,
        label: data.label.trim(),
        type: data.type,
        options: data.options ?? [],
        required: data.required ?? false,
        order: (lastQ?.order ?? -1) + 1,
      },
    });

    revalidatePath('/schedule');
    revalidatePath('/bookings');
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Error al crear pregunta' };
  }
}

export async function updateBookingQuestion(
  id: string,
  data: { label?: string; type?: BookingQuestionType; options?: string[]; required?: boolean; active?: boolean },
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getEffectiveUserId();
    if (!userId) return { success: false, message: 'No autorizado' };
    if (!(await getOwnedQuestion(id, userId))) return { success: false, message: 'Pregunta no encontrada' };

    await db.bookingQuestion.update({ where: { id }, data });
    revalidatePath('/schedule');
    revalidatePath('/bookings');
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Error al actualizar' };
  }
}

export async function deleteBookingQuestion(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await getEffectiveUserId();
    if (!userId) return { success: false, message: 'No autorizado' };
    if (!(await getOwnedQuestion(id, userId))) return { success: false, message: 'Pregunta no encontrada' };

    await db.bookingQuestion.delete({ where: { id } });
    revalidatePath('/schedule');
    revalidatePath('/bookings');
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Error al eliminar' };
  }
}

export async function reorderBookingQuestions(
  items: { id: string; order: number }[],
): Promise<{ success: boolean }> {
  try {
    const userId = await getEffectiveUserId();
    if (!userId) return { success: false };

    const ids = items.map((item) => item.id);
    const ownedCount = await db.bookingQuestion.count({ where: { id: { in: ids }, userId } });
    if (ownedCount !== ids.length) return { success: false };

    await Promise.all(
      items.map((item) => db.bookingQuestion.update({ where: { id: item.id }, data: { order: item.order } })),
    );
    return { success: true };
  } catch {
    return { success: false };
  }
}
