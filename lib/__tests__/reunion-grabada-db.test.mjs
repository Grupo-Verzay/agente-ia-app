/**
 * Volver a una reunion y grabarla, **contra Postgres de verdad**.
 *
 * Lo de aqui no se puede probar en memoria, y cada bloque tiene su motivo:
 *
 *   1. **Reanudar** depende de una columna nueva y de un candado de fila: el
 *      tope de cuatro se comprueba dentro de la transaccion que devuelve a
 *      alguien, y un candado solo se ve lanzando las cosas a la vez.
 *   2. **Empezar a grabar** se apoya en un `WHERE ... IS NULL` para que dos
 *      personas pulsando al mismo tiempo no abran dos grabaciones de la misma
 *      reunion. Eso tampoco se ve sin concurrencia de verdad.
 *   3. **Los BIGINT**: `audioBytes` vuelve de Postgres como `BigInt`, que **no
 *      se puede serializar**. Una fila con uno dentro cruzando una accion de
 *      servidor revienta con «Do not know how to serialize a BigInt», y ese
 *      error sale al pintar la pantalla, lejisimos de la consulta que lo trajo.
 *
 * Y corre en **DOS modos**. Con `BANCO_ROTO=1` se ejerce la forma anterior
 * —salir sin motivo, que es como estaban los tres caminos— y se afirma que con
 * ella **a quien sacaron se le devuelve a la reunion**. Sin ese modo no se
 * sabria si lo verde de al lado es que se arreglo la causa o que el caso no
 * llega a ejercerla.
 *
 * Como se corre (la base es de usar y tirar):
 *
 *     npx esbuild lib/salas-de-video-db.ts --bundle --platform=node \
 *         --format=esm --outdir=lib/__tests__/.compilado/banco \
 *         --external:@prisma/client --external:server-only
 *     sed -i '/^import "server-only";$/d' lib/__tests__/.compilado/banco/salas-de-video-db.js
 *     DATABASE_URL='postgresql://postgres@127.0.0.1:55433/banco' \
 *         node --test lib/__tests__/reunion-grabada-db.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
    apuntarLaParte,
    cerrarLaGrabacion,
    cerrarLasGrabacionesColgadas,
    crearLaSala,
    cuantosHayDentro,
    empezarLaGrabacion,
    entrarConCuenta,
    guardarLaTranscripcionDeLaReunion,
    laGrabacion,
    lasGrabacionesCaducadas,
    lasGrabacionesDeLasSalas,
    latirGrabando,
    laSalaPorCodigo,
    losDeLaSala,
    loQueOcupanLasGrabaciones,
    olvidarLosFicheros,
    reanudarEnLaSala,
    sacarALosQueNoDanSenales,
    sacarDeLaSala,
} from "./.compilado/banco/salas-de-video-db.js";

const ROTO = process.env.BANCO_ROTO === "1";

/** Una cuenta distinta por vuelta: la base se reutiliza entre ejecuciones. */
const CUENTA = `cuenta-${randomUUID()}`;

const unaSala = () =>
    crearLaSala({
        cuentaId: CUENTA,
        canalId: null,
        anfitrionId: "ana",
        anfitrionNombre: "Ana",
        titulo: "Reunión",
        duracion: "7d",
    });

// ── Volver despues de un corte ──────────────────────────────────────────────

test("a quien se le cayo la red vuelve a SU sitio, con el mismo id", async () => {
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });

    // El barrido: deja de dar senales. Se le fuerza la marca hacia atras.
    const { db } = await import("./.compilado/banco/salas-de-video-db.js").then(
        async () => ({ db: (await import("@prisma/client")).PrismaClient }),
    ).catch(() => ({ db: null }));
    void db;
    await ponerVistoAtras(ana.id);
    assert.equal(await sacarALosQueNoDanSenales(sala.id), 1);
    assert.equal(await cuantosHayDentro(sala.id), 0);

    const vuelto = await reanudarEnLaSala({ salaId: sala.id, participanteId: ana.id });
    assert.notEqual(vuelto, "no_procede");
    assert.ok(vuelto);
    // **El mismo id**: es lo que hace que los demas no tengan que rehacer nada
    // mas que la conexion, y que su nombre y su sitio sigan siendo los suyos.
    assert.equal(vuelto.id, ana.id);
    assert.equal(vuelto.estado, "dentro");
    assert.equal(vuelto.motivoDeSalida, null);
    assert.equal(await cuantosHayDentro(sala.id), 1);
});

test("a quien SACARON no se le devuelve solo", async () => {
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    await sacarDeLaSala({
        salaId: sala.id,
        participanteId: ana.id,
        motivo: "fuera",
        // El modo roto es la forma anterior: los tres caminos escribian `fuera`
        // y nada mas, asi que eran indistinguibles.
        porQue: ROTO ? "silencio" : "sacado",
    });

    const vuelto = await reanudarEnLaSala({ salaId: sala.id, participanteId: ana.id });
    if (ROTO) {
        // Esto es el fallo, ejercido: la pestana de alguien a quien acaban de
        // echar se reanuda sola en la vuelta siguiente.
        assert.notEqual(vuelto, "no_procede", "con la forma vieja vuelve a entrar");
        assert.equal(await cuantosHayDentro(sala.id), 1);
    } else {
        assert.equal(vuelto, "no_procede");
        assert.equal(await cuantosHayDentro(sala.id), 0);
    }
});

test("quien COLGO tampoco vuelve solo", async () => {
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    await sacarDeLaSala({
        salaId: sala.id,
        participanteId: ana.id,
        motivo: "fuera",
        porQue: ROTO ? "silencio" : "salio",
    });
    const vuelto = await reanudarEnLaSala({ salaId: sala.id, participanteId: ana.id });
    if (ROTO) assert.notEqual(vuelto, "no_procede");
    else assert.equal(vuelto, "no_procede");
});

test("si la sala se lleno mientras tanto, NO se cuela un quinto", async () => {
    // Colar a un quinto corta la reunion para TODOS, no solo para el que sobra.
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    await ponerVistoAtras(ana.id);
    await sacarALosQueNoDanSenales(sala.id);

    for (const p of ["b", "c", "d", "e"]) {
        assert.ok(await entrarConCuenta({ salaId: sala.id, personaId: p, nombre: p }));
    }
    assert.equal(await cuantosHayDentro(sala.id), 4);

    assert.equal(await reanudarEnLaSala({ salaId: sala.id, participanteId: ana.id }), null);
    assert.equal(await cuantosHayDentro(sala.id), 4);
});

test("un corte corto —sin que el barrido llegue a sacar— reanuda sin tocar nada", async () => {
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const vuelto = await reanudarEnLaSala({ salaId: sala.id, participanteId: ana.id });
    assert.ok(vuelto && vuelto !== "no_procede");
    assert.equal(vuelto.estado, "dentro");
    assert.equal(await cuantosHayDentro(sala.id), 1);
});

test("una fila que no existe no reanuda nada", async () => {
    const sala = await unaSala();
    assert.equal(
        await reanudarEnLaSala({ salaId: sala.id, participanteId: randomUUID() }),
        "no_procede",
    );
});

// ── Grabar ──────────────────────────────────────────────────────────────────

test("dos personas pulsando a la vez abren UNA sola grabacion", async () => {
    // Dos grabaciones de la misma reunion suben el mismo rato dos veces y la
    // ficha la ensena duplicada.
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const beto = await entrarConCuenta({ salaId: sala.id, personaId: "beto", nombre: "Beto" });

    const [a, b] = await Promise.all([
        empezarLaGrabacion({
            salaId: sala.id,
            cuentaId: CUENTA,
            salaTitulo: "Reunión",
            pedidaPorId: ana.id,
            pedidaPorNombre: "Ana",
            modo: "audio",
        }),
        empezarLaGrabacion({
            salaId: sala.id,
            cuentaId: CUENTA,
            salaTitulo: "Reunión",
            pedidaPorId: beto.id,
            pedidaPorNombre: "Beto",
            modo: "video",
        }),
    ]);
    const abiertas = [a, b].filter(Boolean);
    assert.equal(abiertas.length, 1, "solo una de las dos abre grabación");

    const enLaSala = await laSalaPorCodigo(sala.codigo);
    assert.equal(enLaSala.grabacionId, abiertas[0].id);
    assert.ok(enLaSala.grabandoDesde);
    // El nombre viaja COPIADO en la sala, que es lo que deja pintar el aviso
    // sin una consulta mas por persona y por vuelta.
    assert.ok(["Ana", "Beto"].includes(enLaSala.grabandoPor));
});

test("cerrar suelta la sala, y entonces se puede volver a grabar", async () => {
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const g = await empezarLaGrabacion({
        salaId: sala.id,
        cuentaId: CUENTA,
        salaTitulo: null,
        pedidaPorId: ana.id,
        pedidaPorNombre: "Ana",
        modo: "audio",
    });
    assert.ok(g);
    // Con la sala ocupada no se abre otra.
    assert.equal(
        await empezarLaGrabacion({
            salaId: sala.id,
            cuentaId: CUENTA,
            salaTitulo: null,
            pedidaPorId: ana.id,
            pedidaPorNombre: "Ana",
            modo: "audio",
        }),
        null,
    );

    await cerrarLaGrabacion({
        grabacionId: g.id,
        salaId: sala.id,
        estado: "lista",
        segundos: 42,
        audioUrl: "https://s3.example/x/audio.webm",
    });
    const despues = await laSalaPorCodigo(sala.codigo);
    assert.equal(despues.grabacionId, null);
    assert.equal(despues.grabandoDesde, null);
    assert.equal(despues.grabandoPor, null);
    assert.ok(
        await empezarLaGrabacion({
            salaId: sala.id,
            cuentaId: CUENTA,
            salaTitulo: null,
            pedidaPorId: ana.id,
            pedidaPorNombre: "Ana",
            modo: "audio",
        }),
    );
});

test("los bytes vuelven como NUMERO, no como BigInt", async () => {
    // Un `BigInt` cruzando una accion de servidor revienta con «Do not know how
    // to serialize a BigInt», y ese error sale al pintar, lejos de aqui.
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const g = await empezarLaGrabacion({
        salaId: sala.id,
        cuentaId: CUENTA,
        salaTitulo: null,
        pedidaPorId: ana.id,
        pedidaPorNombre: "Ana",
        modo: "audio",
    });
    await apuntarLaParte({ grabacionId: g.id, cual: "audio", bytes: 9_000_000 });
    const leida = await laGrabacion(g.id);
    assert.equal(typeof leida.audioBytes, "number");
    assert.equal(leida.audioBytes, 9_000_000);
    assert.equal(typeof leida.partesAudio, "number");
    assert.equal(leida.partesAudio, 1);
    // Y se puede serializar, que es el fallo de verdad.
    assert.doesNotThrow(() => JSON.stringify(leida));
});

test("las partes se cuentan en orden y solo mientras se graba", async () => {
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const g = await empezarLaGrabacion({
        salaId: sala.id,
        cuentaId: CUENTA,
        salaTitulo: null,
        pedidaPorId: ana.id,
        pedidaPorNombre: "Ana",
        modo: "video",
    });
    assert.equal(await apuntarLaParte({ grabacionId: g.id, cual: "audio", bytes: 10 }), 1);
    assert.equal(await apuntarLaParte({ grabacionId: g.id, cual: "audio", bytes: 10 }), 2);
    assert.equal(await apuntarLaParte({ grabacionId: g.id, cual: "video", bytes: 10 }), 1);

    await cerrarLaGrabacion({
        grabacionId: g.id,
        salaId: sala.id,
        estado: "lista",
        segundos: 1,
        audioUrl: "https://s3.example/a.webm",
    });
    // Cerrada, una parte que llegue tarde NO suma: sumaria bytes a un fichero
    // que ya se junto, y el cupo contaria lo que no existe.
    assert.equal(await apuntarLaParte({ grabacionId: g.id, cual: "audio", bytes: 999 }), 0);
    const leida = await laGrabacion(g.id);
    assert.equal(leida.audioBytes, 20);
});

test("el cupo suma audio y video de TODA la cuenta", async () => {
    const cuenta = `cuenta-${randomUUID()}`;
    const antes = await loQueOcupanLasGrabaciones(cuenta);
    assert.equal(antes, 0);

    for (const n of [1, 2]) {
        const sala = await crearLaSala({
            cuentaId: cuenta,
            canalId: null,
            anfitrionId: "ana",
            anfitrionNombre: "Ana",
            titulo: `R${n}`,
            duracion: "7d",
        });
        const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
        const g = await empezarLaGrabacion({
            salaId: sala.id,
            cuentaId: cuenta,
            salaTitulo: null,
            pedidaPorId: ana.id,
            pedidaPorNombre: "Ana",
            modo: "video",
        });
        await apuntarLaParte({ grabacionId: g.id, cual: "audio", bytes: 1_000 });
        await apuntarLaParte({ grabacionId: g.id, cual: "video", bytes: 5_000 });
    }
    assert.equal(await loQueOcupanLasGrabaciones(cuenta), 12_000);
    // Y no se mezcla con otra cuenta.
    assert.equal(await loQueOcupanLasGrabaciones(CUENTA) >= 0, true);
});

test("las grabaciones de varias salas salen en UNA consulta, agrupadas", async () => {
    const salas = [];
    for (const n of [1, 2]) {
        const sala = await unaSala();
        const ana = await entrarConCuenta({ salaId: sala.id, personaId: `p${n}`, nombre: "P" });
        await empezarLaGrabacion({
            salaId: sala.id,
            cuentaId: CUENTA,
            salaTitulo: null,
            pedidaPorId: ana.id,
            pedidaPorNombre: "P",
            modo: "audio",
        });
        salas.push(sala.id);
    }
    const mapa = await lasGrabacionesDeLasSalas(salas);
    assert.equal(mapa.size, 2);
    for (const id of salas) assert.equal(mapa.get(id).length, 1);
    // Ids repetidos o vacios no rompen nada ni piden de mas.
    assert.equal((await lasGrabacionesDeLasSalas([])).size, 0);
    assert.equal((await lasGrabacionesDeLasSalas([salas[0], salas[0]])).size, 1);
});

test("el texto se guarda UNA vez: dos peticiones a la vez no cobran dos", async () => {
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const g = await empezarLaGrabacion({
        salaId: sala.id,
        cuentaId: CUENTA,
        salaTitulo: null,
        pedidaPorId: ana.id,
        pedidaPorNombre: "Ana",
        modo: "audio",
    });
    await cerrarLaGrabacion({
        grabacionId: g.id,
        salaId: sala.id,
        estado: "lista",
        segundos: 60,
        audioUrl: "https://s3.example/a.webm",
    });

    const [a, b] = await Promise.all([
        guardarLaTranscripcionDeLaReunion({ grabacionId: g.id, texto: "uno", resumen: "r1" }),
        guardarLaTranscripcionDeLaReunion({ grabacionId: g.id, texto: "dos", resumen: "r2" }),
    ]);
    assert.equal([a, b].filter(Boolean).length, 1, "solo una escribe");
    const leida = await laGrabacion(g.id);
    assert.ok(["uno", "dos"].includes(leida.transcripcion));
    assert.ok(leida.transcritaEn);
});

test("una grabacion colgada se cierra y suelta su sala", async () => {
    // Sin esto, esa reunion no podria volver a grabarse NUNCA: empezar exige
    // que no haya ninguna en curso.
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const g = await empezarLaGrabacion({
        salaId: sala.id,
        cuentaId: CUENTA,
        salaTitulo: null,
        pedidaPorId: ana.id,
        pedidaPorNombre: "Ana",
        modo: "audio",
    });
    await ponerGrabacionAtras(g.id, 10);
    assert.ok((await cerrarLasGrabacionesColgadas(4)) >= 1);
    const despues = await laSalaPorCodigo(sala.codigo);
    assert.equal(despues.grabacionId, null);
    assert.equal((await laGrabacion(g.id)).estado, "fallida");
});

test("a los 180 dias se va el fichero y se QUEDA el texto", async () => {
    // La transcripcion es lo que alguien va a buscar de una reunion de hace
    // medio ano: tirarla con el audio seria perder lo barato por lo caro.
    const sala = await unaSala();
    const ana = await entrarConCuenta({ salaId: sala.id, personaId: "ana", nombre: "Ana" });
    const g = await empezarLaGrabacion({
        salaId: sala.id,
        cuentaId: CUENTA,
        salaTitulo: null,
        pedidaPorId: ana.id,
        pedidaPorNombre: "Ana",
        modo: "audio",
    });
    await apuntarLaParte({ grabacionId: g.id, cual: "audio", bytes: 4_000 });
    await cerrarLaGrabacion({
        grabacionId: g.id,
        salaId: sala.id,
        estado: "lista",
        segundos: 60,
        audioUrl: "https://s3.example/a.webm",
    });
    await guardarLaTranscripcionDeLaReunion({
        grabacionId: g.id,
        texto: "lo que se dijo",
        resumen: "los puntos",
    });

    await ponerGrabacionAtras(g.id, 200 * 24);
    const caducadas = await lasGrabacionesCaducadas(180, 50);
    assert.ok(caducadas.some((x) => x.id === g.id));

    await olvidarLosFicheros(g.id);
    const leida = await laGrabacion(g.id);
    assert.equal(leida.audioUrl, null);
    assert.equal(leida.audioBytes, 0, "y el cupo se devuelve");
    assert.equal(leida.transcripcion, "lo que se dijo");
    assert.equal(leida.resumen, "los puntos");
    assert.equal(leida.estado, "caducada");
    // Y deja de salir en la lista de caducadas: no se vuelve a intentar borrar
    // un fichero que ya no esta.
    const otraVez = await lasGrabacionesCaducadas(180, 50);
    assert.ok(!otraVez.some((x) => x.id === g.id));
});

// ── Utilidades del banco ────────────────────────────────────────────────────

/** Empujar el `vistoEn` hacia atras para que el barrido lo alcance. */
async function ponerVistoAtras(participanteId) {
    const { db } = await cargarPrisma();
    await db.$executeRawUnsafe(
        `UPDATE "sala_participantes" SET "vistoEn" = NOW() - interval '10 minutes' WHERE "id" = $1`,
        participanteId,
    );
}

/** Lo mismo con la fecha de una grabacion. */
async function ponerGrabacionAtras(grabacionId, horas) {
    const { db } = await cargarPrisma();
    await db.$executeRawUnsafe(
        `UPDATE "grabaciones_de_reunion"
         SET "creadaEn" = NOW() - make_interval(hours => $2::int) WHERE "id" = $1`,
        grabacionId,
        horas,
    );
}

let prisma = null;
async function cargarPrisma() {
    if (!prisma) {
        const { PrismaClient } = await import("@prisma/client");
        prisma = { db: new PrismaClient() };
    }
    return prisma;
}
