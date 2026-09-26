/**
 * Los BOTONES de la cabecera de la conversación y las FILAS de sus dos menús,
 * pintados por la `ChatHeader` REAL sobre el CSS del build, en Chromium.
 *
 * Esta mitad tiene que ser en navegador, y las dos cosas que mide lo explican:
 *
 *   1. **El hueco de más entre el último control y su vecino no estaba escrito
 *      en ninguna parte como una decisión**: era el `gap-3` de la fila —que está
 *      ahí para despegar el bloque del contacto— asomando por el único sitio
 *      donde la fila separa dos controles. Leyendo los dos `gap` no se ve cuál
 *      cae entre qué botones: se ve midiendo.
 *   2. **La sangría de la fila de Etiquetas la metía un elemento INVISIBLE**
 *      (`opacity-0` no libera sitio). El banco de las filas no la cazaba porque
 *      medía el primer HIJO de la fila —el envoltorio, que sí arrancaba donde
 *      toca— y no la primera cosa que SE VE. Aquí se mide el glifo.
 *
 * Y se monta la cabecera entera, no los controles sueltos: es ella la que
 * declara los huecos y la que le pasa el `panel` al menú de Etiquetas.
 *
 * `MODO=roto` pinta el MISMO arnés con los componentes de `ANTES_REF` y afirma
 * los dos fallos: 12 px entre el último control y la ficha, las etiquetas antes
 * de la etapa, y la marca de una etiqueta 24 px más adentro que la de una etapa.
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
const HARNESS = join(AQUI, ".compilado", "arnes-de-los-botones.js");
const CSS_FICHERO = process.env.CSS_DEL_BANCO;
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = CSS_FICHERO
    ? fs.readFileSync(CSS_FICHERO, "utf8")
    : fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n");

const { HUECO_ENTRE_CONTROLES } = await import(join(AQUI, ".compilado", "cabeceras-de-chats.js"));

/** Escritorio y un teléfono: las dos filas de controles de la cabecera. */
const ANCHURAS = [1440, 1280, 1024];
const MOVIL = 390;

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
                    // Un control EN MOVIMIENTO no está en ningún sitio.
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
 * Cómo se encuentra cada cosa, y SIN ninguna marca nueva en el DOM: el «antes»
 * no la tendría, así que el modo roto no encontraría lo que viene a medir y
 * pasaría sin ejercer nada. Todo sale de lo que ya hay.
 */

/** Los controles de la fila que se está viendo, de izquierda a derecha. */
function medirLosControles(deMovil) {
    /*
     * La fila de controles: la caja visible que lleva dentro los dos comboboxes
     * (etapa y etiquetas). En escritorio es la tira; en el móvil, la fila de
     * herramientas. `ChatHeader` pinta las dos, así que hay que quedarse con la
     * que SE VE, que es el error que ya costó una vuelta midiendo Macros.
     */
    const cajas = [...document.querySelectorAll("div")].filter(
        (n) =>
            n.getBoundingClientRect().width > 0 &&
            n.querySelectorAll('[role="combobox"]').length === 2 &&
            [...n.querySelectorAll('[role="combobox"]')].every((c) => c.getBoundingClientRect().width > 0),
    );
    // La más interior: la que no contiene otra que cumpla lo mismo.
    const fila = cajas.filter((n) => !cajas.some((o) => o !== n && n.contains(o)))[0];
    if (!fila) return { error: "no se encontró la fila de controles" };

    const nombreDe = (n) =>
        n.getAttribute("aria-label") || (n.getAttribute("title") ?? "").slice(0, 32) || "(sin nombre)";

    /*
     * Los controles de la fila: los de la tira MÁS la ficha de contacto, que en
     * escritorio va FUERA de la tira que se desplaza a propósito (ver
     * `ChatHeader`). Se busca por su globo y no por la caja que la envuelve,
     * porque esa caja es lo que este arreglo añadió: mirando al padre de la tira,
     * el «antes» devolvería la fila entera con el bloque del contacto dentro y se
     * estaría midiendo su hueco flexible en vez de los huecos de los controles.
     * En un móvil la ficha vive en la segunda fila y no es parte de esta.
     */
    const laFicha = deMovil
        ? null
        : [...document.querySelectorAll("button")].find(
              (n) => /ficha del contacto/i.test(n.getAttribute("title") ?? "") && n.getBoundingClientRect().width > 0,
          );
    const candidatos = [...fila.querySelectorAll('button,[role="combobox"]')];
    if (laFicha && !candidatos.includes(laFicha)) candidatos.push(laFicha);

    const controles = candidatos
        .filter((n) => n.getBoundingClientRect().width > 0)
        .filter((n) => !n.closest("[data-radix-popper-content-wrapper]"))
        // Un control es una hoja: los envoltorios pulsables que contienen otro
        // botón no cuentan dos veces.
        .filter((n) => n.querySelectorAll('button,[role="combobox"]').length === 0)
        .map((n) => {
            const r = n.getBoundingClientRect();
            const esCombobox = n.getAttribute("role") === "combobox";
            const esEtapa = n.getAttribute("aria-label") === "Etapa del embudo";
            return {
                nombre: nombreDe(n),
                /* El disparador de Etiquetas no tiene ni `aria-label` ni `title`,
                   así que se reconoce por lo que ES —un combobox que no es el de
                   la etapa— y no por cómo se llama. Vale igual en el «antes». */
                cual: esEtapa ? "etapa" : esCombobox ? "etiquetas" : null,
                l: Math.round(r.left * 10) / 10,
                r: Math.round(r.right * 10) / 10,
                w: Math.round(r.width * 10) / 10,
                h: Math.round(r.height * 10) / 10,
            };
        })
        .sort((a, b) => a.l - b.l);

    const huecos = [];
    for (let i = 1; i < controles.length; i++) {
        huecos.push({
            entre: `${controles[i - 1].nombre} → ${controles[i].nombre}`,
            hueco: Math.round((controles[i].l - controles[i - 1].r) * 10) / 10,
        });
    }
    // La caja donde tienen que caber: la tira, o hasta la ficha si la hay.
    const caja = fila.getBoundingClientRect();
    const tope = laFicha ? Math.max(caja.right, laFicha.getBoundingClientRect().right) : caja.right;
    return {
        controles,
        huecos,
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        dentro: controles.every((c) => c.l >= -0.5 && c.r <= tope + 0.5),
    };
}

/** El disparador VISIBLE de uno de los dos menús. */
function elDisparadorQueSeVe(cual) {
    const visibles = [...document.querySelectorAll('[role="combobox"]')].filter(
        (n) => n.getBoundingClientRect().width > 0,
    );
    const esEtapas = (n) => n.getAttribute("aria-label") === "Etapa del embudo";
    return cual === "etapas" ? visibles.find(esEtapas) : visibles.find((n) => !esEtapas(n));
}

/** En un móvil los dos mandos viven detrás de la pastilla de las herramientas. */
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

/**
 * Lo que se mide de un menú abierto: dónde arranca lo que SE VE de cada fila
 * —la marca de color— y dónde arranca su nombre. Medir la caja de la fila o su
 * primer hijo es lo que dejó pasar la sangría del chulito invisible.
 */
function medirElMenuAbierto() {
    const panel = document.querySelector("[data-radix-popper-content-wrapper]")?.firstElementChild;
    if (!panel) return null;
    const caja = panel.getBoundingClientRect();
    const dentro = caja.left + parseFloat(getComputedStyle(panel).borderLeftWidth || "0");
    const deCmdk = [...panel.querySelectorAll("[cmdk-item]")];
    const botones = [...panel.querySelectorAll('button[type="button"]')];
    const filas = deCmdk.length ? deCmdk : botones;

    const desde = (r) => Math.round((r.left - dentro) * 10) / 10;

    return {
        filas: filas.map((f) => {
            const e = getComputedStyle(f);
            /*
             * La primera cosa VISIBLE de la fila, sea un `span` o un `svg`: eso es
             * «donde arranca la fila» para quien la mira. Un `opacity-0` no
             * cuenta como visible aunque ocupe su hueco — que es exactamente el
             * fallo.
             */
            const visibles = [...f.querySelectorAll("*")].filter((n) => {
                const r = n.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return false;
                if (parseFloat(getComputedStyle(n).opacity || "1") === 0) return false;
                // Los hijos de un `svg` (paths) no son la marca.
                return !n.closest("svg") || n.tagName === "svg";
            });
            // Ni los envoltorios: la hoja más a la izquierda que no contenga otra.
            const hojas = visibles.filter((n) => !visibles.some((o) => o !== n && n.contains(o)));
            hojas.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            const marca = hojas[0] ?? null;
            const cajaMarca = marca?.getBoundingClientRect();

            // El nombre: el `span` con el texto de la fila.
            let nombre = null;
            for (const n of f.querySelectorAll("span")) {
                const t = (n.textContent ?? "").trim();
                if (t && !/^\d+$/.test(t) && n.querySelectorAll("span").length === 0) {
                    nombre = n;
                    break;
                }
            }
            const cajaNombre = nombre?.getBoundingClientRect();

            // El chulito, si lo hay, y de qué lado del nombre cae.
            const chulito = f.querySelector("svg");
            const cajaChulito = chulito?.getBoundingClientRect();

            return {
                texto: (f.textContent ?? "").trim().slice(0, 40),
                marcaL: cajaMarca ? desde(cajaMarca) : null,
                marcaW: cajaMarca ? Math.round(cajaMarca.width * 10) / 10 : null,
                marcaH: cajaMarca ? Math.round(cajaMarca.height * 10) / 10 : null,
                nombreL: cajaNombre ? desde(cajaNombre) : null,
                chulitoL: cajaChulito ? desde(cajaChulito) : null,
                fondo: e.backgroundColor,
                peso: e.fontWeight,
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
            const p = document.querySelector("[data-radix-popper-content-wrapper]")?.firstElementChild;
            return Boolean(p && p.querySelectorAll('[cmdk-item], button[type="button"]').length > 0);
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
        const deMovil = ancho <= 430;
        const page = await navegador.newPage({
            viewport: { width: ancho, height: 900 },
            isMobile: deMovil,
            hasTouch: deMovil,
        });
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => window.listo === true, null, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        if (errores.length) throw new Error(`la maqueta reventó: ${errores[0]}`);

        if (deMovil) {
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

        // Lejos de todo: con el cursor encima se mediría un `hover`.
        await page.mouse.move(2, 880);
        const fila = await page.evaluate(medirLosControles, deMovil);
        assert.ok(!fila.error, `${fila.error} (${ancho})`);

        let etiquetas = null;
        let etapas = null;
        if (!deMovil) {
            await abrir(page, "etiquetas");
            etiquetas = await page.evaluate(medirElMenuAbierto);
            await cerrar(page);
            await page.mouse.move(2, 880);
            await abrir(page, "etapas");
            etapas = await page.evaluate(medirElMenuAbierto);
            await cerrar(page);
        }

        if (errores.length) throw new Error(`la maqueta reventó: ${errores[0]}`);
        return { fila, etiquetas, etapas };
    } finally {
        await navegador.close();
        server.close();
    }
}

const POR_ANCHURA = {};
for (const ancho of [...ANCHURAS, MOVIL]) POR_ANCHURA[ancho] = await tomar(ancho);

test("todos los controles de la fila, a la MISMA separación", () => {
    for (const ancho of [...ANCHURAS, MOVIL]) {
        const { fila } = POR_ANCHURA[ancho];
        assert.ok(fila.huecos.length >= 5, `se midieron ${fila.huecos.length} huecos a ${ancho}`);

        if (ROTO) {
            // El «antes»: el último control quedaba a 12 px de su vecino (el
            // `gap-3` de la fila) y los demás a 6. En el móvil, `justify-between`
            // repartía el sobrante y los ensanchaba todos por igual.
            const distintos = [...new Set(fila.huecos.map((h) => h.hueco))];
            if (ancho === MOVIL) {
                /*
                 * `justify-between` reparte el sobrante ENTRE los huecos, así que
                 * ninguno mide lo que declara el `gap` y no todos miden lo mismo:
                 * medido, 6,7 y 6,6 px en la misma fila. Con el sobrante justo
                 * son fracciones de píxel; con menos controles, huecos abiertos.
                 */
                assert.ok(
                    distintos.length > 1 || distintos[0] !== HUECO_ENTRE_CONTROLES,
                    `el «antes» del móvil repartía el sobrante entre los huecos: ${distintos.join(", ")}`,
                );
            } else {
                // El último —la ficha— quedaba al doble: el `gap-3` de la fila.
                // Los demás, a 6.
                assert.equal(
                    fila.huecos[fila.huecos.length - 1].hueco,
                    2 * HUECO_ENTRE_CONTROLES,
                    `el «antes» dejaba el último control a ${2 * HUECO_ENTRE_CONTROLES} px a ${ancho}`,
                );
                for (const h of fila.huecos.slice(0, -1)) {
                    assert.equal(h.hueco, HUECO_ENTRE_CONTROLES, `el «antes» ya tenía 6 px entre ${h.entre}`);
                }
                assert.equal(distintos.length, 2, `el «antes» tenía dos huecos distintos a ${ancho}`);
            }
            continue;
        }

        for (const h of fila.huecos) {
            assert.equal(
                h.hueco,
                HUECO_ENTRE_CONTROLES,
                `un hueco de ${h.hueco} px entre ${h.entre} a ${ancho}` +
                    ` (se esperaban ${HUECO_ENTRE_CONTROLES}): ${fila.huecos.map((x) => x.hueco).join("/")}`,
            );
        }
    }
});

test("la etapa va ANTES de las etiquetas en la fila", () => {
    for (const ancho of [...ANCHURAS, MOVIL]) {
        const { fila } = POR_ANCHURA[ancho];
        const etapa = fila.controles.findIndex((c) => c.cual === "etapa");
        const etiqueta = fila.controles.findIndex((c) => c.cual === "etiquetas");
        assert.ok(etapa >= 0, `no se encontró el control de la etapa a ${ancho}`);
        assert.ok(etiqueta >= 0, `no se encontró el control de las etiquetas a ${ancho}`);
        if (ROTO) {
            assert.ok(etiqueta < etapa, `el «antes» ponía las etiquetas antes de la etapa (${ancho})`);
            continue;
        }
        assert.ok(etapa < etiqueta, `la etapa sale después de las etiquetas a ${ancho}`);
    }
});

test("la ficha de contacto sigue siendo el último control, y dentro de su caja", () => {
    for (const ancho of ANCHURAS) {
        const { fila } = POR_ANCHURA[ancho];
        const ultimo = fila.controles[fila.controles.length - 1];
        assert.match(ultimo.nombre, /ficha del contacto/i, `el último control a ${ancho} es «${ultimo.nombre}»`);
        assert.ok(fila.dentro, `un control se sale de su caja a ${ancho}`);
        assert.ok(!fila.desborda, `la página se desplaza a lo ancho a ${ancho}`);
    }
});

test("la fila de los dos menús arranca en el MISMO píxel, y el nombre también", () => {
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        const et = etiquetas.filas[0];
        const ep = etapas.filas[0];

        if (ROTO) {
            // El chulito invisible: 16 px de glifo más su `gap-2`.
            assert.equal(
                Math.round(et.marcaL - ep.marcaL),
                24,
                `el «antes» metía 24 px de más antes de la marca de una etiqueta (${ancho})`,
            );
            assert.notEqual(et.nombreL, ep.nombreL, `el «antes» tenía los nombres sin alinear (${ancho})`);
            continue;
        }

        assert.equal(
            et.marcaL,
            ep.marcaL,
            `la marca arranca en sitios distintos a ${ancho}: etiquetas ${et.marcaL}, etapas ${ep.marcaL}`,
        );
        assert.equal(
            et.nombreL,
            ep.nombreL,
            `el nombre arranca en sitios distintos a ${ancho}: etiquetas ${et.nombreL}, etapas ${ep.nombreL}`,
        );
        // Y la marca es la misma caja en los dos: con tamaños distintos los
        // nombres no podrían caer en el mismo píxel.
        assert.equal(et.marcaW, ep.marcaW, `la marca mide distinto a lo ancho a ${ancho}`);
        assert.equal(et.marcaH, ep.marcaH, `la marca mide distinto a lo alto a ${ancho}`);

        // Todas las filas de un menú arrancan igual, no solo la primera.
        for (const [nombre, menu] of [
            ["etiquetas", etiquetas],
            ["etapas", etapas],
        ]) {
            for (const f of menu.filas) {
                assert.equal(f.marcaL, menu.filas[0].marcaL, `${nombre}: una fila desalineada (${ancho})`);
                assert.equal(f.nombreL, menu.filas[0].nombreL, `${nombre}: un nombre desalineado (${ancho})`);
            }
        }
    }
});

test("el chulito de una etiqueta va DESPUÉS del nombre", () => {
    if (ROTO) {
        for (const ancho of ANCHURAS) {
            const { etiquetas } = POR_ANCHURA[ancho];
            const f = etiquetas.filas[0];
            assert.ok(f.chulitoL < f.nombreL, `el «antes» tenía el chulito delante del nombre (${ancho})`);
        }
        return;
    }
    for (const ancho of ANCHURAS) {
        const { etiquetas } = POR_ANCHURA[ancho];
        for (const f of etiquetas.filas) {
            assert.ok(f.chulitoL !== null, `una fila de Etiquetas sin chulito (${ancho})`);
            assert.ok(
                f.chulitoL > f.nombreL,
                `el chulito sigue delante del nombre a ${ancho} (${f.chulitoL} vs ${f.nombreL})`,
            );
        }
    }
});

test("lo PUESTO se marca igual en los dos menús", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const { etiquetas, etapas } = POR_ANCHURA[ancho];
        // La sembrada en los dos casos es la SEGUNDA.
        const puestas = [etiquetas.filas[1], etapas.filas[1]];
        assert.equal(
            puestas[0].fondo,
            puestas[1].fondo,
            `lo puesto se marca con fondos distintos a ${ancho}`,
        );
        assert.equal(puestas[0].peso, puestas[1].peso, `lo puesto se marca con pesos distintos a ${ancho}`);
        // Y el peso es lo que la distingue de una sin poner: `--muted` y
        // `--accent` son el MISMO valor, así que el gris puede repetirse.
        for (const [nombre, menu] of [
            ["etiquetas", etiquetas],
            ["etapas", etapas],
        ]) {
            assert.notEqual(
                menu.filas[1].peso,
                menu.filas[2].peso,
                `${nombre}: la puesta y una sin poner tienen el mismo peso (${ancho})`,
            );
        }
    }
});
