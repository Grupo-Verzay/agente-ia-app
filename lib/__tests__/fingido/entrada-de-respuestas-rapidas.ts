/**
 * La entrada que se empaqueta para el banco de Respuestas Rápidas contra
 * Postgres (`scripts/banco-respuestas-rapidas.sh`). Solo se finge quién ha
 * iniciado sesión: las acciones y las consultas son las de producción.
 *
 * Se exportan los MÓDULOS enteros y no sus funciones sueltas a propósito: el
 * modo roto empaqueta esta misma entrada contra el código de antes, donde
 * `guardarElOrdenDeLasRespuestasAction` y `eliminarRespuestasRapidasAction` no
 * existían. Con `export { x } from` el paquete no se armaría y el banco se
 * caería por algo que no es lo que viene a probar.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export * as rr from "@/actions/rr-actions";
export * as borrado from "@/actions/borrado-en-bloque-actions";
export { db } from "@/lib/db";
