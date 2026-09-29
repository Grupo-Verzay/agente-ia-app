/**
 * La entrada que se empaqueta para el banco de PLANTILLAS DE PLANES de
 * Propuestas. Lo fingido es solo quién ha iniciado sesión y el despachador de
 * WhatsApp; las acciones, la puerta, el saneado y las consultas son las de
 * producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    listarPropuestasAction,
    crearPropuestaAction,
    editarPropuestaAction,
    crearPlantillaAction,
    editarPlantillaAction,
    borrarPlantillaAction,
} from "@/actions/propuestas-actions";
export { conLaPlantillaCargada } from "@/lib/plantillas-de-planes";
export { db } from "@/lib/db";
