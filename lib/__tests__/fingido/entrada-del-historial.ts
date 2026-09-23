/**
 * Entrada del banco del historial y del orden de los directos del chat de
 * equipo (`scripts/banco-historial-del-equipo.sh`).
 *
 * El mismo fichero se empaqueta contra el árbol de hoy y contra el de ANTES,
 * así que las acciones van como NAMESPACE (`export * as`): una acción que en el
 * commit de antes no existe sale como `undefined` en vez de romper el
 * empaquetado — y eso es justo lo que el modo roto afirma.
 */
export { ponerLaSesion } from "./sesion-y-cookies";
export * as chat from "@/actions/chat-de-equipo-actions";
export * as equipo from "@/actions/team-actions";
export * as orden from "@/actions/orden-de-tablero-actions";
export { db } from "@/lib/db";
