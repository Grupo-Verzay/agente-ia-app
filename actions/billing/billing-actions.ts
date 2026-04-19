"use server";

import { Prisma } from "@prisma/client";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BillingUpsertInput, ResponseFormat } from "@/types/billing";
import { createInstanceInternal, deleteInstanceInternal } from "@/actions/api-action";

import {
    loadBillingDispatcherConfig,
    getBillingUserRecord,
    sendBillingStateChangeMessage,
    setUserBillingWebhookEnabled,
    syncUserBillingLifecycle,
} from "./helpers/billing-notifications.server";
import { serializeUserBilling, toDate } from "./helpers/billing-helpers";
import {
    assertBillingScope,
    normalizeCurrencyCode,
    normalizeGraceDays,
    normalizeLicenseDays,
    normalizeOptionalText,
    toDecimal,
} from "./helpers/billing-helpers.server";

const isProvided = (value: unknown) =>
    value !== null && value !== undefined && String(value).trim() !== "";

async function deleteInstanceOnSuspension(userId: string) {
    const deleteResult = await deleteInstanceInternal(userId);
    if (deleteResult.success && deleteResult.instanceName) {
        await db.userBilling.update({
            where: { userId },
            data: { lastInstanceName: deleteResult.instanceName },
        });
    }
    return deleteResult;
}

async function createInstanceOnReactivation(userId: string, instanceName: string) {
    const createResult = await createInstanceInternal(userId, instanceName);
    if (createResult.success) {
        await db.userBilling.update({
            where: { userId },
            data: { lastInstanceName: null },
        });
    }
    return createResult;
}

async function runManualStatusSideEffects(args: {
    userId: string;
    previousBillingStatus?: string | null;
    previousAccessStatus?: string | null;
    source: string;
}) {
    const updated = await getBillingUserRecord(args.userId);
    if (!updated) {
        return {
            billing: null,
            changed: false,
            notificationSent: false,
            notificationFailed: false,
            webhookFailed: false,
        };
    }

    const changed =
        updated.billingStatus !== (args.previousBillingStatus ?? null) ||
        updated.accessStatus !== (args.previousAccessStatus ?? null);

    if (!changed) {
        return {
            billing: updated,
            changed: false,
            notificationSent: false,
            notificationFailed: false,
            webhookFailed: false,
        };
    }

    const dispatcher = await loadBillingDispatcherConfig();
    const webhookResult = await setUserBillingWebhookEnabled({
        userId: updated.userId,
        enable: updated.billingStatus !== "UNPAID" || updated.accessStatus !== "SUSPENDED",
    });
    const notificationResult = await sendBillingStateChangeMessage({
        billing: updated,
        dispatcher,
        source: args.source,
    });

    if (!webhookResult.success && !webhookResult.skipped) {
        console.warn("[billing-actions:webhook]", webhookResult);
    }

    if (!notificationResult.success) {
        console.warn("[billing-actions:notification]", notificationResult);
    }

    const wasJustSuspended =
        args.previousAccessStatus !== "SUSPENDED" &&
        updated.accessStatus === "SUSPENDED";

    if (wasJustSuspended) {
        await deleteInstanceOnSuspension(updated.userId);
    }

    const wasReactivated =
        args.previousAccessStatus === "SUSPENDED" &&
        updated.accessStatus === "ACTIVE";

    if (wasReactivated && updated.lastInstanceName) {
        const createResult = await createInstanceInternal(updated.userId, updated.lastInstanceName);
        if (createResult.success) {
            await db.userBilling.update({
                where: { userId: updated.userId },
                data: { lastInstanceName: null },
            });
        }
    }

    return {
        billing: updated,
        changed: true,
        notificationSent: notificationResult.success,
        notificationFailed: !notificationResult.success,
        webhookFailed: !webhookResult.success && !webhookResult.skipped,
    };
}

export async function getUserBillingByUserId(
    userId: string
): Promise<ResponseFormat<any>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, userId);

        const billing = await db.userBilling.findUnique({
            where: { userId: scopedUserId },
        });

        return {
            success: true,
            message: billing ? "Billing encontrado." : "Cliente sin billing configurado.",
            data: serializeUserBilling(billing),
        };
    } catch (error: any) {
        console.error("[getUserBillingByUserId]", error);
        return {
            success: false,
            message: error?.message ?? "Error obteniendo billing.",
        };
    }
}

export async function upsertUserBillingConfig(
    input: BillingUpsertInput
): Promise<ResponseFormat<any>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, input?.userId);

        const price = toDecimal(input.price);
        if (isProvided(input.price) && !price) {
            return { success: false, message: "price invalido." };
        }
        if (price && price.lt(0)) {
            return { success: false, message: "price no puede ser negativo." };
        }

        const serviceStartAt = toDate(input.serviceStartAt);
        const serviceEndsAt = toDate(input.serviceEndsAt);

        if (isProvided(input.serviceStartAt) && !serviceStartAt) {
            return { success: false, message: "serviceStartAt invalida." };
        }
        if (isProvided(input.serviceEndsAt) && !serviceEndsAt) {
            return { success: false, message: "serviceEndsAt invalida." };
        }
        if (serviceStartAt && serviceEndsAt && serviceEndsAt < serviceStartAt) {
            return { success: false, message: "serviceEndsAt no puede ser menor a serviceStartAt." };
        }

        const graceDays = normalizeGraceDays(input.graceDays);
        const licenseDays = normalizeLicenseDays(input.licenseDays);
        const currencyCode = isProvided(input.currencyCode)
            ? normalizeCurrencyCode(input.currencyCode)
            : undefined;

        const data: Prisma.UserBillingUncheckedUpdateInput = {
            price,
            currencyCode,
            paymentMethodLabel: normalizeOptionalText(input.paymentMethodLabel, 120),
            paymentNotes: normalizeOptionalText(input.paymentNotes, 1000),
            graceDays,
            licenseDays,
            serviceName: normalizeOptionalText(input.serviceName, 120),
            notifyRemoteJid: normalizeOptionalText(input.notifyRemoteJid, 80),
            serviceStartAt: serviceStartAt ?? undefined,
            serviceEndsAt: serviceEndsAt ?? undefined,
        };

        const billing = await db.userBilling.upsert({
            where: { userId: scopedUserId },
            create: {
                userId: scopedUserId,
                price: data.price as any,
                currencyCode: (data.currencyCode as any) ?? "COP",
                paymentMethodLabel: (data.paymentMethodLabel as any) ?? null,
                paymentNotes: (data.paymentNotes as any) ?? null,
                graceDays: (data.graceDays as any) ?? 0,
                licenseDays: (data.licenseDays as any) ?? 30,
                serviceName: (data.serviceName as any) ?? null,
                notifyRemoteJid: (data.notifyRemoteJid as any) ?? null,
                serviceStartAt: (data.serviceStartAt as any) ?? null,
                serviceEndsAt: (data.serviceEndsAt as any) ?? null,
            },
            update: data,
        });

        const syncResult = await syncUserBillingLifecycle({
            userId: scopedUserId,
            source: "billing-config-update",
        });

        if (syncResult.stateChanged) {
            if (syncResult.billing?.accessStatus === "SUSPENDED") {
                await deleteInstanceOnSuspension(scopedUserId);
            } else if (billing.accessStatus === "SUSPENDED" && syncResult.billing?.accessStatus === "ACTIVE" && syncResult.billing.lastInstanceName) {
                await createInstanceOnReactivation(scopedUserId, syncResult.billing.lastInstanceName);
            }
        }

        const suffix = syncResult.stateChanged
            ? " Estados sincronizados con dueDate y graceDays."
            : "";

        return {
            success: true,
            message: `Billing actualizado.${suffix}`,
            data: syncResult.billing ?? billing,
        };
    } catch (error: any) {
        console.error("[upsertUserBillingConfig]", error);
        return { success: false, message: error?.message ?? "Error actualizando billing." };
    }
}

export async function setUserBillingDueDate(
    userId: string,
    dueDate: string | Date | null
): Promise<ResponseFormat<any>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, userId);

        const parsed = toDate(dueDate);
        if (dueDate && !parsed) {
            return { success: false, message: "dueDate invalida." };
        }

        const billing = await db.userBilling.upsert({
            where: { userId: scopedUserId },
            create: {
                userId: scopedUserId,
                dueDate: parsed,
                serviceEndsAt: parsed,
                currencyCode: "COP",
                billingStatus: "PAID",
                accessStatus: "ACTIVE",
                graceDays: 0,
            },
            update: {
                dueDate: parsed,
                serviceEndsAt: parsed,
                lastReminderDueDate: null,
                lastReminderAt: null,
            },
        });

        const syncResult = await syncUserBillingLifecycle({
            userId: scopedUserId,
            source: "billing-due-date-update",
        });

        if (syncResult.stateChanged) {
            if (syncResult.billing?.accessStatus === "SUSPENDED") {
                await deleteInstanceOnSuspension(scopedUserId);
            } else if (billing.accessStatus === "SUSPENDED" && syncResult.billing?.accessStatus === "ACTIVE" && syncResult.billing.lastInstanceName) {
                await createInstanceOnReactivation(scopedUserId, syncResult.billing.lastInstanceName);
            }
        }

        if (parsed && syncResult.stateChanged) {
            return {
                success: true,
                message: "Fecha de pago actualizada y estados sincronizados.",
                data: syncResult.billing ?? billing,
            };
        }

        return {
            success: true,
            message: "Fecha de pago actualizada.",
            data: syncResult.billing ?? billing,
        };
    } catch (error: any) {
        console.error("[setUserBillingDueDate]", error);
        return { success: false, message: error?.message ?? "Error actualizando dueDate." };
    }
}

export async function markUserAsPaid(
    userId: string
): Promise<ResponseFormat<any>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, userId);

        const now = new Date();
        const existing = await db.userBilling.findUnique({ where: { userId: scopedUserId } });

        await db.userBilling.upsert({
            where: { userId: scopedUserId },
            create: {
                userId: scopedUserId,
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

        const sideEffects = await runManualStatusSideEffects({
            userId: scopedUserId,
            previousBillingStatus: existing?.billingStatus ?? null,
            previousAccessStatus: existing?.accessStatus ?? null,
            source: "billing-mark-paid",
        });

        return {
            success: true,
            message: sideEffects.changed
                ? "Pago registrado. Servicio activo y cliente notificado."
                : "Pago registrado. Servicio activo.",
            data: sideEffects.billing,
        };
    } catch (error: any) {
        console.error("[markUserAsPaid]", error);
        return { success: false, message: error?.message ?? "Error marcando pago." };
    }
}

export async function markUserAsUnpaid(
    userId: string
): Promise<ResponseFormat<any>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, userId);
        const existing = await db.userBilling.findUnique({ where: { userId: scopedUserId } });

        await db.userBilling.upsert({
            where: { userId: scopedUserId },
            create: {
                userId: scopedUserId,
                currencyCode: "COP",
                billingStatus: "UNPAID",
                accessStatus: "ACTIVE",
                graceDays: 0,
            },
            update: {
                billingStatus: "UNPAID",
                accessStatus: "ACTIVE",
            },
        });

        const sideEffects = await runManualStatusSideEffects({
            userId: scopedUserId,
            previousBillingStatus: existing?.billingStatus ?? null,
            previousAccessStatus: existing?.accessStatus ?? null,
            source: "billing-mark-unpaid",
        });

        return {
            success: true,
            message: sideEffects.changed
                ? "Estado actualizado: NO PAGADO. Cliente notificado."
                : "Estado actualizado: NO PAGADO.",
            data: sideEffects.billing,
        };
    } catch (error: any) {
        console.error("[markUserAsUnpaid]", error);
        return { success: false, message: error?.message ?? "Error marcando no pagado." };
    }
}

export async function suspendUserService(
    userId: string,
    reason?: string | null
): Promise<ResponseFormat<any>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, userId);
        const normalizedReason = normalizeOptionalText(reason, 180);

        const now = new Date();
        const existing = await db.userBilling.findUnique({ where: { userId: scopedUserId } });

        await db.userBilling.upsert({
            where: { userId: scopedUserId },
            create: {
                userId: scopedUserId,
                currencyCode: "COP",
                billingStatus: "UNPAID",
                accessStatus: "SUSPENDED",
                suspendedAt: now,
                suspendedReason: normalizedReason ?? "Suspendido manualmente",
                graceDays: 0,
                serviceEndAt: now,
            },
            update: {
                billingStatus: "UNPAID",
                accessStatus: "SUSPENDED",
                suspendedAt: now,
                suspendedReason: normalizedReason ?? "Suspendido manualmente",
                serviceEndAt: now,
            },
        });

        const sideEffects = await runManualStatusSideEffects({
            userId: scopedUserId,
            previousBillingStatus: existing?.billingStatus ?? null,
            previousAccessStatus: existing?.accessStatus ?? null,
            source: "billing-suspend-service",
        });

        return {
            success: true,
            message: sideEffects.changed
                ? "Servicio suspendido y cliente notificado."
                : "Servicio suspendido.",
            data: sideEffects.billing,
        };
    } catch (error: any) {
        console.error("[suspendUserService]", error);
        return { success: false, message: error?.message ?? "Error suspendiendo servicio." };
    }
}

export async function activateUserService(
    userId: string
): Promise<ResponseFormat<any>> {
    try {
        const me = await currentUser();
        const scopedUserId = await assertBillingScope(me ?? {}, userId);

        const now = new Date();
        const existing = await db.userBilling.findUnique({ where: { userId: scopedUserId } });

        await db.userBilling.upsert({
            where: { userId: scopedUserId },
            create: {
                userId: scopedUserId,
                currencyCode: "COP",
                billingStatus: "PAID",
                accessStatus: "ACTIVE",
                graceDays: 0,
                serviceStartAt: now,
                serviceEndAt: null,
            },
            update: {
                billingStatus: "PAID",
                accessStatus: "ACTIVE",
                suspendedAt: null,
                suspendedReason: null,
                serviceStartAt: existing?.serviceStartAt ?? now,
                serviceEndAt: null,
            },
        });

        const sideEffects = await runManualStatusSideEffects({
            userId: scopedUserId,
            previousBillingStatus: existing?.billingStatus ?? null,
            previousAccessStatus: existing?.accessStatus ?? null,
            source: "billing-activate-service",
        });

        return {
            success: true,
            message: sideEffects.changed
                ? "Servicio activado y cliente notificado."
                : "Servicio activado.",
            data: sideEffects.billing,
        };
    } catch (error: any) {
        console.error("[activateUserService]", error);
        return { success: false, message: error?.message ?? "Error activando servicio." };
    }
}

export async function toggleUserStatus(
    userId: string,
    enable: boolean
): Promise<ResponseFormat<{ status: boolean }>> {
    try {
        const me = await currentUser();
        if (!me) return { success: false, message: "No autorizado." };
        await assertBillingScope(me, userId);

        const updated = await db.user.update({
            where: { id: userId },
            data: { status: enable },
            select: { status: true },
        });

        return {
            success: true,
            message: enable ? "Usuario activado." : "Usuario desactivado.",
            data: { status: updated.status },
        };
    } catch (error: any) {
        console.error("[toggleUserStatus]", error);
        return { success: false, message: error?.message ?? "Error actualizando estado del usuario." };
    }
}
