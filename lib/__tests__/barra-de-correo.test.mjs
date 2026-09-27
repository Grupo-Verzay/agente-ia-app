/**
 * La barra de arriba de CORREO es la de CHATS, pieza por pieza.
 *
 * Se pintan las dos cabeceras en la MISMA página y con la MISMA hoja del build
 * —Correo con su componente de verdad, Chats con sus componentes de verdad y
 * las mismas clases que `chat-sidebar`— y se comparan entre sí, no contra
 * números escritos a mano: el alto de la cabecera y de sus dos filas, el
 * buscador (alto, redondeo, letra, lupa y ANCHO), el filtro (tamaño, forma y
 * glifo, y que va FUERA del buscador), los iconos, el orden de la fila y las
 * pastillas repartidas de borde a borde.
 *
 * `MODO=roto` pinta la barra de un commit PINCHADO (antes del arreglo) y
 * afirma el fallo: la cabecera fuera de la columna, el buscador estirado y el
 * filtro metido dentro del buscador con otro tamaño.
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
    /* sin navegador se salta, y el banco se cae si no ejerce nada */
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const HARNESS = join(AQUI, ".compilado", "correo", ROTO ? "barra-antes.js" : "pantalla.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
const hay = Boolean(chromium && CSS && fs.existsSync(HARNESS));
if (!hay) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exitCode = 1;
}

const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 740]];

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

async function abrir(nav, puerto, ancho, alto) {
    const p = await nav.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.evaluate("window.__varios = true");
    await p.evaluate("window.maqueta()");
    await p.waitForSelector("[data-correo-fila]");
    await p.evaluate("window.maquetaChats()");
    await p.waitForSelector("#chats [data-selector-de-canal]", { state: "attached" });
    await p.waitForTimeout(250);
    assert.deepEqual(errores, [], `la pantalla no llegó a pintarse a ${ancho}`);
    return p;
}

/** Lo que se mide de las dos cabeceras. Corre en el navegador. */
function medir() {
    const FORMA = (el) => {
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
            alto: Math.round(r.height * 10) / 10,
            ancho: Math.round(r.width * 10) / 10,
            radio: c.borderTopLeftRadius,
            borde: c.borderTopWidth,
            colorBorde: c.borderTopColor,
            fondo: c.backgroundColor,
            letra: c.fontSize,
        };
    };
    const lado = (el) => {
        const r = el.getBoundingClientRect();
        return { izq: r.left, der: r.right, arriba: r.top, abajo: r.bottom };
    };
    const chats = document.getElementById("chats");
    const correo = document.querySelector("[data-correo]");
    const cabeceraDe = (raiz) => raiz.querySelector("[data-cabecera-de-la-columna]");
    const de = (raiz) => {
        const cab = cabeceraDe(raiz);
        const input = cab.querySelector("input");
        const filaArriba = input.closest("[data-fila-del-buscador]") ?? input.parentElement.parentElement.parentElement;
        const filtro = raiz === chats ? cab.querySelector("[data-embudo]") : cab.querySelector("[data-campo-de-busqueda]");
        const iconos = [...(filaArriba?.children ?? [])].slice(1).filter((n) => n.tagName === "BUTTON");
        const pastillas = [...cab.querySelectorAll("[data-pastilla-de-filtro]")];
        const filaPastillas = pastillas[0]?.parentElement;
        const lupa = input.parentElement.querySelector("svg");
        return {
            cabecera: FORMA(cab),
            filaArriba: filaArriba ? FORMA(filaArriba) : null,
            filaAbajo: filaPastillas?.closest("[data-fila-de-filtros]") ? FORMA(filaPastillas.closest("[data-fila-de-filtros]")) : null,
            buscador: FORMA(input),
            lupa: lupa ? lupa.getBoundingClientRect().width : 0,
            filtro: filtro ? { ...FORMA(filtro), glifo: filtro.querySelector("svg").getBoundingClientRect().width } : null,
            filtroDentroDelBuscador: Boolean(filtro && input.parentElement.contains(filtro)),
            iconos: iconos.map((b) => ({ ...FORMA(b), glifo: b.querySelector("svg")?.getBoundingClientRect().width ?? 0 })),
            orden: {
                selector: lado(cab.querySelector("[data-selector-de-canal]")),
                buscador: lado(input),
                filtro: filtro ? lado(filtro) : null,
                fila: filaArriba ? lado(filaArriba) : null,
            },
            pastillas: pastillas.map((b) => lado(b)),
            filaPastillas: filaPastillas ? lado(filaPastillas) : null,
            // Lo último de la fila: la flecha «⌄» en las dos, que es la de Chats.
            ultimo: filaPastillas?.lastElementChild ? { ...lado(filaPastillas.lastElementChild), flecha: filaPastillas.lastElementChild.hasAttribute("data-flecha-de-la-fila") } : null,
            cabeceraEnLaColumna: raiz === chats ? true : Boolean(cab.closest("[data-lista-de-correos]")),
        };
    };
    return {
        chats: de(chats),
        correo: de(correo),
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

const cerca = (a, b, t = 0.6) => Math.abs(a - b) <= t;

test(ROTO ? "ANTES: la barra de Correo NO era la de Chats" : "la barra de arriba de Correo es la de Chats, pieza por pieza", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto);
            const m = await p.evaluate(medir);
            const donde = `a ${ancho}`;
            const { chats: ch, correo: co } = m;

            if (ROTO) {
                // El fallo, tal como se reportó.
                assert.equal(co.cabeceraEnLaColumna, false, `${donde} la barra cruzaba la pantalla, fuera de la columna`);
                assert.equal(co.filtroDentroDelBuscador, true, `${donde} el filtro iba metido dentro del buscador`);
                assert.notEqual(co.filtro.glifo, ch.filtro.glifo, `${donde} el glifo del filtro no era el de Chats (${co.filtro.glifo} vs ${ch.filtro.glifo})`);
                assert.notDeepEqual(co.buscador, ch.buscador, `${donde} el buscador no era el de Chats`);
                if (ancho >= 768) assert.ok(co.buscador.ancho > ch.buscador.ancho + 20, `${donde} el buscador quedaba estirado (${co.buscador.ancho} vs ${ch.buscador.ancho})`);
                await p.close();
                continue;
            }

            // La cabecera va DENTRO de la columna, y mide lo que la de Chats.
            assert.equal(co.cabeceraEnLaColumna, true, `${donde} la cabecera de Correo va dentro de su columna`);
            assert.equal(co.cabecera.alto, ch.cabecera.alto, `${donde} la cabecera mide lo mismo (${co.cabecera.alto} vs ${ch.cabecera.alto})`);
            assert.equal(co.cabecera.borde, ch.cabecera.borde, `${donde} y la misma raya`);
            if (ancho >= 768) assert.ok(cerca(co.cabecera.ancho, ch.cabecera.ancho), `${donde} y el mismo ancho, el de la columna (${co.cabecera.ancho} vs ${ch.cabecera.ancho})`);
            assert.deepEqual(co.filaArriba && { alto: co.filaArriba.alto }, { alto: ch.filaArriba.alto }, `${donde} la fila de arriba mide lo mismo`);
            assert.deepEqual(co.filaAbajo && { alto: co.filaAbajo.alto }, { alto: ch.filaAbajo.alto }, `${donde} la fila de pastillas mide lo mismo`);

            // El buscador: el mismo en forma y, con la columna, en ancho.
            const sinAncho = ({ ancho: _a, ...r }) => r;
            assert.deepEqual(sinAncho(co.buscador), sinAncho(ch.buscador), `${donde} el buscador es el de Chats`);
            assert.equal(co.buscador.alto, 28, `${donde} el buscador mide 28 px`);
            assert.equal(co.lupa, ch.lupa, `${donde} la misma lupa`);
            if (ancho >= 768) assert.ok(cerca(co.buscador.ancho, ch.buscador.ancho, 1), `${donde} angosto como el de Chats (${co.buscador.ancho} vs ${ch.buscador.ancho})`);

            // El filtro: fuera del buscador, redondo y del tamaño del de Chats.
            assert.equal(co.filtroDentroDelBuscador, false, `${donde} el filtro va FUERA del buscador`);
            assert.deepEqual(co.filtro, ch.filtro, `${donde} el filtro es el embudo de Chats`);
            assert.deepEqual([co.filtro.alto, co.filtro.ancho, co.filtro.glifo], [28, 28, 14], `${donde} 28 × 28 con glifo de 14`);

            // Los iconos: los de Chats, y los mismos en número.
            assert.equal(co.iconos.length, ch.iconos.length, `${donde} los mismos iconos en la fila (${co.iconos.length} vs ${ch.iconos.length})`);
            const iconoDeChats = ch.iconos[1]; // el de asesores: el botón de icono de la barra
            for (const [i, ic] of co.iconos.slice(1).entries()) {
                assert.deepEqual(ic, iconoDeChats, `${donde} el icono ${i + 2} es el de Chats`);
            }

            // El orden y los huecos: selector, buscador, filtro, iconos.
            for (const lado of [co, ch]) {
                assert.ok(lado.orden.selector.der <= lado.orden.buscador.izq, `${donde} el selector va delante del buscador`);
                assert.ok(lado.orden.buscador.der <= lado.orden.filtro.izq, `${donde} el filtro va detrás del buscador`);
            }
            assert.ok(cerca(co.orden.filtro.izq - co.orden.buscador.der, ch.orden.filtro.izq - ch.orden.buscador.der), `${donde} el mismo hueco buscador → filtro`);
            assert.ok(cerca(co.orden.selector.izq - co.orden.fila.izq, ch.orden.selector.izq - ch.orden.fila.izq), `${donde} el selector arranca pegado al filo, como en Chats`);

            // Las pastillas: repartidas de borde a borde, como las de Chats.
            assert.ok(cerca(co.pastillas[0].izq, co.filaPastillas.izq), `${donde} la primera pastilla va pegada a la izquierda`);
            assert.ok(cerca(co.ultimo.der, co.filaPastillas.der), `${donde} lo último de la fila va pegado a la derecha`);
            assert.equal(co.ultimo.flecha, ch.ultimo.flecha, `${donde} la fila acaba igual que la de Chats`);
            assert.ok(cerca(co.filaPastillas.izq, co.orden.fila.izq) && cerca(co.filaPastillas.der, co.orden.fila.der), `${donde} la fila de pastillas mide lo que la de arriba`);

            assert.equal(m.desborda, false, `${donde} nada desborda`);
            await p.close();
        }
    });
});

// Sin navegador: que las dos cabeceras salgan de las MISMAS piezas. Con dos
// copias, el día que se afine una la otra se queda atrás.
test(ROTO ? "ANTES (barrido): Correo pintaba su propia barra" : "barrido: las dos cabeceras salen de las mismas piezas", () => {
    const { execFileSync } = require("node:child_process");
    const leer = (f) =>
        ROTO
            ? execFileSync("git", ["show", `${process.env.ANTES_REF || "50a1213"}:${f}`], { encoding: "utf8", cwd: RAIZ })
            : fs.readFileSync(join(RAIZ, f), "utf8");
    const correo = leer("app/(root)/correo/_components/CorreoClient.tsx");
    if (ROTO) {
        assert.match(correo, /<BarraDeAcciones/, "la barra de Correo era la de las listas, de lado a lado");
        assert.doesNotMatch(correo, /BuscadorDeLaColumna|FILA_1_DE_LA_COLUMNA/, "y no la de Chats");
        return;
    }
    const busca = leer("app/(root)/chats/_components/ChatSearchBar.tsx");
    const lateral = leer("app/(root)/chats/_components/chat-sidebar.tsx");
    const puente = leer("app/(root)/chats/_components/CachedSidebar.tsx");
    assert.doesNotMatch(correo, /<BarraDeAcciones/, "Correo ya no usa la barra de lado a lado");
    assert.match(correo, /<BuscadorDeLaColumna/, "Correo usa el buscador de Chats");
    assert.match(busca, /<BuscadorDeLaColumna/, "y Chats también, desde el mismo sitio");
    assert.doesNotMatch(busca, /<Input\b/, "sin su propia copia del buscador");
    for (const [nombre, f] of [["Correo", correo], ["Chats", lateral], ["el puente de Chats", puente]]) {
        for (const pieza of ["CABECERA_DE_LA_COLUMNA", "FILA_1_DE_LA_COLUMNA", "FILA_2_DE_LA_COLUMNA", "CABECERA_ESCRITORIO"]) {
            assert.match(f, new RegExp(`\\b${pieza}\\b`), `${nombre} usa ${pieza}`);
        }
    }
    assert.match(correo, /FILTRO_DE_LA_COLUMNA\b/, "el filtro de Correo es el embudo de Chats");
    assert.match(leer("app/(root)/chats/_components/TagFilterPanel.tsx"), /FILTRO_DE_LA_COLUMNA\b/);
    assert.match(correo, /BOTON_DE_LA_COLUMNA\b/, "los iconos de Correo son los de Chats");
    assert.match(leer("app/(root)/chats/_components/BotonesDeLaBarra.tsx"), /BOTON_DE_LA_COLUMNA\b/);
    assert.match(correo, /PASTILLAS_DE_LA_COLUMNA/, "las pastillas se reparten como las de Chats");
    assert.match(leer("app/(root)/chats/_components/ChatTabBar.tsx"), /PASTILLAS_DE_LA_COLUMNA/);
    // La caja de un icono es la común de las cabeceras (`CONTROL_DE_ICONO`).
    const lib = leer("lib/cabeceras-de-chats.ts");
    const control = /export const CONTROL_DE_ICONO = "([^"]+)"/.exec(lib)[1];
    for (const k of ["BOTON_DE_LA_COLUMNA", "FILTRO_DE_LA_COLUMNA"]) {
        const v = new RegExp(`export const ${k} =\\s*"([^"]+)"`).exec(lib)[1];
        assert.ok(v.includes(control), `${k} lleva la caja común (${control})`);
    }
});
