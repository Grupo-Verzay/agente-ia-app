/**
 * La entrada que se empaqueta para el banco de PROPUESTAS COMERCIALES.
 *
 * Lo único fingido es quién ha iniciado sesión (`currentUser`), y va DENTRO del
 * paquete para que `ponerAQuienMira` mueva el código que corre. Las acciones,
 * la puerta, el saneado y las consultas son las de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    listarPropuestasAction,
    crearPropuestaAction,
    editarPropuestaAction,
    borrarPropuestaAction,
} from "@/actions/propuestas-actions";
export { laPropuestaPublica, elLogoQueSeEnsena } from "@/lib/propuestas-db";
export { db } from "@/lib/db";
