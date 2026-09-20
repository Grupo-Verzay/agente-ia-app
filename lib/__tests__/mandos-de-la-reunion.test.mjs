/**
 * Cuando se ven los mandos de una reunion, y cuando se apartan.
 *
 * Lo que este banco protege, que son las tres formas de romperlo:
 *
 *   1. **Se apartan solos pasado el plazo, y vuelven con cualquier senal.** Es
 *      el encargo entero: el video ocupa toda la caja y las barras flotan
 *      encima, asi que si no se apartaran taparian la imagen para siempre.
 *   2. **Un motivo gana al reloj.** Con un menu abierto o el puntero encima no
 *      se apartan por muchos segundos que pasen — un menu anclado a un boton
 *      que ya no se ve es lo que rompe esto de la forma mas fea.
 *   3. **Con los mandos ESCONDIDOS no se frena ninguna senal.** El freno existe
 *      para no reprogramar un temporizador sesenta veces por segundo, y eso
 *      solo tiene sentido con los mandos puestos: escondidos, la senal es lo
 *      unico que los devuelve, y tragarsela 250 ms se nota como un raton que no
 *      responde.
 *
 * Y el invariante que junta los dos: **lo que el freno deja pasar es siempre
 * suficiente para que no se escondan**, o sea que el freno nunca puede ser el
 * motivo de que los mandos se aparten con alguien moviendo el raton.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/mandos-de-la-reunion.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --lib es2022,dom \
 *     --moduleResolution bundler --skipLibCheck
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    CADA_CUANTO_SE_ESCONDEN_MS,
    FRENO_DE_LAS_SENALES_MS,
    hayQueAtenderLaSenal,
    seVenLosMandos,
} from "./.compilado/mandos-de-la-reunion.js";

const T0 = 1_000_000;
const seVen = (extra) =>
    seVenLosMandos({ ultimaSenal: T0, ahora: T0 + extra, motivos: [], activo: true });

test("recien movido se ven, y pasado el plazo se apartan", () => {
    assert.equal(seVen(0), true);
    assert.equal(seVen(CADA_CUANTO_SE_ESCONDEN_MS - 1), true);
    assert.equal(seVen(CADA_CUANTO_SE_ESCONDEN_MS), false);
    assert.equal(seVen(CADA_CUANTO_SE_ESCONDEN_MS * 10), false);
});

test("un motivo gana al reloj, por muchos segundos que pasen", () => {
    for (const motivos of [["menu"], ["encima"], ["menu", "encima"]]) {
        assert.equal(
            seVenLosMandos({
                ultimaSenal: T0,
                ahora: T0 + CADA_CUANTO_SE_ESCONDEN_MS * 100,
                motivos,
                activo: true,
            }),
            true,
            `con ${motivos.join("+")} no se pueden apartar`,
        );
    }
});

test("quitado el motivo, el reloj vuelve a mandar", () => {
    assert.equal(
        seVenLosMandos({
            ultimaSenal: T0,
            ahora: T0 + CADA_CUANTO_SE_ESCONDEN_MS,
            motivos: [],
            activo: true,
        }),
        false,
    );
});

test("apagado se ven SIEMPRE: plegada no hay mandos que esconder", () => {
    // Dejarlos escondidos ahi es empezar la vuelta siguiente sin ellos.
    assert.equal(
        seVenLosMandos({
            ultimaSenal: T0,
            ahora: T0 + CADA_CUANTO_SE_ESCONDEN_MS * 100,
            motivos: [],
            activo: false,
        }),
        true,
    );
});

test("escondidos NO se frena ninguna senal", () => {
    // Cero milisegundos desde la anterior: con los mandos escondidos, esa senal
    // es lo unico que los devuelve.
    assert.equal(hayQueAtenderLaSenal({ seVen: false, ultimaSenal: T0, ahora: T0 }), true);
    assert.equal(
        hayQueAtenderLaSenal({ seVen: false, ultimaSenal: T0, ahora: T0 + 1 }),
        true,
    );
});

test("puestos se frena, para no reprogramar sesenta veces por segundo", () => {
    assert.equal(hayQueAtenderLaSenal({ seVen: true, ultimaSenal: T0, ahora: T0 + 16 }), false);
    assert.equal(
        hayQueAtenderLaSenal({
            seVen: true,
            ultimaSenal: T0,
            ahora: T0 + FRENO_DE_LAS_SENALES_MS - 1,
        }),
        false,
    );
    assert.equal(
        hayQueAtenderLaSenal({
            seVen: true,
            ultimaSenal: T0,
            ahora: T0 + FRENO_DE_LAS_SENALES_MS,
        }),
        true,
    );
});

test("el freno NUNCA puede ser el motivo de que se aparten", () => {
    // El invariante que junta las dos funciones: si alguien mueve el raton sin
    // parar, entre dos senales atendidas pasa como mucho el freno, y el freno
    // tiene que quedarse muy por debajo del plazo. Si algun dia se igualaran,
    // los mandos se apartarian con alguien moviendo el raton encima de ellos.
    assert.ok(
        FRENO_DE_LAS_SENALES_MS < CADA_CUANTO_SE_ESCONDEN_MS,
        "el freno tiene que ser menor que el plazo",
    );

    // Y se ejerce: raton moviendose cada 16 ms durante diez segundos.
    let ultimaAtendida = T0;
    for (let t = T0; t <= T0 + 10_000; t += 16) {
        const visto = seVenLosMandos({
            ultimaSenal: ultimaAtendida,
            ahora: t,
            motivos: [],
            activo: true,
        });
        assert.equal(visto, true, `a los ${t - T0} ms se apartaron con el raton moviendose`);
        if (hayQueAtenderLaSenal({ seVen: visto, ultimaSenal: ultimaAtendida, ahora: t })) {
            ultimaAtendida = t;
        }
    }
});

test("y parado el raton, se apartan de verdad", () => {
    // La otra mitad del anterior: el bucle de arriba no puede estar pasando
    // porque la funcion devuelva `true` siempre.
    let ultimaAtendida = T0;
    for (let t = T0; t <= T0 + 200; t += 16) {
        if (hayQueAtenderLaSenal({ seVen: true, ultimaSenal: ultimaAtendida, ahora: t })) {
            ultimaAtendida = t;
        }
    }
    assert.equal(
        seVenLosMandos({
            ultimaSenal: ultimaAtendida,
            ahora: ultimaAtendida + CADA_CUANTO_SE_ESCONDEN_MS,
            motivos: [],
            activo: true,
        }),
        false,
    );
});
