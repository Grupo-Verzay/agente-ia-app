/**
 * La entrada que se empaqueta para el banco del contador de «Todos».
 *
 * Todo es de produccion: el COUNT del servidor, las dos escrituras de la marca
 * de resuelta (resolver y reabrir) y la regla pura que corrige el numero en el
 * navegador. Ninguna pide sesion, asi que no hace falta fingir `currentUser`.
 */
export { contarChatsPorLinea } from "@/lib/chat-persistence";
export { marcarSesionResuelta, reabrirSesion } from "@/lib/session-resolved";
export { totalesDeTodos, estaResuelta, conLaResolucion } from "@/lib/total-de-todos";
export { db } from "@/lib/db";
