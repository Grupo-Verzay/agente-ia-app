/**
 * «Ver tutoriales» no sale en el teléfono, y en escritorio no cambia nada.
 *
 * Lo reportado (captura de un celular): en la barra de arriba no caben ocho
 * iconos, y el selector Chats ⇄ Correos se montaba ENCIMA del botón rojo de
 * tutoriales. Ese botón sobra en el teléfono: «Ayuda», al lado, lleva al centro
 * de ayuda con todas las guías.
 *
 * Dos mitades:
 *  1. La regla y un barrido del código, sin navegador: el corte es `sm` (el
 *     mismo con el que la barra deja los botones solo con el icono), y desde
 *     ahí el botón lleva EXACTAMENTE las clases de antes.
 *  2. En Chromium, sobre el CSS del build, la `Breadcrumbs` de VERDAD con
 *     «Soporte» pintado:
 *     - Teléfono (320/360/390/412/600): el botón está en el DOM pero no ocupa
 *       sitio; nada se monta sobre nada; buscar, ayuda, soporte y la campana
 *       siguen; y la barra queda en el MISMO píxel que una pantalla sin
 *       tutoriales —el resto, igual—.
 *     - Desde 640 (640/768/1024/1280/1440): cada caja de la barra en el MISMO
 *       píxel que con la barra de antes, y el botón rojo con «Ver tutoriales».
 *
 * `MODO=roto` corre contra la barra de `ANTES_REF` y afirma el fallo: el botón
 * visible en el teléfono y el selector encima de él.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    /* sin navegador el banco se cae abajo */
}
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "4af691d";
const C = join(AQUI, ".compilado", "tutoriales-en-el-movil");
const HOY = join(C, "hoy.js");
const ANTES = join(C, "antes.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
if (!(chromium && CSS && fs.existsSync(HOY) && fs.existsSync(ANTES))) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exit(1);
}
const CLASE_DE_LA_FUENTE = (CSS.match(/\.(__className_[a-z0-9]+)\{font-family:__poppins/) ?? [])[1] ?? "";
const {
    ANCHO_DESDE_EL_QUE_SALEN_LOS_TUTORIALES_PX,
    BOTON_DE_TUTORIALES_EN_LA_BARRA,
} = await import(join(C, "tutoriales-del-modulo.mjs"));

const hoy = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => execSync(`git show ${ANTES_REF}:${f}`, { cwd: RAIZ, maxBuffer: 1 << 24 }).toString();
const clases = (s) => s.trim().split(/\s+/).filter(Boolean);
/** Las clases del botón de tutoriales en una `Breadcrumbs`, sean literales o la constante. */
function lasClasesDelBoton(fuente) {
    // Solo la etiqueta de apertura del `<Button>`: dentro va el icono, con
    // sus propias clases.
    const desde = fuente.indexOf("<Button", fuente.indexOf("<DialogTrigger"));
    const etiqueta = fuente.slice(desde, fuente.indexOf("<Play", desde));
    if (etiqueta.includes("className={BOTON_DE_TUTORIALES_EN_LA_BARRA}")) return clases(BOTON_DE_TUTORIALES_EN_LA_BARRA);
    const literal = etiqueta.match(/className="([^"]+)"/)?.[1];
    return literal ? clases(literal) : null;
}

const TELEFONOS = [[320, 640], [360, 740], [390, 844], [412, 915], [600, 960]];
const ESCRITORIO = [[640, 900], [768, 1024], [1024, 768], [1280, 800], [1440, 900]];
const RUTAS = ["/chats", "/sessions"];

// ─── 1. La regla y el código ──────────────────────────────────────────────

test("la regla: escondido hasta `sm` (640 px), y desde ahí el botón de siempre", () => {
    assert.equal(ANCHO_DESDE_EL_QUE_SALEN_LOS_TUTORIALES_PX, 640, "el corte es `sm`, el de las palabras de la barra");
    const c = clases(BOTON_DE_TUTORIALES_EN_LA_BARRA);
    assert.ok(c.includes("hidden"), "por debajo de `sm` no sale");
    assert.ok(c.includes("sm:inline-flex"), "desde `sm` sale, como el `inline-flex` de un Button");
    assert.ok(!c.some((x) => /^(md|lg|xl|2xl):/.test(x)), "ningún otro corte: en tableta y escritorio, igual que siempre");
});

test("la barra usa la regla, y desde `sm` el botón lleva EXACTAMENTE las clases de antes", () => {
    const ahora = hoy("components/custom/Breadcrumbs.tsx");
    const antes = deAntes("components/custom/Breadcrumbs.tsx");
    const deHoy = lasClasesDelBoton(ahora);
    const viejas = lasClasesDelBoton(antes);
    assert.ok(viejas, "no se encontró el botón de tutoriales en la barra de antes");
    if (ROTO) {
        assert.ok(!viejas.includes("hidden"), "ANTES el botón salía en todas las anchuras");
        return;
    }
    assert.ok(ahora.includes("className={BOTON_DE_TUTORIALES_EN_LA_BARRA}"), "la barra no usa la regla");
    assert.ok(ahora.includes("Ver tutoriales"), "«Ver tutoriales» sigue en la barra (las guías la nombran)");
    const sinCorte = deHoy.filter((x) => x !== "hidden" && x !== "sm:inline-flex");
    assert.deepEqual([...sinCorte].sort(), [...viejas].sort(), "desde `sm` el botón no puede cambiar de aspecto");
});

// ─── 2. La barra pintada ──────────────────────────────────────────────────

let servidor, puerto, navegador;
test.before(async () => {
    const pagina = (js) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body style="margin:0" class="${CLASE_DE_LA_FUENTE}"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(js, "utf8")}</script></body></html>`;
    const paginas = { "/hoy": pagina(HOY), "/antes": pagina(ANTES) };
    servidor = http.createServer((q, res) => {
        if (q.url.startsWith("/_next/static/media/")) {
            const f = join(RAIZ, ".next", "static", "media", q.url.slice("/_next/static/media/".length));
            if (fs.existsSync(f)) {
                res.writeHead(200, { "Content-Type": "font/woff2" });
                return res.end(fs.readFileSync(f));
            }
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(paginas[q.url] ?? paginas["/hoy"]);
    }).listen(0);
    await new Promise((r) => servidor.once("listening", r));
    puerto = servidor.address().port;
    navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
});
test.after(async () => {
    await navegador?.close();
    servidor?.close();
});

/** Todo lo que se mide de la barra, en coordenadas de la página. */
function medir() {
    const header = document.querySelector("header");
    const caja = (el) => {
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left * 2) / 2, y: Math.round(b.top * 2) / 2, w: Math.round(b.width * 2) / 2, h: Math.round(b.height * 2) / 2 };
    };
    const tutoriales = [...header.querySelectorAll("button")].find((b) => b.textContent.includes("Ver tutoriales"));
    const sel = header.querySelector("[data-alternar-bandeja]");
    const derecha = header.querySelector("[data-botones-de-la-barra]");
    // Lo que se ve de la barra: el menú, el selector y cada botón de la derecha.
    const piezas = [
        ["menu", header.querySelector("[data-sidebar=trigger]")],
        ["selector", sel],
        // Por su nombre y no por su posición: el botón escondido sigue siendo
        // un hijo de la fila, y contar posiciones las correría.
        ...[...derecha.children].map((el, i) => [
            el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent.trim().slice(0, 14) || `derecha-${i}`,
            el,
        ]),
    ].filter(([, el]) => el);
    const visibles = piezas
        .map(([que, el]) => [que, el, el.getBoundingClientRect()])
        .filter(([que, el, b]) => b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden");
    // Dos piezas que se montan: cualquier par de cajas que se corten.
    const montadas = [];
    for (let i = 0; i < visibles.length; i++) {
        for (let j = i + 1; j < visibles.length; j++) {
            const a = visibles[i][2];
            const b = visibles[j][2];
            const corte = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            if (corte > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) {
                montadas.push(`${visibles[i][0]} × ${visibles[j][0]} (${Math.round(corte)} px)`);
            }
        }
    }
    // Lo que hay de verdad en el centro del botón de tutoriales (si se ve).
    let encima = null;
    if (tutoriales) {
        const b = tutoriales.getBoundingClientRect();
        if (b.width > 0) {
            const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            encima = el && !tutoriales.contains(el) ? (el.closest("[data-alternar-bandeja]") ? "selector" : el.tagName) : null;
        }
    }
    const fondo = tutoriales ? getComputedStyle(tutoriales).backgroundColor : null;
    return {
        hayTutoriales: !!tutoriales,
        tutoriales: tutoriales && {
            ...caja(tutoriales),
            display: getComputedStyle(tutoriales).display,
            fondo,
            texto: tutoriales.innerText.trim(),
            palabraVisible: [...tutoriales.querySelectorAll("span")].some((s) => s.getBoundingClientRect().width > 0 && s.textContent.includes("Ver tutoriales")),
        },
        encima,
        montadas,
        // Las piezas que se ven, con su caja, SIN el botón de tutoriales: para
        // comparar con una barra que no los tiene.
        resto: visibles
            .filter(([, el]) => el !== tutoriales && !el.contains(tutoriales))
            .map(([que, el]) => ({ que: el.getAttribute("aria-label") || el.getAttribute("data-sidebar") || (el.hasAttribute("data-alternar-bandeja") ? "selector" : el.textContent.trim().slice(0, 12) || que), ...caja(el) })),
        // Todas las piezas que se ven, con su caja: para comparar con la barra de antes.
        todas: visibles.map(([que, el]) => ({ que, ...caja(el) })),
        fueraDeLaPantalla: visibles.filter(([, , b]) => b.left < -0.5 || b.right > window.innerWidth + 0.5).map(([q]) => q),
        ayuda: !!header.querySelector("[data-boton-de-ayuda]") && header.querySelector("[data-boton-de-ayuda]").getBoundingClientRect().width > 0,
        soporte: [...header.querySelectorAll("button")].some((b) => /soporte/i.test(b.getAttribute("aria-label") ?? "") && b.getBoundingClientRect().width > 0),
        alto: Math.round(header.getBoundingClientRect().height),
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

async function abrir(cual, [ancho, alto], ruta, guias) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto }, isMobile: ancho < 640, hasTouch: ancho < 640 });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}/${cual}`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
    await p.evaluate((g) => { window.__conGuias = g; window.__sinLeer = { chats: 3, correo: 12 }; }, guias);
    await p.evaluate((r) => window.maquetaBarra(r, ["/chats", "/correo", "/sessions"]), ruta);
    await p.waitForSelector("header");
    // Que lleguen las guías, «Soporte» y la medida del selector.
    if (guias) await p.waitForFunction(() => [...document.querySelectorAll("header button")].some((b) => b.textContent.includes("Ver tutoriales")), null, { timeout: 5000 });
    await p.waitForFunction(() => [...document.querySelectorAll("header button")].some((b) => /soporte/i.test(b.getAttribute("aria-label") ?? "")), null, { timeout: 5000 });
    await p.waitForTimeout(400);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    const m = await p.evaluate(`(${medir})()`);
    // La campanita trae sus datos de acciones mudas con otra forma: es del arnés.
    m.errores = errores.filter((e) => !e.includes("reading 'filter'"));
    await p.close();
    return m;
}

for (const ventana of TELEFONOS) {
    for (const ruta of RUTAS) {
        test(`teléfono ${ventana[0]} px, ${ruta}: ${ROTO ? "ANTES el botón rojo salía (y a 360 px o menos, debajo del selector)" : "sin «Ver tutoriales», nada montado y el resto igual"}`, async () => {
            if (ROTO) {
                const antes = await abrir("antes", ventana, ruta, true);
                assert.ok(antes.hayTutoriales && antes.tutoriales.w > 0, "ANTES el botón de tutoriales salía en el teléfono");
                assert.ok(antes.tutoriales.display !== "none", "ANTES ocupaba sitio en la barra");
                // El fallo de la captura (un teléfono de 360 px): el selector
                // encima del botón rojo. A 390 ya cabía justo.
                if (ventana[0] <= 360) {
                    assert.ok(antes.montadas.length > 0 || antes.encima === "selector", `ANTES nada se montaba a ${ventana[0]} (${JSON.stringify(antes.montadas)})`);
                }
                return;
            }
            const con = await abrir("hoy", ventana, ruta, true);
            const sin = await abrir("hoy", ventana, ruta, false);
            assert.deepEqual(con.errores, [], "sin errores al pintar");
            assert.ok(con.hayTutoriales, "el botón está (las guías llegaron): lo que se comprueba es que no se vea");
            assert.equal(con.tutoriales.display, "none", "en el teléfono «Ver tutoriales» no se pinta");
            assert.equal(con.tutoriales.w, 0, "y no ocupa ni un píxel");
            // A 320 px (un iPhone SE de primera generación) ni sin tutoriales
            // caben los dos iconos del selector: se monta 2 px sobre el buscador
            // también en una pantalla sin tutoriales. No es lo que se arregla
            // aquí; lo que se exige ahí es que la barra sea la misma que sin
            // tutoriales (abajo). Desde 360, nada montado.
            if (ventana[0] >= 360) {
                assert.deepEqual(con.montadas, [], `nada se monta sobre nada (${JSON.stringify(con.montadas)})`);
            } else {
                assert.deepEqual(con.montadas, sin.montadas, "lo mismo que una pantalla sin tutoriales");
            }
            assert.deepEqual(con.fueraDeLaPantalla, [], "ninguna pieza se sale de la pantalla");
            assert.equal(con.desborda, false, "la página no se desplaza a lo ancho");
            assert.ok(con.ayuda, "«Ayuda» sigue: es por donde se llega a las guías");
            assert.ok(con.soporte, "«Soporte» sigue");
            // El resto, igual: la barra con tutoriales escondidos es la misma
            // que la de una pantalla sin tutoriales, pieza por pieza.
            assert.deepEqual(con.resto, sin.resto, "el resto de la barra no se mueve");
            assert.equal(con.alto, sin.alto, "la barra no cambia de alto");
        });
    }
}

for (const ventana of ESCRITORIO) {
    for (const ruta of RUTAS) {
        test(`${ventana[0]} px, ${ruta}: ${ROTO ? "ANTES ya salía (no es lo que se arregla)" : "«Ver tutoriales» igual que antes, píxel por píxel"}`, async () => {
            const antes = await abrir("antes", ventana, ruta, true);
            assert.ok(antes.hayTutoriales && antes.tutoriales.w > 0, "con la barra de antes el botón sale");
            if (ROTO) return;
            const ahora = await abrir("hoy", ventana, ruta, true);
            assert.deepEqual(ahora.errores, [], "sin errores al pintar");
            // `flex` y no `inline-flex`: dentro de la fila de la derecha (un
            // `flex`) el navegador lo da como bloque. Lo que importa es que
            // no sea `none`, y que coincida con el de antes (abajo).
            assert.ok(ahora.tutoriales.w > 0 && ahora.tutoriales.display !== "none", "el botón sale");
            assert.equal(ahora.tutoriales.h, 36, "mide lo que los botones de la derecha");
            assert.equal(ahora.tutoriales.fondo, "rgb(255, 0, 51)", "rojo, como siempre");
            assert.ok(ahora.tutoriales.palabraVisible, "con su palabra «Ver tutoriales»");
            assert.equal(ahora.tutoriales.fondo, antes.tutoriales.fondo);
            assert.equal(ahora.tutoriales.texto, antes.tutoriales.texto, "el mismo texto");
            assert.deepEqual(ahora.tutoriales, { ...antes.tutoriales }, "el botón, en el mismo píxel");
            assert.deepEqual(ahora.todas, antes.todas, "cada pieza de la barra, en el mismo píxel que antes");
            assert.equal(ahora.alto, antes.alto, "la barra mide lo mismo");
        });
    }
}
