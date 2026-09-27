/**
 * El «antes» de la encuesta: `resolveSession` tal como estaba en `ANTES_REF`,
 * sacado de git a una carpeta aparte (ver el script). Al lado, las funciones
 * de la base de hoy, solo para poder ENCENDER el interruptor y mirar la tabla:
 * así el modo roto afirma que, con la encuesta encendida, resolver no mandaba
 * nada.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export { resolveSession } from "../.antes/encuesta/actions/advisor-assign-actions";
export {
    recogerLasRespuestas,
    guardarLosAjustesDeLaEncuesta,
} from "@/lib/encuesta-de-satisfaccion-db";
export { persistChatMessage } from "@/lib/chat-persistence";
export { db } from "@/lib/db";
