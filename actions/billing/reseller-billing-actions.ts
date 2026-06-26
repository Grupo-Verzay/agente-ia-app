'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminOrReseller, isAdminLike } from '@/lib/rbac';
import { DELETE_DAYS_BILLING } from '@/types/billing';
import { deleteInstanceEvolutionAware } from '@/actions/api-action';
import { setUserBillingWebhookEnabled } from './helpers/billing-notifications.server';
import {
  getBillingDaysRemaining,
  shouldSkipBillingReminderToday,
} from './helpers/billing-lifecycle';
import { fmtDateDDMMYYYY } from './helpers/billing-helpers';

// Mensajes por defecto (editables por cada reseller). Placeholders disponibles:
// {nombre}, {empresa}, {fecha}, {dias}
const DEFAULT_RESELLER_BILLING = {
  msgReminder: '👋 *Hola {nombre}!* Tu servicio vence el *{fecha}*. Renueva a tiempo para no perder el acceso. 🙌',
  msgDueToday: '⏰ *Hola {nombre}!* Hoy ({fecha}) vence tu servicio. Renueva hoy para mantenerlo activo. 🙌',
  msgOverdue: '🔴 *Hola {nombre}!* Tu servicio está vencido (venció el {fecha}). Regulariza el pago para reactivarlo. 💳',
  msgSuspended: '🚫 *Hola {nombre}!* Tu servicio fue *suspendido* por falta de pago. Regulariza para reactivarlo. 💳',
  msgDeleted: '🗑️ *Hola {nombre}!* Tu cuenta y todos tus datos fueron eliminados por falta de pago.',
};

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

function normalizeBaseUrl(url: string | null | undefined): string {
  const t = (url ?? '').trim().replace(/\/+$/, '');
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function resolveMsg(tpl: string | null | undefined, fallback: string, vars: Record<string, string>): string {
  let out = (tpl && tpl.trim()) ? tpl : fallback;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), v || '');
  }
  return out;
}

async function sendReseller(sendUrl: string, apikey: string, phone: string, text: string) {
  const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  const res = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({ number: remoteJid, delay: 1200, text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
}

/* ── Config: get/save (reseller dueño o admin) ─────────────────────────── */
export async function getResellerBillingConfig(resellerId?: string): Promise<ResellerBillingConfigData> {
  const me = await currentUser();
  const targetId = resellerId && isAdminLike(me?.role) ? resellerId : me?.id;
  const empty: ResellerBillingConfigData = {
    enabled: true,
    instanceName: null,
    graceDays: 3,
    msgReminder: DEFAULT_RESELLER_BILLING.msgReminder,
    msgDueToday: DEFAULT_RESELLER_BILLING.msgDueToday,
    msgOverdue: DEFAULT_RESELLER_BILLING.msgOverdue,
    msgSuspended: DEFAULT_RESELLER_BILLING.msgSuspended,
    msgDeleted: DEFAULT_RESELLER_BILLING.msgDeleted,
  };
  if (!targetId) return empty;
  const c = await db.resellerBillingConfig.findUnique({ where: { resellerId: targetId } });
  if (!c) return empty;
  return {
    enabled: c.enabled,
    instanceName: c.instanceName,
    graceDays: c.graceDays,
    msgReminder: c.msgReminder ?? DEFAULT_RESELLER_BILLING.msgReminder,
    msgDueToday: c.msgDueToday ?? DEFAULT_RESELLER_BILLING.msgDueToday,
    msgOverdue: c.msgOverdue ?? DEFAULT_RESELLER_BILLING.msgOverdue,
    msgSuspended: c.msgSuspended ?? DEFAULT_RESELLER_BILLING.msgSuspended,
    msgDeleted: c.msgDeleted ?? DEFAULT_RESELLER_BILLING.msgDeleted,
  };
}

export async function saveResellerBillingConfig(
  data: ResellerBillingConfigData,
): Promise<{ success: boolean; message: string }> {
  const me = await currentUser();
  if (!me || !isAdminOrReseller(me.role)) return { success: false, message: 'No autorizado.' };
  const resellerId = me.id;
  const payload = {
    enabled: data.enabled,
    instanceName: data.instanceName?.trim() || null,
    graceDays: Number.isFinite(data.graceDays) ? Math.max(0, Math.trunc(data.graceDays)) : 3,
    msgReminder: data.msgReminder?.trim() || null,
    msgDueToday: data.msgDueToday?.trim() || null,
    msgOverdue: data.msgOverdue?.trim() || null,
    msgSuspended: data.msgSuspended?.trim() || null,
    msgDeleted: data.msgDeleted?.trim() || null,
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
    const reseller = await db.user.findUnique({
      where: { id: cfg.resellerId },
      select: { apiKey: { select: { url: true, key: true } } },
    });
    const serverUrl = normalizeBaseUrl(reseller?.apiKey?.url);
    const apikey = reseller?.apiKey?.key ?? '';
    if (!serverUrl || !apikey || !cfg.instanceName) continue;
    const sendUrl = `${serverUrl}/message/sendText/${cfg.instanceName}`;
    result.resellers++;

    // Clientes de pago del reseller con fecha de cobro definida.
    const clients = await db.userBilling.findMany({
      where: {
        dueDate: { not: null },
        user: { demoResellerId: cfg.resellerId, isDemo: false },
      },
      include: { user: { select: { id: true, name: true, company: true, notificationNumber: true } } },
    });

    for (const cli of clients) {
      try {
        const dueDate = cli.dueDate ? new Date(cli.dueDate) : null;
        const days = getBillingDaysRemaining(dueDate, now);
        if (dueDate == null || days == null) continue;

        const phone = (cli.notifyRemoteJid?.trim() || cli.user.notificationNumber?.trim() || '');
        if (!phone) continue;

        const vars = {
          nombre: cli.user.name ?? cli.user.company ?? 'Cliente',
          empresa: cli.user.company ?? '',
          fecha: fmtDateDDMMYYYY(dueDate),
          dias: String(Math.abs(days)),
        };

        const effectiveGrace = cfg.graceDays;
        const shouldSuspend = days <= -effectiveGrace && cli.accessStatus !== 'SUSPENDED';
        const shouldDelete = days <= -DELETE_DAYS_BILLING;

        // 1) Eliminación a los 30 días vencido
        if (shouldDelete) {
          try {
            await sendReseller(sendUrl, apikey, phone, resolveMsg(cfg.msgDeleted, DEFAULT_RESELLER_BILLING.msgDeleted, vars));
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
            await sendReseller(sendUrl, apikey, phone, resolveMsg(cfg.msgSuspended, DEFAULT_RESELLER_BILLING.msgSuspended, vars));
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
        if (days === 3) text = resolveMsg(cfg.msgReminder, DEFAULT_RESELLER_BILLING.msgReminder, vars);
        else if (days === 0) text = resolveMsg(cfg.msgDueToday, DEFAULT_RESELLER_BILLING.msgDueToday, vars);
        else if (days < 0) text = resolveMsg(cfg.msgOverdue, DEFAULT_RESELLER_BILLING.msgOverdue, vars);

        if (!text) continue;
        try {
          await sendReseller(sendUrl, apikey, phone, text);
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
