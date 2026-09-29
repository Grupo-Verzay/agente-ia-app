/**
 * La entrada que se empaqueta para el banco de PROPUESTAS COMERCIALES.
 *
 * Lo fingido es quién ha iniciado sesión (`currentUser`) y el despachador de
 * WhatsApp (no hay Evolution ni Waha), y van DENTRO del paquete para que el
 * banco mueva el código que corre. Las acciones, la puerta, el saneado y las
 * consultas son las de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { enviados, ponerLineasConectadas } from "./despacho-de-propuestas";
export {
    listarPropuestasAction,
    crearPropuestaAction,
    editarPropuestaAction,
    borrarPropuestaAction,
    ponerEsloganAction,
    enviarPropuestaPorWhatsappAction,
} from "@/actions/propuestas-actions";
export { laPropuestaPublica, elLogoQueSeEnsena } from "@/lib/propuestas-db";
export { db } from "@/lib/db";
