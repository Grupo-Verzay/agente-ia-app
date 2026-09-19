import "server-only";

import { db } from '@/lib/db';
import { BillingTemplateType, DELETE_DAYS_BILLING } from '@/types/billing';
// El borrado a los 30 dias si borra la linea: la cuenta deja de existir. La
// SUSPENSION por impago ya no (ver `lib/robot-por-facturacion.ts`).
import { liberarLasLineasDeLaCuenta } from '@/lib/sesion-de-la-linea';
import { apagarElRobotPorImpago, olvidarElRobotDe } from '@/lib/robot-por-facturacion';
import {
  resolveWhatsAppDispatcherLineByInstanceName,
  type WhatsAppDispatcherLine,
} from '@/actions/whatsapp-dispatcher';
import {
  sendBillingTemplateMessage,
  type BillingUserRecord,
} from '@/actions/billing/helpers/billing-notifications.server';
import {
  getBillingDaysRemaining,
  shouldSkipBillingReminderToday,
} from '@/actions/billing/helpers/billing-lifecycle';

/**
 * El cobro de los clientes de cada reseller. Lo dispara el cron diario.
 *
 * ## Por que vive aqui y no en `reseller-billing-actions.ts`
 *
 * Porque **una accion es un endpoint**. Aquello es un fichero `'use server'`
 * con pantalla detras —el formulario de Panel › Notificaciones edita su
 * configuracion—, asi que tiene que seguir siendolo; y mientras esta funcion
 * estuviera exportada desde alli, cualquiera con una sesion podia dispararla
 * desde el navegador. No es un runner cualquiera: recorre la cartera entera de
 * cada reseller, **suspende cuentas** y **borra las que llevan 30 dias
 * vencidas**, con su `db.user.delete` incluido.
 *
 * Ponerle la guarda de siempre no valia: la llama un cron, y **desde un cron no
 * hay sesion** — `currentUser()` devuelve vacio. Eso es literalmente lo que
 * dejo los avisos de Waha callados durante dias sin un solo error en los
 * registros. La salida es la que este repositorio ya usa en `lib/cobros-runner.ts`
 * y en `lib/avisos-de-vencimiento-runner.ts`: **un despachador del servidor no
 * pasa por una accion**. Aqui no hay nada que exportar al navegador, asi que no
 * hay endpoint que cerrar.
 *
 * Sus dos llamadores son `app/api/cron/billing/route.ts` —que pide
 * `CRON_SECRET`— y `lib/cobros-runner.ts`, que corre dentro del mismo cron.
 */

async function sendReseller(
  dispatcher: WhatsAppDispatcherLine | null,
  billing: BillingUserRecord,
  template: BillingTemplateType,
  textOverride?: string | null,
) {
  if (!dispatcher) throw new Error('No hay linea de WhatsApp conectada para el reseller.');
  const res = await sendBillingTemplateMessage({
    dispatcher,
    billing,
    template,
    textOverride,
    source: 'reseller-billing',
  });
  if (!res.success) throw new Error(res.message);
}

export async function runResellerBillingForAll(now: Date = new Date()): Promise<{
  resellers: number; sent: number; suspended: number; deleted: number; errors: number;
}> {
  const result = { resellers: 0, sent: 0, suspended: 0, deleted: 0, errors: 0 };

  const configs = await db.resellerBillingConfig.findMany({
    where: { enabled: true, instanceName: { not: null } },
  });

  for (const cfg of configs) {
    const dispatcher = cfg.instanceName
      ? await resolveWhatsAppDispatcherLineByInstanceName(cfg.instanceName)
      : null;
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
    for (const cli of clients) {
      try {
        const dueDate = cli.dueDate ? new Date(cli.dueDate) : null;
        const days = getBillingDaysRemaining(dueDate, now);
        if (dueDate == null || days == null) continue;

        if (!cli.notifyRemoteJid?.trim() && !cli.user.notificationNumber?.trim()) continue;

        const effectiveGrace = cfg.graceDays;
        const shouldSuspend = days <= -effectiveGrace && cli.accessStatus !== 'SUSPENDED';
        const shouldDelete = days <= -DELETE_DAYS_BILLING;

        // 1) Eliminación a los 30 días vencido
        if (shouldDelete) {
          try {
            await sendReseller(dispatcher, cli as BillingUserRecord, 'ACCOUNT_DELETED', cfg.msgDeleted);
          } catch { /* avisar es best-effort */ }
          // TODAS sus lineas y en los DOS proveedores. Antes esto era
          // `deleteInstanceEvolutionAware`, que resuelve una sola fila y hablaba
          // siempre con Evolution: con una linea de Waha se llevaba la fila por
          // la rama «sin ApiKey» y dejaba la sesion viva en su servidor.
          await liberarLasLineasDeLaCuenta(cli.user.id);
          await olvidarElRobotDe(cli.user.id);
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
          // Ni el webhook ni la sesion: lo que se apaga es el agente. El
          // webhook es lo que trae los avisos y guarda el historial, y borrar
          // la instancia obligaba a reescanear el QR al pagar.
          await apagarElRobotPorImpago(cli.user.id);
          try {
            await sendReseller(dispatcher, cli as BillingUserRecord, 'STATUS_SUSPENDED', cfg.msgSuspended);
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

        // Tres hitos y solo tres: 3 días antes, el día del vencimiento y 3 días
        // vencido. El aviso de vencido salía CUALQUIER día en negativo, así que
        // el cliente recibía uno el día 1, otro el 2, otro el 3, y así hasta la
        // suspensión. Cuatro o cinco mensajes de cobro seguidos no cobran más
        // rápido: se leen como spam y acaban silenciando la línea, que es justo
        // lo contrario de lo que se busca.
        let template: BillingTemplateType | null = null;
        let textOverride: string | null = null;
        if (days === 3) {
          template = 'REMINDER_3D';
          textOverride = cfg.msgReminder;
        } else if (days === 0) {
          template = 'DUE_TODAY';
          textOverride = cfg.msgDueToday;
        } else if (days === -3) {
          template = 'EXPIRED';
          textOverride = cfg.msgOverdue;
        }

        if (!template) continue;
        try {
          await sendReseller(dispatcher, cli as BillingUserRecord, template, textOverride);
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
