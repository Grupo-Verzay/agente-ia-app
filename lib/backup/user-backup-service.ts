import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminOrReseller } from "@/lib/rbac";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

export const USER_BACKUP_VERSION = 1;
const BACKUP_TRANSACTION_TIMEOUT_MS = 60_000;
const BACKUP_TRANSACTION_MAX_WAIT_MS = 10_000;

const restorableUserFields = [
  "name",
  "image",
  "company",
  "apiUrl",
  "lat",
  "lng",
  "mapsUrl",
  "notificationNumber",
  "delSeguimiento",
  "plan",
  "autoReactivate",
  "webhookUrl",
  "theme",
  "muteAgentResponses",
  "timezone",
  "meetingDuration",
  "onFacebook",
  "onInstagram",
  "aiModelId",
  "defaultAiModelId",
  "defaultProviderId",
  "delayTimeGpt",
  "meetingUrl",
  "preferredCurrencyCode",
  "enabledSynthesizer",
  "enabledLeadStatusClassifier",
  "enabledCrmFollowUps",
  "status",
] as const;

type RestorableUserField = (typeof restorableUserFields)[number];

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const jsonObjectSchema = z.record(z.any());

const userBackupSchema = z.object({
  version: z.literal(USER_BACKUP_VERSION),
  exportedAt: z.string().datetime(),
  source: z.object({
    userId: z.string().min(1),
    email: z.string().email().optional().nullable(),
    company: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
  }),
  data: z.object({
    user: jsonObjectSchema,
    apiKey: jsonObjectSchema.nullable(),
    agentPrompts: z.array(jsonObjectSchema),
    agentPromptRevisions: z.array(jsonObjectSchema),
    appointments: z.array(jsonObjectSchema),
    chatConversationPreferences: z.array(jsonObjectSchema),
    crmFollowUpRules: z.array(jsonObjectSchema),
    crmFollowUps: z.array(jsonObjectSchema),
    externalClientData: z.array(jsonObjectSchema),
    financeAccounts: z.array(jsonObjectSchema),
    financeAttachments: z.array(jsonObjectSchema),
    financeCategories: z.array(jsonObjectSchema),
    financeTransactions: z.array(jsonObjectSchema),
    iaCredit: jsonObjectSchema.nullable(),
    instancias: z.array(jsonObjectSchema),
    pausar: z.array(jsonObjectSchema),
    products: z.array(jsonObjectSchema),
    promptInstances: z.array(jsonObjectSchema),
    quickReplies: z.array(jsonObjectSchema),
    reminders: z.array(jsonObjectSchema),
    services: z.array(jsonObjectSchema),
    sessionTags: z.array(jsonObjectSchema),
    sessionTriggers: z.array(jsonObjectSchema),
    sessionWorkflowStates: z.array(jsonObjectSchema),
    sessions: z.array(jsonObjectSchema),
    systemMessages: z.array(jsonObjectSchema),
    tags: z.array(jsonObjectSchema),
    tools: z.array(jsonObjectSchema),
    userAiConfigs: z.array(jsonObjectSchema),
    userAvailability: z.array(jsonObjectSchema),
    userBilling: jsonObjectSchema.nullable(),
    userModules: z.array(
      z.object({
        moduleId: z.string().min(1),
      })
    ),
    workflows: z.array(jsonObjectSchema),
    workflowEdges: z.array(jsonObjectSchema),
    workflowNodes: z.array(jsonObjectSchema),
    registros: z.array(jsonObjectSchema),
  }),
});

export type UserBackupPayload = z.infer<typeof userBackupSchema>;

function assertCanManageTarget(me: Awaited<ReturnType<typeof currentUser>>, targetUserId: string) {
  if (!me) {
    throw new Error("No autorizado.");
  }

  if (me.id !== targetUserId && !isAdminOrReseller(me.role)) {
    throw new Error("No autorizado para administrar este usuario.");
  }
}

function pickRestorableUserData(user: Record<string, unknown>) {
  const data: Record<string, unknown> = {};

  for (const key of restorableUserFields) {
    if (Object.prototype.hasOwnProperty.call(user, key)) {
      data[key] = user[key];
    }
  }

  return data;
}

function buildBackupFileName(payload: UserBackupPayload) {
  const safeCompany =
    payload.source.company
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "usuario";
  const safeDate = payload.exportedAt.slice(0, 19).replace(/[:T]/g, "-");

  return `verzay-backup-${safeCompany}-${safeDate}.json`;
}

async function createManyIfPresent<TInput>(
  items: TInput[],
  createMany: (data: TInput[]) => Promise<unknown>
) {
  if (!items.length) return;
  await createMany(items);
}

async function cleanupOrphanApiKey(tx: TxClient, apiKeyId: string | null | undefined) {
  if (!apiKeyId) return;

  await tx.apiKey.deleteMany({
    where: {
      id: apiKeyId,
      users: { none: {} },
    },
  });
}

async function purgeUserOwnedData(tx: TxClient, userId: string) {
  const [sessions, instancias] = await Promise.all([
    tx.session.findMany({
      where: { userId },
      select: { instanceId: true, remoteJid: true },
    }),
    tx.instancia.findMany({
      where: { userId },
      select: { instanceName: true },
    }),
  ]);

  const remoteJids = sessions
    .map((session) => session.remoteJid)
    .filter((value): value is string => Boolean(value));
  const instanceIds = sessions
    .map((session) => session.instanceId)
    .filter((value): value is string => Boolean(value));
  const instanceNames = instancias
    .map((instancia) => instancia.instanceName)
    .filter((value): value is string => Boolean(value));

  await tx.quickReply.deleteMany({ where: { userId } });
  await tx.reminders.deleteMany({ where: { userId } });
  await tx.workflowExecutionLock.deleteMany({ where: { userId } });
  await tx.userModule.deleteMany({ where: { B: userId } });
  await tx.externalClientData.deleteMany({ where: { userId } });
  await tx.chatConversationPreference.deleteMany({ where: { userId } });
  await tx.financeAttachment.deleteMany({ where: { userId } });
  await tx.financeTransaction.deleteMany({ where: { userId } });
  await tx.financeAccount.deleteMany({ where: { userId } });
  await tx.financeCategory.deleteMany({ where: { userId } });
  await tx.crmFollowUp.deleteMany({ where: { userId } });
  await tx.crmFollowUpRule.deleteMany({ where: { userId } });
  await tx.appointment.deleteMany({ where: { userId } });
  await tx.service.deleteMany({ where: { userId } });
  await tx.agentPrompt.deleteMany({ where: { userId } });
  await tx.workflow.deleteMany({ where: { userId } });
  await tx.promptInstance.deleteMany({ where: { userId } });
  await tx.product.deleteMany({ where: { userId } });
  await tx.systemMessage.deleteMany({ where: { userId } });
  await tx.session.deleteMany({ where: { userId } });
  await tx.tag.deleteMany({ where: { userId } });
  await tx.pausar.deleteMany({ where: { userId } });
  await tx.instancia.deleteMany({ where: { userId } });
  await tx.tool.deleteMany({ where: { userId } });
  await tx.userAvailability.deleteMany({ where: { userId } });
  await tx.userBilling.deleteMany({ where: { userId } });
  await tx.iaCredit.deleteMany({ where: { userId } });
  await tx.userAiConfig.deleteMany({ where: { userId } });

  if (instanceIds.length) {
    await tx.n8nChatHistory.deleteMany({
      where: { sessionId: { in: instanceIds } },
    });
  }

  const seguimientoClauses: Prisma.SeguimientoWhereInput[] = [];

  if (remoteJids.length) {
    seguimientoClauses.push({ remoteJid: { in: remoteJids } });
  }

  if (instanceNames.length) {
    seguimientoClauses.push({ instancia: { in: instanceNames } });
  }

  if (seguimientoClauses.length) {
    await tx.seguimiento.deleteMany({
      where: { OR: seguimientoClauses },
    });
  }
}

export async function exportUserBackup(targetUserId: string) {
  const me = await currentUser();
  assertCanManageTarget(me, targetUserId);

  const payload = await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        company: true,
        apiUrl: true,
        lat: true,
        lng: true,
        mapsUrl: true,
        notificationNumber: true,
        delSeguimiento: true,
        plan: true,
        autoReactivate: true,
        webhookUrl: true,
        theme: true,
        muteAgentResponses: true,
        timezone: true,
        meetingDuration: true,
        onFacebook: true,
        onInstagram: true,
        aiModelId: true,
        defaultAiModelId: true,
        defaultProviderId: true,
        delayTimeGpt: true,
        meetingUrl: true,
        preferredCurrencyCode: true,
        enabledSynthesizer: true,
        enabledLeadStatusClassifier: true,
        enabledCrmFollowUps: true,
        status: true,
        apiKey: {
          select: {
            url: true,
            key: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("Usuario no encontrado.");
    }

    const [
      agentPrompts,
      agentPromptRevisions,
      appointments,
      chatConversationPreferences,
      crmFollowUpRules,
      crmFollowUps,
      externalClientData,
      financeAccounts,
      financeAttachments,
      financeCategories,
      financeTransactions,
      iaCredit,
      instancias,
      pausar,
      products,
      promptInstances,
      quickReplies,
      reminders,
      registros,
      services,
      sessionTags,
      sessionTriggers,
      sessionWorkflowStates,
      sessions,
      systemMessages,
      tags,
      tools,
      userAiConfigs,
      userAvailability,
      userBilling,
      userModules,
      workflowEdges,
      workflowNodes,
      workflows,
    ] = await Promise.all([
      tx.agentPrompt.findMany({ where: { userId: targetUserId } }),
      tx.agentPromptRevision.findMany({
        where: { agentPrompt: { userId: targetUserId } },
      }),
      tx.appointment.findMany({ where: { userId: targetUserId } }),
      tx.chatConversationPreference.findMany({ where: { userId: targetUserId } }),
      tx.crmFollowUpRule.findMany({ where: { userId: targetUserId } }),
      tx.crmFollowUp.findMany({ where: { userId: targetUserId } }),
      tx.externalClientData.findMany({ where: { userId: targetUserId } }),
      tx.financeAccount.findMany({ where: { userId: targetUserId } }),
      tx.financeAttachment.findMany({ where: { userId: targetUserId } }),
      tx.financeCategory.findMany({ where: { userId: targetUserId } }),
      tx.financeTransaction.findMany({ where: { userId: targetUserId } }),
      tx.iaCredit.findUnique({ where: { userId: targetUserId } }),
      tx.instancia.findMany({ where: { userId: targetUserId } }),
      tx.pausar.findMany({ where: { userId: targetUserId } }),
      tx.product.findMany({ where: { userId: targetUserId } }),
      tx.promptInstance.findMany({ where: { userId: targetUserId } }),
      tx.quickReply.findMany({ where: { userId: targetUserId } }),
      tx.reminders.findMany({ where: { userId: targetUserId } }),
      tx.registro.findMany({
        where: { session: { userId: targetUserId } },
      }),
      tx.service.findMany({ where: { userId: targetUserId } }),
      tx.sessionTag.findMany({
        where: { session: { userId: targetUserId } },
      }),
      tx.sessionTrigger.findMany({
        where: { session: { userId: targetUserId } },
      }),
      tx.sessionWorkflowState.findMany({
        where: { session: { userId: targetUserId } },
      }),
      tx.session.findMany({ where: { userId: targetUserId } }),
      tx.systemMessage.findMany({ where: { userId: targetUserId } }),
      tx.tag.findMany({ where: { userId: targetUserId } }),
      tx.tool.findMany({ where: { userId: targetUserId } }),
      tx.userAiConfig.findMany({ where: { userId: targetUserId } }),
      tx.userAvailability.findMany({ where: { userId: targetUserId } }),
      tx.userBilling.findUnique({ where: { userId: targetUserId } }),
      tx.userModule.findMany({
        where: { B: targetUserId },
        select: { A: true },
      }),
      tx.workflowEdge.findMany({
        where: { workflow: { userId: targetUserId } },
      }),
      tx.workflowNode.findMany({
        where: { workflow: { userId: targetUserId } },
      }),
      tx.workflow.findMany({ where: { userId: targetUserId } }),
    ]);

    return {
      version: USER_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      source: {
        userId: user.id,
        email: user.email,
        company: user.company,
        name: user.name,
      },
      data: {
        user,
        apiKey: user.apiKey,
        agentPrompts,
        agentPromptRevisions,
        appointments,
        chatConversationPreferences,
        crmFollowUpRules,
        crmFollowUps,
        externalClientData,
        financeAccounts,
        financeAttachments,
        financeCategories,
        financeTransactions,
        iaCredit,
        instancias,
        pausar,
        products,
        promptInstances,
        quickReplies,
        reminders,
        registros,
        services,
        sessionTags,
        sessionTriggers,
        sessionWorkflowStates,
        sessions,
        systemMessages,
        tags,
        tools,
        userAiConfigs,
        userAvailability,
        userBilling,
        userModules: userModules.map((item) => ({ moduleId: item.A })),
        workflowEdges,
        workflowNodes,
        workflows,
      },
    } satisfies UserBackupPayload;
  }, {
    timeout: BACKUP_TRANSACTION_TIMEOUT_MS,
    maxWait: BACKUP_TRANSACTION_MAX_WAIT_MS,
  });

  return {
    fileName: buildBackupFileName(payload),
    json: JSON.stringify(payload, null, 2),
    payload,
  };
}

export async function importUserBackup(targetUserId: string, rawBackup: string) {
  const me = await currentUser();
  assertCanManageTarget(me, targetUserId);

  const parsedJson = JSON.parse(rawBackup);
  const backup = userBackupSchema.parse(parsedJson);

  const result = await db.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        apiKeyId: true,
      },
    });

    if (!targetUser) {
      throw new Error("Usuario destino no encontrado.");
    }

    const incomingUserData = pickRestorableUserData(backup.data.user);
    const nextApiKeyData = backup.data.apiKey;

    const nextApiKey = nextApiKeyData
      ? await tx.apiKey.create({
          data: {
            url: String(nextApiKeyData.url ?? ""),
            key: String(nextApiKeyData.key ?? ""),
          },
        })
      : null;

    await purgeUserOwnedData(tx, targetUserId);

    await tx.user.update({
      where: { id: targetUserId },
      data: {
        ...incomingUserData,
        apiKeyId: nextApiKey?.id ?? null,
      },
    });

    await createManyIfPresent(
      backup.data.instancias.map((item) => ({
        ...(item as Prisma.InstanciaCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.instancia.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.pausar.map((item) => ({
        ...(item as Prisma.PausarCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.pausar.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.tags.map((item) => ({
        ...(item as Prisma.TagCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.tag.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.sessions.map((item) => ({
        ...(item as Prisma.SessionCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.session.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.sessionTags as Prisma.SessionTagCreateManyInput[],
      (data) => tx.sessionTag.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.sessionTriggers as Prisma.SessionTriggerCreateManyInput[],
      (data) => tx.sessionTrigger.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.registros as Prisma.RegistroCreateManyInput[],
      (data) => tx.registro.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.agentPrompts.map((item) => ({
        ...(item as Prisma.AgentPromptCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.agentPrompt.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.agentPromptRevisions.map((item) => ({
        ...(item as Prisma.AgentPromptRevisionCreateManyInput),
        publishedBy: targetUserId,
      })),
      (data) => tx.agentPromptRevision.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.promptInstances.map((item) => ({
        ...(item as Prisma.PromptInstanceCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.promptInstance.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.products.map((item) => ({
        ...(item as Prisma.ProductCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.product.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.services.map((item) => ({
        ...(item as Prisma.ServiceCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.service.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.appointments.map((item) => ({
        ...(item as Prisma.AppointmentCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.appointment.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.systemMessages.map((item) => ({
        ...(item as Prisma.SystemMessageCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.systemMessage.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.tools.map((item) => ({
        ...(item as Prisma.ToolCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.tool.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.userAvailability.map((item) => ({
        ...(item as Prisma.UserAvailabilityCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.userAvailability.createMany({ data })
    );

    if (backup.data.userBilling) {
      await tx.userBilling.create({
        data: {
          ...(backup.data.userBilling as Prisma.UserBillingUncheckedCreateInput),
          userId: targetUserId,
        },
      });
    }

    await createManyIfPresent(
      backup.data.chatConversationPreferences.map((item) => ({
        ...(item as Prisma.ChatConversationPreferenceCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.chatConversationPreference.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.crmFollowUpRules.map((item) => ({
        ...(item as Prisma.CrmFollowUpRuleCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.crmFollowUpRule.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.financeAccounts.map((item) => ({
        ...(item as Prisma.FinanceAccountCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.financeAccount.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.financeCategories.map((item) => ({
        ...(item as Prisma.FinanceCategoryCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.financeCategory.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.financeTransactions.map((item) => ({
        ...(item as Prisma.FinanceTransactionCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.financeTransaction.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.financeAttachments.map((item) => ({
        ...(item as Prisma.FinanceAttachmentCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.financeAttachment.createMany({ data })
    );

    if (backup.data.iaCredit) {
      await tx.iaCredit.create({
        data: {
          ...(backup.data.iaCredit as Prisma.IaCreditCreateManyInput),
          userId: targetUserId,
        },
      });
    }

    await createManyIfPresent(
      backup.data.userAiConfigs.map((item) => ({
        ...(item as Prisma.UserAiConfigCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.userAiConfig.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.externalClientData.map((item) => ({
        ...(item as Prisma.ExternalClientDataCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.externalClientData.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.workflows.map((item) => ({
        ...(item as Prisma.WorkflowCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.workflow.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.workflowNodes as Prisma.WorkflowNodeCreateManyInput[],
      (data) => tx.workflowNode.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.workflowEdges as Prisma.WorkflowEdgeCreateManyInput[],
      (data) => tx.workflowEdge.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.sessionWorkflowStates as Prisma.SessionWorkflowStateCreateManyInput[],
      (data) => tx.sessionWorkflowState.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.crmFollowUps.map((item) => ({
        ...(item as Prisma.CrmFollowUpCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.crmFollowUp.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.quickReplies.map((item) => ({
        ...(item as Prisma.QuickReplyCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.quickReply.createMany({ data })
    );

    await createManyIfPresent(
      backup.data.reminders.map((item) => ({
        ...(item as Prisma.RemindersCreateManyInput),
        userId: targetUserId,
      })),
      (data) => tx.reminders.createMany({ data })
    );

    const moduleIds = backup.data.userModules.map((item) => item.moduleId);

    if (moduleIds.length) {
      const availableModules = await tx.module.findMany({
        where: { id: { in: moduleIds } },
        select: { id: true },
      });

      if (availableModules.length) {
        await tx.userModule.createMany({
          data: availableModules.map((module) => ({
            A: module.id,
            B: targetUserId,
          })),
        });
      }
    }

    await cleanupOrphanApiKey(tx, targetUser.apiKeyId);

    return {
      restoredCollections: {
        sessions: backup.data.sessions.length,
        registros: backup.data.registros.length,
        workflows: backup.data.workflows.length,
        products: backup.data.products.length,
        reminders: backup.data.reminders.length,
        financeTransactions: backup.data.financeTransactions.length,
      },
    };
  }, {
    timeout: BACKUP_TRANSACTION_TIMEOUT_MS,
    maxWait: BACKUP_TRANSACTION_MAX_WAIT_MS,
  });

  return {
    backup,
    result,
  };
}
