/**
 * La entrada que se empaqueta para el banco de Correo: las acciones, las tres
 * rutas y la base DE VERDAD. Lo fingido es quién tiene la sesión, las
 * cabeceras de Next y el socket IMAP/SMTP; Gmail y Outlook se fingen en el
 * `fetch` desde el propio banco.
 */
export { ponerAQuienMira } from "../auth-de-documentos";
export * from "@/actions/correo-actions";
export { GET as conectarGET } from "@/app/api/correo/conectar/[proveedor]/route";
export { GET as vueltaGET } from "@/app/api/correo/oauth/[proveedor]/route";
export { GET as adjuntoGET } from "@/app/api/correo/adjunto/route";
export { guardarElBuzon, elBuzonDe, losBuzonesDe } from "@/lib/correo-db";
export { laPapeleraImap, elArchivoImap } from "@/lib/correo-proveedores.server";
export { firmarElEstado } from "@/lib/correo-cifrado.server";
export { db } from "@/lib/db";
