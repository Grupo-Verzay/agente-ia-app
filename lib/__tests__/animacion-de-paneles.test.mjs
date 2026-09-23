/**
 * La ANIMACIÓN de los paneles laterales de Chats: un solo comportamiento.
 *
 * Lo reportado: la ficha de Contacto entraba «empujada y frenada de golpe»
 * mientras notas, recordatorio, tarea, contexto, copiloto y equipo se
 * deslizaban; y al alternar entre paneles se sentía un salto.
 *
 * Las dos causas:
 *
 * 1. La ficha era un hermano del flex montado con un `&&`: aparecía ya puesta
 *    en un fotograma y encogía la conversación de golpe. Los demás son hojas
 *    `fixed` que se deslizan 500 ms con la curva de `lib/panel-lateral`.
 * 2. Al relevar un panel por otro, el que salía se deslizaba hacia fuera y el
 *    que entraba hacia dentro, en el mismo sitio: un reinicio en cada cambio.
 *
 * `MODO=roto` construye el arnés con el código de ANTES_REF y AFIRMA los dos.
 * Se levanta con `scripts/banco-animacion-de-paneles.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
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
const ANTES_REF = process.env.ANTES_REF || "093f071";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-animacion-de-paneles.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : "";

function leer(fichero) {
    if (!ROTO) return fs.readFileSync(join(RAIZ, fichero), "utf8");
    return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], { cwd: RAIZ, encoding: "utf8" });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. La decisión, pura
// ─────────────────────────────────────────────────────────────────────────────

test("la decisión: desliza con la franja vacía, relevo cuando otro ocupa el sitio", async () => {
    const lib = leer("lib/panel-lateral.ts");
    if (ROTO) {
        assert.ok(!/comoSeMueveLaHoja/.test(lib), "el «antes» no distinguía abrir de relevar");
        return;
    }
    const { comoSeMueveLaHoja } = await import(join(AQUI, ".compilado", "panel-lateral.mjs"));
    const casos = [
        [{ abriendo: true, hayOtroAbierto: false, loCierraOtro: false }, "desliza"],
        [{ abriendo: true, hayOtroAbierto: true, loCierraOtro: false }, "relevo"],
        [{ abriendo: false, hayOtroAbierto: false, loCierraOtro: false }, "desliza"],
        [{ abriendo: false, hayOtroAbierto: true, loCierraOtro: true }, "relevo"],
        // Cerrar a mano con otro abierto no existe (la exclusión deja uno),
        // pero si pasa, se desliza: solo un relevo de verdad se salta la animación.
        [{ abriendo: false, hayOtroAbierto: true, loCierraOtro: false }, "desliza"],
    ];
    for (const [entrada, esperado] of casos) assert.equal(comoSeMueveLaHoja(entrada), esperado, JSON.stringify(entrada));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El barrido del código real
// ─────────────────────────────────────────────────────────────────────────────

test("la ficha de Contacto es un PanelLateral, no un hermano del flex montado con &&", () => {
    const ficha = leer("app/(root)/chats/_components/ContactInfoPanel.tsx");
    const main = leer("app/(root)/chats/_components/chat-main.tsx");
    const esPanel = /<PanelLateral[\s\S]*?PANEL_DE_LA_FICHA/.test(ficha);
    const conAnd = /infoPanelOpen\s*&&\s*session\s*&&\s*\(\s*<ContactInfoPanel/.test(main);
    if (ROTO) {
        assert.ok(!esPanel && conAnd, "el «antes» montaba la ficha de golpe con un &&");
        return;
    }
    assert.ok(esPanel, "ContactInfoPanel tiene que pintarse en <PanelLateral id={PANEL_DE_LA_FICHA}>");
    assert.ok(!conAnd, "chat-main no puede montarla con un && (no habría animación de salida)");
});

test("las dos formas de hoja tienen la MISMA duración y la MISMA curva, y la conversación también", () => {
    const lib = leer("lib/panel-lateral.ts");
    const hoja = (nombre) => {
        const m = new RegExp(`export const ${nombre} =([\\s\\S]*?);`).exec(lib);
        assert.ok(m, `falta ${nombre}`);
        return {
            duracion: /duration-(\d+)/.exec(m[1])?.[1],
            curva: /cubic-bezier\(([^)]*)\)/.exec(m[1])?.[1].replace(/\s/g, ""),
        };
    };
    const a = hoja("HOJA_LATERAL");
    const b = hoja("HOJA_DEL_PANEL");
    assert.deepEqual(a, b, "el copiloto y el equipo (HOJA_LATERAL) y los demás (HOJA_DEL_PANEL)");
    assert.equal(/MS_DEL_DESLIZAMIENTO = (\d+)/.exec(lib)?.[1], a.duracion, "el reloj de salida y la clase");
    const css = leer("app/globals.css");
    const m = /\[data-chat-view\]\s*\{\s*transition:\s*padding-right\s*(\d+)ms\s*cubic-bezier\(([^)]*)\)/.exec(css);
    assert.ok(m, "la conversación tiene que acomodarse con transición");
    assert.equal(m[1], a.duracion);
    assert.equal(m[2].replace(/\s/g, ""), a.curva);
});

test("los tres marcos de hoja apagan la transición en un RELEVO", () => {
    const marcos = [
        "components/shared/PanelLateral.tsx",
        "app/(root)/ai-chat/components/ChatSheet.tsx",
        "components/chat-equipo/PanelDeEquipo.tsx",
    ];
    for (const f of marcos) {
        const usa = /HOJA_SIN_TRANSICION/.test(leer(f));
        if (ROTO) assert.ok(!usa, `${f}: el «antes» animaba también los relevos`);
        else assert.ok(usa, `${f}: tiene que aplicar HOJA_SIN_TRANSICION cuando usePanelLateral dice relevo`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. En Chromium, fotograma a fotograma
// ─────────────────────────────────────────────────────────────────────────────

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS}</style>` +
                    `<style>:root{--alto-de-la-barra:64px}html,body{margin:0;height:100%;overflow:hidden}</style>` +
                    `</head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

/** Lo que se mide en cada fotograma. Va inyectado en la página. */
function instalarMedidas() {
    const hojaDe = (sel) => {
        const n = document.querySelector(sel);
        return n ? n.closest("[data-panel]") ?? n : null;
    };
    const foto = (t) => {
        const f = hojaDe("[data-ficha-de-contacto]");
        const r = hojaDe('[data-panel="panel-crear-recordatorio"]');
        const caja = (n) => {
            if (!n) return null;
            const b = n.getBoundingClientRect();
            const cs = getComputedStyle(n);
            return {
                left: Math.round(b.left),
                right: Math.round(b.right),
                top: Math.round(b.top),
                width: Math.round(b.width),
                visible: cs.visibility !== "hidden" && b.left < innerWidth - 1 && b.width > 0,
                abierta: n.getAttribute("aria-hidden") !== "true",
                duracion: cs.transitionDuration,
                curva: cs.transitionTimingFunction,
            };
        };
        return {
            t: Math.round(t),
            ficha: caja(f),
            recordatorio: caja(r),
            conversacion: Math.round(document.getElementById("conversacion").getBoundingClientRect().width),
        };
    };
    window.muestrear = (cual, v, ms) =>
        new Promise((res) => {
            const out = [];
            const t0 = performance.now();
            window.abrir(cual, v);
            const tick = () => {
                out.push(foto(performance.now() - t0));
                if (performance.now() - t0 < ms) requestAnimationFrame(tick);
                else res(out);
            };
            requestAnimationFrame(tick);
        });
    window.foto = () => foto(0);
}

async function abrirNavegador(ventana) {
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await navegador.newPage({ viewport: { width: ventana, height: 900 } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/${ROTO ? "?modo=roto" : ""}`);
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate(instalarMedidas);
    await page.waitForTimeout(150);
    assert.deepEqual(errores, [], "el arnés tiene que pintarse sin errores");
    const muestrear = (cual, v, ms = 750) => page.evaluate(([c, x, m]) => window.muestrear(c, x, m), [cual, v, ms]);
    return { page, muestrear, cerrar: async () => { await navegador.close(); server.close(); } };
}

const faltaNavegador = (t) => {
    if (chromium && fs.existsSync(HARNESS) && CSS) return false;
    t.skip("falta el navegador, el arnés o el CSS del build");
    return true;
};

/** ¿Hubo algún fotograma a medio camino entre `desde` y `hasta`? */
const aMedioCamino = (valores, desde, hasta) =>
    valores.some((v) => v > Math.min(desde, hasta) + 8 && v < Math.max(desde, hasta) - 8);

for (const ventana of [1440, 1280]) {
    test(`a ${ventana}: la ficha entra y sale deslizándose, igual que el recordatorio`, async (t) => {
        if (faltaNavegador(t)) return;
        const nav = await abrirNavegador(ventana);
        try {
            const convAntes = (await nav.page.evaluate(() => window.foto())).conversacion;
            const entrada = await nav.muestrear("ficha", true);
            const conFicha = entrada.filter((f) => f.ficha);
            const final = conFicha.at(-1).ficha;
            const lefts = conFicha.map((f) => f.ficha.left);
            const convs = entrada.map((f) => f.conversacion);
            t.diagnostic(`ficha: lefts ${[...new Set(lefts)].slice(0, 8).join(",")}… final ${final.left}; conversación ${[...new Set(convs)].length} anchos`);

            if (ROTO) {
                assert.ok(!aMedioCamino(lefts, final.left, ventana), "el «antes» aparecía ya puesta, sin deslizarse");
                assert.ok(
                    !aMedioCamino(convs, convAntes, convs.at(-1)),
                    "y encogía la conversación de golpe, en un fotograma",
                );
                return;
            }
            assert.ok(aMedioCamino(lefts, final.left, ventana), "la ficha tiene que deslizarse de derecha a izquierda");
            assert.ok(aMedioCamino(convs, convAntes, convs.at(-1)), "la conversación se acomoda con la misma transición");

            // Mismo ancho, anclaje, duración y curva que el recordatorio.
            await nav.page.waitForTimeout(100);
            await nav.muestrear("recordatorio", true, 800);
            await nav.muestrear("recordatorio", false, 800);
            const rec = await nav.page.evaluate(() => {
                const n = document.querySelector('[data-panel="panel-crear-recordatorio"]');
                const cs = getComputedStyle(n);
                return { width: Math.round(n.getBoundingClientRect().width), top: Math.round(n.getBoundingClientRect().top), duracion: cs.transitionDuration, curva: cs.transitionTimingFunction };
            });
            await nav.muestrear("ficha", true, 800);
            const f = (await nav.page.evaluate(() => window.foto())).ficha;
            assert.equal(f.right, ventana, "anclada al borde derecho");
            assert.equal(f.width, rec.width, "mismo ancho");
            assert.equal(f.top, rec.top, "misma altura de arranque (bajo la barra)");
            assert.equal(f.duracion, rec.duracion, "misma duración");
            assert.equal(f.curva, rec.curva, "misma curva");

            const salida = await nav.muestrear("ficha", false);
            const lSal = salida.filter((x) => x.ficha).map((x) => x.ficha.left);
            assert.ok(aMedioCamino(lSal, f.left, ventana), "y al cerrar sale deslizándose de izquierda a derecha");
        } finally {
            await nav.cerrar();
        }
    });

    for (const [de, a] of [["ficha", "recordatorio"], ["recordatorio", "ficha"]]) {
        test(`a ${ventana}: de ${de} a ${a} es un relevo, sin reinicio ni tirón`, async (t) => {
            if (faltaNavegador(t)) return;
            const nav = await abrirNavegador(ventana);
            try {
                await nav.muestrear(de, true, 800);
                const antes = await nav.page.evaluate(() => window.foto());
                const fotos = await nav.muestrear(a, true, 700);
                const entra = fotos.map((f) => f[a]).filter((x) => x && x.abierta);
                const final = entra.at(-1);
                const lefts = entra.map((x) => x.left);
                const saleAMedias = fotos.some((f) => {
                    const s = f[de];
                    return s && s.visible && s.left > antes[de].left + 8;
                });
                const convs = [antes.conversacion, ...fotos.map((f) => f.conversacion)];
                t.diagnostic(`entra: ${[...new Set(lefts)].join(",")} · conversación: ${[...new Set(convs)].join(",")}`);

                if (ROTO) {
                    const tiron = aMedioCamino(lefts, final.left, ventana) || saleAMedias || new Set(convs).size > 1;
                    assert.ok(tiron, "el «antes» reiniciaba la animación o movía la conversación en cada cambio");
                    return;
                }
                assert.ok(!aMedioCamino(lefts, final.left, ventana), `${a} aparece en su sitio, sin volver a deslizarse`);
                assert.ok(!saleAMedias, `${de} no se ve salir a medias: se sustituye`);
                assert.equal(new Set(convs).size, 1, "la conversación no se mueve ni un píxel");
                assert.equal(final.right, ventana);
                assert.equal(fotos.at(-1)[de]?.visible ?? false, false, `${de} ya no se ve`);

                // Y el relevo dura UN cambio: cerrar después vuelve a deslizarse.
                const cierre = await nav.muestrear(a, false);
                const lc = cierre.filter((f) => f[a]).map((f) => f[a].left);
                assert.ok(aMedioCamino(lc, final.left, ventana), "tras un relevo, cerrar se desliza como siempre");
            } finally {
                await nav.cerrar();
            }
        });
    }
}
