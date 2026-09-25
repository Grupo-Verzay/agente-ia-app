/**
 * El tablero de OTRA cuenta y el filtro de asesor: las reglas, sin base.
 *
 * Aquí se prueba la DECISIÓN —qué cuenta se mira, qué asesor se filtra, a qué
 * embudo lleva ese filtro y cómo se reparten los totales—. Que las acciones
 * pasen por ella y que el alcance salga de FILAS lo prueba
 * `embudos-de-la-cuenta-db.test.mjs`, contra Postgres.
 *
 * Se levanta con `scripts/banco-embudos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    FILTRO_DE_TODOS,
    SIN_ASIGNAR,
    TODOS_LOS_ASESORES,
    aQuienSeMira,
    comoParametroDeAsesor,
    elEmbudoDelTablero,
    elFiltroDeAsesor,
    esOtraCuenta,
    laCuentaDelTablero,
    losTotalesPorEtapa,
    mandaEnLaCuenta,
} from "./.compilado/embudos/embudos-de-la-cuenta.js";

const MADRE = "madre";
const HIJA = "hija";
const HERMANA = "hermana";
const AJENA = "ajena";

const EMBUDOS = [
    { id: "ventas", nombre: "Ventas", porDefecto: true, orden: 0 },
    { id: "soporte", nombre: "Soporte", porDefecto: false, orden: 1 },
];
const ETAPAS = [
    { id: "e1", embudoId: "ventas", nombre: "Nuevo", color: null, orden: 0 },
    { id: "e2", embudoId: "ventas", nombre: "En proceso", color: null, orden: 1 },
    { id: "e3", embudoId: "ventas", nombre: "Cerrado", color: null, orden: 2 },
];

// ─────────────────────────── La cuenta: una, nunca dos ───────────────────────

test("la cuenta pedida vale si se alcanza, y si no se cae en la propia", () => {
    const alcanzables = [MADRE, HIJA, HERMANA];
    assert.equal(laCuentaDelTablero(HIJA, alcanzables, MADRE), HIJA);
    assert.equal(laCuentaDelTablero(MADRE, alcanzables, MADRE), MADRE);

    // Lo que no se alcanza no es un error que enseñar: es un id que no existe
    // para quien pregunta, y entonces lo que toca es su propio tablero.
    assert.equal(laCuentaDelTablero(AJENA, alcanzables, MADRE), MADRE);
    assert.equal(laCuentaDelTablero("", alcanzables, MADRE), MADRE);
    assert.equal(laCuentaDelTablero(null, alcanzables, MADRE), MADRE);
    assert.equal(laCuentaDelTablero(undefined, alcanzables, MADRE), MADRE);
    assert.equal(laCuentaDelTablero(42, alcanzables, MADRE), MADRE);
    assert.equal(laCuentaDelTablero(["hija"], alcanzables, MADRE), MADRE);
    assert.equal(laCuentaDelTablero("  hija  ", alcanzables, MADRE), HIJA, "se sanea");
});

test("una hija no alcanza a su madre ni a su hermana ni escribiéndolo a mano", () => {
    // Su alcance es solo ella: bajando no llega a nadie.
    assert.equal(laCuentaDelTablero(MADRE, [HIJA], HIJA), HIJA);
    assert.equal(laCuentaDelTablero(HERMANA, [HIJA], HIJA), HIJA);
});

test("la propia siempre vale, aunque no esté en la lista de alcanzables", () => {
    // Es lo que impide que un fallo al resolver el alcance deje a alguien sin
    // su propio tablero: se ve de menos, nunca de más, pero nunca nada.
    assert.equal(laCuentaDelTablero(MADRE, [], MADRE), MADRE);
    assert.equal(laCuentaDelTablero(null, [], MADRE), MADRE);
});

test("devuelve UNA cadena, no una lista: consolidar no es un estado posible", () => {
    const r = laCuentaDelTablero(HIJA, [MADRE, HIJA], MADRE);
    assert.equal(typeof r, "string");
    assert.ok(!Array.isArray(r));
});

test("esOtraCuenta y mandaEnLaCuenta", () => {
    assert.equal(esOtraCuenta(HIJA, MADRE), true);
    assert.equal(esOtraCuenta(MADRE, MADRE), false);
    assert.equal(esOtraCuenta("", MADRE), false);

    // En la propia manda quien mande; en otra, siempre —a otra cuenta solo se
    // llega administrándola—.
    assert.equal(mandaEnLaCuenta(true, MADRE, MADRE), true);
    assert.equal(mandaEnLaCuenta(false, MADRE, MADRE), false);
    assert.equal(mandaEnLaCuenta(true, HIJA, MADRE), true);
    assert.equal(mandaEnLaCuenta(false, HIJA, MADRE), true);
});

// ─────────────────────────── El filtro de asesor ─────────────────────────────

const EQUIPO = ["ana", "beto"];

test("el filtro por defecto son TODOS, y un id de fuera cae ahí", () => {
    assert.deepEqual(elFiltroDeAsesor(null, EQUIPO), FILTRO_DE_TODOS);
    assert.deepEqual(elFiltroDeAsesor("", EQUIPO), FILTRO_DE_TODOS);
    assert.deepEqual(elFiltroDeAsesor(TODOS_LOS_ASESORES, EQUIPO), FILTRO_DE_TODOS);
    assert.deepEqual(elFiltroDeAsesor(7, EQUIPO), FILTRO_DE_TODOS);

    // Un id que no es del equipo de ESTA cuenta no acota nada: si acotara,
    // preguntar por alguien de otra cuenta diría si tiene algo aquí.
    assert.deepEqual(elFiltroDeAsesor("de-otra-cuenta", EQUIPO), FILTRO_DE_TODOS);
});

test("el filtro reconoce a uno del equipo y a las que no tienen asesor", () => {
    assert.deepEqual(elFiltroDeAsesor("ana", EQUIPO), { tipo: "uno", personaId: "ana" });
    assert.deepEqual(elFiltroDeAsesor(SIN_ASIGNAR, EQUIPO), { tipo: "sinAsignar" });
});

test("solo lo que no es el estado de siempre vuelve a la URL", () => {
    assert.equal(comoParametroDeAsesor(FILTRO_DE_TODOS), null);
    assert.equal(comoParametroDeAsesor({ tipo: "sinAsignar" }), SIN_ASIGNAR);
    assert.equal(comoParametroDeAsesor({ tipo: "uno", personaId: "ana" }), "ana");
});

// ───────────────── El filtro puede cambiar de embudo, y tiene que ────────────

const QUIEN_MANDA = { personaId: "jefa", manda: true };
const UN_ASESOR = { personaId: "ana", manda: false };

test("filtrando a un asesor se abre SU embudo, no el que estaba puesto", () => {
    const asignaciones = { ana: "soporte", beto: "ventas" };
    // Estando en «Ventas» y filtrando a Ana, cuyo embudo es «Soporte»: el
    // tablero se va a Soporte. Es el único donde sus tarjetas tienen posición y
    // donde moverlas vale — si no, se pintarían en columnas ajenas y al
    // soltarlas el servidor diría que cambiaron de embudo.
    assert.equal(
        elEmbudoDelTablero(QUIEN_MANDA, "ventas", { tipo: "uno", personaId: "ana" }, asignaciones, EMBUDOS),
        "soporte",
    );
    // Y filtrando a Beto, que sí está en el abierto, no se mueve.
    assert.equal(
        elEmbudoDelTablero(QUIEN_MANDA, "ventas", { tipo: "uno", personaId: "beto" }, asignaciones, EMBUDOS),
        "ventas",
    );
});

test("un asesor sin embudo asignado cae en el por defecto", () => {
    assert.equal(
        elEmbudoDelTablero(QUIEN_MANDA, "soporte", { tipo: "uno", personaId: "nadie" }, {}, EMBUDOS),
        "ventas",
    );
});

test("«sin asesor» abre el por defecto, que es donde caen", () => {
    assert.equal(elEmbudoDelTablero(QUIEN_MANDA, "soporte", { tipo: "sinAsignar" }, {}, EMBUDOS), "ventas");
});

test("con «todos» manda el embudo pedido, como siempre", () => {
    assert.equal(elEmbudoDelTablero(QUIEN_MANDA, "soporte", FILTRO_DE_TODOS, {}, EMBUDOS), "soporte");
    assert.equal(elEmbudoDelTablero(QUIEN_MANDA, null, FILTRO_DE_TODOS, {}, EMBUDOS), "ventas");
    assert.equal(elEmbudoDelTablero(QUIEN_MANDA, "no-existe", FILTRO_DE_TODOS, {}, EMBUDOS), "ventas");
});

test("un asesor no filtra: ve SU embudo pida lo que pida", () => {
    const asignaciones = { ana: "soporte" };
    for (const filtro of [FILTRO_DE_TODOS, { tipo: "sinAsignar" }, { tipo: "uno", personaId: "beto" }]) {
        assert.equal(elEmbudoDelTablero(UN_ASESOR, "ventas", filtro, asignaciones, EMBUDOS), "soporte");
    }
    // Y sin embudo asignado, ninguno: la pantalla lo dice en vez de enseñarle
    // el de otro.
    assert.equal(elEmbudoDelTablero(UN_ASESOR, "ventas", FILTRO_DE_TODOS, {}, EMBUDOS), null);
});

// ─────────────── A quién se mira: una decisión, dos consultas ────────────────

test("a quién se mira, según quién abre y qué filtro tiene", () => {
    const reparto = { asesores: ["beto"], incluyeSinEmbudo: true, ajenos: ["ana"] };

    // Un asesor, lo suyo y nada más.
    assert.deepEqual(aQuienSeMira(UN_ASESOR, FILTRO_DE_TODOS, reparto), {
        tipo: "una-persona",
        personaId: "ana",
    });

    // Quien manda con «todos» en el por defecto: todos menos los de los OTROS
    // embudos, así que entran las que no tienen asesor.
    assert.deepEqual(aQuienSeMira(QUIEN_MANDA, FILTRO_DE_TODOS, reparto), {
        tipo: "todos-menos",
        ajenos: ["ana"],
    });

    // En un embudo que no es el por defecto, solo sus asesores.
    assert.deepEqual(
        aQuienSeMira(QUIEN_MANDA, FILTRO_DE_TODOS, { ...reparto, incluyeSinEmbudo: false }),
        { tipo: "estos", asesores: ["beto"] },
    );

    assert.deepEqual(aQuienSeMira(QUIEN_MANDA, { tipo: "uno", personaId: "ana" }, reparto), {
        tipo: "una-persona",
        personaId: "ana",
    });
    assert.deepEqual(aQuienSeMira(QUIEN_MANDA, { tipo: "sinAsignar" }, reparto), { tipo: "sin-asesor" });
});

// ───────────────── El total de una etapa: un COUNT, no un length ─────────────

test("lo que no tiene posición guardada cuenta en la PRIMERA etapa", () => {
    // 10 conversaciones, 3 con posición: las otras 7 se pintan en la primera,
    // así que ahí es donde tienen que contarse.
    const t = losTotalesPorEtapa(ETAPAS, { e2: 2, e3: 1 }, 10);
    assert.deepEqual(t, { e1: 7, e2: 2, e3: 1 });
    assert.equal(Object.values(t).reduce((a, b) => a + b, 0), 10, "los totales suman el total");
});

test("una posición en una etapa BORRADA también cuenta en la primera", () => {
    // `laEtapaDeLaConversacion` la pinta en la primera, así que el número tiene
    // que decir lo mismo: si no, la columna enseñaría una tarjeta que su
    // cabecera no cuenta.
    const t = losTotalesPorEtapa(ETAPAS, { e2: 2, "etapa-que-se-borro": 4 }, 10);
    assert.deepEqual(t, { e1: 8, e2: 2, e3: 0 });
});

test("el total no es el número de tarjetas cargadas", () => {
    // Es el encargo entero: con el tope de 500, contar lo cargado da «cuántas
    // de las primeras 500 cayeron aquí». El total sale del `COUNT`.
    const t = losTotalesPorEtapa(ETAPAS, { e1: 300, e2: 200 }, 1200);
    assert.deepEqual(t, { e1: 1000, e2: 200, e3: 0 });
});

test("nunca un número negativo, ni con conteos raros", () => {
    // Entre el `COUNT` y el `GROUP BY` puede entrar una conversación, y un
    // número negativo en una cabecera no significa nada.
    assert.deepEqual(losTotalesPorEtapa(ETAPAS, { e1: 5, e2: 5 }, 3), { e1: 5, e2: 5, e3: 0 });
    assert.deepEqual(losTotalesPorEtapa(ETAPAS, { e2: -4 }, 2), { e1: 2, e2: 0, e3: 0 });
    assert.deepEqual(losTotalesPorEtapa(ETAPAS, { e2: "3" }, 5), { e1: 2, e2: 3, e3: 0 });
});

test("sin etapas no hay totales, y no revienta", () => {
    assert.deepEqual(losTotalesPorEtapa([], {}, 0), {});
    assert.deepEqual(losTotalesPorEtapa([], { e1: 3 }, 9), {});
});

test("la primera es la de menor orden, no la primera del arreglo", () => {
    const desordenadas = [ETAPAS[2], ETAPAS[0], ETAPAS[1]];
    const t = losTotalesPorEtapa(desordenadas, {}, 6);
    assert.equal(t.e1, 6, "el resto va a la de orden 0");
    assert.equal(t.e3, 0);
});
