/**
 * Los ARCHIVOS de la historia: lo que se mandan la clienta y la clínica.
 *
 * Nada es una foto de archivo ni un recurso de terceros: todo se dibuja aquí,
 * con la marca de la clínica de ejemplo (Clínica Sonríe) y la tipografía del
 * estudio, y se vuelve a generar en cada grabación —las fechas de los cupos
 * salen del calendario de la historia, que depende del día en que se graba—.
 *
 *   - la promo de Instagram que manda Laura (una imagen cuadrada);
 *   - la lista de precios (un PDF de dos páginas, con su miniatura);
 *   - el video de la clínica (9 s, con su portada);
 *   - la imagen de los cupos que manda el seguimiento;
 *   - las dos notas de voz, que salen de la caché de voces (`narracion.mjs`);
 *   - y lo que pintan las tarjetas del arranque (`MEDIOS_DEL_MONTAJE`): la foto
 *     del sofá de la tienda y la portada de la clase de los cursos.
 *
 * Se escribe todo en `dir`, con los nombres de `MEDIOS` (historia.mjs).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CLIENTA, MEDIOS, MEDIOS_DEL_MONTAJE, NEGOCIO, NOTAS_DE_VOZ, elCalendario, elDia, laHora } from "./historia.mjs";
import { CACHE_DE_VENTAS, VOZ_DE_LA_CLIENTA, VOZ_DE_SOFIA } from "./narracion.mjs";
import { rutaDeLaFrase } from "../voz-cedar.mjs";

const FUENTE = readFileSync(path.join(import.meta.dirname, "fuentes", "inter-latin.woff2")).toString("base64");

/** La marca de la clínica de ejemplo. */
export const MARCA = Object.freeze({
    verde: "#0f766e",
    verdeClaro: "#2dd4bf",
    menta: "#ccfbf1",
    oscuro: "#134e4a",
    texto: "#0f172a",
});

/** El diente del logo, en SVG, de un color. */
export function elDiente(color = "#fff") {
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path fill="${color}" d="M32 11.5c-5.6-3.9-13.3-4.9-18.3-.1-6.2 5.9-3.6 16.6-.6 23.6 2.1 5 3.3 10.9 4.3 16.6.9 5.2 7.2 5.4 8.4.2l2.7-10.6c.9-3.4 6.1-3.4 7 0l2.7 10.6c1.2 5.2 7.5 5 8.4-.2 1-5.7 2.2-11.6 4.3-16.6 3-7 5.6-17.7-.6-23.6-5-4.8-12.7-3.8-18.3.1z"/><path fill="${color}" opacity=".55" d="M50 6l1.4 3.6L55 11l-3.6 1.4L50 16l-1.4-3.6L45 11l3.6-1.4z"/></svg>`;
}

const PRECIO = (n) => `$${n.toLocaleString("es-CO")}`;

const BASE = `
@font-face { font-family: Inter; src: url(data:font/woff2;base64,${FUENTE}) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
`;

function laPromo() {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1080px; height: 1080px; overflow: hidden; background: radial-gradient(circle at 20% 15%, #5eead4 0, transparent 38%), radial-gradient(circle at 85% 90%, #0ea5e9 0, transparent 42%), linear-gradient(145deg, #0d9488, #115e59 60%, #134e4a); color: #fff; position: relative; }
.logo { position: absolute; top: 64px; left: 72px; display: flex; align-items: center; gap: 18px; font-size: 34px; font-weight: 700; letter-spacing: -.5px; }
.logo svg { width: 58px; height: 58px; }
.chip { position: absolute; top: 70px; right: 72px; background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.35); padding: 12px 26px; border-radius: 999px; font-size: 26px; font-weight: 600; }
.que { position: absolute; top: 250px; left: 72px; font-size: 44px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; opacity: .92; }
.cuanto { position: absolute; top: 300px; left: 60px; font-size: 300px; font-weight: 900; line-height: 1; letter-spacing: -14px; }
.cuanto small { font-size: 120px; letter-spacing: -4px; margin-left: 12px; }
.off { position: absolute; top: 590px; left: 76px; font-size: 64px; font-weight: 800; background: #fff; color: #0f766e; padding: 6px 28px 10px; border-radius: 18px; transform: rotate(-2deg); }
.lista { position: absolute; top: 740px; left: 76px; font-size: 34px; font-weight: 500; line-height: 1.6; }
.lista b { color: #99f6e4; }
.diente { position: absolute; right: -40px; bottom: 60px; width: 480px; height: 480px; opacity: .14; }
.pie { position: absolute; bottom: 58px; left: 76px; font-size: 28px; opacity: .85; font-weight: 500; }
</style></head><body>
<div class="logo">${elDiente()}<span>${NEGOCIO.nombre}</span></div>
<div class="chip">Solo este mes</div>
<div class="que">Blanqueamiento dental</div>
<div class="cuanto">30<small>%</small></div>
<div class="off">DE DESCUENTO</div>
<div class="lista"><b>✓</b> Valoración gratis<br><b>✓</b> Hasta 6 cuotas sin interés<br><b>✓</b> Resultados desde la primera sesión</div>
<div class="diente">${elDiente("#fff")}</div>
<div class="pie">@clinicasonrie · Agenda por WhatsApp</div>
</body></html>`;
}

function losCupos(cal) {
    const tarjetas = cal.cupos
        .map(
            (c) => `<div class="dia"><div class="nombre">${elDia(c.dia).replace(/^./, (l) => l.toUpperCase())}</div>
            <div class="horas">${c.horas.map((h) => `<span>${laHora(h)}</span>`).join("")}</div></div>`,
        )
        .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1080px; height: 1080px; overflow: hidden; background: linear-gradient(160deg, #f0fdfa, #ccfbf1); color: ${MARCA.texto}; position: relative; }
.cabeza { background: linear-gradient(135deg, #0f766e, #0d9488); color: #fff; padding: 70px 76px 64px; border-bottom-right-radius: 90px; }
.cabeza .logo { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 700; opacity: .95; }
.cabeza .logo svg { width: 48px; height: 48px; }
.cabeza h1 { margin-top: 38px; font-size: 64px; line-height: 1.08; font-weight: 800; letter-spacing: -1.5px; }
.cabeza p { margin-top: 18px; font-size: 32px; opacity: .9; font-weight: 500; }
.dias { padding: 56px 76px 0; display: grid; gap: 34px; }
.dia { background: #fff; border-radius: 34px; padding: 34px 40px; box-shadow: 0 14px 40px rgba(15,118,110,.12); }
.nombre { font-size: 38px; font-weight: 800; color: #0f766e; }
.horas { margin-top: 22px; display: flex; gap: 22px; }
.horas span { font-size: 40px; font-weight: 700; padding: 16px 34px; border-radius: 999px; background: #f0fdfa; border: 3px solid #5eead4; }
.pie { position: absolute; bottom: 56px; left: 76px; right: 76px; font-size: 30px; font-weight: 600; color: #134e4a; }
</style></head><body>
<div class="cabeza"><div class="logo">${elDiente()}<span>${NEGOCIO.nombre}</span></div>
<h1>Cupos para tu valoración gratis</h1><p>Blanqueamiento dental · 45 minutos</p></div>
<div class="dias">${tarjetas}</div>
<div class="pie">Responde con el horario que prefieras 💬</div>
</body></html>`;
}

const SERVICIOS = [
    ["Blanqueamiento dental", "Consultorio · 1 sesión", 450000, 315000],
    ["Limpieza y profilaxis", "Incluye valoración", 120000],
    ["Diseño de sonrisa", "Carillas en resina", 2800000],
    ["Ortodoncia invisible", "Plan completo", 6900000],
    ["Implante dental", "Con corona en porcelana", 3900000],
    ["Resina estética", "Por pieza", 180000],
];

function laLista() {
    const filas = SERVICIOS.map(
        ([n, d, p, o]) => `<tr><td><b>${n}</b><span>${d}</span></td><td class="p">${o ? `<s>${PRECIO(p)}</s><em>${PRECIO(o)}</em>` : PRECIO(p)}</td></tr>`,
    ).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
@page { size: A4; margin: 0; }
body { color: ${MARCA.texto}; }
.pagina { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
.cabeza { background: linear-gradient(135deg, #0f766e, #0d9488); color: #fff; padding: 22mm 18mm 16mm; }
.logo { display: flex; align-items: center; gap: 4mm; font-size: 7mm; font-weight: 800; }
.logo svg { width: 11mm; height: 11mm; }
.cabeza h1 { margin-top: 10mm; font-size: 12mm; font-weight: 800; letter-spacing: -.4mm; }
.cabeza p { margin-top: 2mm; font-size: 4.2mm; opacity: .9; }
table { width: calc(100% - 36mm); margin: 12mm 18mm 0; border-collapse: collapse; }
td { padding: 5mm 0; border-bottom: .3mm solid #e2e8f0; font-size: 4.3mm; vertical-align: middle; }
td span { display: block; color: #64748b; font-size: 3.4mm; margin-top: 1mm; }
td.p { text-align: right; font-weight: 800; font-size: 5mm; white-space: nowrap; }
td.p s { color: #94a3b8; font-weight: 500; font-size: 3.8mm; margin-right: 3mm; }
td.p em { font-style: normal; color: #0f766e; }
.promo { margin: 10mm 18mm 0; padding: 7mm 8mm; border-radius: 5mm; background: #f0fdfa; border: .5mm solid #5eead4; font-size: 4.2mm; line-height: 1.5; }
.promo b { color: #0f766e; font-size: 5mm; }
.pie { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; font-size: 3.4mm; color: #64748b; display: flex; justify-content: space-between; }
.bloque { margin: 12mm 18mm 0; }
.bloque h2 { font-size: 6.5mm; color: #0f766e; }
.bloque p { margin-top: 3mm; font-size: 4.2mm; line-height: 1.6; }
.cuotas { margin-top: 5mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.cuotas div { border-radius: 4mm; background: #f8fafc; border: .3mm solid #e2e8f0; padding: 5mm; text-align: center; font-size: 3.6mm; color: #475569; }
.cuotas b { display: block; font-size: 7mm; color: #0f172a; margin-bottom: 1mm; }
</style></head><body>
<div class="pagina"><div class="cabeza"><div class="logo">${elDiente()}<span>${NEGOCIO.nombre}</span></div><h1>Lista de precios</h1><p>Odontología estética y general · Valoración sin costo</p></div>
<table>${filas}</table>
<div class="promo"><b>Promo del mes · 30 % en blanqueamiento</b><br>Válida para valoraciones agendadas este mes. Aplica con cualquier medio de pago.</div>
<div class="pie"><span>${NEGOCIO.nombre} · WhatsApp +57 310 555 0142</span><span>1 / 2</span></div></div>
<div class="pagina"><div class="cabeza"><div class="logo">${elDiente()}<span>${NEGOCIO.nombre}</span></div><h1>Financiación</h1><p>Hasta 6 cuotas sin interés en todos los tratamientos</p></div>
<div class="bloque"><h2>Así se paga un blanqueamiento</h2><div class="cuotas"><div><b>1</b>pago de ${PRECIO(315000)}</div><div><b>3</b>cuotas de ${PRECIO(105000)}</div><div><b>6</b>cuotas de ${PRECIO(52500)}</div></div></div>
<div class="bloque"><h2>Cómo agendar</h2><p>Escríbenos por WhatsApp y te respondemos al instante: te damos los cupos disponibles, agendamos tu valoración y te recordamos la cita un día antes.</p></div>
<div class="pie"><span>${NEGOCIO.nombre} · WhatsApp +57 310 555 0142</span><span>2 / 2</span></div></div>
</body></html>`;
}

const DIAPOSITIVAS = [
    { titulo: "Conoce Clínica Sonríe", texto: "Tu sonrisa, en las mejores manos", fondo: "linear-gradient(135deg, #0f766e, #134e4a)" },
    { titulo: "Tecnología de última generación", texto: "Blanqueamiento LED · Escáner 3D · Rayos X digitales", fondo: "linear-gradient(135deg, #0e7490, #155e75)" },
    { titulo: "Especialistas certificados", texto: "Valoración gratis · Hasta 6 cuotas sin interés", fondo: "linear-gradient(135deg, #0d9488, #0f766e)" },
];

function unaDiapositiva(d, i) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1280px; height: 720px; overflow: hidden; background: ${d.fondo}; color: #fff; position: relative; }
.circulo { position: absolute; border-radius: 50%; background: rgba(255,255,255,.07); }
.logo { position: absolute; top: 56px; left: 70px; display: flex; gap: 14px; align-items: center; font-weight: 700; font-size: 26px; }
.logo svg { width: 44px; height: 44px; }
h1 { position: absolute; left: 70px; top: 250px; font-size: 76px; font-weight: 800; letter-spacing: -2px; max-width: 900px; line-height: 1.05; }
p { position: absolute; left: 74px; top: ${i === 0 ? 350 : 430}px; font-size: 32px; opacity: .9; font-weight: 500; }
.diente { position: absolute; right: 70px; bottom: 60px; width: 300px; height: 300px; opacity: .9; }
.num { position: absolute; left: 74px; bottom: 56px; font-size: 22px; letter-spacing: 3px; opacity: .7; }
</style></head><body>
<div class="circulo" style="width:620px;height:620px;right:-160px;top:-200px"></div>
<div class="circulo" style="width:360px;height:360px;left:-120px;bottom:-160px"></div>
<div class="logo">${elDiente()}<span>${NEGOCIO.nombre}</span></div>
<h1>${d.titulo}</h1><p>${d.texto}</p>
<div class="diente">${elDiente("rgba(255,255,255,.95)")}</div>
<div class="num">0${i + 1} · 03</div>
</body></html>`;
}

/** La foto del sofá que manda la tienda del arranque: un producto de catálogo, dibujado. */
export function laFotoDelSofa() {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1080px; height: 1080px; overflow: hidden; background: radial-gradient(circle at 50% 38%, #fbfaf7 0, #efebe4 60%, #e4ded4 100%); position: relative; }
.suelo { position: absolute; left: 0; right: 0; bottom: 0; height: 330px; background: linear-gradient(180deg, #e2dbd0, #d6cec1); }
.sombra { position: absolute; left: 150px; right: 150px; bottom: 262px; height: 70px; border-radius: 50%; background: radial-gradient(closest-side, rgba(40,32,24,.38), transparent); }
svg.sofa { position: absolute; left: 110px; top: 300px; width: 860px; height: 520px; }
.tag { position: absolute; top: 70px; left: 72px; font-size: 56px; font-weight: 800; letter-spacing: -1.5px; color: #1f2937; }
.tag small { display: block; font-size: 32px; font-weight: 500; color: #6b7280; margin-top: 8px; letter-spacing: 0; }
.precio { position: absolute; top: 76px; right: 72px; background: #111827; color: #fff; font-size: 44px; font-weight: 800; padding: 14px 30px; border-radius: 999px; }
.colores { position: absolute; bottom: 90px; left: 72px; display: flex; gap: 22px; align-items: center; font-size: 30px; color: #374151; font-weight: 600; }
.colores i { width: 54px; height: 54px; border-radius: 50%; box-shadow: 0 0 0 4px #fff, 0 4px 14px rgba(0,0,0,.18); }
.colores i.on { box-shadow: 0 0 0 4px #fff, 0 0 0 9px #111827; }
</style></head><body>
<div class="suelo"></div>
<div class="sombra"></div>
<svg class="sofa" viewBox="0 0 860 520" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tela" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d949c"/><stop offset="1" stop-color="#6b727a"/></linearGradient>
    <linearGradient id="cojin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa1a9"/><stop offset="1" stop-color="#7a8189"/></linearGradient>
  </defs>
  <rect x="70" y="40" width="720" height="250" rx="46" fill="url(#tela)"/>
  <rect x="96" y="70" width="325" height="210" rx="34" fill="url(#cojin)"/>
  <rect x="439" y="70" width="325" height="210" rx="34" fill="url(#cojin)"/>
  <rect x="40" y="250" width="780" height="150" rx="40" fill="#737a82"/>
  <rect x="96" y="238" width="325" height="96" rx="30" fill="#a3aab2"/>
  <rect x="439" y="238" width="325" height="96" rx="30" fill="#a3aab2"/>
  <rect x="0" y="150" width="110" height="260" rx="44" fill="url(#tela)"/>
  <rect x="750" y="150" width="110" height="260" rx="44" fill="url(#tela)"/>
  <rect x="90" y="398" width="26" height="80" rx="8" fill="#5b4636"/>
  <rect x="744" y="398" width="26" height="80" rx="8" fill="#5b4636"/>
</svg>
<div class="tag">Sofá Oslo<small>3 puestos · gris grafito</small></div>
<div class="precio">$2.490.000</div>
<div class="colores"><i class="on" style="background:#7a8189"></i><i style="background:#c8b8a2"></i><i style="background:#2f4858"></i>Disponible en 3 colores</div>
</body></html>`;
}

/** La portada de la clase que manda la academia del arranque: una hoja de cálculo en pantalla. */
export function laClaseDeExcel() {
    const celdas = [
        ["Mes", "Ventas", "Costos", "Utilidad"],
        ["Enero", "$ 8.200", "$ 5.100", "$ 3.100"],
        ["Febrero", "$ 9.450", "$ 5.600", "$ 3.850"],
        ["Marzo", "$ 11.300", "$ 6.200", "$ 5.100"],
        ["Abril", "$ 12.800", "$ 6.900", "$ 5.900"],
    ];
    const filas = celdas.map((f, i) => `<tr>${f.map((c, j) => `<td class="${i === 0 ? "cab" : ""}${j === 3 && i > 0 ? " sel" : ""}">${c}</td>`).join("")}</tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1280px; height: 720px; overflow: hidden; background: linear-gradient(135deg, #064e3b, #065f46 55%, #047857); color: #fff; position: relative; }
.chip { position: absolute; top: 50px; left: 64px; background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.3); padding: 8px 20px; border-radius: 999px; font-size: 22px; font-weight: 700; }
h1 { position: absolute; top: 108px; left: 64px; font-size: 58px; font-weight: 800; letter-spacing: -1.5px; line-height: 1.05; }
h1 small { display: block; font-size: 30px; font-weight: 500; opacity: .85; margin-top: 10px; letter-spacing: 0; }
.hoja { position: absolute; left: 64px; bottom: 56px; width: 760px; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,.35); }
.barra { height: 40px; background: #107c41; display: flex; align-items: center; gap: 8px; padding: 0 16px; }
.barra i { width: 11px; height: 11px; border-radius: 50%; background: rgba(255,255,255,.5); }
table { width: 100%; border-collapse: collapse; color: #111827; font-size: 22px; }
td { border: 1px solid #e5e7eb; padding: 10px 14px; }
td.cab { background: #ecfdf5; font-weight: 700; color: #065f46; }
td.sel { background: #d1fae5; font-weight: 700; box-shadow: inset 0 0 0 3px #10b981; }
.profe { position: absolute; right: 70px; bottom: 60px; width: 300px; height: 300px; border-radius: 50%; background: linear-gradient(160deg, #fcd34d, #f59e0b); border: 8px solid rgba(255,255,255,.9); overflow: hidden; }
.profe .cara { position: absolute; left: 90px; top: 62px; width: 120px; height: 134px; border-radius: 50%; background: #c68a5e; }
.profe .pelo { position: absolute; left: 80px; top: 44px; width: 140px; height: 76px; border-radius: 70px 70px 20px 20px; background: #3b2418; }
.profe .cuerpo { position: absolute; left: 40px; top: 196px; width: 220px; height: 160px; border-radius: 110px 110px 0 0; background: #1e3a8a; }
</style></head><body>
<div class="chip">Curso de Excel · Clase 3</div>
<h1>Tablas dinámicas<small>De cero a reportes en 20 minutos</small></h1>
<div class="hoja"><div class="barra"><i></i><i></i><i></i></div><table>${filas}</table></div>
<div class="profe"><div class="cuerpo"></div><div class="cara"></div><div class="pelo"></div></div>
</body></html>`;
}

/**
 * El mapa que manda la agencia de viajes del arranque: un plano de calles
 * dibujado, con el punto de encuentro marcado. Dibujado y no una captura de un
 * servicio de mapas: el vídeo es público y no lleva teselas de nadie.
 */
export function elMapaDelPuntoDeEncuentro() {
    const calle = (x1, y1, x2, y2, ancho = 26) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="${ancho}" stroke-linecap="round"/>`;
    const borde = (x1, y1, x2, y2, ancho = 26) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#dcd6ca" stroke-width="${ancho + 6}" stroke-linecap="round"/>`;
    const vias = [
        [0, 150, 1200, 110, 30], [0, 420, 1200, 470, 44], [0, 610, 1200, 640, 26],
        [170, 0, 130, 680, 26], [520, 0, 560, 680, 34], [880, 0, 860, 680, 26], [1080, 0, 1120, 680, 22],
        [300, 150, 700, 460, 18],
    ];
    const manzanas = [
        [30, 180, 90, 210], [220, 190, 270, 200], [610, 180, 230, 220], [920, 170, 150, 230],
        [30, 490, 90, 100], [220, 500, 290, 100], [610, 510, 230, 90], [920, 510, 170, 90],
        [220, 20, 270, 100], [610, 20, 230, 70], [920, 20, 150, 70],
    ];
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1200px; height: 680px; overflow: hidden; background: #efe9dc; position: relative; }
svg { position: absolute; inset: 0; }
.rotulo { position: absolute; font-size: 22px; font-weight: 600; color: #6b6558; letter-spacing: .5px; }
.parque { position: absolute; left: 626px; top: 206px; width: 196px; font-size: 24px; font-weight: 700; color: #2f6b3a; text-align: center; }
</style></head><body>
<svg viewBox="0 0 1200 680" xmlns="http://www.w3.org/2000/svg">
  ${manzanas.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#e4ddcd"/>`).join("")}
  <rect x="600" y="180" width="250" height="220" rx="26" fill="#bfe3b4"/>
  <circle cx="650" cy="230" r="18" fill="#9fd08f"/><circle cx="790" cy="250" r="22" fill="#9fd08f"/><circle cx="700" cy="350" r="20" fill="#9fd08f"/><circle cx="810" cy="355" r="16" fill="#9fd08f"/>
  <path d="M0 40 C 180 60, 260 20, 420 34 S 700 10, 900 30" stroke="#a9d4f0" stroke-width="20" fill="none" stroke-linecap="round"/>
  ${vias.map(([a, b, c, d, w]) => borde(a, b, c, d, w)).join("")}
  ${vias.map(([a, b, c, d, w]) => calle(a, b, c, d, w)).join("")}
  <line x1="0" y1="420" x2="1200" y2="470" stroke="#f5c451" stroke-width="6" stroke-dasharray="26 18"/>
  <circle cx="725" cy="455" r="70" fill="rgba(234,67,53,.14)"/>
  <circle cx="725" cy="455" r="26" fill="rgba(234,67,53,.22)"/>
  <g transform="translate(725 455)">
    <path d="M0 0 C -12 -26, -44 -48, -44 -84 A 44 44 0 1 1 44 -84 C 44 -48, 12 -26, 0 0 Z" fill="#ea4335" stroke="#b3261e" stroke-width="3"/>
    <circle cx="0" cy="-84" r="16" fill="#fff"/>
  </g>
</svg>
<div class="rotulo" style="left:28px;top:398px">Calle 93</div>
<div class="rotulo" style="left:538px;top:560px;transform:rotate(-86deg);transform-origin:left top">Cra. 11</div>
<div class="rotulo" style="left:30px;top:120px">Calle 97</div>
<div class="parque">Parque de la 93</div>
</body></html>`;
}

/**
 * Lo que pintan las tarjetas del arranque. Aparte de los medios de la historia
 * porque no viajan en ninguna conversación, y exportado para que el banco
 * pinte las tarjetas con las mismas imágenes que el vídeo.
 */
export async function generarLosMediosDelMontaje(dir, navegador) {
    mkdirSync(dir, { recursive: true });
    await foto(navegador, laFotoDelSofa(), path.join(dir, MEDIOS_DEL_MONTAJE["sofa-gris"].archivo), { ancho: 1080, alto: 1080 });
    await foto(navegador, laClaseDeExcel(), path.join(dir, MEDIOS_DEL_MONTAJE["clase-de-excel"].archivo), { ancho: 1280, alto: 720 });
    await foto(navegador, elMapaDelPuntoDeEncuentro(), path.join(dir, MEDIOS_DEL_MONTAJE["mapa-punto-de-encuentro"].archivo), { ancho: 1200, alto: 680 });
}

/** El logo de la clínica, cuadrado: la foto de perfil de su WhatsApp. */
export function elLogo() {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 400px; height: 400px; overflow: hidden; background: linear-gradient(135deg, #14b8a6, #0f766e); display: grid; place-items: center; }
svg { width: 230px; height: 230px; }
</style></head><body>${elDiente()}</body></html>`;
}

async function foto(navegador, html, ruta, { ancho, alto, calidad = 88 }) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    await pagina.setContent(html, { waitUntil: "load" });
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.screenshot({ path: ruta, type: ruta.endsWith(".png") ? "png" : "jpeg", ...(ruta.endsWith(".png") ? {} : { quality: calidad }) });
    await pagina.close();
}

/** La duración de un Opus, en segundos (lo que WhatsApp enseña en la nota). */
export function duracionDeLaNota(ruta) {
    const s = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta], { encoding: "utf8" });
    return Math.max(1, Math.round(Number(s.trim())));
}

export async function generarLosMedios(dir, { chromium, ahora = Date.now(), calendario } = {}) {
    mkdirSync(dir, { recursive: true });
    // El calendario lo puede traer quien graba (el corte de YouTube va de noche); sin él, el de siempre.
    const cal = calendario ?? elCalendario(ahora);
    const navegador = await chromium.launch();
    try {
        await foto(navegador, laPromo(), path.join(dir, MEDIOS.promoDeInstagram.archivo), { ancho: 1080, alto: 1080 });
        await foto(navegador, losCupos(cal), path.join(dir, MEDIOS.horarios.archivo), { ancho: 1080, alto: 1080 });
        await foto(navegador, elLogo(), path.join(dir, "logo-sonrie.png"), { ancho: 400, alto: 400 });
        await generarLosMediosDelMontaje(dir, navegador);

        // La lista de precios: el PDF de verdad y la miniatura de su primera página.
        const pdf = await navegador.newPage();
        await pdf.setContent(laLista(), { waitUntil: "load" });
        await pdf.evaluate(() => document.fonts.ready);
        await pdf.pdf({ path: path.join(dir, MEDIOS.listaDePrecios.archivo), format: "A4", printBackground: true });
        await pdf.setViewportSize({ width: 794, height: 1123 });
        await pdf.emulateMedia({ media: "print" });
        await pdf.screenshot({ path: path.join(dir, "lista-de-precios.jpg"), type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: 794, height: 1123 } });
        await pdf.close();

        // El video: tres diapositivas con un zum lento y un fundido entre ellas.
        // En WebM (VP9) y no en MP4: el Chromium con el que se graba no trae
        // H.264, así que un MP4 salía en blanco en WhatsApp Web y en el panel.
        const cuadros = [];
        for (const [i, d] of DIAPOSITIVAS.entries()) {
            const r = path.join(dir, `diapositiva-${i}.png`);
            await foto(navegador, unaDiapositiva(d, i), r, { ancho: 1280, alto: 720 });
            cuadros.push(r);
        }
        copyFileSync(cuadros[0], path.join(dir, MEDIOS.videoDeLaClinica.portada.replace(/\.jpg$/, ".png")));
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", cuadros[0], "-q:v", "3", path.join(dir, MEDIOS.videoDeLaClinica.portada)]);
        const entradas = cuadros.flatMap((c) => ["-loop", "1", "-t", "3.6", "-i", c]);
        const zum = (i) => `[${i}:v]scale=2560:1440,zoompan=z='min(zoom+0.0009,1.08)':d=90:s=1280x720:fps=25,setsar=1[v${i}]`;
        const filtro = `${zum(0)};${zum(1)};${zum(2)};[v0][v1]xfade=transition=fade:duration=0.6:offset=3[a];[a][v2]xfade=transition=fade:duration=0.6:offset=6,format=yuv420p[v]`;
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...entradas, "-filter_complex", filtro, "-map", "[v]", "-t", "9", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", path.join(dir, MEDIOS.videoDeLaClinica.archivo)]);
    } finally {
        await navegador.close();
    }

    // Las notas de voz, de la caché de voces: tal cual las mandaría WhatsApp.
    copyFileSync(rutaDeLaFrase(NOTAS_DE_VOZ.clienta.texto, CACHE_DE_VENTAS, VOZ_DE_LA_CLIENTA), path.join(dir, MEDIOS.notaDeLaClienta.archivo));
    copyFileSync(rutaDeLaFrase(NOTAS_DE_VOZ.ia.texto, CACHE_DE_VENTAS, VOZ_DE_SOFIA), path.join(dir, MEDIOS.notaDeLaIa.archivo));

    const segundos = {
        notaDeLaClienta: duracionDeLaNota(path.join(dir, MEDIOS.notaDeLaClienta.archivo)),
        notaDeLaIa: duracionDeLaNota(path.join(dir, MEDIOS.notaDeLaIa.archivo)),
    };
    writeFileSync(path.join(dir, "medios.json"), JSON.stringify({ calendario: cal, segundos, clienta: CLIENTA.nombre }, null, 2));
    return { calendario: cal, segundos };
}
