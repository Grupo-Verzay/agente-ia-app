"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SERVER_TIME_ZONE } from "@/lib/utils";
import { endOfDay, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { ResponseFormat, SOON_DAYS_BILLING } from "@/types/billing";
import { deleteInstanceInternal } from "@/actions/api-action";
import { assertAdminOrReseller } from "./helpers/billing-helpers.server";
import {
    evaluateBillingLifecycle,
    getBillingDaysRemaining,
} from "./helpers/billing-lifecycle";
import {
    loadBillingDispatcherConfig,
    sendBillingTemplateMessage,
    syncUserBillingLifecycle,
} from "./helpers/billing-notifications.server";

type BillingJobLogEntry = {
    at: string;
    level: "INFO" | "WARN" | "ERROR";
    message: string;
    userBillingId?: string;
    userId?: string;
    template?: string;
};

type BillingCreatedItem = {
    userBillingId: string;
    userId: string;
    name: string;
    plan?: string | null;
    remoteJid: string;
    template: string;
    sentAt: string;
    dueDateYmd: string;
    daysRemaining: number | null;
};

type BillingSkippedItem = {
    userBillingId: string;
    userId: string;
    name: string;
    template?: string;
    reason: string;
};

type BillingDebtorItem = {
    userBillingId: string;
    userId: string;
    name: string;
    plan?: string | null;
    dueDateYmd: string;
    daysRemaining: number;
    graceDays: number;
    accessStatus: string;
    billingStatus: string;
    lastReminderAt?: string | null;
};

type BillingMessageReportItem = {
    userBillingId: string;
    userId: string;
    name: string;
    remoteJid: string;
    template: string;
    kind: "STATE_CHANGE" | "DAILY_REMINDER";
    success: boolean;
    sentAt: string;
    error?: string | null;
};

type BillingReport = {
    ranAt: string;
    timeZone: string;
    candidates: number;
    created: BillingCreatedItem[];
    skipped: BillingSkippedItem[];
    debtors: BillingDebtorItem[];
    messages: {
        sentToday: number;
        items: BillingMessageReportItem[];
    };
};

type BillingJobResult = ResponseFormat<{
    attempted: number;
    enqueued: number;
    sent: number;
    suspendedApplied: number;
    errors: number;
    logs: BillingJobLogEntry[];
    report: BillingReport;
}>;

function buildEmptyReport(now: Date): BillingReport {
    return {
        ranAt: now.toISOString(),
        timeZone: SERVER_TIME_ZONE,
        candidates: 0,
        created: [],
        skipped: [],
        debtors: [],
        messages: {
            sentToday: 0,
            items: [],
        },
    };
}

function formatBillingDate(date: Date): string {
    return format(toZonedTime(date, SERVER_TIME_ZONE), "yyyy-MM-dd");
}

export async function runBillingDailyJobInternal(requireAuth: boolean): Promise<BillingJobResult> {
    const now = new Date();
    const emptyReport = buildEmptyReport(now);

    try {
        const logs: BillingJobLogEntry[] = [];
        const created: BillingCreatedItem[] = [];
        const skipped: BillingSkippedItem[] = [];
        const sentItems: BillingMessageReportItem[] = [];

        const pushLog = (entry: BillingJobLogEntry) => {
            logs.push(entry);
            const payload: Record<string, string> = {
                at: entry.at,
                level: entry.level,
                message: entry.message,
            };

            if (entry.userBillingId) payload.userBillingId = entry.userBillingId;
            if (entry.userId) payload.userId = entry.userId;
            if (entry.template) payload.template = entry.template;

            if (entry.level === "ERROR") {
                console.error("[billing-job]", payload);
                return;
            }

            if (entry.level === "WARN") {
                console.warn("[billing-job]", payload);
                return;
            }

            console.info("[billing-job]", payload);
        };

        if (requireAuth) {
            const me = await currentUser();
            if (!me) {
                return {
                    success: false,
                    message: "No autorizado.",
                    data: {
                        attempted: 0,
                        enqueued: 0,
                        sent: 0,
                        suspendedApplied: 0,
                        errors: 1,
                        logs: [
                            {
                                at: now.toISOString(),
                                level: "ERROR",
                                message: "No autorizado para ejecutar job de billing.",
                            },
                        ],
                        report: emptyReport,
                    },
                };
            }

            assertAdminOrReseller(me.role);
        }

        const dispatcher = await loadBillingDispatcherConfig();
        if (!dispatcher) {
            pushLog({
                at: now.toISOString(),
                level: "ERROR",
                message: "El dispatcher de billing no tiene configuracion completa.",
            });

            return {
                success: false,
                message: "Dispatcher sin configuracion completa de envio.",
                data: {
                    attempted: 0,
                    enqueued: 0,
                    sent: 0,
                    suspendedApplied: 0,
                    errors: 1,
                    logs,
                    report: emptyReport,
                },
            };
        }

        const candidates = await db.userBilling.findMany({
            where: {
                user: {
                    status: true,
                },
                dueDate: {
                    not: null,
                    lte: endOfDay(
                        new Date(now.getTime() + SOON_DAYS_BILLING * 24 * 60 * 60 * 1000)
                    ),
                },
            },
            select: {
                id: true,
                userId: true,
            },
        });

        let attempted = 0;
        let sent = 0;
        let errors = 0;
        let suspendedApplied = 0;

        pushLog({
            at: now.toISOString(),
            level: "INFO",
            message: `Candidatos cargados: ${candidates.length}.`,
        });

        for (const candidate of candidates) {
            try {
                const syncResult = await syncUserBillingLifecycle({
                    userId: candidate.userId,
                    now,
                    dispatcher,
                    source: "billing-cron-state",
                });

                if (!syncResult.success || !syncResult.billing || !syncResult.evaluation) {
                    skipped.push({
                        userBillingId: candidate.id,
                        userId: candidate.userId,
                        name: "Cliente",
                        reason: "SYNC_FAILED",
                    });
                    if (!syncResult.success) errors++;
                    pushLog({
                        at: new Date().toISOString(),
                        level: "WARN",
                        message: syncResult.message,
                        userBillingId: candidate.id,
                        userId: candidate.userId,
                    });
                    continue;
                }

                const billing = syncResult.billing;
                const evaluation = syncResult.evaluation;
                const candidateName = billing.user?.name || billing.user?.company || "Cliente";

                if (syncResult.stateChanged && billing.accessStatus === "SUSPENDED") {
                    suspendedApplied++;

                    try {
                        const deleteResult = await deleteInstanceInternal(billing.userId);
                        if (deleteResult.success && deleteResult.instanceName) {
                            await db.userBilling.update({
                                where: { userId: billing.userId },
                                data: { lastInstanceName: deleteResult.instanceName },
                            });
                            pushLog({
                                at: new Date().toISOString(),
                                level: "INFO",
                                message: `Instancia de Evolution eliminada al suspender: ${deleteResult.instanceName}.`,
                                userBillingId: billing.id,
                                userId: billing.userId,
                            });
                        } else if (!deleteResult.success && deleteResult.message !== "El usuario no tiene ninguna instancia activa.") {
                            pushLog({
                                at: new Date().toISOString(),
                                level: "WARN",
                                message: `No se pudo eliminar la instancia de Evolution: ${deleteResult.message}`,
                                userBillingId: billing.id,
                                userId: billing.userId,
                            });
                        }
                    } catch (evoErr: any) {
                        pushLog({
                            at: new Date().toISOString(),
                            level: "WARN",
                            message: `Error inesperado al eliminar instancia de Evolution: ${evoErr?.message}`,
                            userBillingId: billing.id,
                            userId: billing.userId,
                        });
                    }
                }

                if (syncResult.webhookResult && !syncResult.webhookResult.success && !syncResult.webhookResult.skipped) {
                    pushLog({
                        at: new Date().toISOString(),
                        level: "WARN",
                        message: syncResult.webhookResult.message,
                        userBillingId: billing.id,
                        userId: billing.userId,
                    });
                }

                if (syncResult.notificationResult) {
                    attempted++;

                    if (syncResult.notificationResult.success) {
                        sent++;
                        sentItems.push({
                            userBillingId: billing.id,
                            userId: billing.userId,
                            name: candidateName,
                            remoteJid: syncResult.notificationResult.remoteJid ?? "",
                            template: syncResult.notificationResult.template,
                            kind: "STATE_CHANGE",
                            success: true,
                            sentAt: new Date().toISOString(),
                            error: null,
                        });
                    } else {
                        errors++;
                        pushLog({
                            at: new Date().toISOString(),
                            level: "ERROR",
                            message: syncResult.notificationResult.message,
                            userBillingId: billing.id,
                            userId: billing.userId,
                            template: syncResult.notificationResult.template,
                        });
                    }
                }

                const template = evaluation.reminderTemplate;
                if (!template) {
                    skipped.push({
                        userBillingId: billing.id,
                        userId: billing.userId,
                        name: candidateName,
                        reason: "NO_TEMPLATE",
                    });
                    continue;
                }

                if (evaluation.shouldSkipReminderToday) {
                    skipped.push({
                        userBillingId: billing.id,
                        userId: billing.userId,
                        name: candidateName,
                        template,
                        reason: "ANTI_SPAM_SAME_DAY",
                    });
                    pushLog({
                        at: new Date().toISOString(),
                        level: "INFO",
                        message: "Omitido por anti-spam del mismo dia y mismo ciclo.",
                        userBillingId: billing.id,
                        userId: billing.userId,
                        template,
                    });
                    continue;
                }

                attempted++;

                const reminderResult = await sendBillingTemplateMessage({
                    billing,
                    template,
                    dispatcher,
                    now,
                    source: "billing-cron-reminder",
                });

                if (!reminderResult.success) {
                    errors++;
                    skipped.push({
                        userBillingId: billing.id,
                        userId: billing.userId,
                        name: candidateName,
                        template,
                        reason: reminderResult.error ?? "SEND_FAILED",
                    });
                    pushLog({
                        at: new Date().toISOString(),
                        level: "ERROR",
                        message: reminderResult.message,
                        userBillingId: billing.id,
                        userId: billing.userId,
                        template,
                    });
                    continue;
                }

                await db.userBilling.update({
                    where: { id: billing.id },
                    data: {
                        lastReminderAt: now,
                        lastReminderDueDate: evaluation.dueDate,
                    },
                });

                sent++;
                created.push({
                    userBillingId: billing.id,
                    userId: billing.userId,
                    name: candidateName,
                    plan: billing.user?.plan ?? null,
                    remoteJid: reminderResult.remoteJid ?? "",
                    template,
                    sentAt: new Date().toISOString(),
                    dueDateYmd: evaluation.dueDate ? formatBillingDate(evaluation.dueDate) : "",
                    daysRemaining: evaluation.daysRemaining,
                });
                sentItems.push({
                    userBillingId: billing.id,
                    userId: billing.userId,
                    name: candidateName,
                    remoteJid: reminderResult.remoteJid ?? "",
                    template,
                    kind: "DAILY_REMINDER",
                    success: true,
                    sentAt: new Date().toISOString(),
                    error: null,
                });

                pushLog({
                    at: new Date().toISOString(),
                    level: "INFO",
                    message: "Notificacion diaria de billing enviada.",
                    userBillingId: billing.id,
                    userId: billing.userId,
                    template,
                });
            } catch (error: any) {
                errors++;
                skipped.push({
                    userBillingId: candidate.id,
                    userId: candidate.userId,
                    name: "Cliente",
                    reason: "INTERNAL_ERROR",
                });
                pushLog({
                    at: new Date().toISOString(),
                    level: "ERROR",
                    message: error?.message ?? "Error no controlado en iteracion del job.",
                    userBillingId: candidate.id,
                    userId: candidate.userId,
                });
            }
        }

        const debtorsRaw = await db.userBilling.findMany({
            where: {
                dueDate: { not: null },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        company: true,
                        plan: true,
                    },
                },
            },
            orderBy: { dueDate: "asc" },
            take: 300,
        });

        const debtors: BillingDebtorItem[] = [];
        for (const item of debtorsRaw) {
            const dueDate = item.dueDate ? new Date(item.dueDate) : null;
            const daysRemaining = getBillingDaysRemaining(dueDate, now);

            if (!dueDate || daysRemaining === null || daysRemaining >= 0) {
                continue;
            }

            const evaluation = evaluateBillingLifecycle(item, now);
            debtors.push({
                userBillingId: item.id,
                userId: item.userId,
                name: item.user?.name || item.user?.company || "Cliente",
                plan: item.user?.plan ?? null,
                dueDateYmd: formatBillingDate(dueDate),
                daysRemaining,
                graceDays: evaluation.graceDays,
                accessStatus: item.accessStatus,
                billingStatus: item.billingStatus,
                lastReminderAt: item.lastReminderAt ? item.lastReminderAt.toISOString() : null,
            });
        }

        const report: BillingReport = {
            ranAt: new Date().toISOString(),
            timeZone: SERVER_TIME_ZONE,
            candidates: candidates.length,
            created,
            skipped,
            debtors,
            messages: {
                sentToday: sentItems.length,
                items: sentItems,
            },
        };

        pushLog({
            at: new Date().toISOString(),
            level: "INFO",
            message: `Resumen job billing: attempted=${attempted}, sent=${sent}, suspended=${suspendedApplied}, errors=${errors}.`,
        });

        return {
            success: true,
            message: "Job de billing ejecutado.",
            data: {
                attempted,
                enqueued: sent,
                sent,
                suspendedApplied,
                errors,
                logs,
                report,
            },
        };
    } catch (error: any) {
        console.error("[runBillingDailyJob]", error);

        return {
            success: false,
            message: error?.message ?? "Error ejecutando job.",
            data: {
                attempted: 0,
                enqueued: 0,
                sent: 0,
                suspendedApplied: 0,
                errors: 1,
                logs: [
                    {
                        at: new Date().toISOString(),
                        level: "ERROR",
                        message: error?.message ?? "Error ejecutando job.",
                    },
                ],
                report: emptyReport,
            },
        };
    }
}

export async function runBillingDailyJob(): Promise<BillingJobResult> {
    return runBillingDailyJobInternal(true);
}

export async function runBillingDailyJobSystem(): Promise<BillingJobResult> {
    return runBillingDailyJobInternal(false);
}
