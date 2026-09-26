/**
 * La entrada que se empaqueta para el banco del borrado en bloque de Chats.
 *
 * Todo lo que sale por aqui son las funciones de PRODUCCION: las acciones en
 * lote, el marcado en bloque, la purga de fondo con su barrido, el universo del
 * borrado y la consulta que arma la bandeja. Lo unico que se finge —con un alias
 * de esbuild, asi que queda DENTRO del paquete— son `currentUser()`,
 * `revalidatePath` y el `cache()` de React: piden una peticion de Next que aqui
 * no existe y no deciden nada de lo que se prueba.
 *
 * En `MODO=roto` el runner apunta `@/actions/chat-conversation-actions` a un
 * arbol de git pinchado —el commit de ANTES—, asi que `bulkDeleteChatsAction`
 * trae el `Promise.all` sobre `hardDeleteLocalChat` y el banco afirma el fallo:
 * «Transaction API error» y la pantalla mintiendo.
 */
export { ponerAQuienMira } from "./auth-de-borrado";

export {
  bulkDeleteChatsAction,
  bulkArchiveChatsAction,
  bulkPinChatsAction,
  contarConversacionesParaBorrarAction,
  borrarConversacionesDeLaBandejaAction,
} from "@/actions/chat-conversation-actions";

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
