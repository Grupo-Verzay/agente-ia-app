/**
 * La línea de estado de la cabecera de la conversación, pintada por la
 * `ChatHeader` REAL sobre el CSS del build.
 *
 * Lo que se pide, en cada uno de los seis casos (escribiendo, grabando, en
 * línea, últ. vez, anuncio y nada):
 *
 *   1. La cabecera sigue midiendo 78 px, con 6 px de margen y la fila 1 a 32.
 *   2. La línea de debajo del nombre se VE ENTERA: su caja cae dentro de la
 *      fila 1 y es lo que hay en su propio punto (`elementFromPoint`) arriba,
 *      en medio y abajo.
 *   3. Va DEBAJO del nombre y en letra más pequeña.
 *   4. El lápiz de editar y los iconos de la fila siguen midiendo 28×28.
 *   5. El nombre no se recorta en vertical (el emoji incluido).
 *
 * `MODO=roto` pinta el mismo arnés con la `ChatHeader` de `ANTES_REF` y afirma
 * el fallo: la línea queda recortada por el bloque de 32 px.
 * Se levanta con `scripts/banco-estado-en-la-cabecera.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROTO = process.env.MODO === "roto";
// Cada prueba afirma el fallo de SU «antes»; con el otro no hay nada que afirmar.
const ANTES = process.env.ANTES_REF ?? "";
const saltarSiNoEs = (ref) => (ROTO && ANTES !== ref ? `el modo roto de esta prueba es ${ref}` : false);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "estado-en-la-cabecera.js");
const CSS_FICHERO = process.env.CSS_DEL_BANCO;
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = CSS_FICHERO
    ? fs.readFileSync(CSS_FICHERO, "utf8")
    : fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n");

const CASOS = ["escribiendo", "grabando", "en_linea", "ultima_vez", "anuncio"];
const TEXTOS = {
    escribiendo: "escribiendo…",
    grabando: "grabando audio…",
    en_linea: "en línea",
    ultima_vez: "últ. vez",
    anuncio: "Campaña de septiembre",
};
const ANCHURAS = [1440, 1280, 1024];

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS}</style>` +
                    // Poppins como la sirve `next/font` en `app/layout.tsx`: su
                    // familia y un respaldo, y NINGUNA fuente de emojis en la pila,
                    // así que los emojis caen en la del sistema, como en producción.
                    `<style>@font-face{font-family:__poppins;src:url(/p400.woff2);font-weight:400}` +
                    `@font-face{font-family:__poppins;src:url(/p700.woff2);font-weight:700}` +
                    `@font-face{font-family:__poppins_Fallback;src:local("Arial")}` +
                    `body{font-family:__poppins,__poppins_Fallback}</style>` +
                    `<style>html,body{margin:0;height:100%;overflow:hidden}</style>` +
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `</head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/p400.woff2" || u === "/p700.woff2") {
            res.writeHead(200, { "Content-Type": "font/woff2" });
            res.end(fs.readFileSync(join(RAIZ, "app", "fonts", u === "/p400.woff2" ? "poppins-400.woff2" : "poppins-700.woff2")));
            return;
        }
        if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

function medir(casos) {
    const caja = (n) => {
        const r = n.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
    };
    const out = {};
    for (const id of casos) {
        const raiz = document.querySelector(`[data-caso="${id}"]`);
        const esc = raiz?.querySelector("[data-cabecera-escritorio]");
        if (!esc) { out[id] = null; continue; }
        const fila1 = esc.firstElementChild;
        const bloque = esc.querySelector("[data-nombre-y-estado]") ?? fila1.querySelector(".flex.h-8.flex-col");
        const h2 = bloque.querySelector("h2");
        const texto = TEXTOS_PAGINA[id];
        // La línea de estado: el hijo del bloque que dice lo que toca.
        const linea = Array.from(bloque.children).find((n) => n.tagName === "SPAN" && n.textContent.includes(texto)) ?? null;
        const lapiz = bloque.querySelector('button[title="Editar contacto"]');
        const iconos = Array.from(fila1.querySelectorAll("button"))
            .filter((b) => b !== lapiz && !bloque.contains(b) && b.getBoundingClientRect().width > 0)
            .map((b) => caja(b));
        // El lápiz sin recortar: lo de ARRIBA de su caja (que asoma sobre la
        // línea del nombre) y su glifo. Lo de abajo lo pisa la línea de estado,
        // que va después: se prefiere a que su fondo tape el texto al pasar.
        let lapizSeVe = null;
        if (lapiz) {
            const c = caja(lapiz);
            lapizSeVe = [c.t + 1, c.t + c.h / 2].map((y) => {
                const n = document.elementFromPoint(c.l + c.w / 2, y);
                return Boolean(n && (n === lapiz || lapiz.contains(n)));
            });
        }
        let seVe = null;
        if (linea) {
            const c = caja(linea);
            const x = c.l + Math.min(8, c.w / 2);
            seVe = [c.t + 1, c.t + c.h / 2, c.b - 1].map((y) => {
                const n = document.elementFromPoint(x, y);
                return Boolean(n && (n === linea || linea.contains(n)));
            });
        }
        const est = getComputedStyle(esc);
        out[id] = {
            cabecera: caja(esc),
            padding: [est.paddingTop, est.paddingRight, est.paddingBottom, est.paddingLeft].map(parseFloat),
            fila1: caja(fila1),
            bloque: caja(bloque),
            nombre: caja(h2),
            // Solo recorta si su desbordamiento a lo alto no es visible.
            nombreRecortado: getComputedStyle(h2).overflowY !== "visible" && h2.scrollHeight > h2.clientHeight + 1,
            letraNombre: parseFloat(getComputedStyle(h2).fontSize),
            linea: linea ? caja(linea) : null,
            letraLinea: linea ? parseFloat(getComputedStyle(linea).fontSize) : null,
            interlineadoLinea: linea ? parseFloat(getComputedStyle(linea).lineHeight) : null,
            seVe,
            lapizSeVe,
            lapiz: lapiz ? caja(lapiz) : null,
            iconos,
        };
    }
    return out;
}

test("la línea de estado se ve entera dentro de los 78 px de la cabecera", { skip: saltarSiNoEs("6686021") }, async () => {
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const fallos = [];
    try {
        for (const ancho of ANCHURAS) {
            const page = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
            const errores = [];
            page.on("pageerror", (e) => errores.push(String(e)));
            await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
            await page.waitForFunction(() => document.querySelectorAll("[data-cabecera-escritorio]").length >= 6, null, { timeout: 15000 });
            assert.deepEqual(errores, [], `errores al pintar a ${ancho}: ${errores.join(" | ")}`);
            const m = await page.evaluate(
                ({ fn, casos, textos }) => {
                    window.TEXTOS_PAGINA = textos;
                    return new Function(`return (${fn})`)()(casos);
                },
                { fn: medir.toString(), casos: [...CASOS, "nada"], textos: { ...TEXTOS, nada: "\u0000" } },
            );
            for (const id of [...CASOS, "nada"]) {
                const d = m[id];
                const donde = `${ancho}/${id}`;
                if (!d) { fallos.push(`${donde}: no se pintó la cabecera`); continue; }
                console.log(
                    `${donde.padEnd(18)} cabecera ${d.cabecera.h}  fila1 ${d.fila1.h}  nombre ${d.nombre.t - d.fila1.t}→${d.nombre.b - d.fila1.t} (${d.letraNombre}px)` +
                        (d.linea ? `  linea ${(d.linea.t - d.fila1.t).toFixed(1)}→${(d.linea.b - d.fila1.t).toFixed(1)} (${d.letraLinea}px) se ve ${d.seVe}` : "  sin línea") +
                        (d.lapiz ? `  lápiz ${d.lapiz.w}×${d.lapiz.h}` : ""),
                );
                // 1. El alto y el margen no se mueven.
                if (Math.abs(d.cabecera.h - 78) > 0.5) fallos.push(`${donde}: la cabecera mide ${d.cabecera.h}, no 78`);
                if (d.padding.some((p) => Math.abs(p - 6) > 0.5)) fallos.push(`${donde}: el margen es ${d.padding}, no 6`);
                if (Math.abs(d.fila1.h - 32) > 0.5) fallos.push(`${donde}: la fila 1 mide ${d.fila1.h}, no 32`);
                // 4. Los 28×28.
                if (!d.lapiz || Math.abs(d.lapiz.w - 28) > 0.5 || Math.abs(d.lapiz.h - 28) > 0.5)
                    fallos.push(`${donde}: el lápiz mide ${d.lapiz?.w}×${d.lapiz?.h}, no 28×28`);
                if (d.lapiz && (d.lapiz.t < d.cabecera.t || d.lapiz.b > d.cabecera.b || d.lapizSeVe?.some((v) => !v)))
                    fallos.push(`${donde}: el lápiz no se ve entero (${d.lapizSeVe})`);
                for (const ic of d.iconos)
                    if (Math.abs(ic.h - 28) > 0.5 || ic.w < 27.5) fallos.push(`${donde}: un icono de la fila mide ${ic.w}×${ic.h}`);
                // 5. El nombre entero.
                if (d.nombreRecortado) fallos.push(`${donde}: el nombre se recorta en vertical`);
                if (d.nombre.t < d.fila1.t - 0.5 || d.nombre.b > d.fila1.b + 0.5) fallos.push(`${donde}: el nombre se sale de la fila`);
                if (id === "nada") continue;
                // 2. La línea, entera y a la vista.
                if (!d.linea) { fallos.push(`${donde}: no hay línea de estado`); continue; }
                if (d.linea.t < d.fila1.t - 0.5 || d.linea.b > d.fila1.b + 0.5)
                    fallos.push(`${donde}: la línea (${d.linea.t - d.fila1.t}→${d.linea.b - d.fila1.t}) se sale de la fila 1`);
                if (d.linea.b > d.bloque.b + 0.5 || d.linea.t < d.bloque.t - 0.5) fallos.push(`${donde}: la línea queda fuera de su bloque (recortada)`);
                // Una línea aplastada (su caja más baja que su interlineado) se
                // recorta a sí misma: es lo que pasaba, con 4 px de alto.
                if (d.linea.h < d.interlineadoLinea - 0.5)
                    fallos.push(`${donde}: la línea está aplastada (${d.linea.h} px de ${d.interlineadoLinea})`);
                if (!d.seVe || d.seVe.some((v) => !v)) fallos.push(`${donde}: la línea no se ve entera (${d.seVe})`);
                // 3. Debajo del nombre y más pequeña.
                if (d.linea.t < d.nombre.b - 0.5) fallos.push(`${donde}: la línea no va debajo del nombre`);
                if (!(d.letraLinea < d.letraNombre)) fallos.push(`${donde}: la letra de la línea (${d.letraLinea}) no es más pequeña que la del nombre (${d.letraNombre})`);
            }
            await page.close();
        }
    } finally {
        await navegador.close();
        server.close();
    }
    if (ROTO) {
        const recortes = fallos.filter((f) => /aplastada|no se ve entera|fuera de su bloque|se sale de la fila 1/.test(f));
        console.log(`MODO=roto: ${fallos.length} fallos, ${recortes.length} de línea recortada`);
        assert.ok(recortes.length >= CASOS.length * ANCHURAS.length, `el modo roto no reproduce el recorte:\n${fallos.join("\n")}`);
    } else {
        assert.deepEqual(fallos, []);
    }
});

/**
 * Lo que se pidió en la segunda vuelta, medido y no leído:
 *
 *   A. La línea de estado va a 12 px (era 11) y se pinta igual sin recorte que
 *      con él: nada suyo se corta a lo alto.
 *   B. El nombre de la cabecera se pinta con la MISMA letra que la fila de la
 *      lista (familia, tamaño, peso, estilo, transformación y las fuentes que
 *      de verdad usa el navegador para cada glifo, emojis incluidos).
 *   C. El nombre de la cabecera, con emojis, se pinta igual con su recorte que
 *      sin él: los emojis no se cortan arriba ni abajo. Es lo que dejaba
 *      cuadritos vacíos: una línea de 18 px con `overflow: hidden`.
 *
 * La comparación por píxeles es la única que caza el recorte: con
 * `overflow: hidden` el `scrollHeight` de la línea es su interlineado, diga lo
 * que diga la tinta del emoji.
 */
async function pintaIgualSinRecorte(page, selector) {
    const caja = await page.$eval(selector, (n) => {
        const r = n.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    // Unos píxeles de más arriba y abajo: es donde asoma lo recortado.
    const clip = { x: Math.max(0, caja.x - 2), y: Math.max(0, caja.y - 6), width: caja.width + 4, height: caja.height + 12 };
    const antes = await page.screenshot({ clip });
    await page.$eval(selector, (n) => {
        n.dataset.sinRecorte = "1";
        n.style.setProperty("overflow", "visible", "important");
        n.style.setProperty("text-overflow", "clip", "important");
        for (let p = n.parentElement; p && !p.matches("[data-cabecera-escritorio]"); p = p.parentElement)
            p.style.setProperty("overflow", "visible", "important");
    });
    const despues = await page.screenshot({ clip });
    return Buffer.compare(antes, despues) === 0;
}

test("12 px en la línea, el nombre como en la lista, y nada se corta a lo alto", { skip: saltarSiNoEs("1a1f6a8") }, async () => {
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const fallos = [];
    try {
        for (const ancho of ANCHURAS) {
            for (const id of CASOS) {
                const page = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
                await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
                await page.waitForFunction(() => document.querySelectorAll("[data-cabecera-escritorio]").length >= 6, null, { timeout: 15000 });
                await page.evaluate(() => document.fonts.ready);
                const donde = `${ancho}/${id}`;
                const cab = `[data-caso="${id}"] [data-cabecera-escritorio]`;
                const nombre = `${cab} [data-nombre-y-estado] h2`;
                const linea = `${cab} [data-nombre-y-estado] > span`;
                const lista = `[data-fila-de-la-lista] .app-item-title`;

                // A. 12 px, y sin cortes a lo alto.
                const letra = await page.$eval(linea, (n) => parseFloat(getComputedStyle(n).fontSize));
                if (letra !== 12) fallos.push(`${donde}: la línea de estado va a ${letra} px, no a 12`);

                // B. La misma letra que la lista.
                const estilo = (sel) =>
                    page.$eval(sel, (n) => {
                        const e = getComputedStyle(n);
                        return [e.fontFamily, e.fontSize, e.fontWeight, e.fontStyle, e.textTransform, e.letterSpacing, e.fontFeatureSettings].join(" | ");
                    });
                const [eCab, eLista] = [await estilo(nombre), await estilo(lista)];
                if (eCab !== eLista) fallos.push(`${donde}: el nombre de la cabecera (${eCab}) no se pinta como la lista (${eLista})`);
                const cdp = await page.context().newCDPSession(page);
                await cdp.send("DOM.enable");
                await cdp.send("CSS.enable");
                const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
                const fuentes = async (sel) => {
                    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
                    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
                    return fonts.map((f) => `${f.postScriptName}:${f.glyphCount}`).sort().join(",");
                };
                const [fCab, fLista] = [await fuentes(nombre), await fuentes(lista)];
                if (fCab !== fLista) fallos.push(`${donde}: glifos con otras fuentes: cabecera ${fCab} / lista ${fLista}`);

                // C. Ni el nombre ni la línea se cortan a lo alto. Dos pruebas:
                // la geométrica —¿recorta a lo alto una caja más baja que lo que
                // reserva la fuente de emojis?— vale en cualquier sistema (en
                // Windows Segoe UI Emoji reserva ~1,33 em); la de píxeles mira la
                // tinta en ESTE Chromium.
                const geo = await page.$eval(nombre, (h2) => {
                    const sonda = document.createElement("span");
                    sonda.textContent = "🌷🌼🙏🏻";
                    h2.appendChild(sonda);
                    const alto = sonda.getBoundingClientRect().height;
                    sonda.remove();
                    return { alto, caja: h2.clientHeight, oy: getComputedStyle(h2).overflowY };
                });
                if (geo.oy !== "visible" && geo.alto > geo.caja + 0.5)
                    fallos.push(`${donde}: el nombre recorta a lo alto (${geo.oy}): caja de ${geo.caja} px y el emoji reserva ${geo.alto.toFixed(1)}`);
                if (!(await pintaIgualSinRecorte(page, linea))) fallos.push(`${donde}: la línea de estado se corta a lo alto`);
                if (!(await pintaIgualSinRecorte(page, nombre))) fallos.push(`${donde}: el nombre (con sus emojis) se corta a lo alto`);
                if (id === CASOS[0]) console.log(`${donde.padEnd(18)} línea ${letra}px · nombre ${eCab} · fuentes ${fCab}`);
                await page.close();
            }
        }
    } finally {
        await navegador.close();
        server.close();
    }
    if (ROTO) {
        console.log(`MODO=roto:\n  ${fallos.join("\n  ")}`);
        assert.ok(fallos.some((f) => /no a 12/.test(f)), "el modo roto no reproduce los 11 px");
        assert.ok(fallos.some((f) => /no se pinta como la lista/.test(f)), "el modo roto no reproduce la letra distinta de la lista");
        assert.ok(fallos.some((f) => /el nombre recorta a lo alto/.test(f)), "el modo roto no reproduce el recorte de los emojis");
    } else {
        assert.deepEqual(fallos, []);
    }
});
