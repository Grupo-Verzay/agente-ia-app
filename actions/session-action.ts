'use server'

import { db } from '@/lib/db'
import { obtenerResueltas, obtenerResueltasDeCuentas } from '@/lib/session-resolved'
import { resolvePreferredRemoteJid, scoreSessionMatch } from '@/lib/chat-session-match'
import { registerSessionSchema } from '@/schema/session';
import { AppointmentStatus, Prisma, Session as PrismaSession } from '@prisma/client';
import { z } from 'zod';
import { ActionResponse } from './tag-actions';
import {
  ChatContactSessionSummary,
  CrmFollowUpStatus,
  LeadStatus,
  Session as AppSession,
  SessionCrmFollowUpHistoryItem,
  SessionCrmFollowUpSummary,
  SessionResponse,
  SessionResponseCrm,
  SessionsListResponse,
  SessionWithRegistrosAndTags,
  SingleSessionResponse,
} from '@/types/session';
import { assertUserCanUseApp, assertCanAccessTargetUser } from './billing/helpers/app-access-guard';
import { autoSyncContactIfEnabled } from './google-sheets-actions';
import { currentUser } from '@/lib/auth';
import { recordConfirmedSalesOutcome } from '@/lib/sales-learning';
import { revalidatePath } from 'next/cache';
import {
  buildWhatsAppJidCandidates,
  pickObservedAlternateRemoteJid,
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

// `resolvePreferredRemoteJid` y `scoreSessionMatch` viven en
// lib/chat-session-match: el navegador los necesita para emparejar las
// sesiones con los chats, y aqui se siguen usando para buscar una sesion.

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
      order: item.tag.order ?? 0,
    })),
  };
}

function mapChatContactSessionSummary(
  session: SessionWithTagsRecord,
  pendingSeguimientos?: number,
  seguimientosTipos?: { tipo: string; count: number }[],
  latestAppointmentStatus?: AppointmentStatus | null,
  reminderCount?: number,
  resolvedAt?: number | null,
): ChatContactSessionSummary {
  const mappedSession = mapSessionRecord(session);

  return {
    id: mappedSession.id,
    userId: mappedSession.userId,
    remoteJid: mappedSession.remoteJid,
    remoteJidAlt: mappedSession.remoteJidAlt,
    customName: mappedSession.customName ?? null,
    pushName: mappedSession.pushName,
    tags: mappedSession.tags ?? [],
    leadStatus: mappedSession.leadStatus ?? null,
    serviceType: mappedSession.serviceType ?? null,
    clientStatus: mappedSession.clientStatus ?? null,
    flujos: mappedSession.flujos ?? null,
    pendingSeguimientos: pendingSeguimientos ?? 0,
    seguimientosTipos: seguimientosTipos ?? [],
    latestAppointmentStatus: latestAppointmentStatus ?? null,
    reminderCount: reminderCount ?? 0,
    assignedAdvisorId: session.assignedAdvisorId ?? null,
    status: mappedSession.status,
    agentDisabled: mappedSession.agentDisabled,
    resolvedAt: resolvedAt ?? null,
    // Para emparejar en el navegador: de que linea es y cual es mas reciente.
    instanceId: mappedSession.instanceId ?? null,
    updatedAt: mappedSession.updatedAt ? new Date(mappedSession.updatedAt).getTime() : null,
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
    // Excluir sesiones fantasma por LID (@lid): son IDs de privacidad de WhatsApp,
    // no teléfonos → aparecían como "Você" sin número. No cuentan como leads.
    const baseWhere = { userId, NOT: { remoteJid: { endsWith: "@lid" } } };

    const total = await db.session.count({
      where: baseWhere,
    });

    const activeSession = await db.session.count({
      where: { ...baseWhere, status: true },
    });

    const inactiveSession = total - activeSession;

    const activeAgent = await db.session.count({
      where: { ...baseWhere, agentDisabled: false },
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
        // Ocultar sesiones fantasma por LID (@lid): ID de privacidad de WhatsApp
        // sin teléfono real, se mostraban como "Você" sin número.
        NOT: { remoteJid: { endsWith: "@lid" } },
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

    const remoteJids = sessions.map((s) => s.remoteJid).filter(Boolean) as string[];

    const seguimientosRaw = remoteJids.length
      ? await db.seguimiento.findMany({
          where: { remoteJid: { in: remoteJids }, followUpStatus: 'pending' },
          select: { remoteJid: true, tipo: true },
        })
      : [];

    const seguimientosMap = new Map<string, { count: number; tiposMap: Record<string, number> }>();
    for (const s of seguimientosRaw) {
      if (!s.remoteJid) continue;
      const entry = seguimientosMap.get(s.remoteJid) ?? { count: 0, tiposMap: {} };
      entry.count++;
      const t = s.tipo ?? 'Sin tipo';
      entry.tiposMap[t] = (entry.tiposMap[t] ?? 0) + 1;
      seguimientosMap.set(s.remoteJid, entry);
    }

    const mapped = sessions.map((s) => ({
      ...s,
      tags: s.sessionTags.map((st) => ({
        id: st.tag.id,
        name: st.tag.name,
        slug: st.tag.slug,
        color: st.tag.color,
        order: st.tag.order ?? 0,
      })),
      pendingSeguimientos: seguimientosMap.get(s.remoteJid)?.count ?? 0,
      seguimientosTipos: Object.entries(seguimientosMap.get(s.remoteJid)?.tiposMap ?? {}).map(([tipo, count]) => ({ tipo, count })),
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

/**
 * Las sesiones de la cuenta, con todo lo que la bandeja pinta de cada una.
 *
 * Sustituye a `getChatContactSessions`, que recibia la agenda ENTERA del
 * navegador -un descriptor por chat, 3.900 chats y 500 KB en las cuentas
 * grandes, cada minuto por pestaña-, la validaba fila a fila con Zod, armaba
 * ~10.000 identidades candidatas y las buscaba con `OR` de dos `IN` de 5.000
 * parametros. Medido en produccion: 1,3 s en un buen momento y 11, 13 y 25 s
 * cuando la base estaba ocupada; en esos ratos la consulta de mensajes del
 * chat abierto tambien se pasaba de plazo, porque era la misma cola.
 *
 * Aqui no sube nada: se traen las sesiones por `userId` -que es la primera
 * columna del indice unico (userId, instanceId, remoteJid)- y el navegador las
 * empareja con sus chats (`lib/chat-session-match`). Devuelve un ARRAY, no el
 * mapa por chat: el mapa lo arma quien tiene los chats.
 */
export async function getSesionesDeLaCuenta(
  userId: string | string[],
): Promise<SessionResponse<ChatContactSessionSummary[]> & { tiempos?: Record<string, number> }> {
  const pedidos = Array.isArray(userId) ? userId.filter(Boolean) : [userId].filter(Boolean);
  try {
    if (pedidos.length === 0) {
      return { success: false, message: 'Se requiere el userId.' };
    }

    // Toda accion que recibe un userId comprueba de quien es el dato. Las
    // cuentas que no pasan se dejan fuera con aviso, no tumban la bandeja
    // entera: la pantalla manda la propia, la del dueño y las vinculadas, y
    // una de mas no puede dejar a las demas sin nombres ni etiquetas.
    const arrancoAcceso = Date.now();
    const comprobaciones = await Promise.allSettled(
      pedidos.map((id) => assertCanAccessTargetUser(id)),
    );
    const userIds = pedidos.filter((_, i) => comprobaciones[i].status === 'fulfilled');
    const rechazadas = pedidos.filter((_, i) => comprobaciones[i].status !== 'fulfilled');
    if (rechazadas.length > 0) {
      console.warn('[chats] se ignoran cuentas a las que no se tiene acceso al traer sesiones', {
        rechazadas,
        aceptadas: userIds.length,
      });
    }
    if (userIds.length === 0) {
      return { success: false, message: 'No autorizado.' };
    }

    const arrancoEn = Date.now();
    // Cuanto tarda cada parte, en milisegundos. Viaja en la respuesta para que
    // la consola del navegador diga donde se va el tiempo del servidor: los
    // logs del contenedor no estan a mano cuando alguien manda una captura.
    const tiempos: Record<string, number> = { acceso: arrancoEn - arrancoAcceso };
    const medir = async <T,>(nombre: string, trabajo: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      try {
        return await trabajo();
      } finally {
        tiempos[nombre] = Date.now() - t0;
      }
    };

    const sessions = await medir('sesiones', () =>
      db.session.findMany({
        where: { userId: userIds.length === 1 ? userIds[0] : { in: userIds } },
        include: {
          sessionTags: {
            include: {
              tag: true,
            },
          },
        },
      }),
    );

    const allRemoteJids = Array.from(
      new Set(sessions.map((s) => s.remoteJid).filter(Boolean) as string[]),
    );
    const sessionIds = sessions.map((s) => s.id);

    // Las cuatro consultas de apoyo no dependen entre si: van A LA VEZ. Iban
    // una detras de otra y la vuelta sumaba los cuatro viajes a la base.
    //
    // Recordatorios va en su propio catch: es un contador accesorio, y sin el
    // esta funcion caia entera al catch de abajo y devolvia "sin sesiones" -con
    // lo que la bandeja se quedaba sin NINGUN badge (clasificacion, asesor,
    // seguimientos, citas...), no solo sin el de recordatorios. Las campañas
    // quedan fuera porque su remoteJid es una lista de numeros, no un contacto;
    // se comparan con `not: true` para no perder las filas antiguas con la
    // columna nula.
    //
    // Resueltas va aparte porque la columna no esta en schema.prisma (se crea
    // en caliente), asi que el findMany de arriba no la trae. Por cuenta, no
    // por lista de ids.
    const [seguimientosRaw, resueltasMap, appointmentsRaw, recordatoriosRaw] = await Promise.all([
      medir('seguimientos', () =>
        allRemoteJids.length
          ? db.seguimiento.findMany({
              where: { remoteJid: { in: allRemoteJids }, followUpStatus: 'pending' },
              select: { remoteJid: true, tipo: true },
            })
          : Promise.resolve([]),
      ),
      medir('resueltas', () => obtenerResueltasDeCuentas(userIds)),
      medir('citas', () =>
        sessionIds.length
          ? db.appointment.findMany({
              where: { sessionId: { in: sessionIds } },
              select: { sessionId: true, status: true, startTime: true },
              orderBy: { startTime: 'desc' },
            })
          : Promise.resolve([]),
      ),
      medir('recordatorios', async () => {
        try {
          if (!allRemoteJids.length) return [];
          return await db.reminders.groupBy({
            by: ['remoteJid'],
            where: { remoteJid: { in: allRemoteJids }, isCampaign: { not: true } },
            _count: { _all: true },
          });
        } catch (error) {
          console.error('No se pudieron contar los recordatorios de la bandeja:', error);
          return [];
        }
      }),
    ]);

    const seguimientosMap = new Map<string, { count: number; tiposMap: Record<string, number> }>();
    for (const s of seguimientosRaw) {
      if (!s.remoteJid) continue;
      const entry = seguimientosMap.get(s.remoteJid) ?? { count: 0, tiposMap: {} };
      entry.count++;
      const t = s.tipo ?? 'Sin tipo';
      entry.tiposMap[t] = (entry.tiposMap[t] ?? 0) + 1;
      seguimientosMap.set(s.remoteJid, entry);
    }

    const appointmentStatusMap = new Map<number, AppointmentStatus>();
    for (const appt of appointmentsRaw) {
      if (appt.sessionId !== null && !appointmentStatusMap.has(appt.sessionId)) {
        appointmentStatusMap.set(appt.sessionId, appt.status);
      }
    }

    const recordatoriosMap = new Map<string, number>();
    for (const fila of recordatoriosRaw) {
      if (fila.remoteJid) recordatoriosMap.set(fila.remoteJid, fila._count._all);
    }

    const data = sessions.map((sesion) => {
      const seg = seguimientosMap.get(sesion.remoteJid);
      return mapChatContactSessionSummary(
        sesion,
        seg?.count ?? 0,
        Object.entries(seg?.tiposMap ?? {}).map(([tipo, count]) => ({ tipo, count })),
        appointmentStatusMap.get(sesion.id) ?? null,
        recordatoriosMap.get(sesion.remoteJid) ?? 0,
        resueltasMap.get(sesion.id) ?? null,
      );
    });

    tiempos.total = Date.now() - arrancoAcceso;
    if (tiempos.total > 1500 || sessions.length > 3000) {
      console.warn('[chats] getSesionesDeLaCuenta va caro', {
        cuentas: userIds.length,
        sesiones: sessions.length,
        tiempos,
      });
    }

    return {
      success: true,
      message: 'Sesiones de la cuenta obtenidas correctamente.',
      data,
      tiempos,
    };
  } catch (error) {
    console.error('Error al obtener las sesiones de la cuenta:', error);

    let errorMessage = 'No se pudieron cargar las sesiones de la cuenta.';
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
        // No mostrar sesiones fantasma por LID (@lid) tampoco en la búsqueda.
        NOT: { remoteJid: { endsWith: "@lid" } },
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
        order: st.tag.order ?? 0,
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
    // Verifica que el usuario de la sesión tenga permiso sobre este userId
    // (evita que un tenant modifique las sesiones de otro — IDOR).
    await assertCanAccessTargetUser(userId);
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
    // Verifica que el usuario de la sesión tenga permiso sobre este userId
    // (evita que un tenant modifique las sesiones de otro — IDOR).
    await assertCanAccessTargetUser(userId);
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
    // Verifica que el usuario de la sesión tenga permiso sobre este userId
    // (evita que un tenant borre las sesiones de otro — IDOR).
    await assertCanAccessTargetUser(userId);
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

/**
 * Limpia "leads basura" de la cuenta indicada: sesiones que no son un contacto
 * 1:1 real (grupos @g.us, difusiones/estados, newsletters, JIDs @lid —IDs de
 * privacidad de WhatsApp sin teléfono— o JIDs sin número válido, que se mostraban
 * como "+0" o "Você"). Acotado a la cuenta activa del usuario. Las filas hijas se
 * borran en cascada (FK onDelete: Cascade).
 */
export async function cleanupJunkSessions(
  userId: string,
): Promise<ActionResponse<{ deleted: number }>> {
  try {
    if (!userId) {
      return { success: false, message: 'No existe el userId.' };
    }

    const me = await currentUser();
    if (!me || me.effectiveId !== userId) {
      return { success: false, message: 'No autorizado.' };
    }

    const deleted = await db.$executeRaw`
      DELETE FROM "Session"
      WHERE "userId" = ${userId}
        AND (
          btrim("remoteJid") = ''
          OR lower("remoteJid") LIKE '%@g.us'
          OR lower("remoteJid") LIKE '%broadcast%'
          OR lower("remoteJid") LIKE '%@newsletter'
          OR lower("remoteJid") LIKE '%@lid'
          OR length(regexp_replace("remoteJid", '[^0-9]', '', 'g')) < 6
        )
    `;

    revalidatePath('/sessions');
    revalidatePath('/crm');

    return {
      success: true,
      message:
        deleted > 0
          ? `Se eliminaron ${deleted} leads vacíos o inválidos.`
          : 'No había leads vacíos para limpiar.',
      data: { deleted },
    };
  } catch (error) {
    console.error('[cleanupJunkSessions]', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo limpiar.',
    };
  }
}

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

      // Solo actualizar pushName desde WhatsApp si la sesión aún no tiene nombre guardado.
      // Si el usuario editó el nombre manualmente, no sobreescribir.
      const resolvedPushName = existingSession.pushName?.trim()
        ? existingSession.pushName
        : (pushName ?? null);

      const updated = await db.session.update({
        where: { id: existingSession.id },
        data: {
          pushName: resolvedPushName,
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

    // Auto-sync a Google Sheets (opt-in): contacto nuevo.
    await autoSyncContactIfEnabled(created.userId, created.remoteJid);

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
  userId: string | string[],
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
    const userIds = Array.isArray(userId) ? userId : [userId];

    const sessions = await db.session.findMany({
      where: {
        userId: userIds.length === 1 ? userIds[0] : { in: userIds },
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
      take: 100,
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

    // Tags previos (para disparar automatizaciones solo de los nuevos)
    const prevTags = await db.sessionTag.findMany({
      where: { sessionId },
      select: { tagId: true },
    });
    const prevTagSet = new Set(prevTags.map((p: { tagId: number }) => p.tagId));

    // 3) Crear relaciones en SessionTag (sin duplicados)
    await db.sessionTag.createMany({
      data: tagIds.map((tagId) => ({
        sessionId,
        tagId,
      })),
      skipDuplicates: true,
    });

    // Disparar automatizaciones de cada tag recién agregado
    for (const tagId of tagIds) {
      if (!prevTagSet.has(tagId)) void triggerTagAutomations(sessionId, tagId);
    }

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

    // Se comprueba que quien pregunta manda sobre esa cuenta. Esta accion se
    // llama desde el navegador con el `userId` que le manden, y devolvia el
    // CRM entero de CUALQUIER cuenta a cualquier usuario con sesion (H02 de la
    // auditoria del 2026-09-06). La regla es la de siempre: uno mismo, el
    // dueno de un asesor, cuentas vinculadas, admin, y el reseller sobre sus
    // clientes.
    await assertCanAccessTargetUser(userId);

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
        order: st.tag.order ?? 0,
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
      select: { userId: true, leadStatus: true },
    });
    if (!session || session.userId !== userId) {
      return { success: false, message: 'Sesion no encontrada o no autorizada.' };
    }

    // Si se reactiva el agente y el contacto estaba DESCARTADO, sacarlo de la lista negra
    const wasDescartado = session.leadStatus === 'DESCARTADO';
    await db.session.update({
      where: { id: sessionId },
      data: {
        agentDisabled,
        // Opt-in de IA por contacto: prender el agente aquí habilita la IA para
        // ESTE contacto aunque el "Estado del agente" global esté apagado;
        // apagarlo retira el opt-in. Espeja el nodo "Activar IA" de los flujos.
        aiOptIn: !agentDisabled,
        ...(!agentDisabled && wasDescartado && {
          leadStatus: null,
          leadStatusSourceHash: null,
          leadStatusUpdatedAt: new Date(),
        }),
      },
    });

    return { success: true, message: 'Estado actualizado correctamente' };
  } catch (error) {
    console.error("[toggleAgentDisabled]", error);
    return { success: false, message: (error instanceof Error ? error.message : null) || 'Error al actualizar' };
  }
}

// Aquí vivían los mensajes automáticos que se enviaban al cliente en cada
// cambio de estado del lead. Se eliminaron: el estado es una clasificación
// interna del asesor y el contacto no debe recibir nada al moverla.

export async function updateSessionLeadStatus(
  sessionId: number,
  leadStatus: LeadStatus | null
): Promise<SessionsListResponse> {
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        remoteJid: true,
        pushName: true,
        customName: true,
        instanceId: true,
        agentDisabled: true,
        leadStatus: true,
        user: {
          select: {
            apiKey: { select: { url: true, key: true } },
            instancias: { select: { instanceName: true, instanceId: true } },
          },
        },
      },
    });
    if (!session?.userId) {
      return { success: false, message: 'Sesion no encontrada.' };
    }

    await assertUserCanUseApp(session.userId);

    const isDescartado = leadStatus === 'DESCARTADO';
    const wasDescartado = session.leadStatus === 'DESCARTADO';

    // Actualizar sesión: si pasa a DESCARTADO → deshabilitar agente; si sale de DESCARTADO → reactivar agente
    await db.session.update({
      where: { id: sessionId },
      data: {
        leadStatus: leadStatus ?? null,
        leadStatusSourceHash: null,
        leadStatusUpdatedAt: new Date(),
        // DESCARTADO → apaga el agente y retira el opt-in de IA del contacto.
        // Salir de DESCARTADO solo quita el bloqueo (no fuerza IA: eso es opt-in
        // explícito vía toggle "Agente" o nodo "Activar IA").
        ...(isDescartado && { agentDisabled: true, aiOptIn: false }),
        ...(wasDescartado && !isDescartado && { agentDisabled: false }),
      },
    });

    // Si se marca como DESCARTADO → eliminar todos los seguimientos, recordatorios y follow-ups
    if (isDescartado) {
      // Eliminar CRM follow-ups
      await db.crmFollowUp.deleteMany({ where: { sessionId } });

      // Eliminar todos los seguimientos (mensajes programados) del contacto
      if (session.remoteJid) {
        await db.seguimiento.deleteMany({ where: { remoteJid: session.remoteJid } });

        // Limpiar referencias de seguimientos en la sesión
        await db.session.update({
          where: { id: sessionId },
          data: { seguimientos: null, inactividad: null },
        });
      }

      await db.sessionWorkflowState.updateMany({
        where: { sessionId, intentionStatus: 'waiting' },
        data: { intentionStatus: 'cancelled', currentNodeId: null },
      });
    }

    // El cambio de estado es una clasificación INTERNA del asesor: mover una
    // ficha a FRIO/TIBIO/CALIENTE/FINALIZADO no debe escribirle al cliente.
    // Antes se le enviaba un mensaje automático por cada cambio ("tu solicitud
    // ha captado nuestra atención", "ha sido un placer atenderte"...), lo que
    // sorprendía al contacto y se sumaba a lo que el asesor ya estaba
    // escribiendo. Si se quiere avisar al cliente, se hace con un flujo
    // configurado a propósito (Ajustes → flujo por estado), no de forma
    // implícita al arrastrar la tarjeta.

    // Ejecutar automaciones de etapa (fire-and-forget)
    if (leadStatus) {
      void triggerStageAutomations(sessionId, leadStatus).catch(() => undefined);
    }

    // Solo aprende de resultados confirmados explícitamente por el asesor.
    if (leadStatus === 'FINALIZADO' || leadStatus === 'DESCARTADO') {
      await recordConfirmedSalesOutcome(
        sessionId,
        leadStatus === 'FINALIZADO' ? 'WON' : 'LOST',
      ).catch((error) => console.error('[sales-learning:record]', error));
    }

    return { success: true, message: 'Estado del lead actualizado correctamente' };
  } catch (error) {
    console.error("[updateSessionLeadStatus]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo actualizar el estado del lead',
    };
  }
}

export async function updateSessionServiceType(
  sessionId: number,
  serviceType: 'IA' | 'HUMANO' | null,
): Promise<SessionsListResponse> {
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session?.userId) return { success: false, message: 'Sesión no encontrada.' };

    await assertUserCanUseApp(session.userId);

    await db.session.update({
      where: { id: sessionId },
      data: {
        serviceType: serviceType ?? null,
      },
    });

    return { success: true, message: 'Tipo de servicio actualizado correctamente' };
  } catch (error) {
    console.error('[updateSessionServiceType]', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo actualizar el tipo de servicio',
    };
  }
}

export async function updateSessionClientStatus(
  sessionId: number,
  clientStatus: 'ACTIVO' | 'INACTIVO' | null,
): Promise<SessionsListResponse> {
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session?.userId) return { success: false, message: 'Sesión no encontrada.' };

    await assertUserCanUseApp(session.userId);

    await db.session.update({
      where: { id: sessionId },
      data: {
        clientStatus: clientStatus ?? null,
      },
    });

    return { success: true, message: 'Estado del cliente actualizado correctamente' };
  } catch (error) {
    console.error('[updateSessionClientStatus]', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo actualizar el estado del cliente',
    };
  }
}

async function triggerStageAutomations(sessionId: number, newStage: string): Promise<void> {
  const backendUrl = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
  if (!backendUrl) return;
  const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '';
  await fetch(`${backendUrl}/stage-automations/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': key },
    body: JSON.stringify({ sessionId, newStage }),
  });
}

async function triggerTagAutomations(sessionId: number, tagId: number): Promise<void> {
  const backendUrl = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
  if (!backendUrl) return;
  const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '';
  try {
    await fetch(`${backendUrl}/tag-automations/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': key },
      body: JSON.stringify({ sessionId, tagId }),
    });
  } catch (error) {
    console.error('[triggerTagAutomations]', error);
  }
}

