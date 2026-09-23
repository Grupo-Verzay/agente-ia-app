/**
 * CRM › Llamadas alineada como Leads.
 *
 *   1. Los encabezados van CENTRADOS en su columna y con el MISMO estilo entre
 *      ellos (el de Leads: 14 px, 500, gris). El primero dice «WhatsApp».
 *   2. El contenido: WhatsApp, Nombre, Fecha, Detalle y Resultado a la
 *      izquierda; Duración centrada; el menú de Acciones centrado en su columna.
 *   3. El nombre, la fecha y el detalle como en Leads: en el color del texto
 *      —no en gris— y con el peso normal de la tabla, SIN negrilla añadida.
 *      (Que pesen exactamente lo mismo que Leads lo compara, con las dos tablas
 *      pintadas lado a lado, `leads-y-llamadas-simetricas.test.mjs`.)
 *
 * Se mide la tabla PINTADA en Chromium sobre el CSS del build, a 1440, 1280 y
 * 1024. `MODO=roto` pinta la tabla de `ANTES_REF` y AFIRMA el fallo.
 * Se levanta con `scripts/banco-alineacion-de-llamadas.sh`.
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
} catch {}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-alineacion-de-llamadas.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;

const A_LA_IZQUIERDA = ["WhatsApp", "Nombre", "Fecha", "Detalle", "Resultado"];
const CENTRADAS = ["Duración", "Acciones"];
const EN_NEGRILLA = ["Nombre", "Fecha", "Detalle"];
const TOLERANCIA = 2;

async function abrir(ancho) {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            // `.app-module-content`: es donde vive la tabla de verdad, y ahí un
            // `.text-sm` suelto no mide lo mismo que fuera.
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""} *{animation:none!important;transition:none!important}</style></head>` +
                    `<body style="margin:0"><div class="app-module-content"><div id="pantalla" style="width:${ancho - 280}px"></div>` +
                    `<span id="sonda-texto" class="text-foreground">x</span></div><script type="module" src="/h.js"></script></body></html>`,
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
    // Ojo: las opciones de `waitForFunction` van en el TERCER argumento; en el
    // segundo son el argumento de la función y el plazo se ignora.
    await page.waitForFunction(() => document.querySelectorAll('tbody [title="Abrir chat del contacto"]').length >= 1, null, { timeout: 20000 });
    assert.equal(errores.join(" | "), "", "la pantalla reventó");
    return { page, cerrar: async () => { await navegador.close(); server.close(); } };
}

/** Lo que se mide de la tabla, dentro del navegador. */
function medir() {
    const cajaDeContenido = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight) };
    };
    // Lo que SE VE dentro de un elemento: los textos y los iconos, juntos.
    const loQueSeVe = (el) => {
        const cajas = [];
        const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
            if (!n.textContent.trim()) continue;
            const rango = document.createRange();
            rango.selectNodeContents(n);
            const rr = rango.getBoundingClientRect();
            if (rr.width > 0) cajas.push(rr);
        }
        for (const svg of el.querySelectorAll("svg")) {
            const rr = svg.getBoundingClientRect();
            if (rr.width > 0) cajas.push(rr);
        }
        if (!cajas.length) return null;
        return { left: Math.min(...cajas.map((c) => c.left)), right: Math.max(...cajas.map((c) => c.right)) };
    };
    const centro = (c) => (c.left + c.right) / 2;
    const estilo = (el) => {
        const s = getComputedStyle(el);
        return { tamano: s.fontSize, grosor: Number(s.fontWeight), color: s.color };
    };

    const tabla = document.querySelector("table");
    const ths = [...tabla.querySelectorAll("thead th")];
    const rotulos = ths.map((th) => th.innerText.trim());
    const cabeceras = ths.map((th, i) => {
        const caja = cajaDeContenido(th);
        const visto = loQueSeVe(th);
        const conTexto =
            [...th.querySelectorAll("*")].find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ?? th;
        return {
            rotulo: rotulos[i],
            desviacion: visto ? Math.round(Math.abs(centro(visto) - centro(caja)) * 10) / 10 : null,
            ...estilo(conTexto),
        };
    });

    const fila = [...tabla.querySelectorAll("tbody tr")].find((tr) => tr.querySelector('[title="Abrir chat del contacto"]'));
    const celdas = [...fila.children].map((td, i) => {
        const caja = cajaDeContenido(td);
        const rotulo = rotulos[i];
        // En Acciones lo que se centra es el BOTÓN, no su icono suelto; y en
        // Resultado lo que arranca en el borde es la PASTILLA, no su texto,
        // que va 9 px dentro por su relleno y su borde.
        const boton =
            rotulo === "Acciones"
                ? td.querySelector('[aria-label="Acciones"]')?.getBoundingClientRect()
                : rotulo === "Resultado"
                  ? td.querySelector(".rounded-full")?.getBoundingClientRect()
                  : null;
        const visto = boton ?? loQueSeVe(td);
        return {
            rotulo,
            desdeElBorde: visto ? Math.round((visto.left - caja.left) * 10) / 10 : null,
            desviacion: visto ? Math.round(Math.abs(centro(visto) - centro(caja)) * 10) / 10 : null,
        };
    });

    const td = (r) => fila.children[rotulos.indexOf(r)];
    const textoDe = {
        Nombre: td("Nombre")?.querySelector("button, p"),
        Fecha: td("Fecha"),
        Detalle: td("Detalle")?.querySelector("span"),
    };
    const negrilla = Object.fromEntries(Object.entries(textoDe).map(([k, el]) => [k, el ? estilo(el) : null]));
    return {
        rotulos,
        cabeceras,
        celdas,
        negrilla,
        colorDelTexto: getComputedStyle(document.getElementById("sonda-texto")).color,
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

for (const ancho of [1440, 1280, 1024]) {
    test(`a ${ancho}: encabezados centrados, contenido alineado y el texto como en Leads`, async (t) => {
        if (!chromium) return t.skip("sin playwright");
        if (!CSS) return t.skip("sin el CSS del build");
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await page.evaluate(medir);
            const celda = (r) => m.celdas.find((c) => c.rotulo === r);

            if (ROTO) {
                // El fallo, afirmado: si algo de esto no se cumple, el «antes»
                // no reproduce nada y el verde del modo bueno no significa nada.
                assert.equal(m.rotulos[0], "Contacto", "el roto no reproduce: el primero ya no decía Contacto");
                assert.ok(
                    // A 1024 las columnas estrechas llenan su celda y el rótulo cae en medio
                    // de todas formas: basta con que las anchas no lo estén.
                    m.cabeceras.filter((h) => h.desviacion > TOLERANCIA).length >= 3,
                    `el roto no reproduce: los rótulos ya iban centrados (${JSON.stringify(m.cabeceras.map((h) => h.desviacion))})`,
                );
                assert.ok(celda("Duración").desviacion > TOLERANCIA, "el roto no reproduce: Duración ya iba centrada");
                assert.ok(celda("Acciones").desviacion > TOLERANCIA, "el roto no reproduce: Acciones ya iba centrada");
                for (const k of EN_NEGRILLA) {
                    const e = m.negrilla[k];
                    assert.ok(e, `no se encontró el texto de ${k}`);
                    assert.ok(e.grosor < 500 || e.color !== m.colorDelTexto, `el roto no reproduce: ${k} ya iba en negrilla y en el color del texto`);
                }
                return;
            }

            // 1. Encabezados
            assert.deepEqual(m.rotulos, ["WhatsApp", "Nombre", "Duración", "Fecha", "Detalle", "Resultado", "Acciones"]);
            for (const h of m.cabeceras) {
                assert.ok(h.desviacion !== null && h.desviacion <= TOLERANCIA, `«${h.rotulo}» no va centrado (${h.desviacion} px)`);
                assert.equal(h.tamano, m.cabeceras[0].tamano, `«${h.rotulo}» cambia de tamaño`);
                assert.equal(h.grosor, m.cabeceras[0].grosor, `«${h.rotulo}» cambia de grosor`);
                assert.equal(h.color, m.cabeceras[0].color, `«${h.rotulo}» cambia de color`);
            }
            // El estilo que ya tenían, el de Leads: 14 px y 500.
            assert.equal(m.cabeceras[0].tamano, "14px");
            assert.equal(m.cabeceras[0].grosor, 500);
            assert.notEqual(m.cabeceras[0].color, m.colorDelTexto, "el rótulo tiene que seguir en gris");

            // 2. Contenido
            for (const r of A_LA_IZQUIERDA) {
                const c = celda(r);
                assert.ok(c.desdeElBorde !== null && c.desdeElBorde <= TOLERANCIA, `${r} no arranca en el borde de su celda (+${c.desdeElBorde} px)`);
            }
            for (const r of CENTRADAS) {
                const c = celda(r);
                assert.ok(c.desviacion !== null && c.desviacion <= TOLERANCIA, `${r} no va centrado (${c.desviacion} px)`);
            }

            // 3. En el color del texto y con el peso normal, como Leads
            for (const k of EN_NEGRILLA) {
                const e = m.negrilla[k];
                assert.ok(e, `no se encontró el texto de ${k}`);
                assert.equal(e.grosor, 400, `${k} lleva negrilla añadida (${e.grosor}); Leads no`);
                assert.equal(e.color, m.colorDelTexto, `${k} no va en el color del texto`);
            }
            assert.ok(!m.desborda, "la página se desplaza a lo ancho");
        } finally {
            await cerrar();
        }
    });
}
