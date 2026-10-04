/**
 * La página pública de una propuesta (`PropuestaPublica`, la de verdad, sobre
 * el CSS del build), sin repeticiones y con la guía como en la landing:
 *
 * 1. El precio sale DOS veces y no cuatro: en «Inversión total» arriba y junto
 *    al botón «Comenzar con el plan». Ni junto al nombre del servicio que es
 *    un plan, ni en un «Total» al final. Un servicio que NO es un plan sigue
 *    con su importe en su fila.
 * 2. La cuadrícula de secciones de la guía desplegada no deja huecos: sin
 *    «Contáctanos» (no se sale de la propuesta), «Ver el vídeo de nuevo» ocupa
 *    su sitio, como en la guía de la plataforma.
 * 3. La guía del Agente IA no sale dentro de la propuesta: es para quien ya
 *    compró. Su función se queda, sin «Ver guía».
 * 4. «Ver guía» compacta el video, como en la página del plan.
 *
 * `MODO=roto` pinta la misma propuesta con el código de `ANTES_REF` (cbc47f6)
 * —pinchado a un commit, nunca `origin/main`— y AFIRMA los cuatro fallos.
 *
 * Se levanta con `scripts/banco-propuesta-sin-repeticiones.sh`.
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
const PAQUETE = join(AQUI, ".compilado", "propuesta-sin-repeticiones", "propuesta.js");
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

const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id, nombre, descripcion, tutorial) => ({ id, nombre, descripcion, categoria: "general", activa: true, destacada: true, tutorial });
const CRUDO = [
    F("respuestas", "Respuestas automáticas por WhatsApp", "La IA contesta a tus clientes a cualquier hora.", "leads"),
    F("entrenar", "Agente de IA entrenado", "Responde con la información de tu negocio.", "agente-ia"),
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
    servicios: [{ nombre: "Business", alcance: "Agente de IA configurado", inversion: 1500000 }],
    mantenimientoMensual: null,
    mantenimientoDescripcion: "",
    condiciones: "",
    actualizadaEn: "2026-09-28T12:00:00.000Z",
    negocio: { nombre: "Verzay", logo: null, eslogan: "Automatiza tu negocio con IA" },
};
const CON_DOS = {
    ...PROPUESTA,
    servicios: [...PROPUESTA.servicios, { nombre: "Landing", alcance: "Una página con formulario", inversion: 800000 }],
};

const BUSINESS = {
    llave: "intermedio:IA",
    nombre: "Business",
    plan: "intermedio",
    tipo: "IA",
    activo: true,
    conFunciones: true,
    video: null,
    enlace: "/planes/nivel-3",
    capacidad: [{ id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." }],
    precio: { texto: "$99", aConsultar: false },
    boton: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false },
};

// `__roto: false` a propósito: el `<main>` de hoy. El código de ANTES_REF ya
// seguía el tema del dispositivo; lo que cambia de un modo a otro es el árbol
// con el que se empaqueta, no el envoltorio.
const VENTANA = (propuesta) => ({ __roto: false, __propuesta: propuesta, __planes: [BUSINESS], __crudo: CRUDO, __datos: DATOS });

const sinErrores = (errores, w) => assert.deepEqual(errores, [], `${w}px: errores en la página`);
const veces = (texto, aguja) => texto.split(aguja).length - 1;

const laFuncion = (pag, id) => pag.locator(`[data-plan-en-la-propuesta="intermedio:IA"] [data-funcion="${id}"]`);
async function abrirLaFuncion(pag, id) {
    const funcion = laFuncion(pag, id);
    await funcion.locator("[data-cabeza-de-la-funcion]").click();
    await funcion.locator("[data-cuerpo-de-la-funcion]").waitFor({ state: "visible" });
    return funcion;
}

/* ─── 1. El precio, dos veces y no cuatro ─────────────────────────────── */

conNavegador("el precio sale en «Inversión total» y junto al botón, y en ningún otro sitio", async () => {
    await abrir(VENTANA(PROPUESTA), async (pag, w, errores) => {
        const m = await pag.evaluate(() => ({
            texto: document.body.innerText,
            total: document.querySelector("[data-total]")?.textContent ?? "",
            precioDelPlan: document.querySelector("[data-precio-del-plan]")?.textContent?.trim() ?? "",
            precioJuntoAlBoton: Boolean(document.querySelector("[data-comenzar-el-plan] [data-precio-del-plan]")),
            totalAbajo: [...document.querySelectorAll("span, p, div")].some((e) => e.childElementCount === 0 && e.textContent.trim() === "Total"),
        }));
        const importe = veces(m.texto, "1.500.000");
        if (ROTO) {
            assert.equal(importe, 3, `${w}px ANTES: el importe salía arriba, junto al servicio y en el «Total» del final`);
            assert.ok(m.totalAbajo, `${w}px ANTES: había un «Total» al final`);
            return;
        }
        sinErrores(errores, w);
        assert.equal(importe, 1, `${w}px: el importe del servicio sale ${importe} veces (solo arriba)`);
        assert.match(m.total, /1\.500\.000/, `${w}px: «Inversión total» sin el importe`);
        assert.equal(m.totalAbajo, false, `${w}px: sigue el «Total» al final`);
        assert.equal(m.precioDelPlan, "$99 USD al mes", `${w}px: el precio junto al botón`);
        assert.ok(m.precioJuntoAlBoton, `${w}px: el precio no va junto al botón «Comenzar con el plan»`);
        assert.equal(veces(m.texto, "$99 USD al mes"), 1, `${w}px: el precio del plan sale más de una vez`);
    });
});

conNavegador("un servicio que NO es un plan conserva su importe en su fila", async () => {
    await abrir(VENTANA(CON_DOS), async (pag, w, errores) => {
        const m = await pag.evaluate(() => ({
            filas: [...document.querySelectorAll("[data-servicio]")].map((f) => ({
                plan: f.hasAttribute("data-servicio-con-plan"),
                texto: f.innerText,
            })),
            total: document.querySelector("[data-total]")?.textContent ?? "",
        }));
        assert.equal(m.filas.length, 2, `${w}px: dos servicios`);
        const landing = m.filas.find((f) => !f.plan);
        assert.ok(landing, `${w}px: «Landing» no es un plan`);
        assert.match(landing.texto, /800\.000/, `${w}px: el servicio sin plan perdió su importe`);
        assert.match(m.total, /2\.300\.000/, `${w}px: «Inversión total» no suma los dos`);
        if (ROTO) return;
        sinErrores(errores, w);
        const business = m.filas.find((f) => f.plan);
        assert.doesNotMatch(business.texto.split("\n").slice(0, 2).join(" "), /1\.500\.000/, `${w}px: el servicio que es un plan repite su importe`);
        assert.equal(await pag.locator("[data-precio-del-servicio]").count(), 1, `${w}px: solo «Landing» lleva importe en su fila`);
    });
});

/* ─── 2. La cuadrícula de la guía, sin huecos ─────────────────────────── */

conNavegador("la cuadrícula de secciones de la guía desplegada no deja huecos", async () => {
    await abrir(
        VENTANA(PROPUESTA),
        async (pag, w, errores) => {
            const funcion = await abrirLaFuncion(pag, "respuestas");
            await funcion.locator("button[data-ver-la-guia]").click();
            const rejilla = funcion.locator('[data-guia-desplegada="leads"] [data-cuadricula-de-secciones]');
            await rejilla.waitFor({ state: "visible", timeout: 10_000 });
            const m = await rejilla.evaluate((g) => {
                const columnas = getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length;
                const hijos = [...g.children].filter((h) => getComputedStyle(h).display !== "none");
                const ocupa = (h) => {
                    const fin = getComputedStyle(h).gridColumnEnd;
                    const n = /span (\d+)/.exec(fin)?.[1];
                    return n ? Number(n) : 1;
                };
                const celdas = hijos.reduce((s, h) => s + ocupa(h), 0);
                return {
                    columnas,
                    huecos: (columnas - (celdas % columnas)) % columnas,
                    video: hijos.some((h) => h.getAttribute("data-tarjeta-de-cierre") === "video"),
                    contacto: hijos.some((h) => h.getAttribute("data-tarjeta-de-cierre") === "contacto"),
                };
            });
            if (ROTO) {
                if (w === 1440) {
                    assert.equal(m.huecos, 1, `${w}px ANTES: quedaba un hueco donde iba «Contáctanos»`);
                    assert.equal(m.video, false, `${w}px ANTES: el vídeo no ocupaba el sitio del contacto`);
                }
                return;
            }
            sinErrores(errores, w);
            assert.equal(m.huecos, 0, `${w}px: quedan ${m.huecos} huecos en la cuadrícula (${m.columnas} columnas)`);
            assert.equal(m.contacto, false, `${w}px: «Contáctanos» saca de la propuesta`);
            assert.ok(m.video, `${w}px: sin «Ver el vídeo de nuevo» en el cierre`);
        },
        [[1440, 900], [768, 1024], [390, 844]],
    );
});

/* ─── 3. La guía del Agente IA no sale en la propuesta ────────────────── */

conNavegador("la función del Agente IA se queda, pero sin su guía", async () => {
    await abrir(VENTANA(PROPUESTA), async (pag, w, errores) => {
        const funcion = await abrirLaFuncion(pag, "entrenar");
        const verGuia = funcion.locator("button[data-ver-la-guia]");
        if (ROTO) {
            assert.equal(await verGuia.count(), 1, `${w}px ANTES: la función del Agente IA ofrecía su guía`);
            await verGuia.click();
            await funcion.locator('[data-guia-desplegada="agente-ia"] [data-guia]').waitFor({ state: "visible", timeout: 10_000 });
            return;
        }
        sinErrores(errores, w);
        assert.match(await funcion.innerText(), /información de tu negocio/, `${w}px: la función perdió su descripción`);
        assert.equal(await verGuia.count(), 0, `${w}px: la función del Agente IA sigue ofreciendo «Ver guía»`);
        assert.equal(await funcion.locator("[data-tutorial]").count(), 0, `${w}px: la función del Agente IA lleva su tutorial`);
        assert.equal(await pag.locator('[data-guia-desplegada="agente-ia"], [data-ver-la-guia="agente-ia"]').count(), 0, `${w}px: la guía del Agente IA sale en la propuesta`);
        // Las demás guías siguen: el filtro quita esa y nada más.
        await abrirLaFuncion(pag, "respuestas");
        assert.equal(await laFuncion(pag, "respuestas").locator("button[data-ver-la-guia]").count(), 1, `${w}px: el filtro se llevó también las demás guías`);
    });
});

/* ─── 4. «Ver guía» compacta el video ─────────────────────────────────── */

conNavegador("«Ver guía» compacta el video, como en la página del plan", async () => {
    await abrir(VENTANA(PROPUESTA), async (pag, w, errores) => {
        const funcion = await abrirLaFuncion(pag, "respuestas");
        const caja = funcion.locator("[data-caja-del-video]");
        await caja.waitFor({ state: "visible" });
        const antes = (await caja.boundingBox()).width;
        await funcion.locator("button[data-ver-la-guia]").click();
        await funcion.locator('[data-guia-desplegada="leads"] [data-guia]').waitFor({ state: "visible", timeout: 10_000 });
        await pag.waitForTimeout(200);
        const despues = (await caja.boundingBox()).width;
        if (ROTO) {
            assert.equal(despues, antes, `${w}px ANTES: el video no se compactaba (${antes} → ${despues})`);
            return;
        }
        sinErrores(errores, w);
        assert.equal(await caja.getAttribute("data-video-compacto"), "si", `${w}px: la caja del video no se marca compacta`);
        const tope = w >= 640 ? 384 : 224;
        assert.ok(despues <= tope + 0.5, `${w}px: el video mide ${despues}px con la guía abierta (tope ${tope})`);
        if (w >= 640) assert.ok(despues < antes, `${w}px: el video no se encogió (${antes} → ${despues})`);
        await funcion.locator("button[data-ver-la-guia]").click();
        await pag.waitForTimeout(200);
        assert.equal(await caja.getAttribute("data-video-compacto"), "no", `${w}px: al ocultar la guía el video sigue compacto`);
        assert.equal((await caja.boundingBox()).width, antes, `${w}px: al ocultar la guía el video no vuelve a su tamaño`);
    });
});
