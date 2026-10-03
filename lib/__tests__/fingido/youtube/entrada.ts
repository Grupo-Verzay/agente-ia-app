/**
 * Lo que el banco de YouTube necesita de la App, empaquetado: las DOS rutas de
 * verdad (`/api/youtube/conectar` y `/api/youtube/oauth`) con `currentUser()` y
 * `next/headers` fingidos, y el Prisma de la App para leer las filas. El módulo
 * de acceso se importa del mismo sitio que las rutas, así que lo que se prueba
 * es el código de producción menos esas dos puertas.
 */
export { ponerAQuienMira } from "../auth-de-documentos";
export { GET as conectarGET } from "@/app/api/youtube/conectar/route";
export { GET as vueltaGET } from "@/app/api/youtube/oauth/route";
export {
    elEstadoDeLaConexion,
    leerLaConexion,
    firmarElEstado,
    unNonce,
    unPermisoParaSubir,
    VIGENCIA_DEL_VIAJE_MS,
} from "@/lib/youtube-acceso.mjs";
export { db } from "@/lib/db";
