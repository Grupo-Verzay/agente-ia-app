"use server";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { sendingMessages } from "@/actions/sending-messages-actions";
import { normalizeChatHistoryRemoteJid } from "@/lib/chat-history/build-session-id";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeeklyMetrics = {
    periodStart: string;
    periodEnd: string;
    totalLeads: number;
    newLeads: number;
    leadsByStatus: Record<string, number>;
    leadsByScore: { sinScore: number; bajo: number; medio: number; moderado: number; alto: number; listo: number };
    avgScore: number | null;
    topLeads: { name: string; score: number; status: string | null; phone: string }[];
    followUpsSent: number;
    followUpsPending: number;
    conversions: number;
    registrosByTipo: Record<string, number>;
};

export type WeeklyReportItem = {
    id: string;
    periodStart: string;
    periodEnd: string;
    summary: string;
    metrics: WeeklyMetrics;
    sentAt: string | null;
    createdAt: string;
};

// ─── Collect metrics ──────────────────────────────────────────────────────────

async function collectMetrics(userId: string, from: Date, to: Date): Promise<WeeklyMetrics> {
    const [sessions, scores, newSessions, followUps, registros] = await Promise.all([
        db.session.findMany({
            where: { userId },
            select: { id: true, pushName: true, remoteJid: true, leadStatus: true },
        }),
        db.$queryRaw<{ id: string; lead_score: number | null }[]>`
            SELECT id, lead_score FROM "Session" WHERE "userId" = ${userId}
        `,
        db.session.count({ where: { userId, createdAt: { gte: from, lte: to } } }),
        db.crmFollowUp.findMany({
            where: { userId, createdAt: { gte: from, lte: to } },
            select: { status: true },
        }),
        db.registro.findMany({
            where: { session: { userId }, createdAt: { gte: from, lte: to }, tipo: { not: "REPORTE" } },
            select: { tipo: true },
        }),
    ]);

    const scoreMap = new Map(scores.map((s) => [s.id, s.lead_score]));

    const leadsByStatus: Record<string, number> = {
        FRIO: 0, TIBIO: 0, CALIENTE: 0, FINALIZADO: 0, DESCARTADO: 0, SIN_CLASIFICAR: 0,
    };
    const leadsByScore = { sinScore: 0, bajo: 0, medio: 0, moderado: 0, alto: 0, listo: 0 };
    const scoredSessions: number[] = [];

    for (const s of sessions) {
        const st = s.leadStatus ?? "SIN_CLASIFICAR";
        leadsByStatus[st] = (leadsByStatus[st] ?? 0) + 1;

        const leadScore = scoreMap.get(s.id) ?? null;
        if (leadScore === null) {
            leadsByScore.sinScore++;
        } else {
            scoredSessions.push(leadScore);
            if (leadScore <= 25)      leadsByScore.bajo++;
            else if (leadScore <= 50) leadsByScore.medio++;
            else if (leadScore <= 75) leadsByScore.moderado++;
            else if (leadScore <= 90) leadsByScore.alto++;
            else                      leadsByScore.listo++;
        }
    }

    const avgScore = scoredSessions.length
        ? Math.round(scoredSessions.reduce((a, b) => a + b, 0) / scoredSessions.length)
        : null;

    const topLeads = sessions
        .filter((s) => scoreMap.get(s.id) !== null && scoreMap.get(s.id) !== undefined)
        .sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
        .slice(0, 5)
        .map((s) => ({
            name: s.pushName,
            score: scoreMap.get(s.id)!,
            status: s.leadStatus,
            phone: s.remoteJid.replace(/@.*/, ""),
        }));

    const followUpsSent = followUps.filter((f) => f.status === "SENT").length;
    const followUpsPending = followUps.filter((f) => f.status === "PENDING").length;
    const conversions = leadsByStatus["FINALIZADO"] ?? 0;

    const registrosByTipo: Record<string, number> = {};
    for (const r of registros) {
        registrosByTipo[r.tipo] = (registrosByTipo[r.tipo] ?? 0) + 1;
    }

    return {
        periodStart: from.toISOString(),
        periodEnd: to.toISOString(),
        totalLeads: sessions.length,
        newLeads: newSessions,
        leadsByStatus,
        leadsByScore,
        avgScore,
        topLeads,
        followUpsSent,
        followUpsPending,
        conversions,
        registrosByTipo,
    };
}

// ─── AI narrative ─────────────────────────────────────────────────────────────

const REPORT_PROMPT = `Eres un asistente de ventas. Genera un resumen ejecutivo semanal en español, amigable y orientado a acción, basado en estas métricas de CRM. Máximo 3 párrafos cortos. Destaca lo más importante, tendencias y una recomendación concreta para la próxima semana. No uses listas, escribe en prosa fluida.`;

async function generateNarrative(userId: string, metrics: WeeklyMetrics): Promise<string> {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { defaultProviderId: true, defaultAiModelId: true },
    });
    if (!user?.defaultProviderId) return formatFallbackSummary(metrics);

    const [config, provider, model] = await Promise.all([
        db.userAiConfig.findFirst({
            where: { userId, providerId: user.defaultProviderId, isActive: true },
            select: { apiKey: true },
        }),
        db.aiProvider.findUnique({ where: { id: user.defaultProviderId }, select: { name: true } }),
        user.defaultAiModelId
            ? db.aiModel.findUnique({ where: { id: user.defaultAiModelId }, select: { name: true } })
            : null,
    ]);

    if (!config?.apiKey || !provider?.name) return formatFallbackSummary(metrics);

    const modelName = model?.name ?? (provider.name === "google" ? "gemini-2.0-flash" : "gpt-4o-mini");
    const content = `${REPORT_PROMPT}\n\nMétricas:\n${JSON.stringify(metrics, null, 2)}`;

    try {
        if (provider.name === "google") {
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey: config.apiKey });
            const res = await ai.models.generateContent({ model: modelName, contents: content });
            return res.text?.trim() || formatFallbackSummary(metrics);
        }
        const OpenAI = (await import("openai")).default;
        const client = new OpenAI({ apiKey: config.apiKey });
        const res = await client.chat.completions.create({
            model: modelName,
            messages: [{ role: "user", content }],
            max_completion_tokens: 500,
        });
        return res.choices[0]?.message?.content?.trim() || formatFallbackSummary(metrics);
    } catch {
        return formatFallbackSummary(metrics);
    }
}

function formatFallbackSummary(m: WeeklyMetrics): string {
    const lines = [
        `Semana del ${new Date(m.periodStart).toLocaleDateString("es-ES")} al ${new Date(m.periodEnd).toLocaleDateString("es-ES")}.`,
        `Total de leads: ${m.totalLeads} (${m.newLeads} nuevos esta semana).`,
        m.avgScore !== null ? `Score promedio: ${m.avgScore}/100.` : "Sin leads puntuados aún.",
        `Leads calientes: ${m.leadsByStatus["CALIENTE"] ?? 0}. Finalizados: ${m.conversions}.`,
        `Follow-ups enviados: ${m.followUpsSent}.`,
    ];
    return lines.join(" ");
}

// ─── WhatsApp send ────────────────────────────────────────────────────────────

function formatWhatsAppReport(metrics: WeeklyMetrics, summary: string): string {
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    const from = new Date(metrics.periodStart).toLocaleDateString("es-ES", opts);
    const to   = new Date(metrics.periodEnd).toLocaleDateString("es-ES", { ...opts, year: "numeric" });
    const sep  = "--------•--------•--------•--------";

    const scored = metrics.totalLeads - metrics.leadsByScore.sinScore;
    const scoreSection = scored > 0
        ? [
            `🟢 Alto/Listo: ${metrics.leadsByScore.alto + metrics.leadsByScore.listo}`,
            `🟡 Moderado:   ${metrics.leadsByScore.moderado}`,
            `🔴 Bajo/Medio: ${metrics.leadsByScore.bajo + metrics.leadsByScore.medio}`,
            `⚪ Sin puntuar: ${metrics.leadsByScore.sinScore}`,
          ].join("\n")
        : "⚪ Sin leads puntuados aún";

    const lines = [
        `📊 *REPORTE SEMANAL*`,
        `📅 ${from} – ${to}`,
        sep,
    ];

    lines.push(
        `📈 *MÉTRICAS CLAVE*`,
        `👥 Total leads: *${metrics.totalLeads}* (${metrics.newLeads} nuevos esta semana)`,
        `❄️ Fríos: *${metrics.leadsByStatus["FRIO"] ?? 0}*`,
        `🌡️ Tibios: *${metrics.leadsByStatus["TIBIO"] ?? 0}*`,
        `🔥 Calientes: *${metrics.leadsByStatus["CALIENTE"] ?? 0}*`,
        `✅ Finalizados: *${metrics.conversions}*`,
        `📤 Follow-ups enviados: *${metrics.followUpsSent}*`,
        sep,
        `📊 *PUNTUACIÓN*`,
        scoreSection,
    );

    const TIPO_CONFIG: Record<string, { emoji: string; label: string }> = {
        PAGO:      { emoji: "💰", label: "Pagos" },
        CITA:      { emoji: "📅", label: "Citas" },
        RESERVA:   { emoji: "🏨", label: "Reservas" },
        SOLICITUD: { emoji: "📝", label: "Solicitudes" },
        RECLAMO:   { emoji: "😤", label: "Reclamos" },
        PEDIDO:    { emoji: "📦", label: "Pedidos" },
        PRODUCTO:  { emoji: "🛍️", label: "Productos" },
    };

    const actividadLines = Object.entries(metrics.registrosByTipo)
        .filter(([tipo, count]) => count > 0 && TIPO_CONFIG[tipo])
        .map(([tipo, count]) => `${TIPO_CONFIG[tipo].emoji} ${TIPO_CONFIG[tipo].label}: *${count}*`);

    if (actividadLines.length > 0) {
        lines.push(sep, `📋 *ACTIVIDAD*`, ...actividadLines);
    }

    lines.push(
        sep,
        `_🤖 Generado por tu Agente IA_`,
    );

    return lines.join("\n");
}

async function getUserDispatchConfig(userId: string) {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: {
            notificationNumber: true,
            apiKey: { select: { url: true, key: true } },
            instancias: {
                select: { instanceName: true, instanceType: true },
                take: 1,
            },
        },
    });
    console.log("[weeklyReport] dispatch config:", JSON.stringify({
        notificationNumber: user?.notificationNumber,
        hasApiKey: !!user?.apiKey?.url,
        apiKeyUrl: user?.apiKey?.url,
        hasInstance: !!user?.instancias[0],
        instanceName: user?.instancias[0]?.instanceName,
    }));
    if (!user?.notificationNumber || !user.apiKey?.url || !user.instancias[0]) return null;
    const rawUrl = user.apiKey.url;
    const serverUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    return {
        notificationNumber: user.notificationNumber,
        serverUrl,
        apikey: user.apiKey.key ?? "",
        instanceName: user.instancias[0].instanceName,
    };
}

// ─── Core generator ───────────────────────────────────────────────────────────

export async function generateWeeklyReportForUser(userId: string): Promise<{
    success: boolean;
    reportId?: string;
    sent?: boolean;
    message?: string;
}> {
    const to   = new Date();
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    console.log("[weeklyReport] collecting metrics for", userId);
    const metrics  = await collectMetrics(userId, from, to);
    console.log("[weeklyReport] metrics collected, generating narrative");
    const summary  = await generateNarrative(userId, metrics);
    console.log("[weeklyReport] narrative ready, saving to DB");

    const reportId = randomUUID();
    await db.$executeRaw`
        INSERT INTO weekly_reports (id, "userId", period_start, period_end, summary, metrics, "createdAt")
        VALUES (${reportId}, ${userId}, ${from}, ${to}, ${summary}, ${JSON.stringify(metrics)}::jsonb, NOW())
    `;

    // Send via WhatsApp
    let sent = false;
    let whatsappError: string | undefined;
    const dispatch = await getUserDispatchConfig(userId);
    if (!dispatch) {
        whatsappError = "Falta configuración: número de notificación, API Key o instancia de WhatsApp";
    } else {
        const text = formatWhatsAppReport(metrics, summary);
        const url  = `${dispatch.serverUrl}/message/sendText/${dispatch.instanceName}`;
        const jid  = normalizeChatHistoryRemoteJid(dispatch.notificationNumber);
        const res  = await sendingMessages({ url, apikey: dispatch.apikey, remoteJid: jid, text });
        if (res.success) {
            await db.$executeRaw`UPDATE weekly_reports SET sent_at = NOW() WHERE id = ${reportId}`;
            sent = true;
        } else {
            whatsappError = `Error al enviar: ${(res as any).message ?? "respuesta inesperada del servidor"}`;
        }
    }

    return { success: true, reportId, sent, whatsappError };
}

// ─── Cron: all users ──────────────────────────────────────────────────────────

export async function runWeeklyReportForAllUsers(): Promise<{
    success: boolean;
    processed: number;
    sent: number;
    errors: number;
}> {
    const users = await db.user.findMany({
        where: {
            status: true,
            notificationNumber: { not: "" },
            instancias: { some: {} },
        },
        select: { id: true },
    });

    let processed = 0, sent = 0, errors = 0;

    for (const user of users) {
        try {
            const res = await generateWeeklyReportForUser(user.id);
            processed++;
            if (res.sent) sent++;
        } catch (err) {
            console.error(`[weeklyReport] userId=${user.id}`, err);
            errors++;
        }
    }

    return { success: true, processed, sent, errors };
}

// ─── UI: list reports ─────────────────────────────────────────────────────────

export async function getWeeklyReports(): Promise<{
    success: boolean;
    data?: WeeklyReportItem[];
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };

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
            WHERE "userId" = ${user.id}
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

        const res = await generateWeeklyReportForUser(user.id);
        return { success: res.success, reportId: res.reportId, sent: res.sent, message: res.whatsappError };
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
        await db.$executeRaw`DELETE FROM weekly_reports WHERE id = ${id} AND "userId" = ${user.id}`;
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
        await db.$executeRaw`DELETE FROM weekly_reports WHERE "userId" = ${user.id}`;
        return { success: true };
    } catch (err) {
        console.error("[deleteAllWeeklyReports]", err);
        return { success: false, message: "Error al eliminar los reportes." };
    }
}
