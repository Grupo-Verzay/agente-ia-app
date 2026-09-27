/**
 * La entrada que se empaqueta para el banco del sentimiento. Lo único fingido
 * es quién ha iniciado sesión (el reporte del CRM) y el analizador de IA, que
 * el propio banco pasa como parámetro. Las tablas, el reclamo, el guardado, la
 * lectura de la bandeja y el reporte son los de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    analizarUnaConversacion,
    barrerElSentimientoDeLaBandeja,
    barrerElSentimientoDeLaPlataforma,
    analizarConLaIa,
    olvidarLoRecordado,
} from "@/lib/sentimiento-runner.server";
export {
    losPendientes,
    losSentimientosDeLasLineas,
    lasCaidas,
    elDiaDe,
} from "@/lib/sentimiento-db";
export { getSentimientoCrmData } from "@/actions/sentimiento-actions";
export { db } from "@/lib/db";
