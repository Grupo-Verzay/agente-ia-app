'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { BookingQuestionType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export type BookingQuestionItem = {
  id: string;
  label: string;
  type: BookingQuestionType;
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
};

export async function getBookingQuestions(userId: string): Promise<BookingQuestionItem[]> {
  try {
    const rows = await db.bookingQuestion.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, type: true, options: true, required: true, order: true, active: true },
    });
    return rows;
  } catch {
    return [];
  }
}

export async function getActiveBookingQuestions(userId: string): Promise<BookingQuestionItem[]> {
  try {
    const rows = await db.bookingQuestion.findMany({
      where: { userId, active: true },
      orderBy: { order: 'asc' },
      select: { id: true, label: true, type: true, options: true, required: true, order: true, active: true },
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
}): Promise<{ success: boolean; message?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, message: 'No autorizado' };
    const userId = (user as any).effectiveId ?? user.id;

    const lastQ = await db.bookingQuestion.findFirst({
      where: { userId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    await db.bookingQuestion.create({
      data: {
        userId,
        label: data.label.trim(),
        type: data.type,
        options: data.options ?? [],
        required: data.required ?? false,
        order: (lastQ?.order ?? -1) + 1,
      },
    });

    revalidatePath('/schedule');
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
    const user = await currentUser();
    if (!user) return { success: false, message: 'No autorizado' };

    await db.bookingQuestion.update({ where: { id }, data });
    revalidatePath('/schedule');
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Error al actualizar' };
  }
}

export async function deleteBookingQuestion(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, message: 'No autorizado' };

    await db.bookingQuestion.delete({ where: { id } });
    revalidatePath('/schedule');
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Error al eliminar' };
  }
}

export async function reorderBookingQuestions(
  items: { id: string; order: number }[],
): Promise<{ success: boolean }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false };

    await Promise.all(
      items.map((item) => db.bookingQuestion.update({ where: { id: item.id }, data: { order: item.order } })),
    );
    return { success: true };
  } catch {
    return { success: false };
  }
}
