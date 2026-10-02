/**
 * «Tutoriales» DENTRO de la landing, sobre la página SERVIDA y SIN SESIÓN.
 *
 * - Pulsar «Tutoriales» del menú (escritorio y teléfono) NO sale de `/inicio`:
 *   baja a la sección `#tutoriales`, con la barra de arriba fija y a la vista.
 * - La sección pinta las DIEZ categorías en el orden de `CATEGORIAS_DE_AYUDA`,
 *   cada una con el MISMO número de guías que el centro de ayuda del panel, y
 *   el buscador encuentra guías.
 * - Pulsar una categoría cambia de vista en la MISMA página (`#tutoriales/<slug>`):
 *   sus filas son las de la fuente, «Ver» lleva a la guía pública, y la flecha
 *   vuelve a las categorías. Abrir `/inicio#tutoriales/<slug>` la trae puesta.
 * - El logo lleva al principio de la landing, desde cualquier sitio.
 * - `/tutoriales` y `/tutoriales/<slug>` redirigen a la landing con su ancla.
 * - Nada desborda a lo ancho a 1440 y 390.
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

/** ¿Se ve la barra de arriba, pegada arriba, con todo lo suyo? */
async function laBarraSigueArriba(p) {
    return p.evaluate(() => {
        const h = document.querySelector("header");
        if (!h) return false;
        const r = h.getBoundingClientRect();
        return Math.abs(r.top) < 1 && r.height > 0 && !!h.querySelector("[data-logo-de-la-landing]");
    });
}
const laSeccionEstaALaVista = (p) =>
    p.evaluate(() => {
        const s = document.getElementById("tutoriales");
        const h = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        if (!s) return false;
        const r = s.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > h;
    });
const sinDesbordar = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const esperar = (p, ms) => p.waitForTimeout(ms);

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
        const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } });
        const p = await ctx.newPage();

        await p.goto(`${BASE}/inicio`, { waitUntil: "networkidle" });
        if (ancho >= 640) {
            const rotulos = await p.locator("header nav a").allInnerTexts();
            const i = rotulos.indexOf("Funciones");
            ok(rotulos[i + 1] === "Tutoriales", `${ancho}: menú de escritorio ${JSON.stringify(rotulos)}`);
            await p.locator("header nav a", { hasText: "Tutoriales" }).click();
        } else {
            await p.locator("header button.sm\\:hidden").click();
            const rotulos = await p.locator("header > div.border-t a").allInnerTexts();
            const enMenu = rotulos.filter((r) => ["Funciones", "Tutoriales", "Precios", "FAQ"].includes(r));
            ok(enMenu[enMenu.indexOf("Funciones") + 1] === "Tutoriales", `${ancho}: menú del teléfono ${JSON.stringify(enMenu)}`);
            await p.locator("header > div.border-t a", { hasText: "Tutoriales" }).click();
        }
        await esperar(p, 800);
        ok(new URL(p.url()).pathname === "/inicio", `${ancho}: «Tutoriales» no sale de la landing (${p.url()})`);
        ok(p.url().endsWith("#tutoriales"), `${ancho}: el ancla es #tutoriales`);
        ok(await laSeccionEstaALaVista(p), `${ancho}: baja a la sección`);
        ok(await laBarraSigueArriba(p), `${ancho}: la barra de arriba sigue fija y a la vista`);

        const slugs = await p.locator("#tutoriales [data-categoria-de-ayuda]").evaluateAll((els) => els.map((e) => e.getAttribute("data-categoria-de-ayuda")));
        ok(JSON.stringify(slugs) === JSON.stringify(ayuda.CATEGORIAS_DE_AYUDA.map((c) => c.slug)), `${ancho}: las diez categorías en su orden (${slugs.length})`);
        const numeros = await p.locator("#tutoriales [data-guias-de-la-categoria]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-guias-de-la-categoria"))));
        ok(JSON.stringify(numeros) === JSON.stringify(slugs.map((s) => cuantas[s] ?? 0)), `${ancho}: cada categoría con las guías de la fuente ${JSON.stringify(numeros)}`);
        const tags = await p.locator("#tutoriales [data-categoria-de-ayuda]").evaluateAll((els) => els.map((e) => e.tagName));
        ok(tags.every((t) => t === "BUTTON"), `${ancho}: las categorías no navegan (son botones)`);
        // Oscura, como el resto de la landing: ninguna tarjeta blanca.
        const fondo = await p.locator("#tutoriales [data-categoria-de-ayuda]").first().evaluate((e) => getComputedStyle(e).backgroundColor);
        const [r, g, b] = (fondo.match(/\d+/g) ?? []).map(Number);
        ok(r + g + b < 200, `${ancho}: las tarjetas van oscuras (${fondo})`);
        ok(await sinDesbordar(p), `${ancho}: la portada no desborda a lo ancho`);

        // El buscador.
        await p.locator("#tutoriales").getByRole("combobox").fill("exportar");
        await p.waitForSelector("#tutoriales [data-resultado-de-ayuda]");
        const r0 = await p.locator("#tutoriales [data-resultado-de-ayuda]").first().getAttribute("href");
        ok(/^\/guia\//.test(r0 ?? ""), `${ancho}: el buscador encuentra (${r0})`);
        await p.locator("#tutoriales").getByRole("combobox").fill("");

        // Una categoría con guías, en la MISMA página.
        const conGuias = slugs.find((s) => (cuantas[s] ?? 0) > 0);
        await p.locator(`#tutoriales [data-categoria-de-ayuda="${conGuias}"]`).click();
        await p.waitForSelector("#tutoriales [data-fila-de-guia]");
        ok(new URL(p.url()).pathname === "/inicio" && p.url().endsWith(`#tutoriales/${conGuias}`), `${ancho}: la categoría se abre sin salir (${p.url()})`);
        const filas = await p.locator("#tutoriales [data-guia-de-ayuda]").evaluateAll((els) => els.map((e) => e.getAttribute("data-guia-de-ayuda")));
        const esperadas = ayuda.lasGuiasDeLaCategoria(guias, conGuias).map((g) => g.modulo);
        ok(JSON.stringify(filas) === JSON.stringify(esperadas), `${ancho}: ${conGuias} lista las guías de la fuente ${JSON.stringify(filas)}`);
        const ver = await p.locator("#tutoriales [data-ver-guia]").first();
        ok((await ver.getAttribute("target")) === "_blank", `${ancho}: «Ver» abre la guía en otra pestaña, sin perder la landing`);
        const resp = await ctx.request.get(`${BASE}${await ver.getAttribute("href")}`, { maxRedirects: 0 });
        ok(resp.status() === 200, `${ancho}: «Ver» lleva a la guía pública (${resp.status()})`);
        ok(await laSeccionEstaALaVista(p), `${ancho}: la categoría queda a la vista`);
        ok(await laBarraSigueArriba(p), `${ancho}: la barra sigue arriba en la categoría`);
        ok(await sinDesbordar(p), `${ancho}: la categoría no desborda a lo ancho`);
        await p.locator("#tutoriales").getByRole("button", { name: "Volver a tutoriales" }).click();
        await p.waitForSelector("#tutoriales [data-categoria-de-ayuda]");
        ok(new URL(p.url()).pathname === "/inicio" && p.url().endsWith("#tutoriales"), `${ancho}: la flecha vuelve a las categorías (${p.url()})`);

        // Una categoría sin guías.
        const sinGuias = slugs.find((s) => (cuantas[s] ?? 0) === 0);
        if (sinGuias) {
            await p.locator(`#tutoriales [data-categoria-de-ayuda="${sinGuias}"]`).click();
            ok(await p.locator("#tutoriales [data-sin-guias-todavia]").isVisible(), `${ancho}: ${sinGuias} dice que está en preparación`);
            await p.locator("#tutoriales").getByRole("button", { name: "Volver a tutoriales" }).click();
        }

        // El logo: al principio de la landing, sin ancla.
        await p.locator("[data-logo-de-la-landing]").click();
        await p.waitForFunction(() => {
            const el = document.getElementById("inicio");
            return el && Math.abs(el.getBoundingClientRect().top) < 2;
        }, null, { timeout: 5000 }).then(() => ok(true, `${ancho}: el logo sube al principio de la landing`), () => ok(false, `${ancho}: el logo no sube al principio`));
        ok(new URL(p.url()).pathname === "/inicio" && !new URL(p.url()).hash, `${ancho}: el logo deja la dirección limpia (${p.url()})`);

        // Un enlace directo a una categoría la abre puesta.
        await p.goto(`${BASE}/inicio#tutoriales/${conGuias}`, { waitUntil: "networkidle" });
        await p.waitForSelector("#tutoriales [data-fila-de-guia]");
        await esperar(p, 400);
        ok(await laSeccionEstaALaVista(p), `${ancho}: /inicio#tutoriales/${conGuias} abre la categoría a la vista`);

        // Las direcciones viejas.
        await p.goto(`${BASE}/tutoriales`, { waitUntil: "networkidle" });
        ok(new URL(p.url()).pathname === "/inicio" && p.url().endsWith("#tutoriales"), `${ancho}: /tutoriales redirige a la landing (${p.url()})`);
        await p.goto(`${BASE}/tutoriales/${conGuias}`, { waitUntil: "networkidle" });
        await p.waitForSelector("#tutoriales [data-fila-de-guia]");
        ok(p.url().endsWith(`/inicio#tutoriales/${conGuias}`), `${ancho}: /tutoriales/${conGuias} abre esa categoría en la landing (${p.url()})`);
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
