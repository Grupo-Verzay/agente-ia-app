/**
 * Embudos y lo personal: las reglas, sin base de datos.
 *
 * Lo que decide qué ve quién y dónde cae cada conversación vive en
 * `lib/embudos.ts` y `lib/personales.ts`, y lo usan la pantalla y el servidor.
 * Aquí se prueba la decisión; contra Postgres, `embudos-db.test.mjs`.
 *
 * Se levanta con `scripts/banco-embudos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    COLORES_DE_ETAPA,
    comoColor,
    comoListaDeEtapas,
    comoNombre,
    elColorDeLaEtapa,
    elEmbudoDeLaConversacion,
    elEmbudoPorDefecto,
    elEmbudoQueSeAbre,
    laEtapaDeLaConversacion,
    puedeMoverLaTarjeta,
    quienCaeEnElEmbudo,
} from "./.compilado/embudos/embudos.js";
import {
    elGrupo,
    enGrupos,
    laPuedeTocar,
    laVe,
    naceSuya,
    slugPersonal,
} from "./.compilado/embudos/personales.js";
import {
    LLAVE_DEL_CAMBIO,
    anotarCambioDeEtapa,
    huboCambioDeEtapa,
} from "./.compilado/embudos/etapa-desde-el-chat.js";

const E = [
    { id: "ventas", nombre: "Ventas", porDefecto: false, orden: 0 },
    { id: "soporte", nombre: "Soporte", porDefecto: true, orden: 1 },
];
const ASIG = { ana: "ventas", beto: "soporte", fantasma: "borrado" };

test("el por defecto es el marcado; sin marcado, el primero por orden", () => {
    assert.equal(elEmbudoPorDefecto(E)?.id, "soporte");
    assert.equal(elEmbudoPorDefecto(E.map((e) => ({ ...e, porDefecto: false })))?.id, "ventas");
    assert.equal(elEmbudoPorDefecto([]), null);
});

test("una conversación va al embudo de su asesor; sin asesor, o sin embudo, al por defecto", () => {
    assert.equal(elEmbudoDeLaConversacion("ana", ASIG, E), "ventas");
    assert.equal(elEmbudoDeLaConversacion("beto", ASIG, E), "soporte");
    assert.equal(elEmbudoDeLaConversacion(null, ASIG, E), "soporte");
    assert.equal(elEmbudoDeLaConversacion("dueno", ASIG, E), "soporte");
    // Un embudo asignado que ya no existe no deja la conversación fuera de todos.
    assert.equal(elEmbudoDeLaConversacion("fantasma", ASIG, E), "soporte");
    assert.equal(elEmbudoDeLaConversacion("ana", ASIG, []), null);
});

test("quién cae en cada embudo cuadra con de qué embudo es cada conversación", () => {
    const ventas = quienCaeEnElEmbudo("ventas", ASIG, E);
    assert.deepEqual(ventas, { asesores: ["ana"], incluyeSinEmbudo: false, ajenos: ["beto"] });
    const soporte = quienCaeEnElEmbudo("soporte", ASIG, E);
    assert.deepEqual(soporte, { asesores: ["beto"], incluyeSinEmbudo: true, ajenos: ["ana"] });
    // Encadenado: para cada asesor posible, el filtro del tablero y la regla
    // de la conversación dicen lo mismo. Si discreparan, una tarjeta saldría en
    // un tablero y al moverla diría «cambió de embudo».
    for (const asesor of ["ana", "beto", "fantasma", "dueno", null]) {
        const suyo = elEmbudoDeLaConversacion(asesor, ASIG, E);
        for (const e of E) {
            const q = quienCaeEnElEmbudo(e.id, ASIG, E);
            const cae = asesor && q.asesores.includes(asesor)
                ? true
                : q.incluyeSinEmbudo && !(asesor && q.ajenos.includes(asesor));
            assert.equal(cae, suyo === e.id, `asesor ${asesor} en ${e.id}`);
        }
    }
});

test("la etapa guardada vale si sigue en ESE embudo; si no, la primera", () => {
    const etapas = [
        { id: "b", embudoId: "ventas", nombre: "Dos", color: null, orden: 1 },
        { id: "a", embudoId: "ventas", nombre: "Uno", color: null, orden: 0 },
    ];
    assert.equal(laEtapaDeLaConversacion("b", etapas), "b");
    assert.equal(laEtapaDeLaConversacion("borrada", etapas), "a");
    assert.equal(laEtapaDeLaConversacion(null, etapas), "a");
    assert.equal(laEtapaDeLaConversacion("b", []), null);
});

test("un asesor abre SU embudo pida lo que pida; sin embudo, ninguno", () => {
    const asesor = { personaId: "ana", manda: false };
    assert.equal(elEmbudoQueSeAbre(asesor, "soporte", ASIG, E), "ventas");
    assert.equal(elEmbudoQueSeAbre({ personaId: "nadie", manda: false }, "ventas", ASIG, E), null);
    const dueno = { personaId: "dueno", manda: true };
    assert.equal(elEmbudoQueSeAbre(dueno, "ventas", ASIG, E), "ventas");
    assert.equal(elEmbudoQueSeAbre(dueno, "inventado", ASIG, E), "soporte");
});

test("quien manda mueve cualquier tarjeta; un asesor, solo las suyas", () => {
    assert.equal(puedeMoverLaTarjeta({ personaId: "d", manda: true }, "ana"), true);
    assert.equal(puedeMoverLaTarjeta({ personaId: "ana", manda: false }, "ana"), true);
    assert.equal(puedeMoverLaTarjeta({ personaId: "ana", manda: false }, "beto"), false);
    assert.equal(puedeMoverLaTarjeta({ personaId: "ana", manda: false }, null), false);
});

test("el color nace por posición y el elegido manda; lo que no es de la paleta no cuenta", () => {
    assert.equal(elColorDeLaEtapa(null, 0), COLORES_DE_ETAPA[0]);
    assert.equal(elColorDeLaEtapa(null, 7), COLORES_DE_ETAPA[1]);
    assert.equal(elColorDeLaEtapa(4, 0), COLORES_DE_ETAPA[4]);
    assert.equal(elColorDeLaEtapa(99, 2), COLORES_DE_ETAPA[2]);
    assert.equal(comoColor("3"), 3);
    assert.equal(comoColor(-1), null);
    assert.equal(comoColor(1.5), null);
    assert.equal(comoNombre("  Nueva   etapa "), "Nueva etapa");
    assert.equal(comoNombre("   "), null);
});

test("la lista de etapas se sanea: ids solo de este embudo, sin repetir, entre 1 y el tope", () => {
    const propias = new Set(["x", "y"]);
    const r = comoListaDeEtapas(
        [
            { id: "x", nombre: "Uno", color: 2 },
            { id: "x", nombre: "Copia", color: null },
            { id: "de-otro", nombre: "Ajena", color: 9 },
        ],
        propias,
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.etapas, [
        { id: "x", nombre: "Uno", color: 2 },
        { id: null, nombre: "Copia", color: null },
        { id: null, nombre: "Ajena", color: null },
    ]);
    assert.equal(comoListaDeEtapas([], propias).ok, false);
    assert.equal(comoListaDeEtapas([{ nombre: " " }], propias).ok, false);
    assert.equal(comoListaDeEtapas(Array.from({ length: 21 }, () => ({ nombre: "a" })), propias).ok, false);
});

test("lo personal: su dueña y quien manda lo ven; los demás asesores no", () => {
    const ana = { personaId: "ana", manda: false };
    const beto = { personaId: "beto", manda: false };
    const dueno = { personaId: "d", manda: true };
    assert.equal(laVe(null, beto), true);
    assert.equal(laVe("ana", ana), true);
    assert.equal(laVe("ana", beto), false);
    assert.equal(laVe("ana", dueno), true);
    assert.equal(laPuedeTocar(null, ana), false);
    assert.equal(laPuedeTocar(null, dueno), true);
    assert.equal(laPuedeTocar("ana", ana), true);
    assert.equal(laPuedeTocar("ana", beto), false);
    assert.equal(naceSuya(ana), true);
    assert.equal(naceSuya(dueno), false);
    assert.equal(elGrupo("ana", ana), "mias");
    assert.equal(elGrupo("ana", dueno), "de-asesores");
    assert.equal(elGrupo(null, ana), "de-la-cuenta");
});

test("dos asesores pueden tener la misma etiqueta: el slug lleva su persona", () => {
    assert.notEqual(slugPersonal("llamar-tarde", "Ana-1"), slugPersonal("llamar-tarde", "beto"));
    assert.match(slugPersonal("llamar-tarde", "Ana_1"), /^[a-z0-9-]+$/);
});

test("sin nada personal, un solo grupo sin título: la lista se ve como antes", () => {
    assert.deepEqual(enGrupos([{ id: 1, grupo: "de-la-cuenta" }, { id: 2 }]), [
        { grupo: "de-la-cuenta", titulo: null, filas: [{ id: 1, grupo: "de-la-cuenta" }, { id: 2 }] },
    ]);
    const g = enGrupos([{ id: 1 }, { id: 2, grupo: "mias" }]);
    assert.deepEqual(g.map((x) => [x.grupo, x.titulo]), [
        ["mias", "Mis etiquetas"],
        ["de-la-cuenta", "De la cuenta"],
    ]);
});


/*
 * La marca de «se cambió una etapa desde el chat».
 *
 * Son cuatro líneas y las dos que importan son las de los bordes: que se lea
 * UNA vez —dejándola puesta, el tablero volvería a pedir sus datos en cada
 * montaje por un cambio que ya recogió— y que un almacenamiento que LANZA no
 * tumbe nada, que es lo que pasa en una ventana privada.
 */
function conAlmacenamiento(sessionStorage) {
    const antes = globalThis.window;
    globalThis.window = { sessionStorage };
    return () => {
        if (antes === undefined) delete globalThis.window;
        else globalThis.window = antes;
    };
}

function almacenDeMentira() {
    const datos = new Map();
    return {
        datos,
        getItem: (k) => (datos.has(k) ? datos.get(k) : null),
        setItem: (k, v) => datos.set(k, String(v)),
        removeItem: (k) => datos.delete(k),
    };
}

test("el aviso al tablero se deja una vez y se lee una vez", () => {
    const almacen = almacenDeMentira();
    const devolver = conAlmacenamiento(almacen);
    try {
        // Sin nada que recoger no se pide nada: el caso normal del tablero.
        assert.equal(huboCambioDeEtapa(), false);

        anotarCambioDeEtapa();
        assert.equal(almacen.getItem(LLAVE_DEL_CAMBIO), "1");
        assert.equal(huboCambioDeEtapa(), true);
        // Se borra al leerla: la segunda vuelta ya no vuelve a pedir el tablero.
        assert.equal(huboCambioDeEtapa(), false);
        assert.equal(almacen.getItem(LLAVE_DEL_CAMBIO), null);
    } finally {
        devolver();
    }
});

test("un almacenamiento que lanza no tumba ni el chat ni el tablero", () => {
    const revienta = {
        getItem() { throw new Error("ventana privada"); },
        setItem() { throw new Error("ventana privada"); },
        removeItem() { throw new Error("ventana privada"); },
    };
    const devolver = conAlmacenamiento(revienta);
    try {
        assert.doesNotThrow(() => anotarCambioDeEtapa());
        // Se ve de MENOS, nunca una etapa que no es: sin marca el tablero se
        // refresca al navegar, como siempre.
        assert.equal(huboCambioDeEtapa(), false);
    } finally {
        devolver();
    }
});
