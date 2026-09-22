/**
 * La tabla de CRM › Llamadas, medida en Chromium sobre el CSS del build.
 *
 * # Las tres preguntas del encargo, que son de píxeles
 *
 *   1. **El número va a la IZQUIERDA de su celda**, no centrado. Centrado no
 *      se puede comparar con el de la fila de arriba, que es para lo que se
 *      mira una columna de teléfonos.
 *   2. **Y se pinta AZUL**, como en Leads: es lo que se pulsa para abrir el
 *      chat, y en negro no se lee como algo pulsable.
 *   3. **La tabla tiene UN tamaño de letra**, el de Leads (`text-sm`, 14 px).
 *      Las pastillas —el tipo, el resultado, el estado— van a su tamaño, que
 *      es exactamente lo que hace Leads con las suyas.
 *
 * Y dos que se leen del código, porque viven fuera de esta tabla: que los
 * conteos ya no salen en la barra, y que la fila de pestañas del CRM no se
 * pinta dentro de Llamadas.
 *
 * # El modo roto mide lo que HABÍA
 *
 * `MODO=roto` monta el `CallsCrmClient` de `origin/main` —sacado con
 * `git show` y puesto junto a sus vecinos, sin tocarle una línea— y **afirma
 * los fallos**: el número centrado y en negro, dos tamaños de letra dentro de
 * la misma tabla y los conteos dentro de la barra. Copiado a mano se estaría
 * midiendo lo que alguien recuerda de la pantalla vieja.
 *
 * Se levanta con `scripts/banco-tabla-de-llamadas.sh`.
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
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-tabla-de-llamadas.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

const ANCHURAS = [1440, 1280, 1024];
/** El hueco de verdad: la ventana menos el menú lateral y el relleno. */
const HUECO = { 1440: 1160, 1280: 1000, 1024: 744 };

/** `text-sm`, que es el de la tabla de Leads (`components/ui/table.tsx`). */
const TAMANO_DE_LEADS = 14;
/*
 * El azul se LEE de la hoja, no se escribe aquí: `text-blue-600` es la clase
 * que Leads le pone al número, y esta plataforma redefine la paleta —sale
 * `rgb(31, 102, 173)` y no el azul de Tailwind—. Con el número copiado, el
 * banco probaría que coincide con lo que alguien recuerda del tema y se
 * pondría rojo el día que se afine un color sin que nada esté roto.
 */

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${CSS ?? ""}</style></head>` +
                    `<body style="margin:0"><div id="hueco"><div id="pantalla"></div></div>` +
                    `<script type="module" src="/harness.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (
        await navegador.newContext({ viewport: { width: ancho, height: 900 } })
    ).newPage();
    // Una tabla que no llega a pintarse mide cero y hace pasar cualquier
    // comprobación sin haber ejercido nada — y en el modo roto deja de
    // reproducir el fallo que viene a afirmar.
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate((w) => {
        document.getElementById("hueco").style.width = w + "px";
    }, HUECO[ancho] ?? ancho);
    await page.evaluate(() => window.pintarTabla());
    // La lista llega de una promesa, así que se espera a que haya filas.
    await page.waitForSelector('[title="Abrir chat del contacto"]', { timeout: 20000 });
    assert.equal(
        reventones.join(" | "),
        "",
        `la pantalla reventó al pintarse (MODO=${ROTO ? "roto" : "bueno"})`,
    );
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/** Todo lo que hay que saber de la tabla, en una sola pasada. */
function medir(page) {
    return page.evaluate(() => {
        const tabla = document.querySelector("table");
        const boton = document.querySelector('[title="Abrir chat del contacto"]');
        const celda = boton?.closest("td");
        const nombre = document.querySelector('[title="Editar el nombre del contacto"]');
        const barra = document.querySelector("[data-barra-de-acciones]");

        // La misma clase que Leads le pone al número, pintada al lado para
        // preguntarle al navegador de qué color es.
        const sonda = document.createElement("span");
        sonda.className = "text-blue-600";
        document.body.appendChild(sonda);
        const azulDeLeads = getComputedStyle(sonda).color;
        sonda.remove();

        // El borde de dentro de la celda: lo que sobra por la izquierda es lo
        // que el número está desplazado, y centrado eso es la mitad del hueco.
        const dentro = (td) => {
            const r = td.getBoundingClientRect();
            return r.x + parseFloat(getComputedStyle(td).paddingLeft);
        };

        // Los tamaños de letra de la tabla, SIN las pastillas: el tipo, el
        // resultado y el estado son píldoras y van a su tamaño, igual que las
        // de Leads. Lo que tiene que ser uno solo es el TEXTO.
        const enUnaPastilla = (n) => {
            for (let p = n; p && p !== document.body; p = p.parentElement) {
                if (p.className && String(p.className).includes("rounded-full")) return true;
            }
            return false;
        };
        const tamanos = new Set();
        if (tabla) {
            for (const n of tabla.querySelectorAll("*")) {
                const propio = [...n.childNodes].some(
                    (c) => c.nodeType === 3 && c.textContent.trim(),
                );
                if (!propio || enUnaPastilla(n)) continue;
                tamanos.add(Math.round(parseFloat(getComputedStyle(n).fontSize)));
            }
        }

        return {
            hayTabla: !!tabla,
            hayFila: !!boton,
            // Cuánto se desplaza el número dentro de su celda.
            sangriaDelNumero: boton && celda ? boton.getBoundingClientRect().x - dentro(celda) : null,
            alineacionDeLaCelda: celda ? getComputedStyle(celda).textAlign : null,
            // Centrados, el número y el nombre que cuelga de él arrancan en
            // sitios distintos —cada uno mide lo suyo— y la columna se lee
            // como un bloque irregular. Alineados, en el mismo píxel.
            desalineado:
                boton && nombre
                    ? Math.abs(boton.getBoundingClientRect().x - nombre.getBoundingClientRect().x)
                    : null,
            azulDeLeads,
            colorDelNumero: boton ? getComputedStyle(boton).color : null,
            tamanoDelNumero: boton ? Math.round(parseFloat(getComputedStyle(boton).fontSize)) : null,
            tamanoDelNombre: nombre
                ? Math.round(parseFloat(getComputedStyle(nombre).fontSize))
                : null,
            tamanoDeLaCabecera: tabla
                ? Math.round(parseFloat(getComputedStyle(tabla.querySelector("thead tr")).fontSize))
                : null,
            tamanos: [...tamanos].sort((a, b) => a - b),
            textoDeLaBarra: barra ? barra.innerText : "",
            paginaDesborda:
                document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
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

test("el número va a la izquierda y en azul, como en Leads", async (t) => {
    if (faltaNavegador(t)) return;

    for (const ancho of ANCHURAS) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await medir(page);
            assert.ok(m.hayTabla && m.hayFila, `a ${ancho} la tabla no pintó ninguna fila`);

            if (ROTO) {
                assert.equal(
                    m.alineacionDeLaCelda,
                    "center",
                    `a ${ancho} el antes ya alineaba la celda a la izquierda`,
                );
                assert.ok(
                    m.desalineado > 1,
                    `a ${ancho} el antes ya tenía el número y el nombre a la misma altura (${m.desalineado} px)`,
                );
                assert.notEqual(
                    m.colorDelNumero,
                    m.azulDeLeads,
                    `a ${ancho} el antes ya pintaba el número en azul`,
                );
                continue;
            }

            assert.equal(
                m.alineacionDeLaCelda,
                "left",
                `a ${ancho} la celda del contacto no va alineada a la izquierda`,
            );
            assert.ok(
                m.sangriaDelNumero <= 1,
                `a ${ancho} el número no arranca en el borde de su celda (${m.sangriaDelNumero} px)`,
            );
            assert.ok(
                m.desalineado <= 1,
                `a ${ancho} el nombre no arranca donde arranca el número (${m.desalineado} px)`,
            );
            assert.equal(
                m.colorDelNumero,
                m.azulDeLeads,
                `a ${ancho} el número no es el azul de Leads (${m.colorDelNumero})`,
            );
            assert.equal(m.paginaDesborda, false, `a ${ancho} la página se desplaza a lo ancho`);
        } finally {
            await cerrar();
        }
    }
});

test("la tabla tiene un solo tamaño de letra, el de Leads", async (t) => {
    if (faltaNavegador(t)) return;

    const { page, cerrar } = await abrir(1440);
    try {
        const m = await medir(page);

        if (ROTO) {
            assert.ok(
                m.tamanos.length > 1,
                `el antes ya tenía un solo tamaño: ${JSON.stringify(m.tamanos)}`,
            );
            assert.equal(m.tamanoDeLaCabecera, 12, "el antes no tenía la cabecera en 12 px");
            assert.equal(m.tamanoDelNombre, 12, "el antes no tenía el nombre del contacto en 12 px");
            return;
        }

        assert.deepEqual(
            m.tamanos,
            [TAMANO_DE_LEADS],
            `la tabla mezcla tamaños de letra: ${JSON.stringify(m.tamanos)}`,
        );
        assert.equal(m.tamanoDeLaCabecera, TAMANO_DE_LEADS, "la cabecera no va al tamaño de Leads");
        assert.equal(m.tamanoDelNumero, TAMANO_DE_LEADS, "el número no va al tamaño de Leads");
        assert.equal(m.tamanoDelNombre, TAMANO_DE_LEADS, "el nombre no va al tamaño de Leads");
    } finally {
        await cerrar();
    }
});

test("los conteos ya no salen en la barra", async (t) => {
    if (faltaNavegador(t)) return;

    const { page, cerrar } = await abrir(1440);
    try {
        const m = await medir(page);
        // Las tres cifras de las pastillas. Son raras a propósito: un 3 o un
        // 12 se confundirían con cualquier otro número de la pantalla.
        const cifras = ["1284", "742", "542"];
        const dentro = cifras.filter((c) => m.textoDeLaBarra.includes(c));

        if (ROTO) {
            assert.deepEqual(
                dentro,
                cifras,
                "el antes no tenía las tres pastillas de conteo en la barra",
            );
            return;
        }

        assert.deepEqual(dentro, [], `la barra sigue enseñando conteos: ${JSON.stringify(dentro)}`);
        // Y el filtro de dirección se queda: es lo que hacían las pastillas.
        for (const rotulo of ["Todas", "Salientes", "Entrantes"]) {
            assert.match(
                m.textoDeLaBarra,
                new RegExp(rotulo),
                `falta el filtro «${rotulo}» en la barra`,
            );
        }
    } finally {
        await cerrar();
    }
});

test("dentro de Llamadas no se pinta la fila de pestañas del CRM", () => {
    // Esto vive en otro componente, así que se lee del código y no se mide:
    // montar `CrmDashboard` entero arrastraría el kanban y las gráficas para
    // contestar algo que es una condición de una línea.
    const ruta = "app/(root)/crm/dashboard/components/CrmDashboard.tsx";
    const src = ROTO
        ? execFileSync("git", ["show", `origin/main:${ruta}`], { cwd: RAIZ, encoding: "utf8" })
        : fs.readFileSync(join(RAIZ, ruta), "utf8");

    // La fila es la que lleva las cinco pestañas dentro.
    assert.match(src, /setViewMode\("llamadas"\)/, "no se encontró la fila de pestañas");

    if (ROTO) {
        assert.ok(
            !/esLaPantallaDeLlamadas/.test(src),
            "el antes ya escondía la fila dentro de Llamadas",
        );
        assert.match(src, /RANGOS_DE_DIAS/, "el antes no tenía el rango de días en esa fila");
        return;
    }

    assert.match(
        src,
        /\{!esLaPantallaDeLlamadas && \(\s*\n\s*<div className="flex flex-wrap items-center gap-2">/,
        "la fila de pestañas no va detrás de `!esLaPantallaDeLlamadas`",
    );
    assert.match(
        src,
        /const esLaPantallaDeLlamadas = initialView === "llamadas";/,
        "`esLaPantallaDeLlamadas` no se decide por la RUTA",
    );
    // Y con la fila se fue el rango de días: dentro de Llamadas es fijo.
    assert.ok(!/RANGOS_DE_DIAS/.test(src), "el rango de 7/30/90 días sigue en la fila");
});
