/**
 * Los recuadros de capacidad se ven IGUAL en la página del plan y en la
 * propuesta que lleva ese plan dentro. Caso real: «Multimedia — PDFs, fotos,
 * videos, etc.» iba en una línea en la página del plan y, en la propuesta
 * (/propuesta/gabriel), se partía antes de «etc.» porque el recuadro mide menos
 * ahí (lo rodean la tarjeta del servicio y la sección, ambas con relleno).
 *
 * Las dos vistas son las de VERDAD, en Chromium sobre el CSS de Tailwind.
 * `MODO=roto` monta el código de `ANTES_REF` y AFIRMA el salto de línea.
 *
 * Se levanta con `scripts/banco-recuadros-de-capacidad-iguales.sh`.
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
const PAQUETE = join(AQUI, ".compilado", "recuadros-iguales", "vistas.js");
const cssDir = join(RAIZ, ".next", "static", "css");
const conNavegador = chromium && process.env.CHROME_BIN && fs.existsSync(cssDir) && fs.existsSync(PAQUETE) ? test : test.skip;

const FRASE = "PDFs, fotos, videos, etc.";
const CAPACIDAD = [
    { id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." },
    { id: "multimedia", icono: "catalogo", titulo: "Multimedia", valor: FRASE, detalle: "Envío de archivos." },
    { id: "asistencia", icono: "asistencia", titulo: "Asistencia", valor: "IA 24/7", detalle: "Todos los días." },
];
const PAGINA = {
    plan: "intermedio", tipo: "IA", nombre: "Business",
    precio: { texto: "$99 USD/mes", aConsultar: false }, video: null,
    paraQuien: { paraQuien: "Negocios que atienden por WhatsApp.", caso: "Una clínica." },
    capacidad: CAPACIDAD, funciones: [], preguntas: [],
    botones: { principal: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false }, secundario: null },
    planSuperior: null, meta: { titulo: "Business", descripcion: "", imagen: null },
    marca: "Verzay", logo: null, favicon: null, orden: ["capacidad"],
};
const PROPUESTA = {
    token: "t".repeat(32), cliente: "Gabriel", empresa: "", fecha: "2026-09-28", vigencia: "2026-10-15",
    tipoDeItems: "servicios", nota: "", metodoPago: "", medioPago: "", moneda: "COP",
    servicios: [{ nombre: "Business", alcance: "Agente de IA", inversion: 1500000 }],
    mantenimientoMensual: null, mantenimientoDescripcion: "", condiciones: "",
    actualizadaEn: "2026-09-28T12:00:00.000Z",
    negocio: { nombre: "Verzay", logo: null, eslogan: "Automatiza tu negocio con IA" },
};
const PLAN = {
    llave: "intermedio:IA", nombre: "Business", plan: "intermedio", tipo: "IA", activo: true, conFunciones: false,
    video: null, enlace: "/planes/nivel-3", capacidad: CAPACIDAD,
    precio: { texto: "$99", aConsultar: false },
    boton: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false },
};

async function abrir(vista, pintar, anchos) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(PAQUETE, "utf8");
    const datos = JSON.stringify({ __vista: vista, __pagina: PAGINA, __propuesta: PROPUESTA, __planes: [PLAN] }).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${datos});</script>` +
        `<script type="module">${js}</script></body></html>`;
    const servidor = http.createServer((_q, r) => {
        r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        r.end(html);
    });
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${servidor.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN });
    const salida = {};
    try {
        for (const w of anchos) {
            const ctx = await nav.newContext({ viewport: { width: w, height: 900 } });
            const pag = await ctx.newPage();
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
            await pag.waitForTimeout(300);
            assert.deepEqual(errores, [], `${vista} a ${w}px: errores en la página`);
            salida[w] = await pintar(pag);
            await ctx.close();
        }
    } finally {
        await nav.close();
        servidor.close();
    }
    return salida;
}

/** Del recuadro «Multimedia»: ancho, tamaño de letra y cuántas líneas ocupa la frase. */
const medir = (pag) =>
    pag.evaluate(() => {
        const caja = document.querySelector('[data-capacidad="multimedia"]');
        const valor = caja.children[1];
        const cs = getComputedStyle(valor);
        const linea = parseFloat(cs.lineHeight);
        // Cuántas líneas usa de verdad el texto (no la altura de la caja).
        const rango = document.createRange();
        rango.selectNodeContents(valor);
        const tops = new Set([...rango.getClientRects()].map((r) => Math.round(r.top)));
        return {
            ancho: Math.round(caja.getBoundingClientRect().width),
            letra: parseFloat(cs.fontSize),
            lineas: tops.size,
            alto: Math.round(valor.getBoundingClientRect().height / linea),
            desborda: valor.scrollWidth > valor.clientWidth + 1,
        };
    });

/* Anchos de ventana donde las tres columnas dan a cada recuadro lo bastante
   para la frase; a 768 son tres columnas de ~200 px, igual en las dos vistas. */
const ANCHOS = [1440, 1280, 1024, 390];

conNavegador("la frase de «Multimedia» va en UNA línea, también dentro de la propuesta", async () => {
    const plan = await abrir("plan", medir, ANCHOS);
    const propuesta = await abrir("propuesta", medir, ANCHOS);
    if (ROTO) {
        const partidos = ANCHOS.filter((w) => propuesta[w].lineas > 1);
        assert.ok(partidos.length >= 2, `antes la propuesta partía la frase (${JSON.stringify(propuesta)})`);
        assert.equal(plan[1440].lineas, 1, "antes, en la página del plan, a 1440 iba en una línea");
        return;
    }
    for (const w of ANCHOS) {
        assert.equal(plan[w].lineas, 1, `plan a ${w}px: la frase en una línea (${JSON.stringify(plan[w])})`);
        assert.equal(propuesta[w].lineas, 1, `propuesta a ${w}px: la frase en una línea (${JSON.stringify(propuesta[w])})`);
        assert.equal(plan[w].desborda, false, `plan a ${w}px: la frase no se sale de su recuadro`);
        assert.equal(propuesta[w].desborda, false, `propuesta a ${w}px: la frase no se sale de su recuadro`);
    }
});

conNavegador("la presentación es la misma: misma letra mientras cabe, nunca más chica de 18 px ni más grande de 24", async () => {
    if (ROTO) return;
    const plan = await abrir("plan", medir, ANCHOS);
    const propuesta = await abrir("propuesta", medir, ANCHOS);
    for (const w of ANCHOS) {
        for (const [vista, m] of [["plan", plan[w]], ["propuesta", propuesta[w]]]) {
            assert.ok(m.letra >= 18 && m.letra <= 24, `${vista} a ${w}px: letra de ${m.letra}px fuera de 18–24`);
        }
        // La propuesta es la vista más angosta: su letra puede ser menor, pero
        // nunca por más de lo que cuesta ese ancho (≤ 3,5 px de diferencia, a 390 son 34 px de recuadro).
        assert.ok(plan[w].letra - propuesta[w].letra <= 3.5, `a ${w}px la letra difiere ${plan[w].letra - propuesta[w].letra}px entre vistas`);
        assert.ok(propuesta[w].ancho <= plan[w].ancho, `a ${w}px la propuesta no es más ancha que el plan`);
    }
});

conNavegador("los otros recuadros no se tocan: siguen en una línea, con el mismo alto de fila", async () => {
    if (ROTO) return;
    for (const vista of ["plan", "propuesta"]) {
        const r = await abrir(
            vista,
            (pag) =>
                pag.evaluate(() =>
                    [...document.querySelectorAll("[data-capacidad]")].map((c) => ({
                        id: c.dataset.capacidad,
                        alto: Math.round(c.getBoundingClientRect().height),
                        ancho: Math.round(c.getBoundingClientRect().width),
                    })),
                ),
            [1440, 1024],
        );
        for (const w of [1440, 1024]) {
            const altos = new Set(r[w].map((c) => c.alto));
            const anchos = new Set(r[w].map((c) => c.ancho));
            assert.equal(altos.size, 1, `${vista} a ${w}px: los tres recuadros miden lo mismo de alto (${JSON.stringify(r[w])})`);
            assert.equal(anchos.size, 1, `${vista} a ${w}px: los tres recuadros miden lo mismo de ancho`);
        }
    }
});

test("barrido: el valor del recuadro usa el tamaño compartido, no un 24 px fijo", { skip: ROTO }, () => {
    const f = fs.readFileSync(join(RAIZ, "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx"), "utf8");
    assert.match(f, /export const TAMANO_DEL_VALOR = "text-\[length:clamp\(1\.125rem,8\.25cqw,1\.5rem\)\]"/);
    assert.match(f, /\[container-type:inline-size\]/, "el recuadro es contenedor del valor");
    const recuadros = f.slice(f.indexOf("export function RecuadrosDeCapacidad"), f.indexOf("export const COLUMNAS_DE_CAPACIDAD"));
    assert.match(recuadros, /TAMANO_DEL_VALOR/);
    assert.doesNotMatch(recuadros, /text-2xl/, "sin 24 px fijos en el valor");
});
