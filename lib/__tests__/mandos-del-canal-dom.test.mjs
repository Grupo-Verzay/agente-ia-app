/**
 * Los mandos de la cabecera de un canal, PINTADOS, con el `HiloDelEquipo` de
 * verdad dentro de un panel lateral de 22 rem.
 *
 * Cuatro cosas que no se contestan leyendo el código:
 *
 * 1. **Los tres dibujos son distintos.** Era el fallo: la opción «Videollamada»
 *    del menú y el botón de la reunión eran el MISMO icono de lucide, así que
 *    la cabecera decía «un teléfono que despliega una cámara, y una cámara al
 *    lado». Se compara el SVG de cada botón, que es lo único que dice qué se ve.
 * 2. **Un clic y ya**: el teléfono despacha la llamada de voz y la cámara la
 *    videollamada, y en el documento **no se abre ningún menú**.
 * 3. **La pantalla abre la reunión y NO despacha ninguna llamada.** Es la otra
 *    mitad: la cámara pasó a ser la videollamada, así que la reunión tenía que
 *    seguir alcanzable de un clic.
 * 4. **Los tres miden lo mismo** que el resto de los controles de la fila, y
 *    nada desborda el panel a ninguna anchura.
 *
 * `MODO=roto` monta el `HiloDelEquipo` de ANTES_REF y AFIRMA el fallo: dos
 * botones con el mismo SVG y un menú intermedio con dos opciones. Se levanta
 * con `scripts/banco-mandos-del-canal.sh`.
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
    /* sin navegador se dice y se salta */
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-mandos-del-canal.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : "";

/** Los mandos de hoy y los de antes: el «antes» no lleva las marcas nuevas. */
const SEL_MANDOS = ROTO
    ? '[data-boton="llamar-en-el-directo"],[data-boton="reunion-del-canal"]'
    : "[data-mando]";

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
                    `<style>:root{--alto-de-la-barra:64px;--ancho-lateral:22rem}` +
                    `html,body{margin:0;height:100%;overflow:hidden}` +
                    // Un panel EN MOVIMIENTO no está en ningún sitio: las
                    // animaciones de Radix mueven y encogen lo que se mide.
                    `*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    // El hilo arrastra `next/link` (la tarjeta de un chat
                    // compartido), que lee `process.env.__NEXT_*`. En la App eso
                    // lo inyecta Next; en un navegador suelto no hay nada que lo
                    // ponga, así que el módulo revienta al cargarse y `listo` no
                    // llega nunca — y el banco se cae con un plazo agotado, que
                    // no se parece en nada a su causa.
                    `<script>window.process={env:{}}</script>` +
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

async function abrir({ ancho = 1440, alto = 900, limpiar = false, nombre = null } = {}) {
    const server = await levantar();
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
    });
    const page = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.addInitScript(
        ({ limpiar, nombre }) => {
            // Lo que el fingido de las acciones lee: si quien mira es súper
            // administrador (y entonces la fila lleva el «⋯») y cómo se llama el
            // directo. Los dos hacen la fila más ancha.
            window.__puedoLimpiar = limpiar;
            if (nombre) window.__nombreLargo = nombre;
        },
        { limpiar, nombre },
    );
    await page.addInitScript(() => {
        window.__llamadas = [];
        // El hilo abre en la LISTA si no se le pide un canal; el arnés se lo
        // pide, así que entra en el chat. El recuerdo de `localStorage` no
        // puede mandar sobre lo pedido, y aquí está vacío.
        try {
            window.localStorage.clear();
        } catch {
            /* sin almacenamiento se sigue igual */
        }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    // La cabecera del canal llega con la primera carga del hilo.
    await page.waitForSelector("[data-nombre-del-canal]", { timeout: 20000 });
    await page.waitForTimeout(120);
    assert.deepEqual(errores, [], "el arnés tiene que pintarse sin errores");
    return {
        page,
        cerrar: async () => {
            await navegador.close();
            server.close();
        },
    };
}

/** Los mandos de la fila, medidos: su marca, su caja, su SVG y su color. */
const losMandos = (page) =>
    page.evaluate((sel) => {
        const fila = document.querySelector("[data-fila-del-hilo]");
        if (!fila) return null;
        return Array.from(fila.querySelectorAll(sel)).map((n) => {
            const r = n.getBoundingClientRect();
            const svg = n.querySelector("svg");
            const g = svg?.getBoundingClientRect();
            return {
                marca: n.getAttribute("data-mando") ?? n.getAttribute("data-boton"),
                titulo: n.getAttribute("title"),
                aviso: n.getAttribute("aria-label"),
                w: Math.round(r.width),
                h: Math.round(r.height),
                left: Math.round(r.left),
                right: Math.round(r.right),
                // El dibujo: lo único que dice qué se VE. Dos mandos con el
                // mismo `svg` son dos mandos indistinguibles.
                dibujo: svg ? svg.innerHTML.replace(/\s+/g, " ").trim() : null,
                glifo: g ? { w: Math.round(g.width), h: Math.round(g.height) } : null,
                clases: n.className,
            };
        });
    }, SEL_MANDOS);

const cuantosMenus = (page) =>
    page.evaluate(() => document.querySelectorAll('[role="menu"]').length);

const faltaNavegador = (t) => {
    if (chromium && fs.existsSync(HARNESS) && CSS) return false;
    t.skip("falta el navegador, el arnés o el CSS del build");
    return true;
};

const ANCHURAS = [1440, 1280, 1024, 390];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tres mandos, tres dibujos distintos
// ─────────────────────────────────────────────────────────────────────────────

test("en un directo hay TRES mandos y los tres dibujos son DISTINTOS", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        const mandos = await losMandos(page);
        assert.ok(mandos, "no se pintó la fila del canal");
        console.log(
            "  mandos:",
            mandos.map((m) => `${m.marca} ${m.w}x${m.h}`).join(" · "),
        );
        const dibujos = mandos.map((m) => m.dibujo);
        assert.ok(
            dibujos.every(Boolean),
            "algún mando se pintó sin icono: no hay dibujo que comparar",
        );
        if (ROTO) {
            // El fallo: el botón de la reunión y la opción «Videollamada» del
            // menú son el MISMO icono.
            const menu = mandos.find((m) => m.marca === "llamar-en-el-directo");
            await page.click('[data-boton="llamar-en-el-directo"]');
            await page.waitForTimeout(150);
            const opciones = await page.evaluate(() =>
                Array.from(document.querySelectorAll("[data-llamar]")).map((n) => ({
                    modo: n.getAttribute("data-llamar"),
                    texto: n.textContent?.trim(),
                    dibujo: n.querySelector("svg")?.innerHTML.replace(/\s+/g, " ").trim() ?? null,
                })),
            );
            const reunion = mandos.find((m) => m.marca === "reunion-del-canal");
            const video = opciones.find((o) => o.modo === "video");
            console.log("  ANTES: opciones del menú:", opciones.map((o) => o.texto).join(" · "));
            assert.equal(opciones.length, 2, "el menú no ofrecía dos opciones");
            assert.ok(menu, "no estaba el disparador del menú");
            assert.equal(
                video.dibujo,
                reunion.dibujo,
                "ANTES la cámara del menú y la de la reunión eran el mismo dibujo",
            );
            return;
        }
        assert.deepEqual(
            mandos.map((m) => m.marca),
            ["voz", "video", "reunion"],
            "el orden de los mandos no es teléfono, cámara, pantalla",
        );
        assert.equal(
            new Set(dibujos).size,
            3,
            "dos mandos se pintan con el MISMO dibujo: es el fallo del encargo",
        );
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Un clic y ya: ningún menú intermedio
// ─────────────────────────────────────────────────────────────────────────────

test("el teléfono llama de VOZ de un clic, sin abrir ningún menú", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        if (ROTO) {
            await page.click('[data-boton="llamar-en-el-directo"]');
            await page.waitForTimeout(150);
            assert.equal(await page.evaluate(() => window.__llamadas.length), 0);
            assert.ok(
                (await cuantosMenus(page)) > 0,
                "ANTES el teléfono abría un menú antes de llamar",
            );
            return;
        }
        await page.click('[data-mando="voz"]');
        await page.waitForTimeout(150);
        const llamadas = await page.evaluate(() => window.__llamadas);
        assert.equal(llamadas.length, 1, "un clic tiene que despachar UNA llamada");
        assert.equal(llamadas[0].modo, "voz");
        assert.equal(llamadas[0].canalId, "directo-1");
        assert.equal(llamadas[0].conQuien, "Sofía Restrepo");
        assert.equal(await cuantosMenus(page), 0, "se abrió un menú intermedio");
    } finally {
        await cerrar();
    }
});

test("la cámara hace la VIDEOLLAMADA de un clic, sin abrir ningún menú", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        if (ROTO) {
            // ANTES la videollamada no tenía botón: había que desplegar el
            // menú del teléfono. Un salto aquí se leería como un verde.
            const mandos = await losMandos(page);
            assert.equal(mandos.length, 2, "ANTES la fila tenía DOS mandos, no tres");
            assert.ok(
                !(await page.evaluate(() => Boolean(document.querySelector('[data-mando="video"]')))),
                "ANTES no había ningún botón de videollamada",
            );
            return;
        }
        await page.click('[data-mando="video"]');
        await page.waitForTimeout(150);
        const llamadas = await page.evaluate(() => window.__llamadas);
        assert.equal(llamadas.length, 1, "un clic tiene que despachar UNA llamada");
        assert.equal(llamadas[0].modo, "video");
        assert.equal(await cuantosMenus(page), 0, "se abrió un menú intermedio");
    } finally {
        await cerrar();
    }
});

test("la pantalla abre la REUNIÓN y no despacha ninguna llamada", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        const sel = ROTO ? '[data-boton="reunion-del-canal"]' : '[data-mando="reunion"]';
        await page.click(sel);
        await page.waitForTimeout(250);
        assert.equal(
            await page.evaluate(() => window.__llamadas.length),
            0,
            "la reunión no puede despachar una llamada",
        );
        assert.ok(
            await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))),
            "no se abrió el diálogo de la reunión",
        );
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Simetría: los tres como el resto de los controles de la fila
// ─────────────────────────────────────────────────────────────────────────────

test("los tres mandos miden lo mismo que el control de volver, y su glifo igual", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        if (ROTO) {
            // ANTES eran DOS, y uno de ellos era el disparador de un menú: no
            // había tres mandos que pudieran ser simétricos.
            const mandos = await losMandos(page);
            assert.deepEqual(
                mandos.map((m) => m.marca),
                ["llamar-en-el-directo", "reunion-del-canal"],
                "ANTES la fila tenía el disparador del menú y la reunión",
            );
            return;
        }
        const volver = await page.evaluate(() => {
            const n = document.querySelector('[data-boton="volver-a-la-lista"]');
            const r = n.getBoundingClientRect();
            const g = n.querySelector("svg").getBoundingClientRect();
            return {
                w: Math.round(r.width),
                h: Math.round(r.height),
                glifo: { w: Math.round(g.width), h: Math.round(g.height) },
            };
        });
        const mandos = await losMandos(page);
        console.log(`  volver: ${volver.w}x${volver.h}, glifo ${volver.glifo.w}`);
        // Los TRES, y no «los que haya»: con cero mandos el bucle de abajo no se
        // ejerce y el caso pasaría en verde sin haber medido nada.
        assert.equal(mandos.length, 3, `mandos medidos: ${mandos.length}`);
        for (const m of mandos) {
            assert.deepEqual(
                { w: m.w, h: m.h },
                { w: volver.w, h: volver.h },
                `el mando ${m.marca} no mide como los demás controles`,
            );
            assert.deepEqual(m.glifo, volver.glifo, `el glifo de ${m.marca} mide otra cosa`);
        }
    } finally {
        await cerrar();
    }
});

test("las dos llamadas comparten color y la reunión lleva el suyo", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        const mandos = await losMandos(page);
        if (ROTO) {
            // ANTES había UN control de llamada —el del menú—, así que no había
            // dos colores que comparar.
            assert.equal(
                mandos.filter((m) => m.marca === "llamar-en-el-directo").length,
                1,
                "ANTES la llamada era un solo disparador de menú",
            );
            return;
        }
        const de = (marca) => mandos.find((m) => m.marca === marca).clases;
        assert.equal(de("voz"), de("video"), "las dos formas de llamar no se ven igual");
        assert.notEqual(de("reunion"), de("voz"), "la reunión se ve como una llamada");
    } finally {
        await cerrar();
    }
});

test("los tres avisos y títulos dicen qué hace cada uno", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        const mandos = await losMandos(page);
        if (ROTO) {
            // ANTES el teléfono decía «Llamar a X» a secas: no distinguía la voz
            // del video, porque eso lo decidía el menú de después.
            const tel = mandos.find((m) => m.marca === "llamar-en-el-directo");
            assert.equal(tel.titulo, "Llamar a Sofía Restrepo");
            assert.equal(tel.aviso, "Llamar a Sofía Restrepo");
            return;
        }
        assert.deepEqual(
            mandos.map((m) => m.titulo),
            ["Llamada de voz", "Videollamada", "Reunión de video"],
        );
        assert.deepEqual(
            mandos.map((m) => m.aviso),
            [
                "Llamada de voz con Sofía Restrepo",
                "Videollamada con Sofía Restrepo",
                "Reunión de video en Sofía Restrepo",
            ],
        );
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Un canal de ÁREA no tiene «el otro»: solo la reunión
// ─────────────────────────────────────────────────────────────────────────────

test("en un canal de área solo sale la reunión: ni teléfono ni cámara", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        await page.evaluate(() => window.canal("area-1"));
        await page.waitForFunction(
            () => document.querySelector("[data-nombre-del-canal]")?.textContent === "Ventas",
            { timeout: 20000 },
        );
        await page.waitForTimeout(150);
        const mandos = await losMandos(page);
        console.log("  área:", mandos.map((m) => m.marca).join(" · "));
        if (ROTO) {
            assert.deepEqual(mandos.map((m) => m.marca), ["reunion-del-canal"]);
            return;
        }
        assert.deepEqual(mandos.map((m) => m.marca), ["reunion"]);
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Nada desborda el panel
// ─────────────────────────────────────────────────────────────────────────────

test("la fila de mandos cabe en el panel a 1440, 1280, 1024 y 390", async (t) => {
    if (faltaNavegador(t)) return;
    for (const ancho of ANCHURAS) {
        const { page, cerrar } = await abrir({ ancho });
        try {
            const fila = await page.evaluate(() => {
                const n = document.querySelector("[data-fila-del-hilo]");
                const r = n.getBoundingClientRect();
                return { left: Math.round(r.left), right: Math.round(r.right) };
            });
            const mandos = await losMandos(page);
            const desborda = await page.evaluate(
                () =>
                    document.documentElement.scrollWidth >
                    document.documentElement.clientWidth,
            );
            console.log(
                `  ${ancho}px: fila ${fila.left}→${fila.right}, mandos ${mandos
                    .map((m) => `${m.left}→${m.right}`)
                    .join(" ")}`,
            );
            assert.ok(!desborda, `la página se desplaza a lo ancho a ${ancho}`);
            assert.equal(
                mandos.length,
                ROTO ? 2 : 3,
                `a ${ancho} la fila trae ${mandos.length} mandos: nada se midió`,
            );
            for (const m of mandos) {
                assert.ok(
                    m.left >= fila.left - 1 && m.right <= fila.right + 1,
                    `el mando ${m.marca} se sale de la fila a ${ancho}`,
                );
                assert.ok(m.w > 0 && m.h > 0, `el mando ${m.marca} no se ve a ${ancho}`);
            }
        } finally {
            await cerrar();
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. El guardián: un banco que no ejerce nada no está en verde, está muerto
// ─────────────────────────────────────────────────────────────────────────────

test("el arnés pinta una fila con mandos: sin eso, lo de arriba no prueba nada", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        const mandos = await losMandos(page);
        assert.ok(mandos, "no hay fila del hilo: el arnés no llegó a pintar la cabecera");
        assert.ok(
            mandos.length >= 2,
            `la fila trae ${mandos.length} mandos: nada de lo de arriba se ejerció`,
        );
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. El caso MÁS ancho: tres mandos, el «⋯» y un nombre que no cabe
// ─────────────────────────────────────────────────────────────────────────────

test("con el «⋯» y un nombre largo la fila sigue cabiendo, y al nombre le queda sitio", async (t) => {
    if (faltaNavegador(t)) return;
    // Es el caso que un mando de más podía romper, y el que no se ve probando
    // con un nombre corto y sin ser súper administrador.
    const NOMBRE = "María Alejandra Restrepo Villegas";
    for (const ancho of ANCHURAS) {
        const { page, cerrar } = await abrir({ ancho, limpiar: true, nombre: NOMBRE });
        try {
            const mandos = await losMandos(page);
            const opciones = await page.evaluate(() =>
                Boolean(document.querySelector('[data-boton="opciones-del-canal"]')),
            );
            const nombre = await page.evaluate(() => {
                const n = document.querySelector("[data-nombre-del-canal]");
                const r = n.getBoundingClientRect();
                return {
                    w: Math.round(r.width),
                    texto: n.textContent,
                    // Recortado con «…»: el nombre entero no cabe y no puede
                    // empujar a los mandos fuera de la fila.
                    recorta: n.scrollWidth > n.clientWidth + 1,
                };
            });
            const desborda = await page.evaluate(
                () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
            );
            console.log(
                `  ${ancho}px con «⋯»: nombre ${nombre.w}px${nombre.recorta ? " (recortado)" : ""}, mandos ${mandos.length}`,
            );
            assert.ok(opciones, "no se pintó el «⋯» del súper administrador");
            assert.ok(!desborda, `la página se desplaza a lo ancho a ${ancho}`);
            assert.equal(nombre.texto, NOMBRE, "el nombre entero tiene que estar en el DOM");
            assert.ok(nombre.w > 0, `el nombre se queda sin sitio a ${ancho}`);
            if (!ROTO) {
                assert.equal(mandos.length, 3, "faltan mandos con el «⋯» puesto");
            }
            for (const m of mandos) {
                assert.ok(m.w === 28 && m.h === 28, `el mando ${m.marca} se deformó a ${ancho}`);
            }
        } finally {
            await cerrar();
        }
    }
});
