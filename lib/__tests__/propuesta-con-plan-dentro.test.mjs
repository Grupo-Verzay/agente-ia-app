/**
 * El plan del panel de Planes, ENTERO, dentro de la página pública de una
 * propuesta (`PropuestaPublica`, la de verdad, sobre el CSS del build):
 *
 * 1. Un servicio que se llama como un plan («Business») lleva ese plan dentro
 *    de SU fila: video, capacidad, «Qué incluye» y el precio con su botón
 *    verde. El plan que no empareja con ningún servicio («Pro») sale después,
 *    en «Conoce el plan». Ninguno sale dos veces.
 * 2. Nada saca al cliente de la propuesta: la guía de una función se despliega
 *    ahí mismo, sin la tarjeta de «Contáctanos» ni enlaces de salida, y abrir
 *    una sección no cambia la dirección ni abre otra pestaña. El único enlace
 *    a otra pestaña es el botón de comenzar, con `noopener`.
 * 3. Sigue el modo claro u oscuro del DISPOSITIVO del cliente: el fondo y la
 *    tinta cambian con `prefers-color-scheme`.
 * 4. El logo y el eslogan van dentro de la tarjeta azul: no hay cabecera
 *    aparte.
 *
 * `MODO=roto` pinta la misma propuesta con el código de `ANTES_REF` (94fcc3c)
 * —pinchado a un commit, nunca `origin/main`— y AFIRMA los fallos de antes.
 *
 * Se levanta con `scripts/banco-propuesta-con-plan-dentro.sh`.
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
    // Sin navegador no se finge: se salta y se dice.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const PAQUETE = join(AQUI, ".compilado", "propuesta-con-plan-dentro", "propuesta.js");
const cssDir = join(RAIZ, ".next", "static", "css");
const conNavegador = chromium && process.env.CHROME_BIN && fs.existsSync(cssDir) && fs.existsSync(PAQUETE) ? test : test.skip;

async function abrir(datos, pintar, anchos = [[1440, 900], [390, 844]]) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(PAQUETE, "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
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

/* El plan de ejemplo: funciones con la MISMA guía, un video de YouTube, una
   web que no se deja insertar y una sin tutorial. */
const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id, nombre, descripcion, tutorial) => ({ id, nombre, descripcion, categoria: "general", activa: true, destacada: true, tutorial });
const CRUDO = [
    F("respuestas", "Respuestas automáticas por WhatsApp", "La IA contesta a tus clientes a cualquier hora.", "leads"),
    F("catalogo", "Catálogo de productos", "Tus productos con su precio y su foto.", "catalogo"),
    F("youtube", "Cómo vender más", "Un video corto.", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    F("soporte", "Centro de soporte", "Escríbenos cuando quieras.", "https://ayuda.test/soporte"),
    F("reportes", "Reportes semanales", "Un resumen cada lunes.", null),
];

const PROPUESTA = {
    token: "t".repeat(32),
    cliente: "Clínica Dental Sonrisa",
    empresa: "Grupo Sonrisa SAS",
    fecha: "2026-09-28",
    vigencia: null,
    tipoDeItems: "servicios",
    nota: "",
    metodoPago: "",
    medioPago: "",
    moneda: "COP",
    servicios: [
        { nombre: "Business", alcance: "Agente de IA configurado", inversion: 1500000 },
        { nombre: "Landing", alcance: "Una página con formulario", inversion: 800000 },
    ],
    mantenimientoMensual: null,
    mantenimientoDescripcion: "",
    condiciones: "",
    actualizadaEn: "2026-09-28T12:00:00.000Z",
    negocio: { nombre: "Verzay", logo: null, eslogan: "Automatiza tu negocio con IA" },
};

const BUSINESS = {
    llave: "intermedio:IA",
    nombre: "Business",
    plan: "intermedio",
    tipo: "IA",
    activo: true,
    conFunciones: true,
    video: { tipo: "archivo", url: "/videos/plan.mp4", titulo: "Así funciona Business", miniatura: null },
    enlace: "/planes/nivel-3",
    capacidad: [
        { id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." },
        { id: "asistencia", icono: "asistencia", titulo: "Asistencia", valor: "IA 24/7", detalle: "Todos los días." },
    ],
    precio: { texto: "$99", aConsultar: false },
    boton: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false },
};
const PRO = {
    llave: "avanzado:IA",
    nombre: "Pro",
    plan: "avanzado",
    tipo: "IA",
    activo: true,
    conFunciones: false,
    video: { tipo: "archivo", url: "/videos/pro.mp4", titulo: "Así funciona Pro", miniatura: null },
    enlace: "/planes/nivel-4",
    capacidad: [{ id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "15.000", detalle: "Cada mes." }],
    precio: { texto: "$149", aConsultar: false },
    boton: { texto: "Comenzar con el plan Pro", url: "/register?plan=nivel-4", externo: false },
};
const VENTANA = { __roto: ROTO, __propuesta: PROPUESTA, __planes: [BUSINESS, PRO], __crudo: CRUDO, __datos: DATOS };

const sinErrores = (errores, w) => assert.deepEqual(errores, [], `${w}px: errores en la página`);

/* ─── 1. Dónde va cada plan ───────────────────────────────────────────── */

conNavegador("el plan que se llama como un servicio va ENTERO dentro de su fila; el otro, en «Conoce el plan»", async () => {
    await abrir(VENTANA, async (pag, w, errores) => {
        const m = await pag.evaluate(() => {
            const fila = document.querySelector('[data-servicio-con-plan="intermedio:IA"]');
            const dentro = fila?.querySelector('[data-plan-en-la-propuesta="intermedio:IA"]') ?? null;
            const sueltos = document.querySelector("section[data-planes-de-la-propuesta]");
            return {
                conPlan: document.querySelectorAll("[data-servicio-con-plan]").length,
                enLaFila: Boolean(dentro),
                filaDice: fila?.querySelector("h3, p")?.textContent ?? "",
                video: Boolean(dentro?.querySelector("[data-video-del-plan]")),
                capacidad: dentro?.querySelector("[data-capacidad-del-plan]")?.textContent ?? "",
                funciones: dentro?.querySelectorAll("[data-funcion]").length ?? 0,
                precio: dentro?.querySelector("[data-precio-del-plan]")?.textContent?.trim() ?? "",
                boton: dentro?.querySelector("a[data-boton-del-plan]")?.textContent?.trim() ?? "",
                businessSuelto: Boolean(sueltos?.querySelector('[data-plan-de-la-propuesta="intermedio:IA"]')),
                proSuelto: Boolean(sueltos?.querySelector('[data-plan-de-la-propuesta="avanzado:IA"]')),
                proEnUnaFila: Boolean(document.querySelector('[data-servicio] [data-plan-en-la-propuesta="avanzado:IA"]')),
                tituloSueltos: sueltos?.querySelector("h2")?.textContent ?? "",
                videosEnFilas: [...document.querySelectorAll("[data-servicio]")].filter((s) => s.querySelector("[data-video-del-plan]")).length,
            };
        });
        if (ROTO) {
            assert.equal(m.conPlan, 0, `${w}px ANTES: ningún servicio llevaba su plan dentro`);
            assert.equal(m.videosEnFilas, 0, `${w}px ANTES: ninguna fila de servicio llevaba video`);
            assert.ok(m.businessSuelto, `${w}px ANTES: «Business» iba suelto al final, lejos de su servicio`);
            return;
        }
        sinErrores(errores, w);
        assert.equal(m.conPlan, 1, `${w}px: solo «Business» empareja con un servicio`);
        assert.ok(m.enLaFila, `${w}px: el plan no va dentro de la fila de su servicio`);
        assert.ok(m.video, `${w}px: el plan dentro del servicio sin su video`);
        assert.match(m.capacidad, /8\.000/, `${w}px: sin los recuadros de capacidad`);
        assert.ok(m.funciones >= 3, `${w}px: sin «Qué incluye» (${m.funciones} funciones)`);
        assert.equal(m.precio, "$99 USD al mes", `${w}px: el precio del plan`);
        assert.match(m.boton, /Comenzar con el plan Business/, `${w}px: sin el botón de comenzar`);
        assert.equal(m.businessSuelto, false, `${w}px: «Business» sale dos veces (dentro y al final)`);
        assert.ok(m.proSuelto, `${w}px: el plan que no empareja no sale en «Conoce el plan»`);
        assert.equal(m.proEnUnaFila, false, `${w}px: «Pro» no tiene servicio y se metió en una fila`);
        assert.match(m.tituloSueltos, /Conoce el plan/, `${w}px: el título de los planes sueltos`);
    });
});

/* ─── 2. Nada saca de la propuesta ────────────────────────────────────── */

conNavegador("nada saca al cliente: la guía se despliega dentro, sin salidas, y solo el botón abre otra pestaña", async () => {
    if (ROTO) {
        // Antes el plan no traía sus funciones: no había guía que desplegar. Lo
        // que sí había era un enlace a la página del plan, fuera de la propuesta.
        await abrir(VENTANA, async (pag, w) => {
            const n = await pag.evaluate(() => ({
                funciones: document.querySelectorAll("[data-funcion]").length,
                enlaceAfuera: document.querySelectorAll("[data-enlace-del-plan]").length,
            }));
            assert.equal(n.funciones, 0, `${w}px ANTES: la propuesta no traía «Qué incluye»`);
            assert.ok(n.enlaceAfuera >= 1, `${w}px ANTES: el plan era un enlace a otra página`);
        });
        return;
    }
    await abrir(VENTANA, async (pag, w, errores, ctx) => {
        const fuera = await pag.evaluate(() =>
            [...document.querySelectorAll("a[target=_blank]")].map((a) => ({
                boton: a.hasAttribute("data-boton-del-plan"),
                rel: a.getAttribute("rel") ?? "",
            })),
        );
        assert.ok(fuera.length >= 1, `${w}px: el botón de comenzar no abre otra pestaña`);
        for (const a of fuera) {
            assert.ok(a.boton, `${w}px: un enlace a otra pestaña que no es el botón de comenzar`);
            assert.match(a.rel, /noopener/, `${w}px: el botón abre otra pestaña sin noopener`);
        }
        assert.equal(await pag.locator("a[data-abrir-tutorial]").count(), 0, `${w}px: un tutorial abre fuera de la propuesta`);

        const direccion = pag.url();
        const funcion = pag.locator('[data-plan-en-la-propuesta="intermedio:IA"] [data-funcion="respuestas"]');
        await funcion.locator("[data-cabeza-de-la-funcion]").click();
        await funcion.locator("[data-cuerpo-de-la-funcion]").waitFor({ state: "visible" });
        await funcion.locator("button[data-ver-la-guia]").click();
        const guia = funcion.locator('[data-guia-desplegada="leads"] [data-guia]');
        await guia.waitFor({ state: "visible", timeout: 10_000 });
        assert.equal(await guia.getAttribute("data-guia-tema"), "dispositivo", `${w}px: la guía no sigue el tema del dispositivo`);
        assert.equal(await guia.locator('[data-tarjeta-de-cierre="contacto"]').count(), 0, `${w}px: la guía lleva «Contáctanos», que saca de la propuesta`);
        assert.equal(await guia.locator("a[target=_blank]").count(), 0, `${w}px: la guía tiene enlaces a otra pestaña`);

        await guia.locator("button").filter({ hasText: /\S/ }).first().click();
        await pag.waitForFunction(
            () => (document.querySelector('[data-guia-desplegada="leads"]')?.getAttribute("data-seccion-abierta") ?? "") !== "",
            null,
            { timeout: 10_000 },
        );
        await guia.locator("[data-captura-sin-salida]").first().waitFor({ state: "attached", timeout: 10_000 });
        assert.equal(await guia.locator("a[target=_blank]").count(), 0, `${w}px: la sección abierta tiene enlaces a otra pestaña`);
        assert.equal(pag.url(), direccion, `${w}px: abrir una sección cambió la dirección`);
        assert.equal(ctx.pages().length, 1, `${w}px: abrir la guía abrió otra pestaña`);
        sinErrores(errores, w);
    });
});

/* ─── 3. El tema del dispositivo ──────────────────────────────────────── */

conNavegador("sigue el modo claro u oscuro del dispositivo del cliente", async () => {
    await abrir(VENTANA, async (pag, w, errores) => {
        const medir = () =>
            pag.evaluate(() => ({
                fondo: getComputedStyle(document.querySelector("main[data-pagina-de-la-propuesta]")).backgroundColor,
                tinta: getComputedStyle(document.querySelector("[data-titulo-items], [data-titulo-del-item]")).color,
                fila: getComputedStyle(document.querySelector("[data-servicio]")).backgroundColor,
            }));
        await pag.emulateMedia({ colorScheme: "light" });
        const claro = await medir();
        await pag.emulateMedia({ colorScheme: "dark" });
        const oscuro = await medir();
        if (ROTO) {
            assert.equal(oscuro.fondo, claro.fondo, `${w}px ANTES: el fondo no cambiaba con el modo del dispositivo`);
            assert.equal(oscuro.fila, claro.fila, `${w}px ANTES: las filas no cambiaban con el modo del dispositivo`);
            return;
        }
        sinErrores(errores, w);
        assert.equal(claro.fondo, "rgb(248, 250, 252)", `${w}px: el fondo en claro`);
        assert.equal(claro.tinta, "rgb(15, 23, 42)", `${w}px: la tinta en claro`);
        assert.equal(oscuro.fondo, "rgb(10, 15, 26)", `${w}px: el fondo en oscuro`);
        assert.equal(oscuro.tinta, "rgb(255, 255, 255)", `${w}px: la tinta en oscuro`);
        assert.notEqual(oscuro.fila, claro.fila, `${w}px: la fila de un servicio no cambia con el modo`);
    });
});

/* ─── 4. La cabecera dentro de la tarjeta, y nada desborda ────────────── */

conNavegador("el logo y el eslogan van dentro de la tarjeta azul, y nada desborda a lo ancho", async () => {
    await abrir(
        VENTANA,
        async (pag, w, errores) => {
            const m = await pag.evaluate(() => ({
                cabeceraAparte: Boolean(document.querySelector("[data-cabecera]")),
                logoEnLaTarjeta: Boolean(document.querySelector("[data-hero] [data-logo-propuesta]")),
                esloganEnLaTarjeta: Boolean(document.querySelector("[data-hero] [data-eslogan]")),
                desborda: document.documentElement.scrollWidth > innerWidth,
            }));
            if (ROTO) {
                assert.ok(m.cabeceraAparte, `${w}px ANTES: había una cabecera aparte, encima de la tarjeta`);
                assert.equal(m.esloganEnLaTarjeta, false, `${w}px ANTES: el eslogan iba fuera de la tarjeta`);
                return;
            }
            sinErrores(errores, w);
            assert.equal(m.cabeceraAparte, false, `${w}px: sigue una cabecera aparte`);
            assert.ok(m.logoEnLaTarjeta, `${w}px: el logo no va dentro de la tarjeta azul`);
            assert.ok(m.esloganEnLaTarjeta, `${w}px: el eslogan no va dentro de la tarjeta azul`);
            assert.equal(m.desborda, false, `${w}px: la propuesta desborda a lo ancho`);
        },
        [[390, 844], [768, 1024], [1024, 768], [1440, 900]],
    );
});
