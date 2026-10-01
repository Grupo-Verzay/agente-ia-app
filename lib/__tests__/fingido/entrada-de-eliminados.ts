/**
 * La entrada que se empaqueta para el banco de «un chat o un lead eliminado no
 * vuelve solo» (`scripts/banco-chats-eliminados.sh`).
 *
 * Todo lo que sale por aquí es código de PRODUCCIÓN: eliminar un chat (uno a
 * uno y en bloque, con su purga de fondo), eliminar un lead, lo que guarda un
 * mensaje (`persistChatMessage`, por donde pasan el sondeo, la precarga, la
 * importación de Waha y los envíos) y la reposición de fichas que corre al
 * abrir la bandeja. Lo único fingido es `currentUser()`, `revalidatePath` y el
 * `cache()` de React, que piden una petición de Next.
 *
 * Solo se exportan funciones que existen ANTES y DESPUÉS del arreglo: en
 * `MODO=roto` el mismo fichero se empaqueta contra el árbol de un commit
 * pinchado y tiene que compilar igual.
 */
export { ponerAQuienMira } from "./auth-de-borrado";

export {
  deleteChatConversationAction,
  bulkDeleteChatsAction,
  getChatConversationPreferencesForAssociatedAccounts,
} from "@/actions/chat-conversation-actions";

export { deleteSession } from "@/actions/session-action";

export {
  persistChatMessage,
  getPersistedInboxChats,
  invalidatePersistedInboxCache,
} from "@/lib/chat-persistence";

export { purgarEstosChats } from "@/lib/purga-de-chats.server";

export { db } from "@/lib/db";
