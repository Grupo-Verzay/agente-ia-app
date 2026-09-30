/**
 * La pantalla de Google Sheets (`/google-sheets`) REAL, en Chromium.
 *
 * Lo que se pregunta aquí es lo que el código no contesta leyéndolo: qué llega
 * al servidor al pulsar Guardar, qué ve la persona cuando el enlace no sirve,
 * si los mandos de la hoja se ven y en qué orden, qué pasa al copiar sin
 * permiso y si hay forma de QUITAR una hoja. La acción está fingida y apunta lo
 * que se le pide (`fingido/acciones-de-google-sheets.ts`).
 *
 * Con `MODO=roto` se monta el `GoogleSheetsClient` de `ANTES_REF` y se AFIRMAN
 * los fallos de antes: un enlace de un documento se guardaba tal cual y la
 * pantalla se quedaba en blanco sin el campo para corregirlo; no se decía con
 * qué correo compartir la hoja; los mandos flotaban al 40 % encima de la hoja,
 * el de cambiar sin rótulo; copiar sin permiso reventaba; y no había forma de
 * quitar una hoja.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "pantalla-de-google-sheets", "harness.js");

const DOCUMENTO = "https://docs.google.com/document/d/1Hq4tR8kLmN2pX9vB7cD3eF5gH6jK0lZ/edit";
const ID = "1mNegocioVentasYCitas2026HojaDeEjemplo0Guia";
const PEGADO = `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing#gid=77`;
const LIMPIO = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=77`;
const INCRUSTADO = `https://docs.google.com/spreadsheets/d/${ID}/edit?rm=minimal#gid=77`;

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : "";

let servidor, navegador, pagina;
const errores = [];
const todos = [];

test.before(async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="app-module-content"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    servidor = http
        .createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        })
        .listen(0);
    await new Promise((r) => servidor.once("listening", r));
    navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
    // La hoja incrustada: aquí no hay Google. Una página en blanco basta para
    // leer qué dirección pidió el iframe.
    await ctx.route(/^https:\/\/docs\.google\.com\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html><body>hoja</body></html>" }));
    pagina = await ctx.newPage();
    pagina.on("pageerror", (e) => {
        errores.push(String(e));
        todos.push(String(e));
    });
    await pagina.goto(`http://127.0.0.1:${servidor.address().port}/`);
    await pagina.waitForFunction(() => window.listo === true, null, { timeout: 20000 }).catch(() => {
        throw new Error("la maqueta no llegó a cargar: " + errores.join(" | "));
    });
});

test.after(async () => {
    await navegador?.close();
    servidor?.close();
});

async function pintar(hoja) {
    errores.length = 0;
    await pagina.evaluate((h) => window.pintar(h), hoja);
    await pagina.waitForSelector("input", { timeout: 5000 }).catch(() => {});
    await pagina.waitForTimeout(250);
}
const guardados = () => pagina.evaluate(() => window.__guardados ?? []);
/** El campo del enlace: el que NO es de solo lectura (el correo sí lo es). */
const campo = () => pagina.locator("input:not([readonly])").first();
const guardar = () => pagina.getByRole("button", { name: /Guardar/ }).first();
async function pegar(texto) {
    await campo().fill(texto);
}

if (ROTO) {
    test("ANTES: un enlace de un documento se GUARDABA, y la pantalla se quedaba en blanco sin campo", async () => {
        await pintar(null);
        await pegar(DOCUMENTO);
        await guardar().click();
        await pagina.waitForTimeout(400);
        assert.deepEqual((await guardados()).map((g) => g.url), [DOCUMENTO], "el documento llegó al servidor tal cual");
        assert.equal(await pagina.locator("input").count(), 0, "el campo desapareció: no hay forma de corregirlo");
        assert.equal(await pagina.locator("iframe").count(), 0, "y no hay ninguna hoja");
    });

    test("ANTES: no decía con qué correo compartir la hoja, y no había forma de quitarla", async () => {
        await pintar(null);
        const texto = await pagina.evaluate(() => document.body.innerText);
        assert.ok(!texto.includes("hojas@plataforma-ejemplo"), "ya enseñaba el correo de servicio");
        await pintar(LIMPIO);
        assert.equal(await pagina.getByRole("button", { name: /Quitar hoja/ }).count(), 0, "ya había «Quitar hoja»");
        await pagina.locator('button[title="Cambiar hoja de cálculo"]').click();
        await pagina.waitForTimeout(250);
        assert.equal(await pagina.getByRole("button", { name: /Quitar hoja/ }).count(), 0, "ya había «Quitar hoja» en la tarjeta");
    });

    test("ANTES: los mandos flotaban al 40 % encima de la hoja, y el de cambiar no tenía rótulo", async () => {
        await pintar(LIMPIO);
        // El puntero lejos: con él encima, `hover:opacity-100` los enciende.
        await pagina.mouse.move(2, 2);
        await pagina.waitForTimeout(200);
        const flotante = await pagina.evaluate(() => {
            const a = [...document.querySelectorAll("a")].find((x) => x.textContent.includes("Abrir"));
            const caja = a?.parentElement;
            return caja ? { opacidad: getComputedStyle(caja).opacity, posicion: getComputedStyle(caja).position } : null;
        });
        assert.ok(flotante, "no se encontraron los mandos");
        assert.equal(flotante.posicion, "absolute", "los mandos no flotaban");
        assert.equal(Number(flotante.opacidad), 0.4, "los mandos no estaban al 40 %");
        const cambiar = await pagina.locator('button[title="Cambiar hoja de cálculo"]').innerText();
        assert.equal(cambiar.trim(), "", "el de cambiar ya tenía rótulo");
    });

    test("ANTES: copiar sin permiso de portapapeles REVENTABA", async () => {
        await pintar(LIMPIO);
        await pagina.evaluate(() => {
            navigator.clipboard.writeText = () => Promise.reject(new Error("denegado"));
            window.__rechazos = [];
            window.addEventListener("unhandledrejection", (e) => window.__rechazos.push(String(e.reason)));
        });
        await pagina.getByText("Copiar link").click();
        await pagina.waitForTimeout(400);
        assert.ok((await pagina.evaluate(() => window.__rechazos.length)) > 0, "copiar sin permiso no reventaba");
    });
} else {
    test("sin hoja: la tarjeta de vincular, con sus dos pasos y el correo con el que compartir", async () => {
        await pintar(null);
        const texto = await pagina.evaluate(() => document.body.innerText);
        assert.ok(texto.includes("1. Comparte tu hoja con este correo como Editor"));
        assert.ok(texto.includes("2. Pega el enlace de tu hoja"));
        assert.equal(await pagina.locator("input[readonly]").inputValue(), await pagina.evaluate(() => window.CORREO));
        assert.equal(await pagina.locator("[data-sin-hoja]").count(), 1, "falta el aviso de que no hay hoja");
        assert.equal(await pagina.locator('[data-boton="quitar"]').count(), 0, "sin hoja no hay nada que quitar");
        assert.ok(await guardar().isDisabled(), "Guardar tiene que estar apagado con el campo vacío");
    });

    test("un enlace de un documento NO llega al servidor: se dice por qué, y el campo se queda", async () => {
        await pintar(null);
        await pegar(DOCUMENTO);
        await guardar().click();
        await pagina.waitForTimeout(300);
        assert.deepEqual(await guardados(), [], "el documento llegó al servidor");
        const motivo = await pagina.locator("[data-motivo]").innerText();
        assert.equal(
            motivo,
            "Ese enlace no es de una hoja de Google Sheets. Abre tu hoja y copia el enlace de la barra de direcciones.",
        );
        assert.equal(await campo().getAttribute("aria-invalid"), "true");
        // Escribir en el campo quita el aviso.
        await campo().press("End");
        await campo().type("x");
        await pagina.waitForTimeout(100);
        assert.equal(await pagina.locator("[data-motivo]").count(), 0, "el aviso no se va al escribir");
    });

    test("un enlace bueno llega LIMPIO, la tarjeta se cierra y la hoja se pinta con su pestaña", async () => {
        await pintar(null);
        await pegar(PEGADO);
        await guardar().click();
        await pagina.waitForSelector("iframe[data-hoja-incrustada]", { timeout: 5000 });
        assert.deepEqual((await guardados()).map((g) => g.url), [LIMPIO], "no llegó el enlace limpio");
        assert.equal(await pagina.locator("[data-tarjeta-de-vincular]").count(), 0, "la tarjeta sigue abierta");
        assert.equal(await pagina.locator("iframe").getAttribute("src"), INCRUSTADO);
        assert.equal(await pagina.getByRole("link", { name: /Abrir/ }).getAttribute("href"), LIMPIO);
    });

    test("la barra de la hoja: Abrir, Copiar link y Cambiar hoja, a la vista, con su nombre y en su orden", async () => {
        await pintar(LIMPIO);
        const mandos = await pagina.evaluate(() =>
            [...document.querySelectorAll("[data-barra-de-la-hoja] [data-boton]")].map((b) => ({
                boton: b.getAttribute("data-boton"),
                texto: b.innerText.trim(),
                opacidad: Number(getComputedStyle(b).opacity),
                x: b.getBoundingClientRect().left,
            })),
        );
        assert.deepEqual(mandos.map((m) => m.boton), ["abrir", "copiar-enlace", "cambiar"]);
        assert.deepEqual(mandos.map((m) => m.texto), ["Abrir", "Copiar link", "Cambiar hoja"]);
        for (const m of mandos) assert.equal(m.opacidad, 1, `${m.boton} está apagado`);
        assert.ok(mandos[0].x < mandos[1].x && mandos[1].x < mandos[2].x, "no van de izquierda a derecha");
        // Y la barra no tapa la hoja: va encima, no flotando sobre ella.
        const solape = await pagina.evaluate(() => {
            const b = document.querySelector("[data-barra-de-la-hoja]").getBoundingClientRect();
            const h = document.querySelector("iframe").getBoundingClientRect();
            return h.top - b.bottom;
        });
        assert.ok(solape >= -1, `la barra tapa ${-solape} px de la hoja`);
    });

    test("copiar sin permiso de portapapeles NO revienta: lo dice", async () => {
        await pintar(LIMPIO);
        await pagina.evaluate(() => {
            navigator.clipboard.writeText = () => Promise.reject(new Error("denegado"));
            window.__rechazos = [];
            window.addEventListener("unhandledrejection", (e) => window.__rechazos.push(String(e.reason)));
        });
        await pagina.locator('[data-boton="copiar-enlace"]').click();
        await pagina.getByText("No se pudo copiar").waitFor({ timeout: 4000 });
        assert.equal(await pagina.evaluate(() => window.__rechazos.length), 0);
        // Y con permiso, copia el enlace limpio.
        await pagina.evaluate(() => {
            navigator.clipboard.writeText = (t) => ((window.__copiado = t), Promise.resolve());
        });
        await pagina.locator('[data-boton="copiar-enlace"]').click();
        await pagina.getByText("Enlace copiado").waitFor({ timeout: 4000 });
        assert.equal(await pagina.evaluate(() => window.__copiado), LIMPIO);
    });

    test("cambiar de hoja: la tarjeta trae el enlace actual, la hoja sigue debajo, y Cancelar no toca nada", async () => {
        await pintar(LIMPIO);
        await pagina.locator('[data-boton="cambiar"]').click();
        await pagina.waitForSelector("[data-tarjeta-de-vincular]");
        assert.equal(await campo().inputValue(), LIMPIO);
        assert.equal(await pagina.locator("iframe").count(), 1, "la hoja se esconde mientras se decide");
        await pegar(`https://docs.google.com/spreadsheets/d/1pInventarioDeLaTienda2026HojaDeEjemplo1Guia/edit`);
        await pagina.locator('[data-boton="cancelar"]').click();
        await pagina.waitForTimeout(200);
        assert.equal(await pagina.locator("[data-tarjeta-de-vincular]").count(), 0, "Cancelar no cierra la tarjeta");
        assert.deepEqual(await guardados(), [], "Cancelar guardó algo");
        assert.equal(await pagina.locator("iframe").getAttribute("src"), INCRUSTADO, "la hoja cambió sin guardar");
    });

    test("QUITAR la hoja: pregunta antes, manda un vacío, y vuelve la pantalla del principio", async () => {
        await pintar(LIMPIO);
        await pagina.locator('[data-boton="cambiar"]').click();
        await pagina.locator('[data-boton="quitar"]').click();
        const dialogo = pagina.locator("[data-confirmar-quitar]");
        await dialogo.waitFor();
        assert.match(await dialogo.innerText(), /Tu hoja no se borra: sigue en tu Google Drive\./);
        assert.deepEqual(await guardados(), [], "se quitó sin preguntar");
        await pagina.locator('[data-boton="confirmar-quitar"]').click();
        await pagina.waitForSelector("[data-sin-hoja]", { timeout: 4000 });
        assert.deepEqual((await guardados()).map((g) => g.url), [""], "no se mandó «sin hoja»");
        assert.equal(await pagina.locator("iframe").count(), 0);
        assert.equal(await campo().inputValue(), "", "el campo no quedó vacío");
        assert.equal(await pagina.locator('[data-boton="quitar"]').count(), 0, "sin hoja sigue ofreciendo quitarla");
    });

    test("un enlace guardado que no sirve NO deja la pantalla en blanco: sale el campo con su motivo", async () => {
        await pintar(DOCUMENTO);
        assert.equal(await pagina.locator("[data-tarjeta-de-vincular]").count(), 1, "no se ve el campo para corregirlo");
        assert.equal(await campo().inputValue(), DOCUMENTO);
        assert.match(await pagina.locator("[data-motivo]").innerText(), /^El enlace guardado no sirve\. /);
    });

    test("el pie de la tarjeta: Cancelar a la izquierda, Guardar a la derecha, Quitar en medio", { skip: !CSS }, async () => {
        for (const ancho of [1280, 390]) {
            await pagina.setViewportSize({ width: ancho, height: 800 });
            await pintar(LIMPIO);
            await pagina.locator('[data-boton="cambiar"]').click();
            await pagina.waitForSelector("[data-tarjeta-de-vincular]");
            const m = await pagina.evaluate(() => {
                const t = document.querySelector("[data-tarjeta-de-vincular]").getBoundingClientRect();
                const r = (b) => document.querySelector(`[data-boton="${b}"]`).getBoundingClientRect();
                const c = r("cancelar");
                const q = r("quitar");
                const g = r("guardar");
                return {
                    izquierda: c.left - t.left,
                    derecha: t.right - g.right,
                    enMedio: c.right < q.left && q.right < g.left,
                    mismaFila: Math.abs(c.top - g.top) < 2 && Math.abs(q.top - g.top) < 2,
                    desborda: document.documentElement.scrollWidth > window.innerWidth,
                };
            });
            assert.ok(m.izquierda <= 17 && m.derecha <= 17, `${ancho}: los botones no van a los bordes (${m.izquierda}, ${m.derecha})`);
            assert.ok(m.enMedio && m.mismaFila, `${ancho}: «Quitar hoja» no va en medio: ${JSON.stringify(m)}`);
            assert.equal(m.desborda, false, `${ancho}: la pantalla se sale a lo ancho`);
        }
        await pagina.setViewportSize({ width: 1280, height: 800 });
    });

    test("ningún error de la página en todo el recorrido", () => {
        assert.deepEqual(todos, []);
    });
}
