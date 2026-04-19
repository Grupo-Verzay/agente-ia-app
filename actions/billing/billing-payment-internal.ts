"use server";

/**
 * Helpers internos de billing SIN autenticación de sesión.
 * Solo deben ser llamados desde rutas internas protegidas por CRON_SECRET
 * (ej: /api/payment/confirm).
 *
 * NO exponer estas funciones directamente en server actions accesibles al cliente.
 */

import { db } from "@/lib/db";
import { PaymentSource } from "@prisma/client";

import {
    getBillingUserRecord,
    loadBillingDispatcherConfig,
    sendBillingStateChangeMessage,
    setUserBillingWebhookEnabled,
} from "./helpers/billing-notifications.server";
import { toDate } from "./helpers/billing-helpers";
import { createInstanceInternal, deleteInstanceInternal } from "@/actions/api-action";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ConfirmPaymentInput = {
    clientUserId: string;
    amount: number;
    currencyCode: string;
    source: PaymentSource;
    externalReference: string;
    notes?: string | null;
};

export type ConfirmPaymentResult = {
    success: boolean;
    message: string;
    newDueDate?: string;
    alreadyProcessed?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

async function deleteInstanceOnSuspension(userId: string) {
    const result = await deleteInstanceInternal(userId);
    if (result.success && result.instanceName) {
        await db.userBilling.update({
            where: { userId },
            data: { lastInstanceName: result.instanceName },
        });
    }
}

async function createInstanceOnReactivation(userId: string, instanceName: string) {
    const result = await createInstanceInternal(userId, instanceName);
    if (result.success) {
        await db.userBilling.update({
            where: { userId },
            data: { lastInstanceName: null },
        });
    }
}

async function runStatusSideEffects(args: {
    userId: string;
    previousBillingStatus?: string | null;
    previousAccessStatus?: string | null;
}) {
    const updated = await getBillingUserRecord(args.userId);
    if (!updated) return;

    const changed =
        updated.billingStatus !== (args.previousBillingStatus ?? null) ||
        updated.accessStatus !== (args.previousAccessStatus ?? null);

    if (!changed) return;

    const dispatcher = await loadBillingDispatcherConfig();

    await setUserBillingWebhookEnabled({
        userId: updated.userId,
        enable: !(updated.billingStatus === "UNPAID" && updated.accessStatus === "SUSPENDED"),
    });

    await sendBillingStateChangeMessage({
        billing: updated,
        dispatcher,
        source: "payment-confirm-internal",
    });

    const wasJustSuspended =
        args.previousAccessStatus !== "SUSPENDED" && updated.accessStatus === "SUSPENDED";
    if (wasJustSuspended) {
        await deleteInstanceOnSuspension(updated.userId);
    }

    const wasReactivated =
        args.previousAccessStatus === "SUSPENDED" && updated.accessStatus === "ACTIVE";
    if (wasReactivated && updated.lastInstanceName) {
        await createInstanceOnReactivation(updated.userId, updated.lastInstanceName);
    }
}

// ---------------------------------------------------------------------------
// markUserAsPaidInternal
// ---------------------------------------------------------------------------

export async function markUserAsPaidInternal(userId: string) {
    const now = new Date();
    const existing = await db.userBilling.findUnique({ where: { userId } });

    await db.userBilling.upsert({
        where: { userId },
        create: {
            userId,
            currencyCode: "COP",
            billingStatus: "PAID",
            accessStatus: "ACTIVE",
            lastPaymentAt: now,
            graceDays: 0,
            serviceStartAt: now,
            serviceEndAt: null,
        },
        update: {
            billingStatus: "PAID",
            accessStatus: "ACTIVE",
            lastPaymentAt: now,
            suspendedAt: null,
            suspendedReason: null,
            serviceStartAt: existing?.serviceStartAt ?? now,
            serviceEndAt: null,
        },
    });

    await runStatusSideEffects({
        userId,
        previousBillingStatus: existing?.billingStatus ?? null,
        previousAccessStatus: existing?.accessStatus ?? null,
    });
}

// ---------------------------------------------------------------------------
// setUserBillingDueDateInternal
// ---------------------------------------------------------------------------

export async function setUserBillingDueDateInternal(userId: string, newDueDate: Date) {
    await db.userBilling.upsert({
        where: { userId },
        create: {
            userId,
            currencyCode: "COP",
            billingStatus: "PAID",
            accessStatus: "ACTIVE",
            dueDate: newDueDate,
            serviceEndsAt: newDueDate,
            graceDays: 0,
            lastReminderAt: null,
            lastReminderDueDate: null,
        },
        update: {
            dueDate: newDueDate,
            serviceEndsAt: newDueDate,
            lastReminderAt: null,
            lastReminderDueDate: null,
        },
    });
}

// ---------------------------------------------------------------------------
// createPaymentTransaction — crea el registro en FinanceTransaction
// ---------------------------------------------------------------------------

async function createPaymentTransaction(args: {
    userId: string;
    amount: number;
    currencyCode: string;
    source: PaymentSource;
    externalReference: string;
    notes?: string | null;
}) {
    // Busca cuenta por defecto del usuario; si no existe no crea la transacción
    // para no romper la constraint de accountId NOT NULL.
    const account = await db.financeAccount.findFirst({
        where: { userId: args.userId, isDefault: true },
        select: { id: true },
    });

    if (!account) {
        console.warn(
            `[billing-payment-internal] Sin cuenta por defecto para userId=${args.userId}. Transacción no registrada.`
        );
        return;
    }

    await db.financeTransaction.create({
        data: {
            userId: args.userId,
            type: "SALE",
            status: "ACTIVE",
            occurredAt: new Date(),
            amount: args.amount,
            currencyCode: args.currencyCode,
            accountId: account.id,
            title: "Pago confirmado",
            description: args.notes ?? null,
            paymentSource: args.source,
            externalReference: args.externalReference,
        },
    });
}

// ---------------------------------------------------------------------------
// confirmPaymentInternal — orquesta el flujo completo
// ---------------------------------------------------------------------------

export async function confirmPaymentInternal(
    input: ConfirmPaymentInput
): Promise<ConfirmPaymentResult> {
    const { clientUserId, amount, currencyCode, source, externalReference, notes } = input;

    // 1. Deduplicación: verificar que la referencia no haya sido procesada ya
    const existing = await db.financeTransaction.findUnique({
        where: { externalReference },
        select: { id: true },
    });
    if (existing) {
        return {
            success: true,
            message: "Pago ya procesado anteriormente.",
            alreadyProcessed: true,
        };
    }

    // 2. Verificar que el cliente existe
    const billing = await db.userBilling.findUnique({
        where: { userId: clientUserId },
        select: {
            dueDate: true,
            licenseDays: true,
            billingStatus: true,
            accessStatus: true,
        },
    });

    if (!billing) {
        const userExists = await db.user.findUnique({
            where: { id: clientUserId },
            select: { id: true },
        });
        if (!userExists) {
            return { success: false, message: "Cliente no encontrado." };
        }
    }

    // 3. Calcular nueva fecha de vencimiento
    const licenseDays = billing?.licenseDays ?? 30;
    const baseDueDate = billing?.dueDate ? new Date(billing.dueDate) : new Date();
    const now = new Date();
    // Si la dueDate actual ya venció, la nueva base es hoy
    const baseForCalculation = baseDueDate > now ? baseDueDate : now;
    const newDueDate = new Date(baseForCalculation);
    newDueDate.setDate(newDueDate.getDate() + licenseDays);

    // 4. Marcar como pagado y extender la fecha
    await markUserAsPaidInternal(clientUserId);
    await setUserBillingDueDateInternal(clientUserId, newDueDate);

    // 5. Registrar la transacción financiera
    await createPaymentTransaction({
        userId: clientUserId,
        amount,
        currencyCode,
        source,
        externalReference,
        notes,
    });

    return {
        success: true,
        message: "Pago confirmado exitosamente.",
        newDueDate: newDueDate.toISOString(),
    };
}
