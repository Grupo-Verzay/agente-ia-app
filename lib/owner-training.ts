import { randomUUID } from "crypto";

import { writeAuditLog } from "@/actions/audit-log-actions";
import {
  getAgentPromptByUserAndAgentId,
  listPromptRevisions,
  patchTrainingSection,
  publishPrompt,
  restoreRevision,
} from "@/actions/system-prompt-actions";
import { AGENT_PROMPT_IDS } from "@/lib/agent-prompt-ids";
import type { OwnerActionResult } from "@/lib/owner-commands";

/**
 * Auto-mejora del entrenamiento del agente (Fase 3 — Modo Dueño por WhatsApp).
 *
 * El entrenamiento NO es código: vive en la base (`AgentPrompt.sections`) y está
 * versionado (`AgentPromptRevision`). Por eso el dueño puede pedirle al agente
 * que ajuste su comportamiento sin entrar a la plataforma ni redesplegar.
 *
 * Diseño conservador y reversible:
 *   - Solo se AGREGAN instrucciones (append de un step), nunca se reescribe ni
 *     se borra el entrenamiento existente.
 *   - Cada cambio se publica como una nueva revisión → queda snapshot para
 *     rollback.
 *   - Existe restore para volver a cualquier revisión previa.
 *
 * La confirmación con el dueño la gestiona el agente antes de llamar aquí.
 */

const DEFAULT_AGENT_ID = AGENT_PROMPT_IDS.systemPromptAI;

async function loadPrompt(ownerId: string, agentId: string) {
  return getAgentPromptByUserAndAgentId({ userId: ownerId, agentId });
}

function readSteps(sections: unknown): any[] {
  const training = (sections as any)?.training;
  return Array.isArray(training?.steps) ? training.steps : [];
}

export type TrainingView = {
  agentId: string;
  promptId: string;
  version: number;
  status: string;
  steps: { id: string; title: string | null; mainMessage: string }[];
};

/** Lee la sección de entrenamiento actual del dueño (solo lectura). */
export async function getOwnerTraining(
  ownerId: string,
  agentId: string = DEFAULT_AGENT_ID,
): Promise<OwnerActionResult<TrainingView>> {
  const prompt = await loadPrompt(ownerId, agentId);
  if (!prompt) {
    return { ok: false, status: 404, message: "Esta cuenta no tiene entrenamiento configurado." };
  }
  const steps = readSteps(prompt.sections).map((s) => ({
    id: String(s.id),
    title: s.title ?? null,
    mainMessage: s.mainMessage ?? "",
  }));
  return {
    ok: true,
    data: { agentId, promptId: prompt.id, version: prompt.version, status: prompt.status, steps },
  };
}

export type TrainingRevision = {
  revisionNumber: number;
  publishedAt: Date;
  notes: string | null;
};

/** Lista el historial de revisiones del entrenamiento del dueño (solo lectura). */
export async function listOwnerTrainingRevisions(
  ownerId: string,
  agentId: string = DEFAULT_AGENT_ID,
): Promise<OwnerActionResult<{ promptId: string; revisions: TrainingRevision[] }>> {
  const prompt = await loadPrompt(ownerId, agentId);
  if (!prompt) {
    return { ok: false, status: 404, message: "Esta cuenta no tiene entrenamiento configurado." };
  }
  const res = await listPromptRevisions(prompt.id);
  if (!res.ok) {
    return { ok: false, status: 502, message: res.error ?? "No se pudieron cargar las revisiones." };
  }
  return {
    ok: true,
    data: {
      promptId: prompt.id,
      revisions: res.data.map((r) => ({
        revisionNumber: r.revisionNumber,
        publishedAt: r.publishedAt,
        notes: r.notes ?? null,
      })),
    },
  };
}

/**
 * Agrega una instrucción al entrenamiento (append de un step) y publica una
 * nueva revisión para que quede activa. No reescribe ni borra nada existente.
 */
export async function appendOwnerTrainingInstruction(params: {
  ownerId: string;
  agentId?: string;
  title?: string;
  instruction: string;
}): Promise<OwnerActionResult<{ promptId: string; stepId: string; revisionNumber: number }>> {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;

  const prompt = await loadPrompt(params.ownerId, agentId);
  if (!prompt) {
    return { ok: false, status: 404, message: "Esta cuenta no tiene entrenamiento configurado." };
  }

  const newStep = {
    id: randomUUID(),
    title: params.title?.trim() || "Instrucción del dueño",
    mainMessage: params.instruction,
    elements: [],
  };

  // Patch con bloqueo optimista; un reintento si hubo conflicto de versión.
  let patchRes = await patchTrainingSection({
    promptId: prompt.id,
    version: prompt.version,
    data: { steps: [...readSteps(prompt.sections), newStep] },
  });

  if (!patchRes.ok && (patchRes as any).conflict) {
    const fresh = await loadPrompt(params.ownerId, agentId);
    if (fresh) {
      patchRes = await patchTrainingSection({
        promptId: fresh.id,
        version: fresh.version,
        data: { steps: [...readSteps(fresh.sections), newStep] },
      });
    }
  }

  if (!patchRes.ok) {
    return {
      ok: false,
      status: 409,
      message: "No se pudo actualizar el entrenamiento (conflicto de versión). Intenta de nuevo.",
    };
  }

  const updated = patchRes.data;
  const pub = await publishPrompt({
    promptId: updated.id,
    version: updated.version,
    publishedBy: params.ownerId,
    note: "Instrucción agregada desde WhatsApp (modo dueño)",
  });
  if (!pub.ok) {
    return { ok: false, status: 502, message: pub.error ?? "No se pudo publicar el entrenamiento." };
  }

  await writeAuditLog({
    userId: params.ownerId,
    actorId: params.ownerId,
    entityType: "note",
    entityId: updated.id,
    action: "updated",
    summary: "Agregó una instrucción al entrenamiento desde WhatsApp (modo dueño)",
    metadata: {
      source: "owner-command",
      kind: "training-instruction",
      stepId: newStep.id,
      revisionNumber: pub.data.revision.revisionNumber,
    },
  });

  return {
    ok: true,
    data: {
      promptId: updated.id,
      stepId: newStep.id,
      revisionNumber: pub.data.revision.revisionNumber,
    },
  };
}

/**
 * Edita una instrucción existente del entrenamiento (por su id de step) y publica
 * una nueva revisión. Como todo cambio, queda snapshot para rollback.
 */
export async function updateOwnerTrainingInstruction(params: {
  ownerId: string;
  agentId?: string;
  stepId: string;
  title?: string;
  instruction?: string;
}): Promise<OwnerActionResult<{ promptId: string; stepId: string; revisionNumber: number }>> {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const prompt = await loadPrompt(params.ownerId, agentId);
  if (!prompt) {
    return { ok: false, status: 404, message: "Esta cuenta no tiene entrenamiento configurado." };
  }

  const applyEdit = (steps: any[]) => {
    let found = false;
    const next = steps.map((s) => {
      if (String(s.id) !== params.stepId) return s;
      found = true;
      return {
        ...s,
        title:
          params.title !== undefined ? params.title.trim() || s.title : s.title,
        mainMessage:
          params.instruction !== undefined ? params.instruction : s.mainMessage,
      };
    });
    return { next, found };
  };

  const first = applyEdit(readSteps(prompt.sections));
  if (!first.found) {
    return {
      ok: false,
      status: 404,
      message: "No encontré esa instrucción en el entrenamiento. Pídeme la lista para ver cuáles hay.",
    };
  }

  let patchRes = await patchTrainingSection({
    promptId: prompt.id,
    version: prompt.version,
    data: { steps: first.next },
  });

  if (!patchRes.ok && (patchRes as any).conflict) {
    const fresh = await loadPrompt(params.ownerId, agentId);
    if (fresh) {
      const retry = applyEdit(readSteps(fresh.sections));
      if (!retry.found) {
        return { ok: false, status: 404, message: "No encontré esa instrucción en el entrenamiento." };
      }
      patchRes = await patchTrainingSection({
        promptId: fresh.id,
        version: fresh.version,
        data: { steps: retry.next },
      });
    }
  }

  if (!patchRes.ok) {
    return {
      ok: false,
      status: 409,
      message: "No se pudo actualizar el entrenamiento (conflicto de versión). Intenta de nuevo.",
    };
  }

  const updated = patchRes.data;
  const pub = await publishPrompt({
    promptId: updated.id,
    version: updated.version,
    publishedBy: params.ownerId,
    note: "Instrucción editada desde WhatsApp (modo dueño)",
  });
  if (!pub.ok) {
    return { ok: false, status: 502, message: pub.error ?? "No se pudo publicar el entrenamiento." };
  }

  await writeAuditLog({
    userId: params.ownerId,
    actorId: params.ownerId,
    entityType: "note",
    entityId: updated.id,
    action: "updated",
    summary: "Editó una instrucción del entrenamiento desde WhatsApp (modo dueño)",
    metadata: {
      source: "owner-command",
      kind: "training-instruction-edit",
      stepId: params.stepId,
      revisionNumber: pub.data.revision.revisionNumber,
    },
  });

  return {
    ok: true,
    data: { promptId: updated.id, stepId: params.stepId, revisionNumber: pub.data.revision.revisionNumber },
  };
}

/**
 * Elimina una instrucción del entrenamiento (por su id de step) y publica una
 * nueva revisión. Reversible: la instrucción queda en el snapshot anterior.
 */
export async function deleteOwnerTrainingInstruction(params: {
  ownerId: string;
  agentId?: string;
  stepId: string;
}): Promise<OwnerActionResult<{ promptId: string; stepId: string; revisionNumber: number }>> {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const prompt = await loadPrompt(params.ownerId, agentId);
  if (!prompt) {
    return { ok: false, status: 404, message: "Esta cuenta no tiene entrenamiento configurado." };
  }

  const applyDelete = (steps: any[]) => {
    const next = steps.filter((s) => String(s.id) !== params.stepId);
    return { next, found: next.length !== steps.length };
  };

  const first = applyDelete(readSteps(prompt.sections));
  if (!first.found) {
    return {
      ok: false,
      status: 404,
      message: "No encontré esa instrucción en el entrenamiento. Pídeme la lista para ver cuáles hay.",
    };
  }

  let patchRes = await patchTrainingSection({
    promptId: prompt.id,
    version: prompt.version,
    data: { steps: first.next },
  });

  if (!patchRes.ok && (patchRes as any).conflict) {
    const fresh = await loadPrompt(params.ownerId, agentId);
    if (fresh) {
      const retry = applyDelete(readSteps(fresh.sections));
      if (!retry.found) {
        return { ok: false, status: 404, message: "No encontré esa instrucción en el entrenamiento." };
      }
      patchRes = await patchTrainingSection({
        promptId: fresh.id,
        version: fresh.version,
        data: { steps: retry.next },
      });
    }
  }

  if (!patchRes.ok) {
    return {
      ok: false,
      status: 409,
      message: "No se pudo actualizar el entrenamiento (conflicto de versión). Intenta de nuevo.",
    };
  }

  const updated = patchRes.data;
  const pub = await publishPrompt({
    promptId: updated.id,
    version: updated.version,
    publishedBy: params.ownerId,
    note: "Instrucción eliminada desde WhatsApp (modo dueño)",
  });
  if (!pub.ok) {
    return { ok: false, status: 502, message: pub.error ?? "No se pudo publicar el entrenamiento." };
  }

  await writeAuditLog({
    userId: params.ownerId,
    actorId: params.ownerId,
    entityType: "note",
    entityId: updated.id,
    action: "updated",
    summary: "Eliminó una instrucción del entrenamiento desde WhatsApp (modo dueño)",
    metadata: {
      source: "owner-command",
      kind: "training-instruction-delete",
      stepId: params.stepId,
      revisionNumber: pub.data.revision.revisionNumber,
    },
  });

  return {
    ok: true,
    data: { promptId: updated.id, stepId: params.stepId, revisionNumber: pub.data.revision.revisionNumber },
  };
}

/** Restaura el entrenamiento a una revisión previa y la republica (rollback). */
export async function restoreOwnerTraining(params: {
  ownerId: string;
  agentId?: string;
  revisionNumber: number;
}): Promise<OwnerActionResult<{ promptId: string; restoredTo: number }>> {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;

  const prompt = await loadPrompt(params.ownerId, agentId);
  if (!prompt) {
    return { ok: false, status: 404, message: "Esta cuenta no tiene entrenamiento configurado." };
  }

  const restored = await restoreRevision({ promptId: prompt.id, revisionNumber: params.revisionNumber });
  if (!restored.ok) {
    return { ok: false, status: 404, message: restored.error ?? "Revisión no encontrada." };
  }

  // Republica para que el rollback quede activo (restore deja el draft en la
  // revisión previa; publicar recompone el promptText en vivo).
  const fresh = await loadPrompt(params.ownerId, agentId);
  if (!fresh) {
    return { ok: false, status: 404, message: "Prompt no encontrado tras restaurar." };
  }
  const pub = await publishPrompt({
    promptId: fresh.id,
    version: fresh.version,
    publishedBy: params.ownerId,
    note: `Rollback a revisión ${params.revisionNumber} desde WhatsApp (modo dueño)`,
  });
  if (!pub.ok) {
    return { ok: false, status: 502, message: pub.error ?? "No se pudo republicar tras el rollback." };
  }

  await writeAuditLog({
    userId: params.ownerId,
    actorId: params.ownerId,
    entityType: "note",
    entityId: fresh.id,
    action: "restored",
    summary: `Restauró el entrenamiento a la revisión ${params.revisionNumber} desde WhatsApp (modo dueño)`,
    metadata: { source: "owner-command", kind: "training-restore", revisionNumber: params.revisionNumber },
  });

  return { ok: true, data: { promptId: fresh.id, restoredTo: params.revisionNumber } };
}
