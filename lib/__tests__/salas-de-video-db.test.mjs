/**
 * El banco de las salas de video **contra Postgres de verdad**.
 *
 * Lo que se prueba aquí no se puede probar en memoria: el tope de cuatro lo
 * sostiene un candado de fila, y un candado solo se ve lanzando las cosas a la
 * vez. La primera versión de este código metía el `COUNT` dentro del `WHERE`
 * del `INSERT` creyendo que así lo serializaba Postgres; con ocho entradas
 * simultáneas entraban **seis**. En `READ COMMITTED` cada sentencia toma su
 * propia foto al empezar, y esa foto es la de la sala medio vacía.
 *
 * Cómo se corre (la base es de usar y tirar):
 *
 *     initdb -D /tmp/pg -U postgres -A trust
 *     pg_ctl -D /tmp/pg -o '-p 55433 -k /tmp/pg' start
 *     createdb -h /tmp/pg -p 55433 -U postgres banco
 *     npx esbuild lib/salas-de-video-db.ts --bundle --platform=node \
 *         --format=esm --outdir=lib/__tests__/.compilado/banco \
 *         --external:@prisma/client --external:server-only
 *     sed -i '/^import "server-only";$/d' lib/__tests__/.compilado/banco/salas-de-video-db.js
 *     DATABASE_URL='postgresql://postgres@localhost:55433/banco?host=/tmp/pg' \
 *         node --test lib/__tests__/salas-de-video-db.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    crearLaSala,
    cuantosHayDentro,
    dejarLaSenal,
    dejarPasar,
    elInvitadoDelToken,
    entrarConCuenta,
    laSalaPorCodigo,
    latirEnLaSala,
    llamarALaPuerta,
    losDeLaSala,
    revocarLaSala,
    sacarALosQueNoDanSenales,
    sacarDeLaSala,
    unCodigoDeSala,
    vaciarElBuzon,
} from "./.compilado/banco/salas-de-video-db.js";

const unaSala = () =>
    crearLaSala({
        cuentaId: "cuenta1",
        canalId: "canal1",
        anfitrionId: "ana",
        anfitrionNombre: "Ana",
        titulo: null,
        expiraEn: new Date(Date.now() + 3600e3),
    });

// ── El enlace ───────────────────────────────────────────────────────────────

test("el código es largo, impredecible y no se repite", async () => {
    const sala = await unaSala();
    assert.ok(sala.codigo.length >= 20, `demasiado corto: ${sala.codigo.length}`);
    // Es lo único que hay entre alguien de fuera y la puerta: adivinarlo tiene
    // que ser imposible, no difícil.
    const muchos = new Set(Array.from({ length: 500 }, () => unCodigoDeSala()));
    assert.equal(muchos.size, 500);
    assert.equal((await laSalaPorCodigo(sala.codigo))?.id, sala.id);
});

test("revocar cierra el enlace Y echa a quien estaba dentro", async () => {
    // Revocar dejando dentro a la gente que ya entró sería media revocación:
    // quien preocupa es justo quien está dentro ahora mismo.
    const sala = await unaSala();
    await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    assert.equal(await revocarLaSala(sala.id, "beto"), false, "solo el anfitrión");
    assert.equal(await revocarLaSala(sala.id, "ana"), true);
    assert.equal(await cuantosHayDentro(sala.id), 0);
    assert.equal(await revocarLaSala(sala.id, "ana"), false, "dos veces no cuenta dos");
});

// ── El tope de cuatro, que es lo que sostiene la malla ──────────────────────

test("caben cuatro y el quinto no", async () => {
    const sala = await unaSala();
    for (const p of ["a", "b", "c", "d"]) {
        assert.ok(await entrarConCuenta({ salaId: sala.id, personaId: p, nombre: p }));
    }
    assert.equal(await cuantosHayDentro(sala.id), 4);
    assert.equal(
        await entrarConCuenta({ salaId: sala.id, personaId: "e", nombre: "e" }),
        null,
    );
});

test("recargar la pestaña no ocupa otro sitio, ni con la sala llena", async () => {
    // Sin el `ON CONFLICT`, cada recarga dejaría una fila nueva: la sala se
    // vería llena de recuadros negros de la misma persona.
    const sala = await unaSala();
    for (const p of ["a", "b", "c", "d"]) {
        await entrarConCuenta({ salaId: sala.id, personaId: p, nombre: p });
    }
    assert.ok(
        await entrarConCuenta({ salaId: sala.id, personaId: "a", nombre: "Ana" }),
        "quien recarga no puede quedarse fuera por estar llena contándole a él",
    );
    assert.equal(await cuantosHayDentro(sala.id), 4);
});

test("OCHO entrando a la vez: entran CUATRO", async () => {
    // El caso que desmintió la primera versión, que dejaba entrar a seis.
    // Colar a un quinto en una malla de cuatro corta la reunión para TODOS.
    const sala = await unaSala();
    const gente = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const res = await Promise.all(
        gente.map((p) =>
            entrarConCuenta({ salaId: sala.id, personaId: p, nombre: p }).catch(() => null),
        ),
    );
    assert.equal(await cuantosHayDentro(sala.id), 4);
    assert.equal(res.filter(Boolean).length, 4, "y a los otros cuatro se les dice que no");
});

// ── La puerta ───────────────────────────────────────────────────────────────

test("quien llama a la puerta ESPERA, y su token le identifica", async () => {
    const sala = await unaSala();
    const i = await llamarALaPuerta({ salaId: sala.id, nombre: "Invitada" });
    assert.equal(i.estado, "esperando", "el enlace deja llamar, no entrar");
    assert.ok(i.invitadoToken);
    assert.equal((await elInvitadoDelToken(i.invitadoToken))?.id, i.id);
    assert.equal(await cuantosHayDentro(sala.id), 0);
});

test("dejar pasar dos veces seguidas dice «ya», no «llena»", async () => {
    // Lo cazó el banco: con el conteo antes de mirar si ya entró, un doble
    // clic contestaba «la reunión está llena» y mandaba a buscar un problema
    // que no existe.
    const sala = await unaSala();
    const i = await llamarALaPuerta({ salaId: sala.id, nombre: "Invitada" });
    assert.equal(await dejarPasar({ salaId: sala.id, participanteId: i.id }), "pasa");
    assert.equal(await dejarPasar({ salaId: sala.id, participanteId: i.id }), "ya");
});

test("con un solo sitio libre, CUATRO admisiones a la vez dejan pasar a UNO", async () => {
    const sala = await unaSala();
    for (const p of ["a", "b", "c"]) {
        await entrarConCuenta({ salaId: sala.id, personaId: p, nombre: p });
    }
    const enLaPuerta = [];
    for (const n of ["i1", "i2", "i3", "i4"]) {
        enLaPuerta.push(await llamarALaPuerta({ salaId: sala.id, nombre: n }));
    }
    const veredictos = await Promise.all(
        enLaPuerta.map((i) =>
            dejarPasar({ salaId: sala.id, participanteId: i.id }).catch(() => "error"),
        ),
    );
    assert.equal(await cuantosHayDentro(sala.id), 4);
    assert.equal(veredictos.filter((v) => v === "pasa").length, 1);
    assert.equal(veredictos.filter((v) => v === "llena").length, 3);
});

// ── El buzón de señalización ────────────────────────────────────────────────

test("el buzón se vacía al leerlo, y NINGUNA señal sale dos veces", async () => {
    // Con un `SELECT` y luego un `DELETE`, dos vueltas del reloj que se
    // solapen se llevan las dos la misma oferta y la aplican dos veces sobre
    // una conexión ya negociada.
    const sala = await unaSala();
    await entrarConCuenta({ salaId: sala.id, personaId: "a", nombre: "a" });
    await entrarConCuenta({ salaId: sala.id, personaId: "b", nombre: "b" });
    const [pa, pb] = await losDeLaSala(sala.id);
    for (let i = 0; i < 10; i++) {
        await dejarLaSenal({
            salaId: sala.id,
            deId: pa.id,
            paraId: pb.id,
            tipo: "oferta",
            sdp: `{"type":"offer","sdp":"v=${i}"}`,
        });
    }
    const [uno, dos] = await Promise.all([vaciarElBuzon(pb.id), vaciarElBuzon(pb.id)]);
    assert.equal(uno.length + dos.length, 10, "las diez salen");
    assert.equal(new Set([...uno, ...dos].map((s) => s.id)).size, 10, "y ninguna repetida");
    assert.deepEqual(await vaciarElBuzon(pb.id), [], "y a la tercera ya no queda nada");
});

test("sacar a alguien se lleva sus señales pendientes", async () => {
    // Una oferta de quien ya no está es una conexión que nadie va a contestar.
    const sala = await unaSala();
    await entrarConCuenta({ salaId: sala.id, personaId: "a", nombre: "a" });
    await entrarConCuenta({ salaId: sala.id, personaId: "b", nombre: "b" });
    const [pa, pb] = await losDeLaSala(sala.id);
    await dejarLaSenal({
        salaId: sala.id,
        deId: pa.id,
        paraId: pb.id,
        tipo: "oferta",
        sdp: '{"type":"offer","sdp":"v=0"}',
    });
    await sacarDeLaSala({ salaId: sala.id, participanteId: pa.id, motivo: "fuera" });
    assert.deepEqual(await vaciarElBuzon(pb.id), []);
});

// ── El latido ───────────────────────────────────────────────────────────────

test("el latido lleva dentro qué manda cada uno, y sin datos NO lo pisa", async () => {
    // Va en la MISMA sentencia que la marca de presencia: en una acción aparte
    // serían el doble de viajes en el camino más caliente de la pantalla.
    const sala = await unaSala();
    const p = await entrarConCuenta({ salaId: sala.id, personaId: "a", nombre: "a" });
    await latirEnLaSala(p.id, { mic: false, camara: true, compartiendo: false });
    let fila = (await losDeLaSala(sala.id)).find((f) => f.id === p.id);
    assert.equal(fila.micEncendido, false);
    assert.equal(fila.camaraEncendida, true);

    await latirEnLaSala(p.id, null);
    fila = (await losDeLaSala(sala.id)).find((f) => f.id === p.id);
    assert.equal(fila.micEncendido, false, "sin datos no se pisa lo que había");
    assert.equal(fila.camaraEncendida, true);
});

test("a quien deja de dar señales se le saca solo", async () => {
    // Es lo que cierra la reunión sola cuando alguien cierra la pestaña sin
    // despedirse, que es lo que hace todo el mundo.
    const sala = await unaSala();
    await entrarConCuenta({ salaId: sala.id, personaId: "a", nombre: "a" });
    assert.equal(await sacarALosQueNoDanSenales(sala.id), 0, "nadie lleva sin latir");
    assert.equal(await cuantosHayDentro(sala.id), 1);
});
