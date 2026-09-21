/**
 * El filtro por rango de fechas de la lista de Chats — puro, sin navegador.
 *
 * Prueba la MISMA función (`dentroDelRango`) que en la pantalla usan a la vez
 * `filtered` (lo que se ve) y `conteos` (lo que dice «Todos»). Que sea una sola
 * es lo que hace cierto «el conteo coincide con las filas mostradas»: aquí se
 * comprueba justo eso, además de los cinco casos del encargo.
 *
 * Compilar lo puro (sale en `.compilado/`, en .gitignore):
 *   npx tsc -p lib/__tests__/tsconfig.banco.json
 * Correr:
 *   node --test lib/__tests__/rango-de-fechas-chats.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ATAJOS_DE_RANGO,
    atajoDelRango,
    CAMPO_DE_FECHA_POR_DEFECTO,
    comoDiaLocal,
    dentroDelRango,
    esCampoDeFecha,
    hayRangoDeFechas,
    laFechaQueCuenta,
    limitesDelRango,
    rangoDelAtajo,
} from "./.compilado/lib/rango-de-fechas-chats.js";

// Marca en ms desde una fecha LOCAL, igual que la pantalla: los `<input date>`
// y las marcas de los chats se comparan en la zona de quien mira.
const ms = (s) => new Date(s).getTime();

// Un chat de mentira, con las dos fechas que el filtro puede mirar.
const chat = (id, inicio, ts, instanceName = "Ventas") => ({ id, inicio, ts, instanceName });

test("CAMPO_DE_FECHA_POR_DEFECTO es el inicio de la conversación", () => {
    assert.equal(CAMPO_DE_FECHA_POR_DEFECTO, "inicio");
    assert.ok(esCampoDeFecha("inicio"));
    assert.ok(esCampoDeFecha("actividad"));
    assert.ok(!esCampoDeFecha("otro"));
    assert.ok(!esCampoDeFecha(null));
});

test("hayRangoDeFechas: hace falta al menos un extremo", () => {
    assert.equal(hayRangoDeFechas("", ""), false);
    assert.equal(hayRangoDeFechas("2026-03-10", ""), true);
    assert.equal(hayRangoDeFechas("", "2026-03-10"), true);
    assert.equal(hayRangoDeFechas("2026-03-01", "2026-03-31"), true);
});

test("limitesDelRango: desde a las 00:00, hasta al FINAL del día; vacío no acota", () => {
    const { desdeMs, hastaMs } = limitesDelRango("2026-03-10", "2026-03-12");
    assert.equal(desdeMs, ms("2026-03-10T00:00:00.000"));
    assert.equal(hastaMs, ms("2026-03-12T23:59:59.999"));

    const soloDesde = limitesDelRango("2026-03-10", "");
    assert.equal(soloDesde.desdeMs, ms("2026-03-10T00:00:00.000"));
    assert.equal(soloDesde.hastaMs, Infinity);

    const soloHasta = limitesDelRango("", "2026-03-12");
    assert.equal(soloHasta.desdeMs, -Infinity);
    assert.equal(soloHasta.hastaMs, ms("2026-03-12T23:59:59.999"));
});

test("laFechaQueCuenta: inicio o última actividad según el campo", () => {
    const c = chat("a", ms("2026-01-01T10:00:00"), ms("2026-06-01T10:00:00"));
    assert.equal(laFechaQueCuenta(c, "inicio"), ms("2026-01-01T10:00:00"));
    assert.equal(laFechaQueCuenta(c, "actividad"), ms("2026-06-01T10:00:00"));
});

test("1) rango de UN día: incluye el día entero y nada de los vecinos", () => {
    const lim = { ...limitesDelRango("2026-03-10", "2026-03-10"), campo: "inicio" };

    // El día entero entra, de la primera a la última milésima.
    assert.ok(dentroDelRango(chat("medio", ms("2026-03-10T13:37:00"), 0), lim));
    assert.ok(dentroDelRango(chat("00:00", ms("2026-03-10T00:00:00.000"), 0), lim));
    assert.ok(dentroDelRango(chat("23:59", ms("2026-03-10T23:59:59.999"), 0), lim));

    // Los vecinos, fuera: la víspera a las 23:59:59.999 y el día siguiente a
    // las 00:00 —el fallo clásico de cortar `hasta` a medianoche—.
    assert.ok(!dentroDelRango(chat("vispera", ms("2026-03-09T23:59:59.999"), 0), lim));
    assert.ok(!dentroDelRango(chat("siguiente", ms("2026-03-11T00:00:00.000"), 0), lim));
});

test("2) rango de VARIOS días: los extremos entran, lo de fuera no", () => {
    const lim = { ...limitesDelRango("2026-03-10", "2026-03-12"), campo: "inicio" };
    assert.ok(dentroDelRango(chat("d10", ms("2026-03-10T09:00:00"), 0), lim));
    assert.ok(dentroDelRango(chat("d11", ms("2026-03-11T09:00:00"), 0), lim));
    assert.ok(dentroDelRango(chat("d12", ms("2026-03-12T22:00:00"), 0), lim));
    assert.ok(!dentroDelRango(chat("d09", ms("2026-03-09T22:00:00"), 0), lim));
    assert.ok(!dentroDelRango(chat("d13", ms("2026-03-13T01:00:00"), 0), lim));
});

test("3) cambiar entre INICIO y última actividad cambia quién entra", () => {
    // Se inició en enero y su último mensaje es de junio.
    const viejoConMovimiento = chat("v", ms("2026-01-15T10:00:00"), ms("2026-06-15T10:00:00"));
    // Se inició en junio y su último mensaje también.
    const nuevo = chat("n", ms("2026-06-10T10:00:00"), ms("2026-06-20T10:00:00"));

    const rangoEnero = limitesDelRango("2026-01-01", "2026-01-31");
    // Por INICIO: entra el que empezó en enero, no el que empezó en junio.
    assert.ok(dentroDelRango(viejoConMovimiento, { ...rangoEnero, campo: "inicio" }));
    assert.ok(!dentroDelRango(nuevo, { ...rangoEnero, campo: "inicio" }));

    const rangoJunio = limitesDelRango("2026-06-01", "2026-06-30");
    // Por ÚLTIMA ACTIVIDAD: el viejo con movimiento en junio SÍ entra, aunque
    // se iniciara en enero. Es justo lo que separa los dos campos.
    assert.ok(dentroDelRango(viejoConMovimiento, { ...rangoJunio, campo: "actividad" }));
    assert.ok(!dentroDelRango(viejoConMovimiento, { ...rangoJunio, campo: "inicio" }));
});

test("sin fecha utilizable (0) queda fuera de cualquier rango", () => {
    const lim = { ...limitesDelRango("2026-03-01", "2026-03-31"), campo: "inicio" };
    assert.ok(!dentroDelRango(chat("sinfecha", 0, 0), lim));
});

// ── Los ATAJOS: Hoy, Ayer, Últimos 7 días, Últimos 30 días ──────────────────
//
// `ahora` se fija con un `new Date(año, mes, día, …)` LOCAL para que el banco sea
// determinista en cualquier zona: la fecha se construye y se lee con los mismos
// componentes locales, así que no depende de la TZ del que corre el banco. Es
// justo la propiedad que el arreglo necesita: nunca se pasa por UTC.

test("comoDiaLocal: YYYY-MM-DD en local, sin corrimiento por UTC", () => {
    // 15 de junio a las 14:30 locales. Cortado sobre UTC, al oeste de UTC por la
    // tarde saldría el 16; en local es el 15 pase lo que pase.
    assert.equal(comoDiaLocal(new Date(2026, 5, 15, 14, 30)), "2026-06-15");
    // A un dígito, con su cero delante.
    assert.equal(comoDiaLocal(new Date(2026, 0, 3, 9, 0)), "2026-01-03");
});

test("los cuatro atajos existen con su rótulo corto y su título largo", () => {
    assert.deepEqual(
        ATAJOS_DE_RANGO.map((a) => a.id),
        ["hoy", "ayer", "ultimos7", "ultimos30"],
    );
    const titulos = Object.fromEntries(ATAJOS_DE_RANGO.map((a) => [a.id, a.titulo]));
    assert.equal(titulos.ultimos7, "Últimos 7 días");
    assert.equal(titulos.ultimos30, "Últimos 30 días");
});

test("rangoDelAtajo: cada uno de los cuatro rellena Desde y Hasta", () => {
    const ahora = new Date(2026, 5, 15, 14, 30); // lunes 15 de junio de 2026

    assert.deepEqual(rangoDelAtajo("hoy", ahora), { desde: "2026-06-15", hasta: "2026-06-15" });
    assert.deepEqual(rangoDelAtajo("ayer", ahora), { desde: "2026-06-14", hasta: "2026-06-14" });
    // «Últimos 7 días» INCLUYE hoy: hoy y los 6 anteriores.
    assert.deepEqual(rangoDelAtajo("ultimos7", ahora), { desde: "2026-06-09", hasta: "2026-06-15" });
    // «Últimos 30 días»: hoy y los 29 anteriores; cruza a mayo.
    assert.deepEqual(rangoDelAtajo("ultimos30", ahora), { desde: "2026-05-17", hasta: "2026-06-15" });
});

test("rangoDelAtajo: la resta de días cruza el año sin tocar UTC", () => {
    const ahora = new Date(2026, 0, 3, 8, 0); // 3 de enero de 2026
    assert.deepEqual(rangoDelAtajo("ayer", ahora), { desde: "2026-01-02", hasta: "2026-01-02" });
    // 3 de enero menos 6 días → 28 de diciembre de 2025.
    assert.deepEqual(rangoDelAtajo("ultimos7", ahora), { desde: "2025-12-28", hasta: "2026-01-03" });
});

test("atajoDelRango: reconoce el rango de cada atajo", () => {
    const ahora = new Date(2026, 5, 15, 14, 30);
    assert.equal(atajoDelRango("2026-06-15", "2026-06-15", ahora), "hoy");
    assert.equal(atajoDelRango("2026-06-14", "2026-06-14", ahora), "ayer");
    assert.equal(atajoDelRango("2026-06-09", "2026-06-15", ahora), "ultimos7");
    assert.equal(atajoDelRango("2026-05-17", "2026-06-15", ahora), "ultimos30");
});

test("atajoDelRango: fechas a mano que no casan dejan los cuatro sin marcar", () => {
    const ahora = new Date(2026, 5, 15, 14, 30);
    // Un rango cualquiera escrito a mano.
    assert.equal(atajoDelRango("2026-06-01", "2026-06-15", ahora), null);
    // «Hoy» pero con solo un extremo puesto: no es el rango de ningún atajo.
    assert.equal(atajoDelRango("2026-06-15", "", ahora), null);
    assert.equal(atajoDelRango("", "2026-06-15", ahora), null);
});

test("atajoDelRango: el rango vacío (tras Limpiar) no marca ninguno", () => {
    const ahora = new Date(2026, 5, 15, 14, 30);
    assert.equal(atajoDelRango("", "", ahora), null);
});

test("un atajo y luego escribir a mano: se pierde la marca", () => {
    const ahora = new Date(2026, 5, 15, 14, 30);
    // Se pulsa «Últimos 7 días».
    const r = rangoDelAtajo("ultimos7", ahora);
    assert.equal(atajoDelRango(r.desde, r.hasta, ahora), "ultimos7");
    // Se cambia Hasta a mano a otro día: ya no casa con ninguno.
    assert.equal(atajoDelRango(r.desde, "2026-06-20", ahora), null);
});

// ── El corazón del encargo: el conteo coincide con las filas mostradas ──────
//
// Se replica lo que la pantalla hace de verdad: la lista sale de filtrar por
// estado + canal + rango, y «Todos» cuenta con la MISMA condición. Aquí se
// comprueba con números escritos a mano para que no sea una tautología.

/** Lo que la pantalla muestra: activas (ni borradas, ni archivadas, ni
 *  resueltas), del canal elegido, y dentro del rango. */
function filasVisibles(contactos, { canal, lim }) {
    return contactos.filter((c) => {
        if (c.isDeleted || c.isArchived || c.resuelta) return false;
        if (canal && c.instanceName !== canal) return false;
        if (lim && !dentroDelRango(c, lim)) return false;
        return true;
    });
}
/** «Todos»: cuenta con la MISMA condición (la misma `dentroDelRango`). */
function conteoTodos(contactos, opts) {
    return contactos.reduce((n, c) => {
        if (c.isDeleted || c.isArchived || c.resuelta) return n;
        if (opts.canal && c.instanceName !== opts.canal) return n;
        if (opts.lim && !dentroDelRango(c, opts.lim)) return n;
        return n + 1;
    }, 0);
}

test("4) combinación con el filtro de CANAL", () => {
    const contactos = [
        chat("v1", ms("2026-03-10T10:00:00"), ms("2026-03-10T10:00:00"), "Ventas"),
        chat("v2", ms("2026-03-11T10:00:00"), ms("2026-03-11T10:00:00"), "Ventas"),
        chat("a1", ms("2026-03-10T10:00:00"), ms("2026-03-10T10:00:00"), "Atencion"),
        // De Ventas pero fuera del rango: no debe contar con el canal Ventas.
        chat("v3", ms("2026-04-01T10:00:00"), ms("2026-04-01T10:00:00"), "Ventas"),
    ];
    const lim = { ...limitesDelRango("2026-03-01", "2026-03-31"), campo: "inicio" };

    const soloVentas = filasVisibles(contactos, { canal: "Ventas", lim });
    assert.deepEqual(soloVentas.map((c) => c.id), ["v1", "v2"]);

    const soloAtencion = filasVisibles(contactos, { canal: "Atencion", lim });
    assert.deepEqual(soloAtencion.map((c) => c.id), ["a1"]);
});

test("5) el CONTEO coincide con las FILAS mostradas (rango, campo y canal)", () => {
    const contactos = [
        chat("marzo-ventas", ms("2026-03-05T10:00:00"), ms("2026-03-05T10:00:00"), "Ventas"),
        chat("marzo-atencion", ms("2026-03-06T10:00:00"), ms("2026-03-06T10:00:00"), "Atencion"),
        chat("abril-ventas", ms("2026-04-06T10:00:00"), ms("2026-04-06T10:00:00"), "Ventas"),
        // Se inició en febrero pero se movió en marzo: entra por actividad, no
        // por inicio.
        { ...chat("mov-ventas", ms("2026-02-01T10:00:00"), ms("2026-03-20T10:00:00"), "Ventas") },
        // Estados que nunca cuentan.
        { ...chat("borrada", ms("2026-03-07T10:00:00"), ms("2026-03-07T10:00:00"), "Ventas"), isDeleted: true },
        { ...chat("archivada", ms("2026-03-08T10:00:00"), ms("2026-03-08T10:00:00"), "Ventas"), isArchived: true },
        { ...chat("resuelta", ms("2026-03-09T10:00:00"), ms("2026-03-09T10:00:00"), "Ventas"), resuelta: true },
    ];
    const rangoMarzo = limitesDelRango("2026-03-01", "2026-03-31");

    // Rango marzo, por INICIO, todas las líneas.
    let opts = { canal: null, lim: { ...rangoMarzo, campo: "inicio" } };
    let filas = filasVisibles(contactos, opts);
    assert.deepEqual(filas.map((c) => c.id), ["marzo-ventas", "marzo-atencion"]);
    assert.equal(conteoTodos(contactos, opts), filas.length);
    assert.equal(conteoTodos(contactos, opts), 2);

    // Mismo rango pero por ÚLTIMA ACTIVIDAD: entra también el que se movió en
    // marzo. El conteo vuelve a coincidir con las filas.
    opts = { canal: null, lim: { ...rangoMarzo, campo: "actividad" } };
    filas = filasVisibles(contactos, opts);
    assert.deepEqual(filas.map((c) => c.id).sort(), ["marzo-atencion", "marzo-ventas", "mov-ventas"]);
    assert.equal(conteoTodos(contactos, opts), filas.length);
    assert.equal(conteoTodos(contactos, opts), 3);

    // Rango marzo, por inicio, SOLO Ventas: una fila, un conteo.
    opts = { canal: "Ventas", lim: { ...rangoMarzo, campo: "inicio" } };
    filas = filasVisibles(contactos, opts);
    assert.deepEqual(filas.map((c) => c.id), ["marzo-ventas"]);
    assert.equal(conteoTodos(contactos, opts), filas.length);
    assert.equal(conteoTodos(contactos, opts), 1);

    // Sin rango: cuenta todas las activas (dos líneas, cuatro activas).
    opts = { canal: null, lim: null };
    filas = filasVisibles(contactos, opts);
    assert.equal(conteoTodos(contactos, opts), filas.length);
    assert.equal(conteoTodos(contactos, opts), 4);
});
