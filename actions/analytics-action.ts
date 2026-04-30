"use server";

import { db } from "@/lib/db";
import { assertUserCanUseApp } from "@/actions/billing/helpers/app-access-guard";

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

function getPeriodStart(period: AnalyticsPeriod): Date | null {
    if (period === "all") return null;
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

export async function getAnalyticsDataByUserId(userId: string, period: AnalyticsPeriod = "30d") {
    try {
        await assertUserCanUseApp(userId);

        const periodStart = getPeriodStart(period);
        const dateFilter = periodStart ? { gte: periodStart } : undefined;

        /* ── 1) Lead status distribution (estado actual, sin filtro de fecha) ── */
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

        /* ── 2) Workflows por status (estado actual) ── */
        const workflowGroups = await db.workflow.groupBy({
            by: ["status"],
            where: { userId },
            _count: { _all: true },
        });
        const workflowCounts: Record<string, number> = {};
        for (const row of workflowGroups) workflowCounts[row.status] = row._count._all;
        const totalWorkflows = Object.values(workflowCounts).reduce((a, b) => a + b, 0);

        /* ── 3) Flujos ejecutados ── */
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
        const newSessions = dateFilter
            ? await db.session.count({ where: { userId, createdAt: dateFilter } })
            : totalSessions;

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
            where: { userId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
            _count: { _all: true },
        });
        const appointmentCounts = {
            PENDIENTE: 0, CONFIRMADA: 0, CANCELADA: 0, ATENDIDA: 0, NO_ASISTIDA: 0,
        };
        for (const row of appointmentGroups) {
            if (row.status in appointmentCounts) {
                appointmentCounts[row.status as keyof typeof appointmentCounts] = row._count._all;
            }
        }
        const totalAppointments = Object.values(appointmentCounts).reduce((a, b) => a + b, 0);

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

        /* ── 7) Ventas ── */
        const salesRaw = await db.financeTransaction.findMany({
            where: {
                userId,
                type: "SALE",
                status: { not: "DELETED" },
                ...(dateFilter ? { occurredAt: dateFilter } : {}),
            },
            select: { amount: true, occurredAt: true, createdAt: true },
            orderBy: { occurredAt: "asc" },
        });

        const totalSales = salesRaw.length;
        const totalRevenue = salesRaw.reduce((sum, s) => sum + Number(s.amount ?? 0), 0);

        const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
        const bucketStart = periodStart ?? (() => {
            const d = new Date();
            d.setDate(d.getDate() - 29);
            return d;
        })();
        const bucketDays = Math.ceil(periodDays / 4);
        const weekSales = [0, 0, 0, 0];
        const weekRevenue = [0, 0, 0, 0];

        for (const sale of salesRaw) {
            const date = sale.occurredAt ?? sale.createdAt;
            if (!date || date < bucketStart) continue;
            const diff = Math.floor((date.getTime() - bucketStart.getTime()) / 86400000);
            const idx = Math.min(Math.floor(diff / bucketDays), 3);
            weekSales[idx]++;
            weekRevenue[idx] += Number(sale.amount ?? 0);
        }

        const salesByWeek = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"].map((label, i) => ({
            semana: label,
            ventas: weekSales[i],
            ingresos: Math.round(weekRevenue[i] * 100) / 100,
        }));

        /* ── 8b) Gastos por categoría ── */
        const expensesRaw = await db.financeTransaction.findMany({
            where: {
                userId,
                type: "EXPENSE" as any,
                status: { not: "DELETED" as any },
                ...(dateFilter ? { occurredAt: dateFilter } : {}),
            },
            select: { amount: true, categoryId: true },
        });
        const totalExpenses = expensesRaw.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

        const expCategoryIds = [...new Set(expensesRaw.map((e) => e.categoryId).filter(Boolean))] as string[];
        const expCategories = expCategoryIds.length
            ? await db.financeCategory.findMany({
                  where: { id: { in: expCategoryIds } },
                  select: { id: true, name: true, color: true },
              })
            : [];
        const catMeta = Object.fromEntries(expCategories.map((c) => [c.id, { name: c.name, color: c.color }]));
        const expByCatMap: Record<string, { name: string; amount: number; color: string }> = {};
        for (const exp of expensesRaw) {
            const cid = exp.categoryId ?? "__none__";
            const meta = catMeta[cid] ?? { name: "Sin categoría", color: null };
            if (!expByCatMap[cid]) expByCatMap[cid] = { name: meta.name, amount: 0, color: meta.color ?? "#6B7280" };
            expByCatMap[cid].amount += Number(exp.amount ?? 0);
        }
        const expensesByCategory = Object.values(expByCatMap)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 8)
            .map((c) => ({ ...c, amount: Math.round(c.amount * 100) / 100 }));

        /* ── 8c) Créditos IA ── */
        const iaCreditRaw = await db.iaCredit.findUnique({
            where: { userId },
            select: { total: true, used: true, renewalDate: true },
        });

        /* ── 9) Actividad diaria — sesiones nuevas por día ── */
        const activityDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
        const activityStart = new Date();
        activityStart.setDate(activityStart.getDate() - (activityDays - 1));
        activityStart.setHours(0, 0, 0, 0);

        const recentSessions = await db.session.findMany({
            where: { userId, createdAt: { gte: activityStart } },
            select: { createdAt: true },
        });

        const dayMap: Record<string, number> = {};
        for (let i = 0; i < activityDays; i++) {
            const d = new Date(activityStart);
            d.setDate(d.getDate() + i);
            dayMap[d.toISOString().slice(0, 10)] = 0;
        }
        for (const s of recentSessions) {
            const key = s.createdAt.toISOString().slice(0, 10);
            if (key in dayMap) dayMap[key]++;
        }

        const activityByDay = Object.entries(dayMap).map(([date, count]) => ({
            fecha: date.slice(5), // MM-DD
            nuevas: count,
        }));

        return {
            success: true as const,
            data: {
                period,
                leadStatusCounts,
                workflowCounts,
                totalWorkflows,
                topFlows,
                sessions: {
                    total: totalSessions,
                    new: newSessions,
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
                expenses: {
                    total: Math.round(totalExpenses * 100) / 100,
                    byCategory: expensesByCategory,
                },
                iaCredit: iaCreditRaw
                    ? {
                          total: iaCreditRaw.total,
                          used: iaCreditRaw.used,
                          available: Math.max(0, iaCreditRaw.total - iaCreditRaw.used),
                          renewalDate: iaCreditRaw.renewalDate?.toISOString() ?? null,
                      }
                    : null,
                activityByDay,
            },
        };
    } catch (error) {
        console.error("[getAnalyticsDataByUserId]", error);
        return { success: false as const, message: "Error al obtener analíticas" };
    }
}
