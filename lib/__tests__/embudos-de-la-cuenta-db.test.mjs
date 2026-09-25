/**
 * El tablero de otra cuenta y el filtro de asesor, contra Postgres y por las
 * ACCIONES de verdad.
 *
 * Probar `laCuentaDelTablero` a solas sería probar el lado que **no tiene
 * puerta**: lo que hay que demostrar es que las acciones pasan por ella y que
 * el alcance sale de FILAS —`linked_accounts`, la tabla `reseller`, el rol de la
 * cuenta— y no de un parámetro. Lo único fingido es `currentUser()` y
 * `revalidatePath`.
 *
 * La familia es la de producción en pequeño: una madre con dos hijas, una
 * cuenta ajena, un reseller con su cliente, y equipos en la madre y en la hija.
 *
 * Lo que se demuestra:
 *
 *  - La madre elige una hija y ve el tablero de ESA cuenta: sus embudos, sus
 *    etapas y sus conversaciones. **Nunca mezcladas** con las de la madre ni con
 *    las de la hermana.
 *  - Una hija no ve a su madre ni a su hermana **ni escribiendo el parámetro a
 *    mano**, y un agente no puede elegir cuenta ninguna.
 *  - Un reseller alcanza a su cliente; una cuenta ajena a la familia, a nadie.
 *  - El filtro de asesor: por defecto TODOS juntos, filtrando a uno solo las
 *    suyas, y filtrando a alguien cuyo embudo es otro el tablero CAMBIA a su
 *    embudo —porque es el único donde sus tarjetas se pueden mover—.
 *  - El total de cada etapa es un `COUNT` y no el `length` de lo cargado: con
 *    más conversaciones que el tope, la cabecera sigue diciendo la verdad.
 *  - Y las columnas del SQL en crudo son las de la BASE, comprobadas contra
 *    `information_schema`.
 *
 * `MODO=roto` corre las mismas pruebas contra el tablero y las acciones de
 * `ANTES_REF` y AFIRMA el fallo: la cuenta y el asesor se ignoraban, y no había
 * totales por etapa.
 *
 * Se levanta con `scripts/banco-embudos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const M = ROTO
    ? await import("./.compilado/embudos/entrada-de-embudos-antes.js")
    : await import("./.compilado/embudos/entrada-de-embudos.js");
const {
    ponerAQuienMira,
    db,
    tableroDelEmbudoAction,
    crearEmbudoAction,
    asignarEmbudosAction,
    moverTarjetaAction,
} = M;

const { SIN_ASIGNAR, TODOS_LOS_ASESORES, losTotalesPorEtapa } = await import(
    "./.compilado/embudos/embudos-de-la-cuenta.js"
);

/*
 * La base se reutiliza entre ejecuciones, así que cada vuelta lleva su sello:
 * sin él, la segunda encuentra también las filas de la primera y el banco falla
 * por acumulación en vez de por lo que viene a probar.
 */
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (n) => `ec-${n}-${V}`;

const MADRE = id("madre");
const HIJA = id("hija");
const HERMANA = id("hermana");
const AJENA = id("ajena");
const RESELLER = id("reseller");
const CLIENTE_R = id("cliente-r");

// Equipos: la madre con su administradora y dos agentes; la hija con el suyo.
const ADMIN = id("admin");
const ANA = id("ana");
const BETO = id("beto");
const HIJA_ANA = id("hija-ana");

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
    madre: () => ponerAQuienMira(fila(MADRE)),
    admin: () => ponerAQuienMira(fila(ADMIN, { effectiveId: MADRE, ownerId: MADRE, advisorRole: "administrador" })),
    ana: () => ponerAQuienMira(fila(ANA, { effectiveId: MADRE, ownerId: MADRE, advisorRole: "agente" })),
    hija: () => ponerAQuienMira(fila(HIJA)),
    ajena: () => ponerAQuienMira(fila(AJENA)),
    reseller: () => ponerAQuienMira(fila(RESELLER, { role: "reseller", rolDeLaPersona: "reseller" })),
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
const S = {};

async function conversacion(cuenta, asesor, n) {
    const s = await db.session.create({
        data: {
            userId: cuenta,
            remoteJid: `57${n}${V.replace(/\D/g, "").slice(0, 8)}@s.whatsapp.net`,
            pushName: `Cliente ${n}`,
            instanceId: `inst-${V}`,
            status: true,
            assignedAdvisorId: asesor,
        },
    });
    return s.id;
}

async function sembrar() {
    if (sembrado) return;
    sembrado = true;

    await crearUsuario(MADRE, { company: "Madre" });
    await crearUsuario(HIJA, { company: "Hija" });
    await crearUsuario(HERMANA, { company: "Hermana" });
    await crearUsuario(AJENA, { company: "Ajena" });
    await crearUsuario(RESELLER, { role: "reseller", company: "Reseller" });
    await crearUsuario(CLIENTE_R, { company: "Cliente del reseller" });

    await crearUsuario(ADMIN, { ownerId: MADRE, advisorRole: "administrador" });
    await crearUsuario(ANA, { ownerId: MADRE, advisorRole: "agente" });
    await crearUsuario(BETO, { ownerId: MADRE, advisorRole: "agente" });
    await crearUsuario(HIJA_ANA, { ownerId: HIJA, advisorRole: "agente" });

    // La madre vinculó a las dos bajo la suya: es lo que las hace hijas.
    await db.linkedAccount.createMany({
        data: [
            { masterUserId: MADRE, linkedUserId: HIJA },
            { masterUserId: MADRE, linkedUserId: HERMANA },
        ],
    });
    // Y el reseller tiene su cliente por la tabla `reseller`, que es el otro
    // camino: no hay ningún `linked_accounts` entre ellos.
    await db.reseller.create({ data: { resellerid: RESELLER, userId: CLIENTE_R } });

    S.madreAna1 = await conversacion(MADRE, ANA, 1);
    S.madreAna2 = await conversacion(MADRE, ANA, 2);
    S.madreBeto = await conversacion(MADRE, BETO, 3);
    S.madreSin = await conversacion(MADRE, null, 4);

    S.hija1 = await conversacion(HIJA, HIJA_ANA, 5);
    S.hija2 = await conversacion(HIJA, HIJA_ANA, 6);
    S.hijaSin = await conversacion(HIJA, null, 7);

    S.hermanaSin = await conversacion(HERMANA, null, 8);
    S.ajena = await conversacion(AJENA, null, 9);
}

const pedir = async (hacer, que) => {
    const r = await hacer();
    assert.ok(r?.success, `${que}: ${r?.message}`);
    return r.data;
};

const nombresDeLasTarjetas = (t) => t.tarjetas.map((x) => x.pushName).sort();

// ─────────────────────────────────────────────────────────────────────────────

test("crear un embudo con la cuenta de la hija lo crea EN la hija", async () => {
    await sembrar();

    como.madre();
    await pedir(() => crearEmbudoAction("Ventas madre", MADRE), "crear en la madre");

    if (ROTO) {
        // El «antes»: la acción no recibía cuenta, así que todo nacía en la
        // propia. El embudo de la hija hay que crearlo entrando como ella.
        como.hija();
        await pedir(() => crearEmbudoAction("Ventas hija"), "antes: crear siendo la hija");
        const enLaMadre = await db.$queryRaw`SELECT "nombre" FROM "embudos" WHERE "cuentaId" = ${MADRE}`;
        assert.deepEqual(enLaMadre.map((f) => f.nombre), ["Ventas madre"]);
        return;
    }

    // El mismo botón, con la cuenta de la HIJA: el embudo nace allí, no aquí.
    await pedir(() => crearEmbudoAction("Ventas hija", HIJA), "crear en la hija");
    const deLaHija = await db.$queryRaw`SELECT "nombre" FROM "embudos" WHERE "cuentaId" = ${HIJA}`;
    assert.deepEqual(deLaHija.map((f) => f.nombre), ["Ventas hija"]);
    const deLaMadre = await db.$queryRaw`SELECT "nombre" FROM "embudos" WHERE "cuentaId" = ${MADRE}`;
    assert.deepEqual(deLaMadre.map((f) => f.nombre), ["Ventas madre"], "y no se cruzan");
});

test("la madre elige la hija y ve el tablero de ESA cuenta, sin mezclar", async () => {
    await sembrar();
    como.madre();

    const propio = await pedir(() => tableroDelEmbudoAction(null, MADRE, null), "tablero propio");
    assert.deepEqual(nombresDeLasTarjetas(propio), ["Cliente 1", "Cliente 2", "Cliente 3", "Cliente 4"]);

    if (ROTO) {
        // El «antes»: la cuenta pedida se ignoraba, así que pedir la hija
        // devolvía el tablero de la madre. Eso es el fallo.
        const conLaHija = await pedir(() => tableroDelEmbudoAction(null, HIJA, null), "antes: pedir la hija");
        assert.deepEqual(
            nombresDeLasTarjetas(conLaHija),
            ["Cliente 1", "Cliente 2", "Cliente 3", "Cliente 4"],
            "ANTES: pedir otra cuenta devolvía la propia",
        );
        assert.equal(conLaHija.cuentaId, undefined, "ANTES: el tablero no decía de qué cuenta era");
        return;
    }

    assert.equal(propio.cuentaId, MADRE);
    const deLaHija = await pedir(() => tableroDelEmbudoAction(null, HIJA, null), "tablero de la hija");
    assert.equal(deLaHija.cuentaId, HIJA);
    assert.equal(deLaHija.esOtraCuenta, true);
    // Lo que de verdad se pidió: nunca se mezclan dos cuentas en un tablero.
    assert.deepEqual(nombresDeLasTarjetas(deLaHija), ["Cliente 5", "Cliente 6", "Cliente 7"]);
    assert.equal(deLaHija.total, 3);
    assert.ok(
        deLaHija.embudos.every((e) => e.nombre === "Ventas hija"),
        "los embudos son los de la hija",
    );

    // Y el selector ofrece las tres cuentas de la familia, la propia primera.
    assert.equal(propio.puedeElegirCuenta, true);
    assert.deepEqual(
        propio.cuentas.map((c) => c.id),
        [MADRE, HERMANA, HIJA].sort((a, b) => (a === MADRE ? -1 : b === MADRE ? 1 : a.localeCompare(b))),
    );
    assert.equal(propio.cuentas[0].esLaPropia, true);
});

test("una hija no ve a su madre ni a su hermana, ni escribiendo el parámetro", async () => {
    await sembrar();
    como.hija();

    const suyo = await pedir(() => tableroDelEmbudoAction(null, MADRE, null), "la hija pide la madre");
    if (ROTO) {
        assert.deepEqual(nombresDeLasTarjetas(suyo), ["Cliente 5", "Cliente 6", "Cliente 7"]);
        return;
    }
    assert.equal(suyo.cuentaId, HIJA, "se cae en la propia");
    assert.deepEqual(nombresDeLasTarjetas(suyo), ["Cliente 5", "Cliente 6", "Cliente 7"]);
    assert.equal(suyo.puedeElegirCuenta, false, "no hay nada que elegir hacia abajo");

    const conLaHermana = await pedir(() => tableroDelEmbudoAction(null, HERMANA, null), "la hija pide la hermana");
    assert.equal(conLaHermana.cuentaId, HIJA);
});

test("un agente no elige cuenta ninguna", async () => {
    await sembrar();
    if (ROTO) return;
    como.ana();
    const t = await pedir(() => tableroDelEmbudoAction(null, HIJA, null), "el agente pide la hija");
    assert.equal(t.cuentaId, MADRE, "un agente se queda en su cuenta");
    assert.equal(t.puedeElegirCuenta, false);
    assert.deepEqual(t.cuentas, []);
});

test("la administradora de la madre alcanza lo mismo que ella", async () => {
    await sembrar();
    if (ROTO) return;
    como.admin();
    const t = await pedir(() => tableroDelEmbudoAction(null, HIJA, null), "la admin pide la hija");
    assert.equal(t.cuentaId, HIJA, "actúa POR su cuenta, así que alcanza sus hijas");
    assert.deepEqual(nombresDeLasTarjetas(t), ["Cliente 5", "Cliente 6", "Cliente 7"]);
});

test("un reseller alcanza a su cliente, aunque no haya ningún enlace", async () => {
    await sembrar();
    if (ROTO) return;
    como.reseller();
    const t = await pedir(() => tableroDelEmbudoAction(null, CLIENTE_R, null), "el reseller pide su cliente");
    assert.equal(t.cuentaId, CLIENTE_R, "la cartera del reseller es la otra fuente del alcance");
    assert.ok(
        t.cuentas.some((c) => c.id === CLIENTE_R),
        "y el cliente sale en el selector",
    );
});

test("una cuenta ajena a la familia no alcanza a nadie", async () => {
    await sembrar();
    if (ROTO) return;
    como.ajena();
    for (const otra of [MADRE, HIJA, CLIENTE_R]) {
        const t = await pedir(() => tableroDelEmbudoAction(null, otra, null), `la ajena pide ${otra}`);
        assert.equal(t.cuentaId, AJENA);
    }
});

// ───────────────────────────── El filtro de asesor ───────────────────────────

test("por defecto salen TODOS los asesores juntos", async () => {
    await sembrar();
    como.madre();
    const t = await pedir(() => tableroDelEmbudoAction(null, MADRE, null), "sin filtro");
    assert.deepEqual(nombresDeLasTarjetas(t), ["Cliente 1", "Cliente 2", "Cliente 3", "Cliente 4"]);
    if (!ROTO) assert.equal(t.asesor, null, "«todos» no se escribe en la URL");
});

test("filtrando a un asesor salen solo las suyas", async () => {
    await sembrar();
    como.madre();

    if (ROTO) {
        // El «antes»: el asesor pedido se ignoraba, así que seguían saliendo las
        // cuatro. Eso es el fallo.
        const t = await pedir(() => tableroDelEmbudoAction(null, MADRE, ANA), "antes: filtrar a Ana");
        assert.deepEqual(
            nombresDeLasTarjetas(t),
            ["Cliente 1", "Cliente 2", "Cliente 3", "Cliente 4"],
            "ANTES: no había forma de filtrar por asesor",
        );
        return;
    }

    const deAna = await pedir(() => tableroDelEmbudoAction(null, MADRE, ANA), "filtrar a Ana");
    assert.deepEqual(nombresDeLasTarjetas(deAna), ["Cliente 1", "Cliente 2"]);
    assert.equal(deAna.total, 2);
    assert.equal(deAna.asesor, ANA);

    const deBeto = await pedir(() => tableroDelEmbudoAction(null, MADRE, BETO), "filtrar a Beto");
    assert.deepEqual(nombresDeLasTarjetas(deBeto), ["Cliente 3"]);

    const sinAsesor = await pedir(() => tableroDelEmbudoAction(null, MADRE, SIN_ASIGNAR), "sin asesor");
    assert.deepEqual(nombresDeLasTarjetas(sinAsesor), ["Cliente 4"]);

    // Y volver a «todos» los junta otra vez.
    const todos = await pedir(() => tableroDelEmbudoAction(null, MADRE, TODOS_LOS_ASESORES), "todos");
    assert.equal(todos.total, 4);
});

test("un id de asesor de otra cuenta NO acota: cae en todos", async () => {
    await sembrar();
    if (ROTO) return;
    como.madre();
    // Si acotara, preguntar por el id de alguien de otra cuenta diría si tiene
    // conversaciones aquí.
    const t = await pedir(() => tableroDelEmbudoAction(null, MADRE, HIJA_ANA), "filtrar con un id de fuera");
    assert.equal(t.asesor, null);
    assert.equal(t.total, 4);
});

test("filtrando a un asesor de otro embudo, el tablero CAMBIA a su embudo", async () => {
    await sembrar();
    if (ROTO) return;
    como.madre();

    const soporte = await pedir(() => crearEmbudoAction("Soporte madre", MADRE), "crear Soporte");
    await pedir(
        () => asignarEmbudosAction([{ personaId: BETO, embudoId: soporte.id }], MADRE),
        "asignar Beto a Soporte",
    );

    // Con «todos» en el por defecto, Beto ya no entra: sus conversaciones están
    // en el otro embudo.
    const todos = await pedir(() => tableroDelEmbudoAction(null, MADRE, null), "todos en el por defecto");
    assert.ok(!nombresDeLasTarjetas(todos).includes("Cliente 3"), "la de Beto se fue a su embudo");

    // Y filtrando a Beto, el tablero se va a Soporte: es el único donde su
    // tarjeta tiene posición y donde moverla vale.
    const deBeto = await pedir(() => tableroDelEmbudoAction(null, MADRE, BETO), "filtrar a Beto");
    assert.equal(deBeto.embudoId, soporte.id, "el filtro de asesor cambia de embudo");
    assert.deepEqual(nombresDeLasTarjetas(deBeto), ["Cliente 3"]);

    // Y mover su tarjeta ahí funciona, que es de lo que se trata.
    const etapa = deBeto.etapas[1] ?? deBeto.etapas[0];
    const r = await moverTarjetaAction(S.madreBeto, etapa.id);
    assert.ok(r.success, `mover en el embudo del filtro: ${r.message}`);

    // Se deshace para no dejar el reparto tocado a los siguientes.
    await pedir(() => asignarEmbudosAction([{ personaId: BETO, embudoId: null }], MADRE), "devolver a Beto");
});

// ──────────────── El total de una etapa: un COUNT, no un length ──────────────

test("el total de cada etapa es un COUNT, y suma el total del tablero", async () => {
    await sembrar();
    if (ROTO) {
        como.madre();
        const t = await pedir(() => tableroDelEmbudoAction(null, MADRE, null), "antes: totales");
        assert.equal(t.totales, undefined, "ANTES: el tablero no traía totales por etapa");
        return;
    }

    // Una cuenta con más conversaciones que el tope: es el caso donde contar las
    // tarjetas cargadas MIENTE.
    const CUENTA = id("grande");
    await crearUsuario(CUENTA, { company: "Grande" });
    ponerAQuienMira(fila(CUENTA));
    await pedir(() => crearEmbudoAction("Único", CUENTA), "crear en la grande");

    const CUANTAS = 520;
    await db.session.createMany({
        data: Array.from({ length: CUANTAS }, (_, i) => ({
            userId: CUENTA,
            remoteJid: `58${String(i).padStart(4, "0")}${V.replace(/\D/g, "").slice(0, 6)}@s.whatsapp.net`,
            pushName: `Grande ${i}`,
            instanceId: `inst-${V}`,
            status: true,
        })),
    });

    const t = await pedir(() => tableroDelEmbudoAction(null, CUENTA, null), "tablero grande");
    assert.equal(t.total, CUANTAS);
    assert.equal(t.tarjetas.length, 500, "el tablero trae como mucho el tope");

    const primera = t.etapas[0];
    assert.equal(
        t.totales[primera.id],
        CUANTAS,
        "la cabecera dice el total de verdad, no las 500 cargadas",
    );
    assert.equal(
        Object.values(t.totales).reduce((a, b) => a + b, 0),
        CUANTAS,
        "los totales por etapa suman el total del tablero",
    );

    // Y al mover una, el conteo se reparte: una en la segunda y el resto en la
    // primera. Esto ejerce el `GROUP BY` de verdad, no solo el resto.
    const segunda = t.etapas[1];
    assert.ok((await moverTarjetaAction(t.tarjetas[0].id, segunda.id)).success, "mover una");
    const t2 = await pedir(() => tableroDelEmbudoAction(null, CUENTA, null), "tablero grande otra vez");
    assert.equal(t2.totales[segunda.id], 1);
    assert.equal(t2.totales[primera.id], CUANTAS - 1);
});

test("el total por etapa respeta el filtro de asesor", async () => {
    await sembrar();
    if (ROTO) return;
    como.madre();
    const deAna = await pedir(() => tableroDelEmbudoAction(null, MADRE, ANA), "filtrar a Ana");
    assert.equal(
        Object.values(deAna.totales).reduce((a, b) => a + b, 0),
        2,
        "los totales cuentan lo mismo que el tablero enseña",
    );
});

test("y el reparto cuadra con la regla pura", async () => {
    await sembrar();
    if (ROTO) return;
    como.madre();
    const t = await pedir(() => tableroDelEmbudoAction(null, MADRE, null), "tablero");
    // Encadenadas: los conteos que devuelve la base, pasados por la regla,
    // tienen que dar exactamente lo que el tablero pintó. Si discreparan, la
    // cabecera diría un número y la columna enseñaría otro.
    const guardados = {};
    for (const tarjeta of t.tarjetas) {
        const fila = await db.$queryRaw`
            SELECT "etapaId" FROM "embudo_posiciones"
            WHERE "embudoId" = ${t.embudoId} AND "sessionId" = ${tarjeta.id}
        `;
        if (fila[0]) guardados[fila[0].etapaId] = (guardados[fila[0].etapaId] ?? 0) + 1;
    }
    assert.deepEqual(t.totales, losTotalesPorEtapa(t.etapas, guardados, t.total));
});

// ───────────── Mover una tarjeta de otra cuenta, y la del vecino ─────────────

test("la madre mueve una tarjeta de la hija estando en su tablero", async () => {
    await sembrar();
    if (ROTO) return;
    como.madre();
    const deLaHija = await pedir(() => tableroDelEmbudoAction(null, HIJA, null), "tablero de la hija");
    const destino = deLaHija.etapas[1] ?? deLaHija.etapas[0];
    const r = await moverTarjetaAction(S.hija1, destino.id);
    assert.ok(r.success, `mover en la hija: ${r.message}`);

    const guardada = await db.$queryRaw`
        SELECT "etapaId" FROM "embudo_posiciones" WHERE "sessionId" = ${S.hija1}
    `;
    assert.equal(guardada[0]?.etapaId, destino.id);
});

test("nadie mueve la tarjeta de una cuenta que no alcanza", async () => {
    await sembrar();
    if (ROTO) return;

    como.ajena();
    const r = await moverTarjetaAction(S.madreAna1, "cualquiera");
    assert.equal(r.success, false, "una cuenta ajena no toca las conversaciones de otra");

    como.hija();
    const r2 = await moverTarjetaAction(S.madreAna1, "cualquiera");
    assert.equal(r2.success, false, "una hija tampoco toca las de su madre");
});

// ───────────── Las columnas en crudo son las de la BASE ──────────────────────

test("las columnas del SQL en crudo existen con ese nombre en la base", async () => {
    // Un `@map` no se deduce: se comprueba. `assignedAdvisorId` es
    // `assigned_advisor_id` en la base, y `userId` y `remoteJid` NO llevan
    // `@map`, así que van tal cual. Escribirlas «las tres a juego» rompe justo
    // las que funcionan.
    const filas = await db.$queryRaw`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Session'
          AND column_name IN ('userId', 'remoteJid', 'assigned_advisor_id', 'id')
    `;
    assert.deepEqual(
        filas.map((f) => f.column_name).sort(),
        ["assigned_advisor_id", "id", "remoteJid", "userId"],
        "las cuatro columnas que nombra losConteosPorEtapa",
    );
});

test.after(async () => {
    await db.$disconnect();
});
