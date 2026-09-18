/**
 * Banco del reparto en dos bloques de Actividad del equipo.
 *
 * Lo que de verdad decide si esta pantalla dice la verdad es UNA cosa: por qué
 * cuenta se reparte a cada persona. Hay dos candidatas y solo una es correcta —
 * la cuenta a la que PERTENECE, no aquella contra la que se guardó su rato— y
 * confundirlas no da ningún error: da un bloque de arriba corto y gente de la
 * casa saliendo dentro de un cliente.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { repartirEnDosBloques } from "../actividad-del-equipo.ts";

const CASA = ["grupo", "atencion", "ventas"];

function persona(id, cuentaId, extra = {}) {
    return {
        personaId: id,
        personaNombre: id,
        cuentaId,
        // `??` aquí no vale: un `cuentaNombre: null` a propósito se convertiría
        // en el id y el caso de la cuenta sin nombre no se llegaría a probar.
        cuentaNombre: "cuentaNombre" in extra ? extra.cuentaNombre : cuentaId,
        porSeccion: {},
        segundos: extra.segundos ?? 0,
        acciones: {},
    };
}

test("la casa arriba, los clientes abajo", () => {
    const { familia, clientes } = repartirEnDosBloques(
        [
            persona("yair", "atencion"),
            persona("sofia", "ventas"),
            persona("grupo", "grupo"),
            persona("pedro", "cliente-a"),
            persona("ana", "cliente-b"),
        ],
        CASA,
    );
    assert.deepEqual(familia.map((p) => p.personaId).sort(), ["grupo", "sofia", "yair"]);
    assert.deepEqual(clientes.map((c) => c.cuentaId), ["cliente-a", "cliente-b"]);
});

test("una cuenta vinculada NO es un cliente", () => {
    // `ownerId ?? id` no sube a la madre, así que sin la familia entera
    // Atencion y Ventas saldrían como clientes de su propia casa.
    const { familia, clientes } = repartirEnDosBloques(
        [persona("yair", "atencion"), persona("sofia", "ventas")],
        CASA,
    );
    assert.equal(familia.length, 2);
    assert.equal(clientes.length, 0);
});

test("EL CASO: el rato se guardó bajo un cliente y la persona sigue siendo de la casa", () => {
    // Quien entra a la cuenta de un cliente con «Ingresar» escribe su jornada
    // bajo la cuenta del cliente. Si el reparto mirara esa cuenta, esta persona
    // saldría dentro de Clientes. Se reparte por la SUYA, así que no.
    const yair = persona("yair", "atencion", { segundos: 3600 });
    const { familia, clientes } = repartirEnDosBloques([yair, persona("pedro", "cliente-a")], CASA);
    assert.deepEqual(familia.map((p) => p.personaId), ["yair"]);
    assert.equal(clientes.length, 1);
    assert.deepEqual(clientes[0].personas.map((p) => p.personaId), ["pedro"]);
});

test("ningún bloque se queda vacío por el reparto", () => {
    // La otra mitad del mismo fallo: repartiendo por la cuenta de la actividad,
    // una casa que ese mes trabajó DENTRO de cuentas de clientes dejaría el
    // bloque de arriba vacío. Con gente de la casa en la lista, nunca lo está.
    const { familia, clientes } = repartirEnDosBloques(
        [persona("grupo", "grupo"), persona("pedro", "cliente-a")],
        CASA,
    );
    assert.ok(familia.length > 0);
    assert.ok(clientes.length > 0);
});

test("los clientes salen agrupados, ordenados por cuenta y por tiempo", () => {
    const { clientes } = repartirEnDosBloques(
        [
            persona("z1", "c2", { cuentaNombre: "Zeta", segundos: 10 }),
            persona("a1", "c1", { cuentaNombre: "Alfa", segundos: 10 }),
            persona("a2", "c1", { cuentaNombre: "Alfa", segundos: 99 }),
        ],
        CASA,
    );
    assert.deepEqual(clientes.map((c) => c.cuentaNombre), ["Alfa", "Zeta"]);
    // Dentro de una cuenta, primero quien más tiempo lleva.
    assert.deepEqual(clientes[0].personas.map((p) => p.personaId), ["a2", "a1"]);
});

test("la casa va ordenada por tiempo", () => {
    const { familia } = repartirEnDosBloques(
        [persona("poco", "grupo", { segundos: 5 }), persona("mucho", "grupo", { segundos: 500 })],
        CASA,
    );
    assert.deepEqual(familia.map((p) => p.personaId), ["mucho", "poco"]);
});

test("sin familia, todo el mundo es cliente; con todo en familia, no hay barra", () => {
    const gente = [persona("a", "c1"), persona("b", "c2")];
    assert.equal(repartirEnDosBloques(gente, []).familia.length, 0);
    assert.equal(repartirEnDosBloques(gente, []).clientes.length, 2);
    // Es el caso del administrador que no es súper administrador: se declara
    // familia a las cuentas de su propia gente, así que la barra no se pinta.
    const suyas = [...new Set(gente.map((p) => p.cuentaId))];
    assert.equal(repartirEnDosBloques(gente, suyas).clientes.length, 0);
});

test("una cuenta sin nombre no borra el de sus compañeros", () => {
    const { clientes } = repartirEnDosBloques(
        [
            persona("sin", "c1", { cuentaNombre: null }),
            persona("con", "c1", { cuentaNombre: "Distribuidora" }),
        ],
        CASA,
    );
    assert.equal(clientes[0].cuentaNombre, "Distribuidora");
});
