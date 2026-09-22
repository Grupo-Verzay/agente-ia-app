"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { lasCuentasQueConsultaElCrm } from "@/lib/cuentas-del-crm";
import { elTopeDelCrm } from "@/lib/crm-de-la-familia";
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

/**
 * Cuantos informes se leen por cuenta elegida. Crece con las cuentas
 * (`elTopeDelCrm`): dejando los doce de una sola cuenta al unificar tres, las
 * tres se reparten los mismos doce —van ordenados por fecha, asi que se
 * intercalan— y cada una ensena menos informes de los que ensena sola.
 */
const INFORMES_POR_CUENTA = 12;

export async function getWeeklyReports(
    /**
     * Las cuentas que el filtro del CRM tiene puestas. Se re-resuelven en el
     * servidor: una accion ES un endpoint y esta lista llega del navegador.
     */
    cuentasPedidas?: readonly string[] | null,
): Promise<{
    success: boolean;
    data?: WeeklyReportItem[];
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };

        const effectiveId = user.effectiveId;
        const cuentas = await lasCuentasQueConsultaElCrm(effectiveId, cuentasPedidas);

        type RawReport = {
            id: string;
            userId: string;
            period_start: Date;
            period_end: Date;
            summary: string;
            metrics: unknown;
            sent_at: Date | null;
            createdAt: Date;
        };
        // `= ANY(...)` y no un `IN` armado a mano: la lista ya viene resuelta
        // contra la familia, y con un solo parametro no hay forma de que un id
        // de fuera se cuele por el camino.
        const reports = await db.$queryRaw<RawReport[]>`
            SELECT id, "userId", period_start, period_end, summary, metrics, sent_at, "createdAt"
            FROM weekly_reports
            WHERE "userId" = ANY(${cuentas}::text[])
            ORDER BY "createdAt" DESC
            LIMIT ${elTopeDelCrm(INFORMES_POR_CUENTA, cuentas.length)}
        `;

        return {
            success: true,
            data: reports.map((r) => ({
                id: r.id,
                cuentaId: r.userId,
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

/**
 * Y borrar sigue acotado a la cuenta PROPIA, a proposito: **consolidar es para
 * MIRAR, no para editar.** La papelera de un informe de una cuenta hermana
 * contestaria «no encontrada» —menu abierto, puerta cerrada—, asi que la
 * pantalla no la pinta (`esDeOtraCuentaDelCrm`) y aqui el `WHERE` se queda como
 * estaba.
 */
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
