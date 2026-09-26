/**
 * La CALIFICACIÓN de un lead en la fila de Chats, sin navegador.
 *
 * Aquí se prueba la decisión —cuándo se pinta la pastilla y qué se puede
 * guardar— y, sobre todo, el invariante que junta las dos mitades: **lo que
 * pinta una pastilla es exactamente lo que el menú ofrece**. Comprobar cada
 * lado por su cuenta no lo cazaría: los dos estarían «bien» y aun así el menú
 * podría dejar poner una calificación que la fila no enseña.
 *
 * Que la FILA use esta decisión es otra pregunta, y la contesta
 * `calificacion-del-lead.test.mjs` en un navegador.
 *
 * `MODO=roto` no cambia nada aquí: la función es nueva y no hay un «antes»
 * suyo que afirmar. Lo que el modo roto reproduce —la pastilla pintándose
 * siempre— vive en el componente.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
    LEAD_STATUS_FILTER_OPTIONS,
    LEAD_STATUS_LABELS,
    comoCalificacion,
    seVeLaCalificacion,
} from "./.compilado/calificacion-del-lead/reglas.js";

const CONOCIDAS = LEAD_STATUS_FILTER_OPTIONS.map((o) => o.value);

test("sin calificar NO se pinta: ni `null` ni `undefined`", () => {
    assert.equal(seVeLaCalificacion(null), false);
    assert.equal(seVeLaCalificacion(undefined), false);
    // Sin argumento es lo mismo que `undefined`: una sesión que nunca se
    // calificó y una a la que se le quitó la calificación son el mismo caso.
    assert.equal(seVeLaCalificacion(), false);
});

test("las cinco calificaciones de verdad SÍ se pintan", () => {
    for (const v of CONOCIDAS) {
        assert.equal(seVeLaCalificacion(v), true, `${v} tendría que pintarse`);
    }
    // Y son las cinco del encargo, ni una más ni una menos: si algún día entra
    // una sexta, este banco se pone rojo a propósito para que se decida qué
    // hace en la fila en vez de aparecer sola.
    assert.deepEqual(CONOCIDAS, ["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"]);
});

test("lo que pinta una pastilla es EXACTAMENTE lo que el menú ofrece", () => {
    // Encadenado, que es lo que un banco de cada lado por separado no dice:
    // se recorre lo que el menú ofrece y se exige que la fila lo enseñe.
    for (const opcion of LEAD_STATUS_FILTER_OPTIONS) {
        assert.equal(
            seVeLaCalificacion(opcion.value),
            true,
            `el menú ofrece ${opcion.value} y la fila no lo pintaría`,
        );
        // Y tiene rótulo con el que pintarla: una opción sin rótulo saldría en
        // la fila como una pastilla en blanco.
        assert.ok(LEAD_STATUS_LABELS[opcion.value], `${opcion.value} sin rótulo`);
    }
    // Y al revés: lo único que el menú ofrece de más es «Sin clasificar», que
    // es lo que la BORRA —y es justo lo que no pinta pastilla—.
    assert.equal(seVeLaCalificacion(null), false);
});

test("lo que llega de fuera no decide: lo que no se reconoce es «sin clasificar»", () => {
    for (const v of CONOCIDAS) assert.equal(comoCalificacion(v, CONOCIDAS), v);
    for (const basura of ["", "CALIENTITO", "frio", 0, 1, {}, [], true, null, undefined]) {
        assert.equal(
            comoCalificacion(basura, CONOCIDAS),
            null,
            `${JSON.stringify(basura)} tendría que caer en «sin clasificar»`,
        );
    }
});

test("el saneado y el pintado están de acuerdo", () => {
    // Todo lo que sobrevive al saneado se pinta, y lo que no, no. Sin esto se
    // podría guardar un valor que después ninguna pastilla sabe enseñar.
    for (const v of [...CONOCIDAS, "CALIENTITO", null, undefined, 7]) {
        const guardado = comoCalificacion(v, CONOCIDAS);
        assert.equal(
            seVeLaCalificacion(guardado),
            guardado !== null,
            `${JSON.stringify(v)} se guarda como ${JSON.stringify(guardado)}`,
        );
    }
});
