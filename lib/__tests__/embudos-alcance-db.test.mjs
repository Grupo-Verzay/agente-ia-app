/**
 * El selector de cuenta de Embudos: **solo la propia y las que cuelgan de
 * ella**, y abre donde se quedó.
 *
 * # Qué se venía haciendo mal
 *
 * El selector ofrecía **todas las cuentas de la plataforma**. Embudos resolvía
 * su alcance con una copia de la del CRM y le había añadido una tercera fuente,
 * `clientesDeLaCuenta`: para una cuenta de la casa esa función devuelve todas
 * las cuentas cliente que administra, y para un reseller su cartera entera —
 * cuentas sin ningún vínculo con la que se está mirando—. Administrar o
 * facturar a un cliente no lo mete en la estructura de una cuenta.
 *
 * Aquí se ejercen las ACCIONES, no la función pura: lo que hay que demostrar es
 * que el alcance sale de FILAS —`linked_accounts`, la tabla `reseller`, el rol
 * de la cuenta— y no de un parámetro, y que el que ofrece la pantalla es el
 * mismo que acepta la puerta. Lo único fingido es `currentUser()`.
 *
 * # Y la memoria
 *
 * El tablero abría siempre en la cuenta propia, así que quien trabaja a diario
 * en el de una hija tenía que elegirla en cada visita. Lo que se prueba de la
 * memoria es lo que no se ve leyendo: que la llave es la pareja **(persona,
 * cuenta propia)** —con la persona sola, entrar a otra cuenta y recargar ahí
 * borraría lo elegido en la suya— y que un id que ya no se alcanza **no abre
 * nada**: se cae en la propia como cualquier `?cuenta=` rancio.
 *
 * `MODO=roto` corre las mismas pruebas contra el selector de
 * `ANTES_DEL_ALCANCE` y AFIRMA los dos fallos: ofrecía cuentas sin vínculo y no
 * recordaba nada.
 *
 * Se levanta con `scripts/banco-embudos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const M = ROTO
    ? await import("./.compilado/embudos/entrada-de-embudos-alcance-antes.js")
    : await import("./.compilado/embudos/entrada-de-embudos-alcance.js");
const { ponerAQuienMira, db, tableroDelEmbudoAction, laCuentaConLaQueAbre, laCuentaRecordada } = M;

// La base se reutiliza entre ejecuciones: sin sello, la segunda vuelta
// encuentra también las filas de la primera y el banco falla por acumulación.
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (n) => `al-${n}-${V}`;

/** La cuenta de la casa: rol `admin`, con dos hijas vinculadas. */
const CASA = id("casa");
const HIJA1 = id("hija1");
const HIJA2 = id("hija2");
/** Su administradora: otra PERSONA actuando por la misma cuenta. */
const ADMIN = id("admin");

/** Una cuenta cliente SIN ningún vínculo con la casa. La que se colaba. */
const SUELTA = id("suelta");

/** Un reseller y su cliente por la tabla `reseller`: tampoco hay enlace. */
const RESELLER = id("reseller");
const CLIENTE_R = id("cliente-r");

/** Una cuenta que no es de nadie, para el caso «no hay nada que elegir». */
const SOLA = id("sola");

const fila = (uid, extra = {}) => ({
    id: uid,
    sessionUserId: uid,
    role: "user",
    rolDeLaPersona: "user",
    email: `${uid}@banco.test`,
    name: uid,
    effectiveId: uid,
    ownerId: null,
    advisorRole: null,
    ...extra,
});

const como = {
    casa: () => ponerAQuienMira(fila(CASA, { role: "admin", rolDeLaPersona: "admin" })),
    admin: () =>
        ponerAQuienMira(
            fila(ADMIN, { effectiveId: CASA, ownerId: CASA, advisorRole: "administrador" }),
        ),
    /** La MISMA persona, pero dentro de otra cuenta («Ingresar»). */
    casaDentroDeSuelta: () =>
        ponerAQuienMira(fila(CASA, { role: "admin", rolDeLaPersona: "admin", effectiveId: SUELTA })),
    reseller: () => ponerAQuienMira(fila(RESELLER, { role: "reseller", rolDeLaPersona: "reseller" })),
    sola: () => ponerAQuienMira(fila(SOLA)),
};

const crearUsuario = (uid, extra = {}) =>
    db.user.create({
        data: {
            id: uid,
            email: `${uid}@banco.test`,
            name: uid,
            password: "x",
            role: "user",
            status: true,
            ...extra,
        },
    });

let sembrado = false;

async function sembrar() {
    if (sembrado) return;
    sembrado = true;

    await crearUsuario(CASA, { role: "admin", company: "La casa" });
    await crearUsuario(HIJA1, { company: "Hija uno" });
    await crearUsuario(HIJA2, { company: "Hija dos" });
    await crearUsuario(SUELTA, { company: "Cliente sin vinculo" });
    await crearUsuario(SOLA, { company: "Cuenta sola" });
    await crearUsuario(RESELLER, { role: "reseller", company: "Reseller" });
    await crearUsuario(CLIENTE_R, { company: "Cliente del reseller" });
    await crearUsuario(ADMIN, { ownerId: CASA, advisorRole: "administrador" });

    // Lo ÚNICO que hace hija a una cuenta: que la de arriba la haya vinculado.
    await db.linkedAccount.createMany({
        data: [
            { masterUserId: CASA, linkedUserId: HIJA1 },
            { masterUserId: CASA, linkedUserId: HIJA2 },
        ],
    });
    // El reseller tiene su cliente por el otro camino, que NO es un vínculo.
    await db.reseller.create({ data: { resellerid: RESELLER, userId: CLIENTE_R } });
}

const pedir = async (hacer, que) => {
    const r = await hacer();
    assert.ok(r?.success, `${que}: ${r?.message}`);
    return r.data;
};

const abrir = (cuenta = null) => pedir(() => tableroDelEmbudoAction(null, cuenta, null), "abrir");
const ofrecidas = (t) => (t.cuentas ?? []).map((c) => c.id).sort();

// ───────────────────────── El alcance del selector ───────────────────────────

test("el selector ofrece la cuenta propia y sus hijas, y NADA más", async () => {
    await sembrar();
    como.casa();
    const t = await abrir();

    if (ROTO) {
        // El «antes»: la cartera entraba en el alcance, así que una cuenta de
        // la casa ofrecía cuentas cliente sin ningún vínculo con ella. Eso es
        // el fallo.
        assert.ok(
            ofrecidas(t).includes(SUELTA),
            "ANTES: el selector ofrecía una cuenta cliente sin vínculo ninguno",
        );
        assert.ok(
            ofrecidas(t).length > 3,
            `ANTES: y no eran la propia y sus dos hijas, eran ${ofrecidas(t).length}`,
        );
        return;
    }

    assert.deepEqual(ofrecidas(t), [CASA, HIJA1, HIJA2].sort());
    assert.equal(t.puedeElegirCuenta, true);
    assert.equal(t.cuentas[0].id, CASA, "la propia va primero: es la de cada día");
    assert.equal(t.cuentas[0].esLaPropia, true);
});

test("una cuenta de la cartera NO se puede abrir aunque se pida a mano", async () => {
    await sembrar();
    if (ROTO) return;
    como.casa();
    for (const ajena of [SUELTA, CLIENTE_R]) {
        const t = await abrir(ajena);
        assert.equal(t.cuentaId, CASA, `${ajena} no cuelga de la casa: se cae en la propia`);
        assert.equal(t.esOtraCuenta, false);
    }
});

test("un reseller no alcanza su cartera: administrar no es colgar de", async () => {
    await sembrar();
    if (ROTO) return;
    como.reseller();
    const t = await abrir(CLIENTE_R);
    assert.equal(t.cuentaId, RESELLER, "su cliente no está vinculado a él");
    assert.equal(t.puedeElegirCuenta, false, "y sin hijas no hay selector");
    assert.deepEqual(t.cuentas, []);
});

test("sin hijas el selector no se pinta en absoluto", async () => {
    await sembrar();
    if (ROTO) return;
    como.sola();
    const t = await abrir();
    assert.equal(t.puedeElegirCuenta, false);
    assert.deepEqual(t.cuentas, []);
});

test("la administradora de la casa alcanza lo mismo que la casa", async () => {
    await sembrar();
    if (ROTO) return;
    como.admin();
    const t = await abrir(HIJA1);
    assert.equal(t.cuentaId, HIJA1, "actúa POR su cuenta, así que alcanza sus hijas");
    assert.deepEqual(ofrecidas(t), [CASA, HIJA1, HIJA2].sort());
});

// ─────────────────────────── La cuenta recordada ─────────────────────────────

test("se abre donde se quedó, no siempre en la propia", async () => {
    await sembrar();

    /*
     * Con una persona RECIÉN creada, para que la primera visita sea de verdad
     * la primera: las pruebas de arriba ya abrieron el tablero como la casa, y
     * abrir es lo que apunta. Un caso que depende del orden en que corra el
     * fichero no prueba lo que dice.
     */
    const NUEVA = id("nueva");
    await crearUsuario(NUEVA, { ownerId: CASA, advisorRole: "administrador" });
    const suya = fila(NUEVA, { effectiveId: CASA, ownerId: CASA, advisorRole: "administrador" });
    ponerAQuienMira(suya);

    assert.equal(await laCuentaConLaQueAbre(suya), null, "de partida no hay nada que recordar");
    const primera = await abrir(await laCuentaConLaQueAbre(suya));
    assert.equal(primera.cuentaId, CASA, "así que abre en la suya, como siempre");

    // Elegir una hija es lo que la apunta.
    const enLaHija = await abrir(HIJA1);

    if (ROTO) {
        assert.equal(
            await laCuentaConLaQueAbre(suya),
            null,
            "ANTES: no se recordaba nada, así que la visita siguiente volvía a la propia",
        );
        return;
    }

    assert.equal(enLaHija.cuentaId, HIJA1);

    // Y la visita siguiente: la página abre sin `?cuenta=` y lo pregunta.
    assert.equal(await laCuentaConLaQueAbre(suya), HIJA1);
    const siguiente = await abrir(await laCuentaConLaQueAbre(suya));
    assert.equal(siguiente.cuentaId, HIJA1, "la próxima vez abre en la hija");
    assert.equal(siguiente.esOtraCuenta, true);

    // Volver a la propia también se recuerda: si no, no habría forma de salir.
    await abrir(CASA);
    assert.equal(await laCuentaConLaQueAbre(suya), CASA);
});

test("la memoria es de la pareja (persona, cuenta propia): nadie pisa a nadie", async () => {
    await sembrar();
    if (ROTO) return;

    como.casa();
    await abrir(HIJA1);

    // La administradora es OTRA persona actuando por la MISMA cuenta.
    como.admin();
    await abrir(HIJA2);

    assert.equal(await laCuentaRecordada(CASA, CASA), HIJA1, "lo del dueño sigue ahí");
    assert.equal(await laCuentaRecordada(ADMIN, CASA), HIJA2, "y lo de la administradora al lado");

    /*
     * Y la otra mitad, que es la que obliga a que la cuenta propia entre en la
     * llave: la MISMA persona dentro de otra cuenta («Ingresar»). Ahí no hay
     * selector, así que una simple recarga apuntaría esa cuenta — y con la
     * persona sola se llevaría por delante lo que eligió en la suya.
     */
    como.casaDentroDeSuelta();
    const dentro = await abrir();
    assert.equal(dentro.cuentaId, SUELTA);
    assert.equal(await laCuentaRecordada(CASA, CASA), HIJA1, "lo de su casa sigue intacto");
    assert.equal(await laCuentaRecordada(CASA, SUELTA), SUELTA, "y ese contexto recuerda el suyo");
});

test("una cuenta recordada que ya no se alcanza no abre nada: cae en la propia", async () => {
    await sembrar();
    if (ROTO) return;

    // Como si la hija se hubiera desvinculado después de elegirla: la fila
    // apunta a una cuenta que hoy no cuelga de la casa.
    await db.$executeRawUnsafe(
        `INSERT INTO "embudo_cuenta_recordada" ("personaId", "cuentaPropia", "cuentaElegida", "tocadoEn")
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT ("personaId", "cuentaPropia") DO UPDATE SET "cuentaElegida" = EXCLUDED."cuentaElegida"`,
        CASA,
        CASA,
        SUELTA,
    );

    como.casa();
    const recordada = await laCuentaConLaQueAbre(fila(CASA, { role: "admin" }));
    assert.equal(recordada, SUELTA, "lo guardado se devuelve tal cual: filtrarlo no es su trabajo");

    const t = await abrir(recordada);
    assert.equal(t.cuentaId, CASA, "y quien decide lo tira: se abre en la propia");
    // Y se cura sola: lo que queda apuntado es lo que de verdad se está mirando.
    assert.equal(await laCuentaRecordada(CASA, CASA), CASA);
});

test("a un agente no se le recuerda nada: no elige ninguna cuenta", async () => {
    await sembrar();
    if (ROTO) return;
    const AGENTE = id("agente");
    await crearUsuario(AGENTE, { ownerId: CASA, advisorRole: "agente" });
    const suya = fila(AGENTE, { effectiveId: CASA, ownerId: CASA, advisorRole: "agente" });
    ponerAQuienMira(suya);

    const t = await abrir(HIJA1);
    assert.equal(t.cuentaId, CASA, "un agente se queda en su cuenta");
    assert.equal(t.puedeElegirCuenta, false);
    /*
     * Y no deja fila. Embudos es su pantalla de trabajo: apuntarle en cada
     * carga la única cuenta que puede ver, para leérsela después y devolverle
     * esa misma, sería una escritura y una consulta al día por agente para no
     * decidir nada.
     */
    assert.equal(await laCuentaRecordada(AGENTE, CASA), null, "ni se apunta");
    assert.equal(await laCuentaConLaQueAbre(suya), null, "ni se pregunta");
});
