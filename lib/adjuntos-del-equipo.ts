/**
 * Los adjuntos del chat del equipo: imágenes, videos y archivos.
 *
 * Puro a propósito, como el resto de lo que decide algo en esta pantalla: de
 * aquí tiran la acción —que es servidor—, la burbuja —que es navegador— y el
 * banco. Lo que toca la base vive en `lib/chat-de-equipo-db.ts`.
 *
 * # UN adjunto por mensaje, y varios archivos son varios mensajes
 *
 * Es la decisión de fondo y conviene no deshacerla. La fila de un mensaje ya
 * guarda su nota de voz así —dirección, duración y formato en columnas—, y la
 * consulta del reloj se trae **la página entera cada cinco segundos**: una
 * tabla aparte de adjuntos sería una segunda consulta en ese camino, y una
 * columna con una lista dentro sería un dato que no se puede buscar ni contar.
 *
 * Así que elegir tres fotos manda **tres mensajes**, que además es lo que hace
 * WhatsApp: cada foto su burbuja. El texto que se haya escrito va con el
 * PRIMERO —es su pie— y los demás salen sin él; si fuera con todos, la misma
 * frase saldría repetida tres veces, y si no fuera con ninguno se perdería lo
 * que se acababa de escribir.
 *
 * Y de ahí sale gratis lo otro: las menciones se calculan sobre el texto, así
 * que solo el primero avisa. Con el texto repetido en los tres, la misma
 * mención habría hecho saltar la ventana que interrumpe tres veces.
 */

import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";

/**
 * Lo más grande que se deja subir, en bytes.
 *
 * No es un límite del bucket ni de WhatsApp —esto no sale a WhatsApp—: es el
 * tamaño por encima del cual una subida deja de parecer una subida. 25 MB son
 * unos segundos con una conexión normal; con 200 MB la barra se queda quieta,
 * la persona vuelve a pulsar y el bucket se llena de copias.
 *
 * Se comprueba **en el navegador y en el servidor**: en el navegador para
 * poder decirlo antes de empezar a subir, y en el servidor porque lo que llega
 * de fuera no decide lo que se guarda.
 */
export const TOPE_DE_BYTES = 25 * 1024 * 1024;

/** Cuántos archivos se pueden elegir de una vez. */
export const TOPE_DE_ARCHIVOS = 10;

/** Un adjunto ya guardado, tal y como viaja hasta la burbuja. */
export type AdjuntoDelEquipo = {
    /** Dónde está, en nuestro bucket. */
    url: string;
    /** Cómo se llamaba el fichero. Es lo que se enseña y lo que se descarga. */
    nombre: string;
    /** Para decidir si se pinta, se reproduce o se descarga. */
    mime: string | null;
    /** Cuánto pesa. `0` es «no se sabe», que es lo que traen los de antes. */
    tamano: number;
};

/** Qué clase de adjunto es, que es lo que decide cómo se pinta. */
export type ClaseDeAdjunto = "imagen" | "video" | "archivo";

/**
 * De qué clase es, mirando el `mime` y cayendo al nombre.
 *
 * El `mime` manda porque es lo que dijo el navegador al subirlo. Pero puede
 * venir vacío —un fichero sin extensión conocida, una subida vieja— y entonces
 * se mira la extensión: equivocarse hacia `archivo` es ofrecer una descarga,
 * que funciona siempre; equivocarse hacia `imagen` es pintar un `<img>` roto.
 */
export function laClaseDelAdjunto(adjunto: {
    mime?: string | null;
    nombre?: string | null;
    url?: string | null;
}): ClaseDeAdjunto {
    const mime = (adjunto.mime ?? "").toLowerCase();
    if (mime.startsWith("image/")) return "imagen";
    if (mime.startsWith("video/")) return "video";
    if (mime) return "archivo";

    const donde = (adjunto.nombre || adjunto.url || "").toLowerCase().split(/[?#]/)[0];
    if (/\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/.test(donde)) return "imagen";
    if (/\.(mp4|webm|mov|m4v|ogv)$/.test(donde)) return "video";
    return "archivo";
}

/**
 * Cuánto pesa, en palabras.
 *
 * Se pinta al lado del nombre porque un archivo sin tamaño es un archivo que
 * no se sabe si merece la pena abrir con datos del móvil. `0` no se enseña: es
 * «no se sabe», y un «0 B» diría que el archivo está vacío.
 */
export function comoSeLeeElTamano(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/**
 * Lo que se lee de un adjunto donde solo cabe una línea.
 *
 * Hacen falta **tres sitios** y por eso es una función: el aviso que
 * interrumpe, el empuje al teléfono y el extracto de una cita. En los tres, un
 * mensaje que solo lleva una foto tiene el texto **vacío**, y un aviso en
 * blanco no dice ni quién escribió ni de qué — que es el fallo del que viene
 * toda esta familia de reglas.
 */
export function loQueSeLeeDeUnAdjunto(adjunto: {
    mime?: string | null;
    nombre?: string | null;
    url?: string | null;
}): string {
    const clase = laClaseDelAdjunto(adjunto);
    if (clase === "imagen") return "🖼️ Imagen";
    if (clase === "video") return "🎬 Video";
    const nombre = (adjunto.nombre ?? "").trim();
    return nombre ? `📎 ${nombre}` : "📎 Archivo";
}

/** El nombre, recortado para que quepa sin tapar la burbuja. */
export function comoSeLeeElNombre(nombre: string, tope = 40): string {
    const limpio = (nombre ?? "").trim();
    if (limpio.length <= tope) return limpio;
    // Se recorta por el MEDIO y no por el final: la extensión es la mitad de
    // lo que se mira en el nombre de un archivo, y cortando por detrás
    // desaparece justo esa mitad.
    const extension = /\.[a-z0-9]{1,8}$/i.exec(limpio)?.[0] ?? "";
    const cuerpo = limpio.slice(0, limpio.length - extension.length);
    const dejar = Math.max(4, tope - extension.length - 1);
    return `${cuerpo.slice(0, dejar)}…${extension}`;
}

/**
 * Lo que se guarda de un adjunto que llega del NAVEGADOR.
 *
 * Devuelve `null` —no hay adjunto— salvo que la dirección sea de **nuestro**
 * bucket y con la forma exacta que escribe `/api/upload`. Lo decide
 * `llaveDelArchivoSubido`, la misma función que ya guarda la ruta que borra del
 * bucket y que valida la nota de voz: **una sola regla sobre qué direcciones
 * son nuestras**, no tres.
 *
 * Sin eso la burbuja pintaría un `<img>` —o peor, un `<video>`— apuntando a
 * donde le dijeran: una petición que sale del navegador de todo el equipo con
 * el destino elegido por quien manda el mensaje.
 *
 * Y el resto se acota porque **son datos que se pintan**:
 *
 * - El **nombre** se queda sin saltos de línea ni rutas. Un nombre con `\n`
 *   dentro rompe la fila de la tarjeta, y uno con `../` delante se lee como
 *   una ruta que no es.
 * - El **mime** solo decide cómo se pinta, así que basta con que lo parezca.
 * - El **tamaño** es informativo: un número imposible se deja en `0`, que es
 *   exactamente «no se sabe» y no se enseña.
 */
export function comoSeGuardaElAdjunto(
    pedido:
        | { url?: string; nombre?: string | null; mime?: string | null; tamano?: number }
        | null
        | undefined,
    bucket: { publicUrl: string | undefined; nombre: string },
): AdjuntoDelEquipo | null {
    const url = (pedido?.url ?? "").trim();
    if (!url) return null;
    if (!llaveDelArchivoSubido(url, bucket.publicUrl, bucket.nombre)) return null;

    const crudo = (pedido?.nombre ?? "").replace(/[\r\n\t]+/g, " ").trim();
    // El nombre se queda con el último trozo: lo que llega puede traer una
    // ruta entera del equipo de quien subió, y eso ni se enseña ni hace falta.
    const nombre = (crudo.split(/[/\\]/).pop() ?? "").slice(0, 120).trim() || "archivo";

    const mime = (pedido?.mime ?? "").trim();
    const tamanoCrudo = Number(pedido?.tamano);
    const tamano =
        Number.isFinite(tamanoCrudo) && tamanoCrudo > 0
            ? Math.min(Math.floor(tamanoCrudo), TOPE_DE_BYTES)
            : 0;

    return {
        url,
        nombre,
        // Solo se guarda si parece un tipo de medio: `tipo/subtipo`, sin
        // espacios y sin nada raro. No decide ningún permiso —solo si la
        // burbuja pinta una foto, un reproductor o una tarjeta—, así que no
        // hace falta una lista cerrada; lo que no encaje sale como `archivo`,
        // que ofrece una descarga y esa funciona siempre.
        mime: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime) ? mime.slice(0, 120) : null,
        tamano,
    };
}
