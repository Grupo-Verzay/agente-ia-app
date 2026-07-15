"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import {
  detectClientPromise,
  detectCommitment,
  type DetectedCommitment,
} from "@/lib/commitment-detection";

type IntelligenceResult = {
  requested?: string;
  objections?: string[];
  agreements?: string[];
  nextSteps?: string[];
  businessProfile?: Record<string, string | number | boolean | null>;
  clientPromises?: Array<{ title?: string; dueDate?: string }>;
};

async function getAiConfig(userId: string) {
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
  return {
    apiKey: config.apiKey,
    provider: provider.name.toLowerCase(),
    model: model?.name ?? (provider.name.toLowerCase() === "google" ? "gemini-2.0-flash" : "gpt-4o-mini"),
  };
}

async function analyzeConversation(userId: string, conversation: string): Promise<IntelligenceResult | null> {
  const cfg = await getAiConfig(userId);
  if (!cfg) return null;
  const prompt = `Analiza esta conversación comercial. Devuelve SOLO JSON:
{
  "requested":"qué pidió el cliente, breve",
  "objections":["objeciones reales"],
  "agreements":["acuerdos alcanzados"],
  "nextSteps":["próximos pasos"],
  "businessProfile":{"empresa":"","contacto":"","email":"","ciudad":"","necesidad":"","interes":"","presupuesto":"","fechaDecision":""},
  "clientPromises":[{"title":"promesa concreta del cliente","dueDate":"ISO 8601 o vacío"}]
}
No inventes datos. Omite valores desconocidos. Fecha actual: ${new Date().toISOString()}.

CONVERSACIÓN:
${conversation}`;

  let raw = "{}";
  if (cfg.provider === "google") {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
    const result = await ai.models.generateContent({
      model: cfg.model,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });
    raw = result.text ?? "{}";
  } else {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: cfg.apiKey });
    const result = await client.chat.completions.create({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 900,
    });
    raw = result.choices[0]?.message?.content ?? "{}";
  }
  try {
    return JSON.parse(raw) as IntelligenceResult;
  } catch {
    return null;
  }
}

type AdvisorCommitmentPrediction = {
  hasCommitment?: boolean;
  kind?: DetectedCommitment["kind"];
  title?: string;
  type?: DetectedCommitment["type"];
  dueDate?: string;
};

export async function predictAdvisorCommitmentAction(text: string, context = "") {
  const user = await currentUser();
  if (!user?.id || !text?.trim()) return { success: false, commitment: null };

  const localCommitment = detectCommitment(text, undefined, context);
  if (localCommitment) return { success: true, commitment: localCommitment };

  const ownerId = user.ownerId ?? user.id;
  const cfg = await getAiConfig(ownerId);
  if (!cfg) return { success: true, commitment: null };

  const now = new Date();
  const prompt = `Analiza el mensaje que un asesor acaba de enviar a un cliente.
Detecta solamente compromisos futuros concretos del asesor que deban convertirse en tarea, recordatorio o cita.
No detectes saludos, preguntas, información ya enviada, acciones del cliente ni frases vagas sin fecha interpretable.

Devuelve SOLO JSON con esta forma:
{
  "hasCommitment": true o false,
  "kind": "task" | "reminder" | "appointment",
  "title": "acción breve para el asesor",
  "type": "Seguimiento" | "Llamada" | "Reunión" | "Email" | "Tarea",
  "dueDate": "fecha ISO 8601"
}

Fecha y hora actual: ${now.toISOString()}.
Si no existe un compromiso futuro claro o no puedes determinar una fecha futura, responde {"hasCommitment":false}.

MENSAJE DEL ASESOR:
${text.trim()}

CONTEXTO RECIENTE:
${context.trim() || "Sin contexto"}`;

  try {
    let raw = "{}";
    if (cfg.provider === "google") {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
      const result = await ai.models.generateContent({
        model: cfg.model,
        contents: prompt,
        config: { responseMimeType: "application/json", temperature: 0 },
      });
      raw = result.text ?? "{}";
    } else {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: cfg.apiKey });
      const result = await client.chat.completions.create({
        model: cfg.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 300,
      });
      raw = result.choices[0]?.message?.content ?? "{}";
    }

    const prediction = JSON.parse(raw) as AdvisorCommitmentPrediction;
    const dueDate = prediction.dueDate ? new Date(prediction.dueDate) : null;
    const validKinds = new Set<DetectedCommitment["kind"]>(["task", "reminder", "appointment"]);
    const validTypes = new Set<DetectedCommitment["type"]>([
      "Seguimiento", "Llamada", "Reunión", "Email", "Tarea",
    ]);

    if (
      prediction.hasCommitment !== true ||
      !prediction.kind ||
      !validKinds.has(prediction.kind) ||
      !prediction.title?.trim() ||
      !prediction.type ||
      !validTypes.has(prediction.type) ||
      !dueDate ||
      Number.isNaN(dueDate.getTime()) ||
      dueDate <= now
    ) {
      return { success: true, commitment: null };
    }

    const commitment: DetectedCommitment = {
      kind: prediction.kind,
      title: prediction.title.trim().slice(0, 160),
      type: prediction.type,
      dueDate,
      sourceText: text.trim(),
    };
    return { success: true, commitment };
  } catch (error) {
    console.error("[predictAdvisorCommitmentAction]", error);
    return { success: false, commitment: null };
  }
}

function list(values?: string[]) {
  return values?.filter(Boolean).map((value) => `- ${value}`).join("\n") || "- Sin información";
}

export async function generateConversationIntelligence(args: {
  sessionId: number;
  actorId: string;
  reason: "resolved" | "transferred";
  targetAdvisorId?: string | null;
}) {
  const session = await db.session.findUnique({
    where: { id: args.sessionId },
    select: {
      id: true, userId: true, remoteJid: true, pushName: true, customName: true,
      assignedAdvisorId: true,
    },
  });
  if (!session) return { success: false, message: "Sesión no encontrada." };

  const messages = await db.chatMessage.findMany({
    where: { userId: session.userId, remoteJid: session.remoteJid },
    orderBy: { messageTimestamp: "desc" },
    take: 100,
    select: { fromMe: true, content: true, messageTimestamp: true },
  });
  const conversation = messages.reverse()
    .filter((item) => item.content?.trim())
    .map((item) => `${item.fromMe ? "ASESOR" : "CLIENTE"}: ${item.content}`)
    .join("\n")
    .slice(-30_000);
  if (!conversation) return { success: true, message: "Sin mensajes para resumir." };

  const result = await analyzeConversation(session.userId, conversation);
  const fallback = messages.slice(-12)
    .map((item) => `${item.fromMe ? "Asesor" : "Cliente"}: ${item.content ?? ""}`)
    .join("\n");
  const content = result
    ? `RESUMEN IA · ${args.reason === "transferred" ? "Relevo de asesor" : "Conversación cerrada"}

Qué pidió:
${result.requested || "Sin información"}

Objeciones:
${list(result.objections)}

Acuerdos:
${list(result.agreements)}

Próximos pasos:
${list(result.nextSteps)}`
    : `RESUMEN DE CONVERSACIÓN\n\n${fallback}`;

  const note = await db.internalNote.create({
    data: {
      sessionId: session.id,
      authorId: args.actorId,
      content,
      mentionedUserIds: args.targetAdvisorId ? [args.targetAdvisorId] : [],
    },
  });
  if (args.targetAdvisorId) {
    await (db as any).collabNotification.create({
      data: {
        recipientId: args.targetAdvisorId,
        actorId: args.actorId,
        type: "mention",
        sessionId: session.id,
        noteId: note.id,
        remoteJid: session.remoteJid,
        content: content.slice(0, 140),
      },
    }).catch(() => null);
  }

  const profileEntries = Object.entries(result?.businessProfile ?? {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim());
  if (profileEntries.length) {
    const existing = await db.externalClientData.findUnique({
      where: { userId_remoteJid: { userId: session.userId, remoteJid: session.remoteJid } },
      select: { data: true },
    });
    const previous = existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data)
      ? existing.data as Record<string, unknown>
      : {};
    const extracted = Object.fromEntries(profileEntries);
    await db.externalClientData.upsert({
      where: { userId_remoteJid: { userId: session.userId, remoteJid: session.remoteJid } },
      create: {
        userId: session.userId, remoteJid: session.remoteJid,
        data: extracted as Prisma.InputJsonValue, source: "conversation-ai",
      },
      update: {
        data: { ...previous, ...extracted } as Prisma.InputJsonValue,
        source: "conversation-ai",
      },
    });
  }

  const assigneeId = session.assignedAdvisorId || args.actorId;
  for (const promise of result?.clientPromises ?? []) {
    const dueDate = promise.dueDate ? new Date(promise.dueDate) : null;
    if (!promise.title || !dueDate || Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) continue;
    const promiseTitle = promise.title.toLowerCase().startsWith("promesa cliente:")
      ? promise.title
      : `Promesa cliente: ${promise.title}`;
    const duplicate = await db.task.findFirst({
      where: {
        sessionId: session.id, assignedToId: assigneeId, status: "pending",
        title: promiseTitle,
        dueDate: { gte: new Date(dueDate.getTime() - 3_600_000), lte: new Date(dueDate.getTime() + 3_600_000) },
      },
      select: { id: true },
    });
    if (!duplicate) {
      await db.task.create({
        data: {
          ownerId: session.userId, assignedToId: assigneeId,
          sessionId: session.id, contactName: session.customName || session.pushName,
          contactJid: session.remoteJid, title: promiseTitle, type: "Seguimiento",
          dueDate, status: "pending", createdById: args.actorId,
        },
      });
    }
  }
  return { success: true, message: "Inteligencia de conversación actualizada." };
}

export async function createClientPromiseFollowUpAction(args: {
  sessionId: number;
  text: string;
  assignedToId: string;
}) {
  const user = await currentUser();
  if (!user?.id) return { success: false, created: false };
  const ownerId = user.ownerId ?? user.id;
  const session = await db.session.findFirst({
    where: { id: args.sessionId, userId: ownerId },
    select: { id: true, remoteJid: true, pushName: true, customName: true },
  });
  if (!session) return { success: false, created: false };
  const promise = detectClientPromise(args.text);
  if (!promise) return { success: true, created: false };
  const duplicate = await db.task.findFirst({
    where: {
      sessionId: session.id, title: promise.title, status: "pending",
      dueDate: {
        gte: new Date(promise.dueDate.getTime() - 3_600_000),
        lte: new Date(promise.dueDate.getTime() + 3_600_000),
      },
    },
    select: { id: true },
  });
  if (duplicate) return { success: true, created: false };
  await db.task.create({
    data: {
      ownerId, assignedToId: args.assignedToId, sessionId: session.id,
      contactName: session.customName || session.pushName, contactJid: session.remoteJid,
      title: promise.title, type: "Seguimiento", dueDate: promise.dueDate,
      status: "pending", createdById: user.id,
    },
  });
  return { success: true, created: true, title: promise.title };
}
