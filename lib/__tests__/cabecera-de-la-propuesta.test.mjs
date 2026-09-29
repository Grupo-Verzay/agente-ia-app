// La cabecera de la página pública de una propuesta: logo + «Propuesta
// comercial» y el eslogan a la misma altura, y el eslogan en negrilla. Ver
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

const ANCHOS = [390, 768, 1024, 1440];
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
        const bloque = rect(document.querySelector("[data-rotulo-propuesta]").parentElement);
        const logo = rect(document.querySelector("[data-rotulo-propuesta]").parentElement.firstElementChild);
        const rotulo = rect(document.querySelector("[data-rotulo-propuesta]"));
        const e = document.querySelector("[data-eslogan]");
        return {
            bloqueCentro: bloque.top + bloque.height / 2,
            logoAbajo: logo.bottom, rotuloArriba: rotulo.top,
            eslogan: e ? { centro: rect(e).top + rect(e).height / 2, peso: Number(getComputedStyle(e).fontWeight), texto: e.textContent } : null,
            desborda: document.documentElement.scrollWidth > innerWidth,
        };
    });
    await page.close();
    return m;
}

test("la cabecera de la propuesta: logo, rótulo y eslogan", async () => {
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    let vistoDesfase = false;
    try {
        for (const ancho of ANCHOS) for (const caso of CASOS) {
            const m = await medir(nav, ancho, caso);
            const et = `${ancho}px logo=${caso.logo} eslogan=${caso.eslogan.length}`;
            const dif = m.eslogan ? Math.abs(m.eslogan.centro - m.bloqueCentro) : 0;
            console.log(`  ${et} → desfase ${dif.toFixed(1)}px, peso ${m.eslogan?.peso ?? "-"}`);
            assert.equal(m.desborda, false, `${et}: desborda a lo ancho`);
            // Lo que se conserva: el rótulo va DEBAJO del logo.
            assert.ok(m.rotuloArriba >= m.logoAbajo - 0.5, `${et}: «Propuesta comercial» ya no va debajo del logo`);
            if (!caso.eslogan) { assert.equal(m.eslogan, null, `${et}: sin eslogan no se pinta nada`); continue; }
            assert.equal(m.eslogan.texto, caso.eslogan);
            if (ROTO) {
                if (dif > 4) vistoDesfase = true;
                assert.ok(m.eslogan.peso < 700, `ANTES ${et}: el eslogan no iba en negrilla`);
                continue;
            }
            assert.ok(dif <= 1, `${et}: el eslogan está ${dif.toFixed(1)}px descolgado del centro del logo`);
            assert.ok(m.eslogan.peso >= 700, `${et}: el eslogan no va en negrilla (${m.eslogan.peso})`);
        }
        if (ROTO) assert.ok(vistoDesfase, "ANTES: el eslogan quedaba a otra altura que el bloque del logo");
    } finally {
        await nav.close();
    }
});
