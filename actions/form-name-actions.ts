'use server';

import { db } from '@/lib/db';

export async function getFormNameById(formId: string): Promise<string | null> {
  try {
    const form = await db.form.findUnique({ where: { id: formId }, select: { title: true } });
    return form?.title ?? null;
  } catch {
    return null;
  }
}
