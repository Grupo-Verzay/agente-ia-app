/**
 * «Tutoriales» sobre la página SERVIDA y SIN SESIÓN.
 *
 * - En la landing (`/inicio`), el menú de escritorio y el del teléfono llevan
 *   «Tutoriales» entre «Funciones» y «Precios», y pulsarlo abre `/tutoriales`.
 * - `/tutoriales` no manda al login, pinta las DIEZ categorías en el orden de
 *   `CATEGORIAS_DE_AYUDA`, cada una con el MISMO número de guías que el centro
 *   de ayuda del panel (sale de `lasGuiasDelCentroDeAyuda`, compilada), y el
 *   buscador encuentra guías.
 * - Una categoría con guías abre `/tutoriales/<slug>`, sus filas son las de la
 *   fuente y su «Ver» lleva a la guía pública, que también abre sin sesión.
 * - La flecha vuelve a `/tutoriales`, y nada desborda a lo ancho a 1440 y 390.
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3922";

const ayuda = await import(path.join(RAIZ, "lib/__tests__/.compilado/tutoriales-publicos/centro-de-ayuda.mjs"));
const fuente = await import(path.join(RAIZ, "lib/__tests__/.compilado/tutoriales-publicos/guias-del-centro-de-ayuda.mjs"));
const guias = fuente.lasGuiasDelCentroDeAyuda();
const cuantas = ayuda.cuantasPorCategoria(guias);

let fallos = 0;
const ok = (cond, msg) => {
    console.log(`${cond ? "ok  " : "MAL "} ${msg}`);
    if (!cond) fallos++;
};

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
        const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } });
        const p = await ctx.newPage();

        // La landing.
        await p.goto(`${BASE}/inicio`, { waitUntil: "networkidle" });
        if (ancho >= 640) {
            const rotulos = await p.locator("header nav a").allInnerTexts();
            const i = rotulos.indexOf("Funciones");
            ok(rotulos[i + 1] === "Tutoriales" && (rotulos[i + 2] ?? "Precios") !== "" , `${ancho}: menú de escritorio ${JSON.stringify(rotulos)}`);
            ok(rotulos.indexOf("Tutoriales") > i && (!rotulos.includes("Precios") || rotulos.indexOf("Precios") === i + 2), `${ancho}: Tutoriales justo antes de Precios`);
            await p.locator("header nav a", { hasText: "Tutoriales" }).click();
        } else {
            await p.locator("header button.sm\\:hidden").click();
            const rotulos = await p.locator("header > div.border-t a").allInnerTexts();
            const enMenu = rotulos.filter((r) => ["Funciones", "Tutoriales", "Precios", "FAQ"].includes(r));
            const i = enMenu.indexOf("Funciones");
            ok(enMenu[i + 1] === "Tutoriales", `${ancho}: menú del teléfono ${JSON.stringify(enMenu)}`);
            await p.locator("header > div.border-t a", { hasText: "Tutoriales" }).click();
        }
        await p.waitForURL(/\/tutoriales$/);
        await p.waitForSelector("[data-categoria-de-ayuda]");
        ok(!p.url().includes("/login"), `${ancho}: /tutoriales abre sin sesión (${p.url()})`);
        ok((await p.locator("[data-titulo-de-documentacion]").innerText()) === "Tutoriales", `${ancho}: el título dice Tutoriales`);

        const slugs = await p.locator("[data-categoria-de-ayuda]").evaluateAll((els) => els.map((e) => e.getAttribute("data-categoria-de-ayuda")));
        ok(JSON.stringify(slugs) === JSON.stringify(ayuda.CATEGORIAS_DE_AYUDA.map((c) => c.slug)), `${ancho}: las diez categorías en su orden (${slugs.length})`);
        const numeros = await p.locator("[data-guias-de-la-categoria]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-guias-de-la-categoria"))));
        ok(JSON.stringify(numeros) === JSON.stringify(slugs.map((s) => cuantas[s] ?? 0)), `${ancho}: cada categoría con las guías de la fuente ${JSON.stringify(numeros)}`);
        const hrefs = await p.locator("[data-categoria-de-ayuda]").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
        ok(hrefs.every((h, i) => h === `/tutoriales/${slugs[i]}`), `${ancho}: las categorías llevan a /tutoriales/<slug>`);
        ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${ancho}: la portada no desborda a lo ancho`);

        // El buscador.
        await p.getByRole("combobox").fill("exportar");
        await p.waitForSelector("[data-resultado-de-ayuda]");
        const r = await p.locator("[data-resultado-de-ayuda]").first().getAttribute("href");
        ok(/^\/guia\//.test(r ?? ""), `${ancho}: el buscador encuentra (${r})`);
        await p.getByRole("combobox").fill("");

        // Una categoría con guías.
        const conGuias = slugs.find((s) => (cuantas[s] ?? 0) > 0);
        await p.locator(`[data-categoria-de-ayuda="${conGuias}"]`).click();
        await p.waitForURL(new RegExp(`/tutoriales/${conGuias}$`));
        await p.waitForSelector("[data-fila-de-guia]");
        const filas = await p.locator("[data-guia-de-ayuda]").evaluateAll((els) => els.map((e) => e.getAttribute("data-guia-de-ayuda")));
        const esperadas = ayuda.lasGuiasDeLaCategoria(guias, conGuias).map((g) => g.modulo);
        ok(JSON.stringify(filas) === JSON.stringify(esperadas), `${ancho}: ${conGuias} lista las guías de la fuente ${JSON.stringify(filas)}`);
        const ver = await p.locator("[data-ver-guia]").first().getAttribute("href");
        const resp = await ctx.request.get(`${BASE}${ver}`, { maxRedirects: 0 });
        ok(resp.status() === 200, `${ancho}: «Ver» lleva a la guía pública (${ver} → ${resp.status()})`);
        ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${ancho}: la categoría no desborda a lo ancho`);
        await p.getByRole("link", { name: "Volver a tutoriales" }).click();
        await p.waitForURL(/\/tutoriales$/);
        ok(true, `${ancho}: la flecha vuelve a /tutoriales`);

        // Una categoría sin guías, y una que no existe.
        const sinGuias = slugs.find((s) => (cuantas[s] ?? 0) === 0);
        if (sinGuias) {
            await p.goto(`${BASE}/tutoriales/${sinGuias}`);
            ok(await p.locator("[data-sin-guias-todavia]").isVisible(), `${ancho}: ${sinGuias} dice que está en preparación`);
        }
        const nada = await ctx.request.get(`${BASE}/tutoriales/no-existe`, { maxRedirects: 0 });
        ok(nada.status() === 404, `${ancho}: una categoría que no existe da 404 (${nada.status()})`);
        await ctx.close();
    }
} finally {
    await navegador.close();
}
if (fallos) {
    console.log(`\n${fallos} fallo(s)`);
    process.exit(1);
}
console.log("\ntodo bien");
