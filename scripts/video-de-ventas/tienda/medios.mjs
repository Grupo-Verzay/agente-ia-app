/**
 * Los ARCHIVOS de la historia de Tienda Nativa: lo que se mandan Mateo y la
 * tienda.
 *
 * Igual que los de la clínica (`../medios.mjs`): nada es una foto de archivo
 * ni un recurso de terceros. Todo se dibuja aquí, con la marca de la tienda de
 * ejemplo y la tipografía del estudio, y se vuelve a generar en cada grabación.
 * El mapa va dibujado a mano, como el del arranque: la página es pública y no
 * lleva teselas de ningún servicio de mapas.
 *
 *   - el anuncio de Instagram por el que escribe Mateo (cuadrado);
 *   - el catálogo de los tres colores;
 *   - el video del producto (9 s, con su portada);
 *   - la guía de tallas y la guía de envío (PDF de una página, con miniatura);
 *   - la imagen del carrito que recupera el seguimiento;
 *   - el mapa de la dirección que comparte Mateo;
 *   - las dos notas de voz de Mateo, de la caché de voces (`narracion.mjs`);
 *   - y lo del arranque, que es el MISMO de la clínica
 *     (`generarLosMediosDelMontaje`).
 *
 * Se escribe todo en `dir`, con los nombres de `MEDIOS` (historia.mjs).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BASE, PRECIO, duracionDeLaNota, foto, generarLosMediosDelMontaje } from "../medios.mjs";
import { rutaDeLaFrase } from "../../voz-cedar.mjs";
import { CLIENTA, MEDIOS, NEGOCIO, NOTAS_DE_VOZ, PEDIDO, elCalendario } from "./historia.mjs";
import { CACHE_DE_VENTAS, VOZ_DE_MATEO } from "./narracion.mjs";

/** La marca de la tienda de ejemplo. */
export const MARCA = Object.freeze({
    tierra: "#9a3412",
    naranja: "#ea580c",
    arena: "#f5e6d3",
    oscuro: "#1c1917",
    texto: "#1c1917",
});

/** El logo: una «N» con una suela debajo, en SVG, de un color. */
export function laN(color = "#fff") {
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path fill="${color}" d="M12 46V14h8l16 20V14h8v32h-8L28 26v20z"/><path fill="${color}" opacity=".6" d="M8 52h48a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z"/></svg>`;
}

/** Un tenis dibujado, del color que se pida (el de la suela va aparte). */
export function elTenis(color = "#1c1917", suela = "#f5f5f4", cordon = "#e7e5e4") {
    return `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 150 C 30 110, 60 96, 96 92 L 160 58 C 176 48, 196 50, 208 62 L 236 92 C 268 98, 330 104, 360 122 C 378 132, 380 150, 370 156 Z" fill="${color}"/>
  <path d="M24 152 H 376 C 382 152, 384 170, 372 176 H 36 C 22 176, 18 160, 24 152 Z" fill="${suela}"/>
  <path d="M30 168 H 372" stroke="rgba(0,0,0,.12)" stroke-width="4"/>
  ${[0, 1, 2, 3].map((i) => `<line x1="${150 + i * 22}" y1="${74 + i * 6}" x2="${176 + i * 22}" y2="${96 + i * 4}" stroke="${cordon}" stroke-width="7" stroke-linecap="round"/>`).join("")}
  <path d="M250 120 C 290 116, 320 124, 344 136" stroke="${cordon}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>
  <circle cx="92" cy="122" r="12" fill="${cordon}" opacity=".5"/>
</svg>`;
}

const COLORES = Object.freeze({
    negro: { cuerpo: "#1c1917", suela: "#f5f5f4", cordon: "#e7e5e4", fondo: "#e7e5e4" },
    blanco: { cuerpo: "#fafaf9", suela: "#d6d3d1", cordon: "#a8a29e", fondo: "#cbd5e1" },
    arena: { cuerpo: "#d6b98c", suela: "#fafaf9", cordon: "#fff7ed", fondo: "#fde7cf" },
});

function elAnuncio() {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1080px; height: 1080px; overflow: hidden; background: radial-gradient(circle at 80% 20%, #fdba74 0, transparent 40%), linear-gradient(150deg, ${MARCA.naranja}, ${MARCA.tierra} 70%); color: #fff; position: relative; }
.logo { position: absolute; top: 64px; left: 72px; display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 800; letter-spacing: -.5px; }
.logo svg { width: 56px; height: 56px; }
.chip { position: absolute; top: 70px; right: 72px; background: rgba(255,255,255,.18); border: 2px solid rgba(255,255,255,.4); padding: 12px 26px; border-radius: 999px; font-size: 26px; font-weight: 600; }
.nuevo { position: absolute; top: 210px; left: 76px; font-size: 40px; font-weight: 700; letter-spacing: 8px; text-transform: uppercase; opacity: .9; }
.nombre { position: absolute; top: 260px; left: 64px; font-size: 168px; font-weight: 900; letter-spacing: -8px; line-height: 1; }
.tenis { position: absolute; top: 470px; left: 90px; width: 900px; transform: rotate(-8deg); filter: drop-shadow(0 30px 30px rgba(0,0,0,.35)); }
.precio { position: absolute; bottom: 86px; left: 76px; font-size: 76px; font-weight: 800; background: #fff; color: ${MARCA.tierra}; padding: 8px 30px 12px; border-radius: 20px; }
.envio { position: absolute; bottom: 104px; right: 76px; font-size: 30px; font-weight: 600; text-align: right; line-height: 1.35; }
</style></head><body>
<div class="logo">${laN()}<span>${NEGOCIO.nombre}</span></div>
<div class="chip">Nueva colección</div>
<div class="nuevo">Tenis</div>
<div class="nombre">${PEDIDO.producto}</div>
<div class="tenis">${elTenis()}</div>
<div class="precio">${PRECIO(PEDIDO.precio)}</div>
<div class="envio">Envío gratis desde<br>${PRECIO(PEDIDO.envioGratisDesde)}</div>
</body></html>`;
}

function elCatalogo() {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1080px; height: 1080px; overflow: hidden; background: ${MARCA.arena}; color: ${MARCA.texto}; padding: 64px 60px; }
h1 { font-size: 58px; font-weight: 900; letter-spacing: -2px; }
.sub { font-size: 28px; color: #78716c; margin-top: 8px; }
.fila { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; margin-top: 56px; }
.ficha { background: #fff; border-radius: 28px; padding: 26px 22px 30px; box-shadow: 0 10px 30px rgba(120,53,15,.12); }
.foto { height: 300px; border-radius: 20px; display: grid; place-items: center; }
.foto svg { width: 260px; }
.color { margin-top: 22px; font-size: 32px; font-weight: 800; text-transform: capitalize; }
.precio { font-size: 26px; color: ${MARCA.tierra}; font-weight: 700; margin-top: 4px; }
.tallas { margin-top: 64px; font-size: 30px; font-weight: 600; }
.tallas span { display: inline-block; border: 2px solid #d6d3d1; border-radius: 12px; padding: 8px 16px; margin: 12px 10px 0 0; background: #fff; }
</style></head><body>
<h1>${PEDIDO.producto} · 3 colores</h1>
<div class="sub">${NEGOCIO.nombre} — catálogo</div>
<div class="fila">${PEDIDO.colores.map((c) => `<div class="ficha"><div class="foto" style="background:${COLORES[c].fondo}">${elTenis(COLORES[c].cuerpo, COLORES[c].suela, COLORES[c].cordon)}</div><div class="color">${c}</div><div class="precio">${PRECIO(PEDIDO.precio)}</div></div>`).join("")}</div>
<div class="tallas">Tallas disponibles<br>${PEDIDO.tallas.map((t) => `<span>${t}</span>`).join("")}</div>
</body></html>`;
}

const DIAPOSITIVAS = Object.freeze([
    { titulo: PEDIDO.producto, sub: "Ligeros para todo el día", color: "negro" },
    { titulo: "Suela que amortigua", sub: "Pensados para caminar la ciudad", color: "arena" },
    { titulo: "Tres colores", sub: `Tallas ${PEDIDO.tallas[0]} a ${PEDIDO.tallas.at(-1)}`, color: "blanco" },
]);

function unaDiapositiva(d) {
    const c = COLORES[d.color];
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1280px; height: 720px; overflow: hidden; background: linear-gradient(120deg, ${c.fondo}, #fff 70%); color: ${MARCA.texto}; position: relative; }
.tenis { position: absolute; right: 40px; top: 170px; width: 700px; transform: rotate(-6deg); filter: drop-shadow(0 24px 24px rgba(0,0,0,.25)); }
.marca { position: absolute; left: 70px; top: 60px; font-size: 30px; font-weight: 800; color: ${MARCA.tierra}; display: flex; gap: 12px; align-items: center; }
.marca svg { width: 44px; height: 44px; }
h1 { position: absolute; left: 70px; top: 250px; width: 520px; font-size: 76px; font-weight: 900; letter-spacing: -3px; line-height: 1.02; }
p { position: absolute; left: 72px; top: 440px; width: 480px; font-size: 32px; color: #57534e; }
</style></head><body>
<div class="marca">${laN(MARCA.tierra)}<span>${NEGOCIO.nombre}</span></div>
<h1>${d.titulo}</h1><p>${d.sub}</p>
<div class="tenis">${elTenis(c.cuerpo, c.suela, c.cordon)}</div>
</body></html>`;
}

function laGuiaDeTallas() {
    const filas = PEDIDO.tallas.map((t, i) => [t, (24 + i * 0.5).toFixed(1), (t - 2.5).toFixed(1)]);
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
@page { size: A4; margin: 0; }
body { width: 794px; height: 1123px; padding: 70px 72px; color: ${MARCA.texto}; background: #fff; }
.marca { display: flex; gap: 14px; align-items: center; font-size: 26px; font-weight: 800; color: ${MARCA.tierra}; }
.marca svg { width: 42px; height: 42px; }
h1 { margin-top: 44px; font-size: 44px; font-weight: 900; letter-spacing: -1.5px; }
.sub { margin-top: 8px; color: #78716c; font-size: 20px; }
table { margin-top: 40px; width: 100%; border-collapse: collapse; font-size: 22px; }
th { text-align: left; background: ${MARCA.arena}; padding: 16px 18px; font-weight: 700; }
td { padding: 15px 18px; border-bottom: 1px solid #e7e5e4; }
tr.marcada td { background: #fff7ed; font-weight: 800; color: ${MARCA.tierra}; }
.nota { margin-top: 40px; padding: 22px 26px; border-radius: 16px; background: ${MARCA.arena}; font-size: 20px; line-height: 1.5; }
</style></head><body>
<div class="marca">${laN(MARCA.tierra)}<span>${NEGOCIO.nombre}</span></div>
<h1>Guía de tallas · ${PEDIDO.producto}</h1>
<div class="sub">Mide tu pie de talón a punta, de pie y por la tarde.</div>
<table><tr><th>Talla</th><th>Largo del pie (cm)</th><th>Talla EE. UU.</th></tr>
${filas.map(([t, cm, us]) => `<tr class="${t === 41 ? "marcada" : ""}"><td>${t}</td><td>${cm}</td><td>${us}</td></tr>`).join("")}
</table>
<div class="nota"><b>Horma normal.</b> Si estás entre dos tallas, elige la mayor. Cambios de talla gratis durante 30 días.</div>
</body></html>`;
}

function laGuiaDeEnvio(cal) {
    const dia = new Date(cal.despacho).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
@page { size: A4; margin: 0; }
body { width: 794px; height: 1123px; padding: 70px 72px; color: ${MARCA.texto}; background: #fff; }
.cab { display: flex; justify-content: space-between; align-items: center; }
.marca { display: flex; gap: 14px; align-items: center; font-size: 26px; font-weight: 800; color: ${MARCA.tierra}; }
.marca svg { width: 42px; height: 42px; }
.num { font-size: 18px; color: #78716c; text-align: right; }
.num b { display: block; font-size: 30px; color: ${MARCA.texto}; letter-spacing: 2px; }
h1 { margin-top: 48px; font-size: 40px; font-weight: 900; letter-spacing: -1px; }
.caja { margin-top: 30px; border: 2px solid #e7e5e4; border-radius: 18px; padding: 26px 28px; font-size: 22px; line-height: 1.7; }
.caja span { color: #78716c; display: inline-block; width: 190px; }
.barras { margin-top: 44px; height: 120px; background: repeating-linear-gradient(90deg, #1c1917 0 4px, transparent 4px 7px, #1c1917 7px 9px, transparent 9px 14px); border-radius: 6px; }
.codigo { text-align: center; margin-top: 12px; font-size: 24px; letter-spacing: 6px; font-weight: 700; }
</style></head><body>
<div class="cab"><div class="marca">${laN(MARCA.tierra)}<span>${NEGOCIO.nombre}</span></div><div class="num">Guía de envío<b>${PEDIDO.guia}</b></div></div>
<h1>Pedido ${PEDIDO.numero}</h1>
<div class="caja">
<div><span>Destinatario</span>${CLIENTA.nombre} ${CLIENTA.apellido ?? ""}</div>
<div><span>Dirección</span>${PEDIDO.direccion.detalle}</div>
<div><span>Ciudad</span>${PEDIDO.direccion.lugar}</div>
<div><span>Despachado</span>${dia}</div>
<div><span>Contenido</span>${PEDIDO.producto} + ${PEDIDO.extra.nombre}</div>
<div><span>Valor</span>${PRECIO(PEDIDO.total)} · envío gratis</div>
</div>
<div class="barras"></div><div class="codigo">${PEDIDO.guia}</div>
</body></html>`;
}

function elCarrito() {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1080px; height: 1080px; overflow: hidden; background: ${MARCA.arena}; color: ${MARCA.texto}; padding: 70px 64px; }
.cab { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 800; color: ${MARCA.tierra}; }
.cab svg { width: 50px; height: 50px; }
h1 { margin-top: 44px; font-size: 64px; font-weight: 900; letter-spacing: -2px; line-height: 1.05; }
.item { margin-top: 30px; background: #fff; border-radius: 26px; padding: 26px 30px; display: flex; gap: 28px; align-items: center; box-shadow: 0 10px 30px rgba(120,53,15,.1); }
.item .foto { width: 200px; height: 140px; border-radius: 18px; display: grid; place-items: center; background: #e7e5e4; flex: none; }
.item .foto svg { width: 180px; }
.item b { font-size: 34px; display: block; }
.item span { font-size: 24px; color: #78716c; }
.item .p { margin-left: auto; font-size: 34px; font-weight: 800; }
.total { margin-top: 36px; display: flex; justify-content: space-between; font-size: 40px; font-weight: 900; padding: 0 8px; }
.envio { margin-top: 10px; padding: 0 8px; font-size: 26px; color: #15803d; font-weight: 700; }
.boton { margin-top: 44px; background: ${MARCA.naranja}; color: #fff; text-align: center; font-size: 36px; font-weight: 800; padding: 26px; border-radius: 22px; }
</style></head><body>
<div class="cab">${laN(MARCA.tierra)}<span>${NEGOCIO.nombre}</span></div>
<h1>Tu carrito te está esperando</h1>
<div class="item"><div class="foto">${elTenis()}</div><div><b>${PEDIDO.producto}</b><span>Negro · talla 41</span></div><div class="p">${PRECIO(PEDIDO.precio)}</div></div>
<div class="item"><div class="foto" style="font-size:64px">🧦</div><div><b>${PEDIDO.extra.nombre}</b><span>Talla M</span></div><div class="p">${PRECIO(PEDIDO.extra.precio)}</div></div>
<div class="total"><span>Total</span><span>${PRECIO(PEDIDO.total)}</span></div>
<div class="envio">✓ Envío gratis</div>
<div class="boton">Finalizar compra</div>
</body></html>`;
}

/** El mapa de la dirección de Mateo, con el estilo del mapa del arranque. */
export function elMapaDeChapinero() {
    const calle = (x1, y1, x2, y2, ancho = 26) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="${ancho}" stroke-linecap="round"/>`;
    const borde = (x1, y1, x2, y2, ancho = 26) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#dcd6ca" stroke-width="${ancho + 6}" stroke-linecap="round"/>`;
    const vias = [
        [0, 120, 1200, 140, 28], [0, 360, 1200, 330, 46], [0, 590, 1200, 610, 26],
        [150, 0, 190, 680, 26], [470, 0, 450, 680, 30], [800, 0, 830, 680, 38], [1060, 0, 1040, 680, 22],
    ];
    const manzanas = [
        [20, 160, 100, 160], [230, 170, 190, 150], [500, 160, 270, 140], [870, 170, 140, 130],
        [20, 400, 100, 160], [230, 380, 190, 180], [500, 380, 270, 180], [870, 380, 140, 180],
        [230, 10, 190, 80], [500, 10, 270, 80], [870, 10, 140, 80],
    ];
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 1200px; height: 680px; overflow: hidden; background: #efe9dc; position: relative; }
svg { position: absolute; inset: 0; }
.rotulo { position: absolute; font-size: 22px; font-weight: 600; color: #6b6558; letter-spacing: .5px; }
.parque { position: absolute; left: 236px; top: 236px; width: 180px; font-size: 22px; font-weight: 700; color: #2f6b3a; text-align: center; }
</style></head><body>
<svg viewBox="0 0 1200 680" xmlns="http://www.w3.org/2000/svg">
  ${manzanas.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#e4ddcd"/>`).join("")}
  <rect x="225" y="165" width="200" height="160" rx="24" fill="#bfe3b4"/>
  <circle cx="270" cy="210" r="18" fill="#9fd08f"/><circle cx="380" cy="290" r="20" fill="#9fd08f"/>
  ${vias.map(([a, b, c, d, w]) => borde(a, b, c, d, w)).join("")}
  ${vias.map(([a, b, c, d, w]) => calle(a, b, c, d, w)).join("")}
  <line x1="800" y1="0" x2="830" y2="680" stroke="#f5c451" stroke-width="6" stroke-dasharray="26 18"/>
  <circle cx="640" cy="470" r="70" fill="rgba(234,67,53,.14)"/>
  <circle cx="640" cy="470" r="26" fill="rgba(234,67,53,.22)"/>
  <g transform="translate(640 470)">
    <path d="M0 0 C -12 -26, -44 -48, -44 -84 A 44 44 0 1 1 44 -84 C 44 -48, 12 -26, 0 0 Z" fill="#ea4335" stroke="#b3261e" stroke-width="3"/>
    <circle cx="0" cy="-84" r="16" fill="#fff"/>
  </g>
</svg>
<div class="rotulo" style="left:30px;top:322px">Calle 63</div>
<div class="rotulo" style="left:30px;top:92px">Calle 67</div>
<div class="rotulo" style="left:850px;top:560px;transform:rotate(-87deg);transform-origin:left top">Cra. 7</div>
<div class="parque">Parque Lourdes</div>
</body></html>`;
}

/** El logo de la tienda, cuadrado: la foto de perfil de su WhatsApp. */
export function elLogo() {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { width: 400px; height: 400px; overflow: hidden; background: linear-gradient(135deg, ${MARCA.naranja}, ${MARCA.tierra}); display: grid; place-items: center; }
svg { width: 230px; height: 230px; }
</style></head><body>${laN()}</body></html>`;
}

/** Imprime un HTML a PDF y saca la miniatura de su primera página. */
async function unPdf(navegador, html, rutaPdf, rutaMiniatura) {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "load" });
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.pdf({ path: rutaPdf, format: "A4", printBackground: true });
    await pagina.setViewportSize({ width: 794, height: 1123 });
    await pagina.emulateMedia({ media: "print" });
    await pagina.screenshot({ path: rutaMiniatura, type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: 794, height: 1123 } });
    await pagina.close();
}

/** La miniatura de un PDF: mismo nombre, en .jpg. */
export const laMiniaturaDe = (archivo) => archivo.replace(/\.pdf$/, ".jpg");

export async function generarLosMedios(dir, { chromium, ahora = Date.now() } = {}) {
    mkdirSync(dir, { recursive: true });
    const cal = elCalendario(ahora);
    const navegador = await chromium.launch();
    try {
        await foto(navegador, elAnuncio(), path.join(dir, MEDIOS.anuncio.archivo), { ancho: 1080, alto: 1080 });
        await foto(navegador, elCatalogo(), path.join(dir, MEDIOS.catalogo.archivo), { ancho: 1080, alto: 1080 });
        await foto(navegador, elCarrito(), path.join(dir, MEDIOS.carrito.archivo), { ancho: 1080, alto: 1080 });
        await foto(navegador, elMapaDeChapinero(), path.join(dir, MEDIOS.mapa.archivo), { ancho: 1200, alto: 680 });
        await foto(navegador, elLogo(), path.join(dir, "logo-nativa.png"), { ancho: 400, alto: 400 });
        await generarLosMediosDelMontaje(dir, navegador);

        await unPdf(navegador, laGuiaDeTallas(), path.join(dir, MEDIOS.guiaDeTallas.archivo), path.join(dir, laMiniaturaDe(MEDIOS.guiaDeTallas.archivo)));
        await unPdf(navegador, laGuiaDeEnvio(cal), path.join(dir, MEDIOS.guiaDeEnvio.archivo), path.join(dir, laMiniaturaDe(MEDIOS.guiaDeEnvio.archivo)));

        // El video del producto: el mismo montaje que el de la clínica (tres
        // diapositivas, zum lento y fundidos), en WebM VP9 por el mismo motivo.
        const cuadros = [];
        for (const [i, d] of DIAPOSITIVAS.entries()) {
            const r = path.join(dir, `tienda-diapositiva-${i}.png`);
            await foto(navegador, unaDiapositiva(d), r, { ancho: 1280, alto: 720 });
            cuadros.push(r);
        }
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", cuadros[0], "-q:v", "3", path.join(dir, MEDIOS.videoDelProducto.portada)]);
        const entradas = cuadros.flatMap((c) => ["-loop", "1", "-t", "3.6", "-i", c]);
        const zum = (i) => `[${i}:v]scale=2560:1440,zoompan=z='min(zoom+0.0009,1.08)':d=90:s=1280x720:fps=25,setsar=1[v${i}]`;
        const filtro = `${zum(0)};${zum(1)};${zum(2)};[v0][v1]xfade=transition=fade:duration=0.6:offset=3[a];[a][v2]xfade=transition=fade:duration=0.6:offset=6,format=yuv420p[v]`;
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...entradas, "-filter_complex", filtro, "-map", "[v]", "-t", "9", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", path.join(dir, MEDIOS.videoDelProducto.archivo)]);
    } finally {
        await navegador.close();
    }

    // Las dos notas de voz de Mateo, de la caché de voces.
    copyFileSync(rutaDeLaFrase(NOTAS_DE_VOZ.clienta.texto, CACHE_DE_VENTAS, VOZ_DE_MATEO), path.join(dir, MEDIOS.notaDelCliente.archivo));
    copyFileSync(rutaDeLaFrase(NOTAS_DE_VOZ.cambio.texto, CACHE_DE_VENTAS, VOZ_DE_MATEO), path.join(dir, MEDIOS.notaDelCambio.archivo));

    const segundos = {
        notaDelCliente: duracionDeLaNota(path.join(dir, MEDIOS.notaDelCliente.archivo)),
        notaDelCambio: duracionDeLaNota(path.join(dir, MEDIOS.notaDelCambio.archivo)),
    };
    writeFileSync(path.join(dir, "medios.json"), JSON.stringify({ calendario: cal, segundos, clienta: CLIENTA.nombre }, null, 2));
    return { calendario: cal, segundos };
}
