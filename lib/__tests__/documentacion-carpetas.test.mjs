/**
 * El banco de las **carpetas** de Documentación, contra Postgres de verdad y
 * ejerciendo **las acciones**, no las consultas.
 *
 * Es la misma decisión que el banco de al lado: las acciones de este módulo no
 * van por `lib/cuenta-de-la-accion.ts` —su puerta es la suya— y lo que hay que
 * demostrar no es que una consulta sepa escribir una fila, sino que **lo nuevo
 * no se salta esa puerta**.
 *
 * Lo que se prueba, que es lo que pedía el encargo más lo que costaría caro si
 * fallara:
 *
 * | | qué tiene que pasar |
 * | --- | --- |
 * | crear y **borrar** una carpeta con espacios dentro | los espacios **siguen ahí**, sueltos |
 * | mover un espacio entre carpetas | cambia de sitio, sin tocar el espacio |
 * | sacarlo fuera | vuelve a estar suelto |
 * | un espacio RECIBIDO | se puede archivar, y la cuenta dueña **no ve nada cambiar** |
 * | un `agente` | no crea, no renombra, no borra y no mueve |
 * | una carpeta de OTRA cuenta | se contesta como una que no existe |
 *
 * Cómo se corre: `scripts/banco-documentos.sh` (Postgres de usar y tirar).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    borrarCarpetaAction,
    compartirConCuentasAction,
    crearCarpetaAction,
    crearEspacioAction,
    db,
    leerElArbolAction,
    moverEspacioACarpetaAction,
    ponerAQuienMira,
    renombrarCarpetaAction,
} from "./.compilado/documentos/entrada-de-documentos.js";

/* ─────────────────────────────── La semilla ─────────────────────────────── */

// Los ids llevan el sello de la vuelta: la base se reutiliza entre ejecuciones
// y un id fijo haría que la segunda encontrara también lo de la primera.
const V = `c${Date.now().toString(36)}`;
const ID = (nombre) => `${V}-${nombre}`;

const MADRE = ID("madre");
const HIJA = ID("hija");
const AGENTE = ID("agente");

const COMO = {
    madre: { id: MADRE, role: "user", ownerId: null, advisorRole: null, name: "Madre" },
    hija: { id: HIJA, role: "user", ownerId: null, advisorRole: null, name: "Hija" },
    // Participa, no manda: es el reparto de toda la plataforma.
    agente: { id: AGENTE, role: "user", ownerId: MADRE, advisorRole: "agente", name: "Agente" },
};

async function sembrar() {
    for (const [id, owner] of [
        [MADRE, null],
        [HIJA, null],
        [AGENTE, MADRE],
    ]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "User" ("id","email","name","company","role","owner_id","updatedAt")
             VALUES ($1,$2,$3,'Empresa Demo','user',$4,NOW())
             ON CONFLICT ("id") DO NOTHING`,
            id,
            `${id}@banco.test`,
            id,
            owner,
        );
    }
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id")
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        ID("enlace"),
        MADRE,
        HIJA,
    );
}

async function crearEspacioComo(quien, nombre) {
    ponerAQuienMira(quien);
    const res = await crearEspacioAction({ nombre, visibilidad: "cuenta" });
    assert.equal(res.success, true, `no se pudo crear «${nombre}»: ${res.message}`);
    return res.data.id;
}

async function crearCarpetaComo(quien, nombre) {
    ponerAQuienMira(quien);
    const res = await crearCarpetaAction({ nombre });
    assert.equal(res.success, true, `no se pudo crear la carpeta «${nombre}»: ${res.message}`);
    return res.data.id;
}

/** El árbol que ve alguien, con lo que hace falta para preguntarle cosas. */
async function arbolDe(quien) {
    ponerAQuienMira(quien);
    const arbol = await leerElArbolAction();
    return {
        arbol,
        carpetas: (arbol?.carpetas ?? []).map((c) => c.id),
        enCarpeta: arbol?.enCarpeta ?? {},
        espacios: new Set((arbol?.espacios ?? []).map((e) => e.espacio.id)),
    };
}

await sembrar();

/* ────────────────────── Crear, renombrar y ordenar ──────────────────────── */

test("una carpeta recién creada sale en el árbol, aunque esté vacía", async () => {
    const carpeta = await crearCarpetaComo(COMO.madre, "Operaciones");
    const vista = await arbolDe(COMO.madre);
    assert.equal(vista.carpetas.includes(carpeta), true);
    // Sin esto, la carpeta creada no se vería y parecería que no se creó.
    assert.equal(vista.arbol.puedeMandarEnElArbol, true);
});

test("renombrar se ve, y una carpeta de OTRA cuenta no existe", async () => {
    const carpeta = await crearCarpetaComo(COMO.madre, "Ventas");

    ponerAQuienMira(COMO.madre);
    assert.equal((await renombrarCarpetaAction({ id: carpeta, nombre: "Comercial" })).success, true);

    const filas = await db.$queryRawUnsafe(
        `SELECT "nombre" FROM "doc_carpetas" WHERE "id" = $1`,
        carpeta,
    );
    assert.equal(filas[0].nombre, "Comercial");

    // La HIJA es de la familia y aun así no manda en las carpetas de la madre:
    // la carpeta es de UNA cuenta. Y se contesta como una que no existe, no
    // como un «no puedes» —que ya revelaría que existe—.
    ponerAQuienMira(COMO.hija);
    const ajena = await renombrarCarpetaAction({ id: carpeta, nombre: "Mía" });
    assert.equal(ajena.success, false);
    assert.match(ajena.message, /no encontrada/i);
});

test("un nombre vacío no crea una carpeta sin nombre", async () => {
    ponerAQuienMira(COMO.madre);
    const res = await crearCarpetaAction({ nombre: "   " });
    assert.equal(res.success, false);
});

/* ───────────────────── Mover: entre carpetas y fuera ────────────────────── */

test("mover un espacio entre carpetas, y SACARLO fuera", async () => {
    const ops = await crearCarpetaComo(COMO.madre, "Ops");
    const ventas = await crearCarpetaComo(COMO.madre, "Comercial");
    const espacio = await crearEspacioComo(COMO.madre, "Procedimientos");

    // Nace suelto: sin fila de pertenencia, que es lo mismo que le pasa a todo
    // lo que existía antes de que hubiera carpetas.
    assert.equal((await arbolDe(COMO.madre)).enCarpeta[espacio], undefined);

    ponerAQuienMira(COMO.madre);
    assert.equal(
        (await moverEspacioACarpetaAction({ espacioId: espacio, carpetaId: ops })).success,
        true,
    );
    assert.equal((await arbolDe(COMO.madre)).enCarpeta[espacio], ops);

    // De una carpeta a otra: una sola fila, no dos.
    ponerAQuienMira(COMO.madre);
    assert.equal(
        (await moverEspacioACarpetaAction({ espacioId: espacio, carpetaId: ventas })).success,
        true,
    );
    assert.equal((await arbolDe(COMO.madre)).enCarpeta[espacio], ventas);
    const cuantas = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "doc_espacio_en_carpeta"
         WHERE "cuentaId" = $1 AND "espacioId" = $2`,
        MADRE,
        espacio,
    );
    assert.equal(cuantas[0].n, 1, "la pertenencia es una fila por (cuenta, espacio)");

    // Y fuera: **suelto es la AUSENCIA de fila**, no un nulo guardado.
    ponerAQuienMira(COMO.madre);
    assert.equal(
        (await moverEspacioACarpetaAction({ espacioId: espacio, carpetaId: null })).success,
        true,
    );
    assert.equal((await arbolDe(COMO.madre)).enCarpeta[espacio], undefined);
    const tras = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "doc_espacio_en_carpeta"
         WHERE "cuentaId" = $1 AND "espacioId" = $2`,
        MADRE,
        espacio,
    );
    assert.equal(tras[0].n, 0);

    // Y el espacio sigue intacto en las tres vueltas.
    assert.equal((await arbolDe(COMO.madre)).espacios.has(espacio), true);
});

test("no se puede meter un espacio en una carpeta de OTRA cuenta", async () => {
    const carpetaDeLaHija = await crearCarpetaComo(COMO.hija, "Suya");
    const espacio = await crearEspacioComo(COMO.madre, "Mío");

    ponerAQuienMira(COMO.madre);
    const res = await moverEspacioACarpetaAction({
        espacioId: espacio,
        carpetaId: carpetaDeLaHija,
    });
    assert.equal(res.success, false);
    // Sin esto el espacio se metería en una carpeta que su dueña no pinta: un
    // espacio desaparecido sin que nadie lo haya borrado.
    assert.equal((await arbolDe(COMO.madre)).enCarpeta[espacio], undefined);
});

/* ───────── Borrar la carpeta NO borra los espacios: quedan sueltos ──────── */

test("borrar una carpeta con espacios dentro los deja SUELTOS, sin perder ninguno", async () => {
    const carpeta = await crearCarpetaComo(COMO.madre, "Se va");
    const uno = await crearEspacioComo(COMO.madre, "Uno");
    const dos = await crearEspacioComo(COMO.madre, "Dos");

    for (const espacioId of [uno, dos]) {
        ponerAQuienMira(COMO.madre);
        assert.equal(
            (await moverEspacioACarpetaAction({ espacioId, carpetaId: carpeta })).success,
            true,
        );
    }

    const antes = await arbolDe(COMO.madre);
    assert.equal(antes.enCarpeta[uno], carpeta);
    assert.equal(antes.enCarpeta[dos], carpeta);

    ponerAQuienMira(COMO.madre);
    assert.equal((await borrarCarpetaAction({ id: carpeta })).success, true);

    const despues = await arbolDe(COMO.madre);
    // Los DOS siguen en el árbol. Es el encargo literal.
    assert.equal(despues.espacios.has(uno), true, "el espacio no se puede haber ido");
    assert.equal(despues.espacios.has(dos), true);
    // Y sueltos: sin carpeta.
    assert.equal(despues.enCarpeta[uno], undefined);
    assert.equal(despues.enCarpeta[dos], undefined);
    assert.equal(despues.carpetas.includes(carpeta), false);

    // Y en la base: los espacios siguen enteros, sin `borradoEn` por ninguna
    // parte. Esto es lo que un banco de funciones puras no podría afirmar.
    const filas = await db.$queryRawUnsafe(
        `SELECT "id", "borradoEn" FROM "doc_espacios" WHERE "id" = ANY($1::text[])`,
        [uno, dos],
    );
    assert.equal(filas.length, 2);
    for (const f of filas) assert.equal(f.borradoEn, null, "borrar la carpeta no toca el espacio");
});

/* ───────────────── Un espacio RECIBIDO también se archiva ───────────────── */

test("la HIJA archiva un espacio que le compartieron, y la MADRE no ve nada cambiar", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Compartido");
    ponerAQuienMira(COMO.madre);
    assert.equal(
        (
            await compartirConCuentasAction({
                objetoTipo: "espacio",
                objetoId: espacio,
                destinos: [{ accountUserId: HIJA, permiso: "lectura" }],
            })
        ).success,
        true,
    );

    const carpetaDeLaHija = await crearCarpetaComo(COMO.hija, "Recibidos");

    // Con solo LECTURA. Archivarlo es ordenar SU barra lateral, no tocar el
    // espacio: por eso la puerta no es `puedeMandarEnElEspacio`, que aquí es
    // `false` a propósito.
    const suyo = (await arbolDe(COMO.hija)).arbol.espacios.find(
        (e) => e.espacio.id === espacio,
    );
    assert.ok(suyo, "la hija tiene que verlo");
    assert.equal(suyo.puedeMandar, false);

    ponerAQuienMira(COMO.hija);
    assert.equal(
        (await moverEspacioACarpetaAction({ espacioId: espacio, carpetaId: carpetaDeLaHija }))
            .success,
        true,
    );

    assert.equal((await arbolDe(COMO.hija)).enCarpeta[espacio], carpetaDeLaHija);
    // **Y la dueña no ve nada.** Es la razón entera de que la pertenencia sea
    // de la pareja (cuenta, espacio) y no una columna en `doc_espacios`: con
    // una columna, moverlo aquí se lo habría movido a la madre, a una carpeta
    // que en su árbol ni existe.
    assert.equal((await arbolDe(COMO.madre)).enCarpeta[espacio], undefined);
});

/* ───────────────────────── Un agente no manda ───────────────────────────── */

test("un AGENTE no crea, no renombra, no borra y no mueve", async () => {
    const carpeta = await crearCarpetaComo(COMO.madre, "De la casa");
    const espacio = await crearEspacioComo(COMO.madre, "Un espacio");

    ponerAQuienMira(COMO.agente);
    assert.equal((await crearCarpetaAction({ nombre: "Mía" })).success, false);
    assert.equal((await renombrarCarpetaAction({ id: carpeta, nombre: "Otra" })).success, false);
    assert.equal((await borrarCarpetaAction({ id: carpeta })).success, false);
    assert.equal(
        (await moverEspacioACarpetaAction({ espacioId: espacio, carpetaId: carpeta })).success,
        false,
    );

    // Y lo ve todo: participa, no manda.
    const suyo = await arbolDe(COMO.agente);
    assert.equal(suyo.carpetas.includes(carpeta), true);
    assert.equal(suyo.arbol.puedeMandarEnElArbol, false);

    // Nada de lo de arriba escribió una sola fila.
    const filas = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "doc_espacio_en_carpeta"
         WHERE "cuentaId" = $1 AND "espacioId" = $2`,
        MADRE,
        espacio,
    );
    assert.equal(filas[0].n, 0);
});
