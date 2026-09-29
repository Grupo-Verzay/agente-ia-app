// La cabecera de la página pública de una propuesta: solo el logo y el
// eslogan, a la misma altura, el eslogan en negrilla y con letra de 16/18/20 px
// según la pantalla, y sin «Propuesta comercial» debajo del logo. Ver
// scripts/banco-cabecera-de-la-propuesta.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const RAIZ = path.resolve(import.meta.dirname, "../..");
const ROTO = process.env.MODO === "roto";
const HARNESS = path.join(RAIZ, "lib/__tests__/.compilado/harness-cabecera-propuesta.js");
const cssDir = path.join(RAIZ, ".next/static/css");
const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(cssDir, f), "utf8")).join("\n");

// La letra mínima del eslogan en cada anchura: text-base, sm:text-lg, lg:text-xl.
const ANCHOS = [[390, 16], [768, 18], [1024, 20], [1440, 20]];
const CASOS = [
    { logo: "no", eslogan: "Automatiza tu negocio con IA" },
    { logo: "si", eslogan: "Automatiza tu negocio con IA" },
    { logo: "no", eslogan: "Automatiza tu negocio con inteligencia artificial y vende todos los días del año sin parar" },
    { logo: "no", eslogan: "" },
];

async function medir(nav, ancho, caso) {
    const page = await nav.newPage({ viewport: { width: ancho, height: 900 } });
    const q = new URLSearchParams(caso).toString();
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="app"></div></body></html>`);
    // Una página de setContent no tiene query: el caso le llega al harness
    // por una variable en vez de por location.search.
    await page.evaluate((qs) => { window.__q = qs; }, q);
    const src = fs.readFileSync(HARNESS, "utf8").replace("location.search", "window.__q");
    await page.addScriptTag({ content: src });
    await page.waitForFunction(() => window.listo === true && document.querySelector("[data-cabecera]"));
    const m = await page.evaluate(() => {
        const rect = (el) => el && el.getBoundingClientRect();
        const h = document.querySelector("[data-cabecera]");
        // El logo se busca por lo que SE VE —el primer img o caja de 48 px—
        // para medir igual en los dos modos (el de antes no lleva la marca).
        const logoEl = h.querySelector("[data-logo-propuesta]")
            ?? h.querySelector("[data-rotulo-propuesta]")?.parentElement.firstElementChild;
        const logo = rect(logoEl);
        const e = document.querySelector("[data-eslogan]");
        const hijosIzq = h.firstElementChild;
        return {
            textoCabecera: h.textContent,
            rotulo: Boolean(h.querySelector("[data-rotulo-propuesta]")),
            logoCentro: logo.top + logo.height / 2,
            logoIzq: logo.left - h.getBoundingClientRect().left,
            bloqueIzqAlto: rect(hijosIzq).height,
            eslogan: e ? {
                centro: rect(e).top + rect(e).height / 2,
                peso: Number(getComputedStyle(e).fontWeight),
                letra: parseFloat(getComputedStyle(e).fontSize),
                derecha: Math.abs(rect(e).right - h.getBoundingClientRect().right),
                texto: e.textContent,
            } : null,
            desborda: document.documentElement.scrollWidth > innerWidth,
        };
    });
    await page.close();
    return m;
}

test("la cabecera de la propuesta: logo y eslogan, sin rótulo", async () => {
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    let vistoRotulo = false, vistoPequeno = false;
    try {
        for (const [ancho, letraMin] of ANCHOS) for (const caso of CASOS) {
            const m = await medir(nav, ancho, caso);
            const et = `${ancho}px logo=${caso.logo} eslogan=${caso.eslogan.length}`;
            const dif = m.eslogan ? Math.abs(m.eslogan.centro - m.logoCentro) : 0;
            console.log(`  ${et} → rótulo ${m.rotulo}, desfase ${dif.toFixed(1)}px, letra ${m.eslogan?.letra ?? "-"}px, peso ${m.eslogan?.peso ?? "-"}`);
            assert.equal(m.desborda, false, `${et}: desborda a lo ancho`);
            assert.ok(m.logoIzq < 0.5, `${et}: el logo no va pegado a la izquierda`);
            if (caso.eslogan) assert.equal(m.eslogan?.texto, caso.eslogan);
            else assert.equal(m.eslogan, null, `${et}: sin eslogan no se pinta nada`);
            if (ROTO) {
                if (m.rotulo && m.textoCabecera.includes("Propuesta comercial")) vistoRotulo = true;
                if (m.eslogan && m.eslogan.letra <= 14) vistoPequeno = true;
                continue;
            }
            assert.equal(m.rotulo, false, `${et}: sigue el rótulo bajo el logo`);
            assert.equal(m.textoCabecera.includes("Propuesta comercial"), false, `${et}: «Propuesta comercial» sigue en la cabecera`);
            assert.ok(m.bloqueIzqAlto <= 48.5, `${et}: lo de la izquierda mide más que el logo (${m.bloqueIzqAlto})`);
            if (!m.eslogan) continue;
            assert.ok(dif <= 1, `${et}: el eslogan está ${dif.toFixed(1)}px descolgado del centro del logo`);
            assert.ok(m.eslogan.derecha < 0.5, `${et}: el eslogan no va pegado a la derecha`);
            assert.ok(m.eslogan.peso >= 700, `${et}: el eslogan no va en negrilla (${m.eslogan.peso})`);
            assert.ok(m.eslogan.letra >= letraMin, `${et}: el eslogan mide ${m.eslogan.letra}px, menos de ${letraMin}`);
        }
        if (ROTO) {
            assert.ok(vistoRotulo, "ANTES: «Propuesta comercial» iba debajo del logo");
            assert.ok(vistoPequeno, "ANTES: el eslogan iba a 14 px");
        }
    } finally {
        await nav.close();
    }
});
