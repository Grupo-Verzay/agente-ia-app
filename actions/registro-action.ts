"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { assertUserCanUseApp } from "@/actions/billing/helpers/app-access-guard";
import { db } from "@/lib/db";
import { ActionResult } from "@/types/registro";
import {
    CrmFollowUpStatus,
    LeadStatus,
    SessionCrmFollowUpHistoryItem,
    SessionCrmFollowUpSummary,
    TipoRegistro,
} from "@/types/session";
import { normalizeDetalleDraft } from "@/app/(root)/crm/dashboard/helpers/detalleEdit";

export type RegistrosFilters = {
    estado?: string;
    leadStatus?: LeadStatus | "none";
    crmFollowUpStatus?: CrmFollowUpStatus | "none";
    fechaDesde?: string;
    fechaHasta?: string;
    query?: string;
    leadOnly?: boolean;
};

type SessionLookup = {
    remoteJid: string;
    instanceId: string;
};

type AuthorizedSessionScope = {
    id: number;
    userId: string;
    remoteJid: string;
    instanceId: string;
};

const updateLeadPushNameSchema = z.object({
    sessionId: z.number().int().positive(),
    pushName: z.string().trim().min(1, "El nombre es obligatorio.").max(120, "El nombre es demasiado largo."),
});

export type CrmRegistroManagementActionResult = {
    success: boolean;
    message: string;
    data?: {
        count: number;
    };
};

function buildSessionFollowUpKey(remoteJid?: string | null, instanceId?: string | null) {
    const remote = (remoteJid ?? "").trim();
    const instance = (instanceId ?? "").trim();
    if (!remote || !instance) return "";
    return `${instance}::${remote}`;
}

async function ensureAuthorizedSessionById(sessionId: number) {
    const session = await db.session.findUnique({
        where: { id: sessionId },
        select: {
            id: true,
            userId: true,
            remoteJid: true,
            instanceId: true,
        },
    });

    if (!session) {
        throw new Error("Sesion no encontrada.");
    }

    await assertUserCanUseApp(session.userId);
    return session;
}

async function ensureAuthorizedRegistroById(registroId: number) {
    const registro = await db.registro.findUnique({
        where: { id: registroId },
        select: {
            id: true,
            sessionId: true,
            tipo: true,
            session: {
                select: {
                    userId: true,
                    remoteJid: true,
                    instanceId: true,
                },
            },
        },
    });

    if (!registro) {
        throw new Error("Registro no encontrado.");
    }

    await assertUserCanUseApp(registro.session.userId);
    return registro;
}

function normalizeOptionalText(value?: string | null) {
    const normalized = (value ?? "").trim();
    return normalized ? normalized : null;
}

async function syncSessionLeadName(
    tx: Prisma.TransactionClient,
    session: AuthorizedSessionScope,
    nombre: string | null
) {
    if (!nombre) return;

    const result = await tx.session.updateMany({
        where: {
            id: session.id,
            userId: session.userId,
            instanceId: session.instanceId,
            remoteJid: session.remoteJid,
        },
        data: {
            pushName: nombre,
        },
    });

    if (result.count !== 1) {
        throw new Error("No se pudo sincronizar el nombre del lead para esta instancia.");
    }

    await tx.registro.updateMany({
        where: {
            sessionId: session.id,
            session: {
                userId: session.userId,
                instanceId: session.instanceId,
                remoteJid: session.remoteJid,
            },
        },
        data: {
            nombre,
        },
    });
}

export async function updateLeadPushNameAction(
    input: z.infer<typeof updateLeadPushNameSchema>
): Promise<ActionResult<{ pushName: string }>> {
    try {
        const { sessionId, pushName } = updateLeadPushNameSchema.parse(input);
        const session = await ensureAuthorizedSessionById(sessionId);
        const normalizedPushName = normalizeOptionalText(pushName);

        if (!normalizedPushName) {
            return {
                success: false,
                message: "El nombre del contacto es obligatorio.",
            };
        }

        await db.$transaction(async (tx) => {
            await syncSessionLeadName(tx, session, normalizedPushName);
        });

        return {
            success: true,
            data: {
                pushName: normalizedPushName,
            },
        };
    } catch (error) {
        console.error("Error al actualizar el nombre del lead:", error);

        return {
            success: false,
            message: error instanceof Error ? error.message : "No se pudo actualizar el nombre del contacto.",
        };
    }
}

function createEmptyCrmFollowUpSummary(): SessionCrmFollowUpSummary {
    return {
        total: 0,
        active: 0,
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        latestStatus: null,
        latestGeneratedMessage: null,
        latestScheduledFor: null,
        recentItems: [],
    };
}

async function getCrmFollowUpSummaryMapBySessions(sessions: SessionLookup[]) {
    const uniqueSessionsMap = new Map<string, SessionLookup>();
    for (const session of sessions) {
        const key = buildSessionFollowUpKey(session.remoteJid, session.instanceId);
        if (!key) continue;
        uniqueSessionsMap.set(key, session);
    }
    const uniqueSessions = Array.from(uniqueSessionsMap.values());

    if (!uniqueSessions.length) return new Map<string, SessionCrmFollowUpSummary>();

    const crmFollowUps = await db.crmFollowUp.findMany({
        where: {
            OR: uniqueSessions.map((session) => ({
                remoteJid: session.remoteJid,
                instanceId: session.instanceId,
            })),
        },
        select: {
            id: true,
            remoteJid: true,
            instanceId: true,
            status: true,
            leadStatusSnapshot: true,
            attemptCount: true,
            generatedMessage: true,
            errorReason: true,
            scheduledFor: true,
            createdAt: true,
            updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const summaryMap = new Map<string, SessionCrmFollowUpSummary>();

    for (const followUp of crmFollowUps) {
        const key = buildSessionFollowUpKey(followUp.remoteJid, followUp.instanceId);
        if (!key) continue;

        const summary = summaryMap.get(key) ?? createEmptyCrmFollowUpSummary();
        summary.total += 1;

        const status = followUp.status as CrmFollowUpStatus;
        switch (status) {
            case "PENDING":
                summary.pending += 1;
                summary.active += 1;
                break;
            case "PROCESSING":
                summary.processing += 1;
                summary.active += 1;
                break;
            case "SENT":
                summary.sent += 1;
                break;
            case "FAILED":
                summary.failed += 1;
                break;
            case "CANCELLED":
                summary.cancelled += 1;
                break;
            case "SKIPPED":
                summary.skipped += 1;
                break;
        }

        if (!summary.latestStatus) {
            summary.latestStatus = status;
            summary.latestGeneratedMessage = followUp.generatedMessage ?? null;
            summary.latestScheduledFor = followUp.scheduledFor?.toISOString?.() ?? null;
        }

        if (summary.recentItems.length < 5) {
            const item: SessionCrmFollowUpHistoryItem = {
                id: followUp.id,
                status,
                leadStatusSnapshot: followUp.leadStatusSnapshot,
                attemptCount: Math.max(followUp.attemptCount ?? 0, 0),
                message: followUp.generatedMessage ?? null,
                errorReason: followUp.errorReason ?? null,
                scheduledFor: followUp.scheduledFor?.toISOString?.() ?? null,
                createdAt: followUp.createdAt?.toISOString?.() ?? null,
                updatedAt: followUp.updatedAt?.toISOString?.() ?? null,
            };
            summary.recentItems.push(item);
        }

        summaryMap.set(key, summary);
    }

    return summaryMap;
}

async function getSessionIdsByCrmFollowUpFilter(
    userId: string,
    crmFollowUpStatus?: CrmFollowUpStatus | "none"
) {
    if (!crmFollowUpStatus) return null;

    const sessions = await db.session.findMany({
        where: { userId },
        select: {
            id: true,
            remoteJid: true,
            instanceId: true,
        },
    });

    if (!sessions.length) return [];

    const pairMap = new Map<string, { remoteJid: string; instanceId: string }>();
    for (const session of sessions) {
        const key = buildSessionFollowUpKey(session.remoteJid, session.instanceId);
        if (!key) continue;
        pairMap.set(key, {
            remoteJid: session.remoteJid,
            instanceId: session.instanceId,
        });
    }

    const pairs = Array.from(pairMap.values());
    if (!pairs.length) return [];

    const crmFollowUpWhere = {
        OR: pairs.map((pair) => ({
            remoteJid: pair.remoteJid,
            instanceId: pair.instanceId,
        })),
        ...(crmFollowUpStatus === "none" ? {} : { status: crmFollowUpStatus }),
    };

    const crmFollowUps = await db.crmFollowUp.findMany({
        where: crmFollowUpWhere,
        select: {
            remoteJid: true,
            instanceId: true,
        },
    });

    const crmFollowUpKeys = new Set(
        crmFollowUps.map((followUp) =>
            buildSessionFollowUpKey(followUp.remoteJid, followUp.instanceId)
        )
    );

    return sessions
        .filter((session) => {
            const key = buildSessionFollowUpKey(session.remoteJid, session.instanceId);
            if (!key) return false;
            return crmFollowUpStatus === "none"
                ? !crmFollowUpKeys.has(key)
                : crmFollowUpKeys.has(key);
        })
        .map((session) => session.id);
}

export async function createRegistro(input: {
    sessionId: number;
    tipo: TipoRegistro;
    fecha?: string; // ISO o datetime-local
    estado: string;

    nombre?: string;
    resumen?: string;
    lead?: boolean;

    detalles?: string;
}): Promise<ActionResult<unknown>> {
    try {
        const session = await ensureAuthorizedSessionById(input.sessionId);
        const normalizedNombre = normalizeOptionalText(input.nombre);

        const created = await db.$transaction(async (tx) => {
            const createdRegistro = await tx.registro.create({
                data: {
                    sessionId: input.sessionId,
                    tipo: input.tipo,
                    fecha: input.fecha ? new Date(input.fecha) : new Date(),
                    estado: input.estado,
                    nombre: normalizedNombre,
                    resumen: input.resumen ?? null,
                    lead: input.lead ?? false,
                    detalles: input.detalles ?? null,
                },
            });

            await syncSessionLeadName(tx, session, normalizedNombre);
            return createdRegistro;
        });

        return { success: true, data: created };
    } catch (e: any) {
        return { success: false, message: e?.message ?? "No se pudo crear el registro" };
    }
}

export async function updateRegistro(input: {
    id: number;
    sessionId: number;
    tipo: TipoRegistro;
    fecha?: string;
    estado: string;

    nombre?: string;
    resumen?: string;
    lead?: boolean;

    detalles?: string;
}): Promise<ActionResult<unknown>> {
    try {
        const registro = await ensureAuthorizedRegistroById(input.id);

        if (registro.sessionId !== input.sessionId) {
            return {
                success: false,
                message: "El registro no coincide con el lead de la instancia seleccionada.",
            };
        }

        const normalizedNombre = normalizeOptionalText(input.nombre);

        const updated = await db.$transaction(async (tx) => {
            const updateResult = await tx.registro.updateMany({
                where: {
                    id: input.id,
                    sessionId: input.sessionId,
                },
                data: {
                    tipo: input.tipo,
                    fecha: input.fecha ? new Date(input.fecha) : undefined,
                    estado: input.estado,
                    nombre: normalizedNombre,
                    resumen: input.resumen ?? null,
                    lead: input.lead ?? false,
                    detalles: input.detalles ?? null,
                },
            });

            if (updateResult.count !== 1) {
                throw new Error("No se pudo actualizar el registro para la instancia seleccionada.");
            }

            await syncSessionLeadName(
                tx,
                {
                    id: input.sessionId,
                    userId: registro.session.userId,
                    instanceId: registro.session.instanceId,
                    remoteJid: registro.session.remoteJid,
                },
                normalizedNombre
            );

            return tx.registro.findUnique({
                where: { id: input.id },
            });
        });

        return { success: true, data: updated };
    } catch (e: any) {
        return { success: false, message: e?.message ?? "No se pudo actualizar el registro" };
    }
}

export async function getRegistrosBySessionId(sessionId: number): Promise<ActionResult<import("@prisma/client").Registro[]>> {
    try {
        const registros = await db.registro.findMany({
            where: { sessionId },
            orderBy: { createdAt: "desc" },
        });
        return { success: true, data: registros };
    } catch (e: any) {
        return { success: false, message: e?.message ?? "No se pudieron cargar los registros" };
    }
}

export async function deleteRegistro(id: number): Promise<ActionResult<true>> {
    try {
        await ensureAuthorizedRegistroById(id);
        await db.$transaction([
            db.crmFollowUp.updateMany({
                where: { sourceReportId: id },
                data: { sourceReportId: null },
            }),
            db.registro.delete({ where: { id } }),
        ]);
        return { success: true, data: true };
    } catch (e: any) {
        return { success: false, message: e?.message ?? "No se pudo eliminar el registro" };
    }
}

export async function updateRegistroEstado(registroId: number, nuevoEstado: string) {
    try {
        await ensureAuthorizedRegistroById(registroId);
        await db.registro.update({
            where: { id: registroId },
            data: { estado: nuevoEstado },
        });

        return {
            success: true,
            message: "Estado actualizado correctamente",
        };
    } catch (error) {
        console.error("[UPDATE_REGISTRO_ESTADO]", error);
        return {
            success: false,
            message: "No se pudo actualizar el estado del registro",
        };
    }
}

export async function getRegistrosByUserId(
    userId: string,
    skip = 0,
    take = 50,
    tipo?: TipoRegistro,
    filters?: RegistrosFilters
) {
    try {
        await assertUserCanUseApp(userId);

        const estado = (filters?.estado ?? "").trim();
        const leadStatus = filters?.leadStatus;
        const crmFollowUpStatus = filters?.crmFollowUpStatus;
        const query = (filters?.query ?? "").trim();
        const leadOnly = Boolean(filters?.leadOnly);

        const fechaDesde = filters?.fechaDesde
            ? new Date(`${filters.fechaDesde}T00:00:00.000`)
            : null;
        const fechaHasta = filters?.fechaHasta
            ? new Date(`${filters.fechaHasta}T23:59:59.999`)
            : null;

        const fechaWhere =
            fechaDesde || fechaHasta
                ? {
                    ...(fechaDesde ? { gte: fechaDesde } : {}),
                    ...(fechaHasta ? { lte: fechaHasta } : {}),
                }
                : undefined;

        const sessionIdsByCrmFollowUp = await getSessionIdsByCrmFollowUpFilter(
            userId,
            crmFollowUpStatus
        );

        if (sessionIdsByCrmFollowUp && sessionIdsByCrmFollowUp.length === 0) {
            return {
                success: true as const,
                data: [],
            };
        }

        const combinedSessionIds = sessionIdsByCrmFollowUp ?? null;

        if (combinedSessionIds && combinedSessionIds.length === 0) {
            return {
                success: true as const,
                data: [],
            };
        }

        const whereClauses: Prisma.RegistroWhereInput[] = [
            {
                session: {
                    userId,
                    ...(leadStatus === "none"
                        ? { leadStatus: null }
                        : leadStatus
                            ? { leadStatus }
                            : {}),
                    ...(combinedSessionIds
                        ? { id: { in: combinedSessionIds } }
                        : {}),
                },
            },
        ];

        if (tipo) {
            whereClauses.push({ tipo });
        }

        if (estado) {
            whereClauses.push({ estado });
        }

        if (fechaWhere) {
            whereClauses.push({ fecha: fechaWhere });
        }

        if (leadOnly) {
            whereClauses.push({ lead: true });
        }

        if (query) {
            whereClauses.push({
                OR: [
                    { nombre: { contains: query, mode: "insensitive" } },
                    { resumen: { contains: query, mode: "insensitive" } },
                    { detalles: { contains: query, mode: "insensitive" } },
                    { estado: { contains: query, mode: "insensitive" } },
                    {
                        session: {
                            OR: [
                                { pushName: { contains: query, mode: "insensitive" } },
                                { remoteJid: { contains: query, mode: "insensitive" } },
                                { remoteJidAlt: { contains: query, mode: "insensitive" } },
                                { instanceId: { contains: query, mode: "insensitive" } },
                            ],
                        },
                    },
                ],
            });
        }

        const registros = await db.registro.findMany({
            where: { AND: whereClauses },
            include: {
                session: {
                    include: {
                        registros: true,
                    },
                },
            },
            orderBy: { fecha: "desc" },
            skip,
            take,
        });

        const crmFollowUpSummaryMap = await getCrmFollowUpSummaryMapBySessions(
            registros.map((registro) => ({
                remoteJid: registro.session.remoteJid,
                instanceId: registro.session.instanceId,
            }))
        );

        const data = registros.map((registro) => {
            const summaryKey = buildSessionFollowUpKey(
                registro.session.remoteJid,
                registro.session.instanceId
            );

            return {
                ...registro,
                session: {
                    ...registro.session,
                    crmFollowUpSummary: crmFollowUpSummaryMap.get(summaryKey) ?? null,
                },
            };
        });

        return {
            success: true as const,
            data,
        };
    } catch (error) {
        console.error("[getRegistrosByUserId] Error:", error);

        return {
            success: false as const,
            message: "Error al obtener registros",
        };
    }
}

export async function getCrmDashboardStatsByUserId(userId: string) {
    try {
        await assertUserCanUseApp(userId);

        // 1) total registros
        const totalRegistros = await db.registro.count({
            where: { session: { userId } },
        });

        // 2) leads con movimientos (distinct sessionId)
        const leadsConMovimientos = await db.registro.groupBy({
            by: ["sessionId"],
            where: { session: { userId } },
        });

        // 3) conteo por tipo
        const byTipo = await db.registro.groupBy({
            by: ["tipo"],
            where: { session: { userId } },
            _count: { _all: true },
        });

        const countsByTipo = {
            REPORTE: 0,
            SOLICITUD: 0,
            PEDIDO: 0,
            RECLAMO: 0,
            PAGO: 0,
            RESERVA: 0,
            PRODUCTO: 0,
        } satisfies Record<TipoRegistro, number>;

        for (const row of byTipo) {
            const tipo = row.tipo as TipoRegistro;
            countsByTipo[tipo] = row._count._all;
        }

        // 4) últimos 7 días
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - 6); // incluye hoy (7 días)

        const last7 = await db.registro.findMany({
            where: { session: { userId }, fecha: { gte: start } },
            select: { fecha: true },
            orderBy: { fecha: "asc" },
        });

        // mapa yyyy-MM-dd => count
        const daysMap = new Map<string, number>();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            daysMap.set(key, 0);
        }

        for (const r of last7) {
            if (!r.fecha) continue;
            const key = r.fecha.toISOString().slice(0, 10);
            if (daysMap.has(key)) daysMap.set(key, (daysMap.get(key) ?? 0) + 1);
        }

        const chartDataByDay = Array.from(daysMap.entries()).map(([key, count]) => ({
            fecha: key.slice(5), // MM-DD
            cantidad: count,
        }));

        const sessions = await db.session.findMany({
            where: { userId },
            select: { remoteJid: true, instanceId: true },
        });

        const uniqueSessionsMap = new Map<string, { remoteJid: string; instanceId: string }>();
        for (const session of sessions) {
            const key = buildSessionFollowUpKey(session.remoteJid, session.instanceId);
            if (!key) continue;
            uniqueSessionsMap.set(key, session);
        }
        const uniqueSessions = Array.from(uniqueSessionsMap.values());

        const crmFollowUps = {
            total: 0,
            active: 0,
            pending: 0,
            processing: 0,
            sent: 0,
            failed: 0,
            cancelled: 0,
            skipped: 0,
        };

        if (uniqueSessions.length) {
            const crmFollowUpCounts = await db.crmFollowUp.groupBy({
                by: ["status"],
                where: {
                    OR: uniqueSessions.map((session) => ({
                        remoteJid: session.remoteJid,
                        instanceId: session.instanceId,
                    })),
                },
                _count: { _all: true },
            });

            for (const row of crmFollowUpCounts) {
                const status = row.status as CrmFollowUpStatus;
                const count = row._count._all;
                crmFollowUps.total += count;

                if (status === "PENDING") {
                    crmFollowUps.pending += count;
                    crmFollowUps.active += count;
                } else if (status === "PROCESSING") {
                    crmFollowUps.processing += count;
                    crmFollowUps.active += count;
                } else if (status === "SENT") {
                    crmFollowUps.sent += count;
                } else if (status === "FAILED") {
                    crmFollowUps.failed += count;
                } else if (status === "CANCELLED") {
                    crmFollowUps.cancelled += count;
                } else if (status === "SKIPPED") {
                    crmFollowUps.skipped += count;
                }
            }
        }

        return {
            success: true as const,
            data: {
                totalRegistros,
                leadsConMovimientos: leadsConMovimientos.length,
                countsByTipo,
                chartDataByDay,
                crmFollowUps,
            },
        };
    } catch (error) {
        console.error("[getCrmDashboardStatsByUserId] Error:", error);
        return {
            success: false as const,
            message: "Error al obtener estadísticas del CRM",
        };
    }
}

export async function getSessionTagStatsByUserId(userId: string) {
    try {
        await assertUserCanUseApp(userId);

        // 1) Agrupamos en la tabla pivote SessionTag
        const grouped = await db.sessionTag.groupBy({
            by: ["tagId"],
            _count: { _all: true },
            where: {
                session: { userId }, // solo sesiones del usuario actual
            },
        });

        if (!grouped.length) return { success: true as const, data: [] };

        const tagIds = grouped.map((g) => g.tagId);

        // 2) Traemos info de cada Tag
        const tags = await db.tag.findMany({
            where: { id: { in: tagIds } },
        });

        // 3) Combinamos
        const stats = grouped.map((g) => {
            const tag = tags.find((t) => t.id === g.tagId);
            return {
                tagId: g.tagId,
                name: tag?.name ?? "Sin nombre",
                slug: tag?.slug ?? "",
                color: tag?.color ?? undefined,
                count: g._count._all,
            };
        });

        return {
            success: true as const,
            data: stats,
        };
    } catch (error) {
        console.error("[getSessionTagStatsByUserId] Error:", error);
        return {
            success: false as const,
            message: "Error al obtener estadísticas de tags",
        };
    }
}

export async function updateRegistroDetalle(registroId: number, nuevoDetalle: string) {
    try {
        const registro = await ensureAuthorizedRegistroById(registroId);

        const detalleValue = normalizeDetalleDraft(nuevoDetalle);

        await db.registro.update({
            where: { id: registroId },
            data:
                registro.tipo === "REPORTE"
                    ? { resumen: detalleValue }
                    : { detalles: detalleValue },
        });

        return {
            success: true,
            message: "Detalle actualizado correctamente",
        };
    } catch (error) {
        console.error("[UPDATE_REGISTRO_DETALLE]", error);
        return {
            success: false,
            message: "No se pudo actualizar el detalle del registro",
        };
    }
}

export async function deleteRegistrosBySessionId(
    sessionId: number
): Promise<CrmRegistroManagementActionResult> {
    try {
        const session = await ensureAuthorizedSessionById(sessionId);

        const [, result] = await db.$transaction([
            db.crmFollowUp.updateMany({
                where: {
                    sourceReport: {
                        is: {
                            sessionId: session.id,
                        },
                    },
                },
                data: { sourceReportId: null },
            }),
            db.registro.deleteMany({
                where: { sessionId: session.id },
            }),
        ]);

        return {
            success: true,
            message:
                result.count === 0
                    ? "El lead no tiene movimientos para eliminar."
                    : result.count === 1
                        ? "Se elimino 1 movimiento del lead."
                        : `Se eliminaron ${result.count} movimientos del lead.`,
            data: { count: result.count },
        };
    } catch (error) {
        console.error("[deleteRegistrosBySessionId]", error);
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "No se pudieron eliminar los movimientos del lead.",
        };
    }
}

export async function deleteAllRegistrosByUserId(
    userId: string
): Promise<CrmRegistroManagementActionResult> {
    try {
        await assertUserCanUseApp(userId);

        const [, result] = await db.$transaction([
            db.crmFollowUp.updateMany({
                where: {
                    sourceReport: {
                        is: {
                            session: {
                                userId,
                            },
                        },
                    },
                },
                data: { sourceReportId: null },
            }),
            db.registro.deleteMany({
                where: {
                    session: {
                        userId,
                    },
                },
            }),
        ]);

        return {
            success: true,
            message:
                result.count === 0
                    ? "No hay registros en el CRM para eliminar."
                    : result.count === 1
                        ? "Se elimino 1 registro del CRM."
                        : `Se eliminaron ${result.count} registros del CRM.`,
            data: { count: result.count },
        };
    } catch (error) {
        console.error("[deleteAllRegistrosByUserId]", error);
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "No se pudieron eliminar los registros del CRM.",
        };
    }
}

export async function deleteRegistrosByTipoAndUserId(
    userId: string,
    tipo: TipoRegistro
): Promise<CrmRegistroManagementActionResult> {
    try {
        await assertUserCanUseApp(userId);

        const [, result] = await db.$transaction([
            db.crmFollowUp.updateMany({
                where: {
                    sourceReport: {
                        is: {
                            tipo,
                            session: {
                                userId,
                            },
                        },
                    },
                },
                data: { sourceReportId: null },
            }),
            db.registro.deleteMany({
                where: {
                    tipo,
                    session: {
                        userId,
                    },
                },
            }),
        ]);

        return {
            success: true,
            message:
                result.count === 0
                    ? `No hay registros de tipo ${tipo} en el CRM para eliminar.`
                    : result.count === 1
                        ? `Se elimino 1 registro de tipo ${tipo} del CRM.`
                        : `Se eliminaron ${result.count} registros de tipo ${tipo} del CRM.`,
            data: { count: result.count },
        };
    } catch (error) {
        console.error("[deleteRegistrosByTipoAndUserId]", error);
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : `No se pudieron eliminar los registros de tipo ${tipo} del CRM.`,
        };
    }
}
