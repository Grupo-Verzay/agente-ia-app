/**
 * La tarjeta del tablero de Proyectos, en Chromium y sobre el CSS del build.
 *
 * # Qué se arregló
 *
 * Cuando una tarjeta tenía adjuntos, el indicador iba en un **renglón `<p>`
 * propio** encima de la fila del responsable, así que la tarjeta crecía y las de
 * una misma columna quedaban disparejas. Ahora el clip con su número va INLINE en
 * esa misma fila —el mismo patrón que la tarjeta de Tickets—, así que la tarjeta
 * mide lo mismo lo lleve o no.
 *
 * # Por qué esto se mide en un navegador
 *
 * Las preguntas del encargo son de pintado y no se contestan leyendo el código:
 *
 *   1. **Las tres tarjetas —sin adjunto, con uno, con varios— miden lo mismo.**
 *      Se mide el alto de verdad; un renglón aparte lo cambiaría.
 *   2. **El adjunto no añade un bloque:** la tarjeta tiene los mismos hijos
 *      directos con y sin él (título + fila de datos), no uno más.
 *   3. **El adjunto sigue accesible:** el clip y su número se pintan y se ven.
 *
 * # Los dos modos
 *
 * `MODO=roto` empaqueta la tarjeta de **`origin/main`** —no una copia escrita
 * aquí—, donde el adjunto era un renglón aparte, y afirma que ahí la tarjeta con
 * adjunto CRECE y lleva un bloque de más. Sin ese modo, lo verde del normal no
 * diría si la medida ejerce algo.
 *
 * Se levanta con `scripts/banco-tarjeta-de-proyecto.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-tarjeta-de-proyecto.js");

/** El CSS del build: medir con otra hoja es medir una tarjeta que nadie ve. */
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

// Un reloj fijo, para que el distintivo de vencimiento salga igual en las tres
// tarjetas y no dependa del día en que corra el banco.
const AHORA = Date.UTC(2026, 8, 21, 15, 0, 0);
const UN_DIA = 24 * 60 * 60 * 1000;

/**
 * La tarjeta se lee dentro de una columna de ancho FIJO: los tableros van en
 * columnas de 280px que se desplazan a lo ancho, así que la tarjeta mide igual
 * en computador y en móvil. La columna lleva `p-2` (8px), así que a la tarjeta
 * le quedan 264px —el mismo ancho que usa el `DragOverlay`—.
 */
const ANCHO_COLUMNA = 280;

/** Una tarea con `n` adjuntos y, por lo demás, idéntica a las otras. */
function unaTarea(n) {
    const adjuntos = Array.from({ length: n }, (_, i) => ({
        id: `a${i}`,
        taskId: 1,
        url: `https://bucket.example/foto-${i}.png`,
        nombre: `foto-${i}.png`,
        tipo: "image",
        mimeType: "image/png",
        tamanoBytes: 1000,
        creadoEn: new Date(AHORA).toISOString(),
    }));
    return {
        id: 1,
        ownerId: "cuenta",
        assignedToId: "u1",
        assignedToName: "Ana",
        assignedToPhone: null,
        sessionId: null,
        contactName: null,
        contactJid: null,
        title: "Logo nuevo",
        type: "Tarea",
        // A cinco días: «lejos», un chip corto e idéntico en las tres.
        dueDate: new Date(AHORA + 5 * UN_DIA).toISOString(),
        result: null,
        status: "pending",
        createdById: "u1",
        createdAt: new Date(AHORA).toISOString(),
        adjuntos,
        detalle: null,
        clienteId: null,
        tipoDeTrabajo: null,
        tieneAlgoSinVer: false,
        posicion: null,
    };
}

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${CSS ?? ""}</style></head>` +
                    `<body style="margin:0">` +
                    // La columna de 280px con su `p-2`, tal cual el tablero.
                    `<div id="columna" style="width:${ANCHO_COLUMNA}px"><div style="padding:8px">` +
                    `<div id="tarjeta"></div></div></div>` +
                    `<script type="module" src="/harness-tarjeta-de-proyecto.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-tarjeta-de-proyecto.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho = 1440) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: ancho, height: 900 } })).newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/** Pinta la tarjeta con `n` adjuntos y devuelve lo medido. */
async function medir(page, n) {
    await page.evaluate(([task, ahora]) => window.pintar(task, ahora), [unaTarea(n), AHORA]);
    await page.waitForTimeout(120);
    return page.evaluate(() => {
        const card = document.getElementById("tarjeta").firstElementChild;
        const clip = card.querySelector("svg.lucide-paperclip");
        const clipVisible = (() => {
            if (!clip) return false;
            const r = clip.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        })();
        return {
            alto: Math.round(card.getBoundingClientRect().height),
            ancho: Math.round(card.getBoundingClientRect().width),
            // Hijos directos de la tarjeta: título + fila de datos = 2. Un
            // renglón de adjunto aparte serían 3.
            hijos: card.children.length,
            tieneClip: !!clip,
            clipVisible,
        };
    });
}

function faltaNavegador(t) {
    if (!chromium) {
        t.skip("sin playwright en este equipo");
        return true;
    }
    if (!CSS) {
        t.skip("sin el CSS del build: corre `npm run build` antes");
        return true;
    }
    return false;
}

test("sin adjunto, con uno y con varios: la tarjeta mide lo mismo", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        const sin = await medir(page, 0);
        const uno = await medir(page, 1);
        const varios = await medir(page, 5);
        t.diagnostic(
            `${ROTO ? "origin/main" : "ahora"}: sin adjunto ${sin.alto}px / ${sin.hijos} hijos; ` +
                `uno ${uno.alto}px / ${uno.hijos}; varios ${varios.alto}px / ${varios.hijos}`,
        );

        if (ROTO) {
            // EL ANTES: el adjunto vivía en un renglón aparte, así que la
            // tarjeta con adjuntos crecía y llevaba un bloque de más.
            assert.ok(
                uno.alto > sin.alto,
                `en origin/main la tarjeta con un adjunto crece: sin ${sin.alto}px, con ${uno.alto}px`,
            );
            assert.equal(uno.alto, varios.alto, "uno y varios crecían lo mismo: es un solo renglón");
            assert.equal(sin.hijos, 2, "sin adjunto son dos bloques");
            assert.equal(uno.hijos, 3, "con adjunto, en origin/main, había un bloque de más");
            return;
        }

        assert.equal(uno.alto, sin.alto, "un adjunto no puede cambiar el alto de la tarjeta");
        assert.equal(varios.alto, sin.alto, "ni varios adjuntos");
        // Y el número de bloques no cambia: el adjunto va DENTRO de la fila de
        // datos, no en un renglón propio.
        assert.equal(sin.hijos, uno.hijos, "el adjunto no añade un bloque a la tarjeta");
        assert.equal(sin.hijos, varios.hijos, "ni con varios");
    } finally {
        await cerrar();
    }
});

test("el adjunto se ve: el clip y su número están en la tarjeta", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1440);
    try {
        const sin = await medir(page, 0);
        assert.equal(sin.tieneClip, false, "sin adjuntos no se pinta ningún clip");

        const con = await medir(page, 3);
        assert.equal(con.tieneClip, true, "con adjuntos se pinta el clip");
        assert.equal(con.clipVisible, true, "el clip tiene que verse, no estar oculto");

        // Y el número, para que se sepa cuántos hay antes de abrir la tarea.
        const texto = await page.evaluate(
            () => document.getElementById("tarjeta").firstElementChild.textContent ?? "",
        );
        assert.ok(texto.includes("3"), `la tarjeta enseña el número de adjuntos; se vio: ${JSON.stringify(texto)}`);
    } finally {
        await cerrar();
    }
});

test("en computador y en móvil la tarjeta no desborda su columna ni cambia de alto", async (t) => {
    if (faltaNavegador(t)) return;
    for (const ancho of [1440, 390]) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const sin = await medir(page, 0);
            const con = await medir(page, 4);
            t.diagnostic(`${ancho}px: sin ${sin.alto}px, con ${con.alto}px, ancho tarjeta ${con.ancho}px`);

            // La columna es fija (280px con p-2 → 264 para la tarjeta), así que
            // la tarjeta no puede salirse de ahí ni en un móvil.
            assert.ok(con.ancho <= ANCHO_COLUMNA, `a ${ancho}px la tarjeta se sale de su columna`);
            const desborda = await page.evaluate(
                () =>
                    document.getElementById("tarjeta").scrollWidth >
                    document.getElementById("tarjeta").clientWidth,
            );
            assert.equal(desborda, false, `a ${ancho}px el contenido de la tarjeta desborda`);

            if (!ROTO) {
                assert.equal(con.alto, sin.alto, `a ${ancho}px el adjunto cambia el alto`);
            }
        } finally {
            await cerrar();
        }
    }
});
