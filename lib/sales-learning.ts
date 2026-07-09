import { db } from "@/lib/db";

type AiConfig = { apiKey: string; provider: string; model: string };
type OutcomeAnalysis = {
  product?: string;
  outcomeReason?: string;
  keyArguments?: string[];
  objections?: string[];
  effectiveSteps?: string[];
};

export type SalesPlaybook = {
  product: string;
  stage: string;
  questions: string[];
  nextSteps: string[];
  arguments: string[];
  warnings: string[];
  evidence: { total: number; won: number; lost: number; winRate: number | null; label: string };
};

async function aiConfig(userId: string): Promise<AiConfig | null> {
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
    db.aiProvider.findUnique({ where: { id: user.defaultProviderId }, select: { name: true } }),
    user.defaultAiModelId
      ? db.aiModel.findUnique({ where: { id: user.defaultAiModelId }, select: { name: true } })
      : null,
  ]);
  if (!config?.apiKey || !provider?.name) return null;
  const providerName = provider.name.toLowerCase();
  return {
    apiKey: config.apiKey,
    provider: providerName,
    model: model?.name ?? (providerName === "google" ? "gemini-2.0-flash" : "gpt-4o-mini"),
  };
}

async function generateJson<T>(config: AiConfig, prompt: string): Promise<T | null> {
  try {
    let raw = "{}";
    if (config.provider === "google") {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const result = await ai.models.generateContent({
        model: config.model,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0.15 },
      });
      raw = result.text ?? "{}";
    } else {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: config.apiKey });
      const result = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 900,
      });
      raw = result.choices[0]?.message?.content ?? "{}";
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("[sales-learning:generateJson]", error);
    return null;
  }
}

function list(value: unknown, max = 6): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, max)
    : [];
}

function productFromProfile(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  for (const key of ["producto", "product", "servicio", "service", "interes", "interés", "plan"]) {
    const value = String(record[key] ?? "").trim();
    if (value) return value.slice(0, 120);
  }
  return null;
}

async function getConversation(userId: string, remoteJid: string, take = 100) {
  const messages = await db.chatMessage.findMany({
    where: { userId, remoteJid },
    orderBy: { messageTimestamp: "desc" },
    take,
    select: { fromMe: true, content: true, messageTimestamp: true },
  });
  return {
    messages,
    text: [...messages].reverse()
      .filter((item) => item.content?.trim())
      .map((item) => `${item.fromMe ? "ASESOR" : "CLIENTE"}: ${item.content}`)
      .join("\n")
      .slice(-30_000),
  };
}

export async function recordConfirmedSalesOutcome(sessionId: number, outcome: "WON" | "LOST") {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, remoteJid: true, createdAt: true, leadStatus: true },
  });
  if (!session) return;
  const [conversation, profile, config] = await Promise.all([
    getConversation(session.userId, session.remoteJid),
    db.externalClientData.findUnique({
      where: { userId_remoteJid: { userId: session.userId, remoteJid: session.remoteJid } },
      select: { data: true },
    }),
    aiConfig(session.userId),
  ]);
  const knownProduct = productFromProfile(profile?.data);
  const analysis = config && conversation.text
    ? await generateJson<OutcomeAnalysis>(config, `Analiza esta venta con resultado CONFIRMADO ${outcome === "WON" ? "GANADA" : "PERDIDA"}.
Devuelve SOLO JSON: {"product":"","outcomeReason":"","keyArguments":[],"objections":[],"effectiveSteps":[]}
No inventes. Los argumentos y acciones deben aparecer realmente en la conversación.
Producto conocido: ${knownProduct ?? "desconocido"}.
CONVERSACION:
${conversation.text}`)
    : null;
  const timestamps = conversation.messages
    .map((item) => item.messageTimestamp ? new Date(item.messageTimestamp).getTime() : NaN)
    .filter(Number.isFinite);
  const lastTime = timestamps.length ? Math.max(...timestamps) : Date.now();
  const product = (knownProduct || analysis?.product || "General").trim().slice(0, 120);
  const values = {
    outcome,
    product,
    stage: session.leadStatus ?? (outcome === "WON" ? "FINALIZADO" : "DESCARTADO"),
    outcomeReason: analysis?.outcomeReason?.slice(0, 600),
    keyArguments: list(analysis?.keyArguments),
    objections: list(analysis?.objections),
    effectiveSteps: list(analysis?.effectiveSteps),
    cycleDays: Math.max(0, Math.ceil((lastTime - session.createdAt.getTime()) / 86_400_000)),
    evidenceCount: conversation.messages.length,
  };
  await db.salesOutcomeLearning.upsert({
    where: { userId_sessionId: { userId: session.userId, sessionId: session.id } },
    create: { userId: session.userId, sessionId: session.id, ...values },
    update: values,
  });
}

const FALLBACK: Record<string, Pick<SalesPlaybook, "questions" | "nextSteps" | "arguments" | "warnings">> = {
  FRIO: {
    questions: ["¿Qué resultado quiere conseguir?", "¿Cómo resuelve hoy esta necesidad?"],
    nextSteps: ["Confirmar necesidad y responsable de decisión", "Acordar el siguiente contacto"],
    arguments: ["Conectar el beneficio con el problema expresado"],
    warnings: ["No presentar todo el producto antes de entender la necesidad"],
  },
  TIBIO: {
    questions: ["¿Qué opción está comparando?", "¿Qué necesitaría validar para avanzar?"],
    nextSteps: ["Resolver la principal objeción", "Definir fecha concreta de decisión"],
    arguments: ["Usar un caso relacionado con su necesidad"],
    warnings: ["Evitar cerrar sin fecha ni próximo paso"],
  },
  CALIENTE: {
    questions: ["¿Hay algún bloqueo para iniciar?", "¿Quién debe confirmar la decisión?"],
    nextSteps: ["Confirmar alcance, valor y fecha", "Solicitar una decisión concreta"],
    arguments: ["Resumir el valor acordado y reducir el riesgo de inicio"],
    warnings: ["No agregar complejidad nueva al final del proceso"],
  },
  FINALIZADO: { questions: [], nextSteps: ["Confirmar entrega y siguiente oportunidad"], arguments: [], warnings: [] },
  DESCARTADO: { questions: [], nextSteps: ["Registrar el motivo real de pérdida"], arguments: [], warnings: [] },
};

export async function buildDynamicSalesPlaybook(sessionId: number): Promise<SalesPlaybook | null> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, remoteJid: true, leadStatus: true },
  });
  if (!session) return null;
  const [conversation, profile, config] = await Promise.all([
    getConversation(session.userId, session.remoteJid, 40),
    db.externalClientData.findUnique({
      where: { userId_remoteJid: { userId: session.userId, remoteJid: session.remoteJid } },
      select: { data: true },
    }),
    aiConfig(session.userId),
  ]);
  const knownProduct = productFromProfile(profile?.data);
  let learning = await db.salesOutcomeLearning.findMany({
    where: { userId: session.userId, ...(knownProduct ? { product: { equals: knownProduct, mode: "insensitive" } } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  if (!learning.length && knownProduct) {
    learning = await db.salesOutcomeLearning.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
  }
  const won = learning.filter((item) => item.outcome === "WON").length;
  const lost = learning.filter((item) => item.outcome === "LOST").length;
  const stage = session.leadStatus ?? "FRIO";
  const inferredProduct = knownProduct || learning[0]?.product || "General";
  const generated = config && conversation.text
    ? await generateJson<Partial<SalesPlaybook>>(config, `Crea un playbook breve para ayudar al asesor. No redactes mensajes para enviar.
Devuelve SOLO JSON: {"product":"","questions":[],"nextSteps":[],"arguments":[],"warnings":[]}
Etapa: ${stage}. Producto: ${inferredProduct}. Máximo 3 elementos por lista. No prometas resultados.
CONVERSACION:
${conversation.text}
CIERRES CONFIRMADOS:
${JSON.stringify(learning.map((item) => ({
  outcome: item.outcome, product: item.product, reason: item.outcomeReason,
  arguments: item.keyArguments, objections: item.objections, steps: item.effectiveSteps,
}))).slice(0, 18_000)}`)
    : null;
  const fallback = FALLBACK[stage] ?? FALLBACK.FRIO;
  const pick = (value: unknown, base: string[]) => list(value, 3).length ? list(value, 3) : base;
  const total = won + lost;
  return {
    product: String(generated?.product || inferredProduct).slice(0, 120),
    stage,
    questions: pick(generated?.questions, fallback.questions),
    nextSteps: pick(generated?.nextSteps, fallback.nextSteps),
    arguments: pick(generated?.arguments, fallback.arguments),
    warnings: pick(generated?.warnings, fallback.warnings),
    evidence: {
      total, won, lost,
      winRate: total ? Math.round((won / total) * 100) : null,
      label: total ? `${total} cierre${total === 1 ? "" : "s"} confirmado${total === 1 ? "" : "s"}` : "Sin historial confirmado; guía base",
    },
  };
}
