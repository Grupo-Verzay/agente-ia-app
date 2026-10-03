// «Resumen anual por mes» de Finanzas en modo oscuro. Ver
// scripts/banco-resumen-anual-oscuro.sh.
//
// Se mide lo que se VE: el color calculado del número y el fondo que de verdad
// tiene detrás, componiendo las capas con alfa de la casilla hacia arriba. Leer
// las clases no basta: `bg-sky-50` está bien escrito y el fallo es que no
// cambia con el tema, que solo se ve pintándolo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const RAIZ = path.resolve(import.meta.dirname, "../..");
const ROTO = process.env.MODO === "roto";
const OUT = path.join(RAIZ, "lib/__tests__/.compilado/resumen-anual-oscuro");
const cssDir = path.join(RAIZ, ".next/static/css");
const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(cssDir, f), "utf8")).join("\n");

// WCAG AA para texto de tamaño normal: el balance va a 14 px.
const LEGIBLE = 4.5;
const ANCHOS = [1440, 390];
const CASILLAS = [
    { nombre: "mes elegido en positivo", rejilla: "A", i: 2, elegido: true },
    { nombre: "mes elegido en negativo", rejilla: "B", i: 4, elegido: true },
    { nombre: "mes en positivo", rejilla: "A", i: 0, elegido: false },
    { nombre: "mes en negativo", rejilla: "A", i: 1, elegido: false },
];

async function medir(nav, cual, tema, ancho) {
    const page = await nav.newPage({ viewport: { width: ancho, height: 900 } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.setContent(`<!doctype html><html class="${tema === "oscuro" ? "dark" : ""}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="app"></div></body></html>`);
    await page.addScriptTag({ path: path.join(OUT, `${cual}.js`) });
    try {
        await page.waitForFunction(() => window.listo === true
            && document.querySelectorAll('[data-rejilla="B"] > a').length === 12, null, { timeout: 15000 });
    } catch (e) {
        throw new Error(`la rejilla (${cual}) no llegó a pintarse${errores.length ? `: ${errores.join(" | ")}` : ""}`);
    }
    const casillas = await page.evaluate((CASILLAS) => {
        const rgba = (s) => {
            const m = s.match(/^rgba?\(([^)]+)\)$/);
            if (!m) throw new Error(`color que no se sabe leer: ${s}`);
            const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        };
        // El fondo que se VE detrás de un nodo: las capas de fuera hacia dentro,
        // cada una mezclada con su alfa sobre lo que hay debajo.
        const fondoDe = (el) => {
            const capas = [];
            for (let n = el; n && n.nodeType === 1; n = n.parentElement) capas.push(rgba(getComputedStyle(n).backgroundColor));
            let c = { r: 255, g: 255, b: 255 };
            for (const capa of capas.reverse()) {
                c = { r: capa.r * capa.a + c.r * (1 - capa.a), g: capa.g * capa.a + c.g * (1 - capa.a), b: capa.b * capa.a + c.b * (1 - capa.a) };
            }
            return c;
        };
        const lum = ({ r, g, b }) => {
            const l = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
            return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
        };
        const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const redondo = ({ r, g, b }) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        return CASILLAS.map((c) => {
            const casilla = document.querySelectorAll(`[data-rejilla="${c.rejilla}"] > a`)[c.i];
            const numero = casilla.querySelector(":scope > div:nth-child(2) span");
            const mes = casilla.querySelector(":scope > div:nth-child(1)");
            const texto = rgba(getComputedStyle(numero).color);
            const fondo = fondoDe(numero);
            const textoMes = rgba(getComputedStyle(mes).color);
            return {
                ...c,
                cifra: numero.textContent,
                color: redondo(texto),
                fondo: redondo(fondo),
                fondoRgb: fondo,
                sombra: getComputedStyle(casilla).boxShadow,
                contraste: contraste(texto, fondo),
                contrasteMes: contraste(textoMes, fondoDe(mes)),
            };
        });
    }, CASILLAS);
    await page.close();
    return casillas;
}

const distancia = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const verbo = (m) => m.map((c) => `${c.nombre} ${c.contraste.toFixed(2)} (${c.color} sobre ${c.fondo})`).join(" · ");

test("barrido: la página pinta la casilla compartida, con sus colores de modo oscuro", { skip: ROTO }, () => {
    const pagina = fs.readFileSync(path.join(RAIZ, "app/(root)/(protected)/dashboard/finance/page.tsx"), "utf8");
    const casilla = fs.readFileSync(path.join(RAIZ, "app/(root)/(protected)/dashboard/finance/_components/MesDelResumenAnual.tsx"), "utf8");
    assert.match(pagina, /<MesDelResumenAnual\b/, "la rejilla anual no usa MesDelResumenAnual");
    // Una copia de la casilla en la página sería la que se queda sin el arreglo.
    assert.doesNotMatch(pagina, /bg-sky-50/, "page.tsx vuelve a escribir el fondo del mes elegido a mano");
    assert.match(casilla, /FONDO_DEL_MES_ELEGIDO = '[^']*\bdark:bg-/, "el fondo del mes elegido no tiene su tono de modo oscuro");
    assert.match(casilla, /CIFRA_NEGATIVA = '[^']*\bdark:text-/, "el balance negativo no tiene su color de modo oscuro");
    assert.match(casilla, /mes\.active \? FONDO_DEL_MES_ELEGIDO/, "la casilla no usa FONDO_DEL_MES_ELEGIDO");
    assert.match(casilla, /mes\.balance < 0 \? CIFRA_NEGATIVA/, "la casilla no usa CIFRA_NEGATIVA");
    // Que la clase exista en el código no dice que exista en producción: se
    // busca la DECLARACIÓN en el CSS del build.
    // Tailwind 3.4 la escribe `.dark\:bg-sky-950:is(.dark *){`. Se busca con
    // `includes` y no con `assert.match`: un fallo imprimiría la hoja entera.
    assert.ok(css.includes(".dark\\:bg-sky-950:is(.dark *){"), "el build no generó dark:bg-sky-950");
    assert.ok(css.includes(".dark\\:text-red-400:is(.dark *){"), "el build no generó dark:text-red-400");
});

test("el número de cada mes en claro y en oscuro, antes y ahora", async () => {
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        for (const ancho of ANCHOS) {
            const antes = { claro: await medir(nav, "antes", "claro", ancho), oscuro: await medir(nav, "antes", "oscuro", ancho) };
            const ahora = { claro: await medir(nav, "ahora", "claro", ancho), oscuro: await medir(nav, "ahora", "oscuro", ancho) };
            console.log(`  ${ancho}px · antes, oscuro: ${verbo(antes.oscuro)}`);
            console.log(`  ${ancho}px · ahora, oscuro: ${verbo(ahora.oscuro)}`);

            for (const m of [...antes.claro, ...antes.oscuro, ...ahora.claro, ...ahora.oscuro]) {
                assert.match(m.cifra, /\$/, `${ancho} ${m.nombre}: la casilla no trae su cifra`);
                assert.ok(m.contrasteMes >= LEGIBLE, `${ancho} ${m.nombre}: el nombre del mes no se lee (${m.contrasteMes.toFixed(2)})`);
            }

            if (ROTO) {
                const [elegido, , , negativo] = antes.oscuro;
                // Lo reportado: el valor del mes elegido, blanco sobre blanco.
                assert.ok(elegido.contraste < 1.5, `ANTES ${ancho}: el mes elegido se leía en oscuro (${elegido.contraste.toFixed(2)})`);
                // Y el mes en pérdidas, rojo oscuro sobre la tarjeta oscura.
                assert.ok(negativo.contraste < 3, `ANTES ${ancho}: el mes en negativo se leía en oscuro (${negativo.contraste.toFixed(2)})`);
                continue;
            }

            // En oscuro se lee TODO número: el elegido y los demás, en positivo y
            // en negativo.
            for (const m of ahora.oscuro) {
                assert.ok(m.contraste >= LEGIBLE, `${ancho} oscuro, ${m.nombre}: contraste ${m.contraste.toFixed(2)} (${m.color} sobre ${m.fondo})`);
            }
            // Y el mes elegido sigue MARCADO: otro fondo que los demás, y su anillo.
            const [elegido, , normal] = ahora.oscuro;
            assert.ok(distancia(elegido.fondoRgb, normal.fondoRgb) > 30,
                `${ancho} oscuro: el mes elegido no se distingue de los demás (${elegido.fondo} frente a ${normal.fondo})`);
            assert.notEqual(elegido.sombra, "none", `${ancho} oscuro: el mes elegido perdió su anillo`);

            // En claro no cambia NI UN color respecto a antes.
            ahora.claro.forEach((m, k) => {
                const viejo = antes.claro[k];
                assert.deepEqual({ color: m.color, fondo: m.fondo, sombra: m.sombra },
                    { color: viejo.color, fondo: viejo.fondo, sombra: viejo.sombra },
                    `${ancho} claro, ${m.nombre}: cambió respecto a antes`);
            });
        }
    } finally {
        await nav.close();
    }
});
