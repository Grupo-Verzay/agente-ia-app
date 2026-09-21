/**
 * La entrada que se empaqueta para el banco de «la linea de la conversacion».
 *
 * Existe por la misma razon que la de Llamadas: el `currentUser()` de mentira
 * se inyecta con un alias de esbuild, asi que queda **dentro** del paquete.
 * Importandolo aparte desde el banco se estaria moviendo otra copia —otro
 * modulo, otra variable— y `ponerAQuienMira` no tendria ningun efecto sobre el
 * codigo que corre.
 *
 * Lo que sale por aqui son **las acciones de verdad**: lo que este banco viene
 * a comprobar es que responder y llamar desde una conversacion que entro por
 * una linea AJENA salen por esa linea, no por la de la cuenta de quien mira.
 */
export { ponerAQuienMira } from "./auth-de-llamadas";

export { startAstraCall, logOutgoingCallAction } from "@/actions/astracalls-actions";

export {
    laLineaDeLaConversacion,
    porDondeSaleLaRespuesta,
    porQueNoSeEnvia,
} from "@/lib/linea-de-la-conversacion";

export { db } from "@/lib/db";
