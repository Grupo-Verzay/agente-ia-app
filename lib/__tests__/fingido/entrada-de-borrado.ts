/**
 * La entrada que se empaqueta para el banco del borrado de Chats.
 *
 * Todo lo que sale por aqui son las funciones de PRODUCCION: el borrado (uno a
 * uno y en bloque), la consulta que arma la bandeja y el filtro del navegador.
 * El unico `currentUser()` que se finge se inyecta con un alias de esbuild, asi
 * que queda DENTRO del paquete —importarlo aparte moveria otra copia y
 * `ponerAQuienMira` no tendria efecto sobre el codigo que corre—.
 *
 * En `MODO=roto` el runner apunta `@/actions/chat-conversation-actions` y
 * `@/lib/chat-persistence` a las versiones de `origin/main`, asi que estas
 * mismas exportaciones traen el codigo de ANTES del arreglo y el banco afirma la
 * reaparicion.
 */
export { ponerAQuienMira } from "./auth-de-borrado";

export {
  deleteChatConversationAction,
  bulkDeleteChatsAction,
} from "@/actions/chat-conversation-actions";

export {
  getPersistedInboxChats,
  invalidatePersistedInboxCache,
} from "@/lib/chat-persistence";

export { elegirPreferenciaDelChat, chatPreferenceKey } from "@/lib/chat-preference-key";

export {
  getChatIdentityCandidates,
  isChatDeletedByPreference,
} from "@/app/(root)/chats/_components/chat-sidebar.utils";

export { db } from "@/lib/db";
