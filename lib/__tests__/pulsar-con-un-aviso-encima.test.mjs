/**
 * El vídeo de una guía pulsa con el RATÓN (`pulsar`, del taller común), y los
 * avisos de la App salen abajo a la derecha. Lo que viva ahí —el Guardar de la
 * última tarjeta de una pantalla, pegada al borde de abajo porque no queda más
 * página que desplazar— queda DEBAJO de un aviso durante sus 4 s, y no solo
 * de lo que se ve: cada aviso lleva encima una franja invisible de 15 px
 * (`[data-sonner-toast]::after`).
 *
 * Es lo que dejaba a medias el vídeo de Mis formularios: el clic del Guardar
 * del enlace corto se lo llevaba el aviso «WhatsApp guardado», el enlace no se
 * guardaba, y como el cursor se quedaba ENCIMA del aviso, sonner no lo quitaba
 * nunca (no quita un aviso con el puntero sobre él).
 *
 * Esto se prueba en Chromium con el `Toaster` de VERDAD de la App
 * (`@/components/ui/sonner`), porque las dos cosas que deciden el fallo —qué
 * recibe el clic en un punto y que el aviso se pare con el cursor encima— no se
 * ven leyendo el código.
 *
 * Con `MODO=roto` se usa el `pulsar` del taller de `ANTES_TALLER_REF` —pinchado
 * a un commit, nunca `origin/main`— y se AFIRMA el fallo: el clic no llega al
 * botón, el cursor se queda encima del aviso y el aviso no se va.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_TALLER_REF ?? "ab6b110";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "pulsar-con-un-aviso", "harness.js");

/**
 * El taller de antes, sacado de git con sus tres vecinos (lo único que importa
 * por ruta relativa). Así el modo roto corre el `pulsar` que había, no uno
 * que alguien recuerde.
 */
function elTallerDeAntes() {
    const dir = join(AQUI, ".compilado", "taller-de-antes");
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ["taller-de-la-guia", "encuadre-de-la-miniatura", "voz-de-la-guia", "voz-cedar"]) {
        fs.writeFileSync(join(dir, `${f}.mjs`), execFileSync("git", ["show", `${ANTES}:scripts/${f}.mjs`], { cwd: RAIZ }));
    }
    return join(dir, "taller-de-la-guia.mjs");
}
const TALLER = ROTO ? elTallerDeAntes() : join(RAIZ, "scripts", "taller-de-la-guia.mjs");
const taller = await import(pathToFileURL(TALLER).href);
const { pulsar } = taller;

const VISTA = { width: 960, height: 600 }; // la del vídeo
let servidor, navegador, ctx, p;
const errores = [];

test.before(async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script>
// Cuántas veces el RATÓN pasó por encima de un aviso: con el cursor ahí, sonner
// no lo quita. Se mira en cada movimiento, que es lo que ve sonner.
window.encimaDelAviso = 0;
document.addEventListener("mousemove", (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.closest("[data-sonner-toaster]") && document.querySelector("[data-sonner-toast]")) window.encimaDelAviso++;
}, true);
</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    servidor = http
        .createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        })
        .listen(0);
    await new Promise((r) => servidor.once("listening", r));
    navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
    ctx = await navegador.newContext({ viewport: VISTA });
});

test.after(async () => {
    await navegador?.close();
    servidor?.close();
});

/** Una página nueva por caso: un aviso de un caso no puede quedarse en el siguiente. */
test.beforeEach(async () => {
    await p?.close();
    p = await ctx.newPage();
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${servidor.address().port}/`);
    await p.waitForFunction(() => window.listo === true, null, { timeout: 20000 }).catch(() => {
        throw new Error("la maqueta no llegó a cargar: " + errores.join(" | "));
    });
    await p.mouse.move(5, 5);
});

const boton = () => p.locator("[data-boton-guardar]");
const cuantosAvisos = () => p.locator("[data-sonner-toast]").count();

/** Saca un aviso y espera a que esté quieto en su sitio (la entrada se anima). */
async function avisar(texto = "WhatsApp guardado") {
    await p.evaluate((t) => window.avisar(t), texto);
    const aviso = p.locator('[data-sonner-toast][data-mounted="true"]').last();
    await aviso.waitFor({ state: "visible", timeout: 5000 });
    await p.waitForTimeout(600);
    return aviso.boundingBox();
}

/** Qué recibe un clic en ese punto: lo único que sabe si el botón está debajo de otra cosa. */
const loQueHayEn = (x, y) =>
    p.evaluate(
        ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return { enAviso: !!el?.closest("[data-sonner-toaster]"), esBoton: !!el?.closest("[data-boton-guardar]") };
        },
        { x, y },
    );

/* ------------------------------------------------------------------ */
/* Lo que la maqueta tiene que reproducir: si esto cambia, el caso no  */
/* se está ejerciendo                                                  */
/* ------------------------------------------------------------------ */

test("la App saca los avisos abajo a la derecha, y la maqueta también", async () => {
    const layout = fs.readFileSync(join(RAIZ, "app", "layout.tsx"), "utf8");
    assert.match(layout, /<Toaster\s+position="bottom-right"/, "app/layout.tsx ya no saca los avisos abajo a la derecha: este banco mide otra pantalla");
    const b = await avisar();
    assert.ok(b.x + b.width > VISTA.width - 60 && b.y + b.height > VISTA.height - 60, `el aviso salió en ${JSON.stringify(b)}`);
});

test("un botón DEBAJO del aviso: el clic se lo lleva el aviso", async () => {
    const b = await avisar();
    await p.evaluate(({ x, y }) => window.colocar(x, y), { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    assert.deepEqual(await loQueHayEn(b.x + b.width / 2, b.y + b.height / 2), { enAviso: true, esBoton: false });
});

test("y justo ENCIMA del aviso también: su franja invisible tapa 15 px", async () => {
    const b = await avisar();
    const x = b.x + b.width / 2;
    await p.evaluate(({ x, y }) => window.colocar(x, y), { x, y: b.y - 7 });
    assert.deepEqual(await loQueHayEn(x, b.y - 7), { enAviso: true, esBoton: false }, "7 px por encima del aviso ya no lo tapa: ¿cambió sonner?");
    // Y la franja se acaba: más arriba el botón vuelve a ser el botón.
    await p.evaluate(({ x, y }) => window.colocar(x, y), { x, y: b.y - 40 });
    assert.deepEqual(await loQueHayEn(x, b.y - 40), { enAviso: false, esBoton: true });
});

/* ------------------------------------------------------------------ */
/* Lo que hace `pulsar`                                                */
/* ------------------------------------------------------------------ */

/** Pone el botón en `donde` respecto al aviso, pulsa, y cuenta lo que pasó. */
async function pulsarConElAviso(donde) {
    const b = await avisar();
    const y = donde === "debajo" ? b.y + b.height / 2 : b.y - 7;
    await p.evaluate(({ x, y }) => window.colocar(x, y), { x: b.x + b.width / 2, y });
    const desde = Date.now();
    await pulsar(p, boton());
    return { tardoMs: Date.now() - desde, pulsados: await p.evaluate(() => window.pulsados), encima: await p.evaluate(() => window.encimaDelAviso) };
}

for (const donde of ["debajo", "encima"]) {
    const dice = donde === "debajo" ? "debajo del aviso" : "en la franja invisible de encima";
    if (!ROTO) {
        test(`un botón ${dice}: pulsar espera a que el aviso se vaya y el clic LLEGA`, async () => {
            const r = await pulsarConElAviso(donde);
            assert.deepEqual(r.pulsados, ["guardar"], "el clic no llegó al botón");
            assert.equal(await cuantosAvisos(), 0, "pulsó con el aviso todavía ahí");
            // Lo que se espera es lo que le quedaba al aviso (4 s desde que salió),
            // no más: si tardara más, el cursor lo habría parado.
            assert.ok(r.tardoMs < 6000, `tardó ${r.tardoMs} ms: el aviso no se fue a su hora`);
            assert.equal(r.encima, 0, "el cursor pasó por encima del aviso (y con él ahí, sonner no lo quita)");
        });
    } else {
        test(`ANTES, un botón ${dice}: el clic se lo llevaba el aviso, y el aviso no se iba`, async () => {
            const r = await pulsarConElAviso(donde);
            assert.deepEqual(r.pulsados, [], "con el pulsar de antes el clic sí llegaba: el modo roto no reproduce nada");
            assert.ok(r.encima > 0, "el cursor de antes no se quedaba encima del aviso");
            // Pasados de sobra sus 4 s, el aviso sigue: el cursor lo tiene parado.
            await p.waitForTimeout(5000);
            assert.ok((await cuantosAvisos()) > 0, "el aviso se fue aunque el cursor estaba encima");
        });
    }
}

test("sin ningún aviso, pulsar no espera nada", async () => {
    await p.evaluate(() => window.colocar(480, 300));
    const desde = Date.now();
    await pulsar(p, boton());
    assert.deepEqual(await p.evaluate(() => window.pulsados), ["guardar"]);
    assert.ok(Date.now() - desde < 1500, `tardó ${Date.now() - desde} ms sin nada que esperar`);
});

test("un aviso LEJOS del botón no hace esperar", async () => {
    await avisar();
    await p.evaluate(() => window.colocar(200, 200));
    const desde = Date.now();
    await pulsar(p, boton());
    assert.deepEqual(await p.evaluate(() => window.pulsados), ["guardar"]);
    assert.ok(Date.now() - desde < 1500, `tardó ${Date.now() - desde} ms por un aviso que no tapaba nada`);
});

if (!ROTO) {
    test("un aviso que NO se va lo dice, en vez de dejar el vídeo mudo para siempre", async () => {
        await p.evaluate(() => window.avisarParaSiempre("Esto no se va"));
        const aviso = p.locator('[data-sonner-toast][data-mounted="true"]').last();
        await aviso.waitFor({ state: "visible", timeout: 5000 });
        await p.waitForTimeout(600);
        const b = await aviso.boundingBox();
        await p.evaluate(({ x, y }) => window.colocar(x, y), { x: b.x + b.width / 2, y: b.y + b.height / 2 });
        const desde = Date.now();
        await assert.rejects(pulsar(p, boton()), /un aviso sigue tapando/);
        const tardo = Date.now() - desde;
        assert.ok(tardo >= taller.ESPERA_POR_UN_AVISO_MS && tardo < taller.ESPERA_POR_UN_AVISO_MS + 3000, `se rindió a los ${tardo} ms`);
        assert.deepEqual(await p.evaluate(() => window.pulsados), [], "pulsó con el aviso encima");
    });

    test("el vídeo de Mis formularios pulsa el Guardar del enlace corto con `pulsar`", () => {
        const receta = fs.readFileSync(join(RAIZ, "scripts", "capturar-guia-formularios.mjs"), "utf8");
        assert.match(receta, /const guardarUrl = url\.getByRole\("button", \{ name: "Guardar" \}\);[\s\S]{0,200}await pulsar\(p, guardarUrl\);/);
        const tallerHoy = fs.readFileSync(join(RAIZ, "scripts", "taller-de-la-guia.mjs"), "utf8");
        const cuerpo = tallerHoy.slice(tallerHoy.indexOf("export async function pulsar("));
        assert.match(cuerpo.slice(0, 200), /await sinAvisoEncima\(p, locator\);/, "pulsar ya no mira si un aviso tapa lo que pulsa");
    });
}
