'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminOrReseller, isAdminLike } from '@/lib/rbac';
import { DEFAULT_BILLING_TEMPLATES } from './billing-message-templates';

/**
 * La configuracion de los cobros del reseller: leerla y guardarla. Eso es lo
 * que edita el formulario de Panel › Notificaciones, asi que esto **si** es un
 * fichero de acciones y sigue con su `'use server'`.
 *
 * Lo que se fue de aqui es `runResellerBillingForAll`, el recorrido diario:
 * vive en `lib/reseller-billing-runner.server.ts` y alli esta contado por que.
 * En dos palabras: **una accion es un endpoint**, y esa funcion suspende
 * cuentas y borra las que llevan 30 dias vencidas. La guarda de siempre no
 * valia —la llama un cron, y desde un cron no hay sesion—, asi que lo que se
 * hizo fue que dejara de ser alcanzable desde el navegador.
 */

// Los mensajes del reseller son, POR DEFECTO, idénticos a los de Verzay: el cron
// usa el mismo `buildBillingMessageForRecord`. Cada campo `msgX` es un OVERRIDE
// opcional (vacío = se usa el mensaje estándar de Verzay). Placeholders del
// override: {nombre} {empresa} {fecha} {dias} {precio} {plan} {link}.

export type ResellerBillingConfigData = {
  enabled: boolean;
  instanceName: string | null;
  graceDays: number;
  msgReminder: string;
  msgDueToday: string;
  msgOverdue: string;
  msgSuspended: string;
  msgDeleted: string;
};

/* ── Config: get/save (reseller dueño o admin) ─────────────────────────── */
export async function getResellerBillingConfig(resellerId?: string): Promise<ResellerBillingConfigData> {
  const me = await currentUser();
  const targetId = resellerId && isAdminLike(me?.role) ? resellerId : me?.id;
  // Se muestra prellenado con el patrón por defecto de Verzay (idéntico para todos).
  const empty: ResellerBillingConfigData = {
    enabled: true,
    instanceName: null,
    graceDays: 3,
    msgReminder: DEFAULT_BILLING_TEMPLATES.msgReminder,
    msgDueToday: DEFAULT_BILLING_TEMPLATES.msgDueToday,
    msgOverdue: DEFAULT_BILLING_TEMPLATES.msgOverdue,
    msgSuspended: DEFAULT_BILLING_TEMPLATES.msgSuspended,
    msgDeleted: DEFAULT_BILLING_TEMPLATES.msgDeleted,
  };
  if (!targetId) return empty;
  const c = await db.resellerBillingConfig.findUnique({ where: { resellerId: targetId } });
  if (!c) return empty;
  return {
    enabled: c.enabled,
    instanceName: c.instanceName,
    graceDays: c.graceDays,
    msgReminder: c.msgReminder ?? DEFAULT_BILLING_TEMPLATES.msgReminder,
    msgDueToday: c.msgDueToday ?? DEFAULT_BILLING_TEMPLATES.msgDueToday,
    msgOverdue: c.msgOverdue ?? DEFAULT_BILLING_TEMPLATES.msgOverdue,
    msgSuspended: c.msgSuspended ?? DEFAULT_BILLING_TEMPLATES.msgSuspended,
    msgDeleted: c.msgDeleted ?? DEFAULT_BILLING_TEMPLATES.msgDeleted,
  };
}

export async function saveResellerBillingConfig(
  data: ResellerBillingConfigData,
): Promise<{ success: boolean; message: string }> {
  const me = await currentUser();
  if (!me || !isAdminOrReseller(me.role)) return { success: false, message: 'No autorizado.' };
  const resellerId = me.id;
  // null = idéntico al patrón por defecto (el cron usa el mensaje dinámico exacto).
  const overrideOrNull = (value: string | null | undefined, def: string) => {
    const v = (value ?? '').trim();
    return v && v !== def.trim() ? v : null;
  };
  const payload = {
    enabled: data.enabled,
    instanceName: data.instanceName?.trim() || null,
    graceDays: Number.isFinite(data.graceDays) ? Math.max(0, Math.trunc(data.graceDays)) : 3,
    msgReminder: overrideOrNull(data.msgReminder, DEFAULT_BILLING_TEMPLATES.msgReminder),
    msgDueToday: overrideOrNull(data.msgDueToday, DEFAULT_BILLING_TEMPLATES.msgDueToday),
    msgOverdue: overrideOrNull(data.msgOverdue, DEFAULT_BILLING_TEMPLATES.msgOverdue),
    msgSuspended: overrideOrNull(data.msgSuspended, DEFAULT_BILLING_TEMPLATES.msgSuspended),
    msgDeleted: overrideOrNull(data.msgDeleted, DEFAULT_BILLING_TEMPLATES.msgDeleted),
  };
  try {
    await db.resellerBillingConfig.upsert({
      where: { resellerId },
      update: payload,
      create: { resellerId, ...payload },
    });
    return { success: true, message: 'Configuración de cobros guardada.' };
  } catch {
    return { success: false, message: 'No se pudo guardar la configuración.' };
  }
}
