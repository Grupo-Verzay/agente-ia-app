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
        const apagado = await p.evaluate(() => document.querySelector("button[aria-label='Enviar respuesta']").disabled);
        assert.equal(apagado, true, "vacío no se puede mandar");
        await p.fill("textarea[aria-label='Respuesta']", "Va en camino");
        await p.click("button[aria-label='Enviar respuesta']");
        await p.waitForTimeout(200);
        const llamadas = await p.evaluate(() => window.__correo.filter((c) => c.que === "responder"));
        assert.deepEqual(llamadas, [{ que: "responder", datos: { buzonId: "bz1", correoId: "c1", texto: "Va en camino" } }]);
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
    const visible = await p.evaluate((i) => getComputedStyle(document.querySelector(`[data-correo-fila='${i}'] button[aria-label='Eliminar correo']`)).opacity, id);
    assert.equal(visible, "1", "al pasar el ratón sale la papelera");
    await p.click(`[data-correo-fila='${id}'] button[aria-label='Eliminar correo']`);
    await p.waitForSelector("[role='alertdialog']");
}

test("eliminar desde la BANDEJA: confirma, sale al momento, y si falla vuelve a SU sitio", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS.filter(([a]) => a >= 768)) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.waitForSelector("[data-correo-fila='c1']");
            const oculto = await p.evaluate(() => getComputedStyle(document.querySelector("[data-correo-fila='c1'] button[aria-label='Eliminar correo']")).opacity);
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
        assert.deepEqual(resp, [{ buzonId: "bz2", correoId: "c1", texto: "Recibido" }], "se responde desde SU buzón");
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
