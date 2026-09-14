"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { normalizeQuickReplyCategory } from "@/lib/quick-reply-categories";
import { getChatConversationPreferencesForAssociatedAccounts } from "@/actions/chat-conversation-actions";
import { listTagsAction } from "@/actions/tag-actions";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { getWorkFlowByUserIds } from "@/actions/workflow-actions";
import { getAllRRsByUserIds } from "@/actions/rr-actions";
import type { AdvisorInfo } from "@/actions/team-actions";
import { conLaCuentaPropia } from "@/lib/asesores";
import type {
  ChatConversationPreferenceMap,
  ChatQuickReplyOption,
  ChatWorkflowOption,
} from "@/types/chat";
import type { SimpleTag } from "@/types/session";

type ChatBootstrapInput = {
  sessionUserIds?: string[];
};

type ChatBootstrapData = {
  allTags: SimpleTag[];
  chatPreferences: ChatConversationPreferenceMap;
  /**
   * Las sesiones NO viajan aqui, y ya ni siquiera se piden.
   *
   * Dos pasos, de dos fallos distintos:
   *
   * 1. Viajaban por los DOS caminos desde el #656 —573 KB de los 1.540 que
   *    pesaba esta respuesta, bajados dos veces en cada carga de Chats para
   *    pintar lo mismo—. Se quitaron de la respuesta, pero la consulta se quedo
   *    porque hacia falta para completar la lista de asesores.
   * 2. Y entonces la MISMA consulta corria dos veces por carga: aqui (1.035 ms)
   *    y en el navegador (2.900 ms). Ahora aqui no se piden las sesiones: se
   *    piden los ids distintos de asesor asignado, que es lo unico que se
   *    necesitaba (ver `idsDeAsesoresConChatsAsignados`).
   *
   * El navegador las sigue recibiendo por su propia consulta, que sale al
   * montar la pantalla y va por indice. **No devolverlas por aqui**: llegarian
   * al ritmo de la MAS LENTA de las siete de abajo, y no al suyo.
   */
  workflows: ChatWorkflowOption[];
  quickReplies: ChatQuickReplyOption[];
  advisors: AdvisorInfo[];
  clientValidationEnabled: boolean;
};

// `export type` y no una constante: en un fichero `'use server'` todo lo que no
// sea una funcion async tiene que irse a otro sitio, pero un tipo se borra al
// compilar y no llega a existir. Lo necesita `/api/chats/bootstrap` y el
// navegador, que ya no llama a esta funcion directamente.
export type ChatBootstrapResponse = {
  success: boolean;
  message: string;
  data?: ChatBootstrapData;
  /**
   * Cuanto tardo cada una de las consultas, en milisegundos.
   *
   * Esto es un `Promise.all` de siete: devuelve cuando acaba la ULTIMA, asi que
   * saber el total no dice nada —lo unico que importa es cual es la lenta—. Y
   * los registros del contenedor no estan a mano cuando alguien manda una
   * captura, asi que el desglose viaja en la respuesta y sale por la consola
   * del navegador.
   */
  tiempos?: Record<string, number>;
};

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error("[loadChatBootstrapData]", error);
    return null;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string =>
    Boolean(value) && array.indexOf(value) === index,
  );
}

/**
 * Los asesores que TIENEN chats asignados y no salen en el equipo.
 *
 * Esto recibia la lista ENTERA de sesiones de la cuenta y le sacaba los
 * `assignedAdvisorId`. O sea que el bootstrap ejecutaba `getSesionesDeLaCuenta`
 * —731 filas, 444 KB, 1.035 ms medidos— para acabar quedandose con un puñado
 * de ids. Y desde el #662 ni siquiera las manda: el navegador las pide por su
 * cuenta, asi que esa misma consulta corria DOS VECES en cada carga de Chats.
 *
 * Lo que hace falta es la lista de ids distintos, y eso es un `DISTINCT` sobre
 * la primera columna del indice unico `(userId, instanceId, remoteJid)`. No lee
 * ni un `lastMessageRaw`.
 *
 * No se devuelven las sesiones por aqui a proposito: que viajen con el
 * bootstrap es justo lo que se quito en el #662 —las insignias de cada fila
 * llegaban al ritmo de la MAS LENTA de las siete consultas, no al suyo—.
 */
async function idsDeAsesoresConChatsAsignados(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  try {
    const filas = await db.session.findMany({
      where: { userId: { in: userIds }, assignedAdvisorId: { not: null } },
      select: { assignedAdvisorId: true },
      distinct: ["assignedAdvisorId"],
    });
    return filas
      .map((fila) => fila.assignedAdvisorId)
      .filter((id): id is string => Boolean(id));
  } catch (error) {
    // Nunca rompe la carga: sin esto solo faltan del desplegable los asesores
    // que ya no estan en el equipo, no la pantalla.
    console.warn("[chats] no se pudieron leer los asesores con chats asignados", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function getMissingAssignedAdvisors(
  idsAsignados: string[],
  knownAdvisors: AdvisorInfo[],
) {
  const knownIds = new Set(knownAdvisors.map((advisor) => advisor.id));
  const missingIds = Array.from(new Set(idsAsignados.filter((id) => !knownIds.has(id))));

  if (missingIds.length === 0) return [];

  return db.user.findMany({
    where: { id: { in: missingIds } },
    select: {
      id: true,
      name: true,
      email: true,
      advisorRole: true,
    },
  });
}

export async function loadChatBootstrapData(
  input: ChatBootstrapInput = {},
): Promise<ChatBootstrapResponse> {
  const arrancoAcceso = Date.now();
  const user = await currentUser();
  const acaboElAcceso = Date.now();
  if (!user?.id) {
    return { success: false, message: "No autorizado." };
  }

  const effectiveOwnerId = user.ownerId ?? user.id;
  const sessionUserIds = uniqueStrings([
    effectiveOwnerId,
    user.id,
    ...(input.sessionUserIds ?? []),
  ]);

  // `acceso` y `total` se miden como en `getSesionesDeLaCuenta`, y por el mismo
  // motivo: si el navegador ve una ida y vuelta MUCHO mayor que `total`, el
  // tiempo no esta en la base ni en estas consultas, sino en serializar la
  // respuesta y bajarla. Sin `total` no hay forma de separar las dos cosas.
  const tiempos: Record<string, number> = { acceso: acaboElAcceso - arrancoAcceso };
  const medir = async <T,>(nombre: string, trabajo: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await trabajo();
    } finally {
      tiempos[nombre] = Date.now() - t0;
    }
  };

  const arrancoTodo = Date.now();
  const [
    tagsRes,
    idsAsignados,
    preferencesRes,
    workflowsRes,
    quickRepliesRes,
    advisorsRes,
    clientValidationConfig,
  ] = await Promise.all([
    medir("etiquetas", () => settle(listTagsAction(effectiveOwnerId))),
    medir("asesoresAsignados", () => idsDeAsesoresConChatsAsignados(sessionUserIds)),
    medir("marcasDeBorrado", () => settle(getChatConversationPreferencesForAssociatedAccounts())),
    medir("flujos", () => settle(getWorkFlowByUserIds(sessionUserIds))),
    medir("respuestasRapidas", () => settle(getAllRRsByUserIds(sessionUserIds))),
    medir("asesores", () => settle(getTeamAdvisorInfos())),
    medir("configValidacion", () =>
      db.externalDataToolConfig
        .findFirst({
          where: {
            userId: effectiveOwnerId,
            toolType: "client_validation",
            isEnabled: true,
          },
          select: { id: true },
        })
        .catch(() => null),
    ),
  ]);
  tiempos.lasSieteALaVez = Date.now() - arrancoTodo;

  const allTags =
    tagsRes?.data?.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color,
      order: tag.order ?? 0,
      sessionCount: tag._count?.sessionTags ?? 0,
    })) ?? [];

  const workflows = workflowsRes?.success && Array.isArray(workflowsRes.data)
    ? workflowsRes.data
    : [];

  const workflowOptions: ChatWorkflowOption[] = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    isPro: workflow.isPro,
  }));

  const quickReplies = quickRepliesRes?.success && Array.isArray(quickRepliesRes.data)
    ? quickRepliesRes.data
    : [];

  const quickReplyOptions = quickReplies.reduce<ChatQuickReplyOption[]>((items, quickReply) => {
    const workflow = workflows.find((item) => item.id === quickReply.workflowId);
    const message = quickReply.mensaje?.trim() ?? "";
    if (!message) return items;

    items.push({
      id: quickReply.id,
      name: quickReply.name ?? null,
      message,
      category: normalizeQuickReplyCategory(quickReply.category),
      workflowId: quickReply.workflowId ?? null,
      workflowName: workflow?.name ?? null,
    });
    return items;
  }, []);

  const advisorsFromTeam = advisorsRes?.success ? advisorsRes.data ?? [] : [];
  const baseAdvisors = conLaCuentaPropia(advisorsFromTeam, user);
  const arrancoAsesoresQueFaltan = Date.now();
  const missingAssignedAdvisors = await getMissingAssignedAdvisors(idsAsignados ?? [], baseAdvisors);
  // Este va DESPUES del Promise.all, asi que se suma al total. Si pesa, se ve.
  tiempos.asesoresQueFaltan = Date.now() - arrancoAsesoresQueFaltan;
  const advisors = conLaCuentaPropia([...baseAdvisors, ...missingAssignedAdvisors], user);
  tiempos.total = Date.now() - arrancoAcceso;

  return {
    success: true,
    message: "Datos de chats cargados correctamente.",
    data: {
      allTags,
      chatPreferences: preferencesRes?.success ? preferencesRes.data ?? {} : {},
      workflows: workflowOptions,
      quickReplies: quickReplyOptions,
      advisors,
      clientValidationEnabled: Boolean(clientValidationConfig),
    },
    tiempos,
  };
}
