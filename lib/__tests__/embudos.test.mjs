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
    COLORES_RAPIDOS,
    COLOR_SIN_ELEGIR,
    ETAPAS_DE_SISTEMA,
    ETAPAS_INICIALES,
    HEX_DEL_COLOR_VIEJO,
    comoColorHex,
    comoEtapaDeSistema,
    comoListaDeEtapas,
    comoNombre,
    conLasDeSistemaEnSuSitio,
    elColorDeLaEtapa,
    elEmbudoDeLaConversacion,
    elEmbudoPorDefecto,
    elEmbudoQueSeAbre,
    laEtapaDeLaConversacion,
    laEtapaDeSistema,
    mismoColor,
    puedeMoverLaTarjeta,
    quienCaeEnElEmbudo,
    sePuedeBajarLaEtapa,
    sePuedeSubirLaEtapa,
} from "./.compilado/embudos/embudos.js";
import {
    DIAS_EN_LA_PAPELERA,
    diasQueQuedan,
    loQueDiceElVaciado,
    sePuedeVaciarLaColumna,
    yaLeTocaElBorradoEnFirme,
} from "./.compilado/embudos/papelera-de-embudos.js";
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

test("el color: el elegido manda, si no el de su posición, y una de sistema el suyo y solo el suyo", () => {
    assert.equal(elColorDeLaEtapa({ color: null, sistema: null }, 0), COLORES_RAPIDOS[0]);
    assert.equal(elColorDeLaEtapa({ color: null, sistema: null }, 7), COLORES_RAPIDOS[1]);
    assert.equal(elColorDeLaEtapa({ color: "#123456", sistema: null }, 0), "#123456");
    // Lo que no es un hex de seis dígitos no es un color: cae en el de su
    // posición, no se pinta un hueco transparente.
    assert.equal(elColorDeLaEtapa({ color: "rojo", sistema: null }, 2), COLORES_RAPIDOS[2]);
    // Una de sistema no cambia de color ni con un color guardado encima: es lo
    // que impide que una petición a mano deje «Ganado» en morado.
    assert.equal(elColorDeLaEtapa({ color: "#000000", sistema: "ganado" }, 3), ETAPAS_DE_SISTEMA.ganado.color);
    assert.equal(elColorDeLaEtapa({ color: "#000000", sistema: "perdido" }, 1), ETAPAS_DE_SISTEMA.perdido.color);
    assert.equal(elColorDeLaEtapa({ color: "#000000", sistema: "nuevo" }, 5), COLOR_SIN_ELEGIR);

    assert.equal(comoColorHex("#a855f7"), "#A855F7");
    assert.equal(comoColorHex("#ABC"), null);
    assert.equal(comoColorHex(3), null);
    assert.equal(comoEtapaDeSistema("perdido"), "perdido");
    assert.equal(comoEtapaDeSistema("otra"), null);
    assert.equal(comoNombre("  Nueva   etapa "), "Nueva etapa");
    assert.equal(comoNombre("   "), null);
});

test("el mismo color en mayúsculas y en minúsculas es el MISMO color", () => {
    // El selector nativo del navegador devuelve minúsculas y los seis rápidos
    // van en mayúsculas: comparando con `===`, elegir azul en la rueda no
    // marcaba el círculo azul de al lado.
    assert.equal(mismoColor("#3B82F6", "#3b82f6"), true);
    assert.equal(mismoColor(" #3B82F6 ", "#3B82F6"), true);
    assert.equal(mismoColor(null, null), false);
    assert.equal(mismoColor("#3B82F6", "#22C55E"), false);
});

test("un embudo nace con siete etapas y tres de sistema en su sitio", () => {
    assert.equal(ETAPAS_INICIALES.length, 7);
    assert.deepEqual(
        ETAPAS_INICIALES.map((e) => e.nombre),
        ["Nuevo", "Contactado", "Interesado", "Cotizado", "Negociación", "Ganado", "Perdido"],
    );
    assert.deepEqual(
        ETAPAS_INICIALES.map((e) => e.sistema),
        ["nuevo", null, null, null, null, "ganado", "perdido"],
    );
    // Los siete colores del encargo: gris, azul, morado, amarillo, naranja,
    // verde y rojo. Los cinco de en medio salen de la fila rápida de Etiquetas,
    // así que se comprueba contra ella y no contra un hex copiado a mano.
    assert.equal(ETAPAS_INICIALES[0].color, COLOR_SIN_ELEGIR);
    assert.equal(ETAPAS_INICIALES[1].color, COLORES_RAPIDOS[0]);
    assert.equal(ETAPAS_INICIALES[2].color, COLORES_RAPIDOS[4]);
    assert.equal(ETAPAS_INICIALES[3].color, COLORES_RAPIDOS[5]);
    assert.equal(ETAPAS_INICIALES[4].color, COLORES_RAPIDOS[2]);
    assert.equal(ETAPAS_INICIALES[5].color, COLORES_RAPIDOS[1]);
    assert.equal(ETAPAS_INICIALES[6].color, ETAPAS_DE_SISTEMA.perdido.color);
    // Y los siete son distintos: dos columnas del mismo color no se distinguen.
    assert.equal(new Set(ETAPAS_INICIALES.map((e) => e.color)).size, 7);
});

test("Nuevo va primera y Ganado y Perdido últimas, en ese orden, ordénese como se pida", () => {
    const desordenadas = [
        { nombre: "Perdido", sistema: "perdido" },
        { nombre: "Cotizado", sistema: null },
        { nombre: "Ganado", sistema: "ganado" },
        { nombre: "Nuevo", sistema: "nuevo" },
        { nombre: "Contactado", sistema: null },
    ];
    assert.deepEqual(
        conLasDeSistemaEnSuSitio(desordenadas).map((e) => e.nombre),
        ["Nuevo", "Cotizado", "Contactado", "Ganado", "Perdido"],
    );
    // Un embudo viejo, sin ninguna de sistema, conserva su orden tal cual.
    const viejas = [{ nombre: "A", sistema: null }, { nombre: "B", sistema: null }];
    assert.deepEqual(conLasDeSistemaEnSuSitio(viejas).map((e) => e.nombre), ["A", "B"]);
});

test("las flechas no dejan mover a donde el servidor lo desharía", () => {
    const l = [
        { sistema: "nuevo" },
        { sistema: null },
        { sistema: null },
        { sistema: "ganado" },
        { sistema: "perdido" },
    ];
    // Una de sistema no se mueve nunca.
    assert.equal(sePuedeSubirLaEtapa(l, 0), false);
    assert.equal(sePuedeBajarLaEtapa(l, 0), false);
    assert.equal(sePuedeSubirLaEtapa(l, 3), false);
    assert.equal(sePuedeBajarLaEtapa(l, 4), false);
    // Y una del cliente no salta por encima de Nuevo ni por debajo de Ganado.
    assert.equal(sePuedeSubirLaEtapa(l, 1), false);
    assert.equal(sePuedeBajarLaEtapa(l, 1), true);
    assert.equal(sePuedeSubirLaEtapa(l, 2), true);
    assert.equal(sePuedeBajarLaEtapa(l, 2), false);
});

test("lo que las flechas dejan mover, el servidor no lo tiene que corregir", () => {
    // Las dos reglas encadenadas: si `conLasDeSistemaEnSuSitio` cambiara el
    // orden de un movimiento que las flechas permiten, ese movimiento se
    // desharía al guardar y se leería como que el orden no se guarda.
    const base = [
        { nombre: "Nuevo", sistema: "nuevo" },
        { nombre: "A", sistema: null },
        { nombre: "B", sistema: null },
        { nombre: "C", sistema: null },
        { nombre: "Ganado", sistema: "ganado" },
        { nombre: "Perdido", sistema: "perdido" },
    ];
    for (let i = 0; i < base.length; i += 1) {
        for (const hacia of [-1, 1]) {
            const sePuede = hacia === -1 ? sePuedeSubirLaEtapa(base, i) : sePuedeBajarLaEtapa(base, i);
            if (!sePuede) continue;
            const movido = [...base];
            [movido[i], movido[i + hacia]] = [movido[i + hacia], movido[i]];
            assert.deepEqual(
                conLasDeSistemaEnSuSitio(movido).map((e) => e.nombre),
                movido.map((e) => e.nombre),
                `mover ${base[i].nombre} ${hacia === -1 ? "arriba" : "abajo"} lo deshace el servidor`,
            );
        }
    }
});

test("la lista de etapas se sanea: ids solo de este embudo, sin repetir, entre 1 y el tope", () => {
    const propias = { x: null, y: null };
    const r = comoListaDeEtapas(
        [
            { id: "x", nombre: "Uno", color: "#A855F7" },
            { id: "x", nombre: "Copia", color: null },
            { id: "de-otro", nombre: "Ajena", color: "nada" },
        ],
        propias,
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.etapas, [
        { id: "x", nombre: "Uno", color: "#A855F7", sistema: null },
        { id: null, nombre: "Copia", color: null, sistema: null },
        { id: null, nombre: "Ajena", color: null, sistema: null },
    ]);
    assert.equal(comoListaDeEtapas([], propias).ok, false);
    assert.equal(comoListaDeEtapas([{ nombre: " " }], propias).ok, false);
    assert.equal(comoListaDeEtapas(Array.from({ length: 21 }, () => ({ nombre: "a" })), propias).ok, false);
});

test("la marca de sistema sale de la BASE, no de la lista que llega", () => {
    const deLaBase = { n: "nuevo", medio: null, g: "ganado", p: "perdido" };
    const r = comoListaDeEtapas(
        [
            // Con la marca inventada por el navegador: se ignora.
            { id: "medio", nombre: "Cotizado", color: "#F59E0B", sistema: "perdido" },
            { id: "n", nombre: "Entrantes", color: "#000000", sistema: null },
            { id: "g", nombre: "Ganado", color: "#000000" },
            { id: "p", nombre: "Perdido", color: "#000000" },
        ],
        deLaBase,
    );
    assert.equal(r.ok, true);
    // Nuevo delante, las dos últimas al final: el orden lo pone el servidor.
    assert.deepEqual(
        r.etapas.map((e) => [e.nombre, e.sistema]),
        [
            ["Entrantes", "nuevo"],
            ["Cotizado", null],
            ["Ganado", "ganado"],
            ["Perdido", "perdido"],
        ],
    );
    // Su nombre SÍ se cambió («Entrantes»), y su color NO: el de una de sistema
    // se fuerza al suyo y se guarda en nulo.
    assert.equal(r.etapas[0].color, null);
    assert.equal(r.etapas[2].color, null);
    // Y la del cliente conserva el suyo.
    assert.equal(r.etapas[1].color, "#F59E0B");
});

test("una etapa de sistema que no viene en la lista se rechaza, con su nombre", () => {
    const deLaBase = { n: "nuevo", g: "ganado", p: "perdido" };
    const r = comoListaDeEtapas([{ id: "n", nombre: "Nuevo" }, { id: "g", nombre: "Ganado" }], deLaBase);
    assert.equal(r.ok, false);
    assert.match(r.motivo, /Perdido/);
    // Y un embudo viejo, sin ninguna de sistema, sí puede quedarse con una sola.
    assert.equal(comoListaDeEtapas([{ id: "a", nombre: "Una" }], { a: null, b: null }).ok, true);
});

test("laEtapaDeSistema encuentra la columna de Perdido, y en un embudo viejo no hay", () => {
    const etapas = [
        { id: "1", sistema: "nuevo" },
        { id: "2", sistema: null },
        { id: "3", sistema: "perdido" },
    ];
    assert.equal(laEtapaDeSistema(etapas, "perdido")?.id, "3");
    assert.equal(laEtapaDeSistema(etapas, "ganado"), null);
    assert.equal(laEtapaDeSistema([{ id: "a", sistema: null }], "perdido"), null);
});

test("solo se vacía la columna de Perdido, y se decide por su MARCA", () => {
    assert.equal(sePuedeVaciarLaColumna({ sistema: "perdido" }), true);
    assert.equal(sePuedeVaciarLaColumna({ sistema: "ganado" }), false);
    // Por el NOMBRE no: renombrar una columna a «Perdido» no le da el botón, y
    // renombrar la de verdad no se lo quita.
    assert.equal(sePuedeVaciarLaColumna({ nombre: "Perdido", sistema: null }), false);
    assert.equal(sePuedeVaciarLaColumna({ nombre: "Descartados", sistema: "perdido" }), true);
    assert.equal(sePuedeVaciarLaColumna(null), false);
    assert.equal(sePuedeVaciarLaColumna(undefined), false);
});

test("los treinta días se cuentan por días naturales y no bajan de cero", () => {
    const enMedioDeLaNoche = new Date(2026, 4, 10, 23, 30);
    // Dos horas después ya es otro día natural, así que queda un día menos: en
    // crudo, restar y dividir por 86.400.000 daría cero.
    assert.equal(diasQueQuedan(enMedioDeLaNoche, new Date(2026, 4, 11, 1, 0)), DIAS_EN_LA_PAPELERA - 1);
    assert.equal(diasQueQuedan(enMedioDeLaNoche, enMedioDeLaNoche), DIAS_EN_LA_PAPELERA);
    assert.equal(diasQueQuedan(new Date(2026, 4, 10), new Date(2026, 6, 10)), 0);
    assert.equal(yaLeTocaElBorradoEnFirme(new Date(2026, 4, 10), new Date(2026, 4, 11)), false);
    assert.equal(yaLeTocaElBorradoEnFirme(new Date(2026, 4, 10), new Date(2026, 6, 10)), true);
});

test("el diálogo de vaciar dice el número y que se puede deshacer", () => {
    assert.match(loQueDiceElVaciado(0), /no hay conversaciones/i);
    assert.match(loQueDiceElVaciado(1), /1 conversación/);
    assert.match(loQueDiceElVaciado(12), /12 conversaciones/);
    assert.match(loQueDiceElVaciado(12), new RegExp(`${DIAS_EN_LA_PAPELERA} días`));
});

test("el respaldo del color viejo tiene un hex por cada índice de la paleta que había", () => {
    assert.equal(HEX_DEL_COLOR_VIEJO.length, 6);
    for (const hex of HEX_DEL_COLOR_VIEJO) assert.match(hex, /^#[0-9A-F]{6}$/);
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
