/**
 * «Qué incluye este plan» en la página pública de un plan (`/planes/<plan>`),
 * dos arreglos pedidos juntos:
 *
 * 1. **«Ver todas las funciones» las enseña TODAS en el orden del editor**, de
 *    principio a fin: cada función en SU sitio entre las destacadas. Antes eran
 *    dos listas —las destacadas y, debajo, el resto— así que el orden del panel
 *    solo se cumplía si todas las destacadas iban primero (`seVeLaFuncion`).
 * 2. **Abrir la guía paso a paso de una función no mueve la página.** El video
 *    se queda donde estaba y la guía sale justo debajo; solo si su principio
 *    cae por debajo de la vista se baja lo justo para verlo, sin que el video
 *    se vaya por arriba (`cuantoBajarParaVerLaGuia`). Antes el video se quitaba
 *    al abrir la guía: lo de arriba encogía de golpe y el navegador recolocaba
 *    la página. Se mide sobre el contenedor que de verdad se desplaza (el de la
 *    página pública), con la guía llegando tarde como en la App y el video de
 *    `public/guia` servido de verdad.
 *
 * `MODO=roto` pinta la misma página con el código de `ANTES_REF` (0764700)
 * —pinchado a un commit, nunca `origin/main`— y AFIRMA los dos fallos.
 *
 * Se levanta con `scripts/banco-plan-orden-y-guia-sin-saltos.sh`.
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
    // Sin navegador no se finge: se salta y se dice.
}

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "0764700";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "plan-orden-y-guia-sin-saltos");
const cssDir = join(RAIZ, ".next", "static", "css");
const VIDEO_DE_LA_GUIA = join(RAIZ, "public", "guia", "agente-ia", "demostracion.webm");
const conNavegador = chromium && process.env.CHROME_BIN && fs.existsSync(cssDir) && fs.existsSync(VIDEO_DE_LA_GUIA) ? test : test.skip;

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
const deAntes = (f) => {
    try {
        return execFileSync("git", ["show", `${ANTES}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const leer = (f) => (ROTO ? deAntes(f) : crudo(f));

const PAGINA_DEL_PLAN = "app/(public)/planes/[slug]/_components/PlanDetailPage.tsx";

/* El plan de ejemplo: seis funciones en el orden del editor, con las
   destacadas REPARTIDAS (no todas primero), que es el caso que se rompía. Dos
   con guía de la plataforma. */
const DATOS = { plan: "intermedio", nombre: "Business", creditos: 8000, catalogo: 25, precioUSD: 99, asistencia: "IA", nombresEnUso: ["Business"] };
const F = (id, nombre, destacada, tutorial) => ({ id, nombre, descripcion: `Qué hace ${nombre}.`, categoria: "general", activa: true, destacada, tutorial });
const CRUDO = [
    F("respuestas", "Respuestas automáticas", true, "agente-ia"),
    F("catalogo", "Catálogo de productos", false, "agente-ia"),
    F("youtube", "Cómo vender más", true, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    F("soporte", "Centro de soporte", false, "https://ayuda.test/soporte"),
    F("reportes", "Reportes semanales", true, null),
    F("citas", "Agenda de citas", false, null),
];
const EN_EL_EDITOR = CRUDO.map((f) => f.id);
const DESTACADAS = CRUDO.filter((f) => f.destacada).map((f) => f.id);
const RESTO = CRUDO.filter((f) => !f.destacada).map((f) => f.id);
const PAGINA = {
    plan: "intermedio",
    tipo: "IA",
    nombre: "Business",
    precio: { texto: "$99", aConsultar: false },
    video: null,
    paraQuien: { paraQuien: "Para negocios que atienden por WhatsApp todo el día.", caso: "Una clínica con tres asesores." },
    capacidad: [{ id: "creditos", icono: "creditos", titulo: "Créditos de IA", valor: "8.000", detalle: "Cada mes." }],
    funciones: [],
    preguntas: [{ question: "¿Puedo cambiar de plan?", answer: "Sí, cuando quieras." }],
    botones: { principal: { texto: "Comenzar con el plan Business", url: "/register?plan=nivel-3", externo: false }, secundario: null },
    planSuperior: null,
    meta: { titulo: "Business", descripcion: "", imagen: null },
    marca: "Verzay",
    logo: null,
    favicon: null,
    orden: ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"],
};

/* ─── 1. Las reglas, sin navegador ────────────────────────────────────── */

test("reglas: se ve la función si está desplegado todo o si es destacada", async () => {
    if (ROTO) {
        assert.doesNotMatch(deAntes("lib/pagina-de-plan.ts") ?? "", /seVeLaFuncion/, "antes no había regla de qué se ve en su sitio");
        return;
    }
    const { seVeLaFuncion, elRepartoDeLasFunciones } = await import(join(COMPILADO, "reglas.mjs"));
    assert.equal(seVeLaFuncion({ destacada: true }, false), true);
    assert.equal(seVeLaFuncion({ destacada: false }, false), false);
    assert.equal(seVeLaFuncion({ destacada: true }, true), true);
    assert.equal(seVeLaFuncion({ destacada: false }, true), true);

    // Con las destacadas repartidas, lo que se ve conserva el orden del editor
    // tanto recogido como desplegado.
    const fs_ = CRUDO.map((f) => ({ id: f.id, destacada: f.destacada }));
    assert.deepEqual(fs_.filter((f) => seVeLaFuncion(f, false)).map((f) => f.id), DESTACADAS);
    assert.deepEqual(fs_.filter((f) => seVeLaFuncion(f, true)).map((f) => f.id), EN_EL_EDITOR);
    // El reparto solo CUENTA: el botón sale si hay algo detrás.
    assert.equal(elRepartoDeLasFunciones(fs_).resto.length, RESTO.length);
});

test("reglas: abrir la guía no baja la página salvo lo justo para verla", async () => {
    if (ROTO) {
        assert.doesNotMatch(deAntes("lib/pagina-de-plan.ts") ?? "", /cuantoBajarParaVerLaGuia/, "antes no había regla");
        return;
    }
    const { cuantoBajarParaVerLaGuia: bajar, LO_QUE_SE_VE_DE_LA_GUIA, MARGEN_CONTRA_EL_BORDE } = await import(join(COMPILADO, "reglas.mjs"));
    assert.equal(LO_QUE_SE_VE_DE_LA_GUIA, 160);
    assert.equal(MARGEN_CONTRA_EL_BORDE, 16);
    // La guía cabe en la vista: no se mueve nada.
    assert.equal(bajar({ arribaDeLaGuia: 500, arribaDeLoAbierto: 200, inicioDeLaVista: 80, finDeLaVista: 900 }), 0);
    // Justo en el límite (500 + 160 = 884 + 0): tampoco.
    assert.equal(bajar({ arribaDeLaGuia: 724, arribaDeLoAbierto: 300, inicioDeLaVista: 80, finDeLaVista: 900 }), 0);
    // Un poco por debajo: lo justo (800 + 160 − 884).
    assert.equal(bajar({ arribaDeLaGuia: 800, arribaDeLoAbierto: 600, inicioDeLaVista: 80, finDeLaVista: 900 }), 76);
    // Muy por debajo: se baja como mucho hasta dejar lo abierto arriba (300 − 80).
    assert.equal(bajar({ arribaDeLaGuia: 950, arribaDeLoAbierto: 300, inicioDeLaVista: 80, finDeLaVista: 900 }), 220);
    // Lo abierto ya está por encima del inicio: no se baja (no se pierde de vista).
    assert.equal(bajar({ arribaDeLaGuia: 950, arribaDeLoAbierto: 40, inicioDeLaVista: 80, finDeLaVista: 900 }), 0);
    // Una vista diminuta: se pide ver solo lo que cabe.
    assert.equal(bajar({ arribaDeLaGuia: 200, arribaDeLoAbierto: 150, inicioDeLaVista: 80, finDeLaVista: 196 }), 70);
    // Nunca negativo, y sin medidas no se mueve.
    assert.equal(bajar({ arribaDeLaGuia: 100, arribaDeLoAbierto: 90, inicioDeLaVista: 80, finDeLaVista: 900 }), 0);
    assert.equal(bajar({ arribaDeLaGuia: NaN, arribaDeLoAbierto: 300, inicioDeLaVista: 80, finDeLaVista: 900 }), 0);
    assert.equal(bajar({ arribaDeLaGuia: 950, arribaDeLoAbierto: Infinity, inicioDeLaVista: 80, finDeLaVista: 900 }), 0);
});

test("barrido: una sola lista en su orden, y el video se queda con la guía abierta", () => {
    const pagina = sinComentarios(leer(PAGINA_DEL_PLAN) ?? "");
    if (ROTO) {
        assert.match(pagina, /data-resto-de-funciones/, "antes el resto iba en una segunda lista, debajo");
        assert.match(pagina, /reproductor && !guiaAbierta/, "antes el video se quitaba al abrir la guía");
        return;
    }
    assert.match(pagina, /seVeLaFuncion\(/, "qué se ve lo decide la regla compartida");
    assert.equal((pagina.match(/<QueIncluye\b/g) ?? []).length, 1, "una sola lista de funciones");
    assert.doesNotMatch(pagina, /data-resto-de-funciones/, "ninguna segunda lista con el resto");
    assert.doesNotMatch(pagina, /reproductor && !guiaAbierta/, "el video sigue pintado con la guía abierta");
    assert.match(pagina, /cuantoBajarParaVerLaGuia\(/, "lo que se baja lo decide la regla");
    assert.doesNotMatch(pagina, /window\.scroll(By|To)\(/, "se desplaza el contenedor que se desplaza, no la ventana");
});

/* ─── 2. En el navegador ──────────────────────────────────────────────── */

/** La página servida tal cual, con `public/guia/*` detrás (con rangos, como un servidor de verdad). */
async function abrir(datos, pintar, { anchos = [[1440, 900], [390, 844]] } = {}) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(join(COMPILADO, "plan.js"), "utf8");
    const json = JSON.stringify(datos).replace(/</g, "\\u003c");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
        `<body class="overflow-hidden"><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
        `<script type="module">${js}</script></body></html>`;
    const servidor = http.createServer((q, r) => {
        const ruta = join(RAIZ, "public", decodeURIComponent(q.url.split("?")[0]));
        if (q.url.startsWith("/guia/") && ruta.startsWith(join(RAIZ, "public", "guia")) && fs.existsSync(ruta) && fs.statSync(ruta).isFile()) {
            const tipo = ruta.endsWith(".webm") ? "video/webm" : ruta.endsWith(".webp") ? "image/webp" : "application/octet-stream";
            const buf = fs.readFileSync(ruta);
            const rango = /bytes=(\d+)-(\d*)/.exec(q.headers.range ?? "");
            if (rango) {
                const a = Number(rango[1]);
                const b = rango[2] ? Number(rango[2]) : buf.length - 1;
                r.writeHead(206, { "content-type": tipo, "content-range": `bytes ${a}-${b}/${buf.length}`, "accept-ranges": "bytes", "content-length": b - a + 1 });
                return r.end(buf.subarray(a, b + 1));
            }
            r.writeHead(200, { "content-type": tipo, "accept-ranges": "bytes", "content-length": buf.length });
            return r.end(buf);
        }
        r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        r.end(html);
    });
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${servidor.address().port}/`;
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN });
    try {
        for (const [w, h] of anchos) {
            const ctx = await nav.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
            await ctx.addInitScript(() => {
                try {
                    localStorage.setItem("theme", "dark");
                } catch {}
            });
            const pag = await ctx.newPage();
            await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
            const errores = [];
            pag.on("pageerror", (e) => errores.push(String(e?.message ?? e)));
            await pag.goto(url);
            await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
            await pag.waitForTimeout(300);
            await pintar(pag, w, h, errores);
            await ctx.close();
        }
    } finally {
        await nav.close();
        servidor.close();
    }
}

const visibles = (pag) => pag.locator("[data-funcion]").evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("data-funcion")));
/** Los huecos verticales entre las funciones que se ven, en orden. */
const huecos = (pag) =>
    pag.locator("[data-funcion]").evaluateAll((els) => {
        const r = els.filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect());
        return r.slice(1).map((x, i) => Math.round(x.top - r[i].bottom));
    });

conNavegador("«Ver todas las funciones»: TODAS en el orden del editor, cada una en su sitio", async () => {
    await abrir({ __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS }, async (pag, w, _h, errores) => {
        assert.deepEqual(await visibles(pag), DESTACADAS, `${w}: de entrada, las destacadas en su orden`);
        const boton = pag.locator("[data-ver-todas-las-funciones]");
        await boton.click();
        const todas = await visibles(pag);
        if (ROTO) {
            assert.deepEqual(todas, [...DESTACADAS, ...RESTO], `${w}: antes el resto se pegaba al final`);
            assert.notDeepEqual(todas, EN_EL_EDITOR, `${w}: antes no salía el orden del editor`);
            return;
        }
        assert.deepEqual(todas, EN_EL_EDITOR, `${w}: desplegado sale el orden del editor de principio a fin`);
        // Una sola lista: los huecos entre funciones son todos iguales.
        const h = await huecos(pag);
        assert.ok(h.every((x) => x === h[0]), `${w}: los huecos entre funciones no son iguales (${h.join(", ")})`);
        assert.equal(await pag.locator("[data-lista-de-funciones]").count(), 1, `${w}: una sola lista`);

        // Lo abierto dentro sigue abierto al recoger y volver a desplegar.
        await pag.locator("[data-funcion='citas'] [data-cabeza-de-la-funcion]").click();
        assert.equal(await pag.locator("[data-funcion='citas']").getAttribute("data-abierta"), "si");
        await boton.click();
        assert.deepEqual(await visibles(pag), DESTACADAS, `${w}: «Ver menos» deja solo las destacadas`);
        await boton.click();
        assert.deepEqual(await visibles(pag), EN_EL_EDITOR, `${w}: y al volver, otra vez en su orden`);
        assert.equal(await pag.locator("[data-funcion='citas']").getAttribute("data-abierta"), "si", `${w}: lo abierto sigue abierto`);
        assert.deepEqual(errores, []);
    });
});

conNavegador("sin ninguna destacada, el botón las despliega todas en su orden", async () => {
    const sinDestacadas = CRUDO.map((f) => ({ ...f, destacada: false }));
    await abrir(
        { __pagina: PAGINA, __crudo: sinDestacadas, __datos: DATOS },
        async (pag, w) => {
            assert.deepEqual(await visibles(pag), [], `${w}: de entrada no hay nada`);
            await pag.locator("[data-ver-todas-las-funciones]").click();
            assert.deepEqual(await visibles(pag), EN_EL_EDITOR, `${w}: todas en el orden del editor`);
        },
        { anchos: [[1440, 900]] },
    );
});

/* Dónde está mirando quien abre la guía. `fila` y `video` son las cajas de la
   fila de la guía y del video antes de moverse; devuelve cuánto desplazar el
   contenedor desde donde está. */
const POSICIONES = {
    // La fila de la guía a media pantalla: la guía cabe debajo.
    filaEnMedio: (h, c) => c.fila.top - h * 0.7,
    // El video cortado por arriba (se bajó un poco más allá de él).
    videoCortado: (_h, c) => c.video.top + 150,
    // La fila pegada al borde de abajo: la guía nace fuera de la vista.
    filaAbajo: (h, c) => c.fila.top - (h - 30),
};

/** Abre la guía de «Respuestas automáticas» desde una posición y mide cómo queda, varias veces. */
async function abrirLaGuiaDesde(pag, h, posicion) {
    await pag.locator("[data-funcion='respuestas'] [data-cabeza-de-la-funcion]").click();
    const cuerpo = pag.locator("[data-funcion='respuestas'] [data-cuerpo-de-la-funcion]");
    await cuerpo.waitFor();
    await cuerpo.locator("[data-caja-del-video] video").evaluate((v) =>
        v.readyState >= 1 ? null : new Promise((ok) => v.addEventListener("loadedmetadata", ok, { once: true })),
    );
    await pag.waitForTimeout(300);
    const cajas = await pag.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        return { fila: r("[data-funcion='respuestas'] [data-fila-de-la-guia]"), video: r("[data-funcion='respuestas'] [data-caja-del-video]") };
    });
    const dy = POSICIONES[posicion](h, cajas);
    await pag.evaluate((dy) => document.querySelector("[data-pantalla-publica]").scrollBy(0, dy), dy);
    await pag.waitForTimeout(300);
    const medir = () =>
        pag.evaluate(() => {
            const q = (s) => {
                const e = document.querySelector(s);
                if (!e) return null;
                const r = e.getBoundingClientRect();
                return { arriba: Math.round(r.top), abajo: Math.round(r.bottom) };
            };
            const cont = document.querySelector("[data-pantalla-publica]");
            return {
                desplazado: Math.round(cont.scrollTop),
                ventana: Math.round(window.scrollY),
                vista: { arriba: Math.round(cont.getBoundingClientRect().top), abajo: Math.round(Math.min(innerHeight, cont.getBoundingClientRect().bottom)) },
                video: q("[data-funcion='respuestas'] [data-caja-del-video]"),
                fila: q("[data-funcion='respuestas'] [data-fila-de-la-guia]"),
                guia: q("[data-funcion='respuestas'] [data-guia-desplegada]"),
                contenido: q("[data-funcion='respuestas'] [data-guia]"),
            };
        });
    const antes = await medir();
    await cuerpo.locator("[data-ver-la-guia]").click();
    const muestras = [];
    let t0 = 0;
    for (const t of [50, 300, 900, 1600, 2500]) {
        await pag.waitForTimeout(t - t0);
        t0 = t;
        muestras.push(await medir());
    }
    return { antes, muestras, despues: muestras.at(-1) };
}

conNavegador("abrir la guía no mueve la página: el video se queda y la guía sale debajo, a la vista", async () => {
    const resultados = [];
    await abrir({ __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS, __esperaDeLaGuia: 600 }, async (pag, w, h, errores) => {
        for (const posicion of Object.keys(POSICIONES)) {
            // Cada posición desde la página recién abierta.
            await pag.reload();
            await pag.waitForFunction(() => window.listo === true, null, { timeout: 15_000 });
            await pag.waitForTimeout(300);
            const r = await abrirLaGuiaDesde(pag, h, posicion);
            resultados.push({ w, h, posicion, ...r });
            const donde = `${w} ${posicion}`;
            const { antes, muestras, despues } = r;
            // La ventana no se mueve nunca: quien se desplaza es el contenedor.
            assert.ok(muestras.every((m) => m.ventana === 0), `${donde}: se desplazó la ventana`);
            assert.ok(despues.contenido, `${donde}: la guía no llegó`);
            if (ROTO) continue;

            assert.ok(despues.video, `${donde}: con la guía abierta el video sigue`);
            assert.ok(despues.guia.arriba >= despues.video.abajo, `${donde}: la guía va debajo del video`);
            assert.ok(despues.guia.arriba >= despues.fila.abajo, `${donde}: la guía va debajo de su fila`);
            // Sin saltos: el contenedor nunca sube, y entre muestras no retrocede.
            const ys = [antes.desplazado, ...muestras.map((m) => m.desplazado)];
            assert.ok(ys.every((y, i) => i === 0 || y >= ys[i - 1] - 1), `${donde}: la página saltó (${ys.join(" → ")})`);

            const inicio = despues.vista.arriba + 80; // el `scroll-mt-20` de la guía, debajo de la barra fija
            const fin = despues.vista.abajo;
            if (posicion === "filaAbajo") {
                // La guía nacía fuera. El video se compacta con su borde de
                // arriba quieto y la guía sube con él: si así ya se ve lo
                // pedido, la página no se mueve; si no, se baja lo justo, sin
                // perder el video de vista.
                const yaSeVeia = despues.desplazado === antes.desplazado;
                if (yaSeVeia) assert.ok(despues.guia.arriba <= fin - 16 - 160 + 2, `${donde}: la guía nació fuera y no se bajó a verla`);
                assert.ok(Math.abs(despues.video.arriba - (antes.video.arriba - (despues.desplazado - antes.desplazado))) <= 1, `${donde}: el borde de arriba del video se movió al compactarse`);
                assert.ok(despues.video.arriba >= inicio - 2, `${donde}: el video se fue por arriba (${despues.video.arriba} < ${inicio})`);
                const seVeLoPedido = despues.guia.arriba <= fin - 16 - 160 + 2;
                const topado = Math.abs(despues.video.arriba - inicio) <= 2;
                assert.ok(seVeLoPedido || topado, `${donde}: no se ve el principio de la guía (${despues.guia.arriba} / ${fin})`);
                assert.ok(despues.guia.arriba < fin - 16, `${donde}: la guía sigue fuera de la vista`);
            } else {
                // Cabía: la página se queda EXACTAMENTE donde estaba.
                assert.ok(muestras.every((m) => Math.abs(m.desplazado - antes.desplazado) <= 1), `${donde}: la página se movió (${ys.join(" → ")})`);
                assert.ok(muestras.every((m) => m.video && Math.abs(m.video.arriba - antes.video.arriba) <= 1), `${donde}: el video cambió de sitio`);
                assert.ok(despues.guia.arriba < fin - 16, `${donde}: la guía quedó fuera de la vista (${despues.guia.arriba} / ${fin})`);
            }
        }
        if (!ROTO) assert.deepEqual(errores, []);
    });
    if (!ROTO) {
        // Que el caso de bajar a ver la guía se ejerza en alguna anchura: con
        // el video compactado, a 1440 la guía ya cabe; en un teléfono, no.
        const bajo = resultados.filter((r) => r.posicion === "filaAbajo" && r.despues.desplazado > r.antes.desplazado);
        assert.ok(bajo.length > 0, "ningún caso ejerció bajar a ver la guía");
    }
    if (ROTO) {
        // Antes: el video desaparecía con la guía abierta…
        assert.ok(resultados.every((r) => r.despues.video === null), "antes el video se quitaba al abrir la guía");
        // …y la página se movía sola, o lo que se acababa de abrir quedaba fuera de vista.
        const algunSalto = resultados.some((r) => {
            const movio = r.muestras.some((m) => Math.abs(m.desplazado - r.antes.desplazado) > 20);
            const fuera = r.despues.guia.arriba >= r.despues.vista.abajo - 16 || r.despues.fila.abajo <= r.despues.vista.arriba;
            return movio || fuera;
        });
        assert.ok(algunSalto, `antes abrir la guía movía la página o la dejaba fuera de vista: ${JSON.stringify(resultados.map((r) => [r.w, r.posicion, r.antes.desplazado, r.despues.desplazado, r.despues.guia?.arriba]))}`);
    }
});

conNavegador("«Ir al vídeo» desde la guía sube al video y deja la guía abierta", async () => {
    await abrir(
        { __pagina: PAGINA, __crudo: CRUDO, __datos: DATOS },
        async (pag, w) => {
            await pag.locator("[data-funcion='respuestas'] [data-cabeza-de-la-funcion]").click();
            const cuerpo = pag.locator("[data-funcion='respuestas'] [data-cuerpo-de-la-funcion]");
            await cuerpo.locator("[data-ver-la-guia]").click();
            const guia = cuerpo.locator("[data-guia]");
            await guia.waitFor({ timeout: 10_000 });
            const ir = guia.locator('a[data-tarjeta-de-cierre="video"]');
            assert.ok(await ir.isVisible(), `${w}: la guía trae «Ir al vídeo»`);
            await ir.scrollIntoViewIfNeeded();
            await ir.click();
            await pag.waitForTimeout(1200);
            if (ROTO) {
                assert.equal(await cuerpo.locator("[data-guia-desplegada]").count(), 0, `${w}: antes «Ir al vídeo» cerraba la guía`);
                return;
            }
            assert.equal(await cuerpo.locator("[data-guia-desplegada]").count(), 1, `${w}: la guía sigue abierta`);
            const v = await cuerpo.locator("[data-caja-del-video]").evaluate((e) => {
                const r = e.getBoundingClientRect();
                return { arriba: r.top, abajo: r.bottom };
            });
            assert.ok(v.arriba >= 0 && v.arriba < 900 / 2, `${w}: el video no quedó a la vista (${v.arriba})`);
            assert.equal(await pag.evaluate(() => window.scrollY), 0, `${w}: se desplazó la ventana`);
        },
        { anchos: [[1440, 900]] },
    );
});
