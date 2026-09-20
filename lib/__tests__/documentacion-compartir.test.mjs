/**
 * El banco de **compartir, ordenar, fijar y archivar** en Documentación,
 * contra Postgres de verdad y ejerciendo **las acciones**, no las consultas.
 *
 * Esa es la decisión que sostiene todo lo demás. Las treinta acciones de este
 * módulo **no van por `lib/cuenta-de-la-accion.ts`**: su puerta es más estrecha
 * —además de «¿alcanzas esta cuenta?» pregunta «¿y este espacio?»—, y lo que
 * hay que demostrar no es que las consultas sepan escribir una fila, sino que
 * **lo nuevo no se salta esa puerta**. Probando `lib/documentacion-db.ts` a
 * secas se estaría probando justo el lado que no tiene puerta.
 *
 * Se prueban los tres puntos de vista que pedía el encargo, con la malla real
 * de `linked_accounts` dentro:
 *
 * | quién | qué tiene que pasar |
 * | --- | --- |
 * | la cuenta MADRE | comparte, ordena y manda en lo suyo |
 * | la cuenta HIJA | ve lo compartido, escribe si le dieron edición, y **no reparte** |
 * | alguien SIN permiso en el espacio | no lo ve, y ninguna de las acciones nuevas le contesta |
 *
 * Cómo se corre: `scripts/banco-documentos.sh` (Postgres de usar y tirar).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    archivarDocumentoAction,
    buscarAction,
    compartirConCuentasAction,
    crearDocumentoAction,
    crearEspacioAction,
    db,
    fijarDocumentoAction,
    guardarElOrdenDeLaColumnaAction,
    lasCuentasParaCompartirAction,
    leerElArbolAction,
    leerLosPermisosAction,
    ponerAQuienMira,
    ponerPermisoAction,
} from "./.compilado/documentos/entrada-de-documentos.js";

/* ─────────────────────────────── La semilla ─────────────────────────────── */

// Los ids llevan el sello de la vuelta: la base se reutiliza entre ejecuciones
// y un id fijo haría que la segunda encontrara también lo de la primera. Ya
// costó una vuelta en el banco del sufijo de dispositivo.
const V = `v${Date.now().toString(36)}`;
const ID = (nombre) => `${V}-${nombre}`;

const MADRE = ID("madre");
const HIJA = ID("hija");
const AJENA = ID("ajena");
const YAIR = ID("yair"); // administrador del equipo de la HIJA
const PEDRO = ID("pedro"); // del equipo de la MADRE, sin rol de administrador
const AGENTE = ID("agente"); // agente de la MADRE: participa, no manda

/** Las filas de `currentUser()` tal y como llegan en producción. */
const COMO = {
    madre: { id: MADRE, role: "user", ownerId: null, advisorRole: null, name: "Madre" },
    hija: { id: HIJA, role: "user", ownerId: null, advisorRole: null, name: "Hija" },
    ajena: { id: AJENA, role: "user", ownerId: null, advisorRole: null, name: "Ajena" },
    // Yair entra con SU id y cuelga de la cuenta hija: es el caso que ya costó
    // un incidente en las notas compartidas.
    yair: {
        id: YAIR,
        role: "user",
        ownerId: HIJA,
        advisorRole: "administrador",
        sessionUserId: YAIR,
        name: "Yair",
    },
    pedro: { id: PEDRO, role: "user", ownerId: MADRE, advisorRole: null, name: "Pedro" },
    agente: { id: AGENTE, role: "user", ownerId: MADRE, advisorRole: "agente", name: "Agente" },
};

async function sembrar() {
    const cuentas = [
        [MADRE, null, "Casa Madre"],
        [HIJA, null, "Casa Hija"],
        [AJENA, null, "Casa Ajena"],
        [YAIR, HIJA, "Empresa Demo"],
        [PEDRO, MADRE, "Empresa Demo"],
        [AGENTE, MADRE, "Empresa Demo"],
    ];
    for (const [id, owner, company] of cuentas) {
        await db.$executeRawUnsafe(
            // `updatedAt` es `@updatedAt`: Prisma lo rellena y la columna NO
            // tiene default en la base, así que un INSERT en crudo tiene que
            // ponerlo a mano o Postgres lo rechaza con 23502.
            `INSERT INTO "User" ("id","email","name","company","role","owner_id","updatedAt")
             VALUES ($1,$2,$3,$4,'user',$5,NOW())
             ON CONFLICT ("id") DO NOTHING`,
            id,
            `${id}@banco.test`,
            id,
            company,
            owner,
        );
    }
    // La malla de siempre: la madre vinculó a la hija bajo la suya.
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id")
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        ID("enlace"),
        MADRE,
        HIJA,
    );
}

/** Crea un espacio como alguien, y devuelve su id. */
async function crearEspacioComo(quien, nombre, visibilidad = "cuenta") {
    ponerAQuienMira(quien);
    const res = await crearEspacioAction({ nombre, visibilidad });
    assert.equal(res.success, true, `no se pudo crear «${nombre}»: ${res.message}`);
    return res.data.id;
}

async function crearDocumentoComo(quien, espacioId, titulo) {
    ponerAQuienMira(quien);
    const res = await crearDocumentoAction({ espacioId, titulo });
    assert.equal(res.success, true, `no se pudo crear «${titulo}»: ${res.message}`);
    return res.data.id;
}

/** El árbol que ve alguien, como mapa de `espacioId` → entrada. */
async function arbolDe(quien, opciones) {
    ponerAQuienMira(quien);
    const arbol = await leerElArbolAction(opciones);
    return {
        arbol,
        porId: new Map((arbol?.espacios ?? []).map((e) => [e.espacio.id, e])),
        orden: (arbol?.espacios ?? []).map((e) => e.espacio.id),
    };
}

// **No se limpia nada entre vueltas, y a propósito.** Las tablas de
// Documentación las crea el propio módulo la primera vez que se le pide algo,
// así que un `DELETE` aquí arriba correría antes de que existieran. El sello de
// la vuelta (`V`) es lo que aísla: cada ejecución trabaja sobre sus ids.
await sembrar();

/* ───────────────── Compartir con otra CUENTA, por la puerta ─────────────── */

test("la MADRE comparte un espacio con la HIJA y la hija lo ve, recibido", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Procedimientos");
    await crearDocumentoComo(COMO.madre, espacio, "Cómo se instala");

    // Antes de compartir, la hija no lo ve. Y no es que salga vacío: es que el
    // espacio no está en su árbol.
    assert.equal((await arbolDe(COMO.hija)).porId.has(espacio), false);

    ponerAQuienMira(COMO.madre);
    const ofrecidas = await lasCuentasParaCompartirAction({
        objetoTipo: "espacio",
        objetoId: espacio,
    });
    assert.equal(ofrecidas.success, true);
    assert.equal(
        ofrecidas.data.some((c) => c.id === HIJA),
        true,
        "la hija tiene que salir en la lista que ofrece el diálogo",
    );

    const guardado = await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        destinos: [{ accountUserId: HIJA, permiso: "lectura" }],
    });
    assert.equal(guardado.success, true);

    const deLaHija = (await arbolDe(COMO.hija)).porId.get(espacio);
    assert.ok(deLaHija, "la hija tiene que verlo después de compartirlo");
    assert.equal(deLaHija.recibido, true);
    assert.equal(deLaHija.puedeEditar, false);
    // En uno recibido no manda nadie de esta cuenta: repartirlo sigue siendo
    // de quien lo hizo. Misma regla que Proyectos y Diagramas.
    assert.equal(deLaHija.puedeGestionar, false);
    assert.equal(deLaHija.puedeMandar, false);
    assert.equal(deLaHija.documentos.length, 1);
});

test("y el ADMINISTRADOR de la hija lo ve con su propio id, no solo su dueña", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Manual");
    ponerAQuienMira(COMO.madre);
    await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        destinos: [{ accountUserId: HIJA, permiso: "edicion" }],
    });

    // Es el caso que ya costó un incidente en las notas: el dueño lo ve porque
    // su id ES el de la fila, y su administrador entra con el suyo.
    const deYair = (await arbolDe(COMO.yair)).porId.get(espacio);
    assert.ok(deYair, "al administrador de la hija también tiene que llegarle");
    assert.equal(deYair.recibido, true);
    assert.equal(deYair.puedeEditar, true, "con edición, escribe");
    assert.equal(deYair.puedeGestionar, false, "pero no reparte");
});

test("quien lo RECIBE no puede repartirlo, ni a personas ni a cuentas", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Contratos");
    ponerAQuienMira(COMO.madre);
    await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        destinos: [{ accountUserId: HIJA, permiso: "edicion" }],
    });

    ponerAQuienMira(COMO.yair);
    const aPersona = await ponerPermisoAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        sujetoTipo: "persona",
        sujetoId: PEDRO,
        permiso: "lectura",
    });
    assert.equal(aPersona.success, false);

    const aCuenta = await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        destinos: [{ accountUserId: AJENA, permiso: "edicion" }],
    });
    assert.equal(aCuenta.success, false);

    // Y no ha escrito nada: la cuenta ajena sigue sin verlo.
    assert.equal((await arbolDe(COMO.ajena)).porId.has(espacio), false);
});

test("una cuenta que NO se ofrece se filtra, y no tira el guardado bueno", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Interno");
    ponerAQuienMira(COMO.madre);

    const res = await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        // El id inventado no existe en `User`, así que no sale en
        // `cuentasParaCompartir`: se cae él solo y la hija se guarda igual.
        destinos: [
            { accountUserId: HIJA, permiso: "lectura" },
            { accountUserId: `${V}-no-existe`, permiso: "edicion" },
        ],
    });
    assert.equal(res.success, true);

    const filas = await db.$queryRawUnsafe(
        `SELECT "sujetoId" FROM "doc_permisos" WHERE "objetoId" = $1 AND "sujetoTipo" = 'cuenta'`,
        espacio,
    );
    assert.deepEqual(
        filas.map((f) => f.sujetoId),
        [HIJA],
    );
});

test("guardar las CUENTAS no toca las filas de PERSONA", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Mixto");
    ponerAQuienMira(COMO.madre);

    await ponerPermisoAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        sujetoTipo: "persona",
        sujetoId: PEDRO,
        permiso: "edicion",
    });
    await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        destinos: [{ accountUserId: HIJA, permiso: "lectura" }],
    });
    // Y ahora se deja de compartir con todas las cuentas: la persona se queda.
    await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        destinos: [],
    });

    const permisos = await leerLosPermisosAction({ objetoTipo: "espacio", objetoId: espacio });
    assert.equal(permisos.success, true);
    assert.deepEqual(
        permisos.data.map((p) => [p.sujetoTipo, p.sujetoId, p.permiso]),
        [["persona", PEDRO, "edicion"]],
    );
});

/* ──────────── Alguien SIN permiso en el espacio: nada le contesta ───────── */

test("un espacio RESTRINGIDO no lo alcanza quien no está dentro", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Solo dirección", "restringido");
    const documento = await crearDocumentoComo(COMO.madre, espacio, "Salarios");

    // El agente es de la MISMA cuenta y aun así no entra: `canManageWorkspace`
    // no lo cubre y no tiene ninguna fila a su nombre.
    const suyo = await arbolDe(COMO.agente);
    assert.equal(suyo.porId.has(espacio), false);

    ponerAQuienMira(COMO.agente);
    // Y ninguna de las acciones nuevas le contesta otra cosa.
    for (const [nombre, llamada] of [
        ["fijar", () => fijarDocumentoAction({ id: documento, fijado: true })],
        ["archivar", () => archivarDocumentoAction({ id: documento, archivado: true })],
        [
            "compartir",
            () =>
                compartirConCuentasAction({
                    objetoTipo: "espacio",
                    objetoId: espacio,
                    destinos: [{ accountUserId: HIJA, permiso: "edicion" }],
                }),
        ],
        [
            "leer las cuentas",
            () => lasCuentasParaCompartirAction({ objetoTipo: "espacio", objetoId: espacio }),
        ],
    ]) {
        const res = await llamada();
        assert.equal(res.success, false, `«${nombre}» tenía que rechazarse`);
    }

    // Y nada se escribió: el documento sigue sin fijar y sin archivar.
    const fila = await db.$queryRawUnsafe(
        `SELECT "fijado", "archivadoEn" FROM "doc_documentos" WHERE "id" = $1`,
        documento,
    );
    assert.equal(fila[0].fijado, false);
    assert.equal(fila[0].archivadoEn, null);
});

test("un AGENTE no reordena el árbol, ni el suyo", async () => {
    await crearEspacioComo(COMO.madre, "Cualquiera");
    const { orden } = await arbolDe(COMO.madre);

    ponerAQuienMira(COMO.agente);
    const res = await guardarElOrdenDeLaColumnaAction({
        tipo: "arbol",
        tableroId: MADRE,
        ids: [...orden].reverse(),
    });
    assert.equal(res.success, false);
    assert.match(res.message ?? "", /agente/i);
});

/* ─────────────────────── El orden del árbol es por CUENTA ───────────────── */

test("cada cuenta coloca su árbol, y el de la otra no se mueve", async () => {
    const uno = await crearEspacioComo(COMO.madre, "AAA");
    const dos = await crearEspacioComo(COMO.madre, "BBB");
    ponerAQuienMira(COMO.madre);
    for (const espacio of [uno, dos]) {
        await compartirConCuentasAction({
            objetoTipo: "espacio",
            objetoId: espacio,
            destinos: [{ accountUserId: HIJA, permiso: "lectura" }],
        });
    }

    // Se mira el orden RELATIVO de los dos, no la lista entera: el árbol lleva
    // dentro lo que compartieron los casos de arriba, y afirmar sobre la lista
    // completa sería afirmar sobre el orden en que corre el banco.
    const soloEstos = (lista) => lista.filter((id) => id === uno || id === dos);

    const antesMadre = (await arbolDe(COMO.madre)).orden;
    assert.deepEqual(
        soloEstos((await arbolDe(COMO.hija)).orden),
        [uno, dos],
        "la hija los ve en el orden de siempre",
    );

    // La HIJA se los coloca al revés. Es su árbol.
    ponerAQuienMira(COMO.hija);
    const guardado = await guardarElOrdenDeLaColumnaAction({
        tipo: "arbol",
        tableroId: HIJA,
        ids: [dos, uno],
    });
    assert.equal(guardado.success, true, guardado.message);

    assert.deepEqual(soloEstos((await arbolDe(COMO.hija)).orden), [dos, uno]);
    assert.deepEqual(
        (await arbolDe(COMO.madre)).orden,
        antesMadre,
        "y el árbol de la madre se queda exactamente igual",
    );
});

test("nadie ordena el árbol de OTRA cuenta", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Ajeno");
    ponerAQuienMira(COMO.hija);
    const res = await guardarElOrdenDeLaColumnaAction({
        tipo: "arbol",
        tableroId: MADRE,
        ids: [espacio],
    });
    assert.equal(res.success, false);
    assert.match(res.message ?? "", /no encontrado/i);
});

test("y una lista que llega de fuera no mete espacios que no se alcanzan", async () => {
    const mio = await crearEspacioComo(COMO.madre, "Mío");
    const suyo = await crearEspacioComo(COMO.ajena, "De la ajena");

    ponerAQuienMira(COMO.madre);
    const res = await guardarElOrdenDeLaColumnaAction({
        tipo: "arbol",
        tableroId: MADRE,
        ids: [suyo, mio],
    });
    assert.equal(res.success, true);

    const filas = await db.$queryRawUnsafe(
        `SELECT "tarjetaId" FROM "orden_en_tablero" WHERE "tipo" = 'arbol' AND "tableroId" = $1`,
        MADRE,
    );
    assert.equal(
        filas.some((f) => f.tarjetaId === suyo),
        false,
        "el espacio de otra cuenta no puede acabar escrito en este árbol",
    );
});

/* ──────────────────────────── Fijar y archivar ──────────────────────────── */

test("fijar sube el documento a lo alto de su espacio", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Con varios");
    const primero = await crearDocumentoComo(COMO.madre, espacio, "Primero");
    const segundo = await crearDocumentoComo(COMO.madre, espacio, "Segundo");

    let entrada = (await arbolDe(COMO.madre)).porId.get(espacio);
    assert.deepEqual(
        entrada.documentos.map((d) => d.id),
        [primero, segundo],
        "sin tocar nada, en el orden en que se escribieron",
    );

    ponerAQuienMira(COMO.madre);
    assert.equal((await fijarDocumentoAction({ id: segundo, fijado: true })).success, true);

    entrada = (await arbolDe(COMO.madre)).porId.get(espacio);
    assert.deepEqual(entrada.documentos.map((d) => d.id), [segundo, primero]);
    assert.equal(entrada.documentos[0].fijado, true);
});

test("archivar lo saca del árbol y de la BÚSQUEDA, y se puede volver", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Archivo");
    const documento = await crearDocumentoComo(COMO.madre, espacio, "Palabraunica");

    ponerAQuienMira(COMO.madre);
    const antes = await buscarAction({ texto: "Palabraunica" });
    assert.equal(antes.success, true);
    assert.equal(antes.data.some((r) => r.id === documento), true);

    assert.equal((await archivarDocumentoAction({ id: documento, archivado: true })).success, true);

    const sinArchivados = (await arbolDe(COMO.madre)).porId.get(espacio);
    assert.equal(sinArchivados.documentos.length, 0, "fuera del árbol");

    ponerAQuienMira(COMO.madre);
    const despues = await buscarAction({ texto: "Palabraunica" });
    assert.equal(despues.success, true);
    assert.equal(
        despues.data.some((r) => r.id === documento),
        false,
        "y fuera de la búsqueda: si no, archivar no serviría para nada",
    );

    // Con el interruptor vuelve, marcado.
    const conArchivados = (await arbolDe(COMO.madre, { verArchivados: true })).porId.get(espacio);
    assert.equal(conArchivados.documentos.length, 1);
    assert.ok(conArchivados.documentos[0].archivadoEn, "y dice DESDE CUÁNDO");

    // Y se deshace: no se ha borrado ni una fila.
    ponerAQuienMira(COMO.madre);
    assert.equal((await archivarDocumentoAction({ id: documento, archivado: false })).success, true);
    assert.equal((await arbolDe(COMO.madre)).porId.get(espacio).documentos.length, 1);
});

test("con EDICIÓN se fija pero NO se archiva: son dos puertas distintas", async () => {
    const espacio = await crearEspacioComo(COMO.madre, "Dos puertas");
    const documento = await crearDocumentoComo(COMO.madre, espacio, "Uno");
    ponerAQuienMira(COMO.madre);
    await compartirConCuentasAction({
        objetoTipo: "espacio",
        objetoId: espacio,
        destinos: [{ accountUserId: HIJA, permiso: "edicion" }],
    });

    ponerAQuienMira(COMO.yair);
    assert.equal(
        (await fijarDocumentoAction({ id: documento, fijado: true })).success,
        true,
        "fijar es colocar, y colocar va con la puerta de editar",
    );
    const archivado = await archivarDocumentoAction({ id: documento, archivado: true });
    assert.equal(
        archivado.success,
        false,
        "archivar lo esconde para TODO el equipo: va con la puerta de gestionar",
    );
});
