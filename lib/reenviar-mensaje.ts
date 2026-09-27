/**
 * Reenviar un mensaje de una conversación a otra(s), como en WhatsApp.
 *
 * # La regla de la que cuelga todo
 *
 * > **Reenviar NO es un camino de envío nuevo.** Cada destino sale por el
 * > MISMO `sendText` del juego de acciones de SU línea —el que usa la barra de
 * > escribir—, así que pasa por la misma puerta, pausa la IA igual, se guarda
 * > igual y cuenta igual en la actividad. Aquí solo se decide QUÉ se manda.
 *
 * Con un camino propio, el día que se afine el envío (la firma, la pausa, el
 * proveedor) se afinaría en uno y el reenvío se quedaría atrás.
 *
 * # «Tal cual»
 *
 * El texto se manda con el mismo texto y la foto, el vídeo, el documento y la
 * nota de voz con el mismo archivo, su pie y su nombre. Dos cosas que un envío
 * normal hace y aquí NO:
 *
 * 1. **Sin firma del asesor** (`reenviado: true`). La firma presenta a quien
 *    ESCRIBE; un reenvío no lo escribió nadie de nuevo, y en WhatsApp un
 *    mensaje reenviado sale sin nombre delante.
 * 2. **Sin cita.** El mensaje citado es de la conversación de origen: en otra
 *    conversación apuntaría a un id que allí no existe.
 *
 * Puro a propósito: lo prueba `lib/__tests__/reenviar-mensaje.test.mjs` sin
 * levantar nada.
 */

/** Lo poco que hace falta saber de la burbuja que se reenvía. */
export type MensajeParaReenviar = {
    id: string;
    content?: string | null;
    kind?: "sticker" | "reaction" | "call" | string | null;
    media?: {
        type: string;
        url?: string | null;
        mimeType?: string | null;
        caption?: string | null;
        fileName?: string | null;
    } | null;
    /** El cliente borró el mensaje: ya no hay nada que reenviar. */
    clientDeleted?: boolean;
    /** Una nota interna no es un mensaje: no se le mandó a nadie. */
    esNota?: boolean;
};

export type TipoDeMedia = "image" | "video" | "audio" | "document";

const TIPOS_DE_MEDIA: ReadonlySet<string> = new Set(["image", "video", "audio", "document"]);

/** Lo que se va a reenviar, sin decidir todavía de dónde sale el archivo. */
export type Reenvio =
    | { kind: "text"; text: string }
    | {
          kind: "media";
          mediatype: TipoDeMedia;
          /** La dirección que trae la burbuja; puede no servir (ver `laUrlSirve`). */
          url: string | null;
          mimetype?: string;
          fileName?: string;
          caption: string;
          /** Una nota de voz se reenvía como nota de voz, no como archivo de audio. */
          ptt: boolean;
      };

/** Lo que llega al `sendText` de la línea destino. */
export type PayloadDelReenvio =
    | { kind: "text"; text: string; reenviado: true }
    | {
          kind: "media";
          mediatype: TipoDeMedia;
          mediaUrl: string;
          mimetype?: string;
          fileName?: string;
          caption: string;
          ptt: boolean;
          reenviado: true;
      };

/** Hasta cuántas conversaciones de una vez. El mismo tope que WhatsApp. */
export const TOPE_DE_DESTINOS = 5;

/** Textos que la burbuja pinta pero que no son un mensaje de nadie. */
const TEXTOS_QUE_NO_SON_MENSAJE: ReadonlySet<string> = new Set(["Mensaje eliminado"]);

/**
 * Qué se reenvía de esta burbuja, o `null` si no se puede.
 *
 * No se reenvían: llamadas, reacciones, stickers (WhatsApp los manda por otro
 * camino que aquí no existe), notas internas, lo que el cliente borró y una
 * burbuja vacía. Ofrecer «Reenviar» sobre algo que no sale es un botón que al
 * pulsarlo da error, y eso es peor que no tenerlo.
 */
export function loQueSeReenvia(mensaje: MensajeParaReenviar | null | undefined): Reenvio | null {
    if (!mensaje || mensaje.esNota || mensaje.clientDeleted) return null;
    if (mensaje.kind === "call" || mensaje.kind === "reaction" || mensaje.kind === "sticker") return null;

    const media = mensaje.media;
    if (media) {
        const tipo = String(media.type ?? "").toLowerCase();
        if (!TIPOS_DE_MEDIA.has(tipo)) return null;
        const mimetype = (media.mimeType ?? "").trim() || undefined;
        const fileName = (media.fileName ?? "").trim() || undefined;
        return {
            kind: "media",
            mediatype: tipo as TipoDeMedia,
            url: (media.url ?? "").trim() || null,
            mimetype,
            fileName,
            // El pie es el de la burbuja; si no lo trae, el texto que la
            // acompaña. Nunca los dos: saldría el mismo texto dos veces.
            caption: (media.caption ?? mensaje.content ?? "").trim(),
            // `audio/ogg; codecs=opus` es lo que graba WhatsApp: una nota de
            // voz. Un mp3 que alguien adjuntó sigue siendo un archivo.
            ptt: tipo === "audio" && /ogg|opus/i.test(mimetype ?? ""),
        };
    }

    const text = (mensaje.content ?? "").trim();
    if (!text || TEXTOS_QUE_NO_SON_MENSAJE.has(text)) return null;
    return { kind: "text", text };
}

/** ¿Tiene algo esta burbuja que se pueda reenviar? Decide si se ofrece el botón. */
export function sePuedeReenviar(mensaje: MensajeParaReenviar | null | undefined): boolean {
    return loQueSeReenvia(mensaje) !== null;
}

/**
 * ¿Sirve esta dirección para mandársela al proveedor tal cual?
 *
 * - Un `data:` con base64 dentro: sí, el envío lo sube a S3 como un adjunto.
 * - Una `https://` nuestra (la copia que guarda el backend): sí.
 * - **La de WhatsApp (`mmg.whatsapp.net`, `.enc`, un `directPath`): NO.** Va
 *   cifrada con una llave que no viaja en la dirección; mandarla es mandar un
 *   archivo que el otro teléfono no puede abrir. Hay que pedir el archivo al
 *   servidor de la línea de origen (`mediaDeUnMensajeAction`).
 */
export function laUrlSirve(url: string | null | undefined): boolean {
    const u = (url ?? "").trim();
    if (!u) return false;
    if (/^data:[^;,]+;base64,./i.test(u)) return true;
    if (!/^https?:\/\//i.test(u)) return false;
    if (/whatsapp\.net/i.test(u)) return false;
    if (/\.enc(\?|$)/i.test(u)) return false;
    return true;
}

/**
 * El payload que sale hacia la línea destino.
 *
 * `archivo` es la dirección ya resuelta (la de la burbuja si sirve, o el base64
 * que devolvió la línea de origen). Sin archivo que sirva no hay payload: se
 * devuelve `null` y quien llama lo dice, en vez de mandar un adjunto vacío.
 */
export function elPayloadDelReenvio(reenvio: Reenvio, archivo?: string | null): PayloadDelReenvio | null {
    if (reenvio.kind === "text") return { kind: "text", text: reenvio.text, reenviado: true };
    const mediaUrl = laUrlSirve(archivo) ? String(archivo).trim() : laUrlSirve(reenvio.url) ? String(reenvio.url).trim() : null;
    if (!mediaUrl) return null;
    return {
        kind: "media",
        mediatype: reenvio.mediatype,
        mediaUrl,
        ...(reenvio.mimetype ? { mimetype: reenvio.mimetype } : {}),
        ...(reenvio.fileName ? { fileName: reenvio.fileName } : {}),
        caption: reenvio.caption,
        ptt: reenvio.ptt,
        reenviado: true,
    };
}

/** Una conversación a la que se puede reenviar. */
export type DestinoDelReenvio = {
    /** La línea por la que sale: la de la conversación, nunca otra. */
    linea: string;
    remoteJid: string;
    nombre: string;
    /** Solo dígitos o el número ya formateado: lo que se enseña y se busca. */
    numero?: string;
};

/** La llave de una conversación: el mismo contacto en dos líneas son dos. */
export function llaveDelDestino(destino: Pick<DestinoDelReenvio, "linea" | "remoteJid">): string {
    return `${destino.linea}::${destino.remoteJid}`;
}

/**
 * Los destinos que de verdad se van a usar: sin repetidos, sin la conversación
 * de origen y con el tope. Lo que llegue de más se RECORTA y no se manda: la
 * pantalla ya no deja marcar más, así que llegar aquí con más es un fallo suyo.
 */
export function losDestinosDelReenvio(
    elegidos: readonly DestinoDelReenvio[],
    origen?: Pick<DestinoDelReenvio, "linea" | "remoteJid"> | null,
): DestinoDelReenvio[] {
    const vistos = new Set<string>();
    const llaveDelOrigen = origen ? llaveDelDestino(origen) : null;
    const salida: DestinoDelReenvio[] = [];
    for (const d of elegidos) {
        const linea = (d.linea ?? "").trim();
        const remoteJid = (d.remoteJid ?? "").trim();
        if (!linea || !remoteJid) continue;
        const llave = llaveDelDestino({ linea, remoteJid });
        if (llave === llaveDelOrigen || vistos.has(llave)) continue;
        vistos.add(llave);
        salida.push({ ...d, linea, remoteJid });
        if (salida.length >= TOPE_DE_DESTINOS) break;
    }
    return salida;
}

function sinAcentos(texto: string): string {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * ¿Casa esta conversación con lo que se busca?
 *
 * Por nombre, sin acentos ni mayúsculas —«maria» encuentra a «María»—, y por
 * número comparando SOLO dígitos: «300 123» encuentra `573001234567`.
 */
export function pasaLaBusqueda(destino: DestinoDelReenvio, busqueda: string): boolean {
    const q = sinAcentos(busqueda.trim());
    if (!q) return true;
    if (sinAcentos(destino.nombre ?? "").includes(q)) return true;
    const digitosBuscados = q.replace(/\D/g, "");
    if (!digitosBuscados) return false;
    const digitos = `${destino.numero ?? ""}${destino.remoteJid}`.replace(/\D/g, "");
    return digitos.includes(digitosBuscados);
}

/** Cómo le fue a cada destino. */
export type ResultadoDelReenvio = { destino: DestinoDelReenvio; ok: boolean; motivo?: string };

/**
 * Lo que se le dice a quien pulsó «Reenviar».
 *
 * Nombra lo que falló y por qué: «se reenvió» sobre tres de las que salieron
 * dos es peor que un error, porque nadie vuelve a mirar la tercera.
 */
export function elResumenDelReenvio(resultados: readonly ResultadoDelReenvio[]): {
    tono: "ok" | "parcial" | "error";
    texto: string;
} {
    const bien = resultados.filter((r) => r.ok).length;
    const mal = resultados.filter((r) => !r.ok);
    if (resultados.length === 0) return { tono: "error", texto: "No se eligió ninguna conversación." };
    if (mal.length === 0) {
        return {
            tono: "ok",
            texto: bien === 1 ? `Reenviado a ${resultados[0].destino.nombre}.` : `Reenviado a ${bien} conversaciones.`,
        };
    }
    const fallos = mal.map((r) => `${r.destino.nombre}${r.motivo ? `: ${r.motivo}` : ""}`).join(" · ");
    if (bien === 0) return { tono: "error", texto: `No se pudo reenviar. ${fallos}` };
    return { tono: "parcial", texto: `Reenviado a ${bien} de ${resultados.length}. No salió en ${fallos}` };
}
