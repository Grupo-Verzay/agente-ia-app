"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { normalizeQuickReplyCategory } from "@/lib/quick-reply-categories";
import { getChatConversationPreferencesForAssociatedAccounts } from "@/actions/chat-conversation-actions";
import { getSesionesDeLaCuenta } from "@/actions/session-action";
import { listTagsAction } from "@/actions/tag-actions";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { getWorkFlowByUserIds } from "@/actions/workflow-actions";
import { getAllRRsByUserIds } from "@/actions/rr-actions";
import type { AdvisorInfo } from "@/actions/team-actions";
import type {
  ChatConversationPreferenceMap,
  ChatQuickReplyOption,
  ChatWorkflowOption,
} from "@/types/chat";
import type {
  ChatContactSessionSummary,
  SimpleTag,
} from "@/types/session";

type ChatBootstrapInput = {
  sessionUserIds?: string[];
};

type ChatBootstrapData = {
  allTags: SimpleTag[];
  chatPreferences: ChatConversationPreferenceMap;
  /**
   * Las sesiones NO viajan aqui, y es a proposito.
   *
   * Se piden igual mas abajo —hacen falta para completar la lista de asesores
   * con los que tienen chats asignados y no salen en el equipo— pero se quedan
   * en el servidor. El navegador las recibe por su propia consulta, que sale al
   * montar la pantalla y va por indice.
   *
   * Viajaban por los DOS caminos desde el #656, que fue cuando se les dio
   * consulta propia y se olvido quitarlas de aqui: 573 KB de los 1.540 que pesa
   * esta respuesta, bajados dos veces en cada carga de Chats para pintar lo
   * mismo. Y el coste de esta respuesta no es esperar en cola —se midio con
   * dos replicas y no se movio ni un segundo—: es serializarla y comprimirla,
   * que es trabajo por peticion. Lo unico que lo baja es que pese menos.
   */
  workflows: ChatWorkflowOption[];
  quickReplies: ChatQuickReplyOption[];
  advisors: AdvisorInfo[];
  clientValidationEnabled: boolean;
};

type ChatBootstrapResponse = {
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

function withCurrentUserAdvisor(
  advisors: AdvisorInfo[],
  user: { id?: string | null; name?: string | null; email?: string | null; company?: string | null; advisorRole?: string | null },
) {
  if (!user.id) return advisors;

  const currentAdvisor: AdvisorInfo = {
    // La cuenta propia sale en la lista para poder asignarse chats, pero no es
    // un asesor dado de alta en Equipo: no cuenta en la insignia.
    esDelEquipo: false,
    id: user.id,
    name: user.company || user.name || user.email || "Yo",
    email: user.email || "",
    advisorRole: user.advisorRole ?? null,
  };

  const map = new Map<string, AdvisorInfo>();
  map.set(currentAdvisor.id, currentAdvisor);
  for (const advisor of advisors) map.set(advisor.id, advisor);
  return Array.from(map.values());
}

async function getMissingAssignedAdvisors(
  sesiones: ChatContactSessionSummary[],
  knownAdvisors: AdvisorInfo[],
) {
  const knownIds = new Set(knownAdvisors.map((advisor) => advisor.id));
  const missingIds = Array.from(
    new Set(
      sesiones
        .map((session) => session.assignedAdvisorId)
        .filter((id): id is string => {
          if (!id) return false;
          return !knownIds.has(id);
        }),
    ),
  );

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
    sessionsRes,
    preferencesRes,
    workflowsRes,
    quickRepliesRes,
    advisorsRes,
    clientValidationConfig,
  ] = await Promise.all([
    medir("etiquetas", () => settle(listTagsAction(effectiveOwnerId))),
    medir("sesiones", () => settle(getSesionesDeLaCuenta(sessionUserIds))),
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

  // Se usan aqui y se quedan aqui: solo hacen falta para saber que asesores
  // tienen chats asignados y no salen en el equipo. No van en la respuesta.
  const sesionesDeLaCuenta = sessionsRes?.success ? sessionsRes.data ?? [] : [];
  if (sessionsRes && !sessionsRes.success) {
    console.warn("[chats] la carga inicial no trajo sesiones:", sessionsRes.message);
  }
  const advisorsFromTeam = advisorsRes?.success ? advisorsRes.data ?? [] : [];
  const baseAdvisors = withCurrentUserAdvisor(advisorsFromTeam, user);
  const arrancoAsesoresQueFaltan = Date.now();
  const missingAssignedAdvisors = await getMissingAssignedAdvisors(sesionesDeLaCuenta, baseAdvisors);
  // Este va DESPUES del Promise.all, asi que se suma al total. Si pesa, se ve.
  tiempos.asesoresQueFaltan = Date.now() - arrancoAsesoresQueFaltan;
  const advisors = withCurrentUserAdvisor([...baseAdvisors, ...missingAssignedAdvisors], user);
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
