/**
 * La entrada que se empaqueta para el banco de la traducción de Chats. Lo único
 * fingido es quién ha iniciado sesión y el cliente de IA; las tres acciones, la
 * puerta, el cobro, la lectura del idioma y el guardado son los de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { llamadasAlTraductor, ponerTokensDelTraductor, queReviente } from "./traductor-de-mentira";
export {
    traduccionesDeLaConversacionAction,
    traducirMensajeAction,
    traducirParaEnviarAction,
} from "@/actions/traduccion-de-chats-actions";
export { persistChatMessage, persistedRowToEvolutionMessage } from "@/lib/chat-persistence";
export * as idioma from "@/lib/idioma-del-cliente";
export * as reglas from "@/lib/traduccion-de-chats";
export { db } from "@/lib/db";
