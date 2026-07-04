'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminOrReseller, isAdminLike } from '@/lib/rbac';
import { BillingTemplateType, DELETE_DAYS_BILLING } from '@/types/billing';
import { deleteInstanceEvolutionAware } from '@/actions/api-action';
import { resolveWhatsAppDispatcherLine, sendViaWhatsAppDispatcher } from '@/actions/whatsapp-dispatcher';
import { setUserBillingWebhookEnabled } from './helpers/billing-notifications.server';
import {
  getBillingDaysRemaining,
  shouldSkipBillingReminderToday,
} from './helpers/billing-lifecycle';
import { buildBillingMessageForRecord, DEFAULT_BILLING_TEMPLATES } from './billing-message-templates';

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

async function sendReseller(dispatcher: Awaited<ReturnType<typeof resolveWhatsAppDispatcherLine>>, phone: string, text: string) {
  if (!dispatcher) throw new Error('No hay linea de WhatsApp conectada para el reseller.');
  const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  const res = await sendViaWhatsAppDispatcher({
    dispatcher,
    remoteJid,
    text,
    history: {
      instanceName: dispatcher.instanceName,
      type: 'notification',
      additionalKwargs: {
        kind: 'reseller-billing',
        resellerId: dispatcher.id,
      },
    },
  });
  if (!res.success) throw new Error(res.message);
}

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

/* ── Cron: cobro de los clientes de cada reseller (system) ──────────────── */
export async function runResellerBillingForAll(now: Date = new Date()): Promise<{
  resellers: number; sent: number; suspended: number; deleted: number; errors: number;
}> {
  const result = { resellers: 0, sent: 0, suspended: 0, deleted: 0, errors: 0 };

  const configs = await db.resellerBillingConfig.findMany({
    where: { enabled: true, instanceName: { not: null } },
  });

  for (const cfg of configs) {
    const dispatcher = await resolveWhatsAppDispatcherLine({
      ownerUserId: cfg.resellerId,
      preferredInstanceName: cfg.instanceName,
      includeAdminFallback: false,
    });
    if (!dispatcher) continue;
    result.resellers++;

    // Clientes de pago del reseller con fecha de cobro definida.
    const clients = await db.userBilling.findMany({
      where: {
        dueDate: { not: null },
        user: { demoResellerId: cfg.resellerId, isDemo: false },
      },
      include: { user: { select: { id: true, name: true, company: true, notificationNumber: true } } },
    });

    // Mensaje por defecto idéntico a Verzay; `override` solo si el reseller editó.
    const buildMsg = (cli: (typeof clients)[number], type: BillingTemplateType, override?: string | null) =>
      buildBillingMessageForRecord(cli, type, now, override);

    for (const cli of clients) {
      try {
        const dueDate = cli.dueDate ? new Date(cli.dueDate) : null;
        const days = getBillingDaysRemaining(dueDate, now);
        if (dueDate == null || days == null) continue;

        const phone = (cli.notifyRemoteJid?.trim() || cli.user.notificationNumber?.trim() || '');
        if (!phone) continue;

        const effectiveGrace = cfg.graceDays;
        const shouldSuspend = days <= -effectiveGrace && cli.accessStatus !== 'SUSPENDED';
        const shouldDelete = days <= -DELETE_DAYS_BILLING;

        // 1) Eliminación a los 30 días vencido
        if (shouldDelete) {
          try {
            await sendReseller(dispatcher, phone, buildMsg(cli, 'ACCOUNT_DELETED', cfg.msgDeleted));
          } catch { /* avisar es best-effort */ }
          await deleteInstanceEvolutionAware(cli.user.id).catch(() => null);
          await db.user.delete({ where: { id: cli.user.id } }).catch(() => null);
          result.deleted++;
          continue;
        }

        // 2) Suspensión al cumplirse la gracia
        if (shouldSuspend) {
          await db.user.update({ where: { id: cli.user.id }, data: { status: false } });
          await db.userBilling.update({
            where: { id: cli.id },
            data: { accessStatus: 'SUSPENDED', billingStatus: 'UNPAID', suspendedAt: now, suspendedReason: 'Vencido (cobro del reseller)' },
          });
          await setUserBillingWebhookEnabled({ userId: cli.user.id, enable: false }).catch(() => null);
          await deleteInstanceEvolutionAware(cli.user.id).catch(() => null);
          try {
            await sendReseller(dispatcher, phone, buildMsg(cli, 'STATUS_SUSPENDED', cfg.msgSuspended));
            result.sent++;
          } catch { result.errors++; }
          result.suspended++;
          continue;
        }

        // 3) Recordatorios (anti-spam: una vez por día/ciclo)
        const skipToday = shouldSkipBillingReminderToday({
          now, dueDate,
          lastReminderAt: cli.lastReminderAt,
          lastReminderDueDate: cli.lastReminderDueDate,
        });
        if (skipToday) continue;

        let text: string | null = null;
        if (days === 3) text = buildMsg(cli, 'REMINDER_3D', cfg.msgReminder);
        else if (days === 0) text = buildMsg(cli, 'DUE_TODAY', cfg.msgDueToday);
        else if (days < 0) text = buildMsg(cli, 'EXPIRED', cfg.msgOverdue);

        if (!text) continue;
        try {
          await sendReseller(dispatcher, phone, text);
          await db.userBilling.update({
            where: { id: cli.id },
            data: { lastReminderAt: now, lastReminderDueDate: dueDate },
          });
          result.sent++;
        } catch { result.errors++; }
      } catch {
        result.errors++;
      }
    }
  }

  return result;
}
