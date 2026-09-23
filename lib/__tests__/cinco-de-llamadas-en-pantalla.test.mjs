/**
 * Los cinco asuntos de CRM › Llamadas: la PANTALLA, en Chromium y sobre el
 * CSS del build, con `CallsCrmClient` y `CallDetailDialog` de verdad.
 *
 * Lo único fingido son las acciones de servidor, con los mismos datos en los
 * dos modos (`fingido/llamadas-del-crm.ts`):
 *
 *   - c1: con resumen, transcripción, grabación y resultado propuesto por IA.
 *   - c2: sin resumen ni transcripción.
 *   - c3: la LISTA no trae su resumen, pero la base sí —se procesó después de
 *     cargar la lista—: es el «abre vacío aunque las tiene».
 *
 * `MODO=roto` monta la tabla y el diálogo de ANTES_REF y **afirma los
 * fallos**: Detalle con la síntesis del lead, el diálogo con su campo de
 * síntesis y sin lo que la base ya tenía, el reproductor sin duración hasta
 * pulsar play, y siete resultados.
 *
 * Se levanta con `scripts/banco-cinco-de-llamadas.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-cinco-de-llamadas.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : "";

// Los textos son los de `fingido/llamadas-del-crm.ts`: si se cambian allí, el
// test 1 se pone rojo y lo dice.
const PRIMERA_LINEA = "Pidió la cotización del plan anual para las tres sedes y quiere revisar precios con su socio antes de decidir";
const SINTESIS = "Lead de tres sedes, viene de la campaña de agosto y ya compró el plan básico en 2025";
const RESUMEN_FRESCO = "Julián confirmó que revisará la propuesta con su equipo";

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>` +
                    `<body style="margin:0"><div id="hueco" style="width:1160px"><div id="pantalla"></div></div>` +
                    `<script type="module" src="/harness.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        // La grabación no existe a propósito: el total tiene que salir sin ella.
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

let ctx = null;
async function pagina() {
    if (ctx) return ctx;
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate(() => window.pintarTabla());
    await page.waitForSelector('[title="Ver detalle de la llamada"]', { timeout: 20000 });
    assert.equal(reventones.join(" | "), "", "la pantalla reventó al pintarse");
    ctx = { page, navegador, server };
    return ctx;
}

/** La celda Detalle de la fila n (0, 1, 2). */
async function detalleDeLaFila(page, n) {
    return page.evaluate((i) => {
        const b = document.querySelectorAll('[title="Ver detalle de la llamada"]')[i];
        const span = b?.querySelector("span");
        return span
            ? { texto: span.textContent, recorta: span.scrollWidth > span.clientWidth, estilo: getComputedStyle(span).textOverflow }
            : null;
    }, n);
}

async function abrirElDetalle(page, n) {
    await page.locator('[title="Ver detalle de la llamada"]').nth(n).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    // Lo fresco llega de una promesa: se deja una vuelta.
    await page.waitForTimeout(300);
    return page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const audio = d?.querySelector("audio");
        return {
            texto: d?.innerText ?? "",
            hayCampoDeSintesis: !!d?.querySelector("textarea"),
            tiempo: d?.querySelector("[data-tiempo]")?.textContent ?? null,
            preload: audio?.getAttribute("preload") ?? null,
            audioDuracion: audio ? audio.duration : null,
            botonesDelPie: [...(d?.querySelectorAll("button") ?? [])].map((b) => b.textContent.trim()).filter(Boolean),
        };
    });
}

async function cerrarElDetalle(page) {
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 10000 });
}

const saltar = !chromium || !fs.existsSync(HARNESS) ? "sin Chromium o sin harness" : false;

test("1 · columna Detalle CON resumen: su primera línea, recortada con «…»", { skip: saltar }, async () => {
    const { page } = await pagina();
    const c1 = await detalleDeLaFila(page, 0);
    if (ROTO) {
        assert.equal(c1.texto, SINTESIS, "el roto no reproduce: Detalle ya no enseñaba la síntesis del lead");
        return;
    }
    assert.equal(c1.texto, PRIMERA_LINEA, "Detalle no enseña la primera línea del resumen");
    assert.notEqual(c1.texto, SINTESIS);
    assert.equal(c1.estilo, "ellipsis", "no recorta con puntos suspensivos");
    assert.equal(c1.recorta, true, "el texto largo tendría que ir recortado");
});

test("1 · columna Detalle SIN resumen: «Sin detalle»", { skip: saltar }, async () => {
    const { page } = await pagina();
    const c2 = await detalleDeLaFila(page, 1);
    assert.equal(c2.texto, "Sin detalle");
});

test("2 · el diálogo CON resumen y transcripción los trae COMPLETOS, y sin la síntesis del lead", { skip: saltar }, async () => {
    const { page } = await pagina();
    const d = await abrirElDetalle(page, 0);
    await cerrarElDetalle(page);
    if (ROTO) {
        // El campo solo se pinta si encuentra el lead; el bloque, siempre.
        assert.ok(d.texto.includes("Detalle del lead (síntesis)"), "el roto no reproduce: el diálogo ya no tenía la síntesis");
        return;
    }
    assert.equal(d.hayCampoDeSintesis, false, "el campo de la síntesis del lead sigue en el diálogo");
    assert.ok(!/s[ií]ntesis/i.test(d.texto), "el diálogo sigue hablando de la síntesis del lead");
    assert.ok(!d.texto.includes(SINTESIS));
    assert.ok(d.texto.includes("Resumen IA"));
    assert.ok(d.texto.includes(PRIMERA_LINEA), "falta la primera línea del resumen");
    assert.ok(d.texto.includes("Pidió que le llamen el jueves"), "el resumen no va completo");
    assert.ok(d.texto.includes("Transcripción"));
    assert.ok(d.texto.includes("Cliente: Llámame el jueves por la tarde."), "la transcripción no va completa");
    assert.deepEqual(d.botonesDelPie.filter((t) => t === "Guardar"), [], "sin síntesis no hay nada que guardar");
});

test("2 · el diálogo SIN resumen ni transcripción lo dice", { skip: saltar }, async () => {
    const { page } = await pagina();
    const d = await abrirElDetalle(page, 1);
    await cerrarElDetalle(page);
    if (ROTO) return; // antes no se pintaba nada: no hay texto que afirmar
    assert.ok(d.texto.includes("Sin resumen"), d.texto);
    assert.ok(d.texto.includes("Sin transcripción"), d.texto);
});

test("2 · lo que la base YA tiene sale aunque la lista se cargara antes", { skip: saltar }, async () => {
    const { page } = await pagina();
    const d = await abrirElDetalle(page, 2);
    await cerrarElDetalle(page);
    if (ROTO) {
        assert.ok(!d.texto.includes(RESUMEN_FRESCO), "el roto no reproduce: ya pedía el detalle fresco");
        return;
    }
    assert.ok(d.texto.includes(RESUMEN_FRESCO), "el diálogo abre sin el resumen que la base ya tiene");
    assert.ok(d.texto.includes("la reviso con mi equipo"), "…ni la transcripción");
    // Y la fila de la tabla se pone al día con lo que trajo el diálogo.
    const c3 = await detalleDeLaFila(page, 2);
    assert.equal(c3.texto, RESUMEN_FRESCO);
});

test("3 · el reproductor enseña la duración DESDE QUE ABRE, sin pulsar play", { skip: saltar }, async () => {
    const { page } = await pagina();
    const d = await abrirElDetalle(page, 0);
    await cerrarElDetalle(page);
    if (ROTO) {
        assert.equal(d.tiempo, null, "el roto no reproduce: ya había un total propio");
        assert.equal(d.preload, "none", "el <audio> de antes no bajaba ni los metadatos");
        assert.ok(!(d.audioDuracion > 0), "y el navegador no sabía la duración sin pulsar play");
        return;
    }
    // 187 s son los de la columna Duración (03:07).
    assert.equal(d.tiempo, "0:00 / 3:07", "el total no es el de la columna Duración");
    assert.equal(d.preload, "metadata");
});

test("5 · la pastilla dice qué propuso la IA, y la corrección a mano manda", { skip: saltar }, async () => {
    const { page } = await pagina();
    const pastilla = page.locator("[data-resultado]").first();
    if (ROTO) {
        assert.equal(await page.locator("[data-resultado]").count(), 0, "el roto no reproduce");
        // Y el desplegable de antes tenía siete, con Buzón y Número equivocado.
        await page.locator('button[title="Interesado"]').first().click();
        const opciones = await page.locator('[role="menuitem"]').allTextContents();
        await page.keyboard.press("Escape");
        assert.ok(opciones.includes("Buzón de voz"));
        assert.equal(opciones.length, 7);
        return;
    }
    assert.equal(await pastilla.getAttribute("data-resultado"), "interesado");
    assert.equal(await pastilla.getAttribute("data-resultado-ia"), "si", "no se ve que lo propuso la IA");
    assert.match((await pastilla.getAttribute("title")) ?? "", /propuesto por IA/);

    await pastilla.click();
    const opciones = await page.locator('[role="menuitem"]').allTextContents();
    assert.deepEqual(opciones, ["Interesado", "Link enviado", "Volver a llamar", "No contesta", "No interesado"]);

    await page.locator('[role="menuitem"]', { hasText: "Volver a llamar" }).click();
    await page.waitForFunction(
        () => document.querySelector("[data-resultado]")?.getAttribute("data-resultado") === "volver_llamar",
        null,
        { timeout: 5000 },
    );
    assert.equal(await pastilla.getAttribute("data-resultado-ia"), "no", "tras cambiarlo a mano sigue diciendo IA");
    assert.equal((await pastilla.textContent())?.includes("Volver a llamar"), true);
});

test("5 · lo que no se ha clasificado sigue diciendo «Marcar resultado»", { skip: saltar }, async () => {
    const { page } = await pagina();
    const texto = await page.locator('[title="Marcar resultado"]').first().textContent();
    assert.ok(texto?.includes("Marcar resultado"));
});

test("Z · se cierra el navegador", { skip: saltar }, async () => {
    if (!ctx) return;
    await ctx.navegador.close();
    ctx.server.close();
});
