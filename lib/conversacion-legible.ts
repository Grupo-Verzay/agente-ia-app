/**
 * Una conversación en TEXTO LEGIBLE, para llevársela a otro lado.
 *
 * Es el formato de «Exportar chat» de WhatsApp —una línea por mensaje, con su
 * fecha, su hora y quién lo dijo— porque es el que la gente ya sabe leer y el
 * que cualquier programa abre: un `.txt` en UTF-8, sin nada que instalar.
 *
 *     27/09/2026, 14:05 - Juan Pérez: Hola, ¿tienen envíos a Cali?
 *     27/09/2026, 14:06 - Agente IA: ¡Hola Juan! Sí, enviamos a todo el país.
 *
 * **Es puro, y lo usan las DOS pantallas**: Chats (una conversación o varias
 * en lote) y Correo (un correo o los de la lista). Con el formato escrito en
 * cada una, el día que se afine la fecha o el nombre del archivo se afina en
 * una y la otra se queda atrás, y eso no se ve como un error: se ve como dos
 * exportaciones de la misma plataforma que no se parecen.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Las notas internas NO salen.** Son del equipo, no del cliente, y esto
 *    se exporta justamente para dárselo a alguien. Una nota interna que acaba
 *    en el correo del cliente no se deshace.
 * 2. **Lo que no es texto se nombra, no se esconde**: «<Imagen>», «<Nota de
 *    voz>», con su enlace cuando lo hay y su transcripción cuando la hay. Un
 *    hueco en la conversación se lee como un mensaje perdido.
 * 3. **La fecha va con la zona que se le pase**, nunca con la del servidor a
 *    ciegas: el archivo lo lee una persona, y las 14:05 de su conversación son
 *    las 14:05 de su reloj.
 */

export type QuienHabla = "contacto" | "asesor" | "ia";

export interface MensajeLegible {
    /** Segundos desde 1970 (como `messageTimestamp`). */
    ts: number;
    quien: QuienHabla;
    /** El texto del mensaje, o el pie de foto de un adjunto. */
    texto: string;
    /** `imageMessage`, `audioMessage`… o `conversation` para el texto. */
    tipo: string;
    mediaUrl?: string | null;
    transcripcion?: string | null;
    eliminado?: boolean;
    notaInterna?: boolean;
    /** Nombre del documento, cuando el adjunto trae uno. */
    nombreDelArchivo?: string | null;
    /** Duración de una nota de voz, en segundos, cuando se sabe. */
    segundos?: number | null;
    /**
     * Quién lo escribió cuando no basta con «el contacto»: en un grupo cada
     * mensaje entrante es de una persona distinta.
     */
    autor?: string | null;
}

/**
 * Un mensaje tal como lo devuelve el lector de la base
 * (`persistedRowToEvolutionMessage`) pasado a lo que se exporta y se evalúa.
 * Se tipa por lo que se lee y nada más, para que esto siga siendo puro.
 */
export function aMensajeLegible(ev: any, opciones?: { esGrupo?: boolean }): MensajeLegible {
    const cuerpo = (ev?.message ?? {}) as Record<string, any>;
    const fromMe = Boolean(ev?.key?.fromMe);
    const texto =
        cuerpo.conversation ||
        cuerpo.extendedTextMessage?.text ||
        cuerpo.imageMessage?.caption ||
        cuerpo.videoMessage?.caption ||
        cuerpo.documentMessage?.caption ||
        cuerpo.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        "";
    const ts = Number(ev?.messageTimestamp);
    return {
        ts: Number.isFinite(ts) ? (ts > 1e12 ? Math.floor(ts / 1000) : ts) : 0,
        quien: fromMe ? (ev?.sentByAi ? "ia" : "asesor") : "contacto",
        texto: typeof texto === "string" ? texto : "",
        tipo: typeof ev?.messageType === "string" ? ev.messageType : "conversation",
        mediaUrl: typeof cuerpo.mediaUrl === "string" ? cuerpo.mediaUrl : null,
        transcripcion: typeof ev?.transcripcion === "string" ? ev.transcripcion : null,
        eliminado: Boolean(ev?.clientDeleted),
        notaInterna: Boolean(ev?.notaInterna),
        nombreDelArchivo:
            cuerpo.documentMessage?.fileName ||
            cuerpo.documentWithCaptionMessage?.message?.documentMessage?.fileName ||
            null,
        segundos:
            typeof ev?.audioSegundos === "number" && Number.isFinite(ev.audioSegundos) && ev.audioSegundos > 0
                ? Math.round(ev.audioSegundos)
                : null,
        autor: opciones?.esGrupo && !fromMe && typeof ev?.pushName === "string" ? ev.pushName : null,
    };
}

/** El tope de mensajes por conversación exportada. Por encima se dice. */
export const TOPE_DE_MENSAJES_POR_CONVERSACION = 10_000;

/** El tope de conversaciones en un lote. Por encima se recortan y se dice. */
export const TOPE_DE_CONVERSACIONES_POR_LOTE = 50;

export const NOMBRE_DEL_TIPO: Record<string, string> = {
    imageMessage: "Imagen",
    videoMessage: "Video",
    audioMessage: "Nota de voz",
    pttMessage: "Nota de voz",
    documentMessage: "Documento",
    documentWithCaptionMessage: "Documento",
    stickerMessage: "Sticker",
    locationMessage: "Ubicación",
    liveLocationMessage: "Ubicación en vivo",
    contactMessage: "Contacto",
    contactsArrayMessage: "Contactos",
    call: "Llamada",
};

export const TIPOS_DE_TEXTO = new Set(["conversation", "extendedTextMessage", "text", ""]);

/** Quién firma cada línea. */
export function nombreDeQuienHabla(
    quien: QuienHabla,
    nombres: { contacto: string; asesor: string },
): string {
    if (quien === "ia") return "Agente IA";
    if (quien === "asesor") return nombres.asesor || "Asesor";
    return nombres.contacto || "Contacto";
}

function dosCifras(n: number): string {
    return String(n).padStart(2, "0");
}

/**
 * «27/09/2026, 14:05». Se arma a mano sobre las partes que da `Intl` para que
 * salga igual en cualquier Node y cualquier navegador: `toLocaleString` a secas
 * cambia de forma entre versiones y entre idiomas del sistema.
 */
export function laFechaDeLaLinea(ts: number, zonaHoraria?: string): string {
    const fecha = new Date(ts * 1000);
    if (Number.isNaN(fecha.getTime())) return "";
    try {
        const partes = new Intl.DateTimeFormat("en-GB", {
            timeZone: zonaHoraria || undefined,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).formatToParts(fecha);
        const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
        const hora = v("hour") === "24" ? "00" : v("hour");
        return `${v("day")}/${v("month")}/${v("year")}, ${hora}:${v("minute")}`;
    } catch {
        // Una zona que el motor no conoce no puede dejar el archivo sin fechas.
        return `${dosCifras(fecha.getUTCDate())}/${dosCifras(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}, ${dosCifras(fecha.getUTCHours())}:${dosCifras(fecha.getUTCMinutes())}`;
    }
}

/** El cuerpo de UNA línea, sin fecha ni nombre. */
export function elCuerpoDelMensaje(m: MensajeLegible): string {
    if (m.eliminado) return "Se eliminó este mensaje.";
    const texto = (m.texto ?? "").trim();
    const tipo = m.tipo ?? "";
    if (TIPOS_DE_TEXTO.has(tipo)) return texto;

    const nombre = NOMBRE_DEL_TIPO[tipo] ?? "Adjunto";
    const partes = [`<${nombre}${m.nombreDelArchivo ? `: ${m.nombreDelArchivo}` : ""}>`];
    if (m.mediaUrl && /^https?:\/\//i.test(m.mediaUrl)) partes.push(m.mediaUrl);
    if (texto) partes.push(texto);
    if (m.transcripcion?.trim()) partes.push(`(Transcripción: ${m.transcripcion.trim()})`);
    return partes.join(" ");
}

/**
 * Lo que se exporta de una conversación: sin notas internas, sin vacíos, y en
 * orden de fecha. El orden se pone aquí y no se da por bueno: el lector lee
 * de lo más nuevo a lo más viejo, que es al revés de como se lee un chat.
 */
export function losMensajesQueSeExportan(mensajes: MensajeLegible[]): MensajeLegible[] {
    return mensajes
        .filter((m) => !m.notaInterna)
        .filter((m) => Number.isFinite(m.ts) && m.ts > 0)
        .filter((m) => elCuerpoDelMensaje(m) !== "")
        .slice()
        .sort((a, b) => a.ts - b.ts);
}

export interface ConversacionParaExportar {
    contacto: string;
    numero?: string | null;
    linea?: string | null;
    mensajes: MensajeLegible[];
    /** El asesor o la cuenta que firma lo que sale sin ser de la IA. */
    nombreDelAsesor?: string | null;
    /** Si la conversación tenía más mensajes de los que caben. */
    recortada?: boolean;
}

/** El archivo entero de una conversación, cabecera incluida. */
export function formatearConversacion(
    c: ConversacionParaExportar,
    opciones: { exportadaEn: Date; zonaHoraria?: string },
): string {
    const nombres = { contacto: c.contacto, asesor: c.nombreDelAsesor || c.linea || "Asesor" };
    const firma = (m: MensajeLegible) =>
        m.quien === "contacto" && m.autor?.trim() ? m.autor.trim() : nombreDeQuienHabla(m.quien, nombres);
    const mensajes = losMensajesQueSeExportan(c.mensajes);
    const cabecera = [
        `Conversación con ${c.contacto}${c.numero ? ` (${c.numero})` : ""}`,
        c.linea ? `Línea: ${c.linea}` : null,
        `Exportada el ${laFechaDeLaLinea(Math.floor(opciones.exportadaEn.getTime() / 1000), opciones.zonaHoraria)}`,
        `${mensajes.length} mensaje${mensajes.length === 1 ? "" : "s"}`,
        c.recortada
            ? `Aviso: la conversación tiene más de ${TOPE_DE_MENSAJES_POR_CONVERSACION} mensajes; aquí van los ${TOPE_DE_MENSAJES_POR_CONVERSACION} más recientes.`
            : null,
    ].filter(Boolean);

    const lineas = mensajes.map(
        (m) =>
            `${laFechaDeLaLinea(m.ts, opciones.zonaHoraria)} - ${firma(m)}: ${elCuerpoDelMensaje(m)}`,
    );
    return [...cabecera, "", ...(lineas.length ? lineas : ["(sin mensajes guardados)"]), ""].join("\n");
}

/** Lo mínimo de un correo para exportarlo. Coincide con `CorreoCompleto`. */
export interface CorreoParaExportar {
    de: string;
    deDireccion?: string | null;
    para?: string | null;
    cc?: string | null;
    asunto: string;
    fecha: string | null;
    texto: string | null;
    html?: string | null;
    adjuntos?: { nombre: string }[];
}

/**
 * El texto de un correo que solo trae HTML. Quita etiquetas, estilos y
 * guiones; convierte los saltos de bloque en saltos de línea. No pretende ser
 * un navegador: pretende que el archivo se pueda leer.
 */
export function elTextoDelHtml(html: string): string {
    return html
        .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function formatearCorreo(
    c: CorreoParaExportar,
    opciones: { exportadaEn: Date; zonaHoraria?: string },
): string {
    const fechaTs = c.fecha ? Math.floor(new Date(c.fecha).getTime() / 1000) : NaN;
    const cuerpo = (c.texto && c.texto.trim()) || (c.html ? elTextoDelHtml(c.html) : "");
    const de = c.deDireccion && c.deDireccion !== c.de ? `${c.de} <${c.deDireccion}>` : c.de;
    return [
        `Asunto: ${c.asunto || "(sin asunto)"}`,
        `De: ${de}`,
        c.para ? `Para: ${c.para}` : null,
        c.cc ? `Cc: ${c.cc}` : null,
        `Fecha: ${Number.isFinite(fechaTs) ? laFechaDeLaLinea(fechaTs, opciones.zonaHoraria) : "(sin fecha)"}`,
        c.adjuntos?.length ? `Adjuntos: ${c.adjuntos.map((a) => a.nombre).join(", ")}` : null,
        `Exportado el ${laFechaDeLaLinea(Math.floor(opciones.exportadaEn.getTime() / 1000), opciones.zonaHoraria)}`,
        "",
        cuerpo || "(sin texto)",
        "",
    ]
        .filter((l) => l !== null)
        .join("\n");
}

/**
 * Un nombre de archivo que abre en cualquier sistema: sin barras, sin dos
 * puntos, sin caracteres de control, y corto. Los acentos se quedan: el zip
 * marca sus nombres como UTF-8.
 */
export function unNombreDeArchivo(base: string, extension = "txt"): string {
    const limpio = (base || "conversacion")
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
        .trim();
    return `${limpio || "conversacion"}.${extension}`;
}

export function elNombreDelArchivoDelChat(contacto: string, numero?: string | null): string {
    const quien = contacto?.trim() || numero?.trim() || "contacto";
    return unNombreDeArchivo(`Chat con ${quien}`);
}

export function elNombreDelArchivoDelCorreo(asunto: string, fecha?: string | null): string {
    const dia = fecha && !Number.isNaN(new Date(fecha).getTime()) ? new Date(fecha).toISOString().slice(0, 10) : "";
    return unNombreDeArchivo(`${dia ? `${dia} ` : ""}${asunto?.trim() || "Correo sin asunto"}`);
}

/**
 * Dentro de un zip dos archivos no pueden llamarse igual: el segundo pisaría
 * al primero al descomprimir. Dos contactos que se llaman «Juan» dan «Chat con
 * Juan.txt» y «Chat con Juan (2).txt».
 */
export function sinNombresRepetidos<T extends { nombre: string }>(archivos: T[]): T[] {
    const vistos = new Map<string, number>();
    return archivos.map((a) => {
        const clave = a.nombre.toLowerCase();
        const n = (vistos.get(clave) ?? 0) + 1;
        vistos.set(clave, n);
        if (n === 1) return a;
        const punto = a.nombre.lastIndexOf(".");
        const nombre =
            punto > 0 ? `${a.nombre.slice(0, punto)} (${n})${a.nombre.slice(punto)}` : `${a.nombre} (${n})`;
        return { ...a, nombre };
    });
}
