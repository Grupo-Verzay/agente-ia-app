// La cabecera de la página pública de una propuesta va DENTRO de la tarjeta
// azul: el logo arriba a la derecha, el eslogan abajo a la derecha, en
// negrilla y con letra de 16/18/20 px según la pantalla, y en ninguna parte
// «Propuesta comercial». Ver scripts/banco-cabecera-de-la-propuesta.sh.
//
// En MODO=roto se monta el componente de antes (ANTES_REF), que todavía tenía
// una cabecera aparte encima de la tarjeta (`[data-cabecera]`), y se afirma el
// rótulo y los 14 px: por eso la medida de ese modo va por su propio camino.
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

async function abrir(nav, ancho, caso) {
    const page = await nav.newPage({ viewport: { width: ancho, height: 900 } });
    const q = new URLSearchParams(caso).toString();
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="app"></div></body></html>`);
    // Una página de setContent no tiene query: el caso le llega al harness
    // por una variable en vez de por location.search.
    await page.evaluate((qs) => { window.__q = qs; }, q);
    const src = fs.readFileSync(HARNESS, "utf8").replace("location.search", "window.__q");
    await page.addScriptTag({ content: src });
    return page;
}

// La de ahora: todo dentro de `[data-hero]`, la tarjeta azul.
async function medirLaTarjeta(nav, ancho, caso) {
    const page = await abrir(nav, ancho, caso);
    await page.waitForFunction(() => window.listo === true && document.querySelector("[data-hero]"));
    const m = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect();
        const hero = document.querySelector("[data-hero]");
        const caja = r(hero);
        const est = getComputedStyle(hero);
        const bordeDerecho = caja.right - parseFloat(est.paddingRight);
        const pegado = (el) => Math.abs(bordeDerecho - r(el).right) < 1.5;
        const dentro = (el) => {
            const b = r(el);
            return b.left >= caja.left - 0.5 && b.right <= caja.right + 0.5
                && b.top >= caja.top - 0.5 && b.bottom <= caja.bottom + 0.5;
        };
        const arriba = hero.querySelector("[data-hero-arriba]");
        const abajo = hero.querySelector("[data-hero-abajo]");
        const logo = hero.querySelector("[data-logo-propuesta]");
        const e = document.querySelector("[data-eslogan]");
        return {
            sinCabeceraAparte: !document.querySelector("[data-cabecera]"),
            rotulo: Boolean(document.querySelector("[data-rotulo-propuesta]")),
            textoPagina: document.body.textContent,
            logo: logo ? {
                enArriba: Boolean(arriba?.contains(logo)),
                pegado: pegado(logo),
                dentro: dentro(logo),
                bajo: r(logo).bottom,
            } : null,
            eslogan: e ? {
                enAbajo: Boolean(abajo?.contains(e)),
                pegado: pegado(e),
                dentro: dentro(e),
                arriba: r(e).top,
                peso: Number(getComputedStyle(e).fontWeight),
                letra: parseFloat(getComputedStyle(e).fontSize),
                texto: e.textContent,
            } : null,
            desborda: document.documentElement.scrollWidth > innerWidth,
        };
    });
    await page.close();
    return m;
}

// La de antes: una cabecera aparte, encima de la tarjeta.
async function medirLaCabeceraDeAntes(nav, ancho, caso) {
    const page = await abrir(nav, ancho, caso);
    await page.waitForFunction(() => window.listo === true && document.querySelector("[data-cabecera]"));
    const m = await page.evaluate(() => {
        const h = document.querySelector("[data-cabecera]");
        const e = document.querySelector("[data-eslogan]");
        return {
            rotulo: Boolean(h.querySelector("[data-rotulo-propuesta]")),
            textoCabecera: h.textContent,
            eslogan: e ? { letra: parseFloat(getComputedStyle(e).fontSize), texto: e.textContent } : null,
        };
    });
    await page.close();
    return m;
}

test("la cabecera de la propuesta va DENTRO de la tarjeta azul: logo arriba y eslogan abajo, a la derecha, sin rótulo", async () => {
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    let vistoRotulo = false, vistoPequeno = false;
    try {
        for (const [ancho, letraMin] of ANCHOS) for (const caso of CASOS) {
            const et = `${ancho}px logo=${caso.logo} eslogan=${caso.eslogan.length}`;
            if (ROTO) {
                const m = await medirLaCabeceraDeAntes(nav, ancho, caso);
                console.log(`  ${et} → rótulo ${m.rotulo}, letra ${m.eslogan?.letra ?? "-"}px`);
                if (m.rotulo && m.textoCabecera.includes("Propuesta comercial")) vistoRotulo = true;
                if (m.eslogan && m.eslogan.letra <= 14) vistoPequeno = true;
                continue;
            }
            const m = await medirLaTarjeta(nav, ancho, caso);
            console.log(`  ${et} → logo ${m.logo?.pegado ? "a la derecha" : "?"}, eslogan ${m.eslogan ? `${m.eslogan.letra}px/${m.eslogan.peso}` : "-"}`);
            assert.equal(m.desborda, false, `${et}: desborda a lo ancho`);
            assert.equal(m.sinCabeceraAparte, true, `${et}: sigue una cabecera aparte encima de la tarjeta`);
            assert.equal(m.rotulo, false, `${et}: sigue el rótulo bajo el logo`);
            assert.equal(m.textoPagina.includes("Propuesta comercial"), false, `${et}: «Propuesta comercial» sigue en la página`);
            assert.ok(m.logo, `${et}: la tarjeta no lleva logo`);
            assert.equal(m.logo.enArriba, true, `${et}: el logo no va en la fila de arriba de la tarjeta`);
            assert.equal(m.logo.dentro, true, `${et}: el logo se sale de la tarjeta`);
            assert.equal(m.logo.pegado, true, `${et}: el logo no va pegado a la derecha de la tarjeta`);
            if (!caso.eslogan) {
                assert.equal(m.eslogan, null, `${et}: sin eslogan no se pinta nada`);
                continue;
            }
            assert.equal(m.eslogan?.texto, caso.eslogan);
            assert.equal(m.eslogan.enAbajo, true, `${et}: el eslogan no va en la fila de abajo de la tarjeta`);
            assert.equal(m.eslogan.dentro, true, `${et}: el eslogan se sale de la tarjeta`);
            assert.equal(m.eslogan.pegado, true, `${et}: el eslogan no va pegado a la derecha de la tarjeta`);
            assert.ok(m.eslogan.arriba > m.logo.bajo, `${et}: el eslogan no va debajo del logo`);
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
