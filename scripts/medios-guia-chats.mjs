/**
 * Los ARCHIVOS de las conversaciones de ejemplo de la guía de Chats: la foto
 * de unos tenis, dos notas de voz y el catálogo en PDF.
 *
 * La semilla los apunta a `localhost:9000/guia/chats/…` (el bucket del banco,
 * que no existe) y el guion de capturas los contesta desde aquí
 * (`servirLosMedios`, con `ctx.route`). Nada se sube a ningún sitio, ninguna
 * foto ni voz es de una persona, y volver a generar la guía da los mismos.
 */
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

export const ORIGEN_DE_LOS_MEDIOS = "http://localhost:9000/guia/chats/";

const TEXTO = "font-family:'DejaVu Sans',Arial,sans-serif;font-weight:700";

/** Unos tenis blancos ilustrados, sobre un fondo suave. */
const TENIS = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <rect width="800" height="600" fill="#E8EEF6"/>
  <ellipse cx="400" cy="470" rx="290" ry="26" fill="#000" opacity=".10"/>
  <path d="M140 420 C140 330 230 300 300 300 L420 230 C450 215 500 220 520 250 L560 320 C640 330 690 360 690 410 L690 440 L140 440 Z" fill="#FFFFFF" stroke="#C9D3E0" stroke-width="6"/>
  <rect x="140" y="420" width="550" height="34" rx="14" fill="#F4F6FA" stroke="#C9D3E0" stroke-width="6"/>
  <path d="M330 300 L460 300 M350 280 L470 280 M370 260 L480 262" stroke="#9AA9BD" stroke-width="7" stroke-linecap="round"/>
  <path d="M560 330 C600 345 640 360 670 395" stroke="#3B82F6" stroke-width="10" fill="none" stroke-linecap="round"/>
  <text x="400" y="110" text-anchor="middle" fill="#1E3A5F" style="${TEXTO};font-size:42px">CLÁSICOS BLANCOS</text>
  <text x="400" y="160" text-anchor="middle" fill="#55708F" style="${TEXTO};font-size:26px">Talla 34 a 42</text>
</svg>`;

let cache = null;

async function losMedios() {
    if (cache) return cache;
    const foto = await sharp(Buffer.from(TENIS)).jpeg({ quality: 86 }).toBuffer();

    const pdf = await PDFDocument.create();
    const hoja = pdf.addPage([595, 842]);
    const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    // Una franja de color arriba: la miniatura del chat enseña el principio de la página.
    hoja.drawRectangle({ x: 0, y: 662, width: 595, height: 180, color: rgb(0.16, 0.39, 0.85) });
    hoja.drawRectangle({ x: 60, y: 420, width: 475, height: 200, color: rgb(0.91, 0.94, 0.98) });
    hoja.drawText("Catálogo de tenis", { x: 60, y: 740, size: 34, font: negrita, color: rgb(1, 1, 1) });
    ["Clásicos blancos · $189.000", "Urbanos negros · $205.000", "Running azul · $229.000"].forEach((t, i) =>
        hoja.drawText(t, { x: 80, y: 580 - i * 50, size: 20, font: normal }),
    );
    const documento = Buffer.from(await pdf.save());

    // Las notas de voz son frases de la caché de Cedar: no se reproducen en
    // ninguna captura ni en el vídeo, solo tienen que ser un audio de verdad.
    const dir = path.resolve("scripts/voz-de-la-guia/cedar");
    const oggs = readdirSync(dir).filter((f) => f.endsWith(".ogg")).sort();
    const nota = (i) => readFileSync(path.join(dir, oggs[i % oggs.length]));

    cache = {
        "tenis-blancos.jpg": { cuerpo: foto, tipo: "image/jpeg" },
        "catalogo-de-tenis.pdf": { cuerpo: documento, tipo: "application/pdf" },
        "nota-de-voz-1.ogg": { cuerpo: nota(0), tipo: "audio/ogg" },
        "nota-de-voz-2.ogg": { cuerpo: nota(1), tipo: "audio/ogg" },
    };
    return cache;
}

/** Contesta los archivos de la semilla en un contexto de Playwright. */
export async function servirLosMedios(ctx) {
    const medios = await losMedios();
    await ctx.route(`${ORIGEN_DE_LOS_MEDIOS}**`, (ruta) => {
        const nombre = new URL(ruta.request().url()).pathname.split("/").pop();
        const m = medios[nombre];
        if (!m) return ruta.fulfill({ status: 404, body: "" });
        return ruta.fulfill({ status: 200, contentType: m.tipo, body: m.cuerpo, headers: { "Access-Control-Allow-Origin": "*" } });
    });
}
