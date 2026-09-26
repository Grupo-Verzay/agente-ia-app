/**
 * El TEXTO DEL POST en la pantalla de AI imágenes.
 *
 * La pantalla generaba la imagen del producto y nada más: el post había que
 * escribirlo a mano. Lo que aquí se ejerce es la función entera, con el
 * `AdGeneratorStudio` de VERDAD: se sube un producto, se pulsa «Generar
 * imagen», y el texto tiene que aparecer **junto a la vista previa**, adaptado
 * a la red que se elige ahí, editable, copiable y con su botón de volver a
 * generar.
 *
 * Va en navegador y no en un barrido porque la pregunta que importa —«¿el
 * texto que se ve es el de la imagen que se ve?»— depende de que la llave del
 * copy y la de la imagen sean la MISMA, y eso solo se ve con las dos pintadas
 * una al lado de la otra. Un barrido leería dos funciones correctas.
 *
 * `MODO=roto` monta el estudio de antes y AFIRMA el fallo: hay vista previa y
 * no hay ningún texto.
 *
 * Se levanta con `scripts/banco-copy-en-la-pantalla.sh`.
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
    // Sin navegador no se finge: se dice y se salta.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-copy-pantalla.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;

const ANCHURAS = [1440, 1280, 1024, 390];

/** El PNG de un píxel que se «sube» como producto. */
const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""} *{animation:none!important;transition:none!important}` +
                    `html,body{margin:0;height:100%}` +
                    `#pantalla{display:flex;flex-direction:column;height:100vh;width:100%}</style></head>` +
                    `<body><div id="pantalla"></div>` +
                    // `next/image` y `next/link` leen `process.env.__NEXT_*`. En
                    // la App lo inyecta Next; aquí no hay nada que lo ponga y el
                    // módulo revienta al cargarse, así que `window.listo` no
                    // llega nunca y lo único que se ve es un plazo agotado.
                    `<script>window.process={env:{}}</script>` +
                    `<script type="module" src="/harness.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--disable-background-networking", "--no-sandbox"],
    });
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    // Todo lo que no sea el arnés se corta: sin esto Chromium se queda
    // esperando a hosts de Google que la salida de este equipo deniega, y el
    // banco muere por un plazo agotado que no se parece a su causa.
    await contexto.route("**", (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
    const page = await contexto.newPage();
    // Lo que no llega a pintarse mide cero y hace pasar cualquier comprobación.
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(base + "/", { waitUntil: "load" });
    try {
        await page.waitForFunction("window.listo === true", { timeout: 20000 });
        await page.evaluate(() => window.pintar());
        await page.waitForSelector('input[type="file"]', { timeout: 20000, state: "attached" });
    } catch (e) {
        throw new Error(`${e.message}\nla pantalla reventó: ${reventones.join(" | ") || "(sin errores de página)"}`);
    }
    assert.equal(reventones.join(" | "), "", `la pantalla reventó (MODO=${ROTO ? "roto" : "bueno"})`);
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/** Sube un producto y genera: el camino de verdad de la pantalla. */
async function generar(page) {
    await page.setInputFiles('input[type="file"]', {
        name: "producto.png", mimeType: "image/png", buffer: PIXEL,
    });
    // El botón de generar solo existe en el ÚLTIMO paso, así que se recorre el
    // asistente como lo recorre una persona. Y con «Siguiente», no por el
    // rótulo del paso: los de la barra van `hidden sm:block`, o sea que a 390
    // no hay texto que pulsar.
    for (let i = 0; i < 3; i++) {
        await page.click('button:has-text("Siguiente"):not([disabled])');
    }
    await page.waitForSelector('button:has-text("Generar imagen")', { timeout: 20000 });
    await page.click('button:has-text("Generar imagen")');
    // Tres formatos con 1,5 s de espera cada uno, más las vueltas del copy.
    await page.waitForSelector('img[alt="Resultado generado"]', { timeout: 40000 });
    // El botón vuelve a habilitarse cuando la tanda ENTERA terminó: mientras
    // siga deshabilitado el copy de la última vista todavía está en camino, y
    // medir ahí sería medir una pantalla a medio llenar.
    await page.waitForSelector('button:has-text("Generar imagen"):not([disabled])', { timeout: 60000 });
}

const elTexto = (page) =>
    page.$eval('[data-campo="copy-del-anuncio"]', (el) => el.value).catch(() => null);

function faltaNavegador(t) {
    if (!chromium) { t.skip("sin playwright en este equipo"); return true; }
    if (!CSS) { t.skip("sin el CSS del build: corre `npm run build` antes"); return true; }
    return false;
}

test("hay vista previa y, junto a ella, el texto del post", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        await generar(page);

        const hayImagen = await page.$('img[alt="Resultado generado"]');
        assert.ok(hayImagen, "no se generó la vista previa");

        const texto = await elTexto(page);

        if (ROTO) {
            // El fallo que esto viene a cerrar: imagen sí, texto no.
            assert.equal(texto, null, "el «antes» ya tenía panel de texto: revisa ANTES_REF");
            return;
        }

        assert.ok(texto && texto.length > 0, "la imagen se generó y el texto no");
        assert.ok(texto.includes("instagram"), texto);

        // JUNTO a la previa: el mismo contenedor, y debajo de ella.
        const cajas = await page.evaluate(() => {
            const campo = document.querySelector('[data-campo="copy-del-anuncio"]');
            const img = document.querySelector('img[alt="Resultado generado"]');
            // La tarjeta del texto se busca por su marca y no por una clase:
            // el recuadro de la imagen lleva el MISMO redondeo que la tarjeta,
            // así que un `closest` por clase se quedaría con él y la
            // comparación no diría nada.
            const panel = campo.closest('[data-panel="copy-del-anuncio"]');
            return {
                // «Junto a» es esto: la columna que contiene el texto contiene
                // también la imagen de la previa.
                mismaColumna: Boolean(panel?.parentElement?.contains(img)),
                copyDebajo: campo.getBoundingClientRect().top > img.getBoundingClientRect().top,
            };
        });
        assert.equal(cajas.mismaColumna, true, "el texto no está en la columna de la vista previa");
        assert.equal(cajas.copyDebajo, true);
    } finally {
        await cerrar();
    }
});

test("el texto sigue a la red que se elige en la vista previa", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) { t.skip("en el «antes» no hay texto que seguir a ninguna red"); return; }
    const { page, cerrar } = await abrir(1440);
    try {
        await generar(page);
        assert.match(await elTexto(page), /instagram/);
        assert.match(await page.textContent("body"), /Adaptado a Post Instagram/);

        await page.click('[data-formato="9:16"]');
        await page.waitForFunction(
            () => document.querySelector('[data-campo="copy-del-anuncio"]')?.value.includes("whatsapp"),
            { timeout: 10000 },
        );
        assert.match(await page.textContent("body"), /Adaptado a Story \/ WhatsApp/);

        await page.click('[data-formato="16:9"]');
        await page.waitForFunction(
            () => document.querySelector('[data-campo="copy-del-anuncio"]')?.value.includes("facebook"),
            { timeout: 10000 },
        );
        assert.match(await page.textContent("body"), /Adaptado a Post Facebook/);
    } finally {
        await cerrar();
    }
});

test("lo editado a mano se conserva al cambiar de red y volver", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) { t.skip("en el «antes» no hay texto que editar"); return; }
    const { page, cerrar } = await abrir(1440);
    try {
        await generar(page);
        await page.fill('[data-campo="copy-del-anuncio"]', "Mi texto escrito a mano");

        await page.click('[data-formato="9:16"]');
        await page.waitForFunction(
            () => document.querySelector('[data-campo="copy-del-anuncio"]')?.value.includes("whatsapp"),
            { timeout: 10000 },
        );

        await page.click('[data-formato="1:1"]');
        await page.waitForFunction(
            () => document.querySelector('[data-campo="copy-del-anuncio"]')?.value === "Mi texto escrito a mano",
            { timeout: 10000 },
        );
        // La edición vive en SU vista: si no, volver la perdería y el trabajo
        // de escribirla se tiraría sin decir nada.
        assert.equal(await elTexto(page), "Mi texto escrito a mano");
    } finally {
        await cerrar();
    }
});

test("volver a generar cambia el texto, y copiar deja el portapapeles puesto", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) { t.skip("en el «antes» no hay botones que pulsar"); return; }
    const { page, cerrar } = await abrir(1440);
    try {
        await generar(page);
        const antes = await elTexto(page);

        await page.click('[data-boton="regenerar-copy"]');
        await page.waitForFunction(
            (previo) => document.querySelector('[data-campo="copy-del-anuncio"]')?.value !== previo,
            antes, { timeout: 15000 },
        );
        const despues = await elTexto(page);
        assert.notEqual(despues, antes);
        assert.match(despues, /instagram/, "volver a generar cambió de red");

        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.click('[data-boton="copiar-copy"]');
        const portapapeles = await page.evaluate(() => navigator.clipboard.readText());
        assert.equal(portapapeles, despues);
    } finally {
        await cerrar();
    }
});

test("la previa no se queda sin sitio, y nada desborda a lo ancho", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) { t.skip("el «antes» no tiene el panel cuyo alto se mide"); return; }
    for (const ancho of ANCHURAS) {
        const { page, cerrar } = await abrir(ancho);
        try {
            await generar(page);
            const m = await page.evaluate(() => {
                const img = document.querySelector('img[alt="Resultado generado"]');
                const campo = document.querySelector('[data-campo="copy-del-anuncio"]');
                const ri = img.getBoundingClientRect();
                const rc = campo.getBoundingClientRect();
                return {
                    altoImagen: Math.round(ri.height),
                    anchoImagen: Math.round(ri.width),
                    altoCampo: Math.round(rc.height),
                    desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                };
            });
            // La previa cede el alto, pero no hasta desaparecer: con la imagen
            // en cero el panel del texto se habría comido la columna entera.
            assert.ok(m.altoImagen >= 120, `a ${ancho} la vista previa se quedó en ${m.altoImagen}px de alto`);
            assert.ok(m.anchoImagen > 0, `a ${ancho} la vista previa no tiene ancho`);
            assert.ok(m.altoCampo >= 100, `a ${ancho} el campo del texto mide ${m.altoCampo}px`);
            assert.equal(m.desborda, false, `a ${ancho} la página se desplaza a lo ancho`);
        } finally {
            await cerrar();
        }
    }
});
