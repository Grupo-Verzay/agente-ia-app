/**
 * Lo que el banco de la llamada del chat de equipo usa en NODE: las acciones
 * de verdad, la base y cómo abrir un directo. `comoPersona` sale de aquí para
 * que el banco mueva la MISMA copia del `currentUser()` que corre dentro del
 * paquete (ver `entrada-de-llamadas.ts`, mismo motivo).
 */
export { comoPersona } from "./auth-por-persona";
export * from "@/actions/llamadas-actions";
export { abrirElDirecto } from "@/lib/chat-de-equipo-db";
export { db } from "@/lib/db";
