/**
 * La entrada que se empaqueta para el banco de «Quitar de espera».
 *
 * Todo lo que sale por aqui son las funciones de PRODUCCION: la accion nueva
 * (`quitarDeEsperaAction`), el camino que ya existia para bajar el sello
 * (`resolveSession`, que el banco usa en `MODO=roto` para el contraste) y el
 * lector del sello por cuenta (`obtenerEscaladasDeCuentas`), que es de donde
 * sale el conteo de «En espera» de la bandeja.
 *
 * El unico `currentUser()` se finge con un alias de esbuild, asi que queda
 * DENTRO del paquete —importarlo aparte moveria otra copia y `ponerAQuienMira`
 * no tendria efecto sobre el codigo que corre—. La inteligencia de la
 * conversacion y el auto-sync se fingen por lo mismo: hablan con servicios de
 * fuera y no deciden nada de lo que se prueba.
 */
export { ponerAQuienMira } from "./auth-de-espera";

export {
  quitarDeEsperaAction,
  resolveSession,
} from "@/actions/advisor-assign-actions";

export { obtenerEscaladasDeCuentas } from "@/lib/escalado";

export { db } from "@/lib/db";
