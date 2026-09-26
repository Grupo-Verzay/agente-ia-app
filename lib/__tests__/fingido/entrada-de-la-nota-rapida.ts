/**
 * La entrada que se empaqueta para el banco de la nota rápida.
 *
 * El `currentUser()` de mentira va DENTRO del paquete —importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre—, y al lado las
 * acciones de VERDAD. Lo único fingido es quién ha iniciado sesión: la tabla,
 * el saneado, `createNote` y el registro de auditoría son los de producción.
 *
 * Se exportan también las dos funciones de la base para poder mirar la fila sin
 * pasar por la acción: lo que hay que afirmar de «se vacía al mandarla» es lo
 * que queda GUARDADO, no lo que devuelve quien la vació.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    leerMiNotaRapidaAction,
    guardarMiNotaRapidaAction,
    mandarLaNotaAlModuloAction,
} from "@/actions/nota-rapida-actions";
export { leerLaNotaRapida, guardarLaNotaRapida } from "@/lib/nota-rapida-db";
// `createNote` se exporta para el MODO=roto: el orden ingenuo —vaciar antes
// de crear— se escribe literal en el banco y necesita la creación de verdad.
export { getNotes, createNote } from "@/actions/notes-actions";
export { db } from "@/lib/db";
