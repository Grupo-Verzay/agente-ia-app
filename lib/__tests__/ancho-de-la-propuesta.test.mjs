// El ancho de la página pública de una propuesta. Ver
// scripts/banco-ancho-de-la-propuesta.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const RAIZ = path.resolve(import.meta.dirname, "../..");
const ROTO = process.env.MODO === "roto";
const HARNESS = path.join(RAIZ, "lib/__tests__/.compilado/harness-ancho-propuesta.js");
const cssDir = path.join(RAIZ, ".next/static/css");
const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(cssDir, f), "utf8")).join("\n");

// El contenedor es el de la landing (max-w-6xl = 1152, con su relleno dentro):
// llena la ventana hasta 1152 y de ahí se centra.
const ESPERADO = { 390: 390, 768: 768, 1024: 1024, 1280: 1152, 1440: 1152, 1920: 1152 };

async function medir(nav, ancho) {
    const page = await nav.newPage({ viewport: { width: ancho, height: 900 } });
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="app"></div></body></html>`);
    await page.addScriptTag({ path: HARNESS });
    await page.waitForFunction(() => window.listo === true && document.querySelector("[data-propuesta]"));
    const m = await page.evaluate(() => {
        const a = document.querySelector("[data-propuesta]").getBoundingClientRect();
        const lecturas = [...document.querySelectorAll("[data-propuesta] p, [data-propuesta] dd")]
            .filter((p) => p.textContent.length > 200).map((p) => p.getBoundingClientRect().width);
        return {
            ancho: a.width, izquierda: a.left, derecha: innerWidth - a.right,
            lecturaMax: Math.max(0, ...lecturas), nLecturas: lecturas.length,
            desborda: document.documentElement.scrollWidth > innerWidth,
        };
    });
    await page.close();
    return m;
}

test("el contenedor de la propuesta en cada ancho", async () => {
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        for (const [ancho, esperado] of Object.entries(ESPERADO).map(([a, e]) => [Number(a), e])) {
            const m = await medir(nav, ancho);
            console.log(`  ${ancho}px → contenedor ${Math.round(m.ancho)} (márgenes ${Math.round(m.izquierda)}/${Math.round(m.derecha)}), párrafo más ancho ${Math.round(m.lecturaMax)}`);
            assert.equal(m.desborda, false, `${ancho}: la página desborda a lo ancho`);
            assert.ok(m.nLecturas > 0, "no hay párrafos largos que medir");
            if (ROTO) {
                if (ancho >= 1024) assert.equal(Math.round(m.ancho), 672, `ANTES ${ancho}: el contenedor medía 672`);
                continue;
            }
            assert.equal(Math.round(m.ancho), esperado, `${ancho}: contenedor`);
            assert.ok(Math.abs(m.izquierda - m.derecha) <= 1, `${ancho}: no está centrado`);
            // Lectura cómoda: ningún párrafo largo pasa de max-w-3xl (768).
            assert.ok(m.lecturaMax <= 768 + 0.5, `${ancho}: un párrafo mide ${m.lecturaMax}`);
        }
    } finally {
        await nav.close();
    }
});
