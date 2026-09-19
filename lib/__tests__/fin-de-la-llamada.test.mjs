/**
 * El fin de una llamada de WhatsApp.
 *
 * Los cuatro invariantes que este banco protege:
 *
 *   1. **Que falte informacion NUNCA cuelga.** Sin rastro, sin parte del
 *      proveedor, con un estado de conexion que no se reconoce: se sigue
 *      hablando. Colgarle a alguien por no saber es peor que el fallo original.
 *   2. **La duracion se cuenta hasta que se CORTO el audio**, no hasta que nos
 *      enteramos. Si no, cada llamada sale unos segundos mas larga de lo que
 *      fue y los informes cuentan un tiempo que nadie paso al telefono.
 *   3. **Un bache no es un corte.** Hay gracia, y `disconnected` tiene la suya
 *      aparte porque se recupera solo.
 *   4. **`segundos` sin decir NO es cero.** Un proveedor que no pone el campo
 *      no esta diciendo que la llamada duro nada.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/fin-de-la-llamada.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --lib es2022,dom \
 *     --moduleResolution bundler --skipLibCheck
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    GRACIA_SIN_AUDIO_MS,
    elAudioSeCorto,
    loQueDiceLaConexion,
    loQueDiceMeta,
    losSegundosHablados,
    rastrearElAudio,
} from "./.compilado/fin-de-la-llamada.js";

// ── 1. No saber nunca cuelga ────────────────────────────────────────────────

test("sin rastro no se cuelga", () => {
    assert.equal(elAudioSeCorto(null, 999_999), false);
});

test("un estado de conexion desconocido deja seguir", () => {
    assert.equal(loQueDiceLaConexion("connected"), "sigue");
    assert.equal(loQueDiceLaConexion("connecting"), "sigue");
    assert.equal(loQueDiceLaConexion("new"), "sigue");
    assert.equal(loQueDiceLaConexion("lo-que-sea"), "sigue");
});

test("un parte que no es de fin no termina nada", () => {
    assert.equal(loQueDiceMeta(null), null);
    assert.equal(loQueDiceMeta(undefined), null);
    assert.equal(loQueDiceMeta("terminate"), null);
    assert.equal(loQueDiceMeta({ event: "connect", status: "RINGING" }), null);
    // Sin `event` no se da por terminada aunque traiga estado.
    assert.equal(loQueDiceMeta({ status: "FAILED" }), null);
});

// ── 2. La duracion es la de verdad ──────────────────────────────────────────

test("los segundos se cuentan hasta que se corto, no hasta ahora", () => {
    const contesto = 1_000_000;
    const seCorto = contesto + 83_000;
    const nosEnteramos = seCorto + GRACIA_SIN_AUDIO_MS;

    assert.equal(losSegundosHablados(contesto, seCorto), 83);
    // Y esto es lo que NO se puede escribir en el registro:
    assert.equal(losSegundosHablados(contesto, nosEnteramos), 89);
});

test("el rastro guarda el reloj del ultimo byte NUEVO", () => {
    let r = rastrearElAudio(null, 0, 1_000);
    r = rastrearElAudio(r, 500, 2_000); // llega audio
    r = rastrearElAudio(r, 900, 3_000); // sigue llegando
    r = rastrearElAudio(r, 900, 4_000); // silencio
    r = rastrearElAudio(r, 900, 9_000); // silencio
    assert.equal(r.desdeMs, 3_000, "el reloj se queda en el ultimo byte nuevo");
    assert.equal(r.bytes, 900);
});

test("nunca cuelga por un contador que baja", () => {
    let r = rastrearElAudio(null, 5_000, 1_000);
    r = rastrearElAudio(r, 12, 2_000); // reinicio raro
    assert.equal(r.desdeMs, 2_000, "un numero raro se toma como novedad");
    assert.equal(elAudioSeCorto(r, 2_000), false);
});

// ── 3. Un bache no es un corte ──────────────────────────────────────────────

test("un bache corto no corta la llamada", () => {
    let r = rastrearElAudio(null, 1_000, 10_000);
    r = rastrearElAudio(r, 1_000, 12_000); // dos segundos callado
    assert.equal(elAudioSeCorto(r, 12_000), false);
    r = rastrearElAudio(r, 1_400, 12_500); // vuelve
    assert.equal(elAudioSeCorto(r, 18_000), false);
});

test("el silencio sostenido si corta, y justo en la gracia", () => {
    const r = rastrearElAudio(null, 1_000, 10_000);
    assert.equal(elAudioSeCorto(r, 10_000 + GRACIA_SIN_AUDIO_MS - 1), false);
    assert.equal(elAudioSeCorto(r, 10_000 + GRACIA_SIN_AUDIO_MS), true);
});

test("failed y closed son firmes; disconnected espera", () => {
    assert.equal(loQueDiceLaConexion("failed"), "cortada");
    assert.equal(loQueDiceLaConexion("closed"), "cortada");
    assert.equal(loQueDiceLaConexion("disconnected"), "espera");
});

// ── 4. El parte de Meta ─────────────────────────────────────────────────────

test("una llamada completada trae sus segundos", () => {
    const d = loQueDiceMeta({ event: "terminate", status: "COMPLETED", duration: 83 });
    assert.equal(d.terminada, true);
    assert.equal(d.fallo, false);
    assert.equal(d.segundos, 83);
});

test("la duracion en texto tambien vale, y se redondea hacia abajo", () => {
    assert.equal(loQueDiceMeta({ event: "terminate", status: "COMPLETED", duration: "42" }).segundos, 42);
    assert.equal(loQueDiceMeta({ event: "terminate", status: "COMPLETED", duration: 42.9 }).segundos, 42);
});

test("sin duracion NO es cero", () => {
    const d = loQueDiceMeta({ event: "terminate", status: "COMPLETED" });
    assert.equal(d.segundos, undefined, "no decirlo no es decir cero");
    // Y una duracion que no es un numero tampoco se cuela como cero.
    assert.equal(loQueDiceMeta({ event: "terminate", status: "COMPLETED", duration: "ayer" }).segundos, undefined);
    assert.equal(loQueDiceMeta({ event: "terminate", status: "COMPLETED", duration: -5 }).segundos, undefined);
});

test("el motivo sale con las palabras del proveedor, no con las nuestras", () => {
    const d = loQueDiceMeta({
        event: "terminate",
        status: "FAILED",
        errors: [{ message: "The user rejected the call." }],
    });
    assert.equal(d.fallo, true);
    assert.equal(d.motivo, "The user rejected the call.");
});

test("sin errores no se inventa un motivo", () => {
    assert.equal(loQueDiceMeta({ event: "terminate", status: "FAILED" }).motivo, undefined);
    assert.equal(loQueDiceMeta({ event: "terminate", status: "FAILED", errors: [] }).motivo, undefined);
});

test("un estado que no conocemos se trata como fallo, que es el lado que EXPLICA", () => {
    // Callarse un final raro es lo que hace que el asesor no sepa que paso.
    assert.equal(loQueDiceMeta({ event: "terminate", status: "VETE_A_SABER" }).fallo, true);
    assert.equal(loQueDiceMeta({ event: "terminate" }).fallo, true);
});

test("el evento y el estado se leen sin importar la caja", () => {
    const d = loQueDiceMeta({ event: "TERMINATE", status: "completed", duration: 7 });
    assert.equal(d.terminada, true);
    assert.equal(d.fallo, false);
    assert.equal(d.segundos, 7);
});
