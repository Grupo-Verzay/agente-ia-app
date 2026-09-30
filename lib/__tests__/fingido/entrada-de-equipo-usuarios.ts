/**
 * Entrada del banco de Usuarios (`scripts/banco-equipo-usuarios.sh`).
 *
 * `currentUser()` es el DE VERDAD: solo se finge la petición (la sesión y las
 * cookies). Al lado, las acciones de verdad que se arreglaron al documentar la
 * pantalla —vincular una cuenta desde Usuarios y desde el conmutador,
 * reiniciar los vínculos, «Asignar sin atender» y las métricas del equipo—.
 *
 * El mismo fichero se empaqueta contra el árbol de hoy y contra el de ANTES,
 * así que las acciones van como NAMESPACE (`export * as`): lo que en el commit
 * de antes no existe sale como `undefined` en vez de romper el empaquetado.
 */
export { ponerLaSesion } from "./sesion-y-cookies";
export * as equipo from "@/actions/team-actions";
export * as vinculos from "@/actions/linked-account-actions";
export * as asignar from "@/actions/advisor-assign-actions";
export { db } from "@/lib/db";
