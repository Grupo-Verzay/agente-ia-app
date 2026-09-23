/**
 * Voz o video en la llamada del chat de equipo: la regla, sin navegador.
 *
 *   1. En VOZ no hay cámara ni pantalla compartida: hay «subir a video».
 *   2. En VIDEO, cámara y pantalla — y ya no se ofrece subir.
 *   3. Una petición de video la contesta quien NO la pidió.
 *   4. Un rechazo se deduce (esperaba → nada, sin pasar a video).
 *   5. Lo que no se reconozca como modo es VOZ: equivocarse hacia video le
 *      encendería la cámara a quien solo quería hablar.
 *
 * Y un barrido del componente: que la ventana saque sus mandos de
 * `losMandosDeLaLlamada` y que el botón de plegar no vaya `absolute` encima de
 * la tarjeta. `MODO=roto` lee la ventana de `ANTES_REF` con `git show` y
 * afirma los dos fallos en ella.
 *
 * Se levanta con `scripts/banco-llamada-de-equipo.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
    comoModo,
    laPeticionDeVideo,
    losMandosDeLaLlamada,
    meRechazaronElVideo,
    nombreDelModo,
} from "./.compilado/modo-de-la-llamada.js";
import { comoSeCuentaLaLlamada } from "./.compilado/llamada-de-voz.js";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ANTES_REF = process.env.ANTES_REF || "a15b609";

function laVentana() {
    if (!ROTO) return fs.readFileSync(join(RAIZ, "components/chat-equipo/LaLlamada.tsx"), "utf8");
    return execFileSync("git", ["show", `${ANTES_REF}:components/chat-equipo/LaLlamada.tsx`], {
        cwd: RAIZ,
        encoding: "utf8",
    });
}

// ── La regla ────────────────────────────────────────────────────────────────

test("en VOZ: micro, subir a video y colgar — ni cámara ni pantalla", () => {
    const m = losMandosDeLaLlamada("voz", true);
    assert.deepEqual(m, ["micro", "subirAVideo", "colgar"]);
    assert.ok(!m.includes("pantalla"));
    assert.ok(!m.includes("camara"));
});

test("en VIDEO: micro, cámara, pantalla y colgar — ya no se ofrece subir", () => {
    const m = losMandosDeLaLlamada("video", true);
    assert.deepEqual(m, ["micro", "camara", "pantalla", "colgar"]);
    assert.ok(!m.includes("subirAVideo"));
});

test("sin conectar solo se cuelga, sea el modo que sea", () => {
    assert.deepEqual(losMandosDeLaLlamada("voz", false), ["colgar"]);
    assert.deepEqual(losMandosDeLaLlamada("video", false), ["colgar"]);
});

test("compartir pantalla NUNCA aparece en voz, en ningún estado", () => {
    for (const conectada of [true, false]) {
        assert.ok(!losMandosDeLaLlamada("voz", conectada).includes("pantalla"));
    }
});

test("lo que no se reconoce como modo es VOZ", () => {
    for (const v of [undefined, null, "", "VIDEO", "videollamada", 1, {}]) {
        assert.equal(comoModo(v), "voz", String(v));
    }
    assert.equal(comoModo("video"), "video");
});

test("la petición de video: la pidió uno, la decide el OTRO", () => {
    assert.equal(laPeticionDeVideo("voz", "ana", "ana"), "esperando");
    assert.equal(laPeticionDeVideo("voz", "ana", "beto"), "decidir");
    assert.equal(laPeticionDeVideo("voz", null, "beto"), "nada");
    // En video una petición colgada no significa nada y no se enseña.
    assert.equal(laPeticionDeVideo("video", "ana", "beto"), "nada");
});

test("un rechazo se deduce: esperaba, ya no hay petición, y sigue en voz", () => {
    assert.equal(meRechazaronElVideo("esperando", "nada", "voz"), true);
    // Aceptaron: no es un rechazo.
    assert.equal(meRechazaronElVideo("esperando", "nada", "video"), false);
    // Nunca pedí nada: tampoco.
    assert.equal(meRechazaronElVideo("nada", "nada", "voz"), false);
    assert.equal(meRechazaronElVideo("decidir", "nada", "voz"), false);
});

test("el directo anota cada llamada con su modo", () => {
    assert.equal(nombreDelModo("voz"), "Llamada de voz");
    assert.equal(nombreDelModo("video"), "Videollamada");
    assert.equal(comoSeCuentaLaLlamada("contestada", 187, "video"), "Videollamada · 3:07");
    // Sin modo, como siempre: los registros de antes no cambian.
    assert.equal(comoSeCuentaLaLlamada("contestada", 187), "Llamada de voz · 3:07");
    assert.equal(comoSeCuentaLaLlamada("rechazada", 0, "video"), "Videollamada · rechazada");
});

// ── El componente ───────────────────────────────────────────────────────────

test("la ventana saca sus mandos de la regla, no de una lista fija", () => {
    const src = laVentana();
    if (ROTO) {
        // ANTES: pantalla compartida pintada sin mirar ningún modo.
        assert.ok(!src.includes("losMandosDeLaLlamada"), "antes no había regla");
        assert.ok(src.includes("medios.alternarPantalla()"), "y la pantalla estaba siempre");
        return;
    }
    assert.ok(src.includes("losMandosDeLaLlamada(modo"), "usa la regla");
    const pantalla = src.indexOf("medios.alternarPantalla()");
    assert.ok(pantalla > src.indexOf('case "pantalla"'), "la pantalla solo sale por su caso");
});

test("el botón de plegar no va flotando encima de la tarjeta", () => {
    const src = laVentana();
    const i = src.indexOf('aria-label="Plegar la llamada"');
    assert.ok(i > 0);
    const trozo = src.slice(Math.max(0, i - 700), i);
    if (ROTO) {
        // ANTES: `absolute` en la esquina, que con imagen es el video.
        assert.match(trozo, /absolute right-2 top-2/);
        return;
    }
    assert.doesNotMatch(trozo, /absolute right-2 top-2/);
});
