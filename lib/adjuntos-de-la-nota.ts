/**
 * Los adjuntos de una NOTA INTERNA de Chats: imagen, video, audio o documento.
 *
 * Puro a propósito, como el resto de lo que decide algo: de aquí tiran la
 * acción (servidor), la burbuja y la caja de escribir (navegador) y el banco.
 * Lo que toca la base vive en `lib/adjuntos-de-la-nota-db.ts`.
 *
 * # Por qué es una tabla aparte y no una columna de `internal_notes`
 *
 * `internal_notes` es del BACKEND (el esquema lo migra `api-webhook`, nunca
 * este repo) y una nota puede llevar varios archivos. Los adjuntos viven en
 * `adjuntos_de_notas`, una tabla NUESTRA sin clave foránea, igual que
 * `acceso_por_mencion`. La nota sigue siendo la misma fila de siempre.
 *
 * # Qué se deja adjuntar
 *
 * El archivo llega **ya subido al bucket** por `/api/upload` —que ya comprueba
 * sesión y que la carpeta sea de una cuenta sobre la que se manda—, en la
 * carpeta `CARPETA_DE_LAS_NOTAS`. Aquí se vuelve a comprobar que la dirección
 * sea de NUESTRO bucket y con esa forma: sin eso, la burbuja pintaría un
 * `<img>` o un `<video>` apuntando a donde dijera quien escribe la nota, y esa
 * petición saldría del navegador de todo el equipo.
 */

import {
    TOPE_DE_BYTES,
    comoSeGuardaElAdjunto,
    esUnMimeGenerico,
    laClaseDelAdjunto,
} from "@/lib/adjuntos-del-equipo";
import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";

/** La carpeta (segundo trozo de la llave) donde se guardan los adjuntos de las notas. */
export const CARPETA_DE_LAS_NOTAS = "notas-internas";

/** Cuántos archivos lleva una nota: los mismos que admite la caja de escribir. */
export const TOPE_DE_ADJUNTOS_DE_LA_NOTA = 4;

/** Lo más grande que se sube, en bytes: el mismo tope que el chat del equipo. */
export const TOPE_DE_BYTES_DE_LA_NOTA = TOPE_DE_BYTES;

export type TipoDeAdjuntoDeLaNota = "image" | "video" | "audio" | "document";

/** Un adjunto ya guardado, tal y como viaja hasta la burbuja. */
export type AdjuntoDeLaNota = {
    url: string;
    nombre: string;
    mime: string | null;
    tamano: number;
    tipo: TipoDeAdjuntoDeLaNota;
};

/** Lo que llega del navegador antes de comprobarlo. */
export type AdjuntoPedidoDeLaNota = {
    url?: string;
    nombre?: string | null;
    mime?: string | null;
    tamano?: number;
};

const EXTENSION_DE_AUDIO = /\.(mp3|m4a|aac|wav|ogg|oga|opus|amr|weba|flac)$/;

/**
 * De qué tipo es, que es lo que decide cómo se pinta: foto, reproductor de
 * video, reproductor de audio o tarjeta de documento.
 *
 * Manda el `mime`; con uno genérico o vacío manda la extensión. Equivocarse
 * hacia `document` es ofrecer una descarga, que funciona siempre; hacia
 * `image`, pintar un `<img>` roto.
 */
export function elTipoDelAdjuntoDeLaNota(adjunto: {
    mime?: string | null;
    nombre?: string | null;
    url?: string | null;
}): TipoDeAdjuntoDeLaNota {
    const mime = (adjunto.mime ?? "").toLowerCase().split(";")[0].trim();
    if (mime.startsWith("audio/")) return "audio";
    const clase = laClaseDelAdjunto(adjunto);
    if (clase === "imagen") return "image";
    if (clase === "video") return "video";
    if (esUnMimeGenerico(mime)) {
        const donde = (adjunto.nombre || adjunto.url || "").toLowerCase().split(/[?#]/)[0];
        if (EXTENSION_DE_AUDIO.test(donde)) return "audio";
    }
    return "document";
}

/**
 * La carpeta (la cuenta) en la que está subido un archivo, o `null` si la
 * dirección no es de un archivo que escribiera `/api/upload` en la carpeta de
 * las notas. Quien llama pregunta con la puerta de siempre si esa cuenta se
 * alcanza.
 */
export function laCuentaDelArchivoDeLaNota(
    url: string,
    bucket: { publicUrl: string | undefined; nombre: string },
): string | null {
    const destino = llaveDelArchivoSubido(url, bucket.publicUrl, bucket.nombre);
    if (!destino) return null;
    return destino.llave.split("/")[1] === CARPETA_DE_LAS_NOTAS ? destino.userID : null;
}

/**
 * Lo que se guarda de los adjuntos que llegan del NAVEGADOR.
 *
 * Devuelve lo bueno y **cuántos se rechazaron**: quien llama dice «no se pudo
 * adjuntar» cuando es más de cero, en vez de guardar la nota sin el archivo
 * que se creía adjunto. Pasarse de `TOPE_DE_ADJUNTOS_DE_LA_NOTA` también
 * cuenta como rechazo, no como recorte en silencio.
 */
export function comoSeGuardanLosAdjuntosDeLaNota(
    pedidos: unknown,
    bucket: { publicUrl: string | undefined; nombre: string },
): { adjuntos: AdjuntoDeLaNota[]; rechazados: number } {
    if (pedidos == null) return { adjuntos: [], rechazados: 0 };
    if (!Array.isArray(pedidos)) return { adjuntos: [], rechazados: 1 };

    const adjuntos: AdjuntoDeLaNota[] = [];
    let rechazados = 0;
    for (const pedido of pedidos as AdjuntoPedidoDeLaNota[]) {
        const limpio = comoSeGuardaElAdjunto(pedido, bucket);
        if (!limpio || !laCuentaDelArchivoDeLaNota(limpio.url, bucket)) {
            rechazados += 1;
            continue;
        }
        if (adjuntos.length >= TOPE_DE_ADJUNTOS_DE_LA_NOTA) {
            rechazados += 1;
            continue;
        }
        adjuntos.push({ ...limpio, tipo: elTipoDelAdjuntoDeLaNota(limpio) });
    }
    return { adjuntos, rechazados };
}

/** Una línea para un adjunto: lo que se lee en un aviso o en la vista previa. */
export function loQueSeLeeDeUnAdjuntoDeLaNota(adjunto: {
    tipo: TipoDeAdjuntoDeLaNota;
    nombre?: string | null;
}): string {
    if (adjunto.tipo === "image") return "🖼️ Imagen";
    if (adjunto.tipo === "video") return "🎬 Video";
    if (adjunto.tipo === "audio") return "🎙️ Audio";
    const nombre = (adjunto.nombre ?? "").trim();
    return nombre ? `📎 ${nombre}` : "📎 Archivo";
}

/**
 * El texto de una nota donde solo cabe una línea (avisos de mención, campanita).
 * Una nota que es solo un archivo tiene el texto VACÍO, y un aviso en blanco no
 * dice de qué va: sale el archivo.
 */
export function elTextoDeLaNotaParaElAviso(
    contenido: string | null | undefined,
    adjuntos: ReadonlyArray<{ tipo: TipoDeAdjuntoDeLaNota; nombre?: string | null }>,
): string {
    const texto = (contenido ?? "").trim();
    if (texto) return texto;
    if (adjuntos.length === 0) return "";
    if (adjuntos.length === 1) return loQueSeLeeDeUnAdjuntoDeLaNota(adjuntos[0]);
    return `📎 ${adjuntos.length} archivos adjuntos`;
}

/** Lo que la burbuja le da al visor del chat (`MediaRenderer`): el mismo molde que un mensaje. */
export function comoMediaDeLaBurbuja(adjunto: AdjuntoDeLaNota): {
    type: TipoDeAdjuntoDeLaNota;
    url: string;
    mimeType: string;
    fileName: string;
} {
    const porDefecto: Record<TipoDeAdjuntoDeLaNota, string> = {
        image: "image/jpeg",
        video: "video/mp4",
        audio: "audio/mpeg",
        document: "application/octet-stream",
    };
    return {
        type: adjunto.tipo,
        url: adjunto.url,
        mimeType: adjunto.mime || porDefecto[adjunto.tipo],
        fileName: adjunto.nombre,
    };
}
