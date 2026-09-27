/**
 * La pantalla de Correo, en CHROMIUM, sobre el CSS del build y con el
 * componente de VERDAD (las acciones se fingen apuntando lo que se les pide).
 *
 * Lo que solo se ve pintando:
 *
 * - que la lista mide lo que las demás columnas laterales de la plataforma
 *   (`--ancho-lateral`, la misma escala que la lista de Chats) y el lector se
 *   queda con el resto;
 * - que la caja de responder mide lo que la barra de escribir de Chats y del
 *   chat de equipo (`ALTO_DE_LA_BARRA`, 57 px): es la misma barra;
 * - que el correo se pinta en un iframe que NO ejecuta sus scripts;
 * - que en un teléfono se ve una cosa a la vez, con su flecha de volver;
 * - que nada desborda a lo ancho en 1440, 1280, 1024 y 390;
 * - y que responder manda el texto y el correo, nunca un destinatario.
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
    /* sin navegador no se finge: se salta y lo dice el resumen */
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "correo", "pantalla.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
const hay = Boolean(chromium && CSS && fs.existsSync(HARNESS));
const ALTO_DE_LA_BARRA = 57;

async function conLaPantalla(hacer) {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="app-module-content" style="margin:0"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    const servidor = http.createServer((_q, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }).listen(0);
    await new Promise((r) => servidor.once("listening", r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
    try {
        await hacer(navegador, servidor.address().port);
    } finally {
        await navegador.close();
        servidor.close();
    }
}

async function abrir(navegador, puerto, ancho, alto, sinBuzones = false, error = null) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    if (sinBuzones) await p.evaluate("window.__sinBuzones = true");
    if (error) await p.evaluate((e) => { window.__error = e; }, error);
    await p.evaluate("window.maqueta()");
    await p.waitForTimeout(300);
    assert.deepEqual(errores, [], `la pantalla no llegó a pintarse a ${ancho}`);
    return p;
}

const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 740]];

test("la lista mide la columna lateral de la plataforma, y nada desborda", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.waitForSelector("[data-correo-fila='c1']");
            const m = await p.evaluate(() => {
                const lista = document.querySelector("[data-lista-de-correos]").getBoundingClientRect();
                const sonda = document.createElement("div");
                sonda.style.width = "var(--ancho-lateral)";
                document.body.appendChild(sonda);
                const lateral = sonda.getBoundingClientRect().width;
                sonda.remove();
                return { lista: lista.width, lateral, desborda: document.documentElement.scrollWidth > window.innerWidth };
            });
            assert.equal(m.desborda, false, `desborda a ${ancho}`);
            if (ancho >= 768) assert.ok(Math.abs(m.lista - m.lateral) < 1.5, `a ${ancho} la lista mide ${m.lista} y la columna lateral ${m.lateral}`);
            await p.close();
        }
    });
});

test("abrir un correo: el cuerpo NO ejecuta scripts, hay adjuntos, y la barra de responder mide lo de Chats", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.click("[data-correo-fila='c1']");
            await p.waitForSelector("iframe[data-cuerpo-del-correo]");
            await p.waitForTimeout(250);
            const m = await p.evaluate(() => {
                const iframe = document.querySelector("iframe[data-cuerpo-del-correo]");
                const barra = document.querySelector("[data-lectura-de-correo] > div:last-child").getBoundingClientRect();
                const adjunto = document.querySelector("[data-adjuntos-del-correo] a");
                return {
                    sandbox: iframe.getAttribute("sandbox"),
                    ejecutado: Boolean(window.__ejecutado),
                    altoBarra: barra.height,
                    lista: document.querySelector("[data-lista-de-correos]").getBoundingClientRect().width,
                    lector: document.querySelector("[data-lectura-de-correo]").getBoundingClientRect().width,
                    adjunto: adjunto?.getAttribute("href") ?? null,
                    desborda: document.documentElement.scrollWidth > window.innerWidth,
                };
            });
            assert.ok(!m.sandbox.includes("allow-scripts"), "sin allow-scripts");
            assert.equal(m.ejecutado, false, "el <script> del correo no corrió");
            // `ALTO_DE_LA_BARRA` es el de escritorio: en el teléfono el marco
            // lleva menos relleno, igual que la barra de Chats.
            if (ancho >= 640) assert.equal(Math.round(m.altoBarra), ALTO_DE_LA_BARRA, `a ${ancho} la barra de responder mide ${m.altoBarra}`);
            assert.match(m.adjunto, /^\/api\/correo\/adjunto\?buzon=bz1&correo=c1&adjunto=1$/);
            assert.equal(m.desborda, false, `desborda a ${ancho} con un correo abierto`);
            if (ancho < 768) {
                assert.equal(m.lista, 0, "en el teléfono se ve una cosa a la vez");
                await p.click("button[aria-label='Volver']");
                await p.waitForTimeout(100);
                const lista = await p.evaluate(() => document.querySelector("[data-lista-de-correos]").getBoundingClientRect().width);
                assert.ok(lista > 300, "volver enseña otra vez la lista");
            } else {
                assert.ok(m.lector > 300, `a ${ancho} el lector se queda con el resto`);
            }
            await p.close();
        }
    });
});

test("responder manda el texto y el correo, nunca un destinatario", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.click("[data-correo-fila='c1']");
        await p.waitForSelector("textarea[aria-label='Respuesta']");
        // Vacía, como en Chats: el sitio lo tiene el dictado y no hay botón de enviar.
        const vacia = await p.evaluate(() => {
            const b = document.querySelector("button[aria-label='Enviar respuesta']");
            return !b || b.disabled;
        });
        assert.equal(vacia, true, "vacío no se puede mandar");
        await p.fill("textarea[aria-label='Respuesta']", "Va en camino");
        await p.click("button[aria-label='Enviar respuesta']");
        await p.waitForTimeout(200);
        const llamadas = await p.evaluate(() => window.__correo.filter((c) => c.que === "responder"));
        assert.deepEqual(llamadas, [{ que: "responder", datos: { buzonId: "bz1", correoId: "c1", texto: "Va en camino", adjuntos: [] } }]);
        const vaciado = await p.evaluate(() => document.querySelector("textarea[aria-label='Respuesta']").value);
        assert.equal(vaciado, "", "tras enviar la caja se vacía");
    });
});

test("sin correo conectado: las tres formas de conectar, y la que no está configurada lo dice", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto, true);
            await p.waitForSelector("[data-correo-vacio]");
            const m = await p.evaluate(() => {
                const botones = [...document.querySelectorAll("[data-conectar-correo] button")].map((b) => ({ t: b.textContent.trim(), off: b.disabled }));
                return { botones, texto: document.querySelector("[data-conectar-correo]").textContent, desborda: document.documentElement.scrollWidth > window.innerWidth };
            });
            assert.deepEqual(m.botones.map((b) => b.t), ["Conectar Gmail", "Conectar Outlook", "Conectar correo de dominio propio"]);
            assert.equal(m.botones[0].off, true, "Gmail sin llaves va apagado");
            assert.match(m.texto, /Google aún no está configurada/, "y dice por qué");
            assert.equal(m.botones[1].off, false);
            assert.equal(m.desborda, false);
            await p.close();
        }
    });
});

const MOTIVO = "Google tiene apagada la API de Gmail en el proyecto de la plataforma.";

test("la vuelta con error: el aviso se QUEDA encima de los botones, en los dos sitios donde se conecta", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            // Sin buzones: la pantalla vacía lleva el aviso, y sigue ahí pasado lo que dura un toast.
            let p = await abrir(nav, puerto, ancho, alto, true, MOTIVO);
            await p.waitForSelector("[data-correo-vacio] [data-aviso-conexion]");
            await p.waitForTimeout(6000);
            const m = await p.evaluate(() => {
                const a = document.querySelector("[data-aviso-conexion]");
                const r = a?.getBoundingClientRect();
                const c = document.querySelector("[data-conectar-correo]").getBoundingClientRect();
                return { texto: a?.textContent ?? "", ancho: r?.width, anchoBotones: c.width, desborda: document.documentElement.scrollWidth > window.innerWidth };
            });
            assert.match(m.texto, /No se pudo conectar el correo/);
            assert.match(m.texto, /API de Gmail/);
            assert.equal(Math.round(m.ancho), Math.round(m.anchoBotones), "el aviso mide lo que la columna de botones");
            assert.equal(m.desborda, false);
            // Se cierra con su X.
            await p.click("[data-aviso-conexion] button[aria-label='Cerrar aviso']");
            assert.equal(await p.$("[data-aviso-conexion]"), null);
            await p.close();

            // Con un buzón ya conectado: se abre «Conectar otro correo» con el MISMO aviso.
            p = await abrir(nav, puerto, ancho, alto, false, MOTIVO);
            await p.waitForSelector("[role='dialog'] [data-aviso-conexion]");
            assert.match(await p.textContent("[role='dialog'] [data-aviso-conexion]"), /API de Gmail/);
            await p.close();
        }
    });
});

/* ── Abrir MARCA como leído, y eliminar ───────────────────────────────────── */

const tienePunto = (p, id) => p.evaluate((i) => Boolean(document.querySelector(`[data-correo-fila='${i}'] [data-sin-leer]`)), id);
const filas = (p) => p.evaluate(() => [...document.querySelectorAll("[data-correo-fila]")].map((f) => f.getAttribute("data-correo-fila")));

test("abrir un correo sin leer le quita el punto AL MOMENTO, y la acción sabe que estaba sin leer", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.waitForSelector("[data-correo-fila='c1']");
        assert.equal(await tienePunto(p, "c1"), true);
        await p.click("[data-correo-fila='c1']");
        // La acción fingida tarda 150 ms: el punto tiene que irse ANTES.
        await p.waitForTimeout(40);
        assert.equal(await tienePunto(p, "c1"), false, "se pinta leído sin esperar al proveedor");
        await p.waitForSelector("iframe[data-cuerpo-del-correo]");
        assert.equal(await tienePunto(p, "c1"), false, "y se queda leído");
        const sinLeer = await p.textContent("button:has-text('Sin leer')");
        assert.doesNotMatch(sinLeer, /\(1\)/, "el contador baja");
        // Uno ya leído no pide marcar.
        await p.click("[data-correo-fila='c2']");
        await p.waitForTimeout(250);
        const leer = await p.evaluate(() => window.__correo.filter((c) => c.que === "leer").map((c) => [c.datos.correoId, c.datos.estabaSinLeer]));
        assert.deepEqual(leer, [["c1", true], ["c2", false]]);
    });
});

test("con los permisos VIEJOS el punto vuelve y se ofrece volver a conectar", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.evaluate("window.__sinPermiso = true");
        await p.click("[data-correo-fila='c1']");
        await p.waitForSelector("iframe[data-cuerpo-del-correo]");
        await p.waitForTimeout(100);
        assert.equal(await tienePunto(p, "c1"), true, "si el proveedor no marcó, la lista no miente");
        const aviso = await p.textContent("[data-aviso-correo]");
        assert.match(aviso, /Vuelve a conectarlo/);
        assert.match(aviso, /Volver a conectar/, "con su botón");
    });
});

async function eliminarDesdeLaFila(p, id) {
    await p.hover(`[data-correo-fila='${id}']`);
    const visible = await p.evaluate((i) => getComputedStyle(document.querySelector(`[data-correo-fila='${i}'] button[aria-label='Eliminar correo']`).closest("[data-acciones-de-la-fila]")).opacity, id);
    assert.equal(visible, "1", "al pasar el ratón sale la papelera");
    await p.click(`[data-correo-fila='${id}'] button[aria-label='Eliminar correo']`);
    await p.waitForSelector("[role='alertdialog']");
}

test("eliminar desde la BANDEJA: confirma, sale al momento, y si falla vuelve a SU sitio", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS.filter(([a]) => a >= 768)) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.waitForSelector("[data-correo-fila='c1']");
            const oculto = await p.evaluate(() => getComputedStyle(document.querySelector("[data-correo-fila='c1'] button[aria-label='Eliminar correo']").closest("[data-acciones-de-la-fila]")).opacity);
            assert.equal(oculto, "0", "sin el ratón encima no tapa la fecha");

            // Cancelar no elimina nada.
            await eliminarDesdeLaFila(p, "c1");
            assert.match(await p.textContent("[role='alertdialog']"), /papelera de Gmail/);
            await p.click("[role='alertdialog'] button:has-text('Cancelar')");
            await p.waitForTimeout(150);
            assert.deepEqual(await filas(p), ["c1", "c2"]);
            assert.equal(await p.evaluate(() => window.__correo.filter((c) => c.que === "eliminar").length), 0);

            // Si el proveedor dice que no, vuelve a su sitio.
            await p.evaluate("window.__falla = true");
            await eliminarDesdeLaFila(p, "c1");
            await p.click("[data-confirmar-eliminar]");
            await p.waitForTimeout(40);
            assert.deepEqual(await filas(p), ["c2"], "se quita ANTES de preguntar");
            await p.waitForTimeout(300);
            assert.deepEqual(await filas(p), ["c1", "c2"], "y vuelve a SU sitio al fallar");

            // El bueno.
            await p.evaluate("window.__falla = false");
            await eliminarDesdeLaFila(p, "c2");
            await p.click("[data-confirmar-eliminar]");
            await p.waitForTimeout(300);
            assert.deepEqual(await filas(p), ["c1"]);
            const llamadas = await p.evaluate(() => window.__correo.filter((c) => c.que === "eliminar").map((c) => c.datos));
            assert.deepEqual(llamadas, [{ buzonId: "bz1", correoId: "c1" }, { buzonId: "bz1", correoId: "c2" }]);
            assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
            await p.close();
        }
    });
});

test("eliminar desde el correo ABIERTO, también en un teléfono: se cierra y sale de la lista", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.click("[data-correo-fila='c1']");
            await p.waitForSelector("iframe[data-cuerpo-del-correo]");
            const boton = await p.evaluate(() => {
                const b = document.querySelector("[data-lectura-de-correo] button[aria-label='Eliminar este correo']").getBoundingClientRect();
                return { ancho: b.width, dentro: b.right <= window.innerWidth + 0.5 };
            });
            assert.ok(boton.ancho > 0 && boton.dentro, `a ${ancho} el botón de eliminar se ve entero`);
            await p.click("[data-lectura-de-correo] button[aria-label='Eliminar este correo']");
            await p.waitForSelector("[role='alertdialog']");
            await p.click("[data-confirmar-eliminar]");
            await p.waitForTimeout(300);
            assert.equal(await p.$("[data-lectura-de-correo]"), null, "el correo eliminado se cierra");
            assert.deepEqual(await filas(p), ["c2"]);
            await p.close();
        }
    });
});

/* ── La bandeja UNIFICADA y el filtro de leído ───────────────────────────── */

async function abrirVarios(navegador, puerto, ancho, alto, antes = "") {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.evaluate(`window.__varios = true; ${antes}`);
    await p.evaluate("window.maqueta()");
    await p.waitForSelector("[data-correo-fila]");
    await p.waitForTimeout(200);
    assert.deepEqual(errores, [], `la pantalla no llegó a pintarse a ${ancho}`);
    return p;
}
const filasConBuzon = (p) =>
    p.evaluate(() => [...document.querySelectorAll("[data-correo-fila]")].map((f) => `${f.getAttribute("data-buzon")}:${f.getAttribute("data-correo-fila")}`));
const fila = (b, c) => `[data-buzon='${b}'][data-correo-fila='${c}']`;

test("con varios buzones abre la bandeja UNIFICADA: todos juntos, el más reciente arriba, cada uno con la marca de su buzón", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrirVarios(nav, puerto, ancho, alto);
            assert.equal(await p.evaluate(() => document.querySelector("[data-correo]").getAttribute("data-vista")), "unificada");
            assert.equal(await p.evaluate(() => document.querySelector("[data-selector-de-canal]").textContent.trim()), "Todas");
            // Mezclados por fecha. El «c3» de hace un mes NO sale todavía: el
            // otro buzón puede traer, al cargar más, correos más nuevos que él.
            assert.deepEqual(await filasConBuzon(p), ["bz1:c1", "bz2:c1", "bz1:c2", "bz2:v2"]);
            const m = await p.evaluate(() =>
                [...document.querySelectorAll("[data-correo-fila]")].map((f) => {
                    const i = f.querySelector("[data-insignia-de-linea]");
                    const r = i?.getBoundingClientRect();
                    const rf = f.getBoundingClientRect();
                    return {
                        palabra: i?.textContent.trim() ?? null,
                        color: i ? [...i.querySelector("span").classList].find((c) => c.startsWith("bg-")) : null,
                        dentro: r ? r.left >= rf.left - 0.5 && r.right <= rf.right + 0.5 && r.width > 0 : false,
                    };
                }),
            );
            assert.deepEqual(m.map((x) => x.palabra), ["ana", "ventas", "ana", "ventas"], "cada correo dice de qué buzón llegó");
            assert.ok(m.every((x) => x.dentro), `a ${ancho} la marca cabe en su fila`);
            assert.equal(m[0].color, m[2].color, "el mismo buzón, el mismo color");
            assert.notEqual(m[0].color, m[1].color, "dos buzones, dos colores");
            assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `desborda a ${ancho}`);
            await p.close();
        }
    });
});

test("dos correos con el MISMO id en buzones distintos son dos correos: abrir y marcar va a SU buzón", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrirVarios(nav, puerto, 1280, 800);
        await p.click(fila("bz2", "v2"));
        await p.waitForTimeout(40);
        assert.equal(await p.evaluate((s) => Boolean(document.querySelector(`${s} [data-sin-leer]`)), fila("bz2", "v2")), false, "se pinta leído al momento");
        assert.equal(await p.evaluate((s) => Boolean(document.querySelector(`${s} [data-sin-leer]`)), fila("bz1", "c1")), true, "el de otro buzón no se toca");
        await p.waitForSelector("iframe[data-cuerpo-del-correo]");
        await p.click(fila("bz2", "c1"));
        await p.waitForTimeout(250);
        const leer = await p.evaluate(() => window.__correo.filter((c) => c.que === "leer").map((c) => [c.datos.buzonId, c.datos.correoId, c.datos.estabaSinLeer]));
        assert.deepEqual(leer, [["bz2", "v2", true], ["bz2", "c1", false]]);
        assert.equal(await p.evaluate((s) => Boolean(document.querySelector(`${s} [data-sin-leer]`)), fila("bz1", "c1")), true, "el «c1» de Gmail sigue sin leer");
        const adjunto = await p.getAttribute("[data-adjuntos-del-correo] a", "href");
        assert.match(adjunto, /buzon=bz2&correo=c1/, "el adjunto se baja de SU buzón");
        await p.fill("textarea[aria-label='Respuesta']", "Recibido");
        await p.click("button[aria-label='Enviar respuesta']");
        await p.waitForTimeout(150);
        const resp = await p.evaluate(() => window.__correo.filter((c) => c.que === "responder").map((c) => c.datos));
        assert.deepEqual(resp, [{ buzonId: "bz2", correoId: "c1", texto: "Recibido", adjuntos: [] }], "se responde desde SU buzón");
    });
});

test("cargar más: añade por ABAJO y nunca mete nada encima de lo que ya se veía", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrirVarios(nav, puerto, 1280, 800);
        const antes = await filasConBuzon(p);
        await p.click("button:has-text('Cargar más')");
        await p.waitForTimeout(250);
        const despues = await filasConBuzon(p);
        assert.deepEqual(despues.slice(0, antes.length), antes, "lo que había no se movió");
        assert.deepEqual(despues, ["bz1:c1", "bz2:c1", "bz1:c2", "bz2:v2", "bz2:v3", "bz1:c3"]);
        const pedidos = await p.evaluate(() => window.__correo.filter((c) => c.que === "unificada").map((c) => c.datos.cursores));
        assert.deepEqual(pedidos, [null, { bz2: "p2" }], "solo se pide la página siguiente del buzón que la tiene");
        assert.equal(await p.$("button:has-text('Cargar más')"), null, "sin más páginas no hay botón");
    });
});

const PASTILLAS = "[data-pastillas-de-correo] [data-pastilla-de-filtro]";
const pulsarPastilla = (p, f) => p.click(`[data-pastillas-de-correo] [data-pastilla-de-filtro='${f}']`);
async function elegirBuzon(p, valor) {
    await p.click("[data-selector-de-canal]");
    await p.waitForSelector(`[data-opcion-del-selector='${valor}']`);
    await p.click(`[data-opcion-del-selector='${valor}']`);
}

test("el filtro Todos · Sin leer · Leídos son pastillas con contador, igual en la unificada y en un buzón", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrirVarios(nav, puerto, ancho, alto);
            const grupo = await p.evaluate((sel) => {
                const ps = [...document.querySelectorAll(sel)];
                return {
                    pastillas: ps.map((b) => [b.querySelector("span.shrink-0").textContent, b.querySelector("[data-insignia-de-pastilla]")?.textContent ?? null]),
                    alto: ps[0].getBoundingClientRect().height,
                };
            }, PASTILLAS);
            // Cuatro cargados, dos sin leer, y quedan páginas: «al menos».
            assert.deepEqual(grupo.pastillas, [["Todos", "4+"], ["Sin leer", "2+"], ["Leídos", "2+"]]);
            // Entero a la vista y sin nada encima, también en un teléfono.
            const alcanzable = await p.evaluate((sel) =>
                [...document.querySelectorAll(sel)].every((b) => {
                    const r = b.getBoundingClientRect();
                    const x = r.left + r.width / 2;
                    const y = r.top + r.height / 2;
                    return r.left >= 0 && r.right <= window.innerWidth && b.contains(document.elementFromPoint(x, y));
                }), PASTILLAS);
            assert.equal(alcanzable, true, `a ${ancho} las tres pastillas se ven y se pulsan`);
            await pulsarPastilla(p, "sinLeer");
            assert.deepEqual(await filasConBuzon(p), ["bz1:c1", "bz2:v2"]);
            assert.equal(await p.getAttribute("[data-pastilla-de-filtro='sinLeer']", "aria-pressed"), "true");
            await pulsarPastilla(p, "leidos");
            assert.deepEqual(await filasConBuzon(p), ["bz2:c1", "bz1:c2"]);
            await pulsarPastilla(p, "todos");
            assert.deepEqual(await filasConBuzon(p), ["bz1:c1", "bz2:c1", "bz1:c2", "bz2:v2"]);
            // Un buzón suelto: el mismo filtro, y sin marcas de buzón (sería repetir su nombre).
            await elegirBuzon(p, "bz2");
            await p.waitForSelector(fila("bz2", "v2"));
            assert.equal(await p.evaluate(() => document.querySelector("[data-correo]").getAttribute("data-vista")), "buzon");
            assert.equal(await p.$("[data-insignia-de-linea]"), null);
            await pulsarPastilla(p, "sinLeer");
            assert.deepEqual(await filasConBuzon(p), ["bz2:v2"]);
            const altoBuzon = await p.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().height, PASTILLAS);
            assert.equal(altoBuzon, grupo.alto, "la pastilla mide lo mismo en las dos vistas");
            assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `desborda a ${ancho}`);
            await p.close();
        }
    });
});

/** Lo que define cómo se ve algo: se compara Correo contra Chats, pintados con la MISMA hoja. */
const FORMA = (el) => {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
        alto: r.height,
        radio: c.borderTopLeftRadius,
        borde: c.borderTopWidth,
        letra: c.fontSize,
        peso: c.fontWeight,
        fondo: c.backgroundColor,
        colorBorde: c.borderTopColor,
        color: c.color,
    };
};

test("simetría: el selector y las pastillas de Correo son EXACTAMENTE los de Chats", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrirVarios(nav, puerto, ancho, alto);
            await p.evaluate("window.maquetaChats()");
            await p.waitForSelector("#chats [data-selector-de-canal]", { state: "attached" });
            const m = await p.evaluate((FORMA_SRC) => {
                const FORMA = eval(FORMA_SRC);
                const chats = document.getElementById("chats");
                const correo = document.querySelector("[data-correo]");
                const selector = (raiz) => {
                    const b = raiz.querySelector("[data-selector-de-canal]");
                    return { ...FORMA(b), flecha: b.querySelector("svg").getBoundingClientRect().width, maxAncho: getComputedStyle(b).maxWidth };
                };
                const pastilla = (raiz, valor) => {
                    const b = raiz.querySelector(`[data-pastilla-de-filtro='${valor}']`);
                    const i = b.querySelector("[data-insignia-de-pastilla]");
                    return { ...FORMA(b), insignia: i ? { ...FORMA(i), ancho: i.getBoundingClientRect().width > 0 } : null };
                };
                return {
                    selector: [selector(chats), selector(correo)],
                    todos: [pastilla(chats, "all"), pastilla(correo, "todos")],
                    sinLeer: [pastilla(chats, "sinLeer"), pastilla(correo, "sinLeer")],
                    rotulos: [chats.querySelector("[data-selector-de-canal]").textContent.trim(), correo.querySelector("[data-selector-de-canal]").textContent.trim()],
                };
            }, FORMA.toString());
            assert.deepEqual(m.rotulos, ["Todos", "Todas"]);
            assert.deepEqual(m.selector[1], m.selector[0], `a ${ancho} el selector de Correo es el de Chats`);
            assert.deepEqual(m.todos[1], m.todos[0], `a ${ancho} «Todos» es la misma pastilla, del mismo azul`);
            assert.deepEqual(m.sinLeer[1], m.sinLeer[0], `a ${ancho} «Sin leer» es la misma pastilla, del mismo naranja`);
            assert.equal(m.todos[1].alto, 24, "pastilla de 24 px, no un botón pequeño");
            await p.close();
        }
    });
});

test("el selector de bandejas despliega su lista HACIA ABAJO, colgado de su botón, como el de canales", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrirVarios(nav, puerto, ancho, alto);
            await p.click("[data-selector-de-canal]");
            await p.waitForSelector("[data-opcion-del-selector='bz2']");
            await p.waitForTimeout(200);
            const m = await p.evaluate(() => {
                const boton = document.querySelector("[data-selector-de-canal]").getBoundingClientRect();
                const panel = document.querySelector("[role='menu']");
                const r = panel.getBoundingClientRect();
                const cabecera = document.querySelector("[data-cabecera-de-la-columna]").getBoundingClientRect();
                return {
                    filas: [...panel.querySelectorAll("[data-opcion-del-selector]")].map((f) => f.getAttribute("data-opcion-del-selector")),
                    titulo: panel.querySelector("p").textContent,
                    textos: [...panel.querySelectorAll("[data-opcion-del-selector]")].map((f) => f.textContent.trim()),
                    marcada: [...panel.querySelectorAll("[data-opcion-del-selector]")].findIndex((f) => f.querySelector("svg")),
                    arriba: r.top, debajoDe: cabecera.bottom, izquierda: r.left, botonIzquierda: boton.left,
                    ancho: r.width, dentro: r.left >= 0 && r.right <= window.innerWidth + 0.5,
                };
            });
            assert.equal(m.titulo, "Bandejas");
            assert.deepEqual(m.filas, ["", "bz1", "bz2"], "«Todas» y una fila por buzón");
            assert.match(m.textos[0], /^Todas/);
            assert.equal(m.marcada, 0, "la elegida lleva su marca");
            assert.ok(m.arriba >= m.debajoDe - 1, `a ${ancho} el panel nace debajo de la barra (${m.arriba} vs ${m.debajoDe})`);
            assert.ok(Math.abs(m.izquierda - m.botonIzquierda) <= 1, `a ${ancho} colgado de su botón (${m.izquierda} vs ${m.botonIzquierda})`);
            assert.ok(m.dentro, `a ${ancho} el panel cabe en la ventana`);
            assert.ok(m.ancho <= 288.5, `a ${ancho} mide el ancho común de los filtros (${m.ancho})`);
            await p.click("[data-opcion-del-selector='bz2']");
            await p.waitForSelector(fila("bz2", "v2"));
            assert.match(await p.textContent("[data-selector-de-canal]"), /ventas@verzay\.com/, "el botón dice lo elegido");
            await p.close();
        }
    });
});

test("las pastillas van en SU fila, debajo del buscador, en todas las anchuras, como en Chats", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            for (const varios of [true, false]) {
                const p = varios ? await abrirVarios(nav, puerto, ancho, alto) : await abrir(nav, puerto, ancho, alto);
                await p.waitForSelector("[data-pastillas-de-correo]");
                const m = await p.evaluate(() => {
                    const pastillas = document.querySelector("[data-pastillas-de-correo]");
                    const fila = pastillas.closest("[data-fila-de-filtros]");
                    const buscador = document.querySelector("input[aria-label='Buscar correo']").getBoundingClientRect();
                    const barra = document.querySelector("[data-barra-de-acciones]");
                    const primera = pastillas.querySelector("[data-pastilla-de-filtro]").getBoundingClientRect();
                    const cabecera = document.querySelector("[data-cabecera-de-la-columna]").getBoundingClientRect();
                    // El filo de la fila de arriba: donde empieza el hueco del buscador.
                    const izquierda = document.querySelector("[data-correo] [data-fila-del-buscador]").getBoundingClientRect().left;
                    return {
                        enSuFila: Boolean(fila),
                        enLaBarra: Boolean(barra && barra.contains(pastillas)),
                        cuantas: document.querySelectorAll("[data-pastillas-de-correo]").length,
                        debajo: primera.top >= buscador.bottom - 0.5,
                        dentroDeLaCabecera: primera.bottom <= cabecera.bottom + 0.5,
                        izquierda: [primera.left, izquierda],
                        filaAlto: fila?.getBoundingClientRect().height ?? 0,
                        desborda: document.documentElement.scrollWidth > window.innerWidth,
                    };
                });
                const donde = `a ${ancho}${varios ? " con varios buzones" : ""}`;
                assert.equal(m.enSuFila, true, `${donde} las pastillas van en su fila`);
                assert.equal(m.enLaBarra, false, `${donde} y no en la del buscador`);
                assert.equal(m.cuantas, 1, `${donde} se pintan una vez`);
                assert.equal(m.debajo, true, `${donde} la fila cae DEBAJO del buscador`);
                assert.equal(m.dentroDeLaCabecera, true, `${donde} dentro de la cabecera de la columna`);
                assert.ok(Math.abs(m.izquierda[0] - m.izquierda[1]) <= 1, `${donde} arranca en el mismo filo que el selector/buscador (${m.izquierda})`);
                // La fila de pastillas de Chats: 28 px en computador (`CLASE_FILA_2`),
                // lo que mida una pastilla en un teléfono.
                assert.equal(m.filaAlto, ancho >= 768 ? 28 : 24, `${donde} la fila mide lo de la de Chats`);
                assert.equal(m.desborda, false, `${donde} nada desborda`);
                await p.close();
            }
        }
    });
});

test("el selector de bandejas: cada una con su número y SIN el proveedor debajo, y el número es la insignia de Chats", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrirVarios(nav, puerto, ancho, alto);
            await p.evaluate("window.maquetaChats()");
            await p.waitForSelector("#chats [data-selector-de-canal]", { state: "attached" });
            const leerPanel = () => p.evaluate(() => {
                const panel = document.querySelector("[role='menu']");
                return [...panel.querySelectorAll("[data-opcion-del-selector]")].map((f) => ({
                    valor: f.getAttribute("data-opcion-del-selector"),
                    lineas: [...f.querySelectorAll("span")].filter((s) => !s.closest("span.rounded-full") && !s.classList.contains("rounded-full")).map((s) => s.textContent.trim()).filter(Boolean),
                    numero: f.querySelector("span.rounded-full")?.textContent.trim() ?? null,
                }));
            });
            const insignia = (raiz) => p.evaluate((FORMA_SRC) => {
                const FORMA = eval(FORMA_SRC);
                const panel = document.querySelector("[role='menu']");
                const f = [...panel.querySelectorAll("[data-opcion-del-selector]")].find((x) => x.getAttribute("data-opcion-del-selector") !== "");
                const i = f.querySelector("span.rounded-full");
                const t = f.querySelector("span.truncate");
                // Redondeado: el panel de Radix entra con una animación de escala.
                const r = (o) => ({ ...o, alto: Math.round(o.alto * 10) / 10 });
                return { insignia: r(FORMA(i)), texto: r(FORMA(t)), fila: Math.round(f.getBoundingClientRect().height * 10) / 10 };
            }, FORMA.toString());
            await p.click("[data-correo] [data-selector-de-canal]");
            await p.waitForSelector("[data-opcion-del-selector='bz2']");
            await p.waitForTimeout(300);
            const filas = await leerPanel();
            assert.deepEqual(filas.map((f) => [f.valor, f.lineas, f.numero]), [
                ["", ["Todas"], "1321"],
                ["bz1", ["ana@gmail.com"], "1234"],
                ["bz2", ["ventas@verzay.com"], "87"],
            ], `a ${ancho} una línea por bandeja, con su número, y «Todas» con la suma`);
            const texto = await p.evaluate(() => document.querySelector("[role='menu']").textContent);
            assert.doesNotMatch(texto, /Gmail|Outlook|Dominio propio/, `a ${ancho} el proveedor no sale en ninguna fila`);
            const deCorreo = await insignia();
            await p.keyboard.press("Escape");
            await p.waitForSelector("[role='menu']", { state: "detached" });
            // El mismo panel, abierto desde Chats: la insignia y la fila miden lo mismo.
            await p.evaluate(() => Object.assign(document.getElementById("chats").style, { visibility: "visible", zIndex: "40", background: "white" }));
            await p.click("#chats [data-selector-de-canal]");
            await p.waitForSelector("[data-opcion-del-selector='VENTAS']");
            await p.waitForTimeout(300);
            const deChats = await insignia();
            assert.deepEqual(deCorreo.insignia, deChats.insignia, `a ${ancho} el número es la MISMA insignia que en Chats`);
            assert.deepEqual(deCorreo.texto, deChats.texto, `a ${ancho} y el nombre, la misma letra`);
            assert.equal(deCorreo.fila, deChats.fila, `a ${ancho} y la fila, el mismo alto (una sola línea en las dos)`);
            await p.keyboard.press("Escape");
            await p.close();
        }
    });
});

test("una bandeja que no dice su total va SIN número, y «Todas» también: nunca un cero inventado", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrirVarios(nav, puerto, 1280, 800, "window.__totalFalla = true;");
        await p.click("[data-selector-de-canal]");
        await p.waitForSelector("[data-opcion-del-selector='bz2']");
        const numeros = await p.evaluate(() =>
            [...document.querySelectorAll("[data-opcion-del-selector]")].map((f) => f.querySelector("span.rounded-full")?.textContent.trim() ?? null),
        );
        assert.deepEqual(numeros, [null, "1234", null]);
        await p.close();
    });
});

test("un buzón que no contesta no vacía la unificada: los demás se ven y el aviso dice cuál falló", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrirVarios(nav, puerto, 1280, 800, "window.__falloDe = 'bz2';");
        assert.deepEqual(await filasConBuzon(p), ["bz1:c1", "bz1:c2", "bz1:c3"], "lo de Gmail entero, sin esperar al otro");
        const aviso = await p.textContent("[data-aviso-correo='bz2']");
        assert.match(aviso, /ventas@verzay\.com/);
        assert.match(aviso, /Volver a conectar/);
    });
});

test("eliminar en la unificada va al buzón DEL correo y la confirmación habla de SU papelera", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrirVarios(nav, puerto, 1280, 800);
        await p.hover(fila("bz2", "c1"));
        await p.click(`${fila("bz2", "c1")} button[aria-label='Eliminar correo']`);
        await p.waitForSelector("[role='alertdialog']");
        assert.match(await p.textContent("[role='alertdialog']"), /papelera de tu servidor/, "es un buzón de dominio propio");
        await p.click("[data-confirmar-eliminar]");
        await p.waitForTimeout(300);
        assert.deepEqual(await filasConBuzon(p), ["bz1:c1", "bz1:c2", "bz2:v2"], "el «c1» de Gmail sigue ahí");
        const llamadas = await p.evaluate(() => window.__correo.filter((c) => c.que === "eliminar").map((c) => c.datos));
        assert.deepEqual(llamadas, [{ buzonId: "bz2", correoId: "c1" }]);
    });
});

test("con UN solo buzón no hay unificada: ni selector ni marcas", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.waitForSelector("[data-correo-fila='c1']");
        assert.equal(await p.evaluate(() => document.querySelector("[data-correo]").getAttribute("data-vista")), "buzon");
        assert.equal(await p.$("[data-selector-de-canal]"), null, "con uno solo no hay selector");
        assert.equal(await p.$("[data-insignia-de-linea]"), null);
        assert.equal(await p.evaluate(() => window.__correo.filter((c) => c.que === "unificada").length), 0);
    });
});

/* ── Lo que se añadió para que Correo sea tan completo como Chats ────────── */

const llamadasDe = (p, que) => p.evaluate((q) => window.__correo.filter((c) => c.que === q).map((c) => c.datos), que);
const seVe = (p, sel) =>
    p.evaluate((s) => [...document.querySelectorAll(s)].some((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    }), sel);
const pulsarVisible = (p, sel) =>
    p.evaluate((s) => {
        const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0);
        e.click();
    }, sel);

test("la cabecera del correo abierto: remitente y asunto, con sus cinco mandos, a la altura de las de Chats", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.click("[data-correo-fila='c1']");
            await p.waitForSelector("iframe[data-cuerpo-del-correo]");
            await p.waitForTimeout(150);
            const m = await p.evaluate(() => {
                const cab = document.querySelector("[data-cabecera-del-correo]").getBoundingClientRect();
                const mandos = [...document.querySelectorAll("[data-mandos-del-correo] button")].map((b) => {
                    const r = b.getBoundingClientRect();
                    return { etiqueta: b.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height), dentro: r.left >= cab.left - 0.5 && r.right <= cab.right + 0.5 && r.bottom <= cab.bottom };
                });
                return {
                    alto: Math.round(cab.height),
                    remitente: document.querySelector("[data-remitente-del-correo]").textContent,
                    asunto: document.querySelector("[data-asunto-del-correo]").textContent,
                    mandos,
                    desborda: document.documentElement.scrollWidth > window.innerWidth,
                };
            });
            assert.equal(m.alto, 78, `a ${ancho} la cabecera mide lo de los paneles de Chats (${m.alto})`);
            assert.match(m.remitente, /Cliente/);
            assert.equal(m.asunto, "Cotización");
            assert.deepEqual(
                m.mandos.map((x) => x.etiqueta),
                ["Responder", "Reenviar", "Marcar como no leído", "Destacar", "Eliminar este correo", "Más acciones del correo"],
            );
            for (const x of m.mandos) {
                assert.deepEqual([x.w, x.h], [28, 28], `${x.etiqueta} mide lo que un control de la cabecera de Chats`);
                assert.equal(x.dentro, true, `${x.etiqueta} se ve entero a ${ancho}`);
            }
            assert.equal(m.desborda, false, `desborda a ${ancho}`);
            await p.close();
        }
    });
});

test("reenviar: pide a quién, manda el correo y lo escrito, y se puede cancelar", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.click("[data-correo-fila='c1']");
        await p.waitForSelector("iframe[data-cuerpo-del-correo]");
        await p.click("[data-mandos-del-correo] button[aria-label='Reenviar']");
        await p.waitForSelector("[data-reenviar-a]");
        await p.fill("input[aria-label='Reenviar a']", "jefe@verzay.com");
        await p.fill("textarea[aria-label='Respuesta']", "Te lo paso");
        await p.click("button[aria-label='Reenviar correo']");
        await p.waitForTimeout(200);
        assert.deepEqual(await llamadasDe(p, "reenviar"), [{ buzonId: "bz1", correoId: "c1", para: "jefe@verzay.com", texto: "Te lo paso", adjuntos: [] }]);
        assert.equal(await seVe(p, "[data-reenviar-a]"), false, "tras reenviar vuelve a responder");
        assert.deepEqual(await llamadasDe(p, "responder"), [], "reenviar no responde al remitente");
    });
});

test("marcar como no leído y destacar desde la cabecera se pintan en la lista al momento", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.click("[data-correo-fila='c1']");
        await p.waitForSelector("iframe[data-cuerpo-del-correo]");
        await p.waitForTimeout(200);
        assert.equal(await tienePunto(p, "c1"), false);
        await p.click("[data-mandos-del-correo] button[aria-label='Destacar']");
        await p.waitForTimeout(30);
        assert.equal(await seVe(p, "[data-correo-fila='c1'] [data-marca-destacado]"), true, "la estrella sale en la lista ANTES de que conteste el proveedor");
        await p.waitForTimeout(200);
        assert.equal(await p.getAttribute("[data-mandos-del-correo] button[aria-label='Quitar destacado']", "aria-pressed"), "true");
        await p.click("[data-mandos-del-correo] button[aria-label='Marcar como no leído']");
        await p.waitForTimeout(30);
        assert.equal(await tienePunto(p, "c1"), true, "vuelve el punto de sin leer");
        await p.waitForTimeout(200);
        assert.deepEqual(await llamadasDe(p, "destacar"), [{ buzonId: "bz1", correoId: "c1", destacado: true }]);
        assert.deepEqual(await llamadasDe(p, "noLeido"), [{ buzonId: "bz1", correoId: "c1" }]);

        // Si el proveedor dice que no, la estrella se quita otra vez.
        await p.evaluate("window.__falla = true");
        await p.hover("[data-correo-fila='c2']");
        await p.click("[data-correo-fila='c2'] button[aria-label='Más acciones de este correo']");
        await p.click("[role='menuitem']:has-text('Quitar destacado')");
        await p.waitForTimeout(30);
        assert.equal(await seVe(p, "[data-correo-fila='c2'] [data-marca-destacado]"), false);
        await p.waitForTimeout(250);
        assert.equal(await seVe(p, "[data-correo-fila='c2'] [data-marca-destacado]"), true, "y vuelve al fallar");
    });
});

test("anclar: el anclado sale ARRIBA, también uno viejo que no está cargado, y se desancla", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS.filter(([a]) => a >= 768)) {
            const p = await navegarConAnclado(nav, puerto, ancho, alto);
            assert.deepEqual(await filas(p), ["viejo-1", "c1", "c2"], "el anclado de marzo va arriba aunque la página no lo traiga");
            assert.equal(await seVe(p, "[data-correo-fila='viejo-1'] [data-marca-anclado]"), true);
            await p.hover("[data-correo-fila='c2']");
            await p.click("[data-correo-fila='c2'] button[aria-label='Más acciones de este correo']");
            await p.click("[role='menuitem']:has-text('Anclar arriba')");
            await p.waitForTimeout(150);
            assert.deepEqual(await filas(p), ["c2", "viejo-1", "c1"], "el recién anclado primero, y no se repite abajo");
            assert.deepEqual(await llamadasDe(p, "anclar"), [{ buzonId: "bz1", correoId: "c2" }]);
            await p.hover("[data-correo-fila='c2']");
            await p.click("[data-correo-fila='c2'] button[aria-label='Más acciones de este correo']");
            await p.click("[role='menuitem']:has-text('Desanclar')");
            await p.waitForTimeout(150);
            assert.deepEqual(await filas(p), ["viejo-1", "c1", "c2"], "desanclado vuelve a su sitio por fecha");
            assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
            await p.close();
        }
    });
});

async function navegarConAnclado(nav, puerto, ancho, alto) {
    const p = await nav.newPage({ viewport: { width: ancho, height: alto } });
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.evaluate("window.__anclado = true; window.maqueta()");
    await p.waitForSelector("[data-correo-fila='viejo-1']");
    await p.waitForTimeout(150);
    return p;
}

test("archivar: sale de la bandeja sin confirmación, y si el proveedor falla vuelve a SU sitio", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.evaluate("window.__falla = true");
        await p.hover("[data-correo-fila='c1']");
        await p.click("[data-correo-fila='c1'] button[aria-label='Archivar correo']");
        await p.waitForTimeout(30);
        assert.deepEqual(await filas(p), ["c2"], "sale ANTES de preguntar");
        await p.waitForTimeout(250);
        assert.deepEqual(await filas(p), ["c1", "c2"], "y vuelve a su sitio al fallar");
        await p.evaluate("window.__falla = false");
        // Desde el correo abierto, por el «⋯» de la cabecera.
        await p.click("[data-correo-fila='c2']");
        await p.waitForSelector("iframe[data-cuerpo-del-correo]");
        await p.click("[data-mandos-del-correo] button[aria-label='Más acciones del correo']");
        await p.click("[role='menuitem']:has-text('Archivar')");
        await p.waitForTimeout(250);
        assert.deepEqual(await filas(p), ["c1"]);
        assert.equal(await seVe(p, "[data-cabecera-del-correo]"), false, "el correo archivado se cierra");
        assert.equal((await llamadasDe(p, "archivar")).length, 2);
        assert.equal((await llamadasDe(p, "eliminar")).length, 0, "archivar no es eliminar");
    });
});

test("el buscador por remitente o por asunto, además del general", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        const elegir = async (nombre) => {
            await p.click("[data-campo-de-busqueda]");
            await p.click(`[role='menuitem']:has-text('${nombre}')`);
            await p.waitForTimeout(80);
        };
        assert.equal(await p.getAttribute("input[aria-label='Buscar correo']", "placeholder"), "Buscar en lo cargado");
        await p.fill("input[aria-label='Buscar correo']", "factura");
        await p.waitForTimeout(80);
        assert.deepEqual(await filas(p), ["c2"], "el general encuentra por asunto");
        await elegir("Remitente");
        assert.match(await p.getAttribute("input[aria-label='Buscar correo']", "placeholder"), /remitente/, "el campo se lee en el buscador");
        assert.deepEqual(await filas(p), [], "por remitente, «factura» no casa con nadie");
        await p.fill("input[aria-label='Buscar correo']", "prov");
        await p.waitForTimeout(80);
        assert.deepEqual(await filas(p), ["c2"]);
        await elegir("Asunto");
        assert.deepEqual(await filas(p), [], "«prov» no está en ningún asunto");
        await p.fill("input[aria-label='Buscar correo']", "cotizacion");
        await p.waitForTimeout(80);
        assert.deepEqual(await filas(p), ["c1"], "sin acentos");
        assert.equal(await p.getAttribute("[data-campo-de-busqueda]", "data-campo-de-busqueda"), "asunto");
    });
});

test("la barra de responder: la de Chats con solo lo de un correo — archivos, dictado, firma e IA", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrirVarios(nav, puerto, ancho, alto);
            await p.click(fila("bz2", "c1"));
            await p.waitForSelector("[data-barra-del-correo]");
            await p.waitForTimeout(150);
            const plegada = await seVe(p, "[data-barra-del-correo] button[aria-label='Herramientas de mensaje']");
            if (plegada) await pulsarVisible(p, "[data-barra-del-correo] button[aria-label='Herramientas de mensaje']");
            await p.waitForTimeout(80);
            const m = await p.evaluate(() => {
                const barra = document.querySelector("[data-barra-del-correo]");
                const visibles = [...barra.querySelectorAll("button")]
                    .filter((b) => b.getBoundingClientRect().width > 0)
                    .map((b) => b.getAttribute("aria-label"))
                    .filter(Boolean);
                const firma = [...barra.querySelectorAll("button[aria-label='Firma del correo']")].find((b) => b.getBoundingClientRect().width > 0);
                return { visibles, firmaActiva: firma?.getAttribute("title"), desborda: document.documentElement.scrollWidth > window.innerWidth };
            });
            for (const esperado of ["Firma del correo", "Adjuntar", "Sugerir respuesta con IA"]) {
                assert.ok(m.visibles.includes(esperado), `a ${ancho} la barra ofrece «${esperado}» (${m.visibles.join(", ")})`);
            }
            for (const deWhatsapp of ["Emojis", "Formato", "Nota de voz", "Respuestas rápidas", "Nota interna"]) {
                assert.ok(!m.visibles.some((v) => v.includes(deWhatsapp)), `«${deWhatsapp}» no aplica a un correo`);
            }
            assert.equal(m.firmaActiva, "Firma activa", "el buzón de ventas tiene su firma encendida, y se ve");
            assert.equal(m.desborda, false, `desborda a ${ancho}`);

            await pulsarVisible(p, "[data-barra-del-correo] button[aria-label='Sugerir respuesta con IA']");
            await p.waitForSelector("[data-sugerencia-de-la-ia] button[title='Usar sugerencia']");
            assert.match(await p.textContent("[data-sugerencia-de-la-ia]"), /gracias por escribir/);
            await p.click("[data-sugerencia-de-la-ia] button[title='Usar sugerencia']");
            await p.waitForTimeout(80);
            assert.match(await p.inputValue("textarea[aria-label='Respuesta']"), /Te envío la cotización/, "usarla la deja en la caja para revisarla");
            assert.deepEqual((await llamadasDe(p, "sugerir")).map((x) => [x.buzonId, x.correoId]), [["bz2", "c1"]]);
            await p.close();
        }
    });
});

test("pegar un archivo en la respuesta lo adjunta, y viaja con ella", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.click("[data-correo-fila='c1']");
        await p.waitForSelector("textarea[aria-label='Respuesta']");
        await p.evaluate(() => {
            const dt = new DataTransfer();
            dt.items.add(new File(["hola"], "nota.txt", { type: "text/plain" }));
            const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
            document.querySelector("textarea[aria-label='Respuesta']").dispatchEvent(ev);
        });
        await p.waitForSelector("[data-adjuntos-para-enviar]");
        assert.match(await p.textContent("[data-adjuntos-para-enviar]"), /nota\.txt/);
        await p.fill("textarea[aria-label='Respuesta']", "Adjunto");
        await p.click("button[aria-label='Enviar respuesta']");
        await p.waitForTimeout(200);
        assert.deepEqual(await llamadasDe(p, "responder"), [{ buzonId: "bz1", correoId: "c1", texto: "Adjunto", adjuntos: ["nota.txt"] }]);
    });
});
