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
// Validación de monto contra el precio configurado del cliente
// ---------------------------------------------------------------------------

/**
 * Tolerancia de redondeo permitida al comparar el monto del comprobante contra
 * el precio configurado (2%). El sobrepago siempre se acepta.
 */
const RECEIPT_AMOUNT_TOLERANCE = 0.02;

/**
 * Verifica que el monto del comprobante coincida con el precio configurado del
 * cliente en /panel/client-billing. Se acepta un pago igual o mayor (con
 * tolerancia de redondeo); un pago menor o en otra moneda no renueva y se
 * envía a revisión manual.
 */
function checkReceiptAmountMatches(args: {
    paidAmount: number;
    paidCurrency: string;
    expectedAmount: number;
    expectedCurrency: string;
}): { ok: true } | { ok: false; reason: string } {
    const paidCurrency = args.paidCurrency.toUpperCase();
    const expectedCurrency = args.expectedCurrency.toUpperCase();

    // Sin precio válido configurado no hay contra qué comparar.
    if (!Number.isFinite(args.expectedAmount) || args.expectedAmount <= 0) {
        return { ok: true };
    }

    // La moneda del comprobante debe coincidir con la configurada; no
    // convertimos divisas automáticamente.
    if (paidCurrency !== expectedCurrency) {
        return {
            ok: false,
            reason: `Moneda del comprobante (${paidCurrency}) no coincide con la configurada (${expectedCurrency}). Requiere revisión manual.`,
        };
    }

    // Se acepta pago igual o mayor (con tolerancia). El pago insuficiente no
    // renueva.
    const minAcceptable = args.expectedAmount * (1 - RECEIPT_AMOUNT_TOLERANCE);
    if (args.paidAmount < minAcceptable) {
        return {
            ok: false,
            reason: `Monto del comprobante (${args.paidAmount} ${paidCurrency}) es menor al precio configurado (${args.expectedAmount} ${expectedCurrency}). Requiere revisión manual.`,
        };
    }

    return { ok: true };
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
            price: true,
            currencyCode: true,
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

    // 2.b. Validación de monto para comprobantes automáticos (WhatsApp).
    // Solo renovamos automáticamente si el monto coincide con el precio
    // configurado del cliente. Los pagos por pasarela traen el monto exacto y
    // los MANUAL los decide el admin, así que solo se valida el comprobante.
    if (source === "WHATSAPP_RECEIPT" && billing?.price != null) {
        const amountCheck = checkReceiptAmountMatches({
            paidAmount: amount,
            paidCurrency: currencyCode,
            expectedAmount: Number(billing.price),
            expectedCurrency: billing.currencyCode ?? "COP",
        });
        if (!amountCheck.ok) {
            return { success: false, message: amountCheck.reason };
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

    // 6. Comisión de afiliado: si el cliente fue referido, generar comisión pendiente
    await createAffiliateCommissionIfApplies({
        referredUserId: clientUserId,
        amount,
        currencyCode,
        paymentRef: externalReference,
    }).catch(() => null);

    return {
        success: true,
        message: "Pago confirmado exitosamente.",
        newDueDate: newDueDate.toISOString(),
    };
}

// ---------------------------------------------------------------------------
// createAffiliateCommissionIfApplies — uso interno
// ---------------------------------------------------------------------------

async function createAffiliateCommissionIfApplies(args: {
    referredUserId: string;
    amount: number;
    currencyCode: string;
    paymentRef: string;
}) {
    const referral = await db.affiliateReferral.findUnique({
        where: { referredUserId: args.referredUserId },
        include: { affiliate: { select: { id: true, commissionRate: true } } },
    });
    if (!referral) return;

    const commissionAmount = Math.round(args.amount * referral.affiliate.commissionRate * 100) / 100;
    if (commissionAmount <= 0) return;

    await db.affiliateCommission.create({
        data: {
            affiliateId: referral.affiliateId,
            referralId: referral.id,
            amount: commissionAmount,
            currencyCode: args.currencyCode,
            status: "pending",
            paymentRef: args.paymentRef,
        },
    });
}
