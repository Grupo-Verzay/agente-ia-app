/**
 * CRM › Llamadas: la cuenta de cada llamada, como «● Ventas» junto al nombre.
 *
 *   1. La columna «Cuenta» ya no existe: las columnas son Contacto, Nombre,
 *      Duración, Fecha, Detalle, Resultado y Acciones.
 *   2. Consolidando, pegado a la derecha del nombre va el puntico de color y la
 *      palabra corta de la cuenta («Ventas»), DENTRO de la celda del nombre.
 *   3. Es la marca de Chats, no una parecida: mismo componente, misma paleta y
 *      el mismo color para la misma línea — comprobado contra la función que
 *      Chats llevaba escrita dentro antes de sacarla, leída de git.
 *
 * `MODO=roto` pinta la tabla de `ANTES_REF` y AFIRMA el fallo.
 * Se levanta con `scripts/banco-cuenta-en-llamadas.sh`.
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
} catch {}

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "8bdb33f";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-cuenta-en-llamadas.js");
const { colorDeLaLinea, palabraCortaDeLaLinea, COLORES_DE_LINEA } = await import(
    join(AQUI, ".compilado", "insignia-de-linea.mjs")
);

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;

const COLUMNAS = ["Contacto", "Nombre", "Duración", "Fecha", "Detalle", "Resultado", "Acciones"];
const leer = (p) => fs.readFileSync(join(RAIZ, p), "utf8");
const CHAT = "app/(root)/chats/_components/ChatContactItem.tsx";
const LLAMADAS = "app/(root)/crm/llamadas/_components/CallsCrmClient.tsx";

/** Las dos funciones que Chats llevaba escritas DENTRO, sacadas de git tal cual. */
function lasDeChatsDeAntes() {
    const src = execFileSync("git", ["show", `${ANTES_REF}:${CHAT}`], { cwd: RAIZ, encoding: "utf8" });
    const a = src.indexOf("const INSTANCE_COLORS");
    const b = src.indexOf("function contactInitials");
    assert.ok(a >= 0 && b > a, "no se encontró la paleta de Chats en el commit de antes");
    const codigo = src.slice(a, b).replace(/\(name: string\): string/g, "(name)");
    return new Function(`${codigo}; return { instanceColor, shortInstanceLabel };`)();
}

test("el color y la palabra son EXACTAMENTE los que Chats pintaba", () => {
    const antes = lasDeChatsDeAntes();
    const lineas = ["VERZAY_VENTAS", "VERZAY_ATENCION", "GRUPO_VERZAY", "VERZAY_NOTIFICACIONES", "llamadas", "Clinica Dental_wh", ""];
    for (const l of lineas) assert.equal(colorDeLaLinea(l), antes.instanceColor(l), `color de «${l}»`);
    const nombres = ["Verzay | Ventas", "Verzay | Atención", "VERZAY_ATENCION", "Ventas_wh", "Carlos Arcos", "Solo"];
    for (const n of nombres) assert.equal(palabraCortaDeLaLinea(n), antes.shortInstanceLabel(n), `palabra de «${n}»`);
    assert.equal(palabraCortaDeLaLinea("Verzay | Ventas"), "Ventas");
    assert.equal(COLORES_DE_LINEA.length, 7);
});

test("Chats y Llamadas pintan con la MISMA pieza, y nadie lleva su copia de la paleta", () => {
    const chat = ROTO
        ? execFileSync("git", ["show", `${ANTES_REF}:${CHAT}`], { cwd: RAIZ, encoding: "utf8" })
        : leer(CHAT);
    const llamadas = ROTO
        ? execFileSync("git", ["show", `${ANTES_REF}:${LLAMADAS}`], { cwd: RAIZ, encoding: "utf8" })
        : leer(LLAMADAS);
    if (ROTO) {
        assert.match(chat, /const INSTANCE_COLORS/, "el roto no reproduce: Chats ya no llevaba su copia");
        assert.match(llamadas, /label="Cuenta"/, "el roto no reproduce: no había columna Cuenta");
        return;
    }
    assert.doesNotMatch(chat, /INSTANCE_COLORS|function instanceColor|function shortInstanceLabel/);
    assert.match(chat, /<InsigniaDeLinea/);
    assert.match(llamadas, /<InsigniaDeLinea/);
    assert.doesNotMatch(llamadas, /label="Cuenta"/);
    assert.doesNotMatch(llamadas, /InsigniaDeCuenta/);
});

async function abrir(ancho) {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""} *{animation:none!important;transition:none!important}</style></head>` +
                    `<body style="margin:0"><div id="pantalla" style="width:${ancho - 280}px"></div><script type="module" src="/h.js"></script></body></html>`,
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
    await new Promise((r) => server.listen(0, r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: ancho, height: 900 } })).newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate(() => window.pintarTabla());
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 3, { timeout: 20000 });
    assert.equal(errores.join(" | "), "", "la pantalla reventó");
    return { page, cerrar: async () => { await navegador.close(); server.close(); } };
}

for (const ancho of [1440, 1280, 1024]) {
    test(`consolidando a ${ancho}: sin columna Cuenta y «● Ventas» junto al nombre`, async (t) => {
        if (!chromium) return t.skip("sin playwright");
        if (!CSS) return t.skip("sin el CSS del build");
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await page.evaluate(() => {
                const tabla = document.querySelector("table");
                const cabeceras = [...tabla.querySelectorAll("thead th")].map((th) => th.innerText.trim());
                const filas = [...tabla.querySelectorAll("tbody tr")].filter((tr) => tr.querySelector('[title="Abrir chat del contacto"]'));
                return {
                    cabeceras,
                    filas: filas.map((tr) => {
                        const celdas = [...tr.children];
                        const iNombre = cabeceras.indexOf("Nombre");
                        const td = iNombre >= 0 ? celdas[iNombre] : null;
                        const ins = tr.querySelector("[data-insignia-de-linea]");
                        const punto = ins?.querySelector(".rounded-full");
                        const nombre = td?.querySelector("button, p");
                        const rI = ins?.getBoundingClientRect();
                        const rN = nombre?.getBoundingClientRect();
                        const rT = td?.getBoundingClientRect();
                        return {
                            enLaCeldaDelNombre: !!ins && !!td && td.contains(ins),
                            palabra: ins?.innerText.trim() ?? null,
                            clasePunto: punto?.className ?? "",
                            fondoPunto: punto ? getComputedStyle(punto).backgroundColor : null,
                            aLaDerecha: rI && rN ? rI.left >= rN.right - 0.5 : false,
                            dentroDeLaCelda: rI && rT ? rI.right <= rT.right + 0.5 : false,
                            centrados: rI && rN ? Math.abs(rI.top + rI.height / 2 - (rN.top + rN.height / 2)) <= 2 : false,
                        };
                    }),
                    desborda: document.documentElement.scrollWidth > window.innerWidth,
                };
            });
            if (ROTO) {
                assert.equal(m.cabeceras[0], "Cuenta", "el roto no reproduce: la primera columna no era Cuenta");
                assert.ok(m.filas.every((f) => !f.enLaCeldaDelNombre), "el roto no reproduce: ya había puntico junto al nombre");
                return;
            }
            assert.deepEqual(m.cabeceras, COLUMNAS);
            assert.equal(m.filas.length, 3);
            const esperado = [
                ["Atención", "VERZAY_ATENCION"],
                ["Atención", "VERZAY_ATENCION"],
                ["Ventas", "VERZAY_VENTAS"],
            ];
            for (const [i, f] of m.filas.entries()) {
                const [palabra, linea] = esperado[i];
                assert.ok(f.enLaCeldaDelNombre, `fila ${i}: la marca no está en la celda Nombre`);
                assert.equal(f.palabra, palabra, `fila ${i}`);
                assert.ok(f.clasePunto.split(/\s+/).includes(colorDeLaLinea(linea)), `fila ${i}: el color no es el de Chats para ${linea}`);
                assert.ok(f.fondoPunto && f.fondoPunto !== "rgba(0, 0, 0, 0)", `fila ${i}: el punto no tiene color`);
                assert.ok(f.aLaDerecha, `fila ${i}: la marca no va a la derecha del nombre`);
                assert.ok(f.dentroDeLaCelda, `fila ${i}: la marca se sale de su celda`);
                assert.ok(f.centrados, `fila ${i}: la marca no va a la altura del nombre`);
            }
            assert.equal(m.desborda, false, "la página desborda a lo ancho");
        } finally {
            await cerrar();
        }
    });
}
