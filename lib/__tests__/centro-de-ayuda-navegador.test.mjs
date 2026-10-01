/**
 * El centro de ayuda PINTADO, en Chromium sobre el CSS del build y con los
 * componentes de verdad, a 1440, 1280, 1024 y 390:
 *
 * - La portada (`/ayuda`): el buscador arriba y las diez categorías debajo,
 *   en DOS columnas (una en un teléfono), todas del mismo alto, las diez
 *   siempre —también las que no tienen guías, con «Próximamente»—, y cada una
 *   lleva a su lista.
 * - El buscador encuentra por palabra clave entre las guías de CUALQUIER
 *   categoría y lleva directo a la que coincide (Enter abre la primera).
 * - Una categoría con guías: la lista vertical de Documentación › Guías —la
 *   MISMA fila, medida contra la de allí— con solo «Ver» por fila, y sin «+
 *   Nuevo», sin «Editar introducción», sin arrastrar y sin «Guías publicadas».
 * - Una categoría sin guías: «Estamos trabajando en esta guía».
 * - La barra de arriba: «Ayuda» justo antes de «Soporte», con su misma forma,
 *   y «Ver tutoriales» sigue ahí.
 * - La portada va CENTRADA —el título y el buscador— y sin subtítulo, y el
 *   buscador es más corto que la rejilla (en un teléfono, del ancho). Se mide
 *   el TEXTO del título con un `Range`, no su caja: un título a la izquierda
 *   dentro de una caja de lado a lado tiene la caja centrada igual.
 *
 * `MODO=roto` pinta la barra de `ANTES_REF` y afirma que no había «Ayuda», y
 * la portada de `ANTES_DEL_CENTRADO` y afirma el título a la izquierda, con
 * su subtítulo, y el buscador de lado a lado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
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
const C = join(AQUI, ".compilado", "centro-de-ayuda");
const ARNES_CENTRO = join(C, ROTO ? "centro-antes.js" : "centro.js");
const ARNES_BARRA = join(C, ROTO ? "barra-antes.js" : "barra-hoy.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
if (!(chromium && CSS && fs.existsSync(ARNES_BARRA) && fs.existsSync(ARNES_CENTRO))) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exit(1);
}
const CLASE_DE_LA_FUENTE = (CSS.match(/\.(__className_[a-z0-9]+)\{font-family:__poppins/) ?? [])[1] ?? "";

const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 740]];

// Las guías y las categorías son las de hoy también en el modo roto: lo que
// cambió es cómo se pinta la portada, no qué lleva.
const { lasGuiasDelCentroDeAyuda } = await import(join(C, "guias-del-centro-de-ayuda.mjs"));
const guias = lasGuiasDelCentroDeAyuda();
const ayuda = await import(join(C, "centro-de-ayuda.mjs"));

const pagina = (arnes) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="${CLASE_DE_LA_FUENTE}" style="margin:0"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(arnes, "utf8")}</script></body></html>`;

let servidor, puerto, navegador;
test.before(async () => {
    const htmlBarra = pagina(ARNES_BARRA);
    const htmlCentro = pagina(ARNES_CENTRO);
    servidor = http
        .createServer((q, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(q.url.startsWith("/barra") ? htmlBarra : htmlCentro);
        })
        .listen(0);
    await new Promise((r) => servidor.once("listening", r));
    puerto = servidor.address().port;
    navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
});
test.after(async () => {
    await navegador?.close();
    servidor?.close();
});

async function abrir(ruta, ancho, alto) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}${ruta}`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
    return { p, errores };
}

/* ------------------------------------------------------------------ */
/* La barra de arriba                                                  */
/* ------------------------------------------------------------------ */

function medirLaBarra() {
    const header = document.querySelector("header");
    const d = header.querySelector("[data-botones-de-la-barra]");
    const hijos = [...d.children].filter((h) => h.getBoundingClientRect().width > 0);
    const que = (h) =>
        h.matches("[data-boton-de-ayuda]") ? "ayuda"
        : h.matches('button[aria-label="Pedir soporte"], button[aria-label="Tickets de soporte"]') ? "soporte"
        : h.matches('button[aria-label="Centro de notificaciones"]') || h.querySelector('[aria-label="Centro de notificaciones"]') ? "campana"
        : h.textContent.includes("Ver tutoriales") || h.textContent.includes("VER TUTORIALES") ? "tutoriales"
        : h.matches('button[title^="Buscar"]') ? "buscar"
        : "otro";
    const orden = hijos.map(que);
    const caja = (h) => {
        if (!h) return null;
        const c = h.getBoundingClientRect();
        const s = getComputedStyle(h);
        return {
            x: c.left, y: c.top, w: c.width, h: c.height, derecha: c.right,
            radio: parseFloat(s.borderTopLeftRadius), borde: s.borderTopColor, color: s.color,
            texto: h.innerText.trim(), href: h.getAttribute("href"), aria: h.getAttribute("aria-label"),
        };
    };
    return {
        orden,
        ayuda: caja(d.querySelector("[data-boton-de-ayuda]")),
        soporte: caja(hijos.find((h) => que(h) === "soporte")),
        barraDerecha: header.getBoundingClientRect().right,
        selector: (header.querySelector("[data-alternar-bandeja]")?.innerText ?? "").replace(/\s+/g, " ").trim(),
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

for (const [ancho, alto] of VENTANAS) {
    test(`${ancho}: ${ROTO ? "ANTES la barra no tenía «Ayuda»" : "«Ayuda» en la barra, justo antes de «Soporte» y con su forma"}`, async () => {
        const { p, errores } = await abrir("/barra", ancho, alto);
        await p.evaluate(() => {
            window.__tutoriales = [{ id: "g", path: "/sessions", title: "Guía de Leads", description: null, url: "/guia/leads" }];
            // El menú de un cliente lleva Chats y Correos: sin ellos no se
            // pinta el selector y no habría palabras que medir.
            window.maquetaBarra("/sessions", ["/chats", "/correo", "/sessions"]);
        });
        await p.waitForSelector('[data-botones-de-la-barra] button[aria-label="Pedir soporte"]', { timeout: 10000 });
        await p.waitForTimeout(250);
        const m = await p.evaluate(`(${medirLaBarra})()`);
        assert.deepEqual(errores, []);
        if (ROTO) {
            assert.equal(m.ayuda, null, "ANTES ya había un botón «Ayuda»");
            assert.ok(!m.orden.includes("ayuda"));
            await p.close();
            return;
        }
        const i = m.orden.indexOf("ayuda");
        assert.ok(i >= 0, `no hay «Ayuda» en la barra (${m.orden.join(", ")})`);
        assert.equal(m.orden[i + 1], "soporte", `«Ayuda» no va justo antes de «Soporte» (${m.orden.join(", ")})`);
        assert.equal(m.orden[i - 1], "buscar", `delante de «Ayuda» tiene que ir el buscador (${m.orden.join(", ")})`);
        // «Ver tutoriales» sale desde `sm`; en un teléfono no (la barra no da
        // para ocho iconos y «Ayuda» ya lleva a todas las guías).
        if (ancho >= 640) assert.ok(m.orden.includes("tutoriales"), "«Ver tutoriales» ya no está");
        else assert.ok(!m.orden.includes("tutoriales"), "en un teléfono «Ver tutoriales» no sale");
        assert.equal(m.ayuda.href, "/ayuda");
        assert.equal(m.ayuda.aria, "Centro de ayuda");
        // La misma forma que «Soporte»: alto, redondeo, borde y color.
        assert.equal(Math.round(m.ayuda.h), Math.round(m.soporte.h), "«Ayuda» no mide de alto lo que «Soporte»");
        assert.equal(m.ayuda.radio, m.soporte.radio);
        assert.equal(m.ayuda.borde, m.soporte.borde);
        assert.equal(m.ayuda.color, m.soporte.color);
        assert.ok(Math.abs(m.ayuda.y - m.soporte.y) <= 0.5, "no van en la misma línea");
        assert.ok(m.ayuda.radio > 0 && m.ayuda.radio < m.ayuda.h / 2 - 1, "es un rectángulo redondeado, no una píldora");
        // Con palabra desde `sm`, como «Soporte»; en un teléfono solo el icono.
        assert.equal(m.ayuda.texto, ancho >= 640 ? "Ayuda" : "", `el rótulo a ${ancho}`);
        assert.equal(m.soporte.texto, ancho >= 640 ? "Soporte" : "");
        assert.ok(m.soporte.derecha <= m.barraDerecha, "la barra se sale por la derecha");
        // Un botón más a la derecha no puede costarle las palabras al selector
        // Chats ⇄ Correos en un portátil: a 1024 cabía «Chats Correos» y tiene
        // que seguir cabiendo (por eso el buscador mide menos por debajo de xl).
        if (ancho >= 1024) assert.equal(m.selector, "Chats Correos", `a ${ancho} el selector perdió sus palabras («${m.selector}»)`);
        assert.equal(m.desborda, false, "la página desborda");
        await p.close();
    });
}

/* ------------------------------------------------------------------ */
/* La portada del centro de ayuda                                      */
/* ------------------------------------------------------------------ */

const cuantas = ayuda.cuantasPorCategoria(guias);

function medirElCentro() {
    const raiz = document.querySelector("[data-centro-de-ayuda]");
    const tarjetas = [...raiz.querySelectorAll("[data-categoria-de-ayuda]")].map((a) => {
        const c = a.getBoundingClientRect();
        const nombre = a.querySelector("[data-nombre-de-la-categoria]");
        const pastilla = a.querySelector("[data-guias-de-la-categoria]");
        return {
            slug: a.getAttribute("data-categoria-de-ayuda"),
            href: a.getAttribute("href"),
            x: Math.round(c.left), y: Math.round(c.top), w: Math.round(c.width), h: Math.round(c.height),
            nombre: nombre.innerText.trim(),
            nombreCortado: nombre.scrollWidth > nombre.clientWidth + 1,
            pastilla: pastilla.innerText.trim(),
        };
    });
    const buscador = raiz.querySelector("[data-buscador-de-ayuda] input");
    const b = buscador.getBoundingClientRect();
    const rejilla = raiz.querySelector("[data-categorias-de-ayuda]").getBoundingClientRect();
    // El TEXTO, no la caja: la caja de un título a la izquierda ocupa la
    // fila entera y su centro coincide con el de la rejilla igual.
    const texto = (e) => {
        if (!e) return null;
        const r = document.createRange();
        r.selectNodeContents(e);
        const c = r.getBoundingClientRect();
        return { x: c.left, w: c.width, centro: c.left + c.width / 2, alineado: getComputedStyle(e).textAlign };
    };
    const titulo = raiz.querySelector("[data-titulo-de-documentacion]");
    return {
        tarjetas,
        buscador: { x: Math.round(b.left), w: Math.round(b.width), centro: b.left + b.width / 2, abajo: b.bottom, placeholder: buscador.placeholder },
        rejilla: { x: Math.round(rejilla.left), w: Math.round(rejilla.width), centro: rejilla.left + rejilla.width / 2, arriba: rejilla.top },
        textoDelTitulo: texto(titulo),
        subtitulo: titulo?.nextElementSibling?.innerText.trim() ?? null,
        volver: !!raiz.querySelector("[data-volver-a-documentacion]"),
        titulo: raiz.querySelector("h1, h2")?.innerText.trim(),
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

for (const [ancho, alto] of VENTANAS) {
    test(`${ancho}: ${ROTO ? "ANTES la portada iba a la izquierda y con el buscador de lado a lado" : "la portada — centrada, el buscador corto arriba y las diez categorías en dos columnas"}`, async () => {
        const { p, errores } = await abrir("/", ancho, alto);
        await p.evaluate((g) => { window.__guias = g; window.pintarCentro(); }, guias);
        await p.waitForSelector("[data-categoria-de-ayuda]");
        const m = await p.evaluate(`(${medirElCentro})()`);
        assert.deepEqual(errores, []);
        const centrado = (t, que) =>
            assert.ok(Math.abs(t.centro - m.rejilla.centro) <= 1.5, `${que} no está centrado: su centro ${t.centro.toFixed(1)}, el de la rejilla ${m.rejilla.centro.toFixed(1)}`);
        if (ROTO) {
            // El título arrancaba en el borde izquierdo de la rejilla, y el
            // buscador medía lo que ella.
            assert.ok(Math.abs(m.textoDelTitulo.x - m.rejilla.x) <= 1.5, `ANTES el título arrancaba en ${m.textoDelTitulo.x}, no en ${m.rejilla.x}`);
            assert.ok(Math.abs(m.textoDelTitulo.centro - m.rejilla.centro) > 50, "ANTES el título ya iba centrado");
            assert.equal(m.buscador.w, m.rejilla.w, "ANTES el buscador ya era más corto que la rejilla");
            assert.match(m.subtitulo ?? "", /Busca una guía/, "ANTES ya no había subtítulo");
            await p.close();
            return;
        }

        // Centrados, el título y el buscador; y sin subtítulo debajo.
        centrado(m.textoDelTitulo, "el título");
        assert.equal(m.textoDelTitulo.alineado, "center");
        assert.equal(m.subtitulo, null, `la portada volvió a llevar subtítulo: «${m.subtitulo}»`);
        centrado(m.buscador, "el buscador");
        // Más corto que la rejilla —no de lado a lado—. En un teléfono el
        // tope no muerde: del ancho, que es lo que hace falta ahí.
        if (ancho >= 1024) {
            assert.ok(m.buscador.w < m.rejilla.w * 0.6, `el buscador ocupa casi todo el ancho: ${m.buscador.w} de ${m.rejilla.w}`);
            assert.ok(m.buscador.w >= 480, `el buscador quedó demasiado corto: ${m.buscador.w}`);
        } else {
            assert.equal(m.buscador.w, m.rejilla.w, "en un teléfono el buscador tiene que ser del ancho");
        }
        assert.equal(m.titulo, "Centro de ayuda");
        assert.equal(m.volver, false, "la portada no lleva flecha de volver a Documentación");

        // Las diez, en su orden, siempre.
        assert.deepEqual(m.tarjetas.map((t) => t.slug), ayuda.CATEGORIAS_DE_AYUDA.map((c) => c.slug));
        assert.deepEqual(m.tarjetas.map((t) => t.nombre), ayuda.CATEGORIAS_DE_AYUDA.map((c) => c.nombre));
        for (const t of m.tarjetas) {
            assert.equal(t.href, `/ayuda/${t.slug}`);
            assert.equal(t.nombreCortado, false, `el nombre de «${t.nombre}» sale recortado`);
            const n = cuantas[t.slug];
            assert.equal(t.pastilla, n > 0 ? ayuda.elNumeroDeGuias(n) : "Próximamente", `la pastilla de «${t.nombre}»`);
        }
        assert.ok(m.tarjetas.some((t) => t.pastilla === "Próximamente"), "ninguna categoría sin guías: no se ejerce el caso");

        // Dos columnas desde `sm`, una en un teléfono; todas iguales.
        const columnas = [...new Set(m.tarjetas.map((t) => t.x))];
        assert.equal(columnas.length, ancho >= 640 ? 2 : 1, `columnas a ${ancho}: ${columnas}`);
        assert.equal(new Set(m.tarjetas.map((t) => t.w)).size, 1, "las tarjetas no miden lo mismo de ancho");
        assert.equal(new Set(m.tarjetas.map((t) => t.h)).size, 1, "las tarjetas no miden lo mismo de alto");
        if (ancho >= 640) {
            // Cinco filas de dos, sin la última a medias.
            assert.equal(new Set(m.tarjetas.map((t) => t.y)).size, 5);
        }
        // El buscador arriba de las categorías.
        assert.ok(m.buscador.abajo <= m.rejilla.arriba, "el buscador no va arriba de las categorías");
        assert.equal(m.desborda, false, "la página desborda");
        await p.close();
    });
}

test("el buscador de la portada mide lo mismo a 1440, 1280 y 1024", { skip: ROTO && "se ejerce en el modo bueno" }, async () => {
    const anchos = [];
    for (const [ancho, alto] of VENTANAS.filter(([a]) => a >= 1024)) {
        const { p } = await abrir("/", ancho, alto);
        await p.evaluate((g) => { window.__guias = g; window.pintarCentro(); }, guias);
        await p.waitForSelector("[data-categoria-de-ayuda]");
        anchos.push((await p.evaluate(`(${medirElCentro})()`)).buscador.w);
        await p.close();
    }
    assert.equal(new Set(anchos).size, 1, `el buscador cambia de ancho con la ventana: ${anchos}`);
});

if (!ROTO) {
    test("el buscador encuentra en cualquier categoría y lleva directo a lo que coincide", async () => {
        const { p, errores } = await abrir("/", 1280, 800);
        await p.evaluate((g) => {
            window.__guias = g;
            window.__abiertas = [];
            window.open = (url, destino, rasgos) => { window.__abiertas.push({ url, destino, rasgos }); return null; };
            window.pintarCentro();
        }, guias);
        const caja = p.locator("[data-buscador-de-ayuda] input");
        await caja.click();

        // «exportar»: no es el nombre de ninguna guía, lleva a una SECCIÓN.
        await caja.pressSequentially("exportar", { delay: 20 });
        await p.waitForSelector("[data-resultado-de-ayuda]");
        const res = await p.$$eval("[data-resultado-de-ayuda]", (as) =>
            as.map((a) => ({ modulo: a.getAttribute("data-resultado-de-ayuda"), seccion: a.getAttribute("data-seccion"), href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel") })),
        );
        // La lista cuelga del buscador: mide lo que él, no lo que la rejilla.
        const [lista, entrada] = await p.evaluate(() =>
            ["[data-resultados-de-ayuda]", "[data-buscador-de-ayuda] input"].map((q) => {
                const c = document.querySelector(q).getBoundingClientRect();
                return [Math.round(c.left), Math.round(c.width)];
            }),
        );
        assert.deepEqual(lista, entrada, "la lista de resultados no mide lo que el buscador");
        const esperados = ayuda.buscarEnLasGuias(guias, "exportar");
        assert.deepEqual(res.map((r) => r.href), esperados.map((r) => r.url), "la lista no es la que dice la regla");
        assert.ok(res.some((r) => r.modulo === "leads" && r.seccion), "«exportar» no lleva a la sección de Leads");
        for (const r of res) {
            assert.equal(r.target, "_blank");
            assert.match(r.rel, /noopener/);
        }
        // Enter abre la primera; la flecha baja a la segunda.
        await caja.press("Enter");
        await caja.press("ArrowDown");
        await caja.press("Enter");
        const abiertas = await p.evaluate(() => window.__abiertas);
        assert.deepEqual(abiertas.map((a) => a.url), [esperados[0].url, esperados[1].url]);
        assert.match(abiertas[0].rasgos, /noopener/);

        // Una guía por su nombre, sin tilde, en otra categoría.
        await caja.fill("");
        await caja.pressSequentially("catalogo", { delay: 20 });
        await p.waitForSelector('[data-resultado-de-ayuda="catalogo"]');
        const primero = await p.$eval("[data-resultado-de-ayuda]", (a) => [a.getAttribute("data-resultado-de-ayuda"), a.getAttribute("href")]);
        assert.deepEqual(primero, ["catalogo", "/guia/catalogo"]);

        // Lo que no está en ninguna guía lo dice.
        await caja.fill("zxqwv");
        await p.waitForSelector("[data-sin-resultados]");
        assert.match(await p.locator("[data-sin-resultados]").innerText(), /Ninguna guía coincide con «zxqwv»/);
        // Escape vacía la caja y la lista se va.
        await caja.press("Escape");
        assert.equal(await caja.inputValue(), "");
        assert.equal(await p.locator("[data-resultados-de-ayuda]").count(), 0);
        assert.deepEqual(errores, []);
        await p.close();
    });

    /* -------------------------------------------------------------- */
    /* Una categoría                                                   */
    /* -------------------------------------------------------------- */

    function medirLaFila(fila) {
        const f = fila.getBoundingClientRect();
        const s = getComputedStyle(fila);
        const icono = fila.firstElementChild.getBoundingClientRect();
        const titulo = fila.querySelector("[data-titulo-de-la-fila]");
        const ts = getComputedStyle(titulo);
        const desc = titulo.nextElementSibling;
        const ver = fila.querySelector("[data-ver-guia]");
        const vs = getComputedStyle(ver);
        const vb = ver.getBoundingClientRect();
        return {
            relleno: s.paddingTop + " " + s.paddingRight + " " + s.paddingBottom + " " + s.paddingLeft,
            radio: s.borderTopLeftRadius,
            borde: s.borderTopColor + " " + s.borderTopWidth,
            fondo: s.backgroundColor,
            icono: [Math.round(icono.width), Math.round(icono.height), Math.round(icono.left - f.left)],
            titulo: [ts.fontSize, ts.fontWeight, ts.color],
            descripcion: desc ? [getComputedStyle(desc).fontSize, getComputedStyle(desc).color] : null,
            ver: [ver.innerText.trim(), vs.fontSize, Math.round(vb.height), vs.borderTopColor, ver.getAttribute("target"), ver.getAttribute("rel")],
        };
    }

    function medirLaCategoria() {
        const raiz = document.querySelector("[data-guias-de-la-categoria]");
        const filas = [...raiz.querySelectorAll("[data-guia-de-ayuda]")];
        const volver = raiz.querySelector("[data-volver-a-documentacion]");
        return {
            titulo: raiz.querySelector("h1, h2")?.innerText.trim(),
            volver: volver ? { href: volver.getAttribute("href"), aria: volver.getAttribute("aria-label") ?? volver.getAttribute("title") } : null,
            filas: filas.map((f) => ({
                modulo: f.getAttribute("data-guia-de-ayuda"),
                titulo: f.querySelector("[data-titulo-de-la-fila]").innerText.trim(),
                href: f.querySelector("[data-ver-guia]").getAttribute("href"),
                mandos: [...f.querySelectorAll("a, button")].map((b) => b.innerText.trim()),
                ancho: Math.round(f.getBoundingClientRect().width),
            })),
            buscador: !!raiz.querySelector("input"),
            vacio: raiz.querySelector("[data-sin-guias-todavia]")?.innerText.trim() ?? null,
            texto: raiz.innerText,
            asas: raiz.querySelectorAll('[aria-roledescription="sortable"], .lucide-grip-vertical, [data-asa]').length,
            desborda: document.documentElement.scrollWidth > window.innerWidth,
        };
    }

    for (const [ancho, alto] of VENTANAS) {
        test(`${ancho}: una categoría con guías es la lista de Documentación › Guías, solo con «Ver»`, async () => {
            const { p, errores } = await abrir("/", ancho, alto);
            await p.evaluate((g) => { window.__guias = g; window.pintarCategoria("panel"); }, guias);
            await p.waitForSelector("[data-guia-de-ayuda]");
            const m = await p.evaluate(`(${medirLaCategoria})()`);
            assert.deepEqual(errores, []);
            assert.equal(m.titulo, "Panel");
            assert.equal(m.volver?.href, "/ayuda", "la flecha no vuelve al centro de ayuda");
            const del = ayuda.lasGuiasDeLaCategoria(guias, "panel");
            assert.deepEqual(m.filas.map((f) => f.modulo), del.map((g) => g.modulo));
            for (const f of m.filas) {
                assert.deepEqual(f.mandos, ["Ver"], `la fila de «${f.titulo}» lleva más que «Ver»`);
                assert.equal(f.href, `/guia/${f.modulo}`);
            }
            assert.equal(new Set(m.filas.map((f) => f.ancho)).size, 1, "las filas no miden lo mismo");
            assert.ok(m.buscador, "la lista no lleva su buscador");
            for (const prohibido of ["Nuevo", "Editar introducción", "Guías publicadas"]) {
                assert.ok(!m.texto.includes(prohibido), `la lista lleva «${prohibido}»`);
            }
            assert.equal(m.asas, 0, "la lista se puede arrastrar");
            assert.equal(m.desborda, false, "la página desborda");

            // El buscador propio filtra la lista.
            await p.locator("[data-guias-de-la-categoria] input").fill("finanzas");
            const tras = await p.evaluate(`(${medirLaCategoria})()`);
            assert.deepEqual(tras.filas.map((f) => f.modulo), ["finanzas"]);
            await p.locator("[data-guias-de-la-categoria] input").fill("zxqwv");
            assert.match(await p.locator("[data-guias-de-la-categoria]").innerText(), /Ninguna guía coincide con «zxqwv»/);
            await p.close();
        });
    }

    test("la fila es la MISMA de Documentación › Guías: se miden las dos", async () => {
        const { p, errores } = await abrir("/", 1280, 800);
        await p.evaluate((g) => { window.__guias = g; window.pintarFilaDeDocumentacion(); }, guias);
        await p.waitForSelector("[data-fila-de-guia]");
        const deDocumentacion = await p.$eval("[data-fila-de-guia]", medirLaFila);
        const tieneEditar = await p.locator("[data-fila-de-guia] [data-editar-introduccion]").count();
        await p.evaluate(() => window.pintarCategoria("contactos"));
        await p.waitForSelector("[data-guia-de-ayuda]");
        const deAyuda = await p.$eval("[data-guia-de-ayuda]", medirLaFila);
        assert.deepEqual(errores, []);
        assert.equal(tieneEditar, 1, "Documentación › Guías perdió «Editar introducción»");
        assert.deepEqual(deAyuda, deDocumentacion, "la fila del centro de ayuda no es la de Documentación › Guías");
        await p.close();
    });

    for (const [ancho, alto] of [[1440, 900], [390, 740]]) {
        test(`${ancho}: una categoría sin guías dice «Estamos trabajando en esta guía»`, async () => {
            const { p, errores } = await abrir("/", ancho, alto);
            const vacias = ayuda.CATEGORIAS_DE_AYUDA.filter((c) => cuantas[c.slug] === 0);
            assert.ok(vacias.length > 0, "ninguna categoría sin guías: no se ejerce el caso");
            for (const c of vacias) {
                await p.evaluate(([g, s]) => { window.__guias = g; window.pintarCategoria(s); }, [guias, c.slug]);
                await p.waitForSelector(`[data-guias-de-la-categoria="${c.slug}"] [data-sin-guias-todavia]`);
                const m = await p.evaluate(`(${medirLaCategoria})()`);
                assert.equal(m.titulo, c.nombre);
                assert.equal(m.vacio, "Estamos trabajando en esta guía");
                assert.equal(m.filas.length, 0);
                assert.equal(m.buscador, false, "un buscador sobre nada");
                assert.equal(m.volver?.href, "/ayuda");
                assert.equal(m.desborda, false);
            }
            assert.deepEqual(errores, []);
            await p.close();
        });
    }
}
