"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

import {
  sendManualChatPayloadAction,
  sendManualQuickReplyAction,
  sendManualWorkflowAction,
} from "@/actions/chat-manual-actions";
import { sendBaileysTextAction } from "@/actions/baileys-chat-actions";
import { sendChannelTextAction, sendMetaTemplate, type MetaTemplateOption } from "@/actions/channel-chat-actions";
import { getApiKeyById } from "@/actions/api-action";
import { assignTagToSessionAction, removeTagFromSessionAction } from "@/actions/tag-actions";
import { updateSessionLeadStatus, toggleAgentDisabled } from "@/actions/session-action";
import { assignSessionToAdvisor, resolveSession } from "@/actions/advisor-assign-actions";
import { createInternalNoteAction } from "@/actions/internal-notes-actions";
import { createTaskAction } from "@/actions/task-actions";

export type MacroActionType =
  | "SEND_TEXT"
  | "SEND_QUICK_REPLY"
  | "SEND_TEXT_VIA"
  | "SEND_FILE"
  | "EXECUTE_FLOW"
  | "ADD_TAG"
  | "REMOVE_TAG"
  | "CHANGE_STAGE"
  | "ASSIGN_ADVISOR"
  | "TRANSFER_ADVISOR"
  | "CREATE_TASK"
  | "INTERNAL_NOTE"
  | "TOGGLE_AI"
  | "WAIT"
  | "RESOLVE";

export type MacroActionItem = {
  type: MacroActionType;
  config?: {
    text?: string;
    instanceName?: string; // línea/instancia por la que se envía (SEND_TEXT_VIA)
    // SEND_TEXT_VIA por línea Meta (WhatsApp Cloud): plantilla aprobada en vez de
    // texto libre. Fuera de la ventana de 24 h Meta solo acepta plantillas.
    viaMode?: "text" | "template"; // default "text"
    templateName?: string;
    templateLanguage?: string;
    templateBody?: string; // cuerpo con {{n}} (para renderizar el saliente en el panel)
    templateParams?: string[]; // valores de {{1}}, {{2}}…
    quickReplyId?: number;
    tagId?: number;
    stage?: string | null; // LeadStatus (FRIO | TIBIO | CALIENTE | FINALIZADO | DESCARTADO)
    advisorId?: string;
    content?: string;
    disabled?: boolean;
    workflowId?: string;
    // SEND_FILE (adjunto fijo, subido a S3)
    mediaUrl?: string;
    mediatype?: string; // image | video | audio | document
    mimetype?: string;
    fileName?: string;
    caption?: string;
    // CREATE_TASK
    taskTitle?: string;
    taskType?: string;
    taskDays?: number; // vencimiento relativo: hoy + N días
    // WAIT
    seconds?: number;
  };
};

/** Línea/instancia disponible para enviar mensajes (para el selector "por otra línea"). */
export type MacroLine = { instanceName: string; label: string; type: string };

export type MacroData = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  actions: MacroActionItem[];
  order: number;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
};

type ChatCtx = { apiKeyData: { url: string; key: string }; instanceName: string };

async function requireUser() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return user;
}

function ownerOf(user: { id: string; ownerId?: string | null }) {
  return user.ownerId ?? user.id;
}

/* ─────────────── LÍNEAS / ENVÍO POR OTRA LÍNEA ─────────────── */

/**
 * Conjunto de cuentas autorizadas del usuario = cuenta activa + su login + dueño
 * + cuentas vinculadas (maestras donde es miembro y miembros de la cuenta activa).
 * Mismo scope que usa el panel de Chats para el equipo/multi-cuenta.
 */
async function authorizedAccountIds(user: {
  id: string;
  effectiveId: string;
  ownerId?: string | null;
  sessionUserId?: string | null;
}): Promise<string[]> {
  const ids = new Set<string>(
    [user.effectiveId, user.id, user.ownerId, user.sessionUserId].filter(
      (v): v is string => Boolean(v),
    ),
  );
  const realId = user.sessionUserId ?? user.id;
  try {
    const [masters, linked] = await Promise.all([
      db.$queryRaw<{ id: string }[]>`
        SELECT "master_user_id" AS id FROM "linked_accounts" WHERE "linked_user_id" = ${realId}
      `,
      db.$queryRaw<{ id: string }[]>`
        SELECT "linked_user_id" AS id FROM "linked_accounts" WHERE "master_user_id" = ${user.effectiveId}
      `,
    ]);
    masters.forEach((r) => r.id && ids.add(r.id));
    linked.forEach((r) => r.id && ids.add(r.id));
  } catch {
    // Tabla linked_accounts ausente: degradar a las cuentas base.
  }
  return Array.from(ids);
}

/**
 * Lista las líneas (instancias de WhatsApp) de TODAS las cuentas asociadas que el
 * usuario administra, para el selector "Enviar por otra línea". Las líneas de
 * otras cuentas se etiquetan con el nombre de la cuenta para distinguirlas.
 */
export async function getAccountLinesAction(): Promise<{ success: boolean; data: MacroLine[] }> {
  try {
    const user = await requireUser();
    const accountIds = await authorizedAccountIds(user);
    const rows = await db.instancia.findMany({
      where: { userId: { in: accountIds } },
      orderBy: { id: "desc" },
    });
    const whatsappRows = rows.filter(
      (i) =>
        i.instanceType === "Whatsapp" ||
        i.instanceType === "baileys" ||
        i.instanceType === "meta" ||
        i.instanceType == null,
    );
    // Nombre de la cuenta dueña de cada línea (para distinguir cuando administras varias).
    const ownerIds = Array.from(new Set(whatsappRows.map((i) => i.userId)));
    const owners = ownerIds.length
      ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, company: true } })
      : [];
    const companyById = new Map(owners.map((u) => [u.id, u.company]));
    const activeId = user.effectiveId;

    const seen = new Set<string>();
    const data: MacroLine[] = [];
    for (const i of whatsappRows) {
      if (seen.has(i.instanceName)) continue;
      seen.add(i.instanceName);
      // Solo prefijamos el nombre de la cuenta cuando la línea es de OTRA cuenta.
      const company = i.userId !== activeId ? companyById.get(i.userId) : null;
      data.push({
        instanceName: i.instanceName,
        label: company ? `${company} · ${i.instanceName}` : i.instanceName,
        type: i.instanceType ?? "Whatsapp",
      });
    }
    return { success: true, data };
  } catch (e) {
    console.error("[getAccountLinesAction]", e);
    return { success: false, data: [] };
  }
}

/**
 * Envía un texto al contacto de la conversación pero por una línea/instancia
 * distinta a la actual (puede ser de otra cuenta asociada). Resuelve el adaptador
 * correcto (baileys / canal Meta / Evolution) y, para Evolution, la API key de la
 * CUENTA dueña de esa línea (no la actual).
 */
async function sendTextViaLine(
  accountIds: string[],
  instanceName: string,
  remoteJid: string,
  text: string,
): Promise<void> {
  const inst = await db.instancia.findFirst({
    where: { instanceName, userId: { in: accountIds } },
  });
  if (!inst) throw new Error(`Línea "${instanceName}" no encontrada o no autorizada.`);

  if (inst.instanceType === "baileys") {
    await sendBaileysTextAction(instanceName, remoteJid, { kind: "text", text });
    return;
  }
  if (inst.instanceType === "meta" || inst.instanceType === "telegram") {
    await sendChannelTextAction(instanceName, remoteJid, { kind: "text", text });
    return;
  }

  // Evolution API: usa la API key de la cuenta dueña de ESA línea.
  const owner = await db.user.findUnique({ where: { id: inst.userId }, select: { apiKeyId: true } });
  const res = owner?.apiKeyId ? await getApiKeyById(owner.apiKeyId) : null;
  const apiKey = res && res.success ? res.data : null;
  if (!apiKey?.url || !apiKey?.key) throw new Error("No hay API key para enviar por esta línea.");
  await sendManualChatPayloadAction(
    { apiKeyData: { url: apiKey.url, key: apiKey.key }, instanceName },
    remoteJid,
    { kind: "text", text },
  );
}

/**
 * Envía una PLANTILLA de WhatsApp Cloud (Meta) al contacto por una línea Meta
 * distinta a la actual (para SEND_TEXT_VIA en modo plantilla). Valida que la línea
 * pertenezca a una cuenta autorizada y sea de tipo Meta antes de enviar.
 */
async function sendTemplateViaLine(
  accountIds: string[],
  instanceName: string,
  remoteJid: string,
  cfg: NonNullable<MacroActionItem["config"]>,
): Promise<void> {
  const inst = await db.instancia.findFirst({
    where: { instanceName, userId: { in: accountIds } },
  });
  if (!inst) throw new Error(`Línea "${instanceName}" no encontrada o no autorizada.`);
  if (inst.instanceType !== "meta") {
    throw new Error("Las plantillas solo se pueden enviar por líneas de WhatsApp Cloud (Meta).");
  }
  const template: MetaTemplateOption = {
    name: cfg.templateName ?? "",
    language: cfg.templateLanguage || "es",
    category: "",
    bodyText: cfg.templateBody ?? "",
    paramCount: (cfg.templateParams ?? []).length,
  };
  const res = await sendMetaTemplate(instanceName, remoteJid, template, cfg.templateParams ?? []);
  if (!res.success) throw new Error(res.message || "No se pudo enviar la plantilla.");
}

/* ─────────────── CRUD ─────────────── */

export async function getMacrosAction(): Promise<{ success: boolean; data: MacroData[] }> {
  try {
    const user = await requireUser();
    const rows = await (db as any).macro.findMany({
      where: { userId: ownerOf(user) },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return {
      success: true,
      data: rows.map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description ?? null,
        color: m.color ?? null,
        actions: Array.isArray(m.actions) ? (m.actions as MacroActionItem[]) : [],
        order: m.order,
        enabled: m.enabled,
        runCount: m.runCount ?? 0,
        lastRunAt: m.lastRunAt ? m.lastRunAt.toISOString() : null,
      })),
    };
  } catch (e) {
    console.error("[getMacrosAction]", e);
    return { success: false, data: [] };
  }
}

export async function createMacroAction(input: {
  name: string;
  description?: string;
  color?: string;
  actions: MacroActionItem[];
}): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const user = await requireUser();
    if (!input.name?.trim()) return { success: false, message: "El nombre es obligatorio." };
    const count = await (db as any).macro.count({ where: { userId: ownerOf(user) } });
    const macro = await (db as any).macro.create({
      data: {
        userId: ownerOf(user),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color || null,
        actions: input.actions ?? [],
        order: count,
      },
    });
    return { success: true, message: "Macro creada.", id: macro.id };
  } catch (e) {
    console.error("[createMacroAction]", e);
    return { success: false, message: "Error al crear la macro." };
  }
}

export async function updateMacroAction(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    color?: string | null;
    actions?: MacroActionItem[];
    enabled?: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.color !== undefined) data.color = input.color || null;
    if (input.actions !== undefined) data.actions = input.actions;
    if (input.enabled !== undefined) data.enabled = input.enabled;

    const res = await (db as any).macro.updateMany({
      where: { id, userId: ownerOf(user) },
      data,
    });
    if (res.count === 0) return { success: false, message: "Macro no encontrada." };
    return { success: true, message: "Macro actualizada." };
  } catch (e) {
    console.error("[updateMacroAction]", e);
    return { success: false, message: "Error al actualizar la macro." };
  }
}

export async function reorderMacrosAction(ids: string[]): Promise<{ success: boolean }> {
  try {
    const user = await requireUser();
    const ownerId = ownerOf(user);
    await db.$transaction(
      ids.map((id, i) =>
        (db as any).macro.updateMany({ where: { id, userId: ownerId }, data: { order: i } }),
      ),
    );
    return { success: true };
  } catch (e) {
    console.error("[reorderMacrosAction]", e);
    return { success: false };
  }
}

export async function deleteMacroAction(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    await (db as any).macro.deleteMany({ where: { id, userId: ownerOf(user) } });
    return { success: true, message: "Macro eliminada." };
  } catch (e) {
    console.error("[deleteMacroAction]", e);
    return { success: false, message: "Error al eliminar la macro." };
  }
}

export async function duplicateMacroAction(
  id: string,
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const user = await requireUser();
    const ownerId = ownerOf(user);
    const src = await (db as any).macro.findFirst({ where: { id, userId: ownerId } });
    if (!src) return { success: false, message: "Macro no encontrada." };
    const count = await (db as any).macro.count({ where: { userId: ownerId } });
    const copy = await (db as any).macro.create({
      data: {
        userId: ownerId,
        name: `${src.name} (copia)`,
        description: src.description,
        color: src.color,
        actions: src.actions,
        order: count,
        enabled: src.enabled,
      },
    });
    return { success: true, message: "Macro duplicada.", id: copy.id };
  } catch (e) {
    console.error("[duplicateMacroAction]", e);
    return { success: false, message: "Error al duplicar la macro." };
  }
}

export async function deleteMacrosAction(ids: string[]): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    await (db as any).macro.deleteMany({ where: { id: { in: ids }, userId: ownerOf(user) } });
    return { success: true, message: "Macros eliminadas." };
  } catch (e) {
    console.error("[deleteMacrosAction]", e);
    return { success: false, message: "Error al eliminar las macros." };
  }
}

export async function deleteAllMacrosAction(): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    await (db as any).macro.deleteMany({ where: { userId: ownerOf(user) } });
    return { success: true, message: "Todas las macros fueron eliminadas." };
  } catch (e) {
    console.error("[deleteAllMacrosAction]", e);
    return { success: false, message: "Error al eliminar las macros." };
  }
}

/* ─────────────── EJECUCIÓN ─────────────── */

/**
 * Corre una macro sobre una conversación, encadenando las acciones existentes.
 * `context` y `remoteJid` solo se necesitan para las acciones que envían mensaje.
 */
export async function executeMacroAction(input: {
  macroId: string;
  sessionId: number;
  remoteJid?: string;
  context?: ChatCtx | null;
}): Promise<{ success: boolean; message: string; applied: number; failed: number }> {
  try {
    const user = await requireUser();
    const ownerId = ownerOf(user);

    const macro = await (db as any).macro.findFirst({
      where: { id: input.macroId, userId: ownerId, enabled: true },
    });
    if (!macro) return { success: false, message: "Macro no encontrada.", applied: 0, failed: 0 };

    const actions: MacroActionItem[] = Array.isArray(macro.actions) ? macro.actions : [];
    const { sessionId, remoteJid, context } = input;

    // Cuentas autorizadas (equipo/multi-cuenta) solo si hay envío por otra línea.
    const lineAccountIds = actions.some((a) => a.type === "SEND_TEXT_VIA")
      ? await authorizedAccountIds(user)
      : [];

    let applied = 0;
    let failed = 0;

    for (const a of actions) {
      try {
        const cfg = a.config ?? {};
        switch (a.type) {
          case "SEND_TEXT":
            if (context && remoteJid && cfg.text) {
              await sendManualChatPayloadAction(context, remoteJid, { kind: "text", text: cfg.text });
            }
            break;
          case "SEND_TEXT_VIA":
            if (remoteJid && cfg.instanceName) {
              if (cfg.viaMode === "template" && cfg.templateName) {
                await sendTemplateViaLine(lineAccountIds, cfg.instanceName, remoteJid, cfg);
              } else if (cfg.text) {
                await sendTextViaLine(lineAccountIds, cfg.instanceName, remoteJid, cfg.text);
              }
            }
            break;
          case "SEND_FILE":
            if (context && remoteJid && cfg.mediaUrl) {
              await sendManualChatPayloadAction(context, remoteJid, {
                kind: "media",
                mediatype: (cfg.mediatype ?? "document") as any,
                mediaUrl: cfg.mediaUrl,
                mimetype: cfg.mimetype,
                fileName: cfg.fileName,
                caption: cfg.caption || undefined,
              });
            }
            break;
          case "SEND_QUICK_REPLY":
            if (context && remoteJid && cfg.quickReplyId) {
              await sendManualQuickReplyAction(context, remoteJid, cfg.quickReplyId);
            }
            break;
          case "EXECUTE_FLOW":
            if (context && remoteJid && cfg.workflowId) {
              await sendManualWorkflowAction(context, remoteJid, cfg.workflowId);
            }
            break;
          case "ADD_TAG":
            if (cfg.tagId) {
              await assignTagToSessionAction({ userId: ownerId, sessionId, tagId: cfg.tagId });
            }
            break;
          case "REMOVE_TAG":
            if (cfg.tagId) {
              await removeTagFromSessionAction({ userId: ownerId, sessionId, tagId: cfg.tagId });
            }
            break;
          case "CHANGE_STAGE":
            await updateSessionLeadStatus(sessionId, (cfg.stage ?? null) as any);
            break;
          case "ASSIGN_ADVISOR":
          case "TRANSFER_ADVISOR":
            // Ambas reasignan la conversación al asesor elegido. Se usa
            // assignSessionToAdvisor (valida dueño/admin, registra y dispara
            // automatizaciones); transferSession exige ser el asesor actual y
            // rompería en una macro corrida por el dueño.
            if (cfg.advisorId) await assignSessionToAdvisor(sessionId, cfg.advisorId);
            break;
          case "CREATE_TASK":
            if (cfg.advisorId && cfg.taskTitle) {
              const days = Number.isFinite(cfg.taskDays) ? Number(cfg.taskDays) : 0;
              const due = new Date(Date.now() + Math.max(0, days) * 86400000);
              await createTaskAction({
                assignedToId: cfg.advisorId,
                sessionId,
                title: cfg.taskTitle,
                type: cfg.taskType || "Seguimiento",
                dueDate: due.toISOString(),
              });
            }
            break;
          case "INTERNAL_NOTE":
            if (cfg.content) await createInternalNoteAction({ sessionId, content: cfg.content });
            break;
          case "TOGGLE_AI":
            await toggleAgentDisabled(user.id, sessionId, Boolean(cfg.disabled));
            break;
          case "WAIT": {
            // Pausa entre acciones (cap 20s para no colgar la request).
            const secs = Math.min(20, Math.max(0, Number(cfg.seconds) || 0));
            if (secs > 0) await new Promise((r) => setTimeout(r, secs * 1000));
            break;
          }
          case "RESOLVE":
            await resolveSession(sessionId);
            break;
          default:
            break;
        }
        applied++;
      } catch (err) {
        failed++;
        console.error(`[executeMacroAction] acción ${a.type} falló`, err);
      }
    }

    // Contador de ejecuciones (barato: un UPDATE por corrida).
    try {
      await (db as any).macro.update({
        where: { id: input.macroId },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });
    } catch {
      /* no bloquear por el contador */
    }

    return {
      success: true,
      message: failed === 0 ? "Macro aplicada." : `Macro aplicada (${failed} acción(es) con error).`,
      applied,
      failed,
    };
  } catch (e) {
    console.error("[executeMacroAction]", e);
    return { success: false, message: "Error al ejecutar la macro.", applied: 0, failed: 0 };
  }
}
