/**
 * Una conversación de Chats en PDF, con la forma de un chat de WhatsApp:
 * burbujas a la izquierda para lo que escribió el contacto y a la derecha para
 * lo que salió de la cuenta (asesor o Agente IA), separadores de día, la hora
 * dentro de cada burbuja, y en la cabecera el logo y el nombre del negocio.
 *
 * **Lo que sale es EXACTAMENTE lo mismo que en el `.txt`**: los mensajes pasan
 * por `losMensajesQueSeExportan`, la misma función que filtra el texto plano
 * (sin notas internas, sin vacíos, en orden de fecha) y la firma sale de
 * `nombreDeQuienHabla`. Son dos formas de pintar una sola lista; con dos
 * filtros, el PDF y el texto de la misma conversación dirían cosas distintas.
 *
 * No toca la red ni la base: las imágenes y el logo llegan ya descargados
 * (`imagenes`, `marca.logo`), así que esto se puede probar sin levantar nada.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Lo que no es texto se DIBUJA, no se esconde.** Una imagen de nuestro
 *    almacenamiento va incrustada; un video, una nota de voz o un documento
 *    van como tarjeta con su icono, su nombre, su duración o su transcripción,
 *    y el enlace pulsable cuando lo hay. Un hueco se lee como un mensaje
 *    perdido.
 * 2. **Las fuentes estándar de PDF solo saben WinAnsi.** Un emoji o un
 *    carácter fuera de esa tabla haría que `pdf-lib` lance y el PDF entero no
 *    saliera. `aTextoImprimible` los quita antes de medir y de dibujar; un
 *    mensaje que solo era emoji dice «(emoji)», nunca sale vacío.
 * 3. **Una burbuja más alta que una página se PARTE**, no se corta: sus
 *    líneas siguen en la página siguiente con la misma forma.
 */
import {
    PDFDocument,
    PDFString,
    StandardFonts,
    rgb,
    type PDFFont,
    type PDFImage,
    type PDFPage,
    type RGB,
} from "pdf-lib";
import {
    NOMBRE_DEL_TIPO,
    TIPOS_DE_TEXTO,
    TOPE_DE_MENSAJES_POR_CONVERSACION,
    laFechaDeLaLinea,
    losMensajesQueSeExportan,
    nombreDeQuienHabla,
    type ConversacionParaExportar,
    type MensajeLegible,
} from "@/lib/conversacion-legible";

/* ------------------------------------------------------------------------ */
/* Medidas y colores                                                        */
/* ------------------------------------------------------------------------ */

/** A4 en puntos. */
export const ANCHO_DE_PAGINA = 595.28;
export const ALTO_DE_PAGINA = 841.89;
export const MARGEN = 32;
/** Una burbuja no pasa de este porcentaje del ancho útil, como en WhatsApp. */
export const PROPORCION_DE_LA_BURBUJA = 0.72;
const RELLENO = 8;
const TAMANO_DEL_TEXTO = 10;
const INTERLINEADO = 13;
const TAMANO_PEQUENO = 7.5;
const ALTO_DEL_PIE = 22;
const ALTO_DE_LA_CABECERA = 86;
/** Lo más alto que se pinta una imagen dentro de una burbuja. */
export const ALTO_MAXIMO_DE_IMAGEN = 220;

const hex = (h: string): RGB => {
    const n = Number.parseInt(h.replace("#", ""), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export const COLORES = {
    fondo: "#EFEAE2",
    cabecera: "#008069",
    entrante: "#FFFFFF",
    asesor: "#D9FDD3",
    ia: "#E7F0FE",
    texto: "#111B21",
    tenue: "#667781",
    enlace: "#027EB5",
    tarjeta: "#F0F2F5",
    separador: "#E1F2FB",
} as const;

/**
 * El color de la burbuja según quién habló. Entrantes en blanco a la
 * izquierda; lo del asesor en el verde de WhatsApp a la derecha; lo del Agente
 * IA a la derecha también —salió de la cuenta— pero en azul, para que se
 * distinga de un vistazo qué escribió una persona y qué la IA.
 */
export function elLadoYElColor(quien: MensajeLegible["quien"]): { lado: "izquierda" | "derecha"; color: string } {
    if (quien === "contacto") return { lado: "izquierda", color: COLORES.entrante };
    if (quien === "ia") return { lado: "derecha", color: COLORES.ia };
    return { lado: "derecha", color: COLORES.asesor };
}

/* ------------------------------------------------------------------------ */
/* Texto                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Lo que las fuentes estándar de PDF (WinAnsi) saben pintar. Cubre el español
 * entero —tildes, eñes, ¿¡, comillas tipográficas, el euro— y deja fuera los
 * emojis. Se calcula una vez desde la propia tabla de `pdf-lib`.
 */
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function esImprimible(c: string): boolean {
    const cp = c.codePointAt(0) ?? 0;
    if (cp === 0x0a) return true;
    if (cp >= 0x20 && cp <= 0x7e) return true;
    if (cp >= 0xa0 && cp <= 0xff) return true;
    return WINANSI_EXTRA.includes(c);
}

/**
 * El texto listo para dibujar. Los tabuladores son espacios, los retornos de
 * Windows se van, los espacios raros (no separables, finos) son espacios, y lo
 * que no se puede pintar se quita. Si no queda nada de algo que sí tenía
 * contenido —un mensaje que era solo emoji— dice «(emoji)».
 */
export function aTextoImprimible(texto: string): string {
    const original = (texto ?? "").normalize("NFC");
    const limpio = soloLoImprimible(original);
    if (!limpio.trim() && original.trim()) return "(emoji)";
    return limpio;
}

function soloLoImprimible(original: string): string {
    return Array.from(
        original
            .replace(/\r\n?/g, "\n")
            .replace(/\t/g, "    ")
            .replace(/[ -   　]/g, " ")
            .replace(/[‐‑‒]/g, "-")
            .replace(/[​-‍⁠️︎]/g, ""),
    )
        .filter(esImprimible)
        .join("")
        .replace(/[ ]{2,}/g, " ");
}

/**
 * Parte un texto en líneas que caben en `ancho`, respetando los saltos que ya
 * trae. Una palabra más larga que la línea —un enlace, un número de guía— se
 * corta por letras: si no, se saldría de la burbuja.
 */
export function envolverTexto(
    texto: string,
    ancho: number,
    medir: (s: string) => number,
): string[] {
    const salida: string[] = [];
    for (const parrafo of texto.split("\n")) {
        if (!parrafo) {
            salida.push("");
            continue;
        }
        let linea = "";
        for (const palabra of parrafo.split(" ")) {
            const candidato = linea ? `${linea} ${palabra}` : palabra;
            if (medir(candidato) <= ancho) {
                linea = candidato;
                continue;
            }
            if (linea) salida.push(linea);
            if (medir(palabra) <= ancho) {
                linea = palabra;
                continue;
            }
            // La palabra sola no cabe: por letras.
            let trozo = "";
            for (const letra of Array.from(palabra)) {
                if (medir(trozo + letra) > ancho && trozo) {
                    salida.push(trozo);
                    trozo = letra;
                } else {
                    trozo += letra;
                }
            }
            linea = trozo;
        }
        salida.push(linea);
    }
    // Sin líneas en blanco al final: se comen el alto de la burbuja.
    while (salida.length > 1 && salida[salida.length - 1] === "") salida.pop();
    return salida;
}

/** «0:23», «12:05», «1:02:10». */
export function laDuracion(segundos: number | null | undefined): string | null {
    if (!segundos || !Number.isFinite(segundos) || segundos <= 0) return null;
    const s = Math.round(segundos);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** Hasta dos iniciales, para el logo de una cuenta que no subió ninguno. */
export function lasIniciales(nombre: string): string {
    const palabras = soloLoImprimible((nombre ?? "").normalize("NFC"))
        .replace(/[^\p{L}\p{N} ]+/gu, " ")
        .split(/\s+/)
        .filter(Boolean);
    const iniciales = palabras.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
    return iniciales || "?";
}

/* ------------------------------------------------------------------------ */
/* Qué pieza lleva cada mensaje                                             */
/* ------------------------------------------------------------------------ */

export type PiezaDelMensaje =
    | { clase: "texto" }
    | { clase: "eliminado" }
    | { clase: "imagen"; url: string }
    | {
          clase: "tarjeta";
          icono: "imagen" | "video" | "audio" | "documento" | "ubicacion" | "contacto" | "llamada" | "adjunto";
          titulo: string;
          detalle: string | null;
          enlace: string | null;
      };

const ICONO_DEL_TIPO: Record<string, Extract<PiezaDelMensaje, { clase: "tarjeta" }>["icono"]> = {
    imageMessage: "imagen",
    stickerMessage: "imagen",
    videoMessage: "video",
    audioMessage: "audio",
    pttMessage: "audio",
    documentMessage: "documento",
    documentWithCaptionMessage: "documento",
    locationMessage: "ubicacion",
    liveLocationMessage: "ubicacion",
    contactMessage: "contacto",
    contactsArrayMessage: "contacto",
    call: "llamada",
};

function esEnlace(url: string | null | undefined): url is string {
    return typeof url === "string" && /^https?:\/\//i.test(url);
}

/**
 * La pieza que dibuja un mensaje. Una imagen solo se incrusta si llegó
 * descargada (`hayImagen`): el servidor solo baja las de NUESTRO
 * almacenamiento, y una que no se pudo bajar sale como tarjeta con su enlace,
 * que es lo que el `.txt` ya decía.
 */
export function laPiezaDelMensaje(m: MensajeLegible, hayImagen: (url: string) => boolean): PiezaDelMensaje {
    if (m.eliminado) return { clase: "eliminado" };
    const tipo = m.tipo ?? "";
    if (TIPOS_DE_TEXTO.has(tipo)) return { clase: "texto" };

    const icono = ICONO_DEL_TIPO[tipo] ?? "adjunto";
    if (icono === "imagen" && esEnlace(m.mediaUrl) && hayImagen(m.mediaUrl)) {
        return { clase: "imagen", url: m.mediaUrl };
    }
    const nombre = NOMBRE_DEL_TIPO[tipo] ?? "Adjunto";
    const duracion = icono === "audio" ? laDuracion(m.segundos) : null;
    return {
        clase: "tarjeta",
        icono,
        titulo: m.nombreDelArchivo?.trim() ? `${nombre}: ${m.nombreDelArchivo.trim()}` : nombre,
        detalle: duracion,
        enlace: esEnlace(m.mediaUrl) ? m.mediaUrl : null,
    };
}

/**
 * Qué imágenes se pueden incrustar: las de NUESTRO almacenamiento
 * (`S3_PUBLIC_URL`) y nada más. El servidor las va a descargar, y descargar la
 * dirección que diga un mensaje —que escribió alguien de fuera— sería mandar
 * al servidor a pedir lo que ese alguien quiera, dentro de nuestra red.
 */
export function seDejaIncrustar(url: string | null | undefined, publicUrl: string | undefined): boolean {
    if (!url || !publicUrl) return false;
    let destino: URL;
    let nuestro: URL;
    try {
        destino = new URL(url);
        nuestro = new URL(publicUrl);
    } catch {
        return false;
    }
    if (destino.protocol !== "https:" && destino.protocol !== "http:") return false;
    if (destino.username || destino.password) return false;
    return destino.origin === nuestro.origin;
}

/** Las direcciones de imagen de una conversación que valdría la pena bajar. */
export function lasImagenesQueSePiden(
    mensajes: MensajeLegible[],
    publicUrl: string | undefined,
    tope: number,
): string[] {
    const vistas = new Set<string>();
    if (!(tope > 0)) return [];
    for (const m of losMensajesQueSeExportan(mensajes)) {
        if (m.eliminado) continue;
        if (ICONO_DEL_TIPO[m.tipo ?? ""] !== "imagen") continue;
        if (!seDejaIncrustar(m.mediaUrl, publicUrl)) continue;
        vistas.add(m.mediaUrl as string);
        if (vistas.size >= tope) break;
    }
    return Array.from(vistas);
}

/* ------------------------------------------------------------------------ */
/* El documento                                                             */
/* ------------------------------------------------------------------------ */

export interface ImagenParaElPdf {
    /** JPEG o PNG, ya reducido. */
    bytes: Uint8Array;
    formato: "jpg" | "png";
}

export interface MarcaDelNegocio {
    nombre: string;
    logo?: ImagenParaElPdf | null;
}

export interface OpcionesDelPdf {
    exportadaEn: Date;
    zonaHoraria?: string;
    marca: MarcaDelNegocio;
    imagenes?: Map<string, ImagenParaElPdf>;
}

/** «Chat con Juan.txt» → «Chat con Juan.pdf»: el mismo nombre, otra extensión. */
export function elNombreDelPdfDelChat(nombreDelTxt: string): string {
    return /\.txt$/i.test(nombreDelTxt) ? nombreDelTxt.replace(/\.txt$/i, ".pdf") : `${nombreDelTxt}.pdf`;
}

/** «27/09/2026» de «27/09/2026, 14:05». */
function elDia(ts: number, zona?: string): string {
    return laFechaDeLaLinea(ts, zona).split(",")[0] ?? "";
}
function laHora(ts: number, zona?: string): string {
    return (laFechaDeLaLinea(ts, zona).split(", ")[1] ?? "").trim();
}

interface Fuentes {
    normal: PDFFont;
    negrita: PDFFont;
    cursiva: PDFFont;
}

class Lienzo {
    paginas: PDFPage[] = [];
    pagina!: PDFPage;
    /** La coordenada Y por la que va la escritura (de arriba hacia abajo). */
    y = 0;
    constructor(
        readonly doc: PDFDocument,
        readonly fuentes: Fuentes,
    ) {}

    nueva(): void {
        this.pagina = this.doc.addPage([ANCHO_DE_PAGINA, ALTO_DE_PAGINA]);
        this.pagina.drawRectangle({ x: 0, y: 0, width: ANCHO_DE_PAGINA, height: ALTO_DE_PAGINA, color: hex(COLORES.fondo) });
        this.paginas.push(this.pagina);
        this.y = ALTO_DE_PAGINA - MARGEN;
    }

    /** Lo que queda de alto antes del pie. */
    queda(): number {
        return this.y - (MARGEN + ALTO_DEL_PIE);
    }

    asegurar(alto: number): void {
        if (this.queda() < alto) this.nueva();
    }

    enlace(url: string, x: number, y: number, ancho: number, alto: number): void {
        const annot = this.doc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [x, y, x + ancho, y + alto],
            Border: [0, 0, 0],
            A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
        });
        this.pagina.node.addAnnot(this.doc.context.register(annot));
    }
}

/** Un rectángulo con las esquinas redondeadas, por su esquina de ABAJO a la izquierda. */
function caja(page: PDFPage, x: number, y: number, w: number, h: number, r: number, color: RGB, borde?: RGB) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    const k = rr * 0.5523;
    // SVG en coordenadas con Y hacia abajo: pdf-lib lo voltea al dibujar.
    const top = ALTO_DE_PAGINA - (y + h);
    const d = [
        `M ${x + rr} ${top}`,
        `L ${x + w - rr} ${top}`,
        `C ${x + w - rr + k} ${top} ${x + w} ${top + rr - k} ${x + w} ${top + rr}`,
        `L ${x + w} ${top + h - rr}`,
        `C ${x + w} ${top + h - rr + k} ${x + w - rr + k} ${top + h} ${x + w - rr} ${top + h}`,
        `L ${x + rr} ${top + h}`,
        `C ${x + rr - k} ${top + h} ${x} ${top + h - rr + k} ${x} ${top + h - rr}`,
        `L ${x} ${top + rr}`,
        `C ${x} ${top + rr - k} ${x + rr - k} ${top} ${x + rr} ${top}`,
        "Z",
    ].join(" ");
    page.drawSvgPath(d, {
        x: 0,
        y: ALTO_DE_PAGINA,
        color,
        ...(borde ? { borderColor: borde, borderWidth: 0.6 } : {}),
    });
}

/** El dibujo de cada icono de tarjeta, hecho con formas: nada de fuentes de iconos. */
function dibujarIcono(page: PDFPage, icono: string, x: number, y: number, t: number, fuentes: Fuentes) {
    const verde = hex(COLORES.cabecera);
    page.drawCircle({ x: x + t / 2, y: y + t / 2, size: t / 2, color: verde });
    const blanco = rgb(1, 1, 1);
    const cx = x + t / 2;
    const cy = y + t / 2;
    const u = t / 10;
    switch (icono) {
        case "video":
            page.drawSvgPath(`M ${-1.6 * u} ${-2.5 * u} L ${2.8 * u} 0 L ${-1.6 * u} ${2.5 * u} Z`, { x: cx, y: cy, color: blanco });
            return;
        case "audio":
            page.drawRectangle({ x: cx - 1.1 * u, y: cy - 0.6 * u, width: 2.2 * u, height: 3.4 * u, color: blanco });
            page.drawRectangle({ x: cx - 0.3 * u, y: cy - 2.8 * u, width: 0.6 * u, height: 2.2 * u, color: blanco });
            page.drawRectangle({ x: cx - 1.6 * u, y: cy - 2.9 * u, width: 3.2 * u, height: 0.5 * u, color: blanco });
            return;
        case "documento":
            page.drawRectangle({ x: cx - 2 * u, y: cy - 2.8 * u, width: 4 * u, height: 5.6 * u, color: blanco });
            for (const dy of [1.2, 0, -1.2]) {
                page.drawRectangle({ x: cx - 1.2 * u, y: cy + dy * u, width: 2.4 * u, height: 0.35 * u, color: verde });
            }
            return;
        case "imagen":
            page.drawRectangle({ x: cx - 2.8 * u, y: cy - 2 * u, width: 5.6 * u, height: 4 * u, color: blanco });
            page.drawSvgPath(`M ${-2.4 * u} ${1.6 * u} L ${-0.6 * u} ${-0.6 * u} L ${0.8 * u} ${0.8 * u} L ${2.4 * u} ${-0.9 * u} L ${2.4 * u} ${1.6 * u} Z`, {
                x: cx,
                y: cy,
                color: verde,
            });
            return;
        default: {
            const letra = { ubicacion: "U", contacto: "C", llamada: "L", adjunto: "A" }[icono] ?? "A";
            const w = fuentes.negrita.widthOfTextAtSize(letra, t * 0.55);
            page.drawText(letra, { x: cx - w / 2, y: cy - t * 0.2, size: t * 0.55, font: fuentes.negrita, color: blanco });
        }
    }
}

/**
 * El PDF entero de una conversación, en bytes. Si la conversación no tiene
 * mensajes, sale la cabecera y un aviso: un PDF en blanco se lee como un
 * archivo roto.
 */
export async function conversacionEnPdf(
    c: ConversacionParaExportar,
    opciones: OpcionesDelPdf,
): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const nombreDelNegocio = aTextoImprimible(opciones.marca.nombre || c.linea || "Conversación").trim() || "Conversación";
    doc.setTitle(aTextoImprimible(`Conversación con ${c.contacto}`));
    doc.setAuthor(nombreDelNegocio);
    doc.setCreator(nombreDelNegocio);
    doc.setProducer(nombreDelNegocio);
    doc.setCreationDate(opciones.exportadaEn);

    const fuentes: Fuentes = {
        normal: await doc.embedFont(StandardFonts.Helvetica),
        negrita: await doc.embedFont(StandardFonts.HelveticaBold),
        cursiva: await doc.embedFont(StandardFonts.HelveticaOblique),
    };
    const lienzo = new Lienzo(doc, fuentes);
    const zona = opciones.zonaHoraria;

    // Las imágenes se incrustan una vez aunque se repitan.
    const incrustadas = new Map<string, PDFImage | null>();
    const laImagen = async (url: string): Promise<PDFImage | null> => {
        if (incrustadas.has(url)) return incrustadas.get(url)!;
        const img = opciones.imagenes?.get(url);
        let pdfImg: PDFImage | null = null;
        if (img) {
            try {
                pdfImg = img.formato === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
            } catch (error) {
                // Una imagen rota no tumba el PDF: sale como tarjeta.
                console.warn("[exportar] una imagen no se pudo incrustar en el PDF", url, error);
            }
        }
        incrustadas.set(url, pdfImg);
        return pdfImg;
    };
    let logo: PDFImage | null = null;
    if (opciones.marca.logo) {
        try {
            logo =
                opciones.marca.logo.formato === "png"
                    ? await doc.embedPng(opciones.marca.logo.bytes)
                    : await doc.embedJpg(opciones.marca.logo.bytes);
        } catch (error) {
            console.warn("[exportar] el logo no se pudo incrustar en el PDF", error);
        }
    }

    const mensajes = losMensajesQueSeExportan(c.mensajes);

    /* -------- Cabecera -------- */
    lienzo.nueva();
    const page0 = lienzo.pagina;
    const altoBanda = ALTO_DE_LA_CABECERA;
    page0.drawRectangle({ x: 0, y: ALTO_DE_PAGINA - altoBanda, width: ANCHO_DE_PAGINA, height: altoBanda, color: hex(COLORES.cabecera) });
    const lado = 50;
    const xLogo = MARGEN;
    const yLogo = ALTO_DE_PAGINA - altoBanda / 2 - lado / 2;
    caja(page0, xLogo, yLogo, lado, lado, 10, rgb(1, 1, 1));
    if (logo) {
        const escala = Math.min((lado - 8) / logo.width, (lado - 8) / logo.height);
        const w = logo.width * escala;
        const h = logo.height * escala;
        page0.drawImage(logo, { x: xLogo + (lado - w) / 2, y: yLogo + (lado - h) / 2, width: w, height: h });
    } else {
        const ini = lasIniciales(nombreDelNegocio);
        const w = fuentes.negrita.widthOfTextAtSize(ini, 20);
        page0.drawText(ini, { x: xLogo + (lado - w) / 2, y: yLogo + lado / 2 - 7, size: 20, font: fuentes.negrita, color: hex(COLORES.cabecera) });
    }
    const xTexto = xLogo + lado + 14;
    const anchoTexto = ANCHO_DE_PAGINA - MARGEN - xTexto;
    const recortar = (s: string, font: PDFFont, size: number) => {
        let t = s;
        while (t.length > 1 && font.widthOfTextAtSize(t, size) > anchoTexto) t = t.slice(0, -2) + "…";
        return t;
    };
    const blanco = rgb(1, 1, 1);
    const tituloNegocio = recortar(nombreDelNegocio, fuentes.negrita, 17);
    page0.drawText(tituloNegocio, { x: xTexto, y: ALTO_DE_PAGINA - 30, size: 17, font: fuentes.negrita, color: blanco });
    const conQuien = aTextoImprimible(`Conversación con ${c.contacto}${c.numero ? ` (${c.numero})` : ""}`);
    page0.drawText(recortar(conQuien, fuentes.normal, 11), { x: xTexto, y: ALTO_DE_PAGINA - 48, size: 11, font: fuentes.normal, color: blanco });
    const datos = [
        c.linea ? `Línea: ${c.linea}` : null,
        `Exportada el ${laFechaDeLaLinea(Math.floor(opciones.exportadaEn.getTime() / 1000), zona)}`,
        `${mensajes.length} mensaje${mensajes.length === 1 ? "" : "s"}`,
    ]
        .filter(Boolean)
        .join("  ·  ");
    page0.drawText(recortar(aTextoImprimible(datos), fuentes.normal, 8.5), {
        x: xTexto,
        y: ALTO_DE_PAGINA - 64,
        size: 8.5,
        font: fuentes.normal,
        color: rgb(0.85, 0.95, 0.92),
    });
    lienzo.y = ALTO_DE_PAGINA - altoBanda - 16;

    const aviso = (texto: string) => {
        const lineas = envolverTexto(aTextoImprimible(texto), ANCHO_DE_PAGINA - 2 * MARGEN - 2 * RELLENO, (s) =>
            fuentes.cursiva.widthOfTextAtSize(s, 8.5),
        );
        const alto = lineas.length * 11 + 2 * RELLENO - 2;
        lienzo.asegurar(alto + 8);
        const yAbajo = lienzo.y - alto;
        caja(lienzo.pagina, MARGEN, yAbajo, ANCHO_DE_PAGINA - 2 * MARGEN, alto, 6, hex("#FFF4CC"));
        lineas.forEach((l, i) =>
            lienzo.pagina.drawText(l, {
                x: MARGEN + RELLENO,
                y: lienzo.y - RELLENO - 8 - i * 11,
                size: 8.5,
                font: fuentes.cursiva,
                color: hex("#54656F"),
            }),
        );
        lienzo.y = yAbajo - 10;
    };
    if (c.recortada) {
        aviso(
            `La conversación tiene más de ${TOPE_DE_MENSAJES_POR_CONVERSACION} mensajes; aquí van los ${TOPE_DE_MENSAJES_POR_CONVERSACION} más recientes.`,
        );
    }
    if (mensajes.length === 0) aviso("Esta conversación no tiene mensajes guardados.");

    /* -------- Burbujas -------- */
    const anchoUtil = ANCHO_DE_PAGINA - 2 * MARGEN;
    const anchoBurbuja = anchoUtil * PROPORCION_DE_LA_BURBUJA;
    const anchoInterior = anchoBurbuja - 2 * RELLENO;
    const nombres = { contacto: c.contacto, asesor: c.nombreDelAsesor || c.linea || "Asesor" };
    const medir = (font: PDFFont, size: number) => (s: string) => font.widthOfTextAtSize(s, size);
    let diaAnterior = "";

    for (const m of mensajes) {
        const dia = elDia(m.ts, zona);
        if (dia && dia !== diaAnterior) {
            diaAnterior = dia;
            const w = fuentes.negrita.widthOfTextAtSize(dia, 8) + 20;
            lienzo.asegurar(34);
            const yP = lienzo.y - 18;
            caja(lienzo.pagina, (ANCHO_DE_PAGINA - w) / 2, yP, w, 16, 6, hex(COLORES.separador));
            lienzo.pagina.drawText(dia, { x: (ANCHO_DE_PAGINA - w) / 2 + 10, y: yP + 5, size: 8, font: fuentes.negrita, color: hex("#54656F") });
            lienzo.y = yP - 8;
        }

        const { lado, color } = elLadoYElColor(m.quien);
        const firma = aTextoImprimible(
            m.quien === "contacto" && m.autor?.trim() ? m.autor.trim() : nombreDeQuienHabla(m.quien, nombres),
        );
        const hora = laHora(m.ts, zona);
        const pieza = laPiezaDelMensaje(m, (url) => Boolean(opciones.imagenes?.has(url)));
        const imagen = pieza.clase === "imagen" ? await laImagen(pieza.url) : null;
        const piezaFinal: PiezaDelMensaje =
            pieza.clase === "imagen" && !imagen
                ? { clase: "tarjeta", icono: "imagen", titulo: "Imagen", detalle: null, enlace: pieza.url }
                : pieza;

        // El texto de la burbuja: el mensaje, el pie de foto, o la marca de eliminado.
        const textoPlano =
            piezaFinal.clase === "eliminado" ? "Se eliminó este mensaje." : aTextoImprimible((m.texto ?? "").trim());
        const fuenteTexto = piezaFinal.clase === "eliminado" ? fuentes.cursiva : fuentes.normal;
        const lineasTexto = textoPlano ? envolverTexto(textoPlano, anchoInterior, medir(fuenteTexto, TAMANO_DEL_TEXTO)) : [];
        const transcripcion =
            m.transcripcion?.trim() && piezaFinal.clase === "tarjeta" && piezaFinal.icono === "audio"
                ? envolverTexto(
                      aTextoImprimible(`Transcripción: ${m.transcripcion.trim()}`),
                      anchoInterior,
                      medir(fuentes.cursiva, 8.5),
                  )
                : [];

        // Alto de cada parte.
        const altoFirma = 11;
        let altoImagen = 0;
        let anchoImagen = 0;
        if (piezaFinal.clase === "imagen" && imagen) {
            const escala = Math.min(anchoInterior / imagen.width, ALTO_MAXIMO_DE_IMAGEN / imagen.height, 1.5);
            anchoImagen = imagen.width * escala;
            altoImagen = imagen.height * escala + 4;
        }
        const tarjeta = piezaFinal.clase === "tarjeta" ? piezaFinal : null;
        const lineasTituloTarjeta = tarjeta
            ? envolverTexto(aTextoImprimible(tarjeta.titulo), anchoInterior - 44, medir(fuentes.negrita, 9)).slice(0, 3)
            : [];
        const lineasDeLaTarjeta = tarjeta
            ? lineasTituloTarjeta.length + (tarjeta.detalle ? 1 : 0) + (tarjeta.enlace ? 1 : 0)
            : 0;
        const altoTarjeta = tarjeta ? Math.max(34, 12 + lineasDeLaTarjeta * 11) + 4 : 0;
        const altoTranscripcion = transcripcion.length ? transcripcion.length * 11 + 4 : 0;
        // La hora va en el ÚLTIMO trozo de una burbuja partida, como en un chat:
        // repetida en cada trozo, un mensaje largo parecería varios.
        const altoPieFinal = 12;
        const altoPieIntermedio = 4;

        // Una burbuja que no cabe en una página entera se parte por sus líneas.
        let lineasPendientes = lineasTexto;
        let primeraParte = true;
        for (;;) {
            const altoCabeza = primeraParte ? altoFirma + altoImagen + altoTarjeta + altoTranscripcion : 0;
            const altoPie = altoPieFinal;
            const disponibleEnBlanco = ALTO_DE_PAGINA - 2 * MARGEN - ALTO_DEL_PIE - 2 * RELLENO - altoPie - altoCabeza - 6;
            const maxLineas = Math.max(1, Math.floor(disponibleEnBlanco / INTERLINEADO));
            let estas = lineasPendientes.slice(0, maxLineas);
            let alto = 2 * RELLENO + altoCabeza + estas.length * INTERLINEADO + altoPie;
            if (lienzo.queda() < alto + 6) {
                // ¿Caben al menos unas líneas aquí? Si la burbuja es larga, se parte ya.
                const cabenAqui = Math.floor((lienzo.queda() - 6 - 2 * RELLENO - altoCabeza - altoPie) / INTERLINEADO);
                if (lineasPendientes.length > maxLineas && cabenAqui >= 3) {
                    estas = lineasPendientes.slice(0, cabenAqui);
                    alto = 2 * RELLENO + altoCabeza + estas.length * INTERLINEADO + altoPie;
                } else {
                    lienzo.nueva();
                }
            }
            lineasPendientes = lineasPendientes.slice(estas.length);
            const esElUltimo = lineasPendientes.length === 0;
            if (!esElUltimo) alto -= altoPieFinal - altoPieIntermedio;

            // Ancho: lo que pida el contenido, sin pasar del máximo.
            const anchoContenido = Math.max(
                fuentes.negrita.widthOfTextAtSize(firma, TAMANO_PEQUENO),
                ...estas.map((l) => fuenteTexto.widthOfTextAtSize(l, TAMANO_DEL_TEXTO)),
                ...(primeraParte ? transcripcion.map((l) => fuentes.cursiva.widthOfTextAtSize(l, 8.5)) : [0]),
                primeraParte && imagen ? anchoImagen : 0,
                primeraParte && tarjeta ? anchoInterior : 0,
                fuentes.normal.widthOfTextAtSize(hora, TAMANO_PEQUENO) + 30,
            );
            const w = Math.min(anchoBurbuja, anchoContenido + 2 * RELLENO);
            const x = lado === "izquierda" ? MARGEN : ANCHO_DE_PAGINA - MARGEN - w;
            const yAbajo = lienzo.y - alto;
            const page = lienzo.pagina;
            caja(page, x, yAbajo, w, alto, 7, hex(color), lado === "izquierda" ? hex("#E4E0DA") : undefined);

            let cursor = lienzo.y - RELLENO;
            const xi = x + RELLENO;
            if (primeraParte) {
                page.drawText(firma, {
                    x: xi,
                    y: cursor - 7.5,
                    size: TAMANO_PEQUENO,
                    font: fuentes.negrita,
                    color: m.quien === "contacto" ? hex("#1F7AEC") : m.quien === "ia" ? hex("#3B5BDB") : hex(COLORES.cabecera),
                });
                cursor -= altoFirma;
                if (imagen && piezaFinal.clase === "imagen") {
                    const h = altoImagen - 4;
                    page.drawImage(imagen, { x: xi, y: cursor - h, width: anchoImagen, height: h });
                    lienzo.enlace(piezaFinal.url, xi, cursor - h, anchoImagen, h);
                    cursor -= altoImagen;
                }
                if (tarjeta) {
                    const hT = altoTarjeta - 4;
                    caja(page, xi, cursor - hT, anchoInterior, hT, 5, hex(COLORES.tarjeta));
                    dibujarIcono(page, tarjeta.icono, xi + 7, cursor - hT / 2 - 12, 24, fuentes);
                    // El texto de la tarjeta, centrado en alto con su icono.
                    let yt = cursor - hT / 2 + (lineasDeLaTarjeta * 11) / 2 - 8;
                    for (const l of lineasTituloTarjeta) {
                        page.drawText(l, { x: xi + 38, y: yt, size: 9, font: fuentes.negrita, color: hex(COLORES.texto) });
                        yt -= 11;
                    }
                    if (tarjeta.detalle) {
                        page.drawText(tarjeta.detalle, { x: xi + 38, y: yt, size: 8.5, font: fuentes.normal, color: hex(COLORES.tenue) });
                        yt -= 11;
                    }
                    if (tarjeta.enlace) {
                        const rot = tarjeta.icono === "audio" ? "Escuchar" : tarjeta.icono === "video" ? "Ver video" : "Abrir archivo";
                        const wr = fuentes.negrita.widthOfTextAtSize(rot, 8.5);
                        page.drawText(rot, { x: xi + 38, y: yt, size: 8.5, font: fuentes.negrita, color: hex(COLORES.enlace) });
                        page.drawLine({
                            start: { x: xi + 38, y: yt - 1.5 },
                            end: { x: xi + 38 + wr, y: yt - 1.5 },
                            thickness: 0.5,
                            color: hex(COLORES.enlace),
                        });
                        lienzo.enlace(tarjeta.enlace, xi + 38, yt - 3, wr, 11);
                    }
                    cursor -= altoTarjeta;
                }
                for (const l of transcripcion) {
                    page.drawText(l, { x: xi, y: cursor - 9, size: 8.5, font: fuentes.cursiva, color: hex("#3B4A54") });
                    cursor -= 11;
                }
                if (transcripcion.length) cursor -= 4;
            }
            for (const l of estas) {
                page.drawText(l, {
                    x: xi,
                    y: cursor - 10,
                    size: TAMANO_DEL_TEXTO,
                    font: fuenteTexto,
                    color: piezaFinal.clase === "eliminado" ? hex(COLORES.tenue) : hex(COLORES.texto),
                });
                cursor -= INTERLINEADO;
            }
            if (esElUltimo) {
                const wh = fuentes.normal.widthOfTextAtSize(hora, TAMANO_PEQUENO);
                page.drawText(hora, {
                    x: x + w - RELLENO - wh,
                    y: yAbajo + 5,
                    size: TAMANO_PEQUENO,
                    font: fuentes.normal,
                    color: hex(COLORES.tenue),
                });
            }
            lienzo.y = yAbajo - 6;
            primeraParte = false;
            if (lineasPendientes.length === 0) break;
        }
    }

    /* -------- Pie de cada página -------- */
    const total = lienzo.paginas.length;
    lienzo.paginas.forEach((p, i) => {
        const texto = aTextoImprimible(`${nombreDelNegocio}  ·  Página ${i + 1} de ${total}`);
        const w = fuentes.normal.widthOfTextAtSize(texto, 7.5);
        p.drawText(texto, { x: (ANCHO_DE_PAGINA - w) / 2, y: MARGEN - 4, size: 7.5, font: fuentes.normal, color: hex(COLORES.tenue) });
    });

    return doc.save();
}
