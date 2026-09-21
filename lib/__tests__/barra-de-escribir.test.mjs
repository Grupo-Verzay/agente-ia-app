/**
 * El banco de lo que DECIDE la barra de escribir, sin navegador.
 *
 * Corre en dos modos, y el roto **afirma el fallo reportado** — sin eso, lo
 * verde del normal no probaría que se arregló la causa:
 *
 *   MODO=roto  → la barra del chat de equipo tal como estaba: plegada siempre
 *                (nunca los tres botones en fila) y sin pegar del portapapeles.
 *   (sin MODO) → la decisión compartida.
 */
import { strict as assert } from "node:assert";
import test from "node:test";

import {
    archivosDelPortapapeles,
    losBotonesDeLaDerecha,
    rellenoDeLaCaja,
} from "./.compilado/barra/barra-de-escribir.js";

const ROTO = process.env.MODO === "roto";

/** La barra del chat de equipo antes de unificarla: plegada pasara lo que pasara. */
function comoEraElEquipo(e) {
    if (e.grabando) return ["nota"];
    if (e.dictando) return e.hayAlgoQueEnviar ? ["dictado", "enviar"] : ["dictado"];
    if (e.hayAlgoQueEnviar) return ["enviar"];
    return e.hayDictado ? ["menu"] : ["nota"];
}
const botones = ROTO ? comoEraElEquipo : losBotonesDeLaDerecha;

/** Y pegar, que allí no existía: la caja no llevaba ningún `onPaste`. */
const pegar = ROTO ? () => [] : archivosDelPortapapeles;

const ANCHA = {
    compacta: false,
    conVoz: true,
    hayDictado: true,
    dictando: false,
    grabando: false,
    hayAlgoQueEnviar: false,
};

test("con sitio salen los TRES en fila, como en Chats", () => {
    const fila = botones(ANCHA);
    if (ROTO) {
        // El fallo reportado: en la ruta a todo lo ancho salía UN botón donde
        // en la bandeja salen tres.
        assert.deepEqual(fila, ["menu"]);
        return;
    }
    assert.deepEqual(fila, ["dictado", "nota", "enviar"]);
});

test("y el hueco de la caja sale de esa MISMA lista", () => {
    const tres = losBotonesDeLaDerecha(ANCHA);
    assert.equal(rellenoDeLaCaja(tres.length), "pr-28");
    assert.equal(rellenoDeLaCaja(losBotonesDeLaDerecha({ ...ANCHA, compacta: true }).length), "pr-12");
    assert.equal(
        rellenoDeLaCaja(
            losBotonesDeLaDerecha({
                ...ANCHA,
                compacta: true,
                dictando: true,
                hayAlgoQueEnviar: true,
            }).length,
        ),
        "pr-[4.5rem]",
    );
});

test("sin dictado no hay menú: un menú con una sola cosa es un clic de más", () => {
    assert.deepEqual(
        losBotonesDeLaDerecha({ ...ANCHA, compacta: true, hayDictado: false }),
        ["nota"],
    );
    assert.deepEqual(losBotonesDeLaDerecha({ ...ANCHA, hayDictado: false }), [
        "nota",
        "enviar",
    ]);
});

test("grabando manda la grabación, y dictando no desaparece el botón de parar", () => {
    assert.deepEqual(
        losBotonesDeLaDerecha({ ...ANCHA, compacta: true, grabando: true }),
        ["nota"],
    );
    assert.deepEqual(
        losBotonesDeLaDerecha({
            ...ANCHA,
            compacta: true,
            dictando: true,
            hayAlgoQueEnviar: true,
        }),
        ["dictado", "enviar"],
    );
});

test("sin voz que ofrecer —previsualizando un audio, o editando— solo queda enviar", () => {
    assert.deepEqual(losBotonesDeLaDerecha({ ...ANCHA, conVoz: false }), ["enviar"]);
    assert.deepEqual(
        losBotonesDeLaDerecha({ ...ANCHA, compacta: true, conVoz: false }),
        ["enviar"],
    );
});

/* ─────────────────────────── pegar ─────────────────────────── */

function comoUnItem(kind, type, fichero) {
    return { kind, type, getAsFile: () => fichero };
}
const unaCaptura = { nombre: "captura" };

test("una captura pegada SE COGE", () => {
    const traidos = pegar([comoUnItem("file", "image/png", unaCaptura)]);
    if (ROTO) {
        // El fallo reportado tal cual: Ctrl+V con una captura no hacía nada.
        assert.deepEqual(traidos, []);
        return;
    }
    assert.deepEqual(traidos, [unaCaptura]);
});

test("pegar TEXTO no trae nada: sin eso, pegar dejaría de comportarse como siempre", () => {
    assert.deepEqual(
        archivosDelPortapapeles([comoUnItem("string", "text/plain", null)]),
        [],
    );
    assert.deepEqual(archivosDelPortapapeles(null), []);
    assert.deepEqual(archivosDelPortapapeles(undefined), []);
});

test("`soloImagenes` es la diferencia legítima entre las dos barras", () => {
    const pdf = { nombre: "factura.pdf" };
    const items = [
        comoUnItem("file", "application/pdf", pdf),
        comoUnItem("file", "image/png", unaCaptura),
    ];
    // Por WhatsApp se compone con imágenes.
    assert.deepEqual(archivosDelPortapapeles(items, { soloImagenes: true }), [unaCaptura]);
    // El chat de equipo admite cualquier fichero.
    assert.deepEqual(archivosDelPortapapeles(items), [pdf, unaCaptura]);
});

test("un item de fichero sin fichero dentro no cuela un hueco en la lista", () => {
    assert.deepEqual(archivosDelPortapapeles([comoUnItem("file", "image/png", null)]), []);
});
