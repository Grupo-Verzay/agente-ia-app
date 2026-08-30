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

/**
 * Cuentas cuyas credenciales rechazó el proveedor, con el momento del rechazo.
 *
 * Hay clientes que no usan IA: atienden con asesores humanos y las
 * automatizaciones de los embudos. Si su configuración quedó con una clave
 * inválida —por ejemplo pegando la URL del proveedor en lugar de la clave—, cada
 * mensaje que enviaba un asesor llamaba a OpenAI, esperaba el 401 y lo
 * registraba: latencia en cada envío y un log lleno de un error que no se va a
 * resolver solo.
 *
 * Tras un rechazo se deja de intentar durante un rato en ESA cuenta. Así una
 * cuenta mal configurada no penaliza a las demás, y en cuanto se corrija la
 * clave vuelve a funcionar sin desplegar nada (como mucho, tras la espera).
 */
const AI_AUTH_BACKOFF_MS = 30 * 60_000;
const aiAuthRejectedAt = new Map<string, number>();

/**
 * Nombre legible de una cuenta, para el registro.
 *
 * El identificador por sí solo no sirve de nada a quien lee los logs: hay que
 * ir a buscarlo a la base para saber de quién se trata. Como esto solo se llama
 * al anotar un rechazo de credenciales —una vez cada media hora por cuenta como
 * mucho— la consulta no pesa. Si falla, se devuelve el identificador y el
 * registro sale igual.
 */
async function nombreDeCuenta(userId: string): Promise<string> {
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { company: true, name: true, email: true },
    });
    const etiqueta = u?.company?.trim() || u?.name?.trim() || u?.email?.trim();
    return etiqueta ? `${etiqueta} (${userId})` : userId;
  } catch {
    return userId;
  }
}

/** ¿El proveedor rechazó las credenciales de esta cuenta hace poco? */
function isAiAuthBlocked(userId: string): boolean {
  const at = aiAuthRejectedAt.get(userId);
  if (at === undefined) return false;
  if (Date.now() - at < AI_AUTH_BACKOFF_MS) return true;
  aiAuthRejectedAt.delete(userId);
  return false;
}

/** ¿El error es un rechazo de credenciales y no un fallo puntual del servicio? */
function isAiAuthError(error: unknown): boolean {
  const err = error as { status?: number; code?: string; message?: string };
  if (err?.status === 401 || err?.status === 403) return true;
  if (err?.code === 'invalid_api_key') return true;
  return /api key/i.test(String(err?.message ?? ''));
}

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
  if (isAiAuthBlocked(userId)) return null;

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
  try {
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
  } catch (error) {
    // Solo se absorbe el rechazo de credenciales, que no se arregla
    // reintentando; el resto de fallos siguen propagándose como hasta ahora.
    if (!isAiAuthError(error)) throw error;
    aiAuthRejectedAt.set(userId, Date.now());
    console.error(
      `[analyzeConversation] credenciales rechazadas: cuenta=${await nombreDeCuenta(userId)} ` +
        `proveedor=${cfg.provider}. Se deja de intentar ` +
        `${Math.round(AI_AUTH_BACKOFF_MS / 60_000)} min en esta cuenta.`,
    );
    return null;
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
  // La cuenta ya fue rechazada por el proveedor hace poco: no se vuelve a
  // intentar. La detección local (detectCommitment, arriba) sigue funcionando.
  if (isAiAuthBlocked(ownerId)) return { success: true, commitment: null };

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

    // El proveedor puede devolver cadena VACÍA (no null), y entonces el ?? de
    // arriba no aplica y JSON.parse revienta. Se trata como "sin compromiso".
    const prediction = (raw.trim()
      ? JSON.parse(raw)
      : {}) as AdvisorCommitmentPrediction;
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
    // Se identifica la CUENTA y el final de su key: cuando el proveedor rechaza
    // las credenciales, el error solo trae la key enmascarada y no había forma
    // de saber a qué cuenta corregirle la configuración.
    const keyTail = cfg.apiKey ? `…${cfg.apiKey.slice(-4)}` : "sin key";

    if (isAiAuthError(error)) {
      // Credenciales inválidas: no se arregla reintentando. Se anota la cuenta
      // para dejar de llamar al proveedor durante un rato y se registra UNA
      // línea clara, en vez de repetir el error con cada mensaje.
      aiAuthRejectedAt.set(ownerId, Date.now());
      console.error(
        `[predictAdvisorCommitmentAction] credenciales rechazadas: ` +
          `cuenta=${await nombreDeCuenta(ownerId)} ` +
          `proveedor=${cfg.provider} key=${keyTail}. Se deja de intentar ` +
          `${Math.round(AI_AUTH_BACKOFF_MS / 60_000)} min en esta cuenta.`,
      );
      return { success: false, commitment: null };
    }

    console.error(
      `[predictAdvisorCommitmentAction] cuenta=${ownerId} proveedor=${cfg.provider} key=${keyTail}`,
      error,
    );
    return { success: false, commitment: null };
  }
}

/**
 * Una linea del resumen, o nada si no hay que decir.
 *
 * La nota ocupaba media conversacion: cuatro apartados con su encabezado, cada
 * uno con su lista de guiones, y los vacios escribiendo "- Sin informacion"
 * -tres palabras para decir que no hay nada-. Se queda en dos o tres lineas:
 * los valores van seguidos en una sola linea y el apartado que no tiene nada
 * sencillamente no se escribe.
 *
 * Lo que se recorta es SOLO la nota. El perfil del cliente y las tareas de
 * promesa se siguen guardando igual: eso no se lee aqui, se lee en su sitio.
 */
function linea(etiqueta: string, valores?: string[] | string | null): string | null {
  const partes = (Array.isArray(valores) ? valores : [valores ?? ""])
    .map((valor) => (valor ?? "").trim())
    .filter(Boolean);
  if (partes.length === 0) return null;

  const texto = partes.join(" · ");
  // Un solo valor larguisimo devolveria el ladrillo que se acaba de quitar.
  const recortado = texto.length > 180 ? `${texto.slice(0, 177)}...` : texto;
  return `${etiqueta}: ${recortado}`;
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
  // Respaldo para cuando la IA no responde. Antes volcaba los ultimos doce
  // mensajes enteros, que es el ladrillo mas grande de todos; con los ultimos
  // cuatro recortados se entiende por donde iba la conversacion.
  const fallback = messages.slice(-4)
    .map((item) => {
      const texto = (item.content ?? "").trim().replace(/\s+/g, " ");
      const corto = texto.length > 90 ? `${texto.slice(0, 87)}...` : texto;
      return `${item.fromMe ? "Asesor" : "Cliente"}: ${corto}`;
    })
    .filter((fila) => !fila.endsWith(": "))
    .join("\n");
  const titulo = `RESUMEN IA · ${args.reason === "transferred" ? "Relevo de asesor" : "Conversación cerrada"}`;
  const lineas = result
    ? [
        linea("Pidió", result.requested),
        linea("Acordado", result.agreements),
        linea("Sigue", result.nextSteps),
      ].filter(Boolean)
    : [];
  // Si la IA respondio pero sin sacar nada en claro, una nota con solo el
  // titulo no dice nada: se cae al extracto de los ultimos mensajes.
  const cuerpo = lineas.length > 0 ? lineas.join("\n") : fallback;
  const content = cuerpo ? `${titulo}\n${cuerpo}` : titulo;

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
