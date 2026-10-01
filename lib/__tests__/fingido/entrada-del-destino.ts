/**
 * La entrada que se empaqueta para el banco de «llamar y escribir a un contacto
 * sin número» (`destino-de-la-llamada.test.mjs`).
 *
 * El `currentUser()` de mentira se inyecta con un alias de esbuild, así que
 * queda DENTRO del paquete: importándolo aparte se movería otra copia y
 * `ponerAQuienMira` no tendría efecto sobre el código que corre. Lo demás son
 * las acciones y la persistencia de verdad.
 *
 * Se empaqueta igual en el árbol de ANTES, y por eso no importa nada que no
 * existiera allí.
 */
export { ponerAQuienMira } from "./auth-de-llamadas";
export { startAstraCall, logOutgoingCallAction } from "@/actions/astracalls-actions";
export { persistChatMessage } from "@/lib/chat-persistence";
export { db } from "@/lib/db";
