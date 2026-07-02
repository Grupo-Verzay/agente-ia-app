'use server';

import { unstable_noStore as noStore, revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export type FollowUpWindow = {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number; // 1-24 (fin exclusivo)
  days: number[]; // 0=Dom .. 6=Sáb
};

export type ActionResult<T = undefined> = {
  success: boolean;
  message: string;
  data?: T;
};

const DEFAULT_WINDOW: FollowUpWindow = {
  enabled: true,
  startHour: 8,
  endHour: 20,
  days: [1, 2, 3, 4, 5, 6],
};

function parseDays(raw: string | null | undefined): number[] {
  const list = (raw ?? '')
    .split(',')
    .map((d) => Number.parseInt(d.trim(), 10))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return Array.from(new Set(list)).sort((a, b) => a - b);
}

/** Cuenta sobre la que se actúa (dueño de la línea). Los agentes usan effectiveId. */
async function resolveAccount() {
  const user = await currentUser();
  if (!user) return null;
  // Solo el dueño o un administrador vinculado pueden editar la config de la cuenta.
  const canEdit = !user.ownerId || user.advisorRole === 'administrador';
  return { userId: user.effectiveId, canEdit };
}

export async function getFollowUpWindow(): Promise<ActionResult<FollowUpWindow>> {
  noStore();
  const acc = await resolveAccount();
  if (!acc) return { success: false, message: 'no_autenticado' };

  try {
    const rows = await db.$queryRaw<
      Array<{
        enabled: boolean | null;
        startHour: number | null;
        endHour: number | null;
        days: string | null;
      }>
    >`
      SELECT "follow_up_window_enabled" AS "enabled",
             "follow_up_send_start_hour" AS "startHour",
             "follow_up_send_end_hour" AS "endHour",
             "follow_up_send_days" AS "days"
      FROM "User" WHERE id = ${acc.userId} LIMIT 1
    `;
    const r = rows?.[0];
    if (!r) return { success: true, message: 'ok', data: DEFAULT_WINDOW };
    return {
      success: true,
      message: 'ok',
      data: {
        enabled: r.enabled ?? true,
        startHour: Number.isInteger(r.startHour as number) ? Number(r.startHour) : 8,
        endHour: Number.isInteger(r.endHour as number) ? Number(r.endHour) : 20,
        days: r.days ? parseDays(r.days) : DEFAULT_WINDOW.days,
      },
    };
  } catch {
    // columnas aún no migradas → defaults
    return { success: true, message: 'ok', data: DEFAULT_WINDOW };
  }
}

export async function saveFollowUpWindow(
  input: FollowUpWindow,
): Promise<ActionResult<FollowUpWindow>> {
  const acc = await resolveAccount();
  if (!acc) return { success: false, message: 'No autenticado.' };
  if (!acc.canEdit)
    return { success: false, message: 'No tienes permiso para editar esta configuración.' };

  // Validación/normalización.
  const startHour = Math.min(Math.max(Math.trunc(input.startHour), 0), 23);
  let endHour = Math.min(Math.max(Math.trunc(input.endHour), 1), 24);
  if (endHour <= startHour) endHour = Math.min(startHour + 1, 24);
  const days = parseDays(input.days.join(','));
  if (input.enabled && days.length === 0) {
    return { success: false, message: 'Selecciona al menos un día para el envío.' };
  }
  const daysStr = days.join(',');

  try {
    await db.$executeRaw`
      UPDATE "User" SET
        "follow_up_window_enabled" = ${input.enabled},
        "follow_up_send_start_hour" = ${startHour},
        "follow_up_send_end_hour" = ${endHour},
        "follow_up_send_days" = ${daysStr}
      WHERE id = ${acc.userId}
    `;
    revalidatePath('/profile');
    return {
      success: true,
      message: 'Horario de seguimientos actualizado.',
      data: { enabled: input.enabled, startHour, endHour, days },
    };
  } catch {
    return {
      success: false,
      message: 'No se pudo guardar. Vuelve a intentar en unos minutos (¿deploy pendiente?).',
    };
  }
}
