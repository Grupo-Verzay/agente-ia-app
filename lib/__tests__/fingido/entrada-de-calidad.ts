/**
 * La entrada que se empaqueta para el banco de CALIDAD y EXPORTACIÓN.
 *
 * El `currentUser()` de mentira va DENTRO del paquete (importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre) y, al lado,
 * lo de verdad: las acciones de exportar, la de calidad del CRM, el runner con
 * su lectura de `chat_conversations`, y el escritor de mensajes de producción
 * (`persistChatMessage`) para sembrar como siembra la plataforma.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { exportarConversacionesAction } from "@/actions/exportar-conversaciones-actions";
export { calidadDelCrmAction, evaluarCalidadAhoraAction } from "@/actions/calidad-actions";
export { evaluarLaCalidadDeLaCuenta } from "@/lib/calidad-runner.server";
export { persistChatMessage, getPersistedMessages } from "@/lib/chat-persistence";
export { db } from "@/lib/db";
