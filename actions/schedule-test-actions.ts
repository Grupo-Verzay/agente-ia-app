'use server';

import { db } from '@/lib/db';

export interface ScheduleApiTestResult {
  userId: string;
  userName: string;
  authOk: boolean;
  services: { id: string; name: string }[];
  slotsToday: number;
  error?: string;
}

/**
 * Prueba interna del API de agenda para un usuario.
 * Llama directamente a la DB (sin pasar por HTTP) para verificar
 * que los datos están correctos y el userId es válido.
 */
export async function testScheduleApiForUser(userId: string): Promise<ScheduleApiTestResult> {
  const keyConfigured = !!(process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, meetingDuration: true, timezone: true },
    });

    if (!user) {
      return {
        userId,
        userName: '—',
        authOk: keyConfigured,
        services: [],
        slotsToday: 0,
        error: `No se encontró ningún usuario con id: ${userId}`,
      };
    }

    const services = await db.service.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    });

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const availability = await db.userAvailability.count({
      where: { userId, dayOfWeek: today.getDay() },
    });

    return {
      userId: user.id,
      userName: user.name ?? '(sin nombre)',
      authOk: keyConfigured,
      services,
      slotsToday: availability,
    };
  } catch (error: any) {
    return {
      userId,
      userName: '—',
      authOk: keyConfigured,
      services: [],
      slotsToday: 0,
      error: error?.message ?? 'Error desconocido',
    };
  }
}
