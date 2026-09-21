/**
 * El panel del embudo de Chats, en Chromium y con el componente real.
 *
 * El rango de fechas se movió del menú «⋯» a este panel (`TagFilterPanel`), que
 * queda con dos secciones: arriba el rango, debajo las etiquetas. Se comprueba:
 *   - con RANGO solo, con ETIQUETAS solas y con LOS DOS a la vez: el botón del
 *     embudo se marca activo en los tres;
 *   - que «Limpiar» del rango toca SOLO el rango, y limpiar una etiqueta toca
 *     SOLO las etiquetas;
 *   - que «Inicio de conversación» no se parte en dos renglones y que los campos
 *     de fecha no se cortan;
 *   - y que en el menú «⋯» (`ChatTabBar`) NO queda rastro del rango.
 *
 * Se monta con `scripts/banco-panel-filtros.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se dice y se salta.
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-panel-filtros.js");

const TAGS = [
    { id: 1, name: "Contactado", color: "#8b5cf6", order: 0 },
    { id: 2, name: "Interesado", color: "#f59e0b", order: 1 },
    { id: 3, name: "Cliente", color: "#10b981", order: 2 },
];

// El CSS del build: sin él, las clases de Tailwind (`w-72`, `flex-1`, `w-12`)
// no tienen efecto y medir el ancho de los campos o si un texto se parte no
// diría nada. Es la regla de siempre: la maqueta se mide sobre el CSS del build.
function leerCssDelBuild() {
    const dir = join(RAIZ, ".next", "static", "css");
    let css = "";
    try {
        for (const f of readdirSync(dir)) {
            if (f.endsWith(".css")) css += readFileSync(join(dir, f), "utf8") + "\n";
        }
    } catch {
        // Sin build no hay CSS; el test que lo necesita se salta (ver abajo).
    }
    return css;
}

function levantar() {
    const bundle = readFileSync(HARNESS);
    const css = leerCssDelBuild();
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><link rel="stylesheet" href="/build.css"></head>` +
                    `<body><div id="app"></div>` +
                    `<script type="module" src="/harness-panel-filtros.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/build.css") {
            res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
            res.end(css);
            return;
        }
        if (u === "/harness-panel-filtros.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    server.__hayCss = Boolean(css);
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir() {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    return {
        page,
        hayCss: server.__hayCss,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/** Monta con unos props, abre el panel y limpia el registro de llamadas. */
async function montarYAbrir(page, props) {
    await page.evaluate((p) => {
        window.calls = [];
        window.montar(p);
    }, props);
    // Si el panel no está abierto, se abre pulsando el embudo.
    if ((await page.locator("[data-desde]").count()) === 0) {
        await page.locator("[data-embudo]").click();
    }
    await page.waitForSelector("[data-desde]", { timeout: 5000 });
    await page.evaluate(() => { window.calls = []; });
}

const activo = (page) => page.locator("[data-embudo]").getAttribute("data-activo");
const llamadas = (page) => page.evaluate(() => window.calls.map((c) => c[0]));

test("con RANGO solo: el embudo se marca activo y el panel muestra el rango", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, hayCss, cerrar } = await abrir();
    try {
        await montarYAbrir(page, {
            tags: TAGS,
            selectedTagIds: [],
            rangoActivo: true,
            rangoDesde: "2026-09-14",
            rangoHasta: "2026-09-21",
            campoDeFecha: "inicio",
        });
        assert.equal(await activo(page), "si", "el embudo se ve activo con un rango puesto");
        // Los dos campos de fecha existen y llevan su valor.
        assert.equal(await page.locator("[data-desde]").inputValue(), "2026-09-14");
        assert.equal(await page.locator("[data-hasta]").inputValue(), "2026-09-21");
        // Sin etiquetas elegidas no hay insignia con número.
        assert.equal(await page.locator("[data-embudo] span").count(), 0, "sin etiquetas no hay número");

        // La maqueta solo se mide con el CSS del build: sin él las clases de
        // Tailwind no hacen nada y el ancho no diría nada. Se salta con aviso.
        if (!hayCss) {
            t.diagnostic("sin CSS del build (falta `npm run build`): no se mide la maqueta");
            return;
        }
        // El panel mide sus 288 px (`w-72`), no el ancho por defecto.
        const anchoPanel = await page.locator("[data-desde]")
            .evaluate((el) => el.closest("[data-radix-popper-content-wrapper]")?.firstElementChild?.clientWidth ?? 0);
        assert.ok(anchoPanel >= 280, `el panel tiene su ancho de w-72 (fue ${anchoPanel})`);
        // «Inicio de conversación» NO se parte en dos renglones.
        const inicio = page.locator('[data-campo="inicio"] span').first();
        const renglones = await inicio.evaluate((el) => el.getClientRects().length);
        assert.equal(renglones, 1, "«Inicio de conversación» va en un solo renglón");
        // Los campos de fecha no se cortan: ocupan el ancho (flex-1), de sobra
        // para un DD/MM/AAAA.
        const anchoDesde = await page.locator("[data-desde]").evaluate((el) => el.clientWidth);
        assert.ok(anchoDesde >= 150, `el campo Desde no se corta (ancho ${anchoDesde})`);
    } finally {
        await cerrar();
    }
});

test("con ETIQUETAS solas: el embudo se marca activo y lleva su número", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        await montarYAbrir(page, { tags: TAGS, selectedTagIds: [2], rangoActivo: false });
        assert.equal(await activo(page), "si", "el embudo se ve activo con una etiqueta puesta");
        assert.equal(await page.locator("[data-embudo] span").innerText(), "1", "la insignia dice cuántas etiquetas");
        // La sección de etiquetas está, y la elegida se ve seleccionada.
        assert.ok((await page.locator('[data-tag="2"]').count()) === 1);
    } finally {
        await cerrar();
    }
});

test("con LOS DOS a la vez: el embudo se marca activo", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        await montarYAbrir(page, {
            tags: TAGS,
            selectedTagIds: [1, 3],
            rangoActivo: true,
            rangoDesde: "2026-09-01",
            rangoHasta: "2026-09-30",
        });
        assert.equal(await activo(page), "si");
        assert.equal(await page.locator("[data-embudo] span").innerText(), "2");
        assert.equal(await page.locator("[data-desde]").inputValue(), "2026-09-01");
    } finally {
        await cerrar();
    }
});

test("Limpiar del RANGO toca solo el rango; una etiqueta toca solo las etiquetas", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        // Con los dos activos, el «Limpiar» del rango sale (solo aparece con rango).
        await montarYAbrir(page, {
            tags: TAGS,
            selectedTagIds: [1],
            rangoActivo: true,
            rangoDesde: "2026-09-01",
            rangoHasta: "2026-09-30",
        });

        await page.locator("[data-limpiar-rango]").click();
        let c = await llamadas(page);
        assert.deepEqual(c, ["onLimpiarRango"], "limpiar el rango NO toca las etiquetas");

        // Y limpiar la etiqueta (pulsando la que está activa) solo llama a lo suyo.
        await page.evaluate(() => { window.calls = []; });
        await page.locator('[data-tag="1"]').click();
        c = await llamadas(page);
        assert.deepEqual(c, ["onClearFilter"], "limpiar la etiqueta NO toca el rango");
    } finally {
        await cerrar();
    }
});

test("en el menú «⋯» (ChatTabBar) no queda rastro del rango de fechas", () => {
    const src = readFileSync(join(RAIZ, "app/(root)/chats/_components/ChatTabBar.tsx"), "utf8");
    for (const rastro of ["Rango de fechas", "onRangoDesde", "campoDeFecha", "Inicio de conversación"]) {
        assert.ok(!src.includes(rastro), `ChatTabBar ya no menciona «${rastro}»`);
    }
});
