"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import {
    generateWeeklyReportForUser,
    type WeeklyMetrics,
    type WeeklyReportItem,
} from "@/lib/weekly-report-runner.server";

export type { WeeklyMetrics, WeeklyReportItem };

/**
 * Las cuatro acciones del informe semanal que abre una pantalla: listar,
 * generar el mio, borrar uno y borrarlos todos. Las cuatro resuelven
 * `currentUser()` y trabajan sobre SU cuenta.
 *
 * Lo que se fue de aqui es la maquinaria —recoger metricas, redactar y
 * enviar—, que vive en `lib/weekly-report-runner.server.ts` con el motivo
 * escrito al lado. En dos palabras: **una accion es un endpoint**, y
 * `generateWeeklyReportForUser(userId)` aceptaba el id que le mandaran.
 */

// ─── UI: list reports ─────────────────────────────────────────────────────────

export async function getWeeklyReports(): Promise<{
    success: boolean;
    data?: WeeklyReportItem[];
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };

        const effectiveId = user.effectiveId;

        type RawReport = {
            id: string;
            period_start: Date;
            period_end: Date;
            summary: string;
            metrics: unknown;
            sent_at: Date | null;
            createdAt: Date;
        };
        const reports = await db.$queryRaw<RawReport[]>`
            SELECT id, period_start, period_end, summary, metrics, sent_at, "createdAt"
            FROM weekly_reports
            WHERE "userId" = ${effectiveId}
            ORDER BY "createdAt" DESC
            LIMIT 12
        `;

        return {
            success: true,
            data: reports.map((r) => ({
                id: r.id,
                periodStart: r.period_start.toISOString(),
                periodEnd: r.period_end.toISOString(),
                summary: r.summary,
                metrics: r.metrics as WeeklyMetrics,
                sentAt: r.sent_at?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
            })),
        };
    } catch (err) {
        console.error("[getWeeklyReports]", err);
        return { success: false, message: "Error al cargar reportes." };
    }
}

// ─── UI: generate on demand ───────────────────────────────────────────────────

export async function generateMyWeeklyReport(): Promise<{
    success: boolean;
    reportId?: string;
    sent?: boolean;
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };

        const effectiveId = user.effectiveId;
        const res = await generateWeeklyReportForUser(effectiveId);
        return { success: res.success, reportId: res.reportId, sent: res.sent, message: res.message };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generateMyWeeklyReport]", err);
        return { success: false, message: msg };
    }
}

// ─── UI: delete reports ───────────────────────────────────────────────────────

export async function deleteWeeklyReport(id: string): Promise<{ success: boolean; message?: string }> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };
        const effectiveId = user.effectiveId;
        await db.$executeRaw`DELETE FROM weekly_reports WHERE id = ${id} AND "userId" = ${effectiveId}`;
        return { success: true };
    } catch (err) {
        console.error("[deleteWeeklyReport]", err);
        return { success: false, message: "Error al eliminar el reporte." };
    }
}

export async function deleteAllWeeklyReports(): Promise<{ success: boolean; message?: string }> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };
        const effectiveId = user.effectiveId;
        await db.$executeRaw`DELETE FROM weekly_reports WHERE "userId" = ${effectiveId}`;
        return { success: true };
    } catch (err) {
        console.error("[deleteAllWeeklyReports]", err);
        return { success: false, message: "Error al eliminar los reportes." };
    }
}
