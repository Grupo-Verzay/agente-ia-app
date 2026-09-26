/**
 * La MISMA entrada del banco del borrado en bloque, pero con el borrado de
 * ANTES: el `Promise.all` sobre `hardDeleteLocalChat`.
 *
 * El «antes» va PINCHADO a un commit (`ANTES_REF` en el runner) y no a
 * `origin/main`: en cuanto este cambio se fusione, `origin/main` pasa a ser el
 * «despues» y el modo roto dejaria de reproducir nada —se pondria verde sin
 * ejercer el fallo, que es la peor forma de tener un banco—.
 *
 * Lo que no existia antes —contar el universo y limpiar por criterio— sale como
 * un tropiezo a proposito: el banco se salta esos casos en modo roto, y si algun
 * dia deja de saltarlos, el tropiezo lo dice en vez de pasar en silencio.
 */
export { ponerAQuienMira } from "./auth-de-borrado";

// Estas tres vienen del arbol pinchado: el runner apunta
// `@/actions/chat-conversation-actions` al fichero de ANTES.
export {
  bulkDeleteChatsAction,
  bulkArchiveChatsAction,
  bulkPinChatsAction,
} from "@/actions/chat-conversation-actions";

const NO_EXISTIA = "esto no existia en el «antes» del banco";

export async function contarConversacionesParaBorrarAction(): Promise<never> {
  throw new Error(NO_EXISTIA);
}
export async function borrarConversacionesDeLaBandejaAction(): Promise<never> {
  throw new Error(NO_EXISTIA);
}

export {
  marcarEnBloque,
  marcarChatsComoBorrados,
  hardDeleteLocalChat,
} from "@/lib/borrado-de-chats.server";

export {
  runPurgaDeChats,
  purgarEstosChats,
  loQueFaltaPorPurgar,
  cuantoFaltaPorPurgar,
} from "@/lib/purga-de-chats.server";

export { elUniversoDelBorrado } from "@/lib/conversaciones-para-borrar.server";

export {
  agruparIdentidades,
  entraEnElBorrado,
  limitesDelBorrado,
  esTodaLaBase,
  comoTextoDelBorrado,
  TOPE_POR_VUELTA,
  PURGAS_POR_VUELTA,
  MARCAS_POR_SENTENCIA,
} from "@/lib/borrado-de-chats";

export {
  getPersistedInboxChats,
  invalidatePersistedInboxCache,
} from "@/lib/chat-persistence";

export { db } from "@/lib/db";
