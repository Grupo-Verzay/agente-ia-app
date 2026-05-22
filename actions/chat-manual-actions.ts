"use server";

import type { MediaType, FetchChatsResult, FindMessagesResult, SendMessageResult } from "./chat-actions";
import type { ChatToolActionResult } from "@/types/chat";
import type { WorkflowNode } from "@prisma/client";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildChatHistorySessionId } from "@/lib/chat-history/build-session-id";
import { saveChatHistoryMessage } from "@/lib/chat-history/chat-history.helper";
import {
  fetchChatsFromEvolution,
  findMessagesByRemoteJid,
  sendMediaByUrl,
  sendTextMessage,
} from "./chat-actions";
import { getExecutionNodesForWorkflow } from "./workflow-node-action";

type ChatActionContext = {
  apiKeyData: {
    url: string;
    key: string;
  };
  instanceName: string;
} | null;

type OutgoingTextPayload = {
  kind: "text";
  text: string;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string }; message: { conversation: string } };
};

type OutgoingMediaPayload = {
  kind: "media";
  mediatype: MediaType;
  mediaUrl: string;
  mimetype?: string;
  fileName?: string;
  caption?: string;
  ptt?: boolean;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quotedMessage?: { key: { id: string }; message: { conversation: string } };
};

type OutgoingMessagePayload = OutgoingTextPayload | OutgoingMediaPayload;

function buildOutgoingHistoryEntry(payload: OutgoingMessagePayload) {
  if (payload.kind === "text") {
    return {
      content: payload.text.trim(),
      additionalKwargs: {
        messageKind: "text",
      },
    };
  }

  const mediaLabel =
    payload.mediatype === "image"
      ? "[Imagen]"
      : payload.mediatype === "video"
        ? "[Video]"
        : payload.mediatype === "audio"
          ? payload.ptt
            ? "[Nota de voz]"
            : "[Audio]"
          : "[Documento]";

  const fileName = payload.fileName?.trim();
  const caption = payload.caption?.trim();
  const content = [fileName ? `${mediaLabel} ${fileName}` : mediaLabel, caption]
    .filter(Boolean)
    .join("\n");

  return {
    content,
    additionalKwargs: {
      messageKind: "media",
      mediatype: payload.mediatype,
      fileName: fileName || null,
      mimetype: payload.mimetype || null,
      hasCaption: Boolean(caption),
      ptt: payload.ptt ?? false,
    },
  };
}

function normalizeWorkflowNodeType(tipo?: string) {
  const normalized = tipo?.trim().toLowerCase() ?? "";
  if (!normalized || normalized.startsWith("seguimiento-")) return null;

  if (
    normalized === "text" ||
    normalized === "image" ||
    normalized === "video" ||
    normalized === "document" ||
    normalized === "audio"
  ) {
    return normalized;
  }

  return null;
}

function buildWorkflowPayload(node: WorkflowNode): OutgoingMessagePayload | null {
  const nodeType = normalizeWorkflowNodeType(node.tipo);
  if (!nodeType) return null;

  if (nodeType === "text") {
    const text = node.message?.trim() ?? "";
    return text ? { kind: "text", text } : null;
  }

  const mediaUrl = node.url?.trim();
  if (!mediaUrl) return null;

  if (nodeType === "audio") {
    return {
      kind: "media",
      mediatype: "audio",
      mediaUrl,
    };
  }

  const caption = node.message?.trim() ?? "";
  return {
    kind: "media",
    mediatype: nodeType,
    mediaUrl,
    caption: caption || undefined,
  };
}

async function persistOutgoingHistory(params: {
  instanceName: string;
  remoteJid: string;
  payload: OutgoingMessagePayload;
  source: string;
  historyType?: "notification" | "workflow";
  metadata?: Record<string, unknown>;
}) {
  const { instanceName, remoteJid, payload, source, historyType = "notification", metadata = {} } = params;
  const historyEntry = buildOutgoingHistoryEntry(payload);

  try {
    await saveChatHistoryMessage({
      sessionId: buildChatHistorySessionId(instanceName, remoteJid),
      content: historyEntry.content,
      type: historyType,
      additionalKwargs: {
        channel: "whatsapp",
        provider: "evolution",
        direction: "outbound",
        source,
        remoteJid,
        ...historyEntry.additionalKwargs,
        ...metadata,
      },
      responseMetadata: {
        sentAt: new Date().toISOString(),
        instanceName,
      },
    });
  } catch (historyError) {
    console.error("[CHATS] No se pudo guardar el historial del mensaje enviado.", historyError);
  }
}

async function sendOutgoingPayload(params: {
  context: Exclude<ChatActionContext, null>;
  remoteJid: string;
  payload: OutgoingMessagePayload;
  source: string;
  historyType?: "notification" | "workflow";
  metadata?: Record<string, unknown>;
}): Promise<SendMessageResult> {
  const { context, remoteJid, payload, source, historyType, metadata } = params;

  const result =
    payload.kind === "text"
      ? await sendTextMessage(context.apiKeyData, context.instanceName, remoteJid, payload.text, {
          delay: payload.delay,
          linkPreview: payload.linkPreview,
          mentionsEveryOne: payload.mentionsEveryOne,
          mentioned: payload.mentioned,
          quotedMessage: payload.quotedMessage,
        })
      : await sendMediaByUrl(context.apiKeyData, context.instanceName, remoteJid, {
          mediatype: payload.mediatype,
          mediaUrl: payload.mediaUrl,
          mimetype: payload.mimetype,
          fileName: payload.fileName,
          caption: payload.caption,
          ptt: payload.ptt,
          delay: payload.delay,
          linkPreview: payload.linkPreview,
          mentionsEveryOne: payload.mentionsEveryOne,
          mentioned: payload.mentioned,
          quotedMessage: payload.quotedMessage,
        });

  if (result.success) {
    await persistOutgoingHistory({
      instanceName: context.instanceName,
      remoteJid,
      payload,
      source,
      historyType,
      metadata,
    });
  }

  return result;
}

function hasReadyContext(context: ChatActionContext): context is Exclude<ChatActionContext, null> {
  return Boolean(context?.apiKeyData?.url && context?.apiKeyData?.key && context?.instanceName);
}

async function requireCurrentUser() {
  const user = await currentUser();
  if (!user) {
    throw new Error("No autorizado.");
  }

  return user;
}

export async function warmChatMessagesAction(
  context: ChatActionContext,
  remoteJid: string,
  options?: { page?: number; pageSize?: number; remoteJidAliases?: string[] },
): Promise<FindMessagesResult> {
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para cargar mensajes.",
      queriedRemoteJid: remoteJid,
    };
  }

  return findMessagesByRemoteJid(
    context.apiKeyData,
    context.instanceName,
    remoteJid,
    options,
  );
}

export async function refetchChatsManualAction(
  context: ChatActionContext,
): Promise<FetchChatsResult> {
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para refrescar chats.",
    };
  }

  return fetchChatsFromEvolution(context.apiKeyData, context.instanceName);
}

export async function sendManualChatPayloadAction(
  context: ChatActionContext,
  remoteJid: string,
  payload: OutgoingMessagePayload,
): Promise<SendMessageResult> {
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para enviar mensajes.",
      remoteJid,
    };
  }

  const user = await currentUser();

  // Guardamos el texto original antes de appendear firma
  const originalText = payload.kind === "text" ? payload.text.trim() : null;

  // Prepend firma del asesor (al inicio) si está activa para esta sesión
  if (payload.kind === "text" && user?.id) {
    const signature = (user?.advisorSignature as string | null | undefined)?.trim();
    if (signature) {
      const effectiveId = user.effectiveId;
      const sessionRow = await db.session.findFirst({
        where: { userId: effectiveId, remoteJid },
        select: { signatureEnabled: true },
      });
      if (sessionRow?.signatureEnabled) {
        payload = { ...payload, text: `${signature}\n${payload.text}` };
      }
    }
  }

  const result = await sendOutgoingPayload({
    context,
    remoteJid,
    payload,
    source: "manual_chat_ui",
    historyType: "notification",
  });

  if (result.success && user?.id) {
    // Si el usuario es asesor, actualiza las sesiones del dueño
    const effectiveOwnerId = user.ownerId ?? user.id;

    const delPhrase = (user?.delSeguimiento as string | null | undefined)?.trim();
    const isClosing = Boolean(originalText !== null && delPhrase && originalText === delPhrase);

    const sessionData = {
      status: false,
      ...(isClosing ? { signatureEnabled: false } : {}),
    };

    const ops: Promise<any>[] = [
      db.session.updateMany({ where: { userId: effectiveOwnerId, remoteJid }, data: sessionData }),
    ];

    if (isClosing) {
      ops.push(
        db.crmFollowUp.updateMany({
          where: { userId: effectiveOwnerId, remoteJid, status: { in: ["PENDING", "PROCESSING"] } },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        }),
        db.seguimiento.deleteMany({ where: { remoteJid } }),
      );
    }

    await Promise.all(ops);
  }

  return result;
}

export async function getAdvisorSignatureAction(): Promise<string> {
  const user = await currentUser();
  return (user?.advisorSignature as string | null | undefined) ?? "";
}

export async function updateAdvisorSignatureAction(
  signature: string,
): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const trimmed = signature.trim();
  await db.user.update({
    where: { id: user.id },
    data: { advisorSignature: trimmed || null },
  });

  return { success: true, message: "Firma actualizada." };
}

export async function toggleSessionSignatureAction(
  sessionId: number,
  enabled: boolean,
): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user?.id) {
    return { success: false, message: "No autorizado." };
  }

  const signature = (user?.advisorSignature as string | null | undefined)?.trim();
  if (enabled && !signature) {
    return {
      success: false,
      message: "Configura tu firma en Ajustes antes de activarla.",
    };
  }

  const effectiveOwnerId = user.ownerId ?? user.id;

  await db.session.updateMany({
    where: { userId: effectiveOwnerId },
    data: { signatureEnabled: enabled },
  });

  return { success: true, message: enabled ? "Firma activada." : "Firma desactivada." };
}

export async function sendManualWorkflowAction(
  context: ChatActionContext,
  remoteJid: string,
  workflowId: string,
): Promise<ChatToolActionResult> {
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para enviar workflows.",
    };
  }

  const user = await requireCurrentUser();
  const effectiveId = user.effectiveId;
  const workflow = await db.workflow.findFirst({
    where: {
      id: workflowId,
      userId: effectiveId,
    },
    select: {
      id: true,
      name: true,
      isPro: true,
    },
  });

  if (!workflow) {
    return {
      success: false,
      message: "El workflow seleccionado no existe o no pertenece al usuario.",
    };
  }

  const nodes = await getExecutionNodesForWorkflow(workflowId);
  let sentCount = 0;
  let skippedCount = 0;

  for (const node of nodes) {
    const payload = buildWorkflowPayload(node);
    if (!payload) {
      skippedCount += 1;
      continue;
    }

    const result = await sendOutgoingPayload({
      context,
      remoteJid,
      payload,
      source: "manual_chat_workflow",
      historyType: "workflow",
      metadata: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowNodeId: node.id,
        workflowNodeType: node.tipo,
      },
    });

    if (!result.success) {
      return {
        success: false,
        message:
          sentCount > 0
            ? `El flujo "${workflow.name}" se detuvo despues de ${sentCount} envio(s): ${result.message}`
            : result.message,
      };
    }

    sentCount += 1;
  }

  if (sentCount === 0) {
    return {
      success: false,
      message: `El flujo "${workflow.name}" no tiene nodos enviables manualmente.`,
    };
  }

  return {
    success: true,
    message:
      skippedCount > 0
        ? `Flujo "${workflow.name}" enviado con ${sentCount} paso(s) y ${skippedCount} nodo(s) omitido(s).`
        : `Flujo "${workflow.name}" enviado correctamente.`,
    data: {
      sentCount,
      skippedCount,
    },
  };
}

export async function sendManualQuickReplyAction(
  context: ChatActionContext,
  remoteJid: string,
  quickReplyId: number,
): Promise<ChatToolActionResult> {
  if (!hasReadyContext(context)) {
    return {
      success: false,
      message: "No hay instancia o API key configurada para enviar respuestas rapidas.",
    };
  }

  const user = await requireCurrentUser();
  const effectiveId = user.effectiveId;
  const quickReply = await db.quickReply.findFirst({
    where: {
      id: quickReplyId,
      userId: effectiveId,
    },
    select: {
      id: true,
      mensaje: true,
      workflowId: true,
    },
  });

  if (!quickReply) {
    return {
      success: false,
      message: "La respuesta rapida seleccionada no existe o no pertenece al usuario.",
    };
  }

  const message = quickReply.mensaje?.trim() ?? "";
  const hasText = message.length > 0;
  const hasWorkflow = !!quickReply.workflowId;

  if (!hasText && !hasWorkflow) {
    return {
      success: false,
      message: "La respuesta rapida no tiene mensaje ni flujo configurado.",
    };
  }

  // 1. Enviar texto si existe
  if (hasText) {
    const textResult = await sendOutgoingPayload({
      context,
      remoteJid,
      payload: { kind: "text", text: message },
      source: "manual_chat_quick_reply",
      historyType: "notification",
      metadata: { quickReplyId: quickReply.id, workflowId: quickReply.workflowId },
    });
    if (!textResult.success) return textResult;
  }

  // 2. Ejecutar el flujo si existe, y registrar la intención para que el
  //    webhook no lo vuelva a disparar cuando el cliente responda.
  if (hasWorkflow) {
    const workflow = await db.workflow.findFirst({
      where: { id: quickReply.workflowId!, userId: effectiveId },
      select: { id: true, name: true },
    });

    if (!workflow) {
      return { success: false, message: "El flujo asociado no existe o no pertenece al usuario." };
    }

    const workflowResult = await sendManualWorkflowAction(context, remoteJid, workflow.id);
    if (!workflowResult.success) return workflowResult;

    // Registrar intención en n8nChatHistory para que hasIntentionBeenExecuted
    // devuelva true en el webhook y no re-ejecute el flujo automáticamente.
    const sessionHistoryId = buildChatHistorySessionId(context!.instanceName, remoteJid);
    await db.n8nChatHistory.create({
      data: {
        sessionId: sessionHistoryId,
        message: {
          type: "intention",
          name: workflow.name,
          tipo: "intention",
          executedAt: new Date().toISOString(),
        },
      },
    });
  }

  return {
    success: true,
    message: "Respuesta rapida enviada correctamente.",
    data: { sentCount: 1 },
  };
}
