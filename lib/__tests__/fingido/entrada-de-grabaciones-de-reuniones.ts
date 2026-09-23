/**
 * La entrada que se empaqueta para el banco de la pestaña «Grabaciones» de
 * Reuniones: que cada cuenta vea sus grabaciones y las de las cuentas que
 * cuelgan de ella HACIA ABAJO, nunca las de su madre ni las de una hermana.
 *
 * Lo fingido (`currentUser`) se inyecta con un alias de esbuild y queda DENTRO
 * del paquete; importándolo aparte se movería otra copia del módulo.
 */
export { ponerAQuienMira } from "./auth-de-llamadas";

export {
    lasGrabacionesDeLasReunionesAction,
    transcribirLaReunionAction,
} from "@/actions/salas-de-video-actions";
export {
    crearLaSala,
    empezarLaGrabacion,
    cerrarLaGrabacion,
    lasGrabacionesDeLasSalas,
} from "@/lib/salas-de-video-db";
export { RUTA_DE_GRABACIONES } from "@/lib/grabacion-de-reunion.server";
export { lasGrabacionesEnLista, lasQueAlcanza } from "@/lib/grabaciones-de-la-pantalla";

export { db } from "@/lib/db";
