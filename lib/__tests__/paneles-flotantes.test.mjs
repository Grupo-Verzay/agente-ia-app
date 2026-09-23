/**
 * Dónde nace cada panel flotante, y las tres cosas que van con ello.
 *
 * Es la mitad que **no necesita navegador**: la decisión es pura y vive en
 * `lib/paneles-flotantes.ts`, `lib/campana.ts` y `lib/barrita-de-formato.ts`.
 * La otra mitad —que un panel de verdad, pintado por Radix sobre el CSS del
 * build, cae dentro de su contenedor— es `paneles-flotantes-dom.test.mjs`.
 *
 * # Los dos modos
 *
 * `MODO=roto` **no escribe el «antes» a mano**: lo saca de git con
 * `git show` y afirma el desorden que había —cinco alineaciones distintas para
 * la misma pregunta, un `side="top"`, y ni una sola medida del contenedor—.
 * Copiado aquí se estaría probando lo que alguien recuerda de los componentes
 * viejos.
 *
 * Se levanta con `scripts/banco-paneles-flotantes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    HUECO_DEL_DISPARADOR,
    MARGEN_DE_LA_VENTANA,
    PANEL_QUE_SE_DESPLAZA,
    alturaDisponible,
    bajoLaBarraDeArriba,
    cabecera,
    columnaAncha,
    columnaDerecha,
    comoSiempre,
    ANCHO_DE_LOS_FILTROS,
    ANCHO_MINIMO_DE_LA_CABECERA,
} from "./.compilado/paneles-flotantes.js";
import { CHIPS_DE_LA_CAMPANA, lasQueSeMarcan, sePuedeMarcar } from "./.compilado/campana.js";
import { MARCAS_DE_LA_BARRITA, dondeVaLaBarrita } from "./.compilado/barrita-de-formato.js";
import { comoListaDeIdsNumericos, TOPE_DE_IDS } from "./.compilado/borrado-en-bloque.js";

const ROTO = process.env.MODO === "roto";

/**
 * De dónde sale el «antes». Lo dice `el-antes-de-los-paneles.json`, y en una
 * frase: **no puede ser `origin/main`**, porque la unificación ya está
 * fusionada ahí y el modo roto se pondría en verde sin ejercer nada.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const EL_ANTES = JSON.parse(
    fs.readFileSync(join(AQUI, "el-antes-de-los-paneles.json"), "utf8"),
).ref;

/**
 * Dónde cae de verdad el filo izquierdo de un panel, aplicando el signo que
 * Floating UI le da a `alignOffset` según la alineación.
 *
 * Esta cuenta es la del middleware `offset` de `@floating-ui/core`:
 * `crossAxis = alignment === 'end' ? alignmentAxis * -1 : alignmentAxis`. Se
 * repite aquí a propósito, porque es justo el signo que escrito al revés no da
 * ningún error: deja el panel al otro lado y del doble de lejos.
 */
function filos(g, disparador, anchoDelPanel) {
    // Con `align="end"` la caja base pone el filo DERECHO del panel en el del
    // disparador, y encima se le suma `crossAxis`, que es `alignOffset * -1`.
    const crossAxis = g.align === "end" ? g.alignOffset * -1 : g.alignOffset;
    const left = (g.align === "start" ? disparador.left : disparador.right - anchoDelPanel) + crossAxis;
    return { left: Math.round(left), right: Math.round(left + anchoDelPanel) };
}

/**
 * Un panel de la cabecera CUELGA DE SU BOTÓN y SIEMPRE por el filo derecho:
 * filo derecho con filo derecho, creciendo hacia la izquierda. La única vez que
 * se separa del botón es cuando a su izquierda no cabe —un icono pegado al
 * borde izquierdo de la PANTALLA— y entonces se corre a la derecha lo justo
 * para no salirse, con su borde izquierdo en el margen de la ventana.
 */
function colgado(g, d, left, right, ventana, caja) {
    assert.equal(g.align, "end", `a ${ventana} todo menú de la conversación crece hacia la izquierda`);
    if (g.alignOffset === 0) {
        assert.equal(right, Math.round(d.right), `a ${ventana} tiene que colgar del filo derecho de SU botón`);
    } else {
        assert.ok(g.alignOffset < 0, "corrido a la DERECHA, nunca a la izquierda");
        // Lo que acota es la PANTALLA, no la cabecera: a su izquierda está la
        // columna de chats y el menú puede pasar por encima de ella.
        assert.equal(left, MARGEN_DE_LA_VENTANA, "se corre lo justo para no salirse de la pantalla");
    }
}

/** Las cuatro anchuras del encargo, con el ancho que tiene la columna en cada una. */
const ANCHURAS = [
    { ventana: 1440, columna: 384 },
    { ventana: 1280, columna: 384 },
    { ventana: 1024, columna: 352 },
    { ventana: 390, columna: 390 },
];

/** El carril de iconos de la izquierda: 48px de escritorio, 0 en el móvil. */
const CARRIL = (ventana) => (ventana === 390 ? 0 : 48);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Los paneles de la columna que ocupan su ancho entero
// ─────────────────────────────────────────────────────────────────────────────

test("columnaAncha: un ancho COMÚN, y empieza en el filo, en las cuatro anchuras", () => {
    for (const { ventana, columna: ancho } of ANCHURAS) {
        const izq = CARRIL(ventana);
        const columna = { left: izq, right: izq + ancho, bottom: 200 };
        // Un disparador cualquiera de la fila de arriba, metido hacia dentro.
        const disparador = { left: izq + 12, right: izq + 44, bottom: 96 };
        const pastillas = 132;

        const g = columnaAncha(columna, disparador, pastillas, "menu");
        const anchoDelPanel = Number(g.estilo.width.replace("px", ""));
        const { left, right } = filos(g, disparador, anchoDelPanel);

        assert.equal(
            anchoDelPanel,
            ANCHO_DE_LOS_FILTROS,
            `a ${ventana} el panel tiene que medir el ancho común, no la columna (${ancho})`,
        );
        assert.equal(left, columna.left, `a ${ventana} tiene que empezar en el filo izquierdo`);
        assert.ok(right <= columna.right, `a ${ventana} se pasa del filo derecho (${right} > ${columna.right})`);
    }
});

test("columnaAncha: los CINCO miden lo mismo, que es de lo que iba el encargo", () => {
    // Los cinco controles de la columna, cada uno en su sitio: tres en la fila
    // del buscador, el de etiquetas más a la derecha y el «⋯» DENTRO de la
    // propia fila de pastillas. Antes cada panel medía su contenedor y todos
    // salían del ancho de la columna; lo que se pedía es que no SALTEN de
    // tamaño al abrir uno u otro.
    const columna = { left: 48, right: 432, bottom: 200 };
    const pastillas = 132;
    const disparadores = [
        { left: 60, right: 92, bottom: 96 },
        { left: 96, right: 128, bottom: 96 },
        { left: 132, right: 164, bottom: 96 },
        { left: 380, right: 412, bottom: 96 },
        { left: 396, right: 428, bottom: 132 },
    ];

    const anchos = new Set(
        disparadores.map((d) => columnaAncha(columna, d, pastillas, "menu").estilo.width),
    );
    assert.equal(anchos.size, 1, `los cinco tienen que medir lo mismo; salieron ${[...anchos]}`);
    assert.equal([...anchos][0], `${ANCHO_DE_LOS_FILTROS}px`);
});

test("columnaAncha: una columna más estrecha que el ancho común manda ELLA", () => {
    // Es lo que impide que el panel se monte sobre la conversación. Se acota
    // contra la columna MEDIDA, no contra la variable: en un móvil la columna
    // ocupa la pantalla entera y en escritorio tiene tres anchos.
    const estrecha = { left: 0, right: 240, bottom: 200 };
    const g = columnaAncha(estrecha, { left: 12, right: 44, bottom: 96 }, 132, "menu");
    const ancho = Number(g.estilo.width.replace("px", ""));

    assert.equal(ancho, 240 - MARGEN_DE_LA_VENTANA);
    assert.ok(ancho < ANCHO_DE_LOS_FILTROS, "en una columna estrecha no puede ganar el ancho común");
    const { right } = filos(g, { left: 0, right: 32, bottom: 96 }, ancho);
    assert.ok(right <= estrecha.right, "y sigue sin pasarse del filo");
});

test("columnaAncha: nace bajo las PASTILLAS, y los cuatro a la misma altura", () => {
    const columna = { left: 48, right: 432, bottom: 200 };
    const pastillas = 132;

    // Los cuatro controles no están a la misma altura: tres viven en la fila
    // del buscador y el «⋯» DENTRO de la propia fila de pastillas.
    const disparadores = {
        canales: { left: 60, right: 92, bottom: 96 },
        asesor: { left: 96, right: 128, bottom: 96 },
        etiquetas: { left: 132, right: 164, bottom: 96 },
        // El «⋯»: su borde de abajo coincide con el de las pastillas.
        mas: { left: 396, right: 424, bottom: 132 },
    };

    const nacen = Object.entries(disparadores).map(([nombre, d]) => {
        const g = columnaAncha(columna, d, pastillas, "menu");
        return { nombre, en: d.bottom + g.sideOffset };
    });

    const alturas = new Set(nacen.map((n) => n.en));
    assert.equal(
        alturas.size,
        1,
        `los cuatro tienen que nacer a la misma altura; salieron ${JSON.stringify(nacen)}`,
    );
    assert.equal(
        [...alturas][0],
        pastillas + HUECO_DEL_DISPARADOR,
        "y esa altura son las pastillas más el hueco de siempre",
    );
});

test("columnaAncha NO voltea: volteado se pondría encima de las pastillas", () => {
    const g = columnaAncha({ left: 48, right: 432, bottom: 200 }, { left: 60, right: 92, bottom: 96 }, 132, "menu");
    assert.equal(g.avoidCollisions, false);
    assert.equal(g.side, "bottom");
});

test("columnaAncha: un disparador POR DEBAJO de las pastillas no sube el panel", () => {
    // El `sideOffset` es una distancia hacia abajo: si saliera negativo, Radix
    // subiría el panel sobre su propio disparador.
    const g = columnaAncha(
        { left: 48, right: 432, bottom: 600 },
        { left: 60, right: 92, bottom: 300 },
        132,
        "menu",
    );
    assert.equal(g.sideOffset, HUECO_DEL_DISPARADOR);
    assert.ok(g.sideOffset >= 0, "un sideOffset negativo sube el panel sobre su disparador");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Los paneles de UNA fila, pegados al filo derecho
// ─────────────────────────────────────────────────────────────────────────────

test("columnaDerecha: el panel queda dentro de la columna en las cuatro anchuras", () => {
    for (const { ventana, columna: ancho } of ANCHURAS) {
        const izq = CARRIL(ventana);
        const columna = { left: izq, right: izq + ancho, bottom: 900 };
        // Los tres controles de una fila, a distintas distancias del filo.
        for (const d of [
            { left: izq + ancho - 40, right: izq + ancho - 8, bottom: 300 },
            { left: izq + 180, right: izq + 212, bottom: 300 },
            { left: izq + 90, right: izq + 122, bottom: 300 },
        ]) {
            const g = columnaDerecha(columna, d, "menu");
            const tope = Number(g.estilo.maxWidth.replace("px", ""));
            const { left, right } = filos(g, d, tope);

            assert.equal(right, columna.right, `a ${ventana} tiene que pegarse al filo derecho`);
            assert.ok(
                left >= columna.left,
                `a ${ventana} el panel se sale por la izquierda (${left} < ${columna.left})`,
            );
            assert.ok(tope <= ancho - MARGEN_DE_LA_VENTANA, "el ancho se acota al de la columna");
        }
    }
});

test("columnaDerecha SÍ voltea: la fila puede estar abajo del todo", () => {
    const g = columnaDerecha({ left: 48, right: 432, bottom: 900 }, { left: 380, right: 412, bottom: 860 }, "menu");
    assert.equal(g.avoidCollisions, true, "sin esto un panel de la última fila se sale por abajo");
    assert.equal(g.sideOffset, HUECO_DEL_DISPARADOR, "nace bajo SU control, no bajo las pastillas");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La cabecera de la conversación
// ─────────────────────────────────────────────────────────────────────────────

test("cabecera: los seis nacen a la MISMA altura y cuelgan de SU botón", () => {
    for (const { ventana, columna: ancho } of ANCHURAS) {
        // En el móvil la conversación sustituye a la lista: su cabecera es la
        // pantalla entera.
        const izq = ventana === 390 ? 0 : CARRIL(ventana) + ancho;
        const caja = { left: izq, right: ventana, bottom: 148 };
        // Seis iconos repartidos por la fila de arriba, y dos botones en la de
        // abajo (Macros y Acciones), que están más cerca del borde inferior.
        const disparadores = [
            { left: izq + 12, right: izq + 44, bottom: 96 },
            { left: izq + 48, right: izq + 80, bottom: 96 },
            { left: ventana - 120, right: ventana - 88, bottom: 96 },
            { left: ventana - 84, right: ventana - 52, bottom: 96 },
            { left: izq + 12, right: izq + 96, bottom: 140 },
            { left: izq + 104, right: izq + 190, bottom: 140 },
        ];

        const nacen = new Set();
        for (const d of disparadores) {
            const g = cabecera(caja, d, "menu", undefined, ventana);
            nacen.add(d.bottom + g.sideOffset);

            const tope = Number(g.estilo.maxWidth.replace("px", ""));
            const { left, right } = filos(g, d, tope);
            colgado(g, d, left, right, ventana, caja);
            assert.ok(left >= MARGEN_DE_LA_VENTANA, `a ${ventana} el panel se sale por la izquierda (${left})`);
            assert.ok(right <= caja.right, `a ${ventana} el panel se sale por la derecha (${right} > ${caja.right})`);
        }

        assert.equal(
            nacen.size,
            1,
            `a ${ventana} los seis tienen que nacer a la misma altura; salieron ${[...nacen]}`,
        );
        assert.equal([...nacen][0], caja.bottom, "y esa altura es el borde de abajo de la cabecera");
    }
});

test("cabecera: con el filo de Macros, miden LO MISMO si caben, y cuelgan de su botón", () => {
    for (const { ventana, columna: ancho } of ANCHURAS) {
        // En un móvil la conversación NO va al lado de la lista: la sustituye,
        // así que su cabecera es la pantalla entera. Medirla como en
        // escritorio la dejaría en cero y el caso no ejercería nada.
        const izq = ventana === 390 ? 0 : CARRIL(ventana) + ancho;
        const caja = { left: izq, right: ventana, bottom: 148 };
        // El borde izquierdo de la fila de Macros y Acciones. En escritorio
        // queda a unos 200 px del filo; en el móvil la pareja se va al borde.
        const macros = ventana === 390 ? ventana - 198 : ventana - 206;
        const disparadores = [
            { left: izq + 12, right: izq + 44, bottom: 96 },
            { left: ventana - 120, right: ventana - 88, bottom: 96 },
            { left: macros, right: macros + 86, bottom: 140 },
            { left: ventana - 92, right: ventana - 8, bottom: 140 },
        ];

        const anchos = new Set();
        for (const d of disparadores) {
            const g = cabecera(caja, d, "menu", macros, ventana);

            const mide = Number(g.estilo.width.replace("px", ""));
            const { left, right } = filos(g, d, mide);
            colgado(g, d, left, right, ventana, caja);
            assert.ok(left >= MARGEN_DE_LA_VENTANA, `a ${ventana} se sale de la pantalla (${left})`);
            assert.ok(right <= caja.right, `a ${ventana} se sale por la derecha (${right} > ${caja.right})`);
            // Si hay sitio hacia donde crece, mide lo de siempre; si no, manda
            // el hueco.
            anchos.add(g.estilo.width);
        }

        assert.equal(anchos.size, 1, `a ${ventana} los que caben tienen que medir lo mismo; salieron ${[...anchos]}`);
        assert.equal(
            [...anchos][0],
            `${caja.right - macros}px`,
            `a ${ventana} el ancho es el que va del filo de Macros al filo derecho`,
        );
    }
});

test("cabecera: el ancho no baja del mínimo ni se pasa de la conversación", () => {
    const caja = { left: 432, right: 1440, bottom: 148 };
    const disparador = { left: 1340, right: 1424, bottom: 140 };

    // Una fila de Macros pegadísima al filo: el ancho saldría ridículo.
    const apretado = cabecera(caja, disparador, "menu", caja.right - 20);
    assert.equal(apretado.estilo.width, `${ANCHO_MINIMO_DE_LA_CABECERA}px`);

    // Y una conversación estrechísima: el ancho NO se encoge a la cabecera.
    // Lo que acota es la VENTANA: a la izquierda de la conversación está la
    // columna de chats, que es pantalla, y el menú puede pasar por encima.
    const angosta = { left: 1300, right: 1440, bottom: 148 };
    const g = cabecera(angosta, disparador, "menu", angosta.right - 20, 1440);
    assert.equal(g.estilo.width, `${ANCHO_MINIMO_DE_LA_CABECERA}px`);
    assert.equal(g.alignOffset, 0, "a su izquierda hay pantalla de sobra: cuelga exacto de su botón");
    const { right } = filos(g, disparador, ANCHO_MINIMO_DE_LA_CABECERA);
    assert.equal(right, disparador.right);
});

/**
 * El fallo de la captura: con la ficha de contacto o un panel lateral abierto
 * la conversación se queda en 260 px (1024 de ventana), y la cita, Registros y
 * Macros se corrían 50-100 px a la derecha para no pasar del borde de la
 * CABECERA. Medido sobre la página servida: cita +103, Macros +93, Registros +47.
 * Con cualquier otra cosa a su izquierda, el menú tiene que colgar de su botón.
 */
test("cabecera estrecha (panel lateral abierto): cuelgan de SU botón, no del borde de la cabecera", () => {
    const caja = { left: 406, right: 666, bottom: 140 }; // 1024 con la ficha abierta
    const macros = 447;
    const botones = {
        Macros: { left: 447, right: 540, bottom: 132 },
        Cita: { left: 502, right: 530, bottom: 96 },
        Registros: { left: 558, right: 586, bottom: 96 },
        Etiquetas: { left: 604, right: 638, bottom: 96 },
        Acciones: { left: 544, right: 650, bottom: 132 },
    };
    for (const [nombre, d] of Object.entries(botones)) {
        const g = cabecera(caja, d, nombre === "Cita" || nombre === "Registros" ? "popover" : "menu", macros, 1024);
        const ancho = Number(g.estilo.width.replace("px", ""));
        assert.equal(g.align, "end", `${nombre}: siempre por el filo derecho`);
        assert.equal(g.alignOffset, 0, `${nombre}: hay pantalla a la izquierda, no se corre`);
        const { right, left } = filos(g, d, ancho);
        assert.equal(right, d.right, `${nombre}: su filo derecho es el del botón`);
        assert.ok(left >= MARGEN_DE_LA_VENTANA, `${nombre}: no se sale por la izquierda (${left})`);
    }
});

test("cabecera: si a la izquierda no cabe, se corre lo JUSTO para no salirse de la pantalla", () => {
    // Un móvil de 390: la cabecera es la pantalla y el botón está pegado a la
    // izquierda. Se corre a la derecha hasta el margen, y nunca cambia de lado.
    const caja = { left: 0, right: 390, bottom: 140 };
    const d = { left: 40, right: 68, bottom: 120 };
    const g = cabecera(caja, d, "popover", 200, 390);
    const ancho = Number(g.estilo.width.replace("px", ""));
    assert.equal(g.align, "end");
    assert.ok(g.alignOffset < 0, "se corre hacia la derecha");
    const { left, right } = filos(g, d, ancho);
    assert.equal(left, MARGEN_DE_LA_VENTANA, "su borde izquierdo queda en el margen, ni un píxel más");
    assert.ok(right > d.right && right <= 390 - MARGEN_DE_LA_VENTANA, `no se sale por la derecha (${right})`);

    // Y un ancho pedido mayor que la ventana se acota a la ventana.
    const enorme = cabecera(caja, d, "popover", 1, 390);
    const w = Number(enorme.estilo.width.replace("px", ""));
    assert.equal(w, 390 - 2 * MARGEN_DE_LA_VENTANA);
    const f = filos(enorme, d, w);
    assert.ok(f.left >= MARGEN_DE_LA_VENTANA && f.right <= 390 - MARGEN_DE_LA_VENTANA);
});

test("cabecera SIN el filo de Macros no inventa ancho: fuera de Chats no cambia nada", () => {
    // El combobox de etiquetas lo pintan además el CRM y `/sessions`, y el de
    // asesores otras pantallas. Ahí no hay ninguna fila de Macros que medir, y
    // ponerles un ancho que nadie pidió sería peor que no unificar: cada uno
    // conserva su `w-*` de siempre.
    const g = cabecera({ left: 432, right: 1440, bottom: 148 }, { left: 1300, right: 1332, bottom: 96 }, "menu");
    assert.equal(g.estilo.width, undefined, "sin el filo de Macros no se escribe ningún ancho");
    assert.ok(g.estilo.maxWidth, "pero el tope sigue, que es lo que impide que se salga");
});

test("cabecera: un Macros ESCONDIDO (el de la fila del móvil) no es una medida", () => {
    // `ChatHeader` pinta Macros dos veces; el del móvil va `md:hidden` y mide
    // 0×0 en el origen. Con esa medida el ancho salía de la cabecera entera y
    // el menú de Acciones cruzaba la conversación — la captura del 22-09.
    const caja = { left: 480, right: 1340, bottom: 180 };
    const acciones = { left: 1236, right: 1340, bottom: 172 };
    const g = cabecera(caja, acciones, "menu", 0);
    assert.equal(g.estilo.width, undefined, "un `desde` fuera de la cabecera se ignora");
    const conMacros = cabecera(caja, acciones, "menu", 1140);
    assert.equal(conMacros.estilo.width, "200px", "con el Macros visible, la fila de Macros y Acciones");
});

test("cabecera: crece hacia la izquierda ESTÉ donde esté su botón — la cita agendada", () => {
    // La captura del 22-09: con la ficha de contacto abierta la cabecera se
    // estrecha y el icono de la cita cae en su mitad IZQUIERDA. La regla vieja
    // elegía el lado por esa mitad y el panel crecía hacia la derecha, desde
    // el centro de la conversación. Ahora cuelga de su filo derecho siempre.
    const caja = { left: 480, right: 1340, bottom: 180 };
    const cita = { left: 820, right: 848, bottom: 130 };
    for (const d of [{ left: 1140, right: 1165, bottom: 130 }, cita]) {
        const g = cabecera(caja, d, "popover", 1140);
        assert.equal(g.align, "end");
        assert.equal(g.alignOffset, 0, "hay sitio a la izquierda: cuelga exacto de su botón");
        const { right } = filos(g, d, Number(g.estilo.width.replace("px", "")));
        assert.equal(right, d.right, "su filo derecho es el del botón");
    }
});

test("colgadoDelIcono (el menú de llamar) también crece hacia la izquierda, y no se sale", async () => {
    const { colgadoDelIcono, ANCHO_DEL_MENU_CORTO } = await import("./.compilado/paneles-flotantes.js");
    const caja = { left: 432, right: 1440, bottom: 148 };
    const d = { left: 900, right: 928, bottom: 96 };
    const g = colgadoDelIcono(caja, d, "menu");
    assert.equal(g.align, "end");
    assert.equal(g.alignOffset, 0);
    assert.equal(g.estilo.width, undefined, "mide lo que ocupan sus dos entradas");
    // En el móvil el icono va pegado al borde izquierdo de la fila.
    const movil = { left: 0, right: 390, bottom: 140 };
    const pegado = { left: 8, right: 36, bottom: 120 };
    const m = colgadoDelIcono(movil, pegado, "menu");
    const { left } = filos(m, pegado, ANCHO_DEL_MENU_CORTO);
    assert.equal(left, MARGEN_DE_LA_VENTANA, "corrido lo justo: su borde izquierdo en el margen");
});

test("cabecera NO voltea: volteado se comería la fila de Macros y Acciones", () => {
    const g = cabecera({ left: 432, right: 1440, bottom: 148 }, { left: 1300, right: 1332, bottom: 96 }, "popover");
    assert.equal(g.avoidCollisions, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La campana
// ─────────────────────────────────────────────────────────────────────────────

test("campana: nace bajo la BARRA, no bajo el botón, y cabe en la ventana", () => {
    for (const { ventana } of ANCHURAS) {
        const barra = { left: 0, right: ventana, bottom: 64 };
        // El botón mide 36 y vive centrado en una barra de 64.
        const boton = { left: ventana - 52, right: ventana - 16, bottom: 50 };

        const g = bajoLaBarraDeArriba(barra, boton, ventana, "menu");
        const nace = boton.bottom + g.sideOffset;
        assert.equal(
            nace,
            barra.bottom + HUECO_DEL_DISPARADOR,
            `a ${ventana} el panel se monta sobre la cabecera`,
        );

        const tope = Number(g.estilo.maxWidth.replace("px", ""));
        const { left, right } = filos(g, boton, tope);
        assert.ok(left >= 0, `a ${ventana} el panel se sale por la izquierda (${left})`);
        assert.ok(right <= ventana, `a ${ventana} el panel se corta por la derecha (${right} > ${ventana})`);
    }
});

test("campana: un botón pegado al borde derecho tampoco corta el panel", () => {
    const ventana = 390;
    // El caso extremo: sin `pr`, el botón termina EN el borde.
    const g = bajoLaBarraDeArriba({ left: 0, right: ventana, bottom: 64 }, { left: ventana - 36, right: ventana, bottom: 50 }, ventana, "menu");
    const tope = Number(g.estilo.maxWidth.replace("px", ""));
    const { right } = filos(g, { left: ventana - 36, right: ventana }, tope);
    assert.ok(right <= ventana - MARGEN_DE_LA_VENTANA, `se corta por la derecha: ${right}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Lo común a todos: el alto se desplaza por dentro
// ─────────────────────────────────────────────────────────────────────────────

test("los cuatro acotan el alto con la variable de Radix, no con `vh` a secas", () => {
    const columna = { left: 48, right: 432, bottom: 900 };
    const d = { left: 60, right: 92, bottom: 96 };
    const todos = [
        ["columnaAncha", columnaAncha(columna, d, 132, "menu"), "dropdown-menu"],
        ["columnaDerecha", columnaDerecha(columna, d, "popover"), "popover"],
        ["cabecera", cabecera({ left: 432, right: 1440, bottom: 148 }, d, "popover"), "popover"],
        ["campana", bajoLaBarraDeArriba({ left: 0, right: 1440, bottom: 64 }, d, 1440, "menu"), "dropdown-menu"],
    ];
    for (const [nombre, g, primitiva] of todos) {
        assert.ok(
            g.estilo.maxHeight.includes(`--radix-${primitiva}-content-available-height`),
            `${nombre}: el tope tiene que salir del hueco de verdad, no de \`vh\``,
        );
        assert.equal(g.collisionPadding, MARGEN_DE_LA_VENTANA, `${nombre}: sin margen el panel se pega al borde`);
    }
});

test("la clase que desplaza por dentro lleva `overscroll-contain`", () => {
    // Sin él, llegar al final del panel sigue arrastrando la lista de debajo.
    assert.ok(PANEL_QUE_SE_DESPLAZA.includes("overflow-y-auto"));
    assert.ok(PANEL_QUE_SE_DESPLAZA.includes("overscroll-contain"));
});

test("`alturaDisponible` nombra la variable de SU primitiva", () => {
    assert.equal(alturaDisponible("popover"), "var(--radix-popover-content-available-height)");
    assert.equal(alturaDisponible("menu"), "var(--radix-dropdown-menu-content-available-height)");
});

test("`comoSiempre` deja la colocación de antes para lo que se pinta fuera de Chats", () => {
    // `SessionTagsCombobox` lo pinta también el kanban de /tags y
    // `AdvisorAssignBadge` la lista de asesores de otras pantallas: sin este
    // valor por defecto, unificar Chats les cambiaría el sitio.
    const g = comoSiempre("start");
    assert.equal(g.alignOffset, 0);
    assert.equal(g.sideOffset, HUECO_DEL_DISPARADOR);
    assert.equal(g.avoidCollisions, true);
    assert.deepEqual(g.estilo, {});
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. La campanita: los chips y «marcar leídas»
// ─────────────────────────────────────────────────────────────────────────────

test("los chips ya no ofrecen «Tareas», y siguen siendo seis", () => {
    assert.ok(!CHIPS_DE_LA_CAMPANA.includes("task"), "«Tareas» se leía igual que «Mis tareas»");
    assert.ok(CHIPS_DE_LA_CAMPANA.includes("tarea"), "«Mis tareas» se queda");
    assert.equal(CHIPS_DE_LA_CAMPANA.length, 6, "seis son dos filas de tres, sin última fila a medias");
    assert.equal(new Set(CHIPS_DE_LA_CAMPANA).size, 6, "ni un chip repetido");
});

test("«marcar leídas» marca SOLO lo del chip puesto", () => {
    const avisos = [
        { id: "a", kind: "mention" },
        { id: "b", kind: "chat" },
        { id: "c", kind: "mention" },
        { id: "d", kind: "appointment" },
    ];
    assert.deepEqual(
        lasQueSeMarcan(avisos, "mention").map((a) => a.id),
        ["a", "c"],
        "desde «Menciones» no puede llevarse por delante los chats ni las citas",
    );
    assert.deepEqual(
        lasQueSeMarcan(avisos, "all").map((a) => a.id),
        ["a", "b", "c", "d"],
        "sin chip se marca lo que se está viendo, que es todo",
    );
});

test("un aviso de conexión no se marca: describe algo que SIGUE roto", () => {
    const avisos = [
        { id: "a", kind: "connection" },
        { id: "b", kind: "chat" },
    ];
    assert.equal(sePuedeMarcar(avisos[0]), false);
    assert.deepEqual(lasQueSeMarcan(avisos, "all").map((a) => a.id), ["b"]);
    assert.deepEqual(
        lasQueSeMarcan(avisos, "connection").map((a) => a.id),
        [],
        "ni pulsándolo desde su propio chip",
    );
});

test("«marcar leídas» sobre un chip vacío no marca nada", () => {
    assert.deepEqual(lasQueSeMarcan([{ id: "a", kind: "chat" }], "followup"), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Resolver en lote
// ─────────────────────────────────────────────────────────────────────────────

test("los ids de sesión se sanean como NÚMEROS, sin convertir la basura", () => {
    // `Number("")` es 0 y `Number(null)` también: un saneado indulgente mete el
    // id 0 en el `IN`.
    assert.deepEqual(comoListaDeIdsNumericos([1, 2, 3]), [1, 2, 3]);
    assert.deepEqual(comoListaDeIdsNumericos([1, 1, 2]), [1, 2], "los repetidos inflan el conteo");
    assert.deepEqual(comoListaDeIdsNumericos(["1", null, undefined, NaN, 1.5, 0, -3, 4]), [4]);
    assert.deepEqual(comoListaDeIdsNumericos("no es una lista"), []);
    assert.deepEqual(comoListaDeIdsNumericos(undefined), []);
});

test("y se acotan al tope: una lista sin tope es una consulta que ningún índice ordena", () => {
    const muchos = Array.from({ length: TOPE_DE_IDS + 50 }, (_, i) => i + 1);
    assert.equal(comoListaDeIdsNumericos(muchos).length, TOPE_DE_IDS);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. La barrita de formato
// ─────────────────────────────────────────────────────────────────────────────

test("la barrita va DEBAJO de la selección: encima pelea con el menú del sistema", () => {
    const sitio = dondeVaLaBarrita(
        { left: 100, top: 300, right: 240, bottom: 320 },
        { ancho: 120, alto: 36 },
        { ancho: 390, alto: 844 },
    );
    assert.equal(sitio.encima, false);
    assert.equal(sitio.top, 326, "la selección más el hueco");
});

test("y encima SOLO cuando abajo no cabe, que es cuando el sistema baja el suyo", () => {
    const sitio = dondeVaLaBarrita(
        { left: 100, top: 780, right: 240, bottom: 820 },
        { ancho: 120, alto: 36 },
        { ancho: 390, alto: 844 },
    );
    assert.equal(sitio.encima, true);
    assert.ok(sitio.top >= 0, "y nunca por encima del borde de arriba");
});

test("la barrita no se sale por ningún borde en las cuatro anchuras", () => {
    const barra = { ancho: 132, alto: 36 };
    for (const { ventana } of ANCHURAS) {
        for (const sel of [
            { left: 0, top: 200, right: 30, bottom: 220 },
            { left: ventana - 30, top: 200, right: ventana, bottom: 220 },
            { left: ventana / 2 - 20, top: 200, right: ventana / 2 + 20, bottom: 220 },
        ]) {
            const s = dondeVaLaBarrita(sel, barra, { ancho: ventana, alto: 844 });
            assert.ok(s.left >= 0, `a ${ventana} se sale por la izquierda (${s.left})`);
            assert.ok(
                s.left + barra.ancho <= ventana,
                `a ${ventana} se corta por la derecha (${s.left + barra.ancho} > ${ventana})`,
            );
        }
    }
});

test("una ventana más estrecha que la barrita la pega a la izquierda, que es por donde se lee", () => {
    const s = dondeVaLaBarrita({ left: 10, top: 100, right: 40, bottom: 120 }, { ancho: 400, alto: 36 }, { ancho: 320, alto: 600 });
    assert.equal(s.left, 8);
});

test("las tres marcas son las de WhatsApp, no las de markdown", () => {
    // Con `**` WhatsApp deja un asterisco a la vista en el teléfono del cliente.
    assert.deepEqual(MARCAS_DE_LA_BARRITA.map((m) => m.marca), ["*", "_", "~"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. EL ANTES, sacado de git y no escrito aquí
// ─────────────────────────────────────────────────────────────────────────────

test("el ANTES: once paneles, CUATRO colocaciones distintas y ninguna medida", (t) => {
    if (!ROTO) {
        t.skip("el «antes» solo se afirma en MODO=roto");
        return;
    }

    const FICHEROS = [
        "app/(root)/chats/_components/ChatTabBar.tsx",
        "app/(root)/chats/_components/ChatSearchBar.tsx",
        "app/(root)/chats/_components/TagFilterPanel.tsx",
        "app/(root)/chats/_components/chat-sidebar.tsx",
        "app/(root)/chats/_components/LeadStatusSelect.tsx",
        "app/(root)/chats/_components/AdvisorAssignBadge.tsx",
        "app/(root)/chats/_components/ChatHeader.tsx",
        "app/(root)/chats/_components/MacrosMenu.tsx",
        "app/(root)/chats/_components/ChatRegistrosBadge.tsx",
        "app/(root)/chats/_components/ChatAppointmentStatusButton.tsx",
        "components/shared/NotificationCenter.tsx",
    ];

    const colocaciones = new Set();
    let conGeometriaPropia = 0;
    for (const f of FICHEROS) {
        const texto = execFileSync("git", ["show", `${EL_ANTES}:${f}`], { encoding: "utf8" });
        // Solo lo de un panel: el `side="top"` de un tooltip no cuenta. El
        // `(?:[^>]|=>)` es por los `onClick={(e) => ...}` que llevan dentro:
        // cortando en el primer `>` el bloque se queda a medias y el panel se
        // pierde de la cuenta — costó una vuelta, y el de asignar asesor, que
        // es justo el que abría hacia arriba, era el que se caía.
        const bloques = texto.match(/<(?:PopoverContent|DropdownMenuContent)(?:[^>]|=>)*?>/g) ?? [];
        for (const b of bloques) {
            const align = /align="(start|end|center)"/.exec(b)?.[1] ?? "start";
            const side = /side="(top|bottom)"/.exec(b)?.[1] ?? "bottom";
            colocaciones.add(`${side}/${align}`);
            conGeometriaPropia += 1;
        }
    }

    t.diagnostic(`${EL_ANTES.slice(0, 7)}: ${conGeometriaPropia} paneles, colocaciones ${[...colocaciones].sort().join(", ")}`);

    assert.ok(
        colocaciones.size >= 4,
        `la misma pregunta se contestaba de varias formas; salieron ${[...colocaciones]}`,
    );
    assert.ok(colocaciones.has("bottom/center"), "registros y cita abrían centrados");
    assert.ok(colocaciones.has("top/start"), "asignar asesor abría hacia ARRIBA");

    // Y la prueba de que nadie medía el contenedor: ni un `alignOffset`.
    const conMedida = FICHEROS.filter((f) =>
        execFileSync("git", ["show", `${EL_ANTES}:${f}`], { encoding: "utf8" }).includes("alignOffset"),
    );
    assert.deepEqual(conMedida, [], "ningún panel del «antes» se colocaba contra su contenedor");
});
