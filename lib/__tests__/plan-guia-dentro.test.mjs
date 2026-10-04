/**
 * Cuatro arreglos de la parte pública, pedidos juntos:
 *
 * 1. **La guía paso a paso se despliega DENTRO de su función.** En «Qué
 *    incluye este plan», «Ver guía» ya no abre otra pestaña: la guía (la misma
 *    de `/guia/<modulo>`) sale ahí mismo, en el mismo acordeón, y el video se
 *    ESCONDE mientras está abierta (encogido dejaba un hueco al lado). Pulsar
 *    una sección la abre ahí mismo, sin cambiar de página.
 * 2. **«Qué incluye este plan» no enseña la lista entera de entrada.** Antes
 *    nacía plegado bajo un encabezado; hoy enseña las destacadas y el resto va
 *    detrás de «Ver todas las funciones» (lo prueba entero
 *    `banco-plan-destacadas-y-guia.sh`).
 * 3. **El cierre no lleva título**: solo el precio, en blanco y destacado,
 *    encima del botón VERDE «Comenzar con el plan <nombre>».
 * 4. **La landing principal no separa sus secciones** con franjas, rayas ni
 *    sombras, igual que la página del plan.
 *
 * `MODO=roto` pinta lo mismo con el código de `ANTES_REF` (97b6d07) —pinchado
 * a un commit, nunca `origin/main`— y AFIRMA los fallos de antes.
 *
 * Se levanta con `scripts/banco-plan-guia-dentro.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se salta y se dice.
}

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "97b6d07";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "plan-guia-dentro");
const cssDir = join(RAIZ, ".next", "static", "css");
const conNavegador = chromium && process.env.CHROME_BIN && fs.existsSync(cssDir) ? test : test.skip;

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        return execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const leer = (f) => (ROTO ? deAntes(f) : crudo(f));

const PAGINA_DEL_PLAN = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";
const LANDINGS = [
    "app/(public)/inicio/_components/LandingClient.tsx",
    "app/(public)/r/[slug]/_components/ResellerLandingClient.tsx",
    "app/(public)/resellers/_components/ResellerLandingClient.tsx",
];

/* ─── 1. Barrido del código ───────────────────────────────────────────── */

test("barrido: la guía de una función no abre otra pestaña, y el bloque no enseña la lista entera", () => {
    const pagina = sinComentarios(leer(PAGINA_DEL_PLAN));
    if (ROTO) {
        assert.doesNotMatch(pagina, /GuiaDesplegada/, "antes la guía no se desplegaba dentro");
        assert.doesNotMatch(pagina, /data-abrir-que-incluye/, "antes no había un encabezado que plegara el bloque");
        assert.match(pagina, /Empieza con el plan/, "antes el cierre llevaba título");
        return;
    }
    assert.match(pagina, /<GuiaDesplegada\b/, "la guía se pinta dentro de la función");
    assert.match(pagina, /data-ver-la-guia=/, "«Ver guía» es un botón que la despliega");
    assert.match(pagina, /reproductor && !guiaAbierta/, "con la guía abierta el video no se pinta");
    assert.match(pagina, /data-ver-todas-las-funciones/, "el resto, detrás de «Ver todas las funciones»");
    assert.match(pagina, /useState\(false\)/, "el resto arranca escondido");
    assert.doesNotMatch(pagina, /Empieza con el plan/, "el cierre ya no lleva título");
    assert.match(pagina, /data-precio-final/);
    // La guía desplegada es la MISMA de /guia y de la landing: la misma caché.
    const desplegada = sinComentarios(crudo("components/guia/GuiaDesplegada.tsx"));
    assert.match(desplegada, /pedirLaGuiaPublica/);
    assert.match(sinComentarios(crudo("components/guia/GuiaEnLaLanding.tsx")), /pedirLaGuiaPublica/, "la de la landing usa la misma caché");
    assert.doesNotMatch(desplegada, /target=|window\.open|router\.push|location\.href\s*=/, "nada de la guía saca de la página");
    // El texto del botón no se escribe a mano: sale del nombre del plan.
    assert.match(crudo("lib/pagina-de-plan.ts"), /export function elTextoDelBotonDelPlan/);
});

test("barrido: las tres landings no pintan franjas de color entre secciones", () => {
    for (const f of LANDINGS) {
        const codigo = sinComentarios(leer(f) ?? "");
        const franjas = [...codigo.matchAll(/<section\b[^>]*className="[^"]*\bbg-white\/\[0\.0\d\]/g)];
        if (ROTO) {
            if (f.includes("inicio")) assert.ok(franjas.length >= 3, `antes la landing principal tenía franjas (${franjas.length})`);
            continue;
        }
        assert.equal(franjas.length, 0, `${f}: una sección con franja de fondo`);
        assert.doesNotMatch(codigo, /<section\b[^>]*className="[^"]*\b(?:border-[tb]\b|divide-y|shadow-(?:sm|md|lg|xl|2xl))/, `${f}: una sección con raya o sombra`);
    }
});

/* ─── 2. En el navegador ──────────────────────────────────────────────── */

async function abrir(paquete, datos, pintar, anchos = [[1440, 900], [390, 844]]) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(paquete, "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body class="bg-[#0a0f1a]"><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
        `<script type="module">${js}</script></body></html>`;
    const servidor = http.createServer((_q, r) => {
        r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        r.end(html);
    });
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${servidor.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN });
    try {
        for (const [w, h] of anchos) {
            const ctx = await nav.newContext({ viewport: { width: w, height: h } });
            const pag = await ctx.newPage();
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
            await pag.waitForTimeout(300);
            await pintar(pag, w, errores, ctx);
            await ctx.close();
        }
    } finally {
        await nav.close();
        servidor.close();
    }
}

/* El plan de ejemplo: tres funciones con la MISMA guía, un video de YouTube,
   una web que no se deja insertar y una sin tutorial. */
const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id, nombre, descripcion, tutorial) => ({ id, nombre, descripcion, categoria: "general", activa: true, destacada: true, tutorial });
const CRUDO = [
    F("respuestas", "Respuestas automáticas por WhatsApp", "La IA contesta a tus clientes a cualquier hora.", "agente-ia"),
    F("catalogo", "Catálogo de productos", "Tus productos con su precio y su foto.", "agente-ia"),
    F("youtube", "Cómo vender más", "Un video corto.", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    F("soporte", "Centro de soporte", "Escríbenos cuando quieras.", "https://ayuda.test/soporte"),
    F("reportes", "Reportes semanales", "Un resumen cada lunes.", null),
];
const PAGINA = {
    plan: "intermedio",
    tipo: "IA",
    nombre: "Business",
    precio: { texto: "$99", aConsultar: false },
    video: { tipo: "archivo", url: "/videos/plan.mp4", titulo: "Así funciona Business", miniatura: null },
    paraQuien: { paraQuien: "Para negocios que atienden por WhatsApp todo el día.", caso: "Una clínica con tres asesores." },
    capacidad: [
        { id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." },
        { id: "asistencia", icono: "asistencia", titulo: "Asistencia", valor: "IA 24/7", detalle: "Todos los días." },
    ],
    funciones: [],
    preguntas: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
    botones: { principal: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false }, secundario: null },
    planSuperior: { plan: "avanzado", tipo: "IA", nombre: "Pro", url: "/planes/nivel-4" },
    meta: { titulo: "Business", descripcion: "", imagen: null },
    marca: "Verzay",
    logo: null,
    favicon: null,
    orden: ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"],
};
const DATOS_DEL_PLAN = { __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS };
const PLAN = join(COMPILADO, "plan.js");
const LANDING = join(COMPILADO, "landing.js");

/** Un color `rgb(…)` o `rgba(…)` → [r, g, b, a]. */
const rgba = (c) => {
    const n = (c.match(/[\d.]+/g) ?? []).map(Number);
    return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
};

conNavegador("«Qué incluye este plan»: ya no es una lista entera de entrada ni un encabezado plegado", async () => {
    await abrir(PLAN, DATOS_DEL_PLAN, async (pag, w, errores) => {
        if (ROTO) {
            assert.equal(await pag.locator("[data-abrir-que-incluye]").count(), 0, "antes no había encabezado que lo plegara");
            assert.ok(await pag.locator("[data-funcion]").first().isVisible(), `${w}: antes las funciones se veían de entrada`);
            return;
        }
        // Las cinco del ejemplo son destacadas: se ven todas de entrada y no
        // hay nada que desplegar.
        assert.equal(await pag.locator("[data-abrir-que-incluye]").count(), 0, `${w}: ya no hay encabezado plegable`);
        assert.equal(await pag.locator("[data-ver-todas-las-funciones]").count(), 0, `${w}: todas destacadas, sin botón`);
        assert.equal(await pag.locator("[data-que-incluye]").getAttribute("data-que-incluye"), "todas");
        assert.equal(await pag.locator("[data-funcion]").count(), 5);
        assert.ok(await pag.locator("[data-funcion]").first().isVisible(), `${w}: se ven las funciones`);
        assert.match(await pag.locator("[data-cuantas-funciones]").innerText(), /5 funciones/, `${w}: dice cuántas hay`);
        assert.deepEqual(errores, []);
    });
});

conNavegador("la guía paso a paso se despliega DENTRO de su función, sin salir de la página", async () => {
    await abrir(PLAN, DATOS_DEL_PLAN, async (pag, w, errores, ctx) => {
        const urlAntes = pag.url();
        const pestanas = () => ctx.pages().length;
        const abrirFuncion = async (id) => {
            const enc = pag.locator("[data-abrir-que-incluye]");
            if ((await enc.count()) && (await enc.getAttribute("aria-expanded")) === "false") await enc.click();
            const todas = pag.locator("[data-ver-todas-las-funciones]");
            if ((await todas.count()) && (await todas.getAttribute("aria-expanded")) === "false") await todas.click();
            await pag.locator(`[data-funcion="${id}"] [data-cabeza-de-la-funcion]`).click();
        };
        await abrirFuncion("respuestas");
        const cuerpo = pag.locator('[data-funcion="respuestas"] [data-cuerpo-de-la-funcion]');
        await cuerpo.waitFor({ state: "visible" });

        if (ROTO) {
            const enlace = cuerpo.locator("a[data-abrir-tutorial]");
            assert.equal(await enlace.count(), 1, `${w}: antes la guía era un enlace`);
            assert.equal(await enlace.getAttribute("target"), "_blank", `${w}: antes abría otra pestaña`);
            assert.equal(await cuerpo.locator("[data-guia-desplegada]").count(), 0);
            return;
        }

        // El video primero, y debajo la fila «Guía paso a paso» con «Ver guía».
        const video = cuerpo.locator("[data-caja-del-video]");
        assert.equal(await video.count(), 1, `${w}: el video se ve`);
        const boton = cuerpo.locator("button[data-ver-la-guia]");
        assert.equal(await boton.count(), 1, `${w}: «Ver guía» es un botón, no un enlace`);
        assert.equal(await cuerpo.locator("a[data-abrir-tutorial]").count(), 0, `${w}: la guía ya no tiene enlace a otra pestaña`);
        assert.equal(await boton.getAttribute("aria-expanded"), "false");
        assert.equal((await boton.innerText()).trim(), "Ver guía");
        const yBoton = (await boton.boundingBox()).y;
        assert.ok(yBoton > (await video.boundingBox()).y, `${w}: el botón va debajo del video`);

        await boton.click();
        const guia = cuerpo.locator('[data-guia-desplegada="agente-ia"]');
        await guia.waitFor({ state: "attached" });
        assert.equal(await boton.getAttribute("aria-expanded"), "true");
        assert.equal((await boton.innerText()).trim(), "Ocultar guía");
        assert.equal(await boton.getAttribute("aria-controls"), await guia.getAttribute("id"), `${w}: el botón dice qué despliega`);
        // La guía va DENTRO de la función.
        assert.equal(await pag.locator('[data-funcion="respuestas"] [data-guia-desplegada]').count(), 1);
        // Se carga la guía de verdad: su introducción y la cuadrícula de secciones.
        // Sin tema elegido (este arnés no lleva el de la App) va en oscuro, como la página.
        await guia.locator("[data-guia]").waitFor({ state: "visible", timeout: 10_000 });
        assert.equal(await guia.locator("[data-guia]").getAttribute("data-guia-tema"), "oscuro");
        const tarjetas = guia.locator("[data-seccion-guia], a[href*='/guia/'], button").filter({ hasText: /./ });
        assert.ok((await tarjetas.count()) > 0, `${w}: la guía trae sus secciones`);

        // Con la guía abierta el video NO está: ni encogido ni detrás.
        assert.equal(await cuerpo.locator("[data-caja-del-video]").count(), 0, `${w}: el video se esconde del todo`);
        assert.equal(await cuerpo.locator("[data-video-del-tutorial]").count(), 0, `${w}: ningún reproductor detrás`);

        // Pulsar una sección la abre ahí mismo: sin pestañas nuevas ni otra dirección.
        const seccion = guia.locator("[data-guia] button").filter({ hasText: /\S/ }).first();
        await seccion.click();
        await pag.waitForFunction(
            () => document.querySelector('[data-guia-desplegada="agente-ia"]')?.getAttribute("data-seccion-abierta"),
            null,
            { timeout: 5_000 },
        );
        assert.ok((await guia.getAttribute("data-seccion-abierta")).length > 0, `${w}: la sección se abrió dentro`);
        assert.equal(pag.url(), urlAntes, `${w}: la dirección no cambió`);
        assert.equal(pestanas(), 1, `${w}: no se abrió otra pestaña`);

        // Ocultarla devuelve el video.
        await boton.click();
        assert.equal(await cuerpo.locator("[data-guia-desplegada]").count(), 0);
        assert.equal(await cuerpo.locator("[data-caja-del-video]").count(), 1, `${w}: el video vuelve`);
        assert.equal((await boton.innerText()).trim(), "Ver guía");

        // Un enlace de fuera sigue abriendo otra pestaña: no es una guía de la plataforma.
        await abrirFuncion("soporte");
        const fuera = pag.locator('[data-funcion="soporte"] a[data-abrir-tutorial]');
        assert.equal(await fuera.count(), 1);
        assert.equal(await fuera.getAttribute("target"), "_blank");
        assert.match(await fuera.getAttribute("rel"), /noopener/);
        assert.equal(await pag.locator('[data-funcion="soporte"] button[data-ver-la-guia]').count(), 0);
        assert.deepEqual(errores, []);
    });
});

conNavegador("el cierre: sin título, el precio en blanco y destacado encima del botón verde", async () => {
    await abrir(PLAN, DATOS_DEL_PLAN, async (pag, w) => {
        const cierre = pag.locator('section[data-seccion="comenzar"]');
        const precio = cierre.locator("[data-precio-final]");
        const boton = cierre.locator('[data-boton="principal"]');
        const titulo = cierre.locator("h2");
        const estilo = await precio.evaluate((p) => {
            const s = getComputedStyle(p);
            return { color: s.color, peso: Number(s.fontWeight), tamano: parseFloat(s.fontSize) };
        });
        if (ROTO) {
            assert.equal(await titulo.count(), 1, `${w}: antes había título`);
            assert.match(await titulo.innerText(), /Empieza con el plan Business/);
            const [r, g, b] = rgba(estilo.color);
            assert.ok(!(r > 245 && g > 245 && b > 245), `${w}: antes el precio no era blanco (${estilo.color})`);
            return;
        }
        assert.equal(await titulo.count(), 0, `${w}: el cierre no lleva título`);
        assert.equal(await cierre.getByText(/Empieza con el plan/).count(), 0);
        assert.equal(await precio.innerText(), "$99 USD al mes");
        const [r, g, b] = rgba(estilo.color);
        assert.ok(r > 245 && g > 245 && b > 245, `${w}: el precio va en blanco (${estilo.color})`);
        assert.ok(estilo.peso >= 700, `${w}: en negrita (${estilo.peso})`);
        assert.ok(estilo.tamano >= 28, `${w}: destacado (${estilo.tamano}px)`);
        // El precio va ENCIMA del botón.
        const yPrecio = (await precio.boundingBox()).y;
        const yBoton = (await boton.boundingBox()).y;
        assert.ok(yPrecio < yBoton, `${w}: el precio va encima del botón`);
        // El botón: verde, y con el nombre del plan.
        assert.equal((await boton.innerText()).trim(), "Comenzar con el plan Business");
        const fondo = await boton.locator("button").evaluate((b) => getComputedStyle(b).backgroundColor);
        const [br, bg, bb] = rgba(fondo);
        assert.ok(bg > br + 60 && bg > bb + 20, `${w}: el botón es verde (${fondo})`);
    });
});

conNavegador("la landing principal: ninguna sección con franja, raya o sombra", async () => {
    await abrir(LANDING, {}, async (pag, w, errores) => {
        await pag.locator("section#pricing").waitFor({ state: "attached", timeout: 10_000 });
        const secciones = await pag.locator("section").evaluateAll((ss) =>
            ss.map((s) => {
                const c = getComputedStyle(s);
                return {
                    id: s.id || s.className.slice(0, 40),
                    fondo: c.backgroundColor,
                    imagen: c.backgroundImage,
                    arriba: parseFloat(c.borderTopWidth),
                    abajo: parseFloat(c.borderBottomWidth),
                    sombra: c.boxShadow,
                };
            }),
        );
        assert.ok(secciones.length >= 10, `${w}: se pintó la landing entera (${secciones.length} secciones)`);
        const conFranja = secciones.filter((s) => rgba(s.fondo)[3] > 0 || (s.imagen && s.imagen !== "none"));
        const conRaya = secciones.filter((s) => s.arriba > 0 || s.abajo > 0);
        const conSombra = secciones.filter((s) => s.sombra && s.sombra !== "none");
        if (ROTO) {
            assert.ok(conFranja.length >= 3, `${w}: antes ${conFranja.length} secciones llevaban franja`);
            return;
        }
        assert.deepEqual(conFranja, [], `${w}: secciones con franja de fondo`);
        assert.deepEqual(conRaya, [], `${w}: secciones con raya`);
        assert.deepEqual(conSombra, [], `${w}: secciones con sombra`);
        assert.deepEqual(errores, []);
    });
});
