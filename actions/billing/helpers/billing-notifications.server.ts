import { Prisma } from "@prisma/client";

import {
    resolveWhatsAppDispatcherLineByInstanceName,
    sendViaWhatsAppDispatcher,
    type WhatsAppDispatcherLine,
} from "@/actions/whatsapp-dispatcher";
import { listMetaTemplates, sendMetaTemplate } from "@/actions/channel-chat-actions";
import { db } from "@/lib/db";
import type { BillingStatus, BillingTemplateType, AccessStatus } from "@/types/billing";

import { buildBillingMessage, buildBillingMessageForRecord } from "../billing-message-templates";
import { fmtDateDDMMYYYY, fmtPriceLine } from "./billing-helpers";
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
                role: true,
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

export type BillingDispatcherConfig = WhatsAppDispatcherLine;

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
        licenseLabel: `*Licencia* ${billing.licenseDays ?? 30} días`,
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
        // Al reactivar, limpiar el aviso pre-eliminación para que un futuro
        // ciclo de vencimiento vuelva a avisar.
        preDeleteWarnedAt: isActivating ? null : undefined,
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
    const preferredInstanceName =
        process.env.BILLING_WHATSAPP_INSTANCE ||
        process.env.NOTIFICATIONS_WHATSAPP_INSTANCE ||
        "VERZAY_NOTIFICACIONES_wh";
    const line = await resolveWhatsAppDispatcherLineByInstanceName(preferredInstanceName);
    return line;
}

const META_BILLING_TEMPLATES: Partial<Record<BillingTemplateType, string>> = {
    REMINDER_3D: "servicio_vencer_3",
    DUE_TODAY: "servicio_vence_hoy",
    STATUS_SUSPENDED: "servicio_suspendido",
    STATUS_ACTIVE: "servicio_estado_actualizado",
};

function buildMetaBillingParams(
    billing: BillingUserRecord,
    template: BillingTemplateType,
    now: Date,
): string[] | null {
    const dueDate = billing.dueDate ? new Date(billing.dueDate) : null;
    const daysRemaining = getBillingDaysRemaining(dueDate, now);
    const days = typeof daysRemaining === "number" ? Math.abs(daysRemaining) : 0;
    const company = billing.user?.company || billing.user?.name || "Cliente";
    const fecha = dueDate ? fmtDateDDMMYYYY(dueDate) : "Sin fecha";
    const plan = billing.serviceName || "Plan Agente IA";
    const licencia = `${billing.licenseDays ?? 30} días`;
    const precio = fmtPriceLine({
        price: billing.price,
        currencyCode: billing.currencyCode || "COP",
        currencyFlag: billing.currencyCode === "USD" ? "US" : null,
    });
    const link = (billing.paymentNotes?.trim() || billing.paymentMethodLabel?.trim() || "-").trim();

    if (template === "STATUS_ACTIVE") {
        return [fecha, String(days), plan, licencia, precio, company];
    }

    if (template === "REMINDER_3D" || template === "DUE_TODAY" || template === "STATUS_SUSPENDED") {
        return [company, fecha, String(days), plan, licencia, precio, link];
    }

    return null;
}

async function sendMetaBillingTemplate(args: {
    dispatcher: BillingDispatcherConfig;
    billing: BillingUserRecord;
    template: BillingTemplateType;
    remoteJid: string;
    now: Date;
}): Promise<BillingSendResult | null> {
    if (args.dispatcher.provider !== "meta") return null;

    const templateName = META_BILLING_TEMPLATES[args.template];
    const params = buildMetaBillingParams(args.billing, args.template, args.now);
    if (!templateName || !params) return null;

    const templateList = await listMetaTemplates(args.dispatcher.instanceName);
    const metaTemplate = templateList.templates.find((item) => item.name === templateName);
    if (!templateList.success || !metaTemplate) {
        return {
            success: false,
            template: args.template,
            remoteJid: args.remoteJid,
            message: `La plantilla Meta "${templateName}" no esta activa o no se pudo cargar.`,
            error: "MISSING_META_TEMPLATE",
        };
    }

    const result = await sendMetaTemplate(
        args.dispatcher.instanceName,
        args.remoteJid,
        metaTemplate,
        params,
    );

    return {
        success: result.success,
        template: args.template,
        remoteJid: args.remoteJid,
        message: result.message,
        error: result.error,
    };
}

// Override editable por Verzay (SiteConfig). Solo aplica a las 5 plantillas que
// el reseller también puede personalizar; el resto usa el texto estándar.
async function loadPlatformBillingOverride(template: BillingTemplateType): Promise<string | null> {
    try {
        const c = await db.siteConfig.findUnique({
            where: { id: 1 },
            select: {
                billingMsgReminder: true,
                billingMsgDueToday: true,
                billingMsgOverdue: true,
                billingMsgSuspended: true,
                billingMsgDeleted: true,
            },
        });
        if (!c) return null;
        switch (template) {
            case "REMINDER_3D": return c.billingMsgReminder?.trim() || null;
            case "DUE_TODAY": return c.billingMsgDueToday?.trim() || null;
            case "EXPIRED": return c.billingMsgOverdue?.trim() || null;
            case "STATUS_SUSPENDED": return c.billingMsgSuspended?.trim() || null;
            case "ACCOUNT_DELETED": return c.billingMsgDeleted?.trim() || null;
            default: return null;
        }
    } catch {
        return null;
    }
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
    const metaResult = await sendMetaBillingTemplate({
        dispatcher,
        billing: args.billing,
        template: args.template,
        remoteJid,
        now,
    });
    if (metaResult) return metaResult;

    // Verzay puede editar sus mensajes de cobro desde /admin/notificaciones.
    // Si hay override para esta plantilla, se usa; si no, el texto estándar.
    const override = await loadPlatformBillingOverride(args.template);
    const text = override
        ? buildBillingMessageForRecord(args.billing, args.template, now, override)
        : buildBillingMessage(buildBillingMessageInput(args.billing, args.template, now));
    const history = {
        instanceName: dispatcher.instanceName,
        type: "notification" as const,
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
    };
    const result = await sendViaWhatsAppDispatcher({
        dispatcher,
        remoteJid,
        text,
        history,
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
                        events: ["MESSAGES_UPSERT", "CALL"],
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
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            enabled: args.enable,
            message: `Error al ${args.enable ? "activar" : "desactivar"} el agente.`,
            error: message,
        };
    }
}

// Motivo con el que se marca a los clientes suspendidos POR la cascada del
// reseller (para poder reactivarlos solo a ellos cuando el reseller pague).
const RESELLER_CASCADE_REASON = "Suspendido: el reseller no pagó su pack de licencias";

/**
 * Cascada de acceso del reseller a TODOS sus clientes.
 * - activate=false: suspende a todos sus clientes (status off, billing SUSPENDED,
 *   agente off). Es reversible (no borra instancias).
 * - activate=true: reactiva SOLO los que fueron suspendidos por esta cascada.
 */
async function cascadeResellerAccessToClients(resellerId: string, activate: boolean, now: Date) {
    if (activate) {
        const clients = await db.userBilling.findMany({
            where: {
                accessStatus: "SUSPENDED",
                suspendedReason: RESELLER_CASCADE_REASON,
                user: { demoResellerId: resellerId },
            },
            select: { userId: true },
        });
        for (const c of clients) {
            await db.user.update({ where: { id: c.userId }, data: { status: true } });
            await db.userBilling.updateMany({
                where: { userId: c.userId },
                data: { accessStatus: "ACTIVE", suspendedAt: null, suspendedReason: null },
            });
            await setUserBillingWebhookEnabled({ userId: c.userId, enable: true });
        }
    } else {
        const clients = await db.user.findMany({
            where: { demoResellerId: resellerId, status: true },
            select: { id: true },
        });
        for (const c of clients) {
            await db.user.update({ where: { id: c.id }, data: { status: false } });
            await db.userBilling.updateMany({
                where: { userId: c.id },
                data: { accessStatus: "SUSPENDED", suspendedAt: now, suspendedReason: RESELLER_CASCADE_REASON },
            });
            await setUserBillingWebhookEnabled({ userId: c.id, enable: false });
        }
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

    // Sincronizar user.status con el estado de acceso de billing
    await db.user.update({
        where: { id: updated.userId },
        data: { status: updated.accessStatus !== "SUSPENDED" },
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

    // Si el que cambió de estado es un RESELLER, propagar a sus clientes:
    // suspendido → suspender a todos; reactivado → reactivar a los que esta
    // misma cascada había suspendido.
    if (updated.user?.role === "reseller") {
        try {
            await cascadeResellerAccessToClients(updated.userId, updated.accessStatus !== "SUSPENDED", now);
        } catch (e) {
            console.error("[cascadeResellerAccessToClients]", e);
        }
    }

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
