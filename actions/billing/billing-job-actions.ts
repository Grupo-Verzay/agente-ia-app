"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SERVER_TIME_ZONE } from "@/lib/utils";
import { endOfDay, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { ResponseFormat, SOON_DAYS_BILLING, DELETE_DAYS_BILLING, PRE_DELETE_WARN_DAYS } from "@/types/billing";
// El borrado de la cuenta a los 30 dias es el UNICO sitio donde la linea se
// borra de verdad: ahi la fila de `User` se va. La suspension por impago ya no
// borra nada (ver `lib/robot-por-facturacion.ts`).
import { liberarLasLineasDeLaCuenta } from "@/lib/sesion-de-la-linea";
import { apagarElRobotPorImpago, olvidarElRobotDe } from "@/lib/robot-por-facturacion";
import { assertAdminOrReseller } from "./helpers/billing-helpers.server";
import { anotarLaCohorteDelMes } from "@/actions/renovacion-mensual-actions";
import {
    evaluateBillingLifecycle,
    getBillingDaysRemaining,
} from "./helpers/billing-lifecycle";
import {
    loadBillingDispatcherConfig,
    loadBillingDispatcherForUser,
    sendBillingTemplateMessage,
    syncUserBillingLifecycle,
    getBillingUserRecord,
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
                    // El cron de plataforma NO gestiona clientes de resellers:
                    // su ciclo de cobro lo maneja el reseller.
                    demoResellerId: null,
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
                // Línea emisora POR CLIENTE: Verzay para clientes directos; la del
                // reseller (combinando ambos sistemas de vinculación) para clientes
                // de un reseller, sin caer NUNCA a Verzay. null = cliente de reseller
                // sin línea conectada → el ciclo (suspensión/eliminación) sigue igual,
                // pero NO se le envía ninguna notificación por Verzay.
                const candidateDispatcher = await loadBillingDispatcherForUser(candidate.userId);

                const syncResult = await syncUserBillingLifecycle({
                    userId: candidate.userId,
                    now,
                    dispatcher,
                    source: "billing-cron-state",
                    sendStateChangeMessage: false, // el cron suspende en silencio; los recordatorios ya fueron enviados
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

                    // La sesión de WhatsApp NO se toca: se apaga el agente.
                    // Antes aquí se borraba la instancia, así que el cliente que
                    // pagaba al día siguiente tenía que reescanear el QR. Y una
                    // línea de Waha salía peor parada por este camino: como no
                    // suele tener clave de Evolution, `deleteInstanceEvolutionAware`
                    // se llevaba su fila en el acto y dejaba la sesión viva y
                    // huérfana en el servidor de Waha.
                    const robot = await apagarElRobotPorImpago(billing.userId);
                    pushLog({
                        at: new Date().toISOString(),
                        level: robot.sinColumna ? "WARN" : "INFO",
                        message: robot.sinColumna
                            ? "La base no tiene todavía la marca del Robot: la cuenta queda suspendida pero su agente sigue respondiendo."
                            : `Agente apagado al suspender (${robot.cambiadas} de ${robot.lineas.length} líneas). La sesión de WhatsApp sigue conectada.`,
                        userBillingId: billing.id,
                        userId: billing.userId,
                    });

                    // Avisar al cliente que su servicio fue suspendido. Este mensaje
                    // REEMPLAZA al recordatorio de "vencido/paga" ese día (ver continue abajo).
                    // Cliente de reseller sin línea: se suspende igual, pero sin aviso por Verzay.
                    if (!candidateDispatcher) {
                        pushLog({
                            at: new Date().toISOString(),
                            level: "INFO",
                            message: "Suspensión aplicada; cliente de reseller sin línea conectada, no se notifica por Verzay.",
                            userBillingId: billing.id,
                            userId: billing.userId,
                            template: "STATUS_SUSPENDED",
                        });
                    } else {
                    attempted++;
                    const suspendedMsg = await sendBillingTemplateMessage({
                        billing,
                        template: "STATUS_SUSPENDED",
                        dispatcher: candidateDispatcher,
                        now,
                        source: "billing-cron-suspended",
                    });
                    if (suspendedMsg.success) {
                        sent++;
                        sentItems.push({
                            userBillingId: billing.id,
                            userId: billing.userId,
                            name: candidateName,
                            remoteJid: suspendedMsg.remoteJid ?? "",
                            template: "STATUS_SUSPENDED",
                            kind: "STATE_CHANGE",
                            success: true,
                            sentAt: new Date().toISOString(),
                            error: null,
                        });
                        pushLog({
                            at: new Date().toISOString(),
                            level: "INFO",
                            message: "Mensaje de suspensión enviado al cliente.",
                            userBillingId: billing.id,
                            userId: billing.userId,
                            template: "STATUS_SUSPENDED",
                        });
                    } else {
                        errors++;
                        pushLog({
                            at: new Date().toISOString(),
                            level: "ERROR",
                            message: `No se pudo enviar el mensaje de suspensión: ${suspendedMsg.message}`,
                            userBillingId: billing.id,
                            userId: billing.userId,
                            template: "STATUS_SUSPENDED",
                        });
                    }
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

                // Si acabamos de suspender, el cliente ya recibió el mensaje de
                // suspensión arriba: no enviar también el recordatorio de "vencido/paga".
                if (syncResult.stateChanged && billing.accessStatus === "SUSPENDED") {
                    continue;
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

                // Cliente de reseller sin línea conectada → no se envía el
                // recordatorio por Verzay (se reintentará cuando conecte su línea).
                if (!candidateDispatcher) {
                    skipped.push({
                        userBillingId: billing.id,
                        userId: billing.userId,
                        name: candidateName,
                        template,
                        reason: "RESELLER_SIN_LINEA",
                    });
                    continue;
                }

                attempted++;

                const reminderResult = await sendBillingTemplateMessage({
                    billing,
                    template,
                    dispatcher: candidateDispatcher,
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

        // ── Repaso: que ninguna cuenta suspendida se quede con el agente ─────
        //    respondiendo. Este bloque reintentaba el BORRADO de la instancia
        //    cuando Evolution estaba caído; ya no se borra ninguna, y lo que hay
        //    que repasar es la marca del Robot: si el día de la suspensión la
        //    base no la tenía -o la escritura falló-, la cuenta quedó suspendida
        //    con su agente contestando, que es la plataforma regalando servicio.
        //
        //    Se repasa por CUENTA y no por línea de Evolution: `apagarElRobotPorImpago`
        //    mira las dos clases de línea, y preguntar aquí solo por
        //    `instanceType: "Whatsapp"` dejaba fuera a las de Waha -que es el
        //    fallo que este cambio viene a cerrar-.
        let agentesRepasados = 0;
        const suspendidasConLinea = await db.userBilling.findMany({
            where: {
                accessStatus: "SUSPENDED",
                user: {
                    demoResellerId: null,
                    instancias: { some: { instanceType: { in: ["Whatsapp", "waha"] } } },
                },
            },
            select: { id: true, userId: true },
        });
        for (const sb of suspendidasConLinea) {
            try {
                const repaso = await apagarElRobotPorImpago(sb.userId);
                if (repaso.cambiadas > 0) agentesRepasados++;
                if (repaso.sinColumna) {
                    pushLog({
                        at: new Date().toISOString(),
                        level: "WARN",
                        message: "Cuenta suspendida cuyo agente no se puede apagar: la base no tiene la marca del Robot.",
                        userBillingId: sb.id,
                        userId: sb.userId,
                    });
                }
            } catch (repasoErr: any) {
                pushLog({
                    at: new Date().toISOString(),
                    level: "WARN",
                    message: `Error inesperado al repasar el agente de una cuenta suspendida: ${repasoErr?.message}`,
                    userBillingId: sb.id,
                    userId: sb.userId,
                });
            }
        }

        // ── Aviso final pre-eliminación (3 días antes) + 50% de descuento ─────
        // Se envía una sola vez (preDeleteWarnedAt) a las cuentas con vencimiento
        // entre DELETE_DAYS-PRE_DELETE_WARN_DAYS (27) y DELETE_DAYS (30) días.
        const warnFromCutoff = endOfDay(
            new Date(now.getTime() - (DELETE_DAYS_BILLING - PRE_DELETE_WARN_DAYS) * 24 * 60 * 60 * 1000)
        );
        const warnUntilCutoff = endOfDay(
            new Date(now.getTime() - DELETE_DAYS_BILLING * 24 * 60 * 60 * 1000)
        );
        let preDeleteWarned = 0;
        const warnCandidates = await db.userBilling.findMany({
            where: {
                billingStatus: "UNPAID",
                preDeleteWarnedAt: null,
                dueDate: { not: null, lte: warnFromCutoff, gt: warnUntilCutoff },
                user: { role: "user", demoResellerId: null },
            },
            select: { id: true, userId: true },
        });
        for (const wc of warnCandidates) {
            try {
                const billing = await getBillingUserRecord(wc.userId);
                if (!billing) continue;
                // Cliente de reseller sin línea → no avisar por Verzay.
                const wcDispatcher = await loadBillingDispatcherForUser(wc.userId);
                if (!wcDispatcher) continue;
                const res = await sendBillingTemplateMessage({
                    billing,
                    template: "PRE_DELETE_DISCOUNT",
                    dispatcher: wcDispatcher,
                    now,
                    source: "billing-pre-delete",
                });
                if (res.success) {
                    await db.userBilling.update({ where: { id: wc.id }, data: { preDeleteWarnedAt: now } });
                    preDeleteWarned++;
                    pushLog({
                        at: new Date().toISOString(),
                        level: "INFO",
                        message: "Aviso pre-eliminación (50% off) enviado.",
                        userBillingId: wc.id,
                        userId: wc.userId,
                    });
                } else {
                    pushLog({
                        at: new Date().toISOString(),
                        level: "WARN",
                        message: `No se pudo enviar el aviso pre-eliminación: ${res.message}`,
                        userBillingId: wc.id,
                        userId: wc.userId,
                    });
                }
            } catch (warnErr: any) {
                pushLog({
                    at: new Date().toISOString(),
                    level: "WARN",
                    message: `Error inesperado en aviso pre-eliminación: ${warnErr?.message}`,
                    userBillingId: wc.id,
                    userId: wc.userId,
                });
            }
        }

        // ── Eliminar cuentas con 30+ días vencidas sin pagar ──────────────────
        const deletionCutoff = endOfDay(
            new Date(now.getTime() - DELETE_DAYS_BILLING * 24 * 60 * 60 * 1000)
        );
        const deletionCandidates = await db.userBilling.findMany({
            where: {
                billingStatus: "UNPAID",
                dueDate: { not: null, lte: deletionCutoff },
                user: { role: "user", demoResellerId: null },
            },
            select: { id: true, userId: true, user: { select: { name: true, email: true } } },
        });

        let deletedApplied = 0;
        for (const dc of deletionCandidates) {
            try {
                // Avisar al cliente que su cuenta fue eliminada (antes de borrarla,
                // mientras aún existe su número de notificación).
                try {
                    const billing = await getBillingUserRecord(dc.userId);
                    if (billing) {
                        // Cliente de reseller sin línea → no avisar por Verzay.
                        const dcDispatcher = await loadBillingDispatcherForUser(dc.userId);
                        if (dcDispatcher) {
                            await sendBillingTemplateMessage({
                                billing,
                                template: "ACCOUNT_DELETED",
                                dispatcher: dcDispatcher,
                                now,
                                source: "billing-account-deleted",
                            });
                        }
                    }
                } catch (msgErr: any) {
                    pushLog({
                        at: new Date().toISOString(),
                        level: "WARN",
                        message: `No se pudo enviar el aviso de cuenta eliminada: ${msgErr?.message}`,
                        userId: dc.userId,
                    });
                }

                // TODAS sus lineas, no solo la primera: `deleteInstanceInternal`
                // resuelve con `checkActiveInstance`, que es un `findFirst`, asi
                // que una cuenta con dos lineas dejaba la segunda viva. Y la
                // relacion es `onDelete: Cascade`, o sea que el `db.user.delete`
                // de abajo se lleva sus filas igual: lo que no se libere aqui se
                // queda ocupando una sesion **para siempre**, sin ninguna fila
                // que diga de quien era.
                await liberarLasLineasDeLaCuenta(dc.userId);
                // La tabla del recuerdo no tiene clave foranea -`Instancias` es
                // del backend-, asi que al borrar la cuenta nadie la limpia
                // sola. Va antes del `delete` a proposito: despues, si el
                // borrado revienta, la fila se queda con una cuenta que sigue
                // existiendo.
                await olvidarElRobotDe(dc.userId);
                await db.user.delete({ where: { id: dc.userId } });
                deletedApplied++;
                pushLog({
                    at: new Date().toISOString(),
                    level: "INFO",
                    message: `Cuenta eliminada por 30+ días sin renovar: ${dc.user?.email ?? dc.userId}`,
                    userId: dc.userId,
                });
            } catch (delErr: any) {
                pushLog({
                    at: new Date().toISOString(),
                    level: "ERROR",
                    message: `Error al eliminar cuenta ${dc.userId}: ${delErr?.message}`,
                    userId: dc.userId,
                });
            }
        }

        const debtorsRaw = await db.userBilling.findMany({
            where: {
                dueDate: { not: null },
                user: { demoResellerId: null },
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

        // La cohorte del mes, para la tarjeta de Renovación mensual.
        //
        // Va aquí porque este es el único sitio que corre TODOS los días, y la
        // cohorte de un mes hay que cogerla mientras sus cuentas todavía tienen
        // el vencimiento dentro: `dueDate` se pisa al cobrar y la fecha vieja
        // no se puede recuperar después.
        //
        // Y **no puede tumbar el job**: cobrar, avisar y suspender es lo que de
        // verdad importa de esta función. Pero tampoco es mudo — una cohorte
        // que deja de anotarse en silencio se nota meses más tarde, como una
        // tarjeta que lleva tiempo diciendo lo mismo.
        try {
            const anotada = await anotarLaCohorteDelMes();
            pushLog({
                at: new Date().toISOString(),
                level: "INFO",
                message: `Cohorte de renovación ${anotada.mes}: anotadas=${anotada.anotadas}, selladas=${anotada.selladas}.`,
            });
        } catch (error: any) {
            pushLog({
                at: new Date().toISOString(),
                level: "ERROR",
                message: `No se pudo anotar la cohorte de renovación: ${error?.message ?? error}.`,
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
            message: `Resumen job billing: attempted=${attempted}, sent=${sent}, suspended=${suspendedApplied}, agentesRepasados=${agentesRepasados}, avisosPreEliminacion=${preDeleteWarned}, deleted=${deletedApplied}, errors=${errors}.`,
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
