import "server-only";

import { db } from "@/lib/db";
import { leerLaBandejaEntera } from "@/lib/chat-persistence";
import { obtenerResueltasDeCuentas } from "@/lib/session-resolved";
import {
  contarLaLista,
  dedupeAndSortChats,
  laSesionDelChat,
  lasFilasDeLaLista,
  type ConteoDeLaLista,
} from "@/app/(root)/chats/_components/lo-que-ve-todos";
import {
  emparejarSesiones,
  identidadesEnVariasLineas,
} from "@/app/(root)/chats/_components/chat-sidebar.utils";
import type { LidPhoneMap } from "@/app/(root)/chats/_components/lid-mapping";
import type { ChatConversationPreferenceMap } from "@/types/chat";
import type { ChatContactSessionSummary } from "@/types/session";
import type { ChatData } from "@/actions/chat-actions";

/**
 * El numero de «Todos» de cada linea, contado sobre la bandeja ENTERA.
 *
 * Es el mismo recorrido que hace la lista en el navegador, sin el tope de la
 * pagina: la misma consulta (`leerLaBandejaEntera`), los mismos repetidos
 * (`dedupeAndSortChats`, con el puente `@lid`), las mismas sesiones
 * (`emparejarSesiones`) y la misma regla de que sale bajo «Todos»
 * (`lasFilasDeLaLista`). Asi el numero dice lo que la lista enseñaria bajando
 * hasta el final, ni una mas.
 *
 * Sustituye a `contarChatsPorLinea`, que contaba LEADS (`Session`) y por eso no
 * cuadraba con la lista: un lead sin conversacion, una conversacion importada
 * sin ficha, el mismo contacto con dos formas del numero, la marca de borrado
 * guardada bajo otra de sus identidades, lo que un agente no ve…
 *
 * Nunca tumba la pantalla: si falla, devuelve `null` y el navegador cuenta lo
 * que tiene cargado. Y lo dice.
 */
export type LoLeidoParaElConteo = {
  crudas: ChatData[];
  sesiones: ChatContactSessionSummary[];
  ms: number;
};

/**
 * La parte que va a la base: la bandeja entera y las sesiones. Va aparte de la
 * cuenta para poder lanzarla en paralelo con el resto de la carga de Chats
 * (el `Promise.all` de la pagina); la cuenta necesita las preferencias y el
 * puente `@lid`, que llegan en ese mismo `Promise.all`.
 *
 * Nunca lanza: `null` es «no se pudo», y entonces el navegador cuenta lo que
 * tiene cargado.
 */
export async function leerParaElConteo(params: {
  userIds: string[];
  instanceNames: string[];
}): Promise<LoLeidoParaElConteo | null> {
  const userIds = params.userIds.filter(Boolean);
  const instanceNames = params.instanceNames.filter(Boolean);
  if (!userIds.length || !instanceNames.length) return { crudas: [], sesiones: [], ms: 0 };
  const t0 = performance.now();
  try {
    const [crudas, sesiones] = await Promise.all([
      leerLaBandejaEntera({ userIds, instanceNames }),
      sesionesParaElConteo(userIds),
    ]);
    return { crudas, sesiones, ms: performance.now() - t0 };
  } catch (error) {
    console.error("[chats] no se pudo leer la bandeja entera para «Todos»; se cuenta lo cargado", error);
    return null;
  }
}

export function contarTodosDeLaBandeja(
  leido: LoLeidoParaElConteo | null,
  ctx: {
    preferencias: ChatConversationPreferenceMap;
    /** Cuenta dueña de cada linea; lo que no este, es de `cuentaPorDefecto`. */
    duenoDeLaLinea: Record<string, string>;
    cuentaPorDefecto: string;
    lidMap?: LidPhoneMap;
    agente?: { advisorId: string; puedeTomarSinAsignar: boolean } | null;
  },
): ConteoDeLaLista | null {
  if (!leido) return null;
  const t0 = performance.now();
  try {
    const chats = dedupeAndSortChats(leido.crudas, ctx.lidMap);
    const mapa = emparejarSesiones(chats, leido.sesiones);
    const filas = lasFilasDeLaLista(chats, {
      preferencias: ctx.preferencias,
      duenoDelChat: (chat) =>
        (chat.instanceName ? ctx.duenoDeLaLinea[chat.instanceName] : undefined) ??
        ctx.cuentaPorDefecto,
      sesionDelChat: (chat) => laSesionDelChat(chat, mapa),
      repartidasEntreLineas: identidadesEnVariasLineas(chats),
      agente: ctx.agente,
    });
    const conteo = contarLaLista(filas);
    const ms = leido.ms + (performance.now() - t0);
    // Un contador no deberia costar; si algun dia cuesta, que se vea.
    if (ms > 800) {
      console.warn(`[PERF] contarTodosDeLaBandeja ${Math.round(ms)}ms`, {
        filas: leido.crudas.length,
        sesiones: leido.sesiones.length,
      });
    }
    return conteo;
  } catch (error) {
    console.error("[chats] no se pudo contar la bandeja entera; se cuenta lo cargado", error);
    return null;
  }
}

/**
 * Las sesiones de la cuenta con lo que el conteo mira y nada mas: a quien estan
 * asignadas (un agente solo ve lo suyo) y si estan resueltas. La bandeja pide
 * las completas —etiquetas, seguimientos, citas— desde el navegador; aqui
 * sobra todo eso.
 */
async function sesionesParaElConteo(userIds: string[]): Promise<ChatContactSessionSummary[]> {
  const [filas, resueltas] = await Promise.all([
    db.session.findMany({
      where: { userId: userIds.length === 1 ? userIds[0] : { in: userIds } },
      select: {
        id: true,
        userId: true,
        remoteJid: true,
        remoteJidAlt: true,
        customName: true,
        pushName: true,
        assignedAdvisorId: true,
        instanceId: true,
        updatedAt: true,
      },
    }),
    obtenerResueltasDeCuentas(userIds),
  ]);
  return filas.map((s) => ({
    id: s.id,
    userId: s.userId,
    remoteJid: s.remoteJid,
    remoteJidAlt: s.remoteJidAlt,
    customName: s.customName ?? null,
    pushName: s.pushName,
    tags: [],
    assignedAdvisorId: s.assignedAdvisorId ?? null,
    resolvedAt: resueltas.get(s.id) ?? null,
    instanceId: s.instanceId ?? null,
    updatedAt: s.updatedAt ? s.updatedAt.getTime() : null,
  }));
}
