/**
 * La etapa que la bandeja le da a cada fila, contra Postgres y con las
 * consultas de verdad.
 *
 * Esto es lo que un banco de funciones puras no puede decir: que las tres
 * lecturas en bloque **corren** —los `::text[]`, los `::int[]` y los nombres de
 * columna de unas tablas que crea la App, no Prisma— y que lo que devuelven es
 * lo mismo que contesta la cabecera del chat.
 *
 * Los seis casos:
 *   1. Una conversación con asesor cae en el embudo de SU asesor.
 *   2. Sin asesor —o con uno sin embudo— cae en el por defecto.
 *   3. Dos cuentas a la vez, cada una con sus embudos: es la bandeja de una
 *      cuenta con líneas de las que cuelgan de ella.
 *   4. La etapa guardada manda; una guardada en OTRO embudo no se cuela, y una
 *      borrada cae en la primera.
 *   5. El color: el elegido si lo tiene, y si no el de su POSICIÓN.
 *   6. Una cuenta sin embudos no devuelve nada, que es lo que deja la fila sin
 *      pastilla.
 *
 * Y el encadenado, que es la prueba de oro: **la fila y la cabecera dicen la
 * misma etapa**, incluso después de moverla.
 *
 * Se levanta con `scripts/banco-pastilla-de-etapa.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const M = await import(join(AQUI, ".compilado", "bandeja", "entrada-de-etapas-de-la-bandeja.js"));
const {
    ponerAQuienMira,
    lasEtapasDeLaBandeja,
    etapaDeLaConversacionAction,
    moverTarjetaAction,
    crearEmbudo,
    guardarEtapas,
    asignarEmbudos,
    lasEtapasDe,
    losEmbudosDe,
    db,
} = M;

/** La fila que devuelve `currentUser()`, con la forma que leen las acciones. */
const como = (id) =>
    ponerAQuienMira({
        id,
        sessionUserId: id,
        effectiveId: id,
        ownerId: null,
        advisorRole: null,
        role: "user",
        rolDeLaPersona: "user",
        email: `${id}@banco.test`,
        name: id,
    });

/** Ids distintos en cada vuelta: la base del banco se reutiliza. */
const V = `v${Date.now().toString(36)}`;
const MADRE = `${V}-madre`;
const HIJA = `${V}-hija`;
const VACIA = `${V}-vacia`;
const ASESOR = `${V}-asesor`;
const OTRO = `${V}-otro`;

async function cuenta(id, ownerId = null) {
    await db.user.create({
        data: { id, name: id, email: `${id}@banco.test`, password: "x", ownerId },
    });
}

let n = 0;
async function conversacion(userId, asesorId) {
    n += 1;
    const fila = await db.session.create({
        data: {
            userId,
            remoteJid: `${V}-${n}@s.whatsapp.net`,
            pushName: `Contacto ${n}`,
            instanceId: "BANCO",
            status: true,
            assignedAdvisorId: asesorId,
        },
    });
    return fila.id;
}

const ESTADO = {};

test("sembrar", async () => {
    await cuenta(MADRE);
    await cuenta(HIJA, MADRE);
    await cuenta(VACIA);
    await cuenta(ASESOR, MADRE);
    await cuenta(OTRO, MADRE);

    // La madre: dos embudos. El de Ventas es el de su asesor; el otro, el por
    // defecto (es el primero, y el primero nace marcado).
    ESTADO.porDefecto = await crearEmbudo({ cuentaId: MADRE, nombre: "General", creadoPorId: MADRE });
    ESTADO.ventas = await crearEmbudo({ cuentaId: MADRE, nombre: "Ventas", creadoPorId: MADRE });
    // La hija: el suyo, con sus propias etapas.
    ESTADO.deLaHija = await crearEmbudo({ cuentaId: HIJA, nombre: "Soporte", creadoPorId: HIJA });

    // Etapas a medida: una con color elegido y otra sin él, para ver el color
    // por POSICIÓN.
    await guardarEtapas(MADRE, ESTADO.ventas, [
        { id: null, nombre: "Contactado", color: 4 },
        { id: null, nombre: "Esperando respuesta del cliente", color: null },
        { id: null, nombre: "Cerrado", color: null },
    ]);
    ESTADO.etapasDeVentas = await lasEtapasDe([ESTADO.ventas]);

    await asignarEmbudos(MADRE, [{ personaId: ASESOR, embudoId: ESTADO.ventas }]);

    ESTADO.conAsesor = await conversacion(MADRE, ASESOR);
    ESTADO.sinAsesor = await conversacion(MADRE, null);
    ESTADO.asesorSinEmbudo = await conversacion(MADRE, OTRO);
    ESTADO.deLaHija1 = await conversacion(HIJA, null);
    ESTADO.deLaVacia = await conversacion(VACIA, null);
});

/** Lo que la bandeja le daría a estas conversaciones. */
async function comoLaBandeja(ids) {
    const filas = await db.session.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, assignedAdvisorId: true },
    });
    return lasEtapasDeLaBandeja(filas);
}

test("la conversación cae en el embudo de SU asesor, y sin asesor en el por defecto", async () => {
    const mapa = await comoLaBandeja([ESTADO.conAsesor, ESTADO.sinAsesor, ESTADO.asesorSinEmbudo]);

    // La de su asesor: primera etapa de Ventas, que es «Contactado».
    assert.equal(mapa.get(ESTADO.conAsesor)?.nombre, "Contactado");
    // Las otras dos caen en el por defecto, cuyas etapas son las iniciales.
    assert.equal(mapa.get(ESTADO.sinAsesor)?.nombre, "Nuevo");
    assert.equal(mapa.get(ESTADO.asesorSinEmbudo)?.nombre, "Nuevo");
});

test("dos cuentas a la vez, cada una con sus embudos", async () => {
    const mapa = await comoLaBandeja([ESTADO.conAsesor, ESTADO.deLaHija1, ESTADO.deLaVacia]);
    assert.equal(mapa.get(ESTADO.conAsesor)?.nombre, "Contactado", "la de la madre");
    assert.equal(mapa.get(ESTADO.deLaHija1)?.nombre, "Nuevo", "la de la hija sale de SUS embudos");
    // Y la etapa de la hija es de SU embudo, no de uno de la madre.
    const deLaHija = await lasEtapasDe([ESTADO.deLaHija]);
    assert.ok(
        deLaHija.some((e) => e.id === mapa.get(ESTADO.deLaHija1)?.id),
        "la etapa de la hija tendría que ser de su propio embudo",
    );
});

test("una cuenta sin embudos no devuelve nada: la fila no pinta pastilla", async () => {
    const mapa = await comoLaBandeja([ESTADO.deLaVacia]);
    assert.equal(mapa.get(ESTADO.deLaVacia), undefined);
});

test("la etapa guardada manda; la de otro embudo no se cuela y la borrada cae en la primera", async () => {
    const segunda = ESTADO.etapasDeVentas[1];
    como(MADRE);
    const movida = await moverTarjetaAction(ESTADO.conAsesor, segunda.id);
    assert.equal(movida.success, true, movida.message);

    let mapa = await comoLaBandeja([ESTADO.conAsesor]);
    assert.equal(mapa.get(ESTADO.conAsesor)?.id, segunda.id, "la guardada tendría que mandar");

    // Una posición en OTRO embudo, escrita a mano: la conversación no está en
    // ese embudo, así que no puede decidir su etapa.
    const ajena = (await lasEtapasDe([ESTADO.porDefecto]))[2];
    await db.$executeRawUnsafe(
        `INSERT INTO "embudo_posiciones" ("sessionId","embudoId","etapaId","movidoPorId","actualizadoEn")
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT ("sessionId","embudoId") DO UPDATE SET "etapaId" = EXCLUDED."etapaId"`,
        ESTADO.conAsesor,
        ESTADO.porDefecto,
        ajena.id,
        MADRE,
    );
    mapa = await comoLaBandeja([ESTADO.conAsesor]);
    assert.equal(mapa.get(ESTADO.conAsesor)?.id, segunda.id, "se coló la posición de otro embudo");

    // Y si la etapa guardada desaparece, se cae en la primera en vez de dejar
    // la fila sin pastilla.
    await guardarEtapas(MADRE, ESTADO.ventas, [
        { id: ESTADO.etapasDeVentas[0].id, nombre: "Contactado", color: 4 },
        { id: ESTADO.etapasDeVentas[2].id, nombre: "Cerrado", color: null },
    ]);
    mapa = await comoLaBandeja([ESTADO.conAsesor]);
    assert.equal(mapa.get(ESTADO.conAsesor)?.nombre, "Contactado", "una etapa borrada cae en la primera");
});

test("el color: el elegido si lo tiene, y si no el de su posición", async () => {
    const etapas = await lasEtapasDe([ESTADO.ventas]);
    const primera = etapas[0];
    const segunda = etapas[1];
    assert.equal(primera.color, 4, "la sembrada con color elegido");
    assert.equal(segunda.color, null, "la sembrada sin color");

    const mapa = await comoLaBandeja([ESTADO.conAsesor]);
    assert.equal(mapa.get(ESTADO.conAsesor)?.color, 4, "manda el color elegido");

    como(MADRE);
    await moverTarjetaAction(ESTADO.conAsesor, segunda.id);
    const despues = await comoLaBandeja([ESTADO.conAsesor]);
    assert.equal(despues.get(ESTADO.conAsesor)?.color, 1, "sin color elegido manda la posición (la 2.ª)");
});

test("la FILA y la CABECERA dicen la misma etapa", async () => {
    // Es lo que impide que la lista enseñe una y el chat otra. Se comprueba en
    // las tres conversaciones y después de haberla movido.
    // Cada conversación se mira desde SU cuenta: la bandeja ya ha filtrado
    // antes a qué cuentas llega quien mira (`getSesionesDeLaCuenta` las pasa
    // una por una por `assertCanAccessTargetUser`), así que lo que se compara
    // aquí es la etapa, no el alcance.
    for (const [quien, ids] of [
        [MADRE, [ESTADO.conAsesor, ESTADO.sinAsesor, ESTADO.asesorSinEmbudo]],
        [HIJA, [ESTADO.deLaHija1]],
    ]) {
        como(quien);
        for (const id of ids) {
            const mapa = await comoLaBandeja([id]);
            const cabecera = await etapaDeLaConversacionAction(id);
            assert.equal(cabecera.success, true, cabecera.message);
            assert.equal(
                mapa.get(id)?.id ?? null,
                cabecera.data.etapaId,
                `la fila y la cabecera discrepan en la conversación ${id}`,
            );
        }
    }

    // Y una cuenta sin embudos: las dos dicen «nada».
    const mapa = await comoLaBandeja([ESTADO.deLaVacia]);
    como(VACIA);
    const cabecera = await etapaDeLaConversacionAction(ESTADO.deLaVacia);
    assert.equal(mapa.get(ESTADO.deLaVacia), undefined);
    assert.equal(cabecera.data.etapaId, null);
});

test("cerrar", async () => {
    await db.$disconnect();
});
