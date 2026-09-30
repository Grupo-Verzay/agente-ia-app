/**
 * Las IMÁGENES de la tienda de ejemplo de la guía de Catálogo: la portada, el
 * logo y la foto de cada producto.
 *
 * Viven en `https://imagenes.guia.test/`, un dominio que no existe a
 * propósito: el guion de capturas le pide al navegador que las pida aquí
 * (`servirLasImagenes`), y aquí se dibujan con SVG y `sharp`. Así no se sube
 * nada a ningún sitio, la guía no depende de la red, y volver a generarla da
 * las mismas imágenes.
 *
 * El catálogo público las pinta con `<img>` (no con `next/image`), así que
 * una dirección de fuera no necesita estar en `next.config.js`.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

export const DOMINIO_DE_IMAGENES = "https://imagenes.guia.test";

const KRAFT = "#C9A57B";
const TEXTO = "font-family:'DejaVu Sans',Arial,sans-serif;font-weight:700";

/** Una bolsa de café kraft con su etiqueta. */
const bolsa = (fondo, etiqueta, franja, sub) => `
  <rect width="800" height="600" fill="${fondo}"/>
  <ellipse cx="400" cy="548" rx="200" ry="22" fill="#000" opacity=".12"/>
  <path d="M250 150 L550 150 L575 540 L225 540 Z" fill="${KRAFT}"/>
  <path d="M250 150 L550 150 L540 118 L260 118 Z" fill="#B48C60"/>
  <rect x="262" y="104" width="276" height="16" rx="4" fill="#9C7650"/>
  <rect x="285" y="250" width="230" height="200" rx="14" fill="#FFF8EE"/>
  <rect x="285" y="250" width="230" height="46" rx="14" fill="${franja}"/>
  <rect x="285" y="276" width="230" height="20" fill="${franja}"/>
  <text x="400" y="281" text-anchor="middle" fill="#FFF8EE" style="${TEXTO};font-size:22px">CAFÉ DEL MONTE</text>
  <text x="400" y="362" text-anchor="middle" fill="#3B2314" style="${TEXTO};font-size:40px">${etiqueta}</text>
  <text x="400" y="408" text-anchor="middle" fill="#7A5A3C" style="${TEXTO};font-size:22px">${sub}</text>
`;

const PRODUCTOS = {
    huila: bolsa("#F3E3CF", "HUILA", "#8B4513", "500 g · grano"),
    narino: bolsa("#E4EEDB", "NARIÑO", "#4E7D3A", "500 g · grano"),
    tolima: bolsa("#F1DCD3", "TOLIMA", "#8E3B2E", "250 g · grano"),
    molido: bolsa("#E2E9F2", "FILTRO", "#35597A", "500 g · molido"),
    espresso: bolsa("#EDE3F1", "ESPRESSO", "#5E3B78", "250 g · molido"),
    prensa: `
      <rect width="800" height="600" fill="#E6EEF0"/>
      <ellipse cx="400" cy="540" rx="170" ry="20" fill="#000" opacity=".12"/>
      <rect x="370" y="80" width="60" height="30" rx="10" fill="#3C3C3C"/>
      <rect x="395" y="108" width="10" height="70" fill="#6B6B6B"/>
      <rect x="290" y="170" width="220" height="30" rx="8" fill="#4A4A4A"/>
      <rect x="300" y="196" width="200" height="330" rx="16" fill="#D8EEF5" stroke="#9BB7C0" stroke-width="6"/>
      <rect x="306" y="330" width="188" height="190" rx="10" fill="#5A341C" opacity=".92"/>
      <path d="M500 240 C585 240 585 420 500 420" fill="none" stroke="#4A4A4A" stroke-width="22" stroke-linecap="round"/>
      <rect x="300" y="500" width="200" height="30" rx="8" fill="#4A4A4A"/>
    `,
    molino: `
      <rect width="800" height="600" fill="#F2EADF"/>
      <ellipse cx="400" cy="542" rx="160" ry="20" fill="#000" opacity=".12"/>
      <rect x="310" y="250" width="180" height="280" rx="18" fill="#7A4B2A"/>
      <rect x="330" y="270" width="140" height="80" rx="10" fill="#9A6A45"/>
      <circle cx="400" cy="440" r="22" fill="#C9A57B"/>
      <path d="M330 250 L470 250 L450 190 L350 190 Z" fill="#B7B7B7"/>
      <rect x="392" y="120" width="16" height="72" fill="#8C8C8C"/>
      <rect x="400" y="112" width="140" height="16" rx="8" fill="#8C8C8C"/>
      <circle cx="540" cy="120" r="22" fill="#5A341C"/>
    `,
    regalo: `
      <rect width="800" height="600" fill="#F6E4E4"/>
      <ellipse cx="400" cy="545" rx="210" ry="22" fill="#000" opacity=".12"/>
      <rect x="210" y="270" width="380" height="260" rx="12" fill="#8B4513"/>
      <rect x="190" y="220" width="420" height="70" rx="12" fill="#A0582A"/>
      <rect x="380" y="220" width="40" height="310" fill="#E8C35A"/>
      <path d="M400 220 C340 150 280 190 330 220 Z" fill="#E8C35A"/>
      <path d="M400 220 C460 150 520 190 470 220 Z" fill="#E8C35A"/>
      <text x="400" y="430" text-anchor="middle" fill="#FFF8EE" style="${TEXTO};font-size:30px">DEGUSTACIÓN</text>
    `,
};

/** Granos de café sueltos sobre un degradado tostado. */
function laPortada() {
    const granos = [];
    // Siempre los mismos: una semilla fija, no `Math.random`.
    let s = 7;
    const azar = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 70; i += 1) {
        const x = Math.round(azar() * 1600);
        const y = Math.round(azar() * 400);
        const g = Math.round(azar() * 180);
        const t = 14 + Math.round(azar() * 16);
        const o = (0.25 + azar() * 0.45).toFixed(2);
        granos.push(
            `<g transform="translate(${x} ${y}) rotate(${g})" opacity="${o}">` +
                `<ellipse rx="${t}" ry="${Math.round(t * 0.68)}" fill="#6B3A1E"/>` +
                `<path d="M-${t - 3} 0 C-${t / 3} -5 ${t / 3} 5 ${t - 3} 0" stroke="#2A160B" stroke-width="3" fill="none"/></g>`,
        );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2B170C"/><stop offset=".55" stop-color="#5B3219"/><stop offset="1" stop-color="#A0642F"/>
      </linearGradient></defs>
      <rect width="1600" height="400" fill="url(#g)"/>${granos.join("")}</svg>`;
}

/** El logo: una taza humeante sobre el marrón de la tienda. */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" rx="48" fill="#8B4513"/>
  <path d="M72 108 H168 V152 C168 184 146 200 120 200 C94 200 72 184 72 152 Z" fill="#FFF3E2"/>
  <path d="M168 120 C200 120 200 168 168 168" fill="none" stroke="#FFF3E2" stroke-width="12"/>
  <path d="M100 56 C88 72 112 80 100 96 M128 52 C116 70 140 78 128 96 M156 56 C144 72 168 80 156 96" fill="none" stroke="#FFF3E2" stroke-width="7" stroke-linecap="round"/>
  <rect x="60" y="206" width="136" height="10" rx="5" fill="#FFF3E2"/>
</svg>`;

const envolver = (cuerpo) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">${cuerpo}</svg>`;

/** Una imagen por su nombre (`portada.jpg`, `logo.png`, `huila.png`…), o `null`. */
export async function laImagen(nombre) {
    if (nombre === "portada.jpg") return { tipo: "image/jpeg", datos: await sharp(Buffer.from(laPortada())).jpeg({ quality: 86 }).toBuffer() };
    if (nombre === "logo.png") return { tipo: "image/png", datos: await sharp(Buffer.from(LOGO)).png().toBuffer() };
    const clave = nombre.replace(/\.png$/, "");
    if (PRODUCTOS[clave]) return { tipo: "image/png", datos: await sharp(Buffer.from(envolver(PRODUCTOS[clave]))).png().toBuffer() };
    return null;
}

/** Le dice al navegador que las imágenes de la tienda de ejemplo se piden aquí. */
export async function servirLasImagenes(contexto) {
    const hechas = new Map();
    await contexto.route(`${DOMINIO_DE_IMAGENES}/**`, async (ruta) => {
        const nombre = new URL(ruta.request().url()).pathname.slice(1);
        if (!hechas.has(nombre)) hechas.set(nombre, await laImagen(nombre));
        const img = hechas.get(nombre);
        if (!img) return ruta.fulfill({ status: 404, body: "" });
        return ruta.fulfill({ status: 200, contentType: img.tipo, body: img.datos, headers: { "cache-control": "max-age=3600" } });
    });
}
