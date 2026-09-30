/**
 * Los tres controles, con los componentes REALES en Chromium.
 *
 * Aquí se contestan las dos preguntas que no se contestan leyendo el código:
 *
 *   1. **¿Se ALCANZA el menú del recuadro?** Que exista no basta: la cabecera
 *      y la barra de mandos de la reunión flotan `absolute z-20` **encima** de
 *      los recuadros, así que un mando puede estar perfectamente pintado y
 *      debajo de otra cosa. Se pregunta con `elementFromPoint`, que es lo
 *      único que sabe qué hay de verdad en ese punto.
 *   2. **¿Suena, se repite y para?** El sonido son tres cosas encadenadas —un
 *      `AudioContext`, un reloj y una decisión— y ninguna de las tres se ve en
 *      el código. Se espía `createOscillator`, que es lo que de verdad hace
 *      ruido.
 *
 * Se monta con `scripts/banco-controles-de-la-reunion.sh`.
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

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-controles-reunion.js");

/** El CSS del build: medir con otra hoja es medir una pantalla que nadie ve. */
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

function falta(t) {
    if (!chromium) {
        t.skip("sin playwright no se mide; se dice en vez de fingir");
        return true;
    }
    if (!fs.existsSync(HARNESS)) {
        t.skip("falta el arnés: corre scripts/banco-controles-de-la-reunion.sh");
        return true;
    }
    if (!CSS) {
        t.skip("falta el CSS del build (.next/static/css): corre 'npm run build'");
        return true;
    }
    return false;
}

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">` +
                    `<style>${CSS}</style>` +
                    // Las animaciones de Radix MUEVEN y encogen el menú mientras
                    // juegan: medido a media animación, se cantan fallos que no
                    // existen.
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `</head><body><div id="app"></div><div id="aviso"></div>` +
                    `<script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function conLaPagina(fn, viewport = { width: 1440, height: 900 }) {
    const server = await levantar();
    const { port } = server.address();
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--no-sandbox"],
    });
    try {
        const page = await navegador.newPage({ viewport });
        // Un fallo al pintar deja la página vacía, y una página vacía pasa
        // cualquier comprobación de «no desborda». Se cae con su motivo.
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction("window.pintar && window.avisar");
        const r = await fn(page);
        assert.deepEqual(errores, [], "la página no puede reventar al pintar");
        return r;
    } finally {
        await navegador.close();
        server.close();
    }
}

// ── 1. El menú del recuadro: que esté, y que SE ALCANCE ─────────────────────

const ANCHURAS = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
];

for (const distribucion of ["cuadricula", "orador"]) {
    for (const cuantos of [2, 3, 4]) {
        test(`el menú se ALCANZA sobre cada persona · ${distribucion} · ${cuantos}`, async (t) => {
            if (falta(t)) return;
            for (const viewport of ANCHURAS) {
                await conLaPagina(async (page) => {
                    await page.evaluate(
                        ([c, d]) => window.pintar(c, d, true),
                        [cuantos, distribucion],
                    );
                    await page.waitForTimeout(80);

                    const disparadores = page.locator('[aria-label^="Moderar a"]');
                    assert.equal(
                        await disparadores.count(),
                        cuantos - 1,
                        `uno por persona ajena (${viewport.width})`,
                    );

                    // Lo que de verdad importa: que en el punto del botón esté
                    // el botón, y no la cabecera ni la barra de mandos.
                    for (let i = 0; i < cuantos - 1; i += 1) {
                        const alcanzable = await disparadores.nth(i).evaluate((el) => {
                            const r = el.getBoundingClientRect();
                            if (r.width === 0 || r.height === 0) return "invisible";
                            const encima = document.elementFromPoint(
                                r.left + r.width / 2,
                                r.top + r.height / 2,
                            );
                            return el.contains(encima) || encima === el
                                ? "ok"
                                : `tapado por ${encima?.tagName}.${encima?.className ?? ""}`;
                        });
                        assert.equal(
                            alcanzable,
                            "ok",
                            `${distribucion}/${cuantos} a ${viewport.width}: el mando ${i}`,
                        );
                    }
                }, viewport);
            }
        });
    }
}

/** Qué mandos de la cabecera pisa algún «⋯», con los rectángulos de verdad. */
async function losMandosQuePisaElMenu(page) {
    return page.evaluate(() => {
        const cruzan = (a, b) =>
            a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        const mandos = [...document.querySelectorAll("[data-mando-de-la-cabecera]")]
            .map((el) => ({ m: el.getAttribute("data-mando-de-la-cabecera"), r: el.getBoundingClientRect() }))
            .filter((x) => x.r.width > 0);
        const pisados = [];
        for (const menu of document.querySelectorAll('[aria-label^="Moderar a"]')) {
            const r = menu.getBoundingClientRect();
            if (!r.width) continue;
            for (const x of mandos) if (cruzan(r, x.r)) pisados.push(`${menu.getAttribute("aria-label")} → ${x.m}`);
        }
        return { pisados, mandos: mandos.length };
    });
}

for (const distribucion of ["cuadricula", "orador"]) {
    test(`ningún «⋯» cae ENCIMA de un mando de la cabecera · ${distribucion}`, async (t) => {
        // Ganarle a las barras con `z-30` tiene su reverso: en el recuadro que
        // toca arriba, el «⋯» tapaba un mando de la cabecera —en la vista de
        // orador, el del chat—. `laAlturaDelMenuDelRecuadro` lo baja ahí.
        if (falta(t)) return;
        for (const cuantos of [2, 3, 4]) {
            for (const viewport of ANCHURAS) {
                await conLaPagina(async (page) => {
                    await page.evaluate(([c, d]) => window.pintar(c, d, true), [cuantos, distribucion]);
                    await page.waitForTimeout(80);
                    const { pisados, mandos } = await losMandosQuePisaElMenu(page);
                    assert.equal(mandos, 7, "la cabecera de la maqueta lleva sus siete mandos");
                    assert.deepEqual(pisados, [], `${distribucion}/${cuantos} a ${viewport.width}`);
                }, viewport);
            }
        }
    });
}

test("con el «⋯» en la esquina de siempre SÍ tapaba el chat (el banco lo ve)", async (t) => {
    // Sin esto no se sabría si lo verde de arriba es el arreglo o que la
    // maqueta no pone nada debajo. Se devuelve el «⋯» a `top-1` y se afirma
    // el fallo que se vio en la reunión de verdad.
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(() => window.pintar(3, "orador", true));
        await page.addStyleTag({ content: '[aria-label^="Moderar a"]{top:0.25rem !important}' });
        await page.waitForTimeout(80);
        const { pisados } = await losMandosQuePisaElMenu(page);
        assert.ok(pisados.length > 0, "en la esquina de siempre tiene que pisar algún mando");
    });
});

test("sobre UNO MISMO no hay menú: sacarse a uno mismo es colgar", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(() => window.pintar(3, "cuadricula", true));
        await page.waitForTimeout(80);
        const sobreMi = await page.locator('[aria-label="Moderar a Tú (tú)"]').count();
        assert.equal(sobreMi, 0);
    });
});

test("quien NO organiza no ve ningún menú", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(() => window.pintar(4, "cuadricula", false));
        await page.waitForTimeout(80);
        assert.equal(await page.locator('[aria-label^="Moderar a"]').count(), 0);
    });
});

test("el menú ofrece las DOS cosas, y pulsarlas pide lo que dicen", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(() => window.pintar(2, "cuadricula", true));
        await page.waitForTimeout(80);
        await page.locator('[aria-label="Moderar a Ana"]').click();
        await page.waitForTimeout(120);

        const opciones = await page.locator('[role="menuitem"]').allInnerTexts();
        assert.equal(opciones.length, 2, "dos y ninguna más");
        assert.match(opciones.join(" | "), /silencie/i);
        assert.match(opciones.join(" | "), /Sacar de la reunión/i);

        await page.locator('[role="menuitem"]', { hasText: "Sacar" }).click();
        await page.waitForTimeout(120);
        assert.deepEqual(await page.evaluate(() => window.pedido), [
            { que: "sacar", id: "Ana" },
        ]);
    });
});

test("y el menú abierto CABE en la pantalla, también en un móvil", async (t) => {
    if (falta(t)) return;
    for (const viewport of ANCHURAS) {
        await conLaPagina(async (page) => {
            await page.evaluate(() => window.pintar(4, "cuadricula", true));
            await page.waitForTimeout(80);
            await page.locator('[aria-label^="Moderar a"]').first().click();
            await page.waitForTimeout(150);
            const caja = await page.locator('[role="menu"]').boundingBox();
            assert.ok(caja, `hay menú a ${viewport.width}`);
            assert.ok(caja.x >= 0, `no se sale por la izquierda (${viewport.width})`);
            assert.ok(
                caja.x + caja.width <= viewport.width + 1,
                `ni por la derecha (${viewport.width})`,
            );
            assert.ok(
                caja.y + caja.height <= viewport.height + 1,
                `ni por abajo (${viewport.width})`,
            );
        }, viewport);
    }
});

/**
 * Si la primera opción del menú abierto es lo que hay en su punto.
 *
 * Un menú de Radix abierto pone `pointer-events: none` en el resto de la
 * página, y `elementFromPoint` se SALTA lo que no recibe el puntero: sin
 * devolverlos, la capa de la reunión no contaría y un menú tapado saldría
 * «visible». Se devuelven antes de preguntar.
 */
async function laOpcionSeVe(page) {
    await page.addStyleTag({ content: "*{pointer-events:auto !important}" });
    return page.evaluate(() => {
        const op = document.querySelector('[role="menuitem"]');
        if (!op) return "no hay menú";
        const r = op.getBoundingClientRect();
        const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return op.contains(encima) ? "ok" : `tapada por ${encima?.tagName}.${encima?.getAttribute?.("data-capa-de-la-reunion") !== null ? "[capa de la reunión]" : encima?.className ?? ""}`;
    });
}

test("con la reunión ENCIMA de la plataforma, el menú «⋯» se VE", async (t) => {
    // La reunión es una capa `z-[99]`; un menú portado al `body` nace en
    // `z-50`. Lo cazó la guía de Reuniones, que la abre dentro de la
    // plataforma: el «⋯» se pulsaba y no salía nada a la vista.
    if (falta(t)) return;
    for (const viewport of ANCHURAS) {
        await conLaPagina(async (page) => {
            await page.evaluate(() => window.pintar(3, "cuadricula", true, "portada"));
            await page.waitForTimeout(80);
            await page.locator('[aria-label^="Moderar a"]').first().click();
            await page.waitForTimeout(150);
            assert.equal(await laOpcionSeVe(page), "ok", `a ${viewport.width}`);
        }, viewport);
    }
});

test("portado al body —como estaba— el menú se abría DETRÁS (el banco lo ve)", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(() => window.pintar(3, "cuadricula", true, "suelta"));
        await page.waitForTimeout(80);
        await page.locator('[aria-label^="Moderar a"]').first().click();
        await page.waitForTimeout(150);
        assert.match(await laOpcionSeVe(page), /tapada/, "sin la raíz de la sala, el menú queda debajo");
    });
});

// ── 2. El sonido: que suene, se repita y pare ───────────────────────────────

/** Espía `AudioContext` y cuenta osciladores: es lo que de verdad hace ruido. */
const ESPIAR = () => {
    window.__sonidos = 0;
    class Falso {
        state = "running";
        currentTime = 0;
        resume() {}
        createGain() {
            return {
                connect() {},
                gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            };
        }
        createOscillator() {
            window.__sonidos += 1;
            return {
                type: "sine",
                connect() {},
                frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                start() {},
                stop() {},
            };
        }
    }
    window.AudioContext = Falso;
    window.webkitAudioContext = Falso;
};

/** Golpes de UN aviso: dos osciladores es un aviso, no dos. */
const PorAviso = 2;

test("suena en cuanto alguien llama a la puerta", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(ESPIAR);
        await page.evaluate(() => window.avisar(["ana"], true, false, []));
        await page.waitForTimeout(300);
        assert.equal(
            await page.evaluate(() => window.__sonidos),
            PorAviso,
            "los dos golpes, una sola vez",
        );
    });
});

test("se REPITE mientras siga esperando", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(ESPIAR);
        await page.evaluate(() => window.avisar(["ana"], true, false, []));
        await page.waitForTimeout(300);
        const primero = await page.evaluate(() => window.__sonidos);

        // El intervalo se lee DEL MÓDULO, no se escribe aquí: copiado, este
        // banco probaría que coincide con su propio número y no con el que
        // corre en producción.
        const cada = await page.evaluate(() => window.CADA_CUANTO);
        await page.waitForTimeout(cada + 1_500);

        assert.ok(
            (await page.evaluate(() => window.__sonidos)) > primero,
            "vuelve a sonar pasado el intervalo",
        );
    });
}, { timeout: 60_000 });

test("y NO se repite más seguido que su intervalo", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(ESPIAR);
        await page.evaluate(() => window.avisar(["ana"], true, false, []));
        const cada = await page.evaluate(() => window.CADA_CUANTO);
        // A media vuelta todavía no puede haber sonado dos veces.
        await page.waitForTimeout(Math.floor(cada / 2));
        assert.equal(
            await page.evaluate(() => window.__sonidos),
            PorAviso,
            "una sola vez dentro del intervalo",
        );
    });
}, { timeout: 60_000 });

test("PARA al admitir o rechazar, sin esperar la vuelta del reloj", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(ESPIAR);
        await page.evaluate(() => window.avisar(["ana"], true, false, []));
        await page.waitForTimeout(300);
        const tras = await page.evaluate(() => window.__sonidos);

        // Se decidió sobre Ana: la lista del servidor todavía la trae, pero
        // ya no cuenta. Esto es lo que impide que el aviso vuelva a sonar
        // encima de una decisión ya tomada.
        await page.evaluate(() => window.avisar(["ana"], true, false, ["ana"]));
        const cada = await page.evaluate(() => window.CADA_CUANTO);
        await page.waitForTimeout(cada + 1_500);

        assert.equal(
            await page.evaluate(() => window.__sonidos),
            tras,
            "ni un pitido más",
        );
    });
}, { timeout: 60_000 });

test("callado no suena; al volver a encenderlo, otra vez", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(ESPIAR);
        await page.evaluate(() => window.avisar(["ana"], true, true, []));
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => window.__sonidos), 0);

        await page.evaluate(() => window.avisar(["ana"], true, false, []));
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.__sonidos), PorAviso);
    });
});

test("a quien no puede abrir la puerta no le suena", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(ESPIAR);
        await page.evaluate(() => window.avisar(["ana", "beto"], false, false, []));
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => window.__sonidos), 0);
    });
});

test("y quien llega DESPUÉS de una tanda atendida suena al momento", async (t) => {
    if (falta(t)) return;
    await conLaPagina(async (page) => {
        await page.evaluate(ESPIAR);
        await page.evaluate(() => window.avisar(["ana"], true, false, []));
        await page.waitForTimeout(300);
        // Se le abre: la puerta se queda vacía.
        await page.evaluate(() => window.avisar([], true, false, []));
        await page.waitForTimeout(200);
        const tras = await page.evaluate(() => window.__sonidos);
        // Llama otro: no tiene que esperarse el intervalo de la tanda anterior.
        await page.evaluate(() => window.avisar(["beto"], true, false, []));
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.__sonidos), tras + PorAviso);
    });
});
