/**
 * El banco del seguimiento «Llamada con IA», sin navegador y en dos modos.
 *
 * El fallo que el modo roto afirma es el que se cometió al escribir esto y que
 * ningún tipo habría cazado: el tipo base de un nodo de seguimiento salía de
 * `tipo.split('-')[1]`, que con los cinco tipos de siempre —`seguimiento-text`,
 * `seguimiento-image`…— daba lo correcto y con el PRIMERO cuyo nombre lleva un
 * guion dentro devuelve `ai`. Un tipo que no existe, así que la tarjeta se caía
 * al caso por defecto y pedía subir un archivo para hacer una llamada.
 *
 *   MODO=roto  → `tipo.split('-')[1]`, y la paleta sin la entrada nueva.
 *   (sin MODO) → lo que corre.
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import {
    LLAMADA_INMEDIATA,
    PREFIJO_SEGUIMIENTO,
    SEGUIMIENTO_DE_LLAMADA,
    esSeguimiento,
    esSeguimientoDeLlamada,
    lanzaLlamadaConIa,
    tipoBaseDelNodo,
} from "./.compilado/seguimiento/seguimiento-de-llamada.js";

const ROTO = process.env.MODO === "roto";

/** Cómo se sacaba el tipo base antes: el primer trozo hasta el guion. */
const comoSeSacabaAntes = (tipo) => String(tipo ?? "").split("-")[1] ?? "";
const tipoBase = ROTO ? comoSeSacabaAntes : tipoBaseDelNodo;

test("de un seguimiento sale su tipo base", () => {
    // Estos cinco daban lo mismo con las dos formas, y por eso el fallo estuvo
    // escondido hasta que apareció un tipo con un guion dentro.
    for (const [nodo, base] of [
        ["seguimiento-text", "text"],
        ["seguimiento-image", "image"],
        ["seguimiento-video", "video"],
        ["seguimiento-document", "document"],
        ["seguimiento-audio", "audio"],
    ]) {
        assert.equal(tipoBase(nodo), base, nodo);
    }
});

test("y de la llamada con IA sale `ai-call`, no `ai`", () => {
    if (ROTO) {
        // El fallo: un tipo que no existe en ninguna paleta, así que la tarjeta
        // se cae al caso por defecto.
        assert.equal(tipoBase(SEGUIMIENTO_DE_LLAMADA), "ai");
        return;
    }
    assert.equal(tipoBase(SEGUIMIENTO_DE_LLAMADA), LLAMADA_INMEDIATA);
});

test("la ACCIÓN inmediata no es un seguimiento, y no cambia", () => {
    assert.equal(esSeguimiento(LLAMADA_INMEDIATA), false);
    assert.equal(esSeguimientoDeLlamada(LLAMADA_INMEDIATA), false);
    // Un nodo que no lleva el prefijo se devuelve tal cual: la acción inmediata
    // sigue resolviéndose a `ai-call` y su tarjeta no se mueve.
    assert.equal(tipoBaseDelNodo(LLAMADA_INMEDIATA), LLAMADA_INMEDIATA);
});

test("las DOS puertas lanzan la misma llamada", () => {
    assert.equal(lanzaLlamadaConIa(LLAMADA_INMEDIATA), true);
    assert.equal(lanzaLlamadaConIa(SEGUIMIENTO_DE_LLAMADA), true);
    assert.equal(lanzaLlamadaConIa("seguimiento-text"), false);
    assert.equal(lanzaLlamadaConIa(""), false);
    assert.equal(lanzaLlamadaConIa(null), false);
});

test("lo que llega sucio no rompe la decisión", () => {
    // El tipo sale de la base y de un formulario: espacios y mayúsculas entran.
    assert.equal(esSeguimientoDeLlamada("  Seguimiento-AI-Call "), true);
    assert.equal(tipoBaseDelNodo("  SEGUIMIENTO-TEXT "), "text");
    assert.equal(esSeguimiento(undefined), false);
    assert.equal(tipoBaseDelNodo(undefined), "");
});

test("el prefijo se quita ENTERO, no el primer trozo", () => {
    // La condición de la que cuelga todo lo de arriba, escrita como invariante:
    // si alguien vuelve a cortar por el guion, esto salta aunque los cinco
    // tipos de siempre sigan pasando.
    assert.equal(
        tipoBaseDelNodo(`${PREFIJO_SEGUIMIENTO}uno-dos-tres`),
        "uno-dos-tres",
    );
});

// ── Y la paleta y el candado por plan tienen que nombrarlo los DOS ──
//
// Con la entrada solo en la paleta, el nodo se puede poner y el candado por
// plan no lo conoce: se ofrecería siempre, aunque el plan no lo incluya. Con la
// entrada solo en el catálogo, sale en la tabla de Admin y no hay forma de
// ponerlo. Se lee el fichero como TEXTO porque `types/workflow-node.ts` importa
// iconos de `lucide-react` y no compila suelto.
//
// El «antes» sale de `origin/main` con `git show`, no de una copia escrita
// aquí: copiada a mano, el modo roto comprobaría lo que alguien recuerda de la
// paleta vieja.

const deOrigin = (ruta) =>
    execFileSync("git", ["show", `origin/main:${ruta}`], { encoding: "utf8" });

const paleta = ROTO
    ? deOrigin("types/workflow-node.ts")
    : readFileSync(new URL("../../types/workflow-node.ts", import.meta.url), "utf8");
const catalogo = ROTO
    ? deOrigin("lib/workflow-features.ts")
    : readFileSync(new URL("../workflow-features.ts", import.meta.url), "utf8");

test("la paleta de Seguimientos ofrece la llamada con IA", () => {
    if (ROTO) {
        // El «antes»: «Llamar con IA (voz)» existía solo como ACCIÓN, así que
        // ninguna de las dos listas de Seguimientos lo nombraba.
        assert.equal(paleta.includes(`"${SEGUIMIENTO_DE_LLAMADA}"`), false);
        return;
    }
    const enSeguimientos = paleta.slice(paleta.indexOf("seguimientoActions"));
    assert.ok(
        enSeguimientos.includes(`"${SEGUIMIENTO_DE_LLAMADA}"`),
        "seguimientoActions tiene que ofrecerlo, o no hay forma de ponerlo",
    );
    const enTarjeta = paleta.slice(paleta.indexOf("cardSeguimientoActions"));
    assert.ok(
        enTarjeta.includes(`"${SEGUIMIENTO_DE_LLAMADA}"`),
        "cardSeguimientoActions le da su icono a la tarjeta del lienzo",
    );
});

test("y el catálogo por plan lo nombra en su grupo", () => {
    if (ROTO) {
        assert.equal(catalogo.includes(SEGUIMIENTO_DE_LLAMADA), false);
    } else {
        assert.ok(
            catalogo.includes(
                `key: "${SEGUIMIENTO_DE_LLAMADA}", label: "Llamada con IA", group: "Seguimientos"`,
            ),
            "sin su fila en WORKFLOW_FEATURES el candado por plan no lo conoce",
        );
    }
    // La acción inmediata se queda donde estaba, en los dos modos: no se mueve
    // de grupo ni cambia de rótulo.
    assert.ok(
        catalogo.includes(
            `key: "${LLAMADA_INMEDIATA}", label: "Llamar con IA (voz)", group: "Automatizaciones"`,
        ),
    );
});
