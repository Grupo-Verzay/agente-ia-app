/**
 * Grabar la videollamada con IA (Verzy, Tavus) desde la SALA del navegador.
 *
 * # Por qué en el navegador y no en Tavus
 *
 * Tavus solo graba en Amazon S3, Google Cloud Storage o Azure Blob: no acepta
 * un endpoint propio, así que no puede escribir en nuestro MinIO. La sala, en
 * cambio, ya tiene todo lo que se dijo y se vio: la voz y el video del avatar
 * (pistas remotas de Daily), el micrófono del cliente (pista local) y la
 * pantalla que Verzy comparte (el MJPEG de `/api/videollamada/pantalla`). Se
 * graba ahí, con las mismas piezas que Reuniones (`lib/grabacion-de-reunion.ts`):
 * mezcla de audio, lienzo para el video, partes de 8 MiB y `composeObject`.
 *
 * La transcripción y el resumen NO salen de aquí: los entrega Tavus por su
 * `callback_url` (`lib/videollamada-ia-aviso.server.ts`).
 *
 * Puro: de aquí tiran la sala, la ruta que recibe las partes y el banco.
 */

import type { Casilla, ExtensionDeGrabacion } from "@/lib/grabacion-de-reunion";

/**
 * El formato del fichero, según lo que eligió el `MediaRecorder` del cliente:
 * Safari (iPhone) graba **mp4**; Chrome, Firefox y Android, webm. Un mp4
 * guardado como `.webm` no lo abre bien ningún reproductor, y los prospectos
 * entran mucho desde el teléfono.
 */
export function elFormatoDeLaGrabacion(mimeType: unknown): ExtensionDeGrabacion {
    return typeof mimeType === "string" && /mp4/i.test(mimeType) ? "mp4" : "webm";
}

/** El tipo con el que se guarda cada fichero en el bucket. */
export function elTipoDelFichero(formato: ExtensionDeGrabacion, cual: "audio" | "video"): string {
    return `${cual}/${formato}`;
}

/**
 * Cada cuánto sube la sala lo grabado: un TROZO cada diez segundos.
 *
 * No las partes de 8 MiB de Reuniones, y es lo que más importa de este
 * fichero: el cliente casi nunca pulsa «Salir», **cierra la pestaña**. Lo que
 * estuviera sin subir se pierde (`pagehide` no deja mandar megas), y con
 * partes de 8 MiB eso era la llamada ENTERA: el audio a 32 kbps tarda media
 * hora en juntar 8 MiB. Con trozos de 10 s se pierden, como mucho, los
 * últimos diez segundos.
 *
 * El servidor junta los trozos en partes de 8 MiB al cerrar
 * (`juntarLosTrozos`), porque `composeObject` sigue pidiendo 5 MiB por parte.
 */
export const TROZO_CADA_MS = 10_000;

/**
 * La llave de un trozo en el bucket, con el número rellenado a cinco cifras
 * (el listado de S3 ordena como texto: sin relleno el 10 iría antes que el 2).
 */
export function llaveDelTrozo(input: {
    cuentaId: string;
    grabacionId: string;
    cual: "audio" | "video";
    numero: number;
    formato: ExtensionDeGrabacion;
}): string {
    const n = String(Math.max(1, Math.floor(input.numero))).padStart(5, "0");
    return `${input.cuentaId}/videollamadas/${input.grabacionId}/trozos-${input.cual}/${n}.${input.formato}`;
}

/**
 * Quién graba: **la pestaña del CLIENTE**; la de un asesor, solo si no hay
 * ningún cliente en la sala.
 *
 * El cliente está casi siempre (la sala es su enlace) y un asesor entra a
 * veces: si grabaran los dos saldrían dos ficheros de la misma llamada.
 *
 * Pero quien abre el enlace con la sesión iniciada entra como asesor, y así
 * es como se PRUEBA la videollamada (el dueño de la cuenta abre el enlace en
 * su navegador). Con «el asesor nunca graba», esa llamada no dejaba ni audio
 * ni video: en la sala no había nadie que grabara. Ahora el asesor graba
 * cuando está solo con Verzy; si el cliente entra después, graban los dos y
 * al CRM va la más larga (`copiarLaGrabacionAlCrm`). Antes una grabación de
 * más que ninguna.
 */
export function laSalaGraba(input: { esAsesor: boolean; hayCliente: boolean }): boolean {
    return !input.esAsesor || !input.hayCliente;
}

/**
 * El video. Más bajo que el de Reuniones (1,5 Mbps) a propósito: quien sube es
 * el cliente, a menudo desde un teléfono y **mientras** manda su cámara y su
 * voz a la llamada. Un megabit de más por su subida es la llamada que se
 * entrecorta. Una hora son ~400 MB.
 */
export const VIDEO_BPS_DE_LA_SALA = 900_000;
export const ANCHO_DEL_LIENZO_DE_LA_SALA = 1280;
export const ALTO_DEL_LIENZO_DE_LA_SALA = 720;
export const FPS_DEL_LIENZO_DE_LA_SALA = 10;

/**
 * El techo de bytes de UNA grabación (las dos pistas juntas).
 *
 * La ruta se abre con la firma de la cita, sin sesión: sin techo, quien tenga
 * el enlace podría llenar el bucket. Dos gibibytes dan para más de cuatro
 * horas, y la sala cuelga sola al límite de minutos de la cuenta.
 */
export const TOPE_DE_BYTES_DE_LA_SALA = 2 * 1024 * 1024 * 1024;

/** El techo de UN trozo: diez segundos de video son ~1,1 MB; con holgura. */
export const TOPE_DEL_TROZO = 8 * 1024 * 1024;

/** El techo de trozos de una pista: seis horas a uno cada diez segundos. */
export const TOPE_DE_TROZOS = 2_160;

/**
 * Cuántas grabaciones puede tener una cita. Cada «Volver a entrar» (recargar la
 * página) abre una nueva; las reconexiones solas NO, porque la sala no se
 * desmonta. Es otro techo de la ruta sin sesión.
 */
export const TOPE_DE_GRABACIONES_POR_CITA = 20;

/** Las horas tras las que una grabación sin cerrar se da por huérfana y se junta. */
export const HORAS_SIN_CERRAR = 2;

/**
 * Dónde va cada cosa en el lienzo: lo GRANDE ocupa todo, y la miniatura abajo
 * a la derecha, como en la sala (`laDisposicion`). La miniatura mide un cuarto
 * del ancho en 16:9 y se separa del borde un 2 % del ancho.
 */
export function lasCajasDelLienzoDeLaSala(
    hayMini: boolean,
    ancho: number = ANCHO_DEL_LIENZO_DE_LA_SALA,
    alto: number = ALTO_DEL_LIENZO_DE_LA_SALA,
): { grande: Casilla; mini: Casilla | null } {
    const grande = { x: 0, y: 0, ancho, alto };
    if (!hayMini) return { grande, mini: null };
    const margen = Math.round(ancho * 0.02);
    const anchoMini = Math.round(ancho / 4);
    const altoMini = Math.round((anchoMini * 9) / 16);
    return {
        grande,
        mini: { x: ancho - anchoMini - margen, y: alto - altoMini - margen, ancho: anchoMini, alto: altoMini },
    };
}

/**
 * Cómo entra ENTERO un video o una imagen en su caja (`contain`): sin recortar
 * y sin deformar, con franjas si la forma no coincide. Es lo que se hace con
 * lo grande —una pantalla compartida recortada pierde justo el menú—; la
 * miniatura usa `comoEntraElVideo` (recorta, como en la sala).
 * Devuelve el rectángulo de DESTINO.
 */
export function comoCabeEntero(input: {
    anchoDeLaFuente: number;
    altoDeLaFuente: number;
    caja: Casilla;
}): Casilla | null {
    const { anchoDeLaFuente: fw, altoDeLaFuente: fh, caja } = input;
    if (!fw || !fh || !caja.ancho || !caja.alto) return null;
    const escala = Math.min(caja.ancho / fw, caja.alto / fh);
    const ancho = Math.round(fw * escala);
    const alto = Math.round(fh * escala);
    return {
        x: caja.x + Math.round((caja.ancho - ancho) / 2),
        y: caja.y + Math.round((caja.alto - alto) / 2),
        ancho,
        alto,
    };
}

/**
 * Lo que se mezcla en `raw.call` de la fila del CRM (`tavus_<cita>`) al cerrar
 * una grabación. Solo las llaves que tienen valor: un `null` pisaría una
 * dirección buena de una grabación anterior.
 */
export function laGrabacionParaElCrm(input: {
    audioUrl: string | null;
    videoUrl: string | null;
}): { hasRecording: true; recordingUrl?: string; videoUrl?: string } | null {
    const audio = (input.audioUrl ?? "").trim();
    const video = (input.videoUrl ?? "").trim();
    if (!audio && !video) return null;
    return {
        hasRecording: true,
        ...(audio ? { recordingUrl: audio } : {}),
        ...(video ? { videoUrl: video } : {}),
    };
}

/** El id del mensaje del CRM de una videollamada: uno por cita. */
export function elMensajeDeLaVideollamada(citaId: string): string {
    return `tavus_${citaId}`;
}
