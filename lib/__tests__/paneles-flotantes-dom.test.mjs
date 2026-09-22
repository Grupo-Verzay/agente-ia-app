/**
 * Cada panel flotante, pintado por Radix de verdad, DENTRO de su contenedor.
 *
 * # Por qué esto se mide en un navegador
 *
 * La decisión es pura y la prueba `paneles-flotantes.test.mjs` sin levantar
 * nada. Lo que ese banco **no** puede contestar es si Radix hace con esos
 * números lo que se espera: `alignOffset` entra en Floating UI como
 * `offset({ alignmentAxis })` y ahí el signo depende de la alineación, `shift`
 * no mueve en horizontal (`crossAxis: false`), y `flip` puede voltear el panel
 * arriba del disparador. Escribir un signo al revés no da ningún error — deja
 * el panel al otro lado y del doble de lejos—, así que la única forma de
 * saberlo es abrirlo y medir dónde cayó.
 *
 * Se monta el hook y las primitivas **de verdad** (`usePanelFlotante`,
 * `components/ui/popover`, `components/ui/dropdown-menu`) dentro de una maqueta
 * con la misma forma que Chats —carril de iconos, columna con su fila de
 * pastillas, área de conversación con su cabecera, y la barra de arriba—, sobre
 * el CSS del build.
 *
 * # Los dos modos
 *
 * `MODO=roto` pinta los mismos paneles con la colocación que tenían en
 * `origin/main` —sacada de ahí con `git show`, no escrita aquí— y **afirma el
 * fallo**: el de etiquetas se monta sobre la conversación, el de asignar asesor
 * abre hacia arriba, y los de la cabecera no nacen a la misma altura.
 *
 * Se levanta con `scripts/banco-paneles-flotantes.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-paneles.js");

/** El CSS del build: medir con otra hoja es medir un panel que nadie ve. */
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

/**
 * Las cuatro anchuras del encargo, con lo que mide la columna en cada una.
 *
 * A 390 no hay carril de iconos y la columna ocupa la pantalla entera, que es
 * el caso que ninguna cuenta a partir de `--ancho-lateral` describe.
 */
const ANCHURAS = [
    { ventana: 1440, carril: 48, columna: 384, movil: false },
    { ventana: 1280, carril: 48, columna: 384, movil: false },
    { ventana: 1024, carril: 48, columna: 352, movil: false },
    { ventana: 390, carril: 0, columna: 390, movil: true },
];

/** Los paneles, por clase, con el id de su disparador en la maqueta. */
const DE_LA_COLUMNA_ANCHA = ["canales", "asesor", "fechas", "etiquetas", "mas"];
const DE_LA_FILA = ["filaMas", "temperatura", "filaAsesor"];
const DE_LA_CABECERA = ["hAsesor", "hRegistros", "hCita", "hEtiquetas", "hMacros", "hAcciones"];

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    // Sin esto, la emulación de móvil de Playwright monta un
                    // viewport de maqueta de 980px y lo escala: a 390 la página
                    // medía 2120 de alto y lo que se estaba midiendo no era una
                    // pantalla de teléfono. La App de verdad lo lleva.
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""}</style>` +
                    `<style>html,body{margin:0;height:100%;overflow:hidden}</style>` +
                    // Las animaciones de Radix (`zoom-in-95`, `slide-in-from-top-2`)
                    // **mueven y encogen el panel mientras juegan**: medido a
                    // media animación, un panel de 384 salía de 381 y su borde
                    // de arriba dos píxeles más alto. Un panel en movimiento no
                    // está en ningún sitio; se miden quietos.
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `</head><body><div id="app"></div>` +
                    `<script type="module" src="/harness-paneles.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-paneles.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrirNavegador({ ventana, carril, columna, movil }) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const contexto = await navegador.newContext({
        viewport: { width: ventana, height: movil ? 844 : 900 },
        hasTouch: movil,
        isMobile: movil,
    });
    const page = await contexto.newPage();
    // El arnés lee el modo de la URL: es lo único que cruza al navegador.
    await page.goto(base + (ROTO ? "/?modo=roto" : "/"), { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate((m) => window.maqueta(m), { carril, columna });
    await page.waitForTimeout(80);
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/**
 * Abre un panel y devuelve su rectángulo y el de su contenedor.
 *
 * Se espera al nodo del portal —Radix lo monta fuera del árbol— y a que su
 * `transform` esté puesto: medir antes da la esquina superior izquierda de la
 * ventana y todas las comprobaciones saldrían verdes por el motivo equivocado.
 */
async function abrirPanel(page, id) {
    await page.click(`#${id}`);
    await page.waitForSelector("[data-panel-del-banco]", { timeout: 5000 });
    await page.waitForFunction(
        () => {
            const p = document.querySelector("[data-panel-del-banco]");
            if (!p) return false;
            const caja = p.getBoundingClientRect();
            return caja.width > 0 && caja.height > 0;
        },
        { timeout: 5000 },
    );
    await page.waitForTimeout(60);
    const medida = await page.evaluate(() => {
        const r = (n) => {
            const c = n.getBoundingClientRect();
            return {
                left: Math.round(c.left),
                right: Math.round(c.right),
                top: Math.round(c.top),
                bottom: Math.round(c.bottom),
                ancho: Math.round(c.width),
                alto: Math.round(c.height),
            };
        };
        const p = document.querySelector("[data-panel-del-banco]");
        const conten = p.getAttribute("data-contenedor");
        return {
            panel: r(p),
            contenedor: r(document.querySelector(`[${conten}]`)),
            pastillas: r(document.querySelector("[data-pastillas-de-chats]")),
            // El alto que Radix le deja de verdad, que es lo que hace que un
            // panel que no cabe se desplace por dentro en vez de desbordarse.
            seDesplaza: getComputedStyle(p).overflowY,
            desbordaDentro: p.scrollHeight > p.clientHeight + 1,
        };
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(60);
    return medida;
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Los paneles de la columna que ocupan su ancho entero
// ─────────────────────────────────────────────────────────────────────────────

for (const medida of ANCHURAS) {
    test(`a ${medida.ventana}: los cinco paneles anchos miden LO MISMO y nacen bajo las pastillas`, async (t) => {
        if (faltaNavegador(t)) return;
        const { page, cerrar } = await abrirNavegador(medida);
        try {
            const medidos = [];
            for (const id of DE_LA_COLUMNA_ANCHA) {
                const m = await abrirPanel(page, id);
                medidos.push({ id, ...m });
                t.diagnostic(
                    `${medida.ventana} · ${id}: ${m.panel.left}→${m.panel.right} (${m.panel.ancho}px), arriba en ${m.panel.top}`,
                );
            }
            const nacen = new Set(medidos.map((m) => m.panel.top));

            if (ROTO) {
                // EL ANTES: cada uno traía su `align` escrito a mano, así que
                // ni medían la columna ni nacían a la misma altura.
                //
                // Lo de «se salía» es cierto en escritorio y **no** en un
                // móvil, y eso no se disimula: ahí la columna ocupa la pantalla
                // entera, así que el `avoidCollisions` de Radix los metía
                // dentro de la ventana —que es la misma caja— y no se salían.
                // Lo que sí falla en las cuatro anchuras es que tapaban las
                // pastillas y que ninguno medía la columna, que es el encargo.
                const seSalen = medidos.filter(
                    (m) => m.panel.left < m.contenedor.left - 1 || m.panel.right > m.contenedor.right + 1,
                );
                const tapan = medidos.filter((m) => m.panel.top < m.pastillas.bottom);
                const anchos = new Set(medidos.map((m) => m.panel.ancho));
                t.diagnostic(
                    `origin/main a ${medida.ventana}: se salían ${seSalen.length} de ${medidos.length}, ` +
                        `tapaban las pastillas ${tapan.length}, midieron ${[...anchos].sort((a, b) => a - b).join("/")}, ` +
                        `y nacían a ${[...nacen].sort((a, b) => a - b).join("/")}`,
                );
                assert.ok(tapan.length > 0, "el «antes» tenía que tapar la fila de pastillas");
                // Cada uno traía su `w-*` escrito a mano, así que **saltaban de
                // tamaño al abrir uno u otro**, que es lo que se reportó.
                assert.ok(anchos.size > 1, `y no medían lo mismo; salieron ${[...anchos]}`);
                assert.ok(nacen.size > 1, "ni nacían a la misma altura");
                if (!medida.movil) {
                    assert.ok(
                        seSalen.length > 0,
                        `en escritorio además se salían de la columna; salieron ${JSON.stringify(
                            medidos.map((m) => [m.id, m.panel.left, m.panel.right]),
                        )}`,
                    );
                }
                return;
            }

            for (const { id, panel, contenedor, pastillas, seDesplaza } of medidos) {
                assert.ok(
                    panel.left >= contenedor.left - 1,
                    `${id} se sale por la izquierda de la columna (${panel.left} < ${contenedor.left})`,
                );
                assert.ok(
                    panel.right <= contenedor.right + 1,
                    `${id} se monta sobre la conversación (${panel.right} > ${contenedor.right})`,
                );
                assert.ok(
                    panel.ancho <= contenedor.ancho + 1,
                    `${id} no puede ser más ancho que la columna (${panel.ancho} vs ${contenedor.ancho})`,
                );
                assert.ok(
                    panel.top >= pastillas.bottom,
                    `${id} tapa la fila de pastillas (${panel.top} < ${pastillas.bottom})`,
                );
                assert.equal(seDesplaza, "auto", `${id} tiene que desplazarse por dentro, no recortar`);
            }

            assert.equal(
                nacen.size,
                1,
                `los cinco tienen que nacer a la misma altura; salieron ${[...nacen].sort()}`,
            );

            // Lo que se pidió: que no SALTEN de tamaño al abrir uno u otro. Un
            // píxel de margen porque el redondeo de la maquetación es suyo.
            const anchos = medidos.map((m) => m.panel.ancho);
            assert.ok(
                Math.max(...anchos) - Math.min(...anchos) <= 1,
                `los cinco tienen que medir lo mismo; salieron ${anchos.join("/")}`,
            );
        } finally {
            await cerrar();
        }
    });
}

test("EL ANTES: el panel de etiquetas de origin/main se montaba sobre la conversación", async (t) => {
    if (faltaNavegador(t)) return;
    if (!ROTO) {
        t.skip("el «antes» solo se afirma en MODO=roto");
        return;
    }
    // A 1024 la columna mide 352 y ese panel pedía `w-72` (288) con
    // `align="end"`: su filo derecho caía en el del disparador, que vive metido
    // hacia dentro, así que el izquierdo se salía... y a 390, entero.
    const { page, cerrar } = await abrirNavegador(ANCHURAS[3]);
    try {
        const { panel, contenedor, pastillas } = await abrirPanel(page, "etiquetas");
        t.diagnostic(`origin/main · etiquetas a 390: ${panel.left}→${panel.right}, columna ${contenedor.left}→${contenedor.right}`);
        const seSale = panel.left < contenedor.left - 1 || panel.right > contenedor.right + 1;
        const tapa = panel.top < pastillas.bottom;
        assert.ok(
            seSale || tapa,
            "el «antes» tenía que salirse de la columna o tapar las pastillas; si no, esta medida no ejerce nada",
        );
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Los paneles de UNA fila
// ─────────────────────────────────────────────────────────────────────────────

for (const medida of ANCHURAS) {
    test(`a ${medida.ventana}: los paneles de una fila quedan dentro de la columna`, async (t) => {
        if (faltaNavegador(t)) return;
        const { page, cerrar } = await abrirNavegador(medida);
        try {
            const medidos = [];
            for (const id of DE_LA_FILA) {
                const m = await abrirPanel(page, id);
                medidos.push({ id, ...m });
                t.diagnostic(`${medida.ventana} · ${id}: ${m.panel.left}→${m.panel.right} (${m.panel.ancho}px)`);
            }

            if (ROTO) {
                // EL ANTES: nacían donde cayera su disparador y no al filo de la
                // columna, así que en escritorio se montaban sobre la
                // conversación. En un móvil no llegaban a salirse —la columna
                // ES la ventana y Radix los metía dentro— pero seguían sin
                // pegarse al filo, que es lo que el encargo pide y lo que se
                // afirma en las cuatro anchuras.
                const seSalen = medidos.filter((m) => m.panel.right > m.contenedor.right + 1);
                const alFilo = medidos.filter((m) => Math.abs(m.panel.right - m.contenedor.right) <= 1);
                t.diagnostic(
                    `origin/main a ${medida.ventana}: se salían ${seSalen.length}, al filo ${alFilo.length} ` +
                        `de ${medidos.length} — ${JSON.stringify(medidos.map((m) => [m.id, m.panel.right]))}`,
                );
                // En un móvil uno de los tres cae al filo **por casualidad**:
                // el `collisionPadding` de Radix lo empuja contra el borde de
                // la ventana, que ahí coincide con el de la columna. Así que lo
                // que se afirma es que no lo hacían los tres — que es lo que
                // separa acertar de que te empujen.
                assert.ok(
                    alFilo.length < medidos.length,
                    `el «antes» no podía pegar los tres al filo; salieron ${JSON.stringify(
                        medidos.map((m) => [m.id, m.panel.right, m.contenedor.right]),
                    )}`,
                );
                if (!medida.movil) {
                    assert.equal(alFilo.length, 0, "en escritorio ninguno llegaba al filo");
                    assert.ok(seSalen.length > 0, "y se montaban sobre la conversación");
                }
                return;
            }

            for (const { id, panel, contenedor, seDesplaza } of medidos) {
                assert.ok(
                    panel.left >= contenedor.left - 1,
                    `${id} se sale por la izquierda (${panel.left} < ${contenedor.left})`,
                );
                assert.ok(
                    panel.right <= contenedor.right + 1,
                    `${id} se monta sobre la conversación (${panel.right} > ${contenedor.right})`,
                );
                assert.equal(seDesplaza, "auto", `${id} tiene que desplazarse por dentro`);
            }
        } finally {
            await cerrar();
        }
    });
}

test("una fila ABAJO del todo abre su panel hacia arriba, no por el borde", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrirNavegador(ANCHURAS[0]);
    try {
        // La maqueta pone un segundo disparador pegado al borde de abajo.
        const { panel } = await abrirPanel(page, "filaAbajo");
        const alto = await page.evaluate(() => document.documentElement.clientHeight);
        t.diagnostic(`fila de abajo: el panel va de ${panel.top} a ${panel.bottom}, ventana ${alto}`);

        // Aquí el «antes» NO fallaba: `AdvisorAssignBadge` ya abría con
        // `side="top"` por su propia regla del #… — se dice en vez de fingir un
        // rojo que no existe. Lo que esta medida protege es que unificar la
        // colocación no se llevara por delante ese acierto.
        assert.ok(panel.bottom <= alto, `el panel se sale por abajo (${panel.bottom} > ${alto})`);
        assert.ok(panel.top >= 0, `y tampoco por arriba (${panel.top})`);
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La cabecera de la conversación
// ─────────────────────────────────────────────────────────────────────────────

for (const medida of ANCHURAS) {
    test(`a ${medida.ventana}: los seis de la cabecera nacen a la misma altura y al filo derecho`, async (t) => {
        if (faltaNavegador(t)) return;
        if (medida.movil) {
            // En un móvil la conversación no convive con la lista: se abre
            // encima. La maqueta la pinta igual, pero la pregunta del encargo
            // —«no se monta sobre la columna»— no aplica ahí.
            t.skip("en un móvil la conversación ocupa la pantalla entera");
            return;
        }
        const { page, cerrar } = await abrirNavegador(medida);
        try {
            const nacen = new Set();
            for (const id of DE_LA_CABECERA) {
                const { panel, contenedor } = await abrirPanel(page, id);
                t.diagnostic(
                    `${medida.ventana} · ${id}: ${panel.left}→${panel.right}, arriba en ${panel.top}`,
                );

                if (ROTO) {
                    nacen.add(panel.top);
                    continue;
                }

                assert.ok(
                    panel.right <= contenedor.right + 1,
                    `${id} se corta por el borde derecho (${panel.right} > ${contenedor.right})`,
                );
                assert.ok(
                    panel.left >= contenedor.left - 1,
                    `${id} invade la columna de la lista (${panel.left} < ${contenedor.left})`,
                );
                assert.ok(
                    panel.top >= contenedor.bottom,
                    `${id} tapa la fila de Macros y Acciones (${panel.top} < ${contenedor.bottom})`,
                );
                nacen.add(panel.top);
            }

            if (ROTO) {
                // EL ANTES: no nacían a la misma altura, así que pasar de uno a
                // otro hacía saltar el panel de sitio.
                assert.ok(
                    nacen.size > 1,
                    `el «antes» tenía que nacer a alturas distintas; salieron ${[...nacen]}`,
                );
                return;
            }

            assert.equal(
                nacen.size,
                1,
                `los seis tienen que nacer a la misma altura para poder pasar de uno a otro; salieron ${[...nacen].sort()}`,
            );
        } finally {
            await cerrar();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. La campana
// ─────────────────────────────────────────────────────────────────────────────

for (const medida of ANCHURAS) {
    test(`a ${medida.ventana}: la campana nace bajo la barra y cabe en la ventana`, async (t) => {
        if (faltaNavegador(t)) return;
        const { page, cerrar } = await abrirNavegador(medida);
        try {
            const { panel, contenedor } = await abrirPanel(page, "campana");
            const ventana = await page.evaluate(() => ({
                ancho: document.documentElement.clientWidth,
                alto: document.documentElement.clientHeight,
            }));
            t.diagnostic(
                `${medida.ventana} · campana: ${panel.left}→${panel.right} (${panel.ancho}px), arriba en ${panel.top}, barra abajo en ${contenedor.bottom}`,
            );

            if (ROTO) {
                assert.ok(
                    panel.top < contenedor.bottom || panel.right > ventana.ancho,
                    "el «antes» tenía que montarse sobre la barra o cortarse por la derecha",
                );
                return;
            }

            assert.ok(
                panel.top >= contenedor.bottom,
                `se monta sobre la barra (${panel.top} < ${contenedor.bottom})`,
            );
            assert.ok(panel.right <= ventana.ancho, `se corta por la derecha (${panel.right} > ${ventana.ancho})`);
            assert.ok(panel.left >= 0, `se sale por la izquierda (${panel.left})`);
            assert.ok(panel.bottom <= ventana.alto, `se sale por abajo (${panel.bottom} > ${ventana.alto})`);
        } finally {
            await cerrar();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Lo que a ninguno le puede pasar: desbordar a lo alto
// ─────────────────────────────────────────────────────────────────────────────

test("un panel con demasiado dentro SE DESPLAZA, no desborda la ventana", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrirNavegador(ANCHURAS[3]);
    try {
        // `largo` lleva cien filas dentro: en 844px de alto no caben.
        const { panel, desbordaDentro, seDesplaza } = await abrirPanel(page, "largo");
        const alto = await page.evaluate(() => document.documentElement.clientHeight);
        t.diagnostic(`panel largo a 390: de ${panel.top} a ${panel.bottom}, ventana ${alto}`);

        if (ROTO) {
            // EL ANTES: ese panel no llevaba tope de alto, así que cien filas
            // dentro se salían de la pantalla.
            // Sin tope de alto, Radix lo voltea y se va por ARRIBA de la
            // pantalla: medido, el borde de arriba caía en −4414.
            assert.ok(
                panel.top < 0 || panel.bottom > alto,
                `el «antes» tenía que salirse de la pantalla; iba de ${panel.top} a ${panel.bottom} en ${alto}`,
            );
            return;
        }
        assert.ok(panel.bottom <= alto, `el panel desborda la ventana (${panel.bottom} > ${alto})`);
        assert.equal(seDesplaza, "auto", "tiene que poder desplazarse por dentro");
        assert.ok(desbordaDentro, "y de hecho tiene más dentro de lo que enseña, que es el caso a probar");
    } finally {
        await cerrar();
    }
});

test("y la página no gana barra de desplazamiento por abrir un panel", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrirNavegador(ANCHURAS[3]);
    try {
        await page.click("#largo");
        await page.waitForSelector("[data-panel-del-banco]");
        await page.waitForTimeout(120);
        const desborda = await page.evaluate(() => ({
            ancho: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            alto: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        }));
        // Esta corre IGUAL en los dos modos a propósito: no es un antes/después,
        // es la guarda de que abrir un panel no le añade barras a la página. En
        // el «antes» tampoco pasaba —la maqueta lleva `overflow:hidden`, como
        // Chats—, y afirmar aquí un rojo que no existe sería inventarlo.
        assert.equal(desborda.ancho, false, "la página se desplaza a lo ancho");
        assert.equal(desborda.alto, false, "la página se desplaza a lo alto");
    } finally {
        await cerrar();
    }
});
