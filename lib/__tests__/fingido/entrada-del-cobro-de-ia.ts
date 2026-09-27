/**
 * La entrada que se empaqueta para el banco del COBRO de IA. Lo único fingido
 * es quién ha iniciado sesión y el cliente de IA (que apunta sus llamadas). El
 * saldo, el descuento, la puerta de la cuenta, el análisis de sentimiento y las
 * dos sugerencias son los de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { llamadasALaIa, ponerTokensQueDice } from "./cliente-de-ia-de-mentira";
export {
    analizarElSentimientoAlAbrirChats,
    olvidarLoRecordado,
} from "@/lib/sentimiento-runner.server";
export { losPendientes } from "@/lib/sentimiento-db";
export { generateSuggestedReplyAction } from "@/actions/ai-suggested-reply-action";
export { pedirSugerenciaALaIa } from "@/lib/sugerencia-de-correo.server";
export { losTokensDelUso, puedeUsarLaIa, elAvisoSinCreditos } from "@/lib/cobro-de-ia";
export { db } from "@/lib/db";
