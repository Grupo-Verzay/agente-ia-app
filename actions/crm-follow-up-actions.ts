"use server";

import { assertUserCanUseApp } from "@/actions/billing/helpers/app-access-guard";
import { assertAuthorizedCrmFeatureEnabled } from "@/actions/crm-feature-access";
import { db } from "@/lib/db";
import {
  computeCrmFollowUpScheduledFor,
  normalizeCrmFollowUpRule,
} from "@/lib/crm-follow-up-rules";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import type { CrmFollowUpStatus, LeadStatus } from "@/types/session";

const ACTIVE_FOLLOW_UP_STATUSES = ["PENDING", "PROCESSING"] as const;
const REACTIVATABLE_FOLLOW_UP_STATUSES = [
  "FAILED",
  "SENT",
  "CANCELLED",
  "SKIPPED",
] as const;

type ActiveCrmFollowUpStatus = (typeof ACTIVE_FOLLOW_UP_STATUSES)[number];
type ReactivatableCrmFollowUpStatus =
  (typeof REACTIVATABLE_FOLLOW_UP_STATUSES)[number];

export type CrmFollowUpSessionActionResult = {
  success: boolean;
  message: string;
  data?: {
    count: number;
  };
};

type CrmFollowUpSessionInput = {
  userId: string;
  remoteJid: string;
  instanceId: string;
};

type CrmFollowUpItemInput = {
  userId: string;
  followUpId: string;
};

type CrmFollowUpScheduleInput = CrmFollowUpItemInput & {
  scheduledFor: string;
};

type OwnedFollowUp = {
  id: string;
  userId: string;
  sessionId: number;
  status: CrmFollowUpStatus;
  leadStatusSnapshot: LeadStatus;
};

function normalizeSessionInput(input: CrmFollowUpSessionInput) {
  return {
    userId: input.userId.trim(),
    remoteJid: input.remoteJid.trim(),
    instanceId: input.instanceId.trim(),
  };
}

function normalizeFollowUpInput(input: CrmFollowUpItemInput) {
  return {
    userId: input.userId.trim(),
    followUpId: input.followUpId.trim(),
  };
}

function formatCountMessage(config: {
  count: number;
  zero: string;
  singular: string;
  plural: (count: number) => string;
}) {
  if (config.count === 0) return config.zero;
  return config.count === 1 ? config.singular : config.plural(config.count);
}

function formatSkippedReactivationMessage(skippedCount: number) {
  if (skippedCount === 0) return "";
  return skippedCount === 1
    ? " 1 no pudo reactivarse por las reglas actuales."
    : ` ${skippedCount} no pudieron reactivarse por las reglas actuales.`;
}

function isActiveStatus(
  status: CrmFollowUpStatus
): status is ActiveCrmFollowUpStatus {
  return ACTIVE_FOLLOW_UP_STATUSES.includes(status as ActiveCrmFollowUpStatus);
}

function isReactivatableStatus(
  status: CrmFollowUpStatus
): status is ReactivatableCrmFollowUpStatus {
  return REACTIVATABLE_FOLLOW_UP_STATUSES.includes(
    status as ReactivatableCrmFollowUpStatus
  );
}

async function ensureAuthorizedUser(userId: string) {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("Falta el usuario del CRM.");
  }

  await assertUserCanUseApp(normalizedUserId);
  return normalizedUserId;
}

async function ensureSessionOwnership(input: CrmFollowUpSessionInput) {
  const normalized = normalizeSessionInput(input);

  if (!normalized.userId || !normalized.remoteJid || !normalized.instanceId) {
    return {
      ok: false as const,
      result: {
        success: false,
        message: "Faltan datos para operar el follow-up.",
      } satisfies CrmFollowUpSessionActionResult,
    };
  }

  await ensureAuthorizedUser(normalized.userId);

  const candidates = buildWhatsAppJidCandidates(normalized.remoteJid);
  const session = await db.session.findFirst({
    where: {
      userId: normalized.userId,
      instanceId: normalized.instanceId,
      OR: [
        { remoteJid: { in: candidates } },
        { remoteJidAlt: { in: candidates } },
      ],
    },
    select: {
      id: true,
    },
  });

  if (!session) {
    return {
      ok: false as const,
      result: {
        success: false,
        message: "La sesion no pertenece al usuario actual.",
      } satisfies CrmFollowUpSessionActionResult,
    };
  }

  return {
    ok: true as const,
    input: {
      ...normalized,
      id: session.id,
    },
  };
}

async function ensureFollowUpOwnership(input: CrmFollowUpItemInput) {
  const normalized = normalizeFollowUpInput(input);

  if (!normalized.userId || !normalized.followUpId) {
    return {
      ok: false as const,
      result: {
        success: false,
        message: "Faltan datos para operar el follow-up.",
      } satisfies CrmFollowUpSessionActionResult,
    };
  }

  await ensureAuthorizedUser(normalized.userId);

  const followUp = await db.crmFollowUp.findFirst({
    where: {
      id: normalized.followUpId,
      userId: normalized.userId,
    },
    select: {
      id: true,
      userId: true,
      sessionId: true,
      status: true,
      leadStatusSnapshot: true,
    },
  });

  if (!followUp) {
    return {
      ok: false as const,
      result: {
        success: false,
        message: "El follow-up no pertenece al usuario actual.",
      } satisfies CrmFollowUpSessionActionResult,
    };
  }

  return {
    ok: true as const,
    followUp: {
      ...followUp,
      status: followUp.status as CrmFollowUpStatus,
      leadStatusSnapshot: followUp.leadStatusSnapshot as LeadStatus,
    } satisfies OwnedFollowUp,
  };
}

async function buildReactivationUpdates(
  userId: string,
  followUps: Array<Pick<OwnedFollowUp, "id" | "leadStatusSnapshot">>
) {
  if (!followUps.length) {
    return {
      updates: [],
      skippedCount: 0,
    };
  }

  await assertAuthorizedCrmFeatureEnabled(userId, "crmFollowUps");

  const uniqueLeadStatuses = Array.from(
    new Set(followUps.map((item) => item.leadStatusSnapshot))
  );

  const [user, rules] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    }),
    db.crmFollowUpRule.findMany({
      where: {
        userId,
        leadStatus: {
          in: uniqueLeadStatuses,
        },
      },
      select: {
        id: true,
        userId: true,
        leadStatus: true,
        enabled: true,
        delayMinutes: true,
        maxAttempts: true,
        goal: true,
        prompt: true,
        fallbackMessage: true,
        allowedWeekdays: true,
        sendStartTime: true,
        sendEndTime: true,
        updatedAt: true,
      },
    }),
  ]);

  const rulesByStatus = new Map(
    rules.map((rule) => [
      rule.leadStatus,
      normalizeCrmFollowUpRule({
        ...rule,
        updatedAt: rule.updatedAt?.toISOString?.() ?? null,
      }),
    ])
  );

  let skippedCount = 0;

  const updates = followUps.flatMap((followUp) => {
    const rule = rulesByStatus.get(followUp.leadStatusSnapshot);

    if (!rule || !rule.enabled) {
      skippedCount += 1;
      return [];
    }

    const scheduledFor = computeCrmFollowUpScheduledFor({
      delayMinutes: rule.delayMinutes,
      timeZone: user?.timezone ?? null,
      allowedWeekdays: rule.allowedWeekdays,
      sendStartTime: rule.sendStartTime,
      sendEndTime: rule.sendEndTime,
    });

    return [
      db.crmFollowUp.update({
        where: { id: followUp.id },
        data: {
          status: "PENDING",
          attemptCount: 0,
          generatedMessage: null,
          errorReason: null,
          lastProcessedAt: null,
          sentAt: null,
          cancelledAt: null,
          scheduledFor,
          maxAttempts: rule.maxAttempts,
          goalSnapshot: rule.goal,
          promptSnapshot: rule.prompt,
          fallbackMessageSnapshot: rule.fallbackMessage,
          allowedWeekdaysSnapshot: rule.allowedWeekdays,
          sendStartTimeSnapshot: rule.sendStartTime,
          sendEndTimeSnapshot: rule.sendEndTime,
        },
      }),
    ];
  });

  return {
    updates,
    skippedCount,
  };
}

async function deleteUserCrmFollowUpsByStatuses(
  userId: string,
  statuses: readonly CrmFollowUpStatus[]
) {
  const normalizedUserId = await ensureAuthorizedUser(userId);

  return db.crmFollowUp.deleteMany({
    where: {
      userId: normalizedUserId,
      status: {
        in: [...statuses],
      },
    },
  });
}

export async function cancelSessionCrmFollowUps(
  input: CrmFollowUpSessionInput
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const sessionCheck = await ensureSessionOwnership(input);
    if (!sessionCheck.ok) return sessionCheck.result;

    const result = await db.crmFollowUp.updateMany({
      where: {
        sessionId: sessionCheck.input.id,
        status: {
          in: [...ACTIVE_FOLLOW_UP_STATUSES],
        },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    return {
      success: true,
      message: formatCountMessage({
        count: result.count,
        zero: "No hay follow-ups activos para cancelar.",
        singular: "Se cancelo 1 follow-up activo.",
        plural: (count) => `Se cancelaron ${count} follow-ups activos.`,
      }),
      data: { count: result.count },
    };
  } catch (error) {
    console.error("[cancelSessionCrmFollowUps]", error);
    return {
      success: false,
      message: "No se pudieron cancelar los follow-ups.",
    };
  }
}

export async function retrySessionFailedCrmFollowUps(
  input: CrmFollowUpSessionInput
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const sessionCheck = await ensureSessionOwnership(input);
    if (!sessionCheck.ok) return sessionCheck.result;

    const failedFollowUps = await db.crmFollowUp.findMany({
      where: {
        sessionId: sessionCheck.input.id,
        status: "FAILED",
      },
      select: {
        id: true,
        leadStatusSnapshot: true,
      },
    });

    if (failedFollowUps.length === 0) {
      return {
        success: true,
        message: "No hay follow-ups fallidos para reactivar.",
        data: { count: 0 },
      };
    }

    const { updates, skippedCount } = await buildReactivationUpdates(
      sessionCheck.input.userId,
      failedFollowUps.map((followUp) => ({
        id: followUp.id,
        leadStatusSnapshot: followUp.leadStatusSnapshot as LeadStatus,
      }))
    );

    if (updates.length === 0) {
      return {
        success: false,
        message: "Las reglas actuales no permiten reactivar los follow-ups fallidos.",
      };
    }

    await db.$transaction(updates);

    return {
      success: true,
      message: `${formatCountMessage({
        count: updates.length,
        zero: "No hay follow-ups fallidos para reactivar.",
        singular: "Se reactivo 1 follow-up fallido.",
        plural: (count) => `Se reactivaron ${count} follow-ups fallidos.`,
      })}${formatSkippedReactivationMessage(skippedCount)}`,
      data: { count: updates.length },
    };
  } catch (error) {
    console.error("[retrySessionFailedCrmFollowUps]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron reactivar los follow-ups fallidos.",
    };
  }
}

export async function retrySessionCancelledCrmFollowUps(
  input: CrmFollowUpSessionInput
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const sessionCheck = await ensureSessionOwnership(input);
    if (!sessionCheck.ok) return sessionCheck.result;

    const cancelledFollowUps = await db.crmFollowUp.findMany({
      where: {
        sessionId: sessionCheck.input.id,
        status: "CANCELLED",
      },
      select: {
        id: true,
        leadStatusSnapshot: true,
      },
    });

    if (cancelledFollowUps.length === 0) {
      return {
        success: true,
        message: "No hay follow-ups cancelados para reactivar.",
        data: { count: 0 },
      };
    }

    const { updates, skippedCount } = await buildReactivationUpdates(
      sessionCheck.input.userId,
      cancelledFollowUps.map((followUp) => ({
        id: followUp.id,
        leadStatusSnapshot: followUp.leadStatusSnapshot as LeadStatus,
      }))
    );

    if (updates.length === 0) {
      return {
        success: false,
        message: "Las reglas actuales no permiten reactivar los follow-ups cancelados.",
      };
    }

    await db.$transaction(updates);

    return {
      success: true,
      message: `${formatCountMessage({
        count: updates.length,
        zero: "No hay follow-ups cancelados para reactivar.",
        singular: "Se reactivo 1 follow-up cancelado.",
        plural: (count) => `Se reactivaron ${count} follow-ups cancelados.`,
      })}${formatSkippedReactivationMessage(skippedCount)}`,
      data: { count: updates.length },
    };
  } catch (error) {
    console.error("[retrySessionCancelledCrmFollowUps]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron reactivar los follow-ups cancelados.",
    };
  }
}

export async function retrySessionReactivatableCrmFollowUps(
  input: CrmFollowUpSessionInput
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const sessionCheck = await ensureSessionOwnership(input);
    if (!sessionCheck.ok) return sessionCheck.result;

    const reactivatableFollowUps = await db.crmFollowUp.findMany({
      where: {
        sessionId: sessionCheck.input.id,
        status: { in: ["FAILED", "CANCELLED", "SENT"] },
      },
      select: {
        id: true,
        leadStatusSnapshot: true,
      },
    });

    if (reactivatableFollowUps.length === 0) {
      return {
        success: true,
        message: "No hay follow-ups para reactivar.",
        data: { count: 0 },
      };
    }

    const { updates, skippedCount } = await buildReactivationUpdates(
      sessionCheck.input.userId,
      reactivatableFollowUps.map((followUp) => ({
        id: followUp.id,
        leadStatusSnapshot: followUp.leadStatusSnapshot as LeadStatus,
      }))
    );

    if (updates.length === 0) {
      return {
        success: false,
        message: "Las reglas actuales no permiten reactivar los follow-ups.",
      };
    }

    await db.$transaction(updates);

    return {
      success: true,
      message: `${formatCountMessage({
        count: updates.length,
        zero: "No hay follow-ups para reactivar.",
        singular: "Se reactivo 1 follow-up IA.",
        plural: (count) => `Se reactivaron ${count} follow-ups IA.`,
      })}${formatSkippedReactivationMessage(skippedCount)}`,
      data: { count: updates.length },
    };
  } catch (error) {
    console.error("[retrySessionReactivatableCrmFollowUps]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron reactivar los follow-ups IA.",
    };
  }
}

export async function updateCrmFollowUpSchedule(
  input: CrmFollowUpScheduleInput
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const followUpCheck = await ensureFollowUpOwnership(input);
    if (!followUpCheck.ok) return followUpCheck.result;

    if (!isActiveStatus(followUpCheck.followUp.status)) {
      return {
        success: false,
        message: "Solo se pueden editar follow-ups activos.",
      };
    }

    const scheduledFor = new Date(input.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      return {
        success: false,
        message: "La fecha del follow-up no es valida.",
      };
    }

    await db.crmFollowUp.update({
      where: { id: followUpCheck.followUp.id },
      data: {
        scheduledFor,
        status: "PENDING",
        lastProcessedAt: null,
      },
    });

    return {
      success: true,
      message: "Se reprogramo el follow-up correctamente.",
      data: { count: 1 },
    };
  } catch (error) {
    console.error("[updateCrmFollowUpSchedule]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo reprogramar el follow-up.",
    };
  }
}

export async function deleteCrmFollowUpById(
  input: CrmFollowUpItemInput
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const followUpCheck = await ensureFollowUpOwnership(input);
    if (!followUpCheck.ok) return followUpCheck.result;

    await db.crmFollowUp.delete({
      where: { id: followUpCheck.followUp.id },
    });

    return {
      success: true,
      message: "Se elimino el follow-up correctamente.",
      data: { count: 1 },
    };
  } catch (error) {
    console.error("[deleteCrmFollowUpById]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el follow-up.",
    };
  }
}

export async function reactivateCrmFollowUpById(
  input: CrmFollowUpItemInput
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const followUpCheck = await ensureFollowUpOwnership(input);
    if (!followUpCheck.ok) return followUpCheck.result;

    if (!isReactivatableStatus(followUpCheck.followUp.status)) {
      return {
        success: false,
        message: "El follow-up actual no admite reactivacion.",
      };
    }

    const { updates } = await buildReactivationUpdates(
      followUpCheck.followUp.userId,
      [
        {
          id: followUpCheck.followUp.id,
          leadStatusSnapshot: followUpCheck.followUp.leadStatusSnapshot,
        },
      ]
    );

    if (updates.length === 0) {
      return {
        success: false,
        message: "Las reglas actuales no permiten reactivar este follow-up.",
      };
    }

    await db.$transaction(updates);

    return {
      success: true,
      message: "Se reactivo el follow-up correctamente.",
      data: { count: 1 },
    };
  } catch (error) {
    console.error("[reactivateCrmFollowUpById]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo reactivar el follow-up.",
    };
  }
}

export async function cancelUserActiveCrmFollowUps(
  userId: string
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const normalizedUserId = await ensureAuthorizedUser(userId);

    const result = await db.crmFollowUp.updateMany({
      where: {
        userId: normalizedUserId,
        status: {
          in: [...ACTIVE_FOLLOW_UP_STATUSES],
        },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    return {
      success: true,
      message: formatCountMessage({
        count: result.count,
        zero: "No hay follow-ups activos para cancelar.",
        singular: "Se cancelo 1 follow-up activo.",
        plural: (count) => `Se cancelaron ${count} follow-ups activos.`,
      }),
      data: { count: result.count },
    };
  } catch (error) {
    console.error("[cancelUserActiveCrmFollowUps]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron cancelar los follow-ups activos.",
    };
  }
}

export async function deleteUserActiveCrmFollowUps(
  userId: string
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const result = await deleteUserCrmFollowUpsByStatuses(userId, ACTIVE_FOLLOW_UP_STATUSES);

    return {
      success: true,
      message: formatCountMessage({
        count: result.count,
        zero: "No hay follow-ups activos para eliminar.",
        singular: "Se elimino 1 follow-up activo.",
        plural: (count) => `Se eliminaron ${count} follow-ups activos.`,
      }),
      data: { count: result.count },
    };
  } catch (error) {
    console.error("[deleteUserActiveCrmFollowUps]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron eliminar los follow-ups activos.",
    };
  }
}

export async function deleteUserSentCrmFollowUps(
  userId: string
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const result = await deleteUserCrmFollowUpsByStatuses(userId, ["SENT"]);

    return {
      success: true,
      message: formatCountMessage({
        count: result.count,
        zero: "No hay follow-ups enviados para eliminar.",
        singular: "Se elimino 1 follow-up enviado.",
        plural: (count) => `Se eliminaron ${count} follow-ups enviados.`,
      }),
      data: { count: result.count },
    };
  } catch (error) {
    console.error("[deleteUserSentCrmFollowUps]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron eliminar los follow-ups enviados.",
    };
  }
}

export async function reactivateUserSentCrmFollowUps(
  userId: string
): Promise<CrmFollowUpSessionActionResult> {
  try {
    const normalizedUserId = await ensureAuthorizedUser(userId);

    const sentFollowUps = await db.crmFollowUp.findMany({
      where: {
        userId: normalizedUserId,
        status: "SENT",
      },
      select: {
        id: true,
        leadStatusSnapshot: true,
      },
    });

    if (sentFollowUps.length === 0) {
      return {
        success: true,
        message: "No hay follow-ups enviados para reactivar.",
        data: { count: 0 },
      };
    }

    const { updates, skippedCount } = await buildReactivationUpdates(
      normalizedUserId,
      sentFollowUps.map((followUp) => ({
        id: followUp.id,
        leadStatusSnapshot: followUp.leadStatusSnapshot as LeadStatus,
      }))
    );

    if (updates.length === 0) {
      return {
        success: false,
        message: "Las reglas actuales no permiten reactivar los follow-ups enviados.",
      };
    }

    await db.$transaction(updates);

    return {
      success: true,
      message: `${formatCountMessage({
        count: updates.length,
        zero: "No hay follow-ups enviados para reactivar.",
        singular: "Se reactivo 1 follow-up enviado.",
        plural: (count) => `Se reactivaron ${count} follow-ups enviados.`,
      })}${formatSkippedReactivationMessage(skippedCount)}`,
      data: { count: updates.length },
    };
  } catch (error) {
    console.error("[reactivateUserSentCrmFollowUps]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron reactivar los follow-ups enviados.",
    };
  }
}

export async function getSessionLatestSummarySnapshot(sessionId: number): Promise<{
  success: boolean;
  data?: { id: string; summarySnapshot: string | null } | null;
  message?: string;
}> {
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session?.userId) {
      return { success: false, message: "Sesion no encontrada." };
    }

    await assertUserCanUseApp(session.userId);

    const followUp = await db.crmFollowUp.findFirst({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      select: { id: true, summarySnapshot: true },
    });

    return { success: true, data: followUp ?? null };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al obtener síntesis",
    };
  }
}

export async function createManualSynthesis(
  sessionId: number,
  summarySnapshot: string
): Promise<{ success: boolean; message: string; data?: { id: string } }> {
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, remoteJid: true, instanceId: true, leadStatus: true },
    });
    if (!session?.userId) {
      return { success: false, message: "Sesión no encontrada." };
    }

    await assertUserCanUseApp(session.userId);

    const followUp = await db.crmFollowUp.upsert({
      where: {
        sessionId_ruleKey_sourceHash: {
          sessionId,
          ruleKey: "manual-synthesis",
          sourceHash: "__manual__",
        },
      },
      update: { summarySnapshot },
      create: {
        sessionId,
        userId: session.userId,
        remoteJid: session.remoteJid,
        instanceId: session.instanceId,
        leadStatusSnapshot: session.leadStatus ?? "TIBIO",
        ruleKey: "manual-synthesis",
        sourceHash: "__manual__",
        scheduledFor: new Date(),
        status: "CANCELLED",
        summarySnapshot,
      },
    });

    return { success: true, message: "Síntesis guardada correctamente", data: { id: followUp.id } };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al guardar síntesis",
    };
  }
}

export async function updateFollowUpSummarySnapshot(
  followUpId: string,
  summarySnapshot: string
): Promise<{ success: boolean; message: string }> {
  try {
    const followUp = await db.crmFollowUp.findUnique({
      where: { id: followUpId },
      select: { userId: true },
    });
    if (!followUp?.userId) {
      return { success: false, message: "Follow-up no encontrado." };
    }

    await assertUserCanUseApp(followUp.userId);

    await db.crmFollowUp.update({
      where: { id: followUpId },
      data: { summarySnapshot },
    });

    return { success: true, message: "Síntesis actualizada correctamente" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al actualizar síntesis",
    };
  }
}

export type SessionFollowUpItem = {
  id: string;
  status: CrmFollowUpStatus;
  leadStatusSnapshot: LeadStatus;
  ruleKey: string;
  scheduledFor: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  generatedMessage: string | null;
  errorReason: string | null;
  goalSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getSessionCrmFollowUps(
  sessionId: number,
  userId: string
): Promise<{ success: boolean; message: string; data?: SessionFollowUpItem[] }> {
  try {
    await assertUserCanUseApp(userId);

    const followUps = await db.crmFollowUp.findMany({
      where: { sessionId, userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        leadStatusSnapshot: true,
        ruleKey: true,
        scheduledFor: true,
        sentAt: true,
        cancelledAt: true,
        attemptCount: true,
        maxAttempts: true,
        generatedMessage: true,
        errorReason: true,
        goalSnapshot: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: "Follow-ups obtenidos correctamente",
      data: followUps.map((fu) => ({
        id: fu.id,
        status: fu.status as CrmFollowUpStatus,
        leadStatusSnapshot: fu.leadStatusSnapshot as LeadStatus,
        ruleKey: fu.ruleKey,
        scheduledFor: fu.scheduledFor?.toISOString() ?? null,
        sentAt: fu.sentAt?.toISOString() ?? null,
        cancelledAt: fu.cancelledAt?.toISOString() ?? null,
        attemptCount: fu.attemptCount,
        maxAttempts: fu.maxAttempts,
        generatedMessage: fu.generatedMessage,
        errorReason: fu.errorReason,
        goalSnapshot: fu.goalSnapshot,
        createdAt: fu.createdAt.toISOString(),
        updatedAt: fu.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al obtener los seguimientos.",
    };
  }
}
