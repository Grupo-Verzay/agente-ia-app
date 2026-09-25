/**
 * La entrada que se empaqueta para el banco de Embudos y de lo personal.
 *
 * El `currentUser()` de mentira va DENTRO del paquete —importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre—, y al lado las
 * acciones de verdad: las de embudos, las de etiquetas y las de respuestas
 * rápidas. Lo único fingido es quién ha iniciado sesión.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    tableroDelEmbudoAction,
    crearEmbudoAction,
    renombrarEmbudoAction,
    usarPorDefectoAction,
    borrarEmbudoAction,
    guardarEtapasAction,
    asignarEmbudosAction,
    moverTarjetaAction,
    etapaDeLaConversacionAction,
    vaciarLaColumnaAction,
    cuantasSeVaciarianAction,
    laPapeleraAction,
    restaurarDeLaPapeleraAction,
} from "@/actions/embudos-actions";
export { runPapeleraDeEmbudos } from "@/lib/papelera-de-embudos-runner.server";
export {
    createTagAction,
    listTagsAction,
    deleteTagAction,
    replaceSessionTagsAction,
    getSessionTagsAction,
} from "@/actions/tag-actions";
export { createRR, getAllRRs, deleteRR } from "@/actions/rr-actions";
export { db } from "@/lib/db";
