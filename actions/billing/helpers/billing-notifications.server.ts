import { Prisma } from "@prisma/client";

import { sendingMessages } from "@/actions/sending-messages-actions";
import { db } from "@/lib/db";
import { ADMIN_USER_ID } from "@/types/generic";
import type { BillingStatus, BillingTemplateType, AccessStatus } from "@/types/billing";

import { buildBillingMessage } from "../billing-message-templates";
import {
    evaluateBillingLifecycle,
    getBillingDaysRemaining,
    type BillingLifecycleEvaluation,
} from "./billing-lifecycle";
import { normalizeWhatsAppJid } from "./billing-helpers";

const billingUserRecordArgs = Prisma.validator<Prisma.UserBillingDefaultArgs>()({
    include: {
        user: {
            select: {
                id: true,
                name: true,
                company: true,
                notificationNumber: true,
                plan: true,
                webhookUrl: true,
                apiKey: {
                    select: {
                        url: true,
                    },
                },
                instancias: {
                    select: {
                        instanceId: true,
                        instanceName: true,
                        instanceType: true,
                    },
                },
            },
        },
    },
});

export type BillingUserRecord = Prisma.UserBillingGetPayload<typeof billingUserRecordArgs>;

export type BillingDispatcherConfig = {
    id: string;
    notificationNumber: string | null;
    instanceId: string;
    instanceName: string;
    serverUrl: string;
};

export type BillingSendResult = {
    success: boolean;
    template: BillingTemplateType;
    remoteJid?: string;
    message: string;
    error?: string;
};

export type BillingWebhookToggleResult = {
    success: boolean;
    enabled: boolean;
    skipped?: boolean;
    message: string;
    error?: string;
};

export type BillingLifecycleSyncResult = {
    success: boolean;
    message: string;
    billing: BillingUserRecord | null;
    evaluation: BillingLifecycleEvaluation | null;
    stateChanged: boolean;
    webhookResult?: BillingWebhookToggleResult | null;
    notificationResult?: BillingSendResult | null;
};

function buildSendTextUrl(instanceName: string, serverUrl: string): string {
    const normalizedBaseUrl = /^https?:\/\//i.test(serverUrl)
        ? serverUrl.replace(/\/+$/, "")
        : `https://${serverUrl.replace(/\/+$/, "")}`;

    return `${normalizedBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
}

function pickBillingStateTemplate(args: {
    billingStatus?: BillingStatus | null;
    accessStatus?: AccessStatus | null;
}): BillingTemplateType {
    if (args.accessStatus === "SUSPENDED") return "STATUS_SUSPENDED";
    if (args.billingStatus === "UNPAID") return "STATUS_PENDING";
    return "STATUS_ACTIVE";
}

function buildBillingMessageInput(
    billing: BillingUserRecord,
    template: BillingTemplateType,
    now = new Date()
) {
    const dueDate = billing.dueDate ? new Date(billing.dueDate) : null;
    const daysRemaining = getBillingDaysRemaining(dueDate, now);
    const paymentText =
        (billing.paymentNotes?.trim() || billing.paymentMethodLabel?.trim() || "").trim() || "-";

    return {
        type: template,
        dueDate,
        daysRemaining,
        planLabel: billing.serviceName ? `*Plan* ${billing.serviceName}` : "Plan Agente IA",
        licenseLabel: `*Licencia* ${billing.licenseDays ?? 30} dias`,
        price: billing.price,
        currencyCode: billing.currencyCode || "COP",
        currencyFlag: billing.currencyCode === "USD" ? "US" : null,
        paymentLinkOrText: paymentText,
        companyName: billing.user?.company || billing.user?.name || "Cliente",
        billingStatus: billing.billingStatus,
        accessStatus: billing.accessStatus,
    };
}

function resolveBillingRemoteJid(
    billing: BillingUserRecord,
    dispatcher?: BillingDispatcherConfig | null
): string {
    const rawTarget = (
        billing.notifyRemoteJid?.trim() ||
        billing.user?.notificationNumber?.trim() ||
        dispatcher?.notificationNumber?.trim() ||
        ""
    ).trim();

    return normalizeWhatsAppJid(rawTarget);
}

function buildStatusUpdateData(
    current: BillingUserRecord,
    evaluation: BillingLifecycleEvaluation,
    now: Date
): Prisma.UserBillingUncheckedUpdateInput {
    const isSuspending = evaluation.nextAccessStatus === "SUSPENDED";
    const isActivating = evaluation.nextAccessStatus === "ACTIVE";

    return {
        billingStatus: evaluation.nextBillingStatus ?? current.billingStatus,
        accessStatus: evaluation.nextAccessStatus ?? current.accessStatus,
        suspendedAt: isSuspending ? current.suspendedAt ?? now : null,
        suspendedReason: isSuspending ? "Vencido fuera de los dias de gracia" : null,
        serviceEndAt: isSuspending ? current.serviceEndAt ?? now : null,
        serviceStartAt: isActivating ? current.serviceStartAt ?? now : current.serviceStartAt ?? undefined,
    };
}

export async function getBillingUserRecord(
    userId: string
): Promise<BillingUserRecord | null> {
    return db.userBilling.findUnique({
        where: { userId },
        ...billingUserRecordArgs,
    });
}

export async function loadBillingDispatcherConfig(): Promise<BillingDispatcherConfig | null> {
    const dispatcherUser = await db.user.findUnique({
        where: { id: ADMIN_USER_ID },
        select: {
            id: true,
            notificationNumber: true,
            apiKey: { select: { url: true } },
            instancias: {
                select: {
                    instanceId: true,
                    instanceName: true,
                    instanceType: true,
                },
            },
        },
    });

    if (!dispatcherUser) return null;

    const serverUrl = dispatcherUser.apiKey?.url?.trim();
    const instance =
        dispatcherUser.instancias.find((item) => item.instanceType === "Whatsapp") ??
        dispatcherUser.instancias[0];

    if (!serverUrl || !instance?.instanceId || !instance.instanceName) {
        return null;
    }

    return {
        id: dispatcherUser.id,
        notificationNumber: dispatcherUser.notificationNumber ?? null,
        instanceId: instance.instanceId,
        instanceName: instance.instanceName,
        serverUrl,
    };
}

export async function sendBillingTemplateMessage(args: {
    billing: BillingUserRecord;
    template: BillingTemplateType;
    dispatcher?: BillingDispatcherConfig | null;
    now?: Date;
    source?: string;
}): Promise<BillingSendResult> {
    const dispatcher = args.dispatcher ?? (await loadBillingDispatcherConfig());

    if (!dispatcher) {
        return {
            success: false,
            template: args.template,
            message: "Dispatcher de billing sin configuracion completa.",
            error: "MISSING_DISPATCHER",
        };
    }

    const remoteJid = resolveBillingRemoteJid(args.billing, dispatcher);
    if (!remoteJid) {
        return {
            success: false,
            template: args.template,
            message: "No existe numero destino para la notificacion de billing.",
            error: "MISSING_REMOTE_JID",
        };
    }

    const now = args.now ?? new Date();
    const text = buildBillingMessage(buildBillingMessageInput(args.billing, args.template, now));
    const result = await sendingMessages({
        url: buildSendTextUrl(dispatcher.instanceName, dispatcher.serverUrl),
        apikey: dispatcher.instanceId,
        remoteJid,
        text,
        history: {
            instanceName: dispatcher.instanceName,
            type: "notification",
            additionalKwargs: {
                kind: "billing",
                source: args.source ?? "billing",
                template: args.template,
                userBillingId: args.billing.id,
                userId: args.billing.userId,
            },
            responseMetadata: {
                dispatcherUserId: dispatcher.id,
                template: args.template,
            },
        },
    });

    return {
        success: result.success,
        template: args.template,
        remoteJid,
        message: result.message,
        error: result.error,
    };
}

export async function sendBillingStateChangeMessage(args: {
    billing: BillingUserRecord;
    dispatcher?: BillingDispatcherConfig | null;
    now?: Date;
    source?: string;
}): Promise<BillingSendResult> {
    return sendBillingTemplateMessage({
        billing: args.billing,
        template: pickBillingStateTemplate({
            billingStatus: args.billing.billingStatus,
            accessStatus: args.billing.accessStatus,
        }),
        dispatcher: args.dispatcher,
        now: args.now,
        source: args.source ?? "billing-status",
    });
}

export async function setUserBillingWebhookEnabled(args: {
    userId: string;
    enable: boolean;
}): Promise<BillingWebhookToggleResult> {
    const billing = await getBillingUserRecord(args.userId);
    const webhookUrl = billing?.user?.webhookUrl?.trim();
    const serverUrl = billing?.user?.apiKey?.url?.trim();
    const instance =
        billing?.user?.instancias.find((item) => item.instanceType === "Whatsapp") ??
        billing?.user?.instancias[0];

    if (!billing) {
        return {
            success: false,
            enabled: args.enable,
            skipped: true,
            message: "No se encontro billing para sincronizar el agente.",
            error: "MISSING_BILLING",
        };
    }

    if (!webhookUrl || !serverUrl || !instance?.instanceId || !instance.instanceName) {
        return {
            success: false,
            enabled: args.enable,
            skipped: true,
            message: "El usuario no tiene configuracion completa para sincronizar el agente.",
            error: "MISSING_WEBHOOK_CONFIG",
        };
    }

    try {
        const response = await fetch(
            `https://${serverUrl}/webhook/set/${instance.instanceName}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: instance.instanceId,
                },
                body: JSON.stringify({
                    webhook: {
                        enabled: args.enable,
                        url: webhookUrl,
                        base64: true,
                        events: ["MESSAGES_UPSERT"],
                    },
                }),
                cache: "no-store",
            }
        );

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            const detail = contentType?.includes("application/json")
                ? JSON.stringify(await response.json().catch(() => ({})))
                : await response.text().catch(() => "");

            return {
                success: false,
                enabled: args.enable,
                message: `No se pudo ${args.enable ? "activar" : "desactivar"} el agente.`,
                error: detail || `HTTP_${response.status}`,
            };
        }

        return {
            success: true,
            enabled: args.enable,
            message: `Agente ${args.enable ? "activado" : "desactivado"} correctamente.`,
        };
    } catch (error: any) {
        return {
            success: false,
            enabled: args.enable,
            message: `Error al ${args.enable ? "activar" : "desactivar"} el agente.`,
            error: error?.message ?? String(error),
        };
    }
}

export async function syncUserBillingLifecycle(args: {
    userId: string;
    now?: Date;
    dispatcher?: BillingDispatcherConfig | null;
    source?: string;
    sendStateChangeMessage?: boolean;
    syncWebhook?: boolean;
}): Promise<BillingLifecycleSyncResult> {
    const now = args.now ?? new Date();
    const current = await getBillingUserRecord(args.userId);

    if (!current) {
        return {
            success: false,
            message: "Billing no encontrado.",
            billing: null,
            evaluation: null,
            stateChanged: false,
        };
    }

    const evaluation = evaluateBillingLifecycle(current, now);
    if (!evaluation.hasStateChange) {
        return {
            success: true,
            message: "Sin cambios de estado para aplicar.",
            billing: current,
            evaluation,
            stateChanged: false,
        };
    }

    const updated = await db.userBilling.update({
        where: { id: current.id },
        data: buildStatusUpdateData(current, evaluation, now),
        ...billingUserRecordArgs,
    });

    const resolvedDispatcher = args.dispatcher ?? (await loadBillingDispatcherConfig());
    const webhookResult = args.syncWebhook === false
        ? null
        : await setUserBillingWebhookEnabled({
            userId: updated.userId,
            enable: updated.billingStatus !== "UNPAID" || updated.accessStatus !== "SUSPENDED",
        });
    const notificationResult = args.sendStateChangeMessage === false
        ? null
        : await sendBillingStateChangeMessage({
            billing: updated,
            dispatcher: resolvedDispatcher,
            now,
            source: args.source ?? "billing-sync",
        });

    return {
        success: true,
        message: "Estados de billing sincronizados.",
        billing: updated,
        evaluation: evaluateBillingLifecycle(updated, now),
        stateChanged: true,
        webhookResult,
        notificationResult,
    };
}
