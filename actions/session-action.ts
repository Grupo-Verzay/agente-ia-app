'use server'

import { db } from '@/lib/db'
import { registerSessionSchema } from '@/schema/session';
import { Prisma, Session as PrismaSession } from '@prisma/client';
import { z } from 'zod';
import { ActionResponse } from './tag-actions';
import {
  ChatContactDescriptor,
  ChatContactSessionMap,
  ChatContactSessionSummary,
  CrmFollowUpStatus,
  Session as AppSession,
  SessionCrmFollowUpHistoryItem,
  SessionCrmFollowUpSummary,
  SessionResponse,
  SessionResponseCrm,
  SessionsListResponse,
  SessionWithRegistrosAndTags,
  SingleSessionResponse,
} from '@/types/session';
import { assertUserCanUseApp } from './billing/helpers/app-access-guard';
import {
  buildWhatsAppJidCandidates,
  normalizeWhatsAppConversationJid,
  pickExplicitWhatsAppPhoneJid,
  pickObservedAlternateRemoteJid,
  pickPreferredWhatsAppRemoteJid,
} from '@/lib/whatsapp-jid';

// schema para agregar varios tags a una sesión
const addTagsToSessionSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.number().int().positive(),
  tagIds: z.array(z.number().int().positive()).min(1),
});

type SessionWithTagsRecord = Prisma.SessionGetPayload<{
  include: {
    sessionTags: {
      include: {
        tag: true;
      };
    };
  };
}>;

export type GetSessionByRemoteJidOptions = {
  instanceId?: string;
  aliases?: Array<string | null | undefined>;
  remoteJidAlt?: string;
  senderPn?: string;
};

function buildRemoteJidCandidates(
  remoteJid: string,
  extras: Array<string | null | undefined> = [],
) {
  return buildWhatsAppJidCandidates(remoteJid, extras);
}

function resolvePreferredRemoteJid(values: Array<string | null | undefined>) {
  return (
    pickExplicitWhatsAppPhoneJid(values) ||
    pickPreferredWhatsAppRemoteJid(values) ||
    normalizeWhatsAppConversationJid(values.find((value) => value?.trim()) ?? '') ||
    values.find((value) => value?.trim())?.trim() ||
    ''
  );
}

function scoreSessionMatch(
  session: Pick<PrismaSession, 'remoteJid' | 'remoteJidAlt' | 'updatedAt'>,
  requestedRemoteJid: string,
  preferredRemoteJid: string,
  candidates: string[],
) {
  if (session.remoteJid === preferredRemoteJid) return 0;
  if (session.remoteJidAlt === preferredRemoteJid) return 1;
  if (session.remoteJid === requestedRemoteJid) return 2;
  if (session.remoteJidAlt === requestedRemoteJid) return 3;
  if (candidates.includes(session.remoteJid)) return 4;
  if (session.remoteJidAlt && candidates.includes(session.remoteJidAlt)) return 5;
  return 99;
}

function createEmptyCrmFollowUpSummary(): SessionCrmFollowUpSummary {
  return {
    total: 0,
    active: 0,
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    latestStatus: null,
    latestGeneratedMessage: null,
    latestScheduledFor: null,
    recentItems: [],
  };
}

function mapSessionRecord(session: SessionWithTagsRecord): AppSession {
  const { sessionTags, ...sessionData } = session;

  return {
    ...sessionData,
    tags: sessionTags.map((item) => ({
      id: item.tag.id,
      name: item.tag.name,
      slug: item.tag.slug,
      color: item.tag.color,
      order: (item.tag as any).order ?? 0,
    })),
  };
}

function mapChatContactSessionSummary(
  session: SessionWithTagsRecord,
): ChatContactSessionSummary {
  const mappedSession = mapSessionRecord(session);

  return {
    id: mappedSession.id,
    userId: mappedSession.userId,
    remoteJid: mappedSession.remoteJid,
    remoteJidAlt: mappedSession.remoteJidAlt,
    pushName: mappedSession.pushName,
    tags: mappedSession.tags ?? [],
    leadStatus: mappedSession.leadStatus ?? null,
    flujos: mappedSession.flujos ?? null,
  };
}

async function buildCrmFollowUpSummaryForSession(
  sessionId: number,
): Promise<SessionCrmFollowUpSummary | null> {
  const followUps = await db.crmFollowUp.findMany({
    where: { sessionId },
    select: {
      id: true,
      status: true,
      leadStatusSnapshot: true,
      attemptCount: true,
      generatedMessage: true,
      errorReason: true,
      scheduledFor: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  if (!followUps.length) return null;

  const summary = createEmptyCrmFollowUpSummary();

  for (const followUp of followUps) {
    const status = followUp.status as CrmFollowUpStatus;

    summary.total += 1;

    switch (status) {
      case 'PENDING':
        summary.pending += 1;
        summary.active += 1;
        break;
      case 'PROCESSING':
        summary.processing += 1;
        summary.active += 1;
        break;
      case 'SENT':
        summary.sent += 1;
        break;
      case 'FAILED':
        summary.failed += 1;
        break;
      case 'CANCELLED':
        summary.cancelled += 1;
        break;
      case 'SKIPPED':
        summary.skipped += 1;
        break;
    }

    if (!summary.latestStatus) {
      summary.latestStatus = status;
      summary.latestGeneratedMessage = followUp.generatedMessage ?? null;
      summary.latestScheduledFor = followUp.scheduledFor?.toISOString?.() ?? null;
    }

    if (summary.recentItems.length < 5) {
      const item: SessionCrmFollowUpHistoryItem = {
        id: followUp.id,
        status,
        leadStatusSnapshot: followUp.leadStatusSnapshot,
        attemptCount: Math.max(followUp.attemptCount ?? 0, 0),
        message: followUp.generatedMessage ?? null,
        errorReason: followUp.errorReason ?? null,
        scheduledFor: followUp.scheduledFor?.toISOString?.() ?? null,
        createdAt: followUp.createdAt?.toISOString?.() ?? null,
        updatedAt: followUp.updatedAt?.toISOString?.() ?? null,
      };
      summary.recentItems.push(item);
    }
  }

  return summary;
}

export async function getSessionsCountByUserId(userId: string) {
  try {
    const total = await db.session.count({
      where: { userId },
    });

    const activeSession = await db.session.count({
      where: { userId, status: true },
    });

    const inactiveSession = total - activeSession;

    const activeAgent = await db.session.count({
      where: { userId, agentDisabled: false },
    });

    const inactiveAgent = total - activeAgent;

    return {
      success: true,
      data: {
        total,
        activeSession,
        inactiveSession,
        activeAgent,
        inactiveAgent
      }
    };
  } catch (error) {
    console.error('Error al obtener los conteos de sesiones:', error);
    return {
      success: false,
      message: 'Error al obtener los conteos',
    };
  }
}

export async function getSessionsByUserId(
  userId: string,
  skip: number = 0,
  take: number = 20,
  status?: boolean, // true: activos, false: inactivos, undefined: todos
  agentDisabled?: boolean // false: agente activo, true: agente inactivo, undefined: todos
): Promise<SessionsListResponse> {
  try {
    if (!userId) {
      return {
        success: false,
        message: "No existe el userId",
        data: [],
      };
    }

    const sessions = await db.session.findMany({
      where: {
        userId,
        ...(status !== undefined && { status }),
        ...(agentDisabled !== undefined && { agentDisabled }),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        sessionTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    const mapped = sessions.map((s) => ({
      ...s,
      tags: s.sessionTags.map((st) => ({
        id: st.tag.id,
        name: st.tag.name,
        slug: st.tag.slug,
        color: st.tag.color,
        order: (st.tag as any).order ?? 0,
      })),
    }));

    return {
      success: true,
      message: "Sesiones obtenidas correctamente",
      data: mapped,
    };
  } catch (error) {
    console.error("Error al obtener las sesiones:", error);

    let errorMessage = "No se pudieron cargar las sesiones";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
}

export async function getChatContactSessions(
  userId: string,
  chats: ChatContactDescriptor[],
): Promise<SessionResponse<ChatContactSessionMap>> {
  try {
    if (!userId) {
      return {
        success: false,
        message: 'Se requiere el userId.',
      };
    }

    const parsedChats = z
      .array(
        z.object({
          remoteJid: z.string().trim().min(1),
          remoteJidAlt: z.string().trim().nullish(),
          senderPn: z.string().trim().nullish(),
          pushName: z.string().trim().nullish(),
          aliases: z.array(z.string().trim()).optional(),
        }),
      )
      .parse(chats ?? []);

    if (parsedChats.length === 0) {
      return {
        success: true,
        message: 'No hay chats para mapear sesiones.',
        data: {},
      };
    }

    const chatsWithCandidates = parsedChats.map((chat) => {
      const observedAliases = [
        chat.remoteJid,
        chat.remoteJidAlt ?? undefined,
        chat.senderPn ?? undefined,
        ...(chat.aliases ?? []),
      ];

      return {
        chatRemoteJid: chat.remoteJid,
        preferredRemoteJid: resolvePreferredRemoteJid(observedAliases),
        candidates: buildRemoteJidCandidates(chat.remoteJid, observedAliases),
      };
    });

    const allCandidates = Array.from(
      new Set(
        chatsWithCandidates.flatMap((chat) => chat.candidates).filter(Boolean),
      ),
    );

    if (allCandidates.length === 0) {
      return {
        success: true,
        message: 'No se generaron candidatos de JID para buscar sesiones.',
        data: {},
      };
    }

    const sessions = await db.session.findMany({
      where: {
        userId,
        OR: [
          { remoteJid: { in: allCandidates } },
          { remoteJidAlt: { in: allCandidates } },
        ],
      },
      include: {
        sessionTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    const sessionsByCandidate = new Map<string, SessionWithTagsRecord[]>();
    for (const session of sessions) {
      const sessionCandidates = [session.remoteJid, session.remoteJidAlt].filter(Boolean) as string[];

      for (const candidate of sessionCandidates) {
        const existing = sessionsByCandidate.get(candidate) ?? [];
        existing.push(session);
        sessionsByCandidate.set(candidate, existing);
      }
    }

    const data: ChatContactSessionMap = {};

    for (const chat of chatsWithCandidates) {
      const matchedSessions = new Map<number, SessionWithTagsRecord>();

      for (const candidate of chat.candidates) {
        const candidateSessions = sessionsByCandidate.get(candidate) ?? [];
        for (const session of candidateSessions) {
          matchedSessions.set(session.id, session);
        }
      }

      const preferredSession = Array.from(matchedSessions.values())
        .sort((a, b) => {
          const aScore = scoreSessionMatch(
            a,
            chat.chatRemoteJid,
            chat.preferredRemoteJid,
            chat.candidates,
          );
          const bScore = scoreSessionMatch(
            b,
            chat.chatRemoteJid,
            chat.preferredRemoteJid,
            chat.candidates,
          );

          if (aScore !== bScore) return aScore - bScore;
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        })[0];

      if (!preferredSession) continue;

      data[chat.chatRemoteJid] = mapChatContactSessionSummary(preferredSession);
    }

    return {
      success: true,
      message: 'Sesiones de chat obtenidas correctamente.',
      data,
    };
  } catch (error) {
    console.error('Error al obtener sesiones para contactos de chat:', error);

    let errorMessage = 'No se pudieron mapear las sesiones de los chats.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
}

export async function updateSessionStatus(sessionId: number, status: boolean): Promise<SessionsListResponse> {
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session?.userId) {
      return { success: false, message: 'Sesion no encontrada.' };
    }

    await assertUserCanUseApp(session.userId);

    await db.session.update({
      where: { id: sessionId },
      data: { status }
    });

    return {
      success: true,
      message: 'Estado de la sesión actualizado correctamente',
    };

  } catch (error) {
    console.error('Error al actualizar la sesión:', error);

    let errorMessage = 'No se pudo actualizar el estado de la sesión';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: errorMessage
    };
  }
};

export async function deleteSession(
  userId: string,
  sessionId: number,
  remoteJid: string
): Promise<SessionsListResponse> {
  try {
    const candidates = buildRemoteJidCandidates(remoteJid);
    const session = await db.session.findFirst({
      where: {
        AND: [
          { id: sessionId },
          { userId: userId },
          {
            OR: [
              { remoteJid: { in: candidates } },
              { remoteJidAlt: { in: candidates } },
            ],
          },
        ]
      }
    });

    if (!session) {
      return {
        success: false,
        message: 'Sesión no encontrada o no coincide con los criterios.'
      };
    }

    await db.session.delete({
      where: { id: sessionId }
    });

    return {
      success: true,
      message: 'Sesión eliminada correctamente.'
    };
  } catch (error) {
    console.error('Error al eliminar sesión:', error);
    return {
      success: false,
      message: 'Error al eliminar la sesión. Verifica los datos e intenta nuevamente.'
    };
  }
};

/**
 * 🔎 Nueva función para buscar sesiones por nombre o número en toda la base de datos.
 */
export async function searchSessionsByUserId(
  userId: string,
  query: string
): Promise<SessionsListResponse> {
  try {
    if (!userId) {
      return {
        success: false,
        message: "No existe el userId",
        data: [],
      };
    }

    const sessions = await db.session.findMany({
      where: {
        userId,
        OR: [
          { pushName: { contains: query, mode: "insensitive" } },
          { remoteJid: { contains: query, mode: "insensitive" } },
          { remoteJidAlt: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        sessionTags: {
          include: {
            tag: true, // SessionTag.tag
          },
        },
      },
    });

    // 👇 mapeamos los tags a un array plano de { id, name, slug, color }
    const mapped = sessions.map((s) => ({
      ...s,
      tags: s.sessionTags.map((st) => ({
        id: st.tag.id,
        name: st.tag.name,
        slug: st.tag.slug,
        color: st.tag.color,
        order: (st.tag as any).order ?? 0,
      })),
    }));

    return {
      success: true,
      message: "Resultados de búsqueda obtenidos correctamente",
      data: mapped,
    };
  } catch (error) {
    console.error("Error al buscar sesiones:", error);
    return {
      success: false,
      message: "Error al buscar las sesiones",
    };
  }
}

/* General actions */
// 🟢 Activar todos los clientes de un usuario
export async function activateAllSessions(userId: string): Promise<SessionsListResponse> {
  try {
    await db.session.updateMany({
      where: { userId },
      data: { status: true },
    })

    return {
      success: true,
      message: 'Todas las sesiones fueron activadas correctamente.',
    }
  } catch (error) {
    console.error('Error al activar todas las sesiones:', error)
    return {
      success: false,
      message: 'No se pudieron activar todas las sesiones.',
    }
  }
};

// 🔴 Desactivar todos los clientes de un usuario
export async function deactivateAllSessions(userId: string): Promise<SessionsListResponse> {
  try {
    await db.session.updateMany({
      where: { userId },
      data: { status: false },
    })

    return {
      success: true,
      message: 'Todas las sesiones fueron desactivadas correctamente.',
    }
  } catch (error) {
    console.error('Error al desactivar todas las sesiones:', error)
    return {
      success: false,
      message: 'No se pudieron desactivar todas las sesiones.',
    }
  }
};

// 🗑️ Eliminar todos los clientes de un usuario
export async function deleteAllSessions(userId: string): Promise<SessionsListResponse> {
  try {
    await db.session.deleteMany({
      where: { userId },
    })

    return {
      success: true,
      message: 'Todas las sesiones fueron eliminadas correctamente.',
    }
  } catch (error) {
    console.error('Error al eliminar todas las sesiones:', error)
    return {
      success: false,
      message: 'No se pudieron eliminar las sesiones.',
    }
  }
};

export async function registerSession(input: z.infer<typeof registerSessionSchema>): Promise<SessionResponse<PrismaSession>> {
  const validation = registerSessionSchema.safeParse(input);

  if (!validation.success) {
    const issues = validation.error.issues.map(issue => issue.message).join(", ");
    return {
      success: false,
      message: `Datos inválidos: ${issues}`,
    };
  }

  const { userId, remoteJid, remoteJidAlt, senderPn, pushName, instanceId } = validation.data;

  try {
    const trimmedRemoteJid = remoteJid.trim();
    const trimmedInstanceId = instanceId.trim();
    const observedAliases = [
      trimmedRemoteJid,
      remoteJidAlt?.trim(),
      senderPn?.trim(),
    ];
    const candidates = buildRemoteJidCandidates(trimmedRemoteJid, observedAliases);
    const preferredRemoteJid = resolvePreferredRemoteJid(observedAliases);

    const existingSession = await db.session.findFirst({
      where: {
        userId,
        instanceId: trimmedInstanceId,
        OR: [
          { remoteJid: { in: candidates } },
          { remoteJidAlt: { in: candidates } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingSession) {
      const remoteJidAlt = pickObservedAlternateRemoteJid(preferredRemoteJid, [
        ...observedAliases,
        existingSession.remoteJid,
        existingSession.remoteJidAlt,
      ]);

      /* TODO: ACTUALIZACIÓN PUSHNAME SOSPECHOSA */
      const updated = await db.session.update({
        where: { id: existingSession.id },
        data: {
          pushName,
          remoteJid: preferredRemoteJid,
          remoteJidAlt,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        message: "Sesión actualizada correctamente.",
        data: updated,
      };
    }

    const created = await db.session.create({
      data: {
        userId,
        remoteJid: preferredRemoteJid,
        remoteJidAlt: pickObservedAlternateRemoteJid(preferredRemoteJid, observedAliases),
        pushName,
        instanceId: trimmedInstanceId, 
        status: true,
      },
    });

    return {
      success: true,
      message: "Sesión creada correctamente.",
      data: created,
    };
  } catch (error) {
    console.error("[REGISTER_SESSION]", error);
    return {
      success: false,
      message: "Error al registrar la sesión.",
    };
  }
};

/**
* Obtiene una única sesión por su remoteJid asociado a un userId.
*/
export async function getSessionByRemoteJid(
  userId: string,
  remoteJid: string,
  options?: GetSessionByRemoteJidOptions,
): Promise<SingleSessionResponse> {
  try {
    if (!userId || !remoteJid) {
      return {
        success: false,
        message: 'Se requieren userId y remoteJid.',
      };
    }

    const trimmedRemoteJid = remoteJid.trim();
    const observedAliases = [
      trimmedRemoteJid,
      options?.remoteJidAlt?.trim(),
      options?.senderPn?.trim(),
      ...(options?.aliases ?? []),
    ];
    const candidates = buildRemoteJidCandidates(trimmedRemoteJid, observedAliases);
    const preferredRemoteJid = resolvePreferredRemoteJid(observedAliases);
    const trimmedInstanceId = options?.instanceId?.trim();

    const sessions = await db.session.findMany({
      where: {
        userId,
        ...(trimmedInstanceId ? { instanceId: trimmedInstanceId } : {}),
        OR: [
          { remoteJid: { in: candidates } },
          { remoteJidAlt: { in: candidates } },
        ],
      },
      include: {
        sessionTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    const preferredSession = sessions.sort((a, b) => {
      const aScore = scoreSessionMatch(a, trimmedRemoteJid, preferredRemoteJid, candidates);
      const bScore = scoreSessionMatch(b, trimmedRemoteJid, preferredRemoteJid, candidates);

      if (aScore !== bScore) return aScore - bScore;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })[0];

    const resolvedSession = preferredSession;

    if (!resolvedSession) {
      return {
        success: false,
        message: `No se encontró sesión para el JID ${remoteJid} en el usuario ${userId}.`,
      };
    }

    const mappedSession = mapSessionRecord(resolvedSession);
    mappedSession.crmFollowUpSummary = await buildCrmFollowUpSummaryForSession(resolvedSession.id);

    return {
      success: true,
      message: 'Sesión obtenida correctamente.',
      data: mappedSession,
    };

  } catch (error) {
    console.error('Error al obtener la sesión por remoteJid:', error);

    let errorMessage = 'Error interno al buscar la sesión.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: errorMessage
    };
  }
}

// Action: agregar uno o varios tags a una Session (sin borrar los actuales)
export async function addTagsToSessionAction(
  input: z.infer<typeof addTagsToSessionSchema>,
): Promise<ActionResponse<null>> {
  try {
    const { userId, sessionId, tagIds } = addTagsToSessionSchema.parse(input);

    // 1) Validar que la sesión exista y sea del usuario
    const session = await db.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      return {
        success: false,
        message: "Sesión no encontrada o no pertenece a este usuario.",
      };
    }

    // 2) Validar que TODOS los tags existan y pertenezcan al mismo user
    const tags = await db.tag.findMany({
      where: {
        id: { in: tagIds },
      },
    });

    if (tags.length !== tagIds.length) {
      return {
        success: false,
        message: "Uno o más tags no existen.",
      };
    }

    const allBelongToUser = tags.every((t) => t.userId === userId);
    if (!allBelongToUser) {
      return {
        success: false,
        message: "Uno o más tags no pertenecen a este usuario.",
      };
    }

    // 3) Crear relaciones en SessionTag (sin duplicados)
    await db.sessionTag.createMany({
      data: tagIds.map((tagId) => ({
        sessionId,
        tagId,
      })),
      skipDuplicates: true,
    });

    return {
      success: true,
      message: "Tags agregados a la sesión correctamente.",
      data: null,
    };
  } catch (error) {
    console.error("addTagsToSessionAction error:", error);
    return {
      success: false,
      message: "Error agregando tags a la sesión.",
    };
  }
}

export async function getSessionsByUserIdToCRM(
  userId: string,
  skip: number = 0,
  take: number = 20,
  status?: boolean // true: activos, false: inactivos, undefined: todos
): Promise<SessionResponseCrm> {
  try {
    if (!userId) {
      return {
        success: false,
        message: "No existe el userId",
        data: [],
      };
    }

    const sessions = await db.session.findMany({
      where: {
        userId,
        ...(status !== undefined && { status }),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        registros: true,
        sessionTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    const mapped: SessionWithRegistrosAndTags[] = sessions.map((s) => ({
      ...s,
      // reemplazamos SessionTag[] por SimpleTag[]
      tags: s.sessionTags.map((st) => ({
        id: st.tag.id,
        name: st.tag.name,
        slug: st.tag.slug,
        color: st.tag.color,
        order: (st.tag as any).order ?? 0,
      })),
    }));

    return {
      success: true,
      message: "Sesiones obtenidas correctamente",
      data: mapped,
    };
  } catch (error) {
    console.error("Error al obtener las sesiones:", error);

    let errorMessage = "No se pudieron cargar las sesiones";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
}


export async function toggleAgentDisabled(userId: string, sessionId: number, agentDisabled: boolean) {
  try {
    await assertUserCanUseApp(userId);

    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session || session.userId !== userId) {
      return { success: false, message: 'Sesion no encontrada o no autorizada.' };
    }

    await db.session.update({
      where: { id: sessionId },
      data: { agentDisabled },
    });

    return { success: true, message: 'Estado actualizado correctamente' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Error al actualizar' };
  }
}
