"use server";

import type { LeadStatus } from "@/types/session";
import { assertAuthorizedCrmFeatureEnabled } from "@/actions/crm-feature-access";
import { db } from "@/lib/db";
import {
  computeCrmFollowUpScheduledFor,
  CRM_FOLLOW_UP_RULE_DEFAULTS,
  CRM_FOLLOW_UP_RULE_STATUS_ORDER,
  type CrmFollowUpRuleConfig,
  normalizeCrmFollowUpRule,
  sanitizeCrmFollowUpWeekdays,
  sanitizeCrmFollowUpTimeValue,
} from "@/lib/crm-follow-up-rules";

type RuleActionResult<T> = {
  success: boolean;
  message: string;
  data?: T;
};

type UpdateCrmFollowUpRuleInput = {
  userId: string;
  leadStatus: LeadStatus;
  enabled: boolean;
  delayMinutes: number;
  maxAttempts: number;
  goal: string;
  prompt: string;
  fallbackMessage: string;
  allowedWeekdays: number[];
  sendStartTime: string;
  sendEndTime: string;
};

async function ensureCrmFollowUpRules(userId: string) {
  const cleanUserId = String(userId ?? "").trim();
  if (!cleanUserId) {
    return [] as CrmFollowUpRuleConfig[];
  }

  const existing = await db.crmFollowUpRule.findMany({
    where: { userId: cleanUserId },
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
  });

  const existingStatuses = new Set(existing.map((rule) => rule.leadStatus));
  const missing = CRM_FOLLOW_UP_RULE_STATUS_ORDER.filter(
    (leadStatus) => !existingStatuses.has(leadStatus)
  );

  if (missing.length > 0) {
    await db.crmFollowUpRule.createMany({
      data: missing.map((leadStatus) => {
        const defaults = CRM_FOLLOW_UP_RULE_DEFAULTS[leadStatus];

        return {
          userId: cleanUserId,
          leadStatus,
          enabled: defaults.enabled,
          delayMinutes: defaults.delayMinutes,
          maxAttempts: defaults.maxAttempts,
          goal: defaults.goal,
          prompt: defaults.prompt,
          fallbackMessage: defaults.fallbackMessage,
          allowedWeekdays: defaults.allowedWeekdays,
          sendStartTime: defaults.sendStartTime,
          sendEndTime: defaults.sendEndTime,
        };
      }),
      skipDuplicates: true,
    });
  }

  const refreshed =
    missing.length > 0
      ? await db.crmFollowUpRule.findMany({
          where: { userId: cleanUserId },
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
        })
      : existing;

  return CRM_FOLLOW_UP_RULE_STATUS_ORDER.map((leadStatus) =>
    normalizeCrmFollowUpRule({
      userId: cleanUserId,
      leadStatus,
      ...(refreshed.find((rule) => rule.leadStatus === leadStatus) ?? {}),
      updatedAt:
        refreshed.find((rule) => rule.leadStatus === leadStatus)?.updatedAt?.toISOString?.() ??
        null,
    })
  );
}

export async function getCrmFollowUpRules(
  userId: string
): Promise<RuleActionResult<{ rules: CrmFollowUpRuleConfig[]; timezone: string | null }>> {
  try {
    await assertAuthorizedCrmFeatureEnabled(userId, "crmFollowUps");

    const [user, rules] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      }),
      ensureCrmFollowUpRules(userId),
    ]);

    return {
      success: true,
      message: "Reglas de follow-up cargadas.",
      data: {
        rules,
        timezone: user?.timezone ?? null,
      },
    };
  } catch (error) {
    console.error("[getCrmFollowUpRules]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las reglas de follow-up.",
    };
  }
}

export async function updateCrmFollowUpRule(
  input: UpdateCrmFollowUpRuleInput
): Promise<RuleActionResult<CrmFollowUpRuleConfig>> {
  try {
    await assertAuthorizedCrmFeatureEnabled(input.userId, "crmFollowUps");

    const normalized = normalizeCrmFollowUpRule({
      ...input,
      allowedWeekdays: sanitizeCrmFollowUpWeekdays(input.allowedWeekdays),
      sendStartTime: sanitizeCrmFollowUpTimeValue(
        input.sendStartTime,
        CRM_FOLLOW_UP_RULE_DEFAULTS[input.leadStatus].sendStartTime
      ),
      sendEndTime: sanitizeCrmFollowUpTimeValue(
        input.sendEndTime,
        CRM_FOLLOW_UP_RULE_DEFAULTS[input.leadStatus].sendEndTime
      ),
    });

    if (normalized.sendStartTime >= normalized.sendEndTime) {
      return {
        success: false,
        message: "La hora de inicio debe ser menor a la hora de fin.",
      };
    }

    if (normalized.enabled && normalized.allowedWeekdays.length === 0) {
      return {
        success: false,
        message: "Debes seleccionar al menos un dia habilitado.",
      };
    }

    if (normalized.enabled && normalized.maxAttempts < 1) {
      return {
        success: false,
        message: "El maximo de intentos debe ser mayor o igual a 1.",
      };
    }

    const user = await db.user.findUnique({
      where: { id: normalized.userId },
      select: { timezone: true },
    });

    const updated = await db.crmFollowUpRule.upsert({
      where: {
        userId_leadStatus: {
          userId: normalized.userId,
          leadStatus: normalized.leadStatus,
        },
      },
      update: {
        enabled: normalized.enabled,
        delayMinutes: normalized.delayMinutes,
        maxAttempts: normalized.enabled ? normalized.maxAttempts : 0,
        goal: normalized.goal,
        prompt: normalized.prompt,
        fallbackMessage: normalized.fallbackMessage,
        allowedWeekdays: normalized.allowedWeekdays,
        sendStartTime: normalized.sendStartTime,
        sendEndTime: normalized.sendEndTime,
      },
      create: {
        userId: normalized.userId,
        leadStatus: normalized.leadStatus,
        enabled: normalized.enabled,
        delayMinutes: normalized.delayMinutes,
        maxAttempts: normalized.enabled ? normalized.maxAttempts : 0,
        goal: normalized.goal,
        prompt: normalized.prompt,
        fallbackMessage: normalized.fallbackMessage,
        allowedWeekdays: normalized.allowedWeekdays,
        sendStartTime: normalized.sendStartTime,
        sendEndTime: normalized.sendEndTime,
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
    });

    if (!normalized.enabled) {
      await db.crmFollowUp.updateMany({
        where: {
          userId: normalized.userId,
          leadStatusSnapshot: normalized.leadStatus,
          status: {
            in: ["PENDING", "PROCESSING"],
          },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
    } else {
      const scheduledFor = computeCrmFollowUpScheduledFor({
        delayMinutes: normalized.delayMinutes,
        timeZone: user?.timezone ?? null,
        allowedWeekdays: normalized.allowedWeekdays,
        sendStartTime: normalized.sendStartTime,
        sendEndTime: normalized.sendEndTime,
      });

      await db.crmFollowUp.updateMany({
        where: {
          userId: normalized.userId,
          leadStatusSnapshot: normalized.leadStatus,
          status: "PENDING",
        },
        data: {
          scheduledFor,
          maxAttempts: normalized.maxAttempts,
          goalSnapshot: normalized.goal,
          promptSnapshot: normalized.prompt,
          fallbackMessageSnapshot: normalized.fallbackMessage,
          allowedWeekdaysSnapshot: normalized.allowedWeekdays,
          sendStartTimeSnapshot: normalized.sendStartTime,
          sendEndTimeSnapshot: normalized.sendEndTime,
        },
      });
    }

    return {
      success: true,
      message: "Regla de follow-up actualizada.",
      data: normalizeCrmFollowUpRule({
        ...updated,
        updatedAt: updated.updatedAt?.toISOString?.() ?? null,
      }),
    };
  } catch (error) {
    console.error("[updateCrmFollowUpRule]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la regla de follow-up.",
    };
  }
}
