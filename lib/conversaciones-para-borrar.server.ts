import "server-only";

import { db } from "@/lib/db";
import { leerLaBandejaEntera, resolveInstanceOwner } from "@/lib/chat-persistence";
import {
  dedupeAndSortChats,
  getChatSortTimestamp,
} from "@/app/(root)/chats/_components/lo-que-ve-todos";
import { chatPreferenceKey, elegirPreferenciaDelChat } from "@/lib/chat-preference-key";
import { getChatIdentityCandidates } from "@/app/(root)/chats/_components/chat-sidebar.utils";
import { entraEnElBorrado, limitesDelBorrado, TOPE_POR_VUELTA } from "@/lib/borrado-de-chats";
import type { ChatConversationPreference } from "@/types/chat";

/**
 * Que conversaciones entran en un borrado por criterio —un rango de fechas, o
 * TODAS—, resuelto en el SERVIDOR.
 *
 * # El tope que no estaba escrito en ninguna parte
 *
 * «Eliminar por fecha» y «seleccionar todas» trabajaban sobre `contacts`, o sea
 * sobre las filas que el navegador tenia cargadas. La bandeja carga acotada
 * (`TOPE_DE_LA_BANDEJA`, 300) y las siguientes paginas llegan al bajar, asi que
 * no habia forma de pedir «borralas todas»: lo que no se habia cargado no
 * existia para el dialogo. Desde fuera eso se lee como un tope, y por eso nadie
 * encontraba el numero: no hay ninguno.
 *
 * La regla de siempre es que un filtro que vive un paso despues del servidor no
 * es un filtro. Asi que el universo sale de `leerLaBandejaEntera` —**la MISMA
 * consulta que la lista**, sin la ventana ni el tope de la pagina, que es la que
 * ya alimenta el contador de «Todos»—, se deduplica con `dedupeAndSortChats`
 * igual que la lista, y se filtra con `entraEnElBorrado`, que son las mismas
 * tres condiciones que el dialogo aplicaba a mano.
 *
 * De ahi sale gratis lo que importa: **el numero que el dialogo promete es el
 * que la lista enseñaria bajando hasta el final**, ni uno mas.
 *
 * # Y de quien es cada linea lo dice la base, no el navegador
 *
 * El navegador nombra las lineas que tiene delante; quien decide de quien son es
 * `resolveInstanceOwner`, y quien decide si se puede borrar ahi es la puerta de
 * siempre en la accion. Una lista de lineas que llega de fuera no puede elegir
 * en que cuenta se borra.
 */

export type LineaPedida = {
  instanceName: string;
};

export type ConversacionParaBorrar = {
  /** La cuenta DUEÑA de la linea, resuelta en el servidor. */
  userId: string;
  instanceName: string;
  remoteJid: string;
  /** Todas las identidades que la bandeja conoce de esa fila. */
  identidades: string[];
};

export type UniversoDelBorrado = {
  /** Las que entran, ya acotadas al tope de la vuelta. */
  conversaciones: ConversacionParaBorrar[];
  /** Cuantas entran en total, tope aparte. Es el numero que se le promete. */
  total: number;
  /** Cuantas quedarian para la vuelta siguiente. */
  quedan: number;
  /** Las lineas que se pidieron y no son de nadie que se alcance. */
  lineasFuera: string[];
};

/** Las marcas de estas cuentas, indexadas como las lee la pantalla. */
async function lasMarcasDe(userIds: string[]): Promise<Record<string, ChatConversationPreference>> {
  if (userIds.length === 0) return {};
  const filas = await db.chatConversationPreference.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      instanceName: true,
      remoteJid: true,
      pinnedAt: true,
      archivedAt: true,
      deletedAt: true,
      purgedAt: true,
      updatedAt: true,
    },
  });

  const mapa: Record<string, ChatConversationPreference> = {};
  for (const f of filas) {
    mapa[chatPreferenceKey(f.userId, f.instanceName ?? "", f.remoteJid)] = {
      instanceName: f.instanceName ?? "",
      remoteJid: f.remoteJid,
      pinnedAt: f.pinnedAt?.toISOString() ?? null,
      archivedAt: f.archivedAt?.toISOString() ?? null,
      deletedAt: f.deletedAt?.toISOString() ?? null,
      purgedAt: f.purgedAt?.toISOString() ?? null,
      updatedAt: f.updatedAt?.toISOString() ?? null,
      isPinned: Boolean(f.pinnedAt),
      isArchived: Boolean(f.archivedAt),
      isDeleted: Boolean(f.deletedAt),
      isPurged: Boolean(f.purgedAt),
    };
  }
  return mapa;
}

/**
 * El universo del borrado, ya con su dueño resuelto y su tope aplicado.
 *
 * `puedeBorrarEn` lo pone quien llama: es la puerta de la accion
 * (`assertCanDeleteChats`), y se pregunta UNA vez por cuenta y no por linea.
 */
export async function elUniversoDelBorrado(params: {
  lineas: string[];
  desde?: string | null;
  hasta?: string | null;
  puedeBorrarEn: (userId: string) => Promise<boolean>;
  tope?: number;
}): Promise<UniversoDelBorrado | null> {
  const limites = limitesDelBorrado(params.desde, params.hasta);
  // Un rango que no puede existir NO es «todas»: sin esta distincion, un «hasta»
  // mal escrito borraria la cuenta entera.
  if (!limites) return null;

  const pedidas = Array.from(new Set(params.lineas.map((l) => l.trim()).filter(Boolean)));
  const lineasFuera: string[] = [];
  const duenoDeLaLinea = new Map<string, string>();
  const decidido = new Map<string, boolean>();

  for (const linea of pedidas) {
    const dueno = await resolveInstanceOwner(linea);
    if (!dueno?.userId) {
      lineasFuera.push(linea);
      continue;
    }
    if (!decidido.has(dueno.userId)) {
      decidido.set(dueno.userId, await params.puedeBorrarEn(dueno.userId));
    }
    if (!decidido.get(dueno.userId)) {
      lineasFuera.push(linea);
      continue;
    }
    duenoDeLaLinea.set(linea, dueno.userId);
  }

  const lineas = Array.from(duenoDeLaLinea.keys());
  if (lineas.length === 0) {
    return { conversaciones: [], total: 0, quedan: 0, lineasFuera };
  }

  const userIds = Array.from(new Set(Array.from(duenoDeLaLinea.values())));
  const [crudas, marcas] = await Promise.all([
    leerLaBandejaEntera({ userIds, instanceNames: lineas }),
    lasMarcasDe(userIds),
  ]);

  // Los repetidos se quitan igual que en la lista: el mismo contacto puede venir
  // por su numero y por su `@lid`, y borrarlo dos veces inflaria el numero que se
  // le promete.
  const chats = dedupeAndSortChats(crudas);

  const entran: ConversacionParaBorrar[] = [];
  for (const chat of chats) {
    const linea = chat.instanceName ?? "";
    const userId = duenoDeLaLinea.get(linea);
    // Una fila sin linea no se puede situar, y sin linea no se borra nada (ver
    // `hardDeleteLocalChat`). Se queda fuera y no se cuenta.
    if (!userId) continue;

    const identidades = getChatIdentityCandidates(chat);
    const marca = elegirPreferenciaDelChat(marcas, userId, linea, identidades);
    if (!entraEnElBorrado({ segundos: getChatSortTimestamp(chat) }, marca, limites)) continue;

    entran.push({ userId, instanceName: linea, remoteJid: chat.remoteJid, identidades });
  }

  const tope = Math.max(1, params.tope ?? TOPE_POR_VUELTA);
  return {
    conversaciones: entran.slice(0, tope),
    total: entran.length,
    quedan: Math.max(0, entran.length - tope),
    lineasFuera,
  };
}
