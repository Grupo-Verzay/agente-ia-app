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

export interface ScheduleHttpTestResult {
  pingOk: boolean;
  pingError?: string;
  authStatus?: number;
  authBody?: string;
  servicesStatus?: number;
  servicesBody?: string;
  servicesError?: string;
}

/**
 * Prueba el API de agenda vía HTTP real (como lo haría el backend NestJS).
 */
export async function testScheduleHttpApi(userId: string): Promise<ScheduleHttpTestResult> {
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const key = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();

  // 1. Ping
  try {
    const pingRes = await fetch(`${baseUrl}/api/schedule/ping`, { cache: 'no-store' });
    if (!pingRes.ok) {
      return { pingOk: false, pingError: `ping status ${pingRes.status}` };
    }
  } catch (e: any) {
    return { pingOk: false, pingError: e?.message ?? 'error de red' };
  }

  // 2. Auth test (sin key)
  let authStatus: number | undefined;
  let authBody: string | undefined;
  try {
    const r = await fetch(`${baseUrl}/api/schedule/services?userId=${userId}`, { cache: 'no-store' });
    authStatus = r.status;
    authBody = await r.text();
  } catch (e: any) {
    authBody = e?.message ?? 'error de red';
  }

  // 3. Services con key correcta
  let servicesStatus: number | undefined;
  let servicesBody: string | undefined;
  let servicesError: string | undefined;
  try {
    const r = await fetch(`${baseUrl}/api/schedule/services?userId=${userId}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}` },
    });
    servicesStatus = r.status;
    servicesBody = await r.text();
  } catch (e: any) {
    servicesError = e?.message ?? 'error de red';
  }

  return {
    pingOk: true,
    authStatus,
    authBody,
    servicesStatus,
    servicesBody,
    servicesError,
  };
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
