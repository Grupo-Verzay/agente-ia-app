/**
 * Los DOS desplegables de la cabecera de la conversación —Etiquetas y Etapas—,
 * pintados por la `ChatHeader` real sobre el CSS del build, abiertos de verdad
 * en Chromium.
 *
 * Lo que se mide, y por qué no se puede contestar leyendo el código:
 *
 *   1. **La fila arranca en el mismo píxel en los dos.** La sangría de más del
 *      menú de Etiquetas no estaba escrita en ninguna parte: la metía el `p-1`
 *      que `CommandGroup` lleva dentro. Cuatro píxeles no se ven mirando una
 *      sola; se ven al pasar de una a la otra, y solo se cazan midiendo.
 *   2. **Y el rótulo también**, que es la otra mitad de lo mismo: el de
 *      Etiquetas lo pinta cmdk con su propio relleno y el de Etapas es un `<p>`.
 *   3. **El nombre va en mayúscula por CSS**, así que el `textContent` sigue
 *      siendo el de verdad —cmdk filtra por ese texto— y el globo lo conserva.
 *   4. **El menú de Etapas no tiene chulito** y lo puesto es un gris suave, sin
 *      recuadro.
 *   5. **Ese gris no se pierde al apuntarlo**, y apuntando a otra fila las dos
 *      no se ven iguales. `--muted` y `--accent` son el MISMO valor en este
 *      tema, así que esto es lo único que distingue lo puesto de lo apuntado.
 *   6. Nada se desborda en ninguna de las cuatro anchuras.
 *
 * `MODO=roto` pinta el MISMO arnés con los componentes de `ANTES_REF` y afirma
 * el fallo: la fila de Etiquetas 4 px más adentro, el chulito en su sitio y
 * ningún nombre en mayúscula. Se levanta con `scripts/banco-filas-de-los-menus.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "arnes-de-las-filas.js");
const CSS_FICHERO = process.env.CSS_DEL_BANCO;
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = CSS_FICHERO
    ? fs.readFileSync(CSS_FICHERO, "utf8")
    : fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n");

const ANCHURAS = [1440, 1280, 1024, 390];
/** Los nombres sembrados, tal cual se escribieron. */
const ETIQUETAS = ["Cliente", "Pago pendiente", "Esperando documentos del cliente"];
const ETAPAS = ["Nuevo", "Contactado", "Esperando respuesta del cliente"];

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    // Sin este meta, Chromium monta un viewport de maqueta de 980
                    // y lo escala: a 390 no se estaría midiendo un teléfono.
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS}</style>` +
                    `<style>@font-face{font-family:__poppins;src:url(/p400.woff2);font-weight:400}` +
                    `@font-face{font-family:__poppins;src:url(/p700.woff2);font-weight:700}` +
                    `@font-face{font-family:__poppins_Fallback;src:local("Arial")}` +
                    `body{font-family:__poppins,__poppins_Fallback}</style>` +
                    `<style>html,body{margin:0;height:100%;overflow:hidden}</style>` +
                    // Un panel EN MOVIMIENTO no está en ningún sitio: las
                    // animaciones de Radix lo mueven y lo encogen mientras juegan.
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `</head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/p400.woff2" || u === "/p700.woff2") {
            res.writeHead(200, { "Content-Type": "font/woff2" });
            res.end(
                fs.readFileSync(
                    join(RAIZ, "app", "fonts", u === "/p400.woff2" ? "poppins-400.woff2" : "poppins-700.woff2"),
                ),
            );
            return;
        }
        if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

/*
 * Cómo se encuentra cada cosa, y por qué SIN ninguna marca nueva en el DOM: el
 * «antes» no la tendría, así que el modo roto no encontraría lo que viene a
 * medir y pasaría sin ejercer nada. Todo sale de lo que ya ponen Radix (el
 * envoltorio del portal) y cmdk (`[cmdk-item]`, `[cmdk-group-heading]`).
 *
 * Y el disparador se busca entre los que SE VEN: `ChatHeader` pinta los dos
 * mandos DOS veces —su fila de móvil y su fila de escritorio—, así que un
 * `querySelector` a secas se queda con el primero del documento, que a 1440 es
 * el del móvil y está en `display:none`. Es el mismo error que ya costó una
 * vuelta midiendo Macros.
 */
const PANEL_ABIERTO = "[data-radix-popper-content-wrapper]";

/** El disparador VISIBLE de uno de los dos menús. */
function elDisparadorQueSeVe(cual) {
    const todos = [...document.querySelectorAll('[role="combobox"]')];
    const esEtapas = (n) => n.getAttribute("aria-label") === "Etapa del embudo";
    const visibles = todos.filter((n) => n.getBoundingClientRect().width > 0);
    return cual === "etapas" ? visibles.find(esEtapas) : visibles.find((n) => !esEtapas(n));
}

/**
 * En un móvil los dos mandos viven dentro de las herramientas PLEGADAS de la
 * cabecera, detrás de la pastilla «Activa». Sin desplegarlas no hay nada que
 * abrir, que es lo que el arnés reprodujo a 390.
 */
function desplegarLasHerramientas() {
    for (const b of document.querySelectorAll("button")) {
        const t = (b.textContent ?? "").trim();
        if (t === "Activa" || t === "Pausada") {
            b.click();
            return true;
        }
    }
    return false;
}

/** Lo que se mide de un menú abierto. */
function medirElMenuAbierto() {
    const panel = document.querySelector("[data-radix-popper-content-wrapper]")?.firstElementChild;
    if (!panel) return null;
    const cajaPanel = panel.getBoundingClientRect();
    const estiloPanel = getComputedStyle(panel);
    // El borde interior: contra el borde de fuera se estaría metiendo el 1 px del
    // borde del panel en la cuenta de la sangría.
    const dentro = cajaPanel.left + parseFloat(estiloPanel.borderLeftWidth || "0");

    const de = (n) => {
        if (!n) return null;
        const r = n.getBoundingClientRect();
        const e = getComputedStyle(n);
        const relleno = parseFloat(e.paddingLeft || "0");
        return {
            desdeElPanel: Math.round((r.left - dentro) * 10) / 10,
            /** Donde arranca su contenido: su caja más su propio relleno. */
            sangrado: Math.round((r.left + relleno - dentro) * 10) / 10,
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            relleno,
            fondo: e.backgroundColor,
            borde: e.borderTopWidth,
            anillo: e.outlineStyle,
            sombra: e.boxShadow,
            peso: e.fontWeight,
            mayuscula: e.textTransform,
            letra: e.fontSize,
            redondeo: e.borderTopLeftRadius,
            texto: (n.textContent ?? "").trim(),
            title: n.getAttribute("title") ?? "",
            puesta: n.getAttribute("aria-selected") ?? "",
            // El chulito: un `svg` dentro de la fila. El punto de color de una
            // etapa es un `span`, así que no cuenta.
            glifos: n.querySelectorAll("svg").length,
        };
    };

    // Las filas: las de cmdk por su atributo, las de Etapas por ser botones de
    // la lista. Las dos formas existen igual en el «antes».
    const deCmdk = [...panel.querySelectorAll("[cmdk-item]")];
    const botones = [...panel.querySelectorAll('button[type="button"]')];
    const filas = deCmdk.length ? deCmdk : botones;

    // El rótulo: el de cmdk lo pinta él, el de Etapas es el primer `<p>`.
    const rotulo = panel.querySelector("[cmdk-group-heading]") ?? panel.querySelector("p");

    return {
        panel: {
            l: Math.round(cajaPanel.left * 10) / 10,
            w: Math.round(cajaPanel.width * 10) / 10,
            relleno: parseFloat(estiloPanel.paddingLeft || "0"),
            desborda: panel.scrollWidth > panel.clientWidth + 1,
        },
        rotulo: de(rotulo),
        filas: filas.map((f) => {
            const medida = de(f);
            // El primer hijo con caja: es «el contenido» de la fila, y tiene que
            // arrancar donde acaba su relleno. Un hueco de más ahí es una
            // sangría que la fila no declara.
            const hijos = [...f.children].filter((c) => c.getBoundingClientRect().width > 0);
            const primero = hijos[0] ?? null;
            // El nombre: el `span` que lleva uno de los nombres sembrados.
            let nombre = null;
            for (const n of f.querySelectorAll("span")) {
                const t = (n.textContent ?? "").trim();
                if (t && !/^\d+$/.test(t) && n.querySelectorAll("span").length === 0) {
                    nombre = n;
                    break;
                }
            }
            return {
                ...medida,
                contenido: primero ? Math.round((primero.getBoundingClientRect().left - dentro) * 10) / 10 : null,
                nombre: de(nombre),
            };
        }),
    };
}

async function abrir(page, cual) {
    const disparador = await page.evaluateHandle(elDisparadorQueSeVe, cual);
    const nodo = disparador.asElement();
    assert.ok(nodo, `no se ve el disparador de ${cual}`);
    await nodo.click();
    await page.waitForFunction(
        () => {
            const p = document.querySelector("[data-radix-popper-content-wrapper]");
            return Boolean(p && p.firstElementChild && p.firstElementChild.getBoundingClientRect().width > 0);
        },
        null,
        { timeout: 10000 },
    );
    // El menú de Etapas pide su lista al abrirlo: sin esperar a que llegue se
    // mediría el indicador de carga.
    await page.waitForFunction(
        () => {
            const p = document.querySelector("[data-radix-popper-content-wrapper]")?.firstElementChild;
            if (!p) return false;
            return p.querySelectorAll('[cmdk-item], button[type="button"]').length > 0;
        },
        null,
        { timeout: 10000 },
    );
}

async function cerrar(page) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-radix-popper-content-wrapper]"), null, {
        timeout: 10000,
    });
}

async function tomar(ancho) {
    const server = await levantar();
    const { port } = server.address();
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--font-render-hinting=none"],
    });
    try {
        const page = await navegador.newPage({
            viewport: { width: ancho, height: 900 },
            isMobile: ancho <= 430,
            hasTouch: ancho <= 430,
        });
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => window.listo === true, null, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        if (errores.length) throw new Error(`la maqueta reventó: ${errores[0]}`);

        if (ancho <= 430) {
            const desplegado = await page.evaluate(desplegarLasHerramientas);
            assert.ok(desplegado, `no se encontró cómo desplegar las herramientas del móvil a ${ancho}`);
            await page.waitForFunction(
                () =>
                    [...document.querySelectorAll('[role="combobox"]')].filter(
                        (n) => n.getBoundingClientRect().width > 0,
                    ).length === 2,
                null,
                { timeout: 10000 },
            );
        }
        const visibles = await page.evaluate(
            () =>
                [...document.querySelectorAll('[role="combobox"]')].filter(
                    (n) => n.getBoundingClientRect().width > 0,
                ).length,
        );
        assert.equal(visibles, 2, `se ven ${visibles} comboboxes en la cabecera y se esperaban 2 (${ancho})`);

        // Lejos de todo: con el cursor encima de una fila se mediría un `hover`.
        await page.mouse.move(2, 880);

        await abrir(page, "etiquetas");
        const etiquetas = await page.evaluate(medirElMenuAbierto);
        await cerrar(page);

        await page.mouse.move(2, 880);
        await abrir(page, "etapas");
        const etapas = await page.evaluate(medirElMenuAbierto);

        // Con el cursor ENCIMA de la fila puesta: su marca no se puede perder al
        // apuntarla.
        const puestaIdx = etapas.filas.findIndex((f) => f.texto.toLowerCase().includes("contactado"));
        assert.ok(puestaIdx >= 0, "no se encontró la fila puesta en el menú de Etapas");
        const apuntar = async (i) => {
            const h = await page.evaluateHandle(
                (n) => document.querySelectorAll(`[data-radix-popper-content-wrapper] button[type="button"]`)[n],
                i,
            );
            await h.asElement().hover();
            return page.evaluate(medirElMenuAbierto);
        };
        const puestaApuntada = await apuntar(puestaIdx);

        // Y con el cursor encima de OTRA: las dos no pueden verse iguales.
        const otraIdx = puestaIdx === 0 ? 1 : 0;
        const otraApuntada = await apuntar(otraIdx);

        if (errores.length) throw new Error(`la maqueta reventó: ${errores[0]}`);
        return { etiquetas, etapas, puestaApuntada, otraApuntada, puestaIdx, otraIdx };
    } finally {
        await navegador.close();
        server.close();
    }
}

const POR_ANCHURA = {};
for (const ancho of ANCHURAS) POR_ANCHURA[ancho] = await tomar(ancho);

test("los dos menús se abren y traen sus filas", () => {
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        assert.equal(etiquetas.filas.length, ETIQUETAS.length, `etiquetas a ${ancho}`);
        assert.equal(etapas.filas.length, ETAPAS.length, `etapas a ${ancho}`);
    }
});

test("la fila arranca en el MISMO píxel en los dos menús", () => {
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        const et = etiquetas.filas[0];
        const ep = etapas.filas[0];

        if (ROTO) {
            // La sangría de más: el `p-1` del grupo de cmdk, 4 px que el otro no
            // tiene.
            assert.equal(
                Math.round(et.contenido - ep.contenido),
                4,
                `el «antes» metía 4 px de más en Etiquetas (${ancho})`,
            );
            continue;
        }

        assert.equal(
            et.contenido,
            ep.contenido,
            `la fila arranca en sitios distintos a ${ancho}: etiquetas ${et.contenido}, etapas ${ep.contenido}`,
        );
        // Y arranca donde acaba su relleno: ni el grupo ni nadie mete un hueco
        // que la fila no declara.
        for (const [nombre, fila] of [
            ["etiquetas", et],
            ["etapas", ep],
        ]) {
            assert.equal(
                fila.contenido,
                Math.round((fila.desdeElPanel + fila.relleno) * 10) / 10,
                `${nombre} mete una sangría que su fila no declara (${ancho})`,
            );
        }
        // Todas las filas de un menú arrancan igual, no solo la primera: con
        // grupos, la segunda podría caer en otro.
        for (const [nombre, menu] of [
            ["etiquetas", etiquetas],
            ["etapas", etapas],
        ]) {
            for (const f of menu.filas) {
                assert.equal(f.contenido, menu.filas[0].contenido, `${nombre}: una fila desalineada (${ancho})`);
            }
        }
    }
});

test("el rótulo arranca donde arranca su fila, en los dos", () => {
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        assert.ok(etiquetas.rotulo, `falta el rótulo de Etiquetas a ${ancho}`);
        assert.ok(etapas.rotulo, `falta el rótulo de Etapas a ${ancho}`);
        if (ROTO) {
            // El de Etapas iba pegado al borde del panel y el de Etiquetas 8 px
            // más adentro, porque cmdk le pone su propio relleno al título.
            assert.notEqual(
                etiquetas.rotulo.sangrado,
                etapas.rotulo.sangrado,
                `el «antes» tenía los rótulos desalineados (${ancho})`,
            );
            continue;
        }
        assert.equal(
            etiquetas.rotulo.sangrado,
            etapas.rotulo.sangrado,
            `los rótulos no arrancan igual a ${ancho}: etiquetas ${etiquetas.rotulo.sangrado}, etapas ${etapas.rotulo.sangrado}`,
        );
        // Y el rótulo arranca donde arranca su fila: en los dos menús.
        for (const [nombre, menu] of [
            ["etiquetas", etiquetas],
            ["etapas", etapas],
        ]) {
            assert.equal(
                menu.rotulo.sangrado,
                menu.filas[0].contenido,
                `${nombre}: el rótulo y la fila no arrancan igual a ${ancho}` +
                    ` (rótulo ${menu.rotulo.sangrado}, fila ${menu.filas[0].contenido})`,
            );
        }
    }
});

test("los nombres van en MAYÚSCULA, y el guardado no se toca", () => {
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        for (const [nombre, menu, sembrados] of [
            ["etiquetas", etiquetas, ETIQUETAS],
            ["etapas", etapas, ETAPAS],
        ]) {
            for (const f of menu.filas) {
                assert.ok(f.nombre, `${nombre}: una fila sin nombre (${ancho})`);
                if (ROTO) {
                    assert.equal(
                        f.nombre.mayuscula,
                        "none",
                        `el «antes» no pintaba en mayúscula (${nombre}, ${ancho})`,
                    );
                    continue;
                }
                assert.equal(
                    f.nombre.mayuscula,
                    "uppercase",
                    `${nombre}: el nombre no va en mayúscula (${ancho})`,
                );
                // `text-transform` es CSS: el texto del DOM sigue siendo el de
                // verdad. Es lo que hace que cmdk siga filtrando y que el globo
                // enseñe el nombre tal cual se escribió.
                assert.ok(
                    sembrados.includes(f.nombre.texto),
                    `${nombre}: el nombre guardado se tocó («${f.nombre.texto}», ${ancho})`,
                );
                assert.equal(
                    f.nombre.title,
                    f.nombre.texto,
                    `${nombre}: el nombre en mayúscula sin su globo (${ancho})`,
                );
            }
        }
    }
});

test("el menú de Etapas no tiene chulito", () => {
    for (const ancho of ANCHURAS) {
        const { etapas } = POR_ANCHURA[ancho];
        for (const f of etapas.filas) {
            if (ROTO) {
                assert.equal(f.glifos, 1, `el «antes» tenía su chulito (${ancho})`);
                continue;
            }
            assert.equal(f.glifos, 0, `queda un icono en la fila de una etapa (${ancho})`);
        }
    }
});

test("la etapa puesta se marca con un gris suave, sin recuadro", () => {
    for (const ancho of ANCHURAS) {
        const { etapas, puestaIdx } = POR_ANCHURA[ancho];
        const puesta = etapas.filas[puestaIdx];
        const otras = etapas.filas.filter((_, i) => i !== puestaIdx);

        if (ROTO) {
            // El «antes» no marcaba con fondo: todas transparentes.
            assert.deepEqual(
                [...new Set(etapas.filas.map((f) => f.fondo))],
                ["rgba(0, 0, 0, 0)"],
                `el «antes» no marcaba lo puesto con fondo (${ancho})`,
            );
            continue;
        }

        assert.notEqual(puesta.fondo, "rgba(0, 0, 0, 0)", `la etapa puesta no tiene fondo (${ancho})`);
        for (const o of otras) {
            assert.notEqual(o.fondo, puesta.fondo, `una etapa sin poner sale igual que la puesta (${ancho})`);
        }
        // Un gris: los tres canales casi iguales, y claro (o oscuro en el tema
        // oscuro), no un color de marca.
        const [r, g, b] = puesta.fondo.match(/\d+/g).slice(0, 3).map(Number);
        assert.ok(
            Math.max(r, g, b) - Math.min(r, g, b) <= 12,
            `el fondo de lo puesto no es gris: ${puesta.fondo} (${ancho})`,
        );
        // Ni recuadro ni anillo ni sombra: se pidió solo el fondo.
        assert.equal(puesta.borde, "0px", `la etapa puesta lleva borde (${ancho})`);
        assert.ok(["none", ""].includes(puesta.sombra), `la etapa puesta lleva sombra (${ancho})`);
    }
});

test("el gris de lo puesto NO se pierde al apuntarlo", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const { etapas, puestaApuntada, puestaIdx } = POR_ANCHURA[ancho];
        assert.equal(
            puestaApuntada.filas[puestaIdx].fondo,
            etapas.filas[puestaIdx].fondo,
            `apuntar a la etapa puesta le cambia la marca (${ancho})`,
        );
    }
});

test("apuntando a otra fila, las dos NO se ven iguales", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const { otraApuntada, puestaIdx, otraIdx } = POR_ANCHURA[ancho];
        const puesta = otraApuntada.filas[puestaIdx];
        const apuntada = otraApuntada.filas[otraIdx];
        // `--muted` y `--accent` son el MISMO valor, así que el gris puede ser el
        // mismo: lo que tiene que distinguirlas es el peso.
        assert.notEqual(
            puesta.peso,
            apuntada.peso,
            `con el cursor en otra fila, la puesta no se distingue (${ancho})`,
        );
        assert.ok(Number(puesta.peso) > Number(apuntada.peso), `la puesta tiene que ser la más marcada (${ancho})`);
    }
});

test("las dos filas se ven iguales: misma caja, misma letra, mismo redondeo", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        const et = etiquetas.filas[0];
        const ep = etapas.filas[0];
        for (const campo of ["relleno", "letra", "redondeo", "h"]) {
            assert.equal(
                et[campo],
                ep[campo],
                `las filas de los dos menús difieren en ${campo} a ${ancho}: ${et[campo]} vs ${ep[campo]}`,
            );
        }
    }
});

test("ningún menú se desborda a lo ancho", () => {
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        assert.equal(etiquetas.panel.desborda, false, `el menú de Etiquetas se desborda a ${ancho}`);
        assert.equal(etapas.panel.desborda, false, `el menú de Etapas se desborda a ${ancho}`);
    }
});
