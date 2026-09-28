/**
 * La cotización que la IA le manda al cliente, en PDF.
 *
 * Cabecera con el logo y los datos del negocio (la MISMA marca que el PDF de
 * una conversación: `laMarcaDelNegocio`), a quién va, la tabla de productos
 * con sus precios del catálogo, el total, y al final las condiciones que la
 * cuenta escribió en Entrenamiento › Cotizaciones.
 *
 * No toca la red ni la base: todo llega ya resuelto, así que se prueba sin
 * levantar nada. Y reutiliza lo que ya sabe pintar texto en un PDF
 * (`aTextoImprimible`, `envolverTexto`): las fuentes estándar solo saben
 * WinAnsi y un emoji en una condición tumbaría el PDF entero.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import {
    ALTO_DE_PAGINA,
    ANCHO_DE_PAGINA,
    MARGEN,
    aTextoImprimible,
    envolverTexto,
    lasIniciales,
    type MarcaDelNegocio,
} from "@/lib/conversacion-en-pdf";
import { elPrecio, type LineaDeCotizacion } from "@/lib/cotizacion-ia";

export type DatosDeLaCotizacion = {
    numero: string;
    fecha: Date;
    zonaHoraria: string;
    marca: MarcaDelNegocio;
    /** Ubicación, teléfono, correo, sitio — lo que haya en Perfil. */
    datosDelNegocio: string[];
    cliente: string;
    telefonoDelCliente?: string | null;
    lineas: LineaDeCotizacion[];
    total: number;
    moneda?: string | null;
    /** Lo que la cuenta escribió en el cuadro de texto. Vacío no pinta la sección. */
    condiciones: string;
};

const COLOR = {
    marca: "#1F2937",
    acento: "#2563EB",
    tenue: "#6B7280",
    raya: "#E5E7EB",
    fila: "#F9FAFB",
    texto: "#111827",
} as const;

const hex = (h: string): RGB => {
    const n = Number.parseInt(h.replace("#", ""), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Las columnas de la tabla: producto, cantidad, precio unitario y subtotal. */
export const COLUMNAS = { producto: 0.52, cantidad: 0.12, unitario: 0.18, subtotal: 0.18 } as const;

export function laFechaLegible(fecha: Date, zona: string): string {
    try {
        return fecha.toLocaleDateString("es-CO", { timeZone: zona, day: "numeric", month: "long", year: "numeric" });
    } catch {
        return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    }
}

class Hojas {
    pagina!: PDFPage;
    y = 0;
    constructor(private doc: PDFDocument, private pie: (p: PDFPage) => void) {}
    nueva() {
        this.pagina = this.doc.addPage([ANCHO_DE_PAGINA, ALTO_DE_PAGINA]);
        this.pie(this.pagina);
        this.y = ALTO_DE_PAGINA - MARGEN;
    }
    /** Si no caben `alto` puntos, página nueva. Devuelve si cambió. */
    sitio(alto: number): boolean {
        if (this.y - alto < MARGEN + 24) {
            this.nueva();
            return true;
        }
        return false;
    }
}

export async function cotizacionEnPdf(d: DatosDeLaCotizacion): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const negocio = aTextoImprimible(d.marca.nombre || "Cotización").trim() || "Cotización";
    doc.setTitle(aTextoImprimible(`Cotización ${d.numero}`));
    doc.setAuthor(negocio);
    doc.setCreator(negocio);
    doc.setProducer(negocio);
    doc.setCreationDate(d.fecha);

    const normal: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
    const negrita: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const ancho = ANCHO_DE_PAGINA - MARGEN * 2;
    const t = (s: string) => aTextoImprimible(s);

    let logo: PDFImage | null = null;
    if (d.marca.logo) {
        try {
            logo = d.marca.logo.formato === "png" ? await doc.embedPng(d.marca.logo.bytes) : await doc.embedJpg(d.marca.logo.bytes);
        } catch (error) {
            console.warn("[cotizacion] el logo no se pudo incrustar en el PDF", error);
        }
    }

    const pie = (p: PDFPage) => {
        const texto = t(`${negocio} · Cotización ${d.numero}`);
        p.drawText(texto, { x: MARGEN, y: MARGEN - 12, size: 7.5, font: normal, color: hex(COLOR.tenue) });
    };
    const h = new Hojas(doc, pie);
    h.nueva();

    /* -------- Cabecera: logo, negocio y datos -------- */
    const lado = 56;
    const yLogo = h.y - lado;
    h.pagina.drawRectangle({ x: MARGEN, y: yLogo, width: lado, height: lado, borderColor: hex(COLOR.raya), borderWidth: 1, color: rgb(1, 1, 1) });
    if (logo) {
        const e = Math.min((lado - 8) / logo.width, (lado - 8) / logo.height);
        h.pagina.drawImage(logo, { x: MARGEN + (lado - logo.width * e) / 2, y: yLogo + (lado - logo.height * e) / 2, width: logo.width * e, height: logo.height * e });
    } else {
        const ini = lasIniciales(negocio);
        const w = negrita.widthOfTextAtSize(ini, 20);
        h.pagina.drawText(ini, { x: MARGEN + (lado - w) / 2, y: yLogo + lado / 2 - 7, size: 20, font: negrita, color: hex(COLOR.acento) });
    }
    const xNeg = MARGEN + lado + 14;
    const anchoNeg = ancho - lado - 14 - 170;
    let yNeg = h.y - 16;
    for (const l of envolverTexto(negocio, anchoNeg, (s) => negrita.widthOfTextAtSize(s, 15)).slice(0, 2)) {
        h.pagina.drawText(l, { x: xNeg, y: yNeg, size: 15, font: negrita, color: hex(COLOR.marca) });
        yNeg -= 17;
    }
    for (const dato of d.datosDelNegocio.slice(0, 4)) {
        for (const l of envolverTexto(t(dato), anchoNeg, (s) => normal.widthOfTextAtSize(s, 8.5)).slice(0, 2)) {
            h.pagina.drawText(l, { x: xNeg, y: yNeg, size: 8.5, font: normal, color: hex(COLOR.tenue) });
            yNeg -= 11;
        }
    }
    // A la derecha: COTIZACIÓN, número y fecha.
    const xDer = ANCHO_DE_PAGINA - MARGEN;
    const derecha = (s: string, y: number, size: number, font: PDFFont, color: RGB) =>
        h.pagina.drawText(s, { x: xDer - font.widthOfTextAtSize(s, size), y, size, font, color });
    derecha("COTIZACIÓN", h.y - 16, 16, negrita, hex(COLOR.acento));
    derecha(t(d.numero), h.y - 32, 9, negrita, hex(COLOR.texto));
    derecha(t(laFechaLegible(d.fecha, d.zonaHoraria)), h.y - 44, 9, normal, hex(COLOR.tenue));

    h.y = Math.min(yLogo, yNeg) - 18;
    h.pagina.drawLine({ start: { x: MARGEN, y: h.y }, end: { x: xDer, y: h.y }, thickness: 1, color: hex(COLOR.raya) });
    h.y -= 18;

    /* -------- Para quién -------- */
    h.pagina.drawText("PARA", { x: MARGEN, y: h.y, size: 7.5, font: negrita, color: hex(COLOR.tenue) });
    h.y -= 13;
    h.pagina.drawText(t(d.cliente || "Cliente"), { x: MARGEN, y: h.y, size: 11, font: negrita, color: hex(COLOR.texto) });
    if (d.telefonoDelCliente) {
        h.y -= 12;
        h.pagina.drawText(t(`+${d.telefonoDelCliente}`), { x: MARGEN, y: h.y, size: 8.5, font: normal, color: hex(COLOR.tenue) });
    }
    h.y -= 24;

    /* -------- La tabla -------- */
    const col = {
        producto: MARGEN,
        cantidad: MARGEN + ancho * COLUMNAS.producto,
        unitario: MARGEN + ancho * (COLUMNAS.producto + COLUMNAS.cantidad),
        subtotal: MARGEN + ancho * (COLUMNAS.producto + COLUMNAS.cantidad + COLUMNAS.unitario),
    };
    const cabeceraDeTabla = () => {
        h.pagina.drawRectangle({ x: MARGEN, y: h.y - 6, width: ancho, height: 20, color: hex(COLOR.marca) });
        const blanco = rgb(1, 1, 1);
        h.pagina.drawText("Producto / servicio", { x: col.producto + 6, y: h.y, size: 8.5, font: negrita, color: blanco });
        const derCol = (s: string, xFin: number) =>
            h.pagina.drawText(s, { x: xFin - 6 - negrita.widthOfTextAtSize(s, 8.5), y: h.y, size: 8.5, font: negrita, color: blanco });
        derCol("Cant.", col.unitario);
        derCol("Precio unit.", col.subtotal);
        derCol("Subtotal", MARGEN + ancho);
        h.y -= 24;
    };
    cabeceraDeTabla();

    const anchoProducto = ancho * COLUMNAS.producto - 12;
    d.lineas.forEach((l, i) => {
        const nombre = envolverTexto(t(l.titulo), anchoProducto, (s) => normal.widthOfTextAtSize(s, 9.5));
        const alto = Math.max(1, nombre.length) * 12 + 8;
        if (h.sitio(alto)) cabeceraDeTabla();
        if (i % 2 === 0) h.pagina.drawRectangle({ x: MARGEN, y: h.y - alto + 12, width: ancho, height: alto, color: hex(COLOR.fila) });
        nombre.forEach((linea, k) =>
            h.pagina.drawText(linea, { x: col.producto + 6, y: h.y - k * 12, size: 9.5, font: normal, color: hex(COLOR.texto) }),
        );
        const derCol = (s: string, xFin: number, font: PDFFont = normal) =>
            h.pagina.drawText(t(s), { x: xFin - 6 - font.widthOfTextAtSize(t(s), 9.5), y: h.y, size: 9.5, font, color: hex(COLOR.texto) });
        derCol(String(l.cantidad), col.unitario);
        derCol(elPrecio(l.precioUnitario), col.subtotal);
        derCol(elPrecio(l.subtotal), MARGEN + ancho, negrita);
        h.y -= alto;
    });

    /* -------- El total -------- */
    h.sitio(40);
    h.y -= 4;
    h.pagina.drawLine({ start: { x: col.unitario, y: h.y + 8 }, end: { x: xDer, y: h.y + 8 }, thickness: 1, color: hex(COLOR.raya) });
    const total = t(elPrecio(d.total, d.moneda));
    h.pagina.drawText("TOTAL", { x: col.unitario + 6, y: h.y - 8, size: 11, font: negrita, color: hex(COLOR.texto) });
    h.pagina.drawText(total, { x: xDer - 6 - negrita.widthOfTextAtSize(total, 13), y: h.y - 9, size: 13, font: negrita, color: hex(COLOR.acento) });
    h.y -= 36;

    /* -------- Condiciones -------- */
    const condiciones = t(d.condiciones ?? "").trim();
    if (condiciones) {
        h.sitio(40);
        h.pagina.drawText("CONDICIONES", { x: MARGEN, y: h.y, size: 8, font: negrita, color: hex(COLOR.tenue) });
        h.y -= 14;
        for (const linea of envolverTexto(condiciones, ancho, (s) => normal.widthOfTextAtSize(s, 9))) {
            h.sitio(12);
            if (linea) h.pagina.drawText(linea, { x: MARGEN, y: h.y, size: 9, font: normal, color: hex(COLOR.texto) });
            h.y -= 12;
        }
    }

    return doc.save();
}

/** El nombre del archivo que ve el cliente en WhatsApp. */
export function elNombreDelPdf(numero: string): string {
    return `Cotizacion-${numero.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}
