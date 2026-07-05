"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

import {
  sendManualChatPayloadAction,
  sendManualQuickReplyAction,
  sendManualWorkflowAction,
} from "@/actions/chat-manual-actions";
import { assignTagToSessionAction } from "@/actions/tag-actions";
import { updateSessionLeadStatus, toggleAgentDisabled } from "@/actions/session-action";
import { assignSessionToAdvisor, resolveSession } from "@/actions/advisor-assign-actions";
import { createInternalNoteAction } from "@/actions/internal-notes-actions";

export type MacroActionType =
  | "SEND_TEXT"
  | "SEND_QUICK_REPLY"
  | "EXECUTE_FLOW"
  | "ADD_TAG"
  | "CHANGE_STAGE"
  | "ASSIGN_ADVISOR"
  | "INTERNAL_NOTE"
  | "TOGGLE_AI"
  | "RESOLVE";

export type MacroActionItem = {
  type: MacroActionType;
  config?: {
    text?: string;
    quickReplyId?: number;
    tagId?: number;
    stage?: string | null; // LeadStatus (FRIO | TIBIO | CALIENTE | FINALIZADO | DESCARTADO)
    advisorId?: string;
    content?: string;
    disabled?: boolean;
    workflowId?: string;
  };
};

export type MacroData = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  actions: MacroActionItem[];
  order: number;
  enabled: boolean;
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
          case "CHANGE_STAGE":
            await updateSessionLeadStatus(sessionId, (cfg.stage ?? null) as any);
            break;
          case "ASSIGN_ADVISOR":
            if (cfg.advisorId) await assignSessionToAdvisor(sessionId, cfg.advisorId);
            break;
          case "INTERNAL_NOTE":
            if (cfg.content) await createInternalNoteAction({ sessionId, content: cfg.content });
            break;
          case "TOGGLE_AI":
            await toggleAgentDisabled(user.id, sessionId, Boolean(cfg.disabled));
            break;
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
