/**
 * La etapa del embudo, pintada por la fila (`ChatContactItem`) y la cabecera
 * (`ChatHeader`) REALES sobre el CSS del build.
 *
 * Lo que se mide, y por qué no se puede contestar leyendo el código:
 *
 *   1. La pastilla de etapa es **igual** a la del estado: mismo alto, misma
 *      letra, mismo redondeo y mismo relleno. Son dos componentes distintos, y
 *      un par de píxeles de diferencia se lee como una fila descuadrada.
 *   2. Va la PRIMERA —delante del estado y de «Asignar»—, medido en píxeles
 *      y no por el orden del JSX.
 *   3. El texto se recorta y el nombre entero se lee en el globo (`title`).
 *   4. La fila **no se desborda** por largo que sea el nombre, ni con letras
 *      anchas, que es lo que el recorte por caracteres no acota.
 *   5. Sin embudo no hay pastilla, y tampoco un hueco.
 *   6. En la cabecera, el botón mide lo que sus vecinos (28×28), no lleva
 *      rótulo, y su icono toma el color de la etapa.
 *
 * `MODO=roto` pinta el mismo arnés con los componentes de `ANTES_REF` y afirma
 * el fallo: ninguna pastilla en la fila y un botón con el nombre escrito que se
 * come el ancho de sus vecinos. Se levanta con
 * `scripts/banco-pastilla-de-etapa.sh`.
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
const HARNESS = join(AQUI, ".compilado", "pastilla-de-etapa.js");
const CSS_FICHERO = process.env.CSS_DEL_BANCO;
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = CSS_FICHERO
    ? fs.readFileSync(CSS_FICHERO, "utf8")
    : fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n");

const ANCHURAS = [1440, 1280, 1024];
const ETAPA_LARGA = "Esperando respuesta del cliente final";

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS}</style>` +
                    `<style>@font-face{font-family:__poppins;src:url(/p400.woff2);font-weight:400}` +
                    `@font-face{font-family:__poppins;src:url(/p700.woff2);font-weight:700}` +
                    `@font-face{font-family:__poppins_Fallback;src:local("Arial")}` +
                    `body{font-family:__poppins,__poppins_Fallback}</style>` +
                    `<style>html,body{margin:0;height:100%;overflow:hidden}</style>` +
                    // Las animaciones de Radix mueven y encogen lo que se mide.
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

/** Lo que se mide de cada nodo: su caja y cómo está pintado. */
function medir() {
    const de = (n) => {
        if (!n) return null;
        const r = n.getBoundingClientRect();
        const e = getComputedStyle(n);
        return {
            l: Math.round(r.left * 10) / 10,
            r: Math.round(r.right * 10) / 10,
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            letra: e.fontSize,
            peso: e.fontWeight,
            familia: e.fontFamily,
            redondeo: e.borderTopLeftRadius,
            relleno: `${e.paddingLeft}|${e.paddingRight}`,
            borde: e.borderTopWidth,
            texto: (n.textContent ?? "").trim(),
            title: n.getAttribute("title") ?? "",
            color: e.color,
        };
    };

    const filas = {};
    for (const raiz of document.querySelectorAll("[data-fila]")) {
        const id = raiz.getAttribute("data-fila");
        // La de estado es lo que pinta el disparador del selector de lead.
        const disparadorEstado = raiz.querySelector('[aria-label="Cambiar estado del lead"]');
        const estado = disparadorEstado?.querySelector("span") ?? null;
        const etapa = raiz.querySelector("[data-pastilla-de-etapa]");
        let asignar = null;
        for (const n of raiz.querySelectorAll("span")) {
            if ((n.textContent ?? "").trim() === "Asignar") asignar = n.closest("button") ?? n;
        }
        // La caja donde viven las pastillas, para saber si la fila desborda.
        // Por su marca donde la hay: cada pastilla vive dentro de un
        // envoltorio que dice su posición, así que el padre de la etapa ya no
        // es el renglón —y midiéndolo, una fila con etapa y otra sin ella
        // saldrían con altos distintos por comparar cajas que no son la misma—.
        const caja =
            raiz.querySelector("[data-renglon-de-pastillas]") ??
            etapa?.parentElement ??
            estado?.closest("div") ??
            raiz;
        filas[id] = {
            estado: de(estado),
            etapa: de(etapa),
            asignar: de(asignar),
            hayEtapa: Boolean(etapa),
            desbordaLaFila: raiz.scrollWidth > raiz.clientWidth + 1,
            desbordaLaCaja: caja.scrollWidth > caja.clientWidth + 1,
            altoDeLaCaja: Math.round(caja.getBoundingClientRect().height),
        };
    }

    const cabeceras = {};
    for (const raiz of document.querySelectorAll("[data-cabecera]")) {
        const id = raiz.getAttribute("data-cabecera");
        // Por `aria-label` y por `title`: el «antes» no tenía el primero, y sin
        // el segundo el modo roto no encontraría el botón que viene a medir.
        const boton =
            raiz.querySelector('[aria-label="Etapa del embudo"]') ??
            raiz.querySelector('[title="Etapa del embudo"]');
        const vecino = raiz.querySelector('[title="Nueva tarea"]');
        const glifo = boton?.querySelector("svg") ?? null;
        cabeceras[id] = {
            boton: de(boton),
            vecino: de(vecino),
            colorDelGlifo: glifo ? getComputedStyle(glifo).color : null,
            desborda: raiz.scrollWidth > raiz.clientWidth + 1,
        };
    }

    return { filas, cabeceras };
}

async function tomar(ancho) {
    const server = await levantar();
    const { port } = server.address();
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--font-render-hinting=none"],
    });
    try {
        const page = await navegador.newPage({ viewport: { width: ancho, height: 1000 } });
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => window.listo === true, null, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        const datos = await page.evaluate(medir);
        if (errores.length) throw new Error(`la maqueta reventó: ${errores[0]}`);
        if (Object.keys(datos.filas).length !== 4) {
            throw new Error(`se esperaban 4 filas y se midieron ${Object.keys(datos.filas).length}`);
        }
        return datos;
    } finally {
        await navegador.close();
        server.close();
    }
}

const POR_ANCHURA = {};
for (const ancho of ANCHURAS) POR_ANCHURA[ancho] = await tomar(ancho);

test("la pastilla de etapa es la MISMA que la de estado", () => {
    for (const ancho of ANCHURAS) {
        for (const id of ["corta", "larga", "anchas"]) {
            const { estado, etapa } = POR_ANCHURA[ancho].filas[id];
            if (ROTO) {
                assert.equal(etapa, null, `el «antes» no tendría pastilla de etapa (${id})`);
                continue;
            }
            assert.ok(etapa, `falta la pastilla de etapa en ${id}`);
            assert.ok(estado, `falta la pastilla de estado en ${id}`);
            for (const campo of ["h", "letra", "peso", "familia", "redondeo", "relleno", "borde"]) {
                assert.equal(
                    etapa[campo],
                    estado[campo],
                    `${campo} distinto del de la pastilla de estado en ${id} a ${ancho}: ${etapa[campo]} vs ${estado[campo]}`,
                );
            }
        }
    }
});

test("va PRIMERA, delante del estado y de «Asignar»", () => {
    // El orden lo fijó el encargo de #957: la fila se lee en el mismo orden en
    // que se decide en el menú de la cabecera —primero en qué punto del embudo
    // está y después cómo de caliente—. Antes iba entre el estado y el asesor.
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        for (const id of ["corta", "larga", "anchas"]) {
            const { estado, etapa, asignar } = POR_ANCHURA[ancho].filas[id];
            assert.ok(asignar, `falta «Asignar» en ${id}`);
            assert.ok(etapa.r <= estado.l, `el estado va delante de la etapa en ${id} a ${ancho}`);
            assert.ok(estado.r <= asignar.l, `el estado va después de «Asignar» en ${id} a ${ancho}`);
        }
    }
});

test("el texto se recorta y el nombre entero se lee en el globo", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const larga = POR_ANCHURA[ancho].filas.larga.etapa;
        assert.equal(larga.title, ETAPA_LARGA, "el globo tiene que traer el nombre completo");
        assert.ok(larga.texto.endsWith("…"), `el texto tendría que acabar en …: «${larga.texto}»`);
        assert.ok(larga.texto.length <= 14, `«${larga.texto}» pasa de 14 caracteres`);

        const corta = POR_ANCHURA[ancho].filas.corta.etapa;
        assert.equal(corta.texto, "Nuevo", "un nombre que cabe no se toca");
        assert.equal(corta.title, "Nuevo");
    }
});

test("un poco más ancha que «Sin clasificar», y sin recortar dos veces", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const { filas } = POR_ANCHURA[ancho];
        // La referencia del encargo es la pastilla vacía de al lado.
        const referencia = filas.sin_etapa.estado.w;
        assert.equal(filas.sin_etapa.estado.texto, "Sin clasificar", "la referencia no es la esperada");

        // El tope de ancho lo marca el peor caso: 14 letras anchas, que es lo
        // único que el recorte por caracteres no acota.
        const tope = filas.anchas.etapa.w;
        assert.ok(tope > referencia, `el tope (${tope}) tendría que dar algo más que ${referencia}`);
        assert.ok(
            tope <= referencia * 1.25,
            `el tope (${tope}) se pasa de «un poco más ancha» que ${referencia}`,
        );

        // Y un nombre de 14 caracteres NORMALES cabe sin topar: si topara, se
        // estaría recortando dos veces —por caracteres y por ancho— y el
        // recorte de 14 no serviría de nada.
        const larga = filas.larga.etapa.w;
        assert.equal(filas.larga.etapa.texto.length, 14, "el caso largo tendría que recortarse a 14");
        assert.ok(larga > referencia, `la pastilla larga (${larga}) no llega a la referencia`);
        assert.ok(larga < tope, `un nombre de 14 caracteres (${larga}) topa contra el ancho (${tope})`);
    }
});

test("la fila no se desborda con ningún nombre", () => {
    for (const ancho of ANCHURAS) {
        for (const [id, fila] of Object.entries(POR_ANCHURA[ancho].filas)) {
            assert.equal(fila.desbordaLaFila, false, `la fila ${id} se desborda a ${ancho}`);
            assert.equal(fila.desbordaLaCaja, false, `las pastillas de ${id} se desbordan a ${ancho}`);
        }
    }
});

test("sin embudo no hay pastilla, y la fila mide lo mismo", () => {
    for (const ancho of ANCHURAS) {
        const { filas } = POR_ANCHURA[ancho];
        assert.equal(filas.sin_etapa.hayEtapa, false, "una cuenta sin embudos no pinta pastilla");
        // Ni deja su hueco: la fila reparte con `gap`, así que lo que no está no
        // ocupa. Con la pastilla puesta, la caja sigue midiendo lo mismo.
        assert.equal(
            filas.sin_etapa.altoDeLaCaja,
            filas.corta.altoDeLaCaja,
            `la fila cambia de alto según tenga etapa o no, a ${ancho}`,
        );
    }
});

test("en la cabecera es un control de icono más, del tamaño de sus vecinos", () => {
    for (const ancho of ANCHURAS) {
        const { boton, vecino } = POR_ANCHURA[ancho].cabeceras.con_etapa;
        assert.ok(vecino, "no se encuentra el vecino con el que comparar");
        if (ROTO) {
            assert.ok(
                boton.texto.length > 0,
                "el «antes» tendría el nombre de la etapa escrito en el botón",
            );
            assert.ok(
                boton.w > vecino.w + 8,
                `el «antes» se comía el ancho de sus vecinos: ${boton.w} contra ${vecino.w}`,
            );
            continue;
        }
        assert.ok(boton, "falta el botón de etapa en la cabecera");
        assert.equal(boton.texto, "", "el botón no puede llevar rótulo");
        assert.equal(boton.w, vecino.w, `ancho distinto del de sus vecinos a ${ancho}`);
        assert.equal(boton.h, vecino.h, `alto distinto del de sus vecinos a ${ancho}`);
        assert.equal(boton.title, `Etapa · ${ETAPA_LARGA}`, "el globo lleva el nombre completo");
    }
});

test("el icono toma el color de la etapa, y sin etapa se queda neutro", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const con = POR_ANCHURA[ancho].cabeceras.con_etapa;
        const sin = POR_ANCHURA[ancho].cabeceras.sin_etapa;
        assert.ok(con.colorDelGlifo, "el icono de la etapa no se encuentra");
        assert.notEqual(
            con.colorDelGlifo,
            sin.colorDelGlifo,
            `el icono pinta igual con etapa y sin ella a ${ancho}`,
        );
        assert.equal(sin.boton.title, "Etapa del embudo", "sin etapa el globo lo dice");
    }
});

test("las dos cabeceras siguen sin desbordarse", () => {
    for (const ancho of ANCHURAS) {
        for (const [id, c] of Object.entries(POR_ANCHURA[ancho].cabeceras)) {
            assert.equal(c.desborda, false, `la cabecera ${id} se desborda a ${ancho}`);
        }
    }
});
