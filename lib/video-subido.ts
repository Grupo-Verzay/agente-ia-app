/**
 * Subir el video de un plan —o el de la landing general— como ARCHIVO, al
 * lado del enlace de YouTube, Vimeo, Loom o Drive que ya se podía pegar.
 *
 * Puro a propósito: lo usan la ruta que sube (`/api/upload-plan-video`), el
 * botón del panel y el banco, y tienen que decir lo mismo. Con el tope escrito
 * en dos sitios, el botón dejaría pasar un archivo que la ruta rechaza después
 * de tres minutos de barra.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Lo que decide qué es un video son sus primeros BYTES**, no el nombre ni
 *    el tipo que diga el navegador (`elVideoDeLaCabecera`). Un `.mp4` que por
 *    dentro es otra cosa se rechaza; un WebM con nombre `.mp4` —que se vio en
 *    producción— se guarda como lo que es.
 * 2. **La dirección que se guarda termina en la extensión del video de
 *    verdad.** Es lo que hace que `elVideoDelPlan` lo trate como `archivo` y lo
 *    pinte con un `<video>`; sin ella saldría en un `<iframe>`, que no
 *    reproduce igual en todos los navegadores.
 * 3. **Hay tope** (`TOPE_DEL_VIDEO_SUBIDO`): un video de presentación de unos
 *    minutos cabe de sobra, y sin tope una subida por error de un archivo de
 *    varios gigas se lleva el disco del bucket.
 */

/** 150 MB: unos diez minutos de video 1080p bien comprimido. */
export const TOPE_DEL_VIDEO_SUBIDO = 150 * 1024 * 1024;

/** Los contenedores que se aceptan, con la extensión con la que se guardan. */
export const EXTENSION_DEL_VIDEO: Readonly<Record<string, string>> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
};

/** Lo que se ofrece en el selector de archivos del navegador. */
export const VIDEOS_QUE_SE_ACEPTAN = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v";

export function laExtensionDelVideo(tipo: string | null | undefined): string | null {
    return EXTENSION_DEL_VIDEO[(tipo ?? "").trim().toLowerCase()] ?? null;
}

/** «12,4 MB», para que el aviso diga cuánto pesa lo que se eligió. */
export function elPesoLegible(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * Por qué un archivo NO se puede subir, o `null` si se puede. Se pregunta en
 * el navegador antes de empezar —para no hacer esperar una barra entera por
 * algo que se sabía— y en la ruta otra vez, porque lo del navegador no decide.
 */
export function porQueNoSeSubeElVideo(archivo: { tamano: number; tipo?: string | null; nombre?: string | null }): string | null {
    const tamano = Number(archivo.tamano);
    if (!Number.isFinite(tamano) || tamano <= 0) return "El archivo está vacío.";
    if (tamano > TOPE_DEL_VIDEO_SUBIDO) {
        return `El video pesa ${elPesoLegible(tamano)} y el máximo es ${elPesoLegible(TOPE_DEL_VIDEO_SUBIDO)}. Comprímelo o súbelo a YouTube y pega el enlace.`;
    }
    const tipo = (archivo.tipo ?? "").trim().toLowerCase();
    const extension = /\.([a-z0-9]{1,8})$/i.exec((archivo.nombre ?? "").split(/[?#]/)[0])?.[1]?.toLowerCase() ?? "";
    const pareceVideo = tipo.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(extension);
    if (!pareceVideo) return "Solo se pueden subir videos en MP4, WebM o MOV.";
    return null;
}
