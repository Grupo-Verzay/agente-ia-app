"use server";

import { db } from "@/lib/db";
import { assertUserCanUseApp } from "@/actions/billing/helpers/app-access-guard";

export async function getAnalyticsDataByUserId(userId: string) {
    try {
        await assertUserCanUseApp(userId);

        /* ── 1) Lead status distribution ── */
        const leadStatusGroups = await db.session.groupBy({
            by: ["leadStatus"],
            where: { userId, leadStatus: { not: null } },
            _count: { _all: true },
        });
        const leadStatusCounts = { FRIO: 0, TIBIO: 0, CALIENTE: 0, FINALIZADO: 0, DESCARTADO: 0 };
        for (const row of leadStatusGroups) {
            if (row.leadStatus && row.leadStatus in leadStatusCounts) {
                leadStatusCounts[row.leadStatus as keyof typeof leadStatusCounts] = row._count._all;
            }
        }

        /* ── 2) Workflows por status ── */
        const workflowGroups = await db.workflow.groupBy({
            by: ["status"],
            where: { userId },
            _count: { _all: true },
        });
        const workflowCounts: Record<string, number> = {};
        for (const row of workflowGroups) workflowCounts[row.status] = row._count._all;
        const totalWorkflows = Object.values(workflowCounts).reduce((a, b) => a + b, 0);

        /* ── 3) Flujos ejecutados (SessionWorkflowState por workflow) ── */
        const workflowExecutions = await db.sessionWorkflowState.groupBy({
            by: ["workflowId"],
            where: { workflow: { userId } },
            _count: { _all: true },
        });
        const workflowIds = workflowExecutions.map((r) => r.workflowId);
        const workflowNames = workflowIds.length
            ? await db.workflow.findMany({
                where: { id: { in: workflowIds } },
                select: { id: true, name: true },
            })
            : [];
        const nameMap = Object.fromEntries(workflowNames.map((w) => [w.id, w.name]));
        const topFlows = workflowExecutions
            .map((r) => ({
                name: (nameMap[r.workflowId] ?? "Flujo").slice(0, 22),
                ejecuciones: r._count._all,
            }))
            .sort((a, b) => b.ejecuciones - a.ejecuciones)
            .slice(0, 6);

        /* ── 4) Sesiones ── */
        const totalSessions = await db.session.count({ where: { userId } });
        const activeSessions = await db.session.count({ where: { userId, status: true } });
        const agentActiveSessions = await db.session.count({ where: { userId, agentDisabled: false } });

        /* ── 5) Productos ── */
        const totalProducts = await db.product.count({ where: { userId } });
        const activeProducts = await db.product.count({ where: { userId, isActive: true } });
        const lowStockProducts = await db.product.count({ where: { userId, isActive: true, stock: { gt: 0, lte: 5 } } });
        const outOfStockProducts = await db.product.count({ where: { userId, isActive: true, stock: 0 } });
        const topProducts = await db.product.findMany({
            where: { userId, isActive: true },
            select: { title: true, stock: true, category: true },
            orderBy: { stock: "desc" },
            take: 6,
        });
        const productsByCategory = await db.product.groupBy({
            by: ["category"],
            where: { userId, isActive: true },
            _count: { _all: true },
        });

        /* ── 6) Citas por estado ── */
        const appointmentGroups = await db.appointment.groupBy({
            by: ["status"],
            where: { userId },
            _count: { _all: true },
        });
        const appointmentCounts = {
            PENDIENTE: 0,
            CONFIRMADA: 0,
            CANCELADA: 0,
            ATENDIDA: 0,
            NO_ASISTIDA: 0,
        };
        for (const row of appointmentGroups) {
            if (row.status in appointmentCounts) {
                appointmentCounts[row.status as keyof typeof appointmentCounts] = row._count._all;
            }
        }
        const totalAppointments = Object.values(appointmentCounts).reduce((a, b) => a + b, 0);

        /* Citas próximas (próximas 7 días) */
        const now = new Date();
        const in7Days = new Date(now);
        in7Days.setDate(in7Days.getDate() + 7);
        const upcomingAppointments = await db.appointment.count({
            where: {
                userId,
                startTime: { gte: now, lte: in7Days },
                status: { in: ["PENDIENTE", "CONFIRMADA"] },
            },
        });

        /* ── 7) Ventas (FinanceTransaction) ── */
        const salesRaw = await db.financeTransaction.findMany({
            where: { userId, type: "SALE", status: { not: "DELETED" } },
            select: { amount: true, occurredAt: true, createdAt: true },
            orderBy: { occurredAt: "asc" },
        });

        const totalSales = salesRaw.length;
        const totalRevenue = salesRaw.reduce((sum, s) => sum + Number(s.amount ?? 0), 0);

        /* Ventas últimos 30 días (por semana) */
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

        const weekLabels = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
        const weekSales = [0, 0, 0, 0];
        const weekRevenue = [0, 0, 0, 0];

        for (const sale of salesRaw) {
            const date = sale.occurredAt ?? sale.createdAt;
            if (!date || date < thirtyDaysAgo) continue;
            const diffDays = Math.floor((date.getTime() - thirtyDaysAgo.getTime()) / 86400000);
            const weekIdx = Math.min(Math.floor(diffDays / 7), 3);
            weekSales[weekIdx]++;
            weekRevenue[weekIdx] += Number(sale.amount ?? 0);
        }

        const salesByWeek = weekLabels.map((label, i) => ({
            semana: label,
            ventas: weekSales[i],
            ingresos: Math.round(weekRevenue[i] * 100) / 100,
        }));

        return {
            success: true as const,
            data: {
                leadStatusCounts,
                workflowCounts,
                totalWorkflows,
                topFlows,
                sessions: {
                    total: totalSessions,
                    active: activeSessions,
                    inactive: totalSessions - activeSessions,
                    agentActive: agentActiveSessions,
                    agentInactive: totalSessions - agentActiveSessions,
                },
                products: {
                    total: totalProducts,
                    active: activeProducts,
                    inactive: totalProducts - activeProducts,
                    lowStock: lowStockProducts,
                    outOfStock: outOfStockProducts,
                    top: topProducts.map((p) => ({
                        title: p.title.length > 20 ? p.title.slice(0, 20) + "…" : p.title,
                        stock: p.stock,
                        category: p.category,
                    })),
                    byCategory: productsByCategory.map((r) => ({
                        category: r.category || "Sin categoría",
                        cantidad: r._count._all,
                    })),
                },
                appointments: {
                    total: totalAppointments,
                    upcoming: upcomingAppointments,
                    counts: appointmentCounts,
                },
                sales: {
                    total: totalSales,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    byWeek: salesByWeek,
                },
            },
        };
    } catch (error) {
        console.error("[getAnalyticsDataByUserId]", error);
        return { success: false as const, message: "Error al obtener analíticas" };
    }
}
