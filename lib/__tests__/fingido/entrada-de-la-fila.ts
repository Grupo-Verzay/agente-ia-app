/**
 * La entrada que se empaqueta para el banco de la fila de Chats.
 *
 * El `currentUser()` de mentira se inyecta con un alias de esbuild, así que
 * queda **dentro** del paquete: importándolo aparte desde el banco se movería
 * otra copia —otro módulo, otra variable— y `ponerAQuienMira` no tendría
 * ningún efecto sobre el código que corre.
 *
 * Lo que sale por aquí es la consulta de VERDAD que alimenta la bandeja de
 * Chats. Lo que este banco viene a comprobar es que sigue devolviendo el
 * estado del cliente y el tipo de asistencia tal cual están guardados, aunque
 * la fila ya no los pinte.
 */
export { ponerAQuienMira } from "./auth-de-la-fila";

export { getSesionesDeLaCuenta } from "@/actions/session-action";

export { db } from "@/lib/db";
