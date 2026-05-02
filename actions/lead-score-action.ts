"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

const SCORE_PROMPT = `Eres un experto en ventas y CRM. Analiza el siguiente resumen de conversación con un prospecto y asígnale un Lead Score del 0 al 100.

Criterios de puntuación:
- 0-25: Sin interés real, sin datos de contacto, conversación vacía o irrelevante
- 26-50: Interés bajo, exploración superficial, sin compromiso claro
- 51-75: Interés moderado, consultas concretas, pero sin avanzar al cierre
- 76-90: Interés alto, solicita información detallada, manifiesta intención de compra
- 91-100: Listo para cerrar, confirmó interés, aceptó propuesta o solicitó cotización

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "score": <número entero entre 0 y 100>,
  "reason": "<explicación breve de máximo 120 caracteres del por qué de ese puntaje>"
}

Conversación a analizar:
`;

async function callAI(providerName: string, apiKey: string, modelName: string, conversacion: string): Promise<string> {
    if (providerName === "google") {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        const result = await ai.models.generateContent({
            model: modelName,
            contents: SCORE_PROMPT + conversacion,
            config: { responseMimeType: "application/json", temperature: 0.3 },
        });
        return result.text ?? "{}";
    }

    // openai (default)
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
        model: modelName,
        messages: [
            { role: "system", content: SCORE_PROMPT },
            { role: "user", content: conversacion },
        ],
        max_completion_tokens: 400,
        response_format: { type: "json_object" },
    });
    return completion.choices[0]?.message?.content || '{"score":0,"reason":"Sin respuesta del modelo"}';
}

async function getUserAiConfig(userId: string) {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { defaultProviderId: true, defaultAiModelId: true },
    });

    if (!user?.defaultProviderId) return null;

    const [config, provider, model] = await Promise.all([
        db.userAiConfig.findFirst({
            where: { userId, providerId: user.defaultProviderId, isActive: true },
            select: { apiKey: true },
        }),
        db.aiProvider.findUnique({
            where: { id: user.defaultProviderId },
            select: { name: true },
        }),
        user.defaultAiModelId
            ? db.aiModel.findUnique({ where: { id: user.defaultAiModelId }, select: { name: true } })
            : null,
    ]);

    if (!config?.apiKey || !provider?.name) return null;

    return {
        apiKey: config.apiKey,
        providerName: provider.name,
        modelName: model?.name ?? (provider.name === "google" ? "gemini-2.0-flash" : "gpt-4o-mini"),
    };
}

export async function scoreLeadBySessionId(sessionId: number): Promise<{
    success: boolean;
    score?: number;
    reason?: string;
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };

        const aiConfig = await getUserAiConfig(user.id);
        if (!aiConfig) return { success: false, message: "No hay configuración de IA activa. Configúrala en Ajustes." };

        const session = await db.session.findUnique({
            where: { id: sessionId, userId: user.id },
            include: {
                crmFollowUps: {
                    where: { summarySnapshot: { not: null } },
                    orderBy: { scheduledFor: "desc" },
                    take: 5,
                    select: { summarySnapshot: true },
                },
                registros: {
                    where: { tipo: "REPORTE", resumen: { not: null } },
                    orderBy: { updatedAt: "desc" },
                    take: 3,
                    select: { resumen: true },
                },
            },
        });

        if (!session) return { success: false, message: "Sesión no encontrada." };

        const textos = [
            ...session.crmFollowUps.map((f) => f.summarySnapshot).filter(Boolean),
            ...session.registros.map((r) => r.resumen).filter(Boolean),
        ] as string[];

        if (!textos.length) {
            return { success: false, message: "Sin síntesis o reportes para puntuar." };
        }

        const resumenCombinado = textos.join("\n\n---\n\n");

        const raw = await callAI(aiConfig.providerName, aiConfig.apiKey, aiConfig.modelName, resumenCombinado);
        const parsed = JSON.parse(raw) as { score?: number; reason?: string };

        const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score ?? 0))));
        const reason = (parsed.reason ?? "").slice(0, 120);
        const scoredAt = new Date();

        await db.$executeRaw`
            UPDATE "Session"
            SET lead_score = ${score},
                lead_score_reason = ${reason},
                lead_scored_at = ${scoredAt}
            WHERE id = ${sessionId}
        `;

        return { success: true, score, reason };
    } catch (err) {
        console.error("[scoreLeadBySessionId]", err);
        return { success: false, message: "Error al puntuar el lead." };
    }
}

export async function scoreAllLeadsByUserId(): Promise<{
    success: boolean;
    scored?: number;
    message?: string;
}> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "No autorizado." };

        const aiConfig = await getUserAiConfig(user.id);
        if (!aiConfig) return { success: false, message: "No hay configuración de IA activa." };

        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const sessions = await db.session.findMany({
            where: {
                userId: user.id,
                OR: [
                    { crmFollowUps: { some: { summarySnapshot: { not: null } } } },
                    { registros: { some: { tipo: "REPORTE", resumen: { not: null } } } },
                ],
            },
            select: { id: true },
            take: 50,
        });

        // Filtrar los ya puntuados en las últimas 24h via raw para evitar tipos desactualizados
        const scored24h = await db.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "Session"
            WHERE "userId" = ${user.id}
            AND lead_scored_at IS NOT NULL
            AND lead_scored_at > ${cutoff}
        `;
        const recentIds = new Set(scored24h.map((s) => s.id));

        const pendientes = sessions.filter((s) => !recentIds.has(s.id));

        let scored = 0;
        for (const s of pendientes) {
            const res = await scoreLeadBySessionId(s.id);
            if (res.success) scored++;
        }

        return { success: true, scored };
    } catch (err) {
        console.error("[scoreAllLeadsByUserId]", err);
        return { success: false, message: "Error en puntuación masiva." };
    }
}
