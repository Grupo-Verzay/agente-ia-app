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
 * `MODO=roto` **no escribe el «antes» a mano**: lo saca de `origin/main` con
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
} from "./.compilado/paneles-flotantes.js";
import { CHIPS_DE_LA_CAMPANA, lasQueSeMarcan, sePuedeMarcar } from "./.compilado/campana.js";
import { MARCAS_DE_LA_BARRITA, dondeVaLaBarrita } from "./.compilado/barrita-de-formato.js";
import { comoListaDeIdsNumericos, TOPE_DE_IDS } from "./.compilado/borrado-en-bloque.js";

const ROTO = process.env.MODO === "roto";

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

test("columnaAncha: el panel mide la columna y empieza en su filo, en las cuatro anchuras", () => {
    for (const { ventana, columna: ancho } of ANCHURAS) {
        const izq = CARRIL(ventana);
        const columna = { left: izq, right: izq + ancho, bottom: 200 };
        // Un disparador cualquiera de la fila de arriba, metido hacia dentro.
        const disparador = { left: izq + 12, right: izq + 44, bottom: 96 };
        const pastillas = 132;

        const g = columnaAncha(columna, disparador, pastillas, "menu");
        const anchoDelPanel = Number(g.estilo.width.replace("px", ""));
        const { left, right } = filos(g, disparador, anchoDelPanel);

        assert.equal(anchoDelPanel, ancho, `a ${ventana} el panel tiene que medir la columna`);
        assert.equal(left, columna.left, `a ${ventana} tiene que empezar en el filo izquierdo`);
        assert.equal(right, columna.right, `a ${ventana} no puede pasarse del filo derecho`);
    }
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

test("cabecera: los seis nacen a la MISMA altura y pegados al filo derecho", () => {
    for (const { ventana, columna: ancho } of ANCHURAS) {
        const izq = CARRIL(ventana) + ancho;
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
            const g = cabecera(caja, d, "menu");
            nacen.add(d.bottom + g.sideOffset);

            const tope = Number(g.estilo.maxWidth.replace("px", ""));
            const { left, right } = filos(g, d, tope);
            assert.equal(right, caja.right, `a ${ventana} el panel tiene que pegarse al filo derecho`);
            assert.ok(left >= caja.left, `a ${ventana} el panel invade la columna (${left} < ${caja.left})`);
        }

        assert.equal(
            nacen.size,
            1,
            `a ${ventana} los seis tienen que nacer a la misma altura; salieron ${[...nacen]}`,
        );
        assert.equal([...nacen][0], caja.bottom, "y esa altura es el borde de abajo de la cabecera");
    }
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
// 9. EL ANTES, sacado de `origin/main` y no escrito aquí
// ─────────────────────────────────────────────────────────────────────────────

test("origin/main: once paneles, CUATRO colocaciones distintas y ninguna medida", (t) => {
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
        const texto = execFileSync("git", ["show", `origin/main:${f}`], { encoding: "utf8" });
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

    t.diagnostic(`origin/main: ${conGeometriaPropia} paneles, colocaciones ${[...colocaciones].sort().join(", ")}`);

    assert.ok(
        colocaciones.size >= 4,
        `la misma pregunta se contestaba de varias formas; salieron ${[...colocaciones]}`,
    );
    assert.ok(colocaciones.has("bottom/center"), "registros y cita abrían centrados");
    assert.ok(colocaciones.has("top/start"), "asignar asesor abría hacia ARRIBA");

    // Y la prueba de que nadie medía el contenedor: ni un `alignOffset`.
    const conMedida = FICHEROS.filter((f) =>
        execFileSync("git", ["show", `origin/main:${f}`], { encoding: "utf8" }).includes("alignOffset"),
    );
    assert.deepEqual(conMedida, [], "ningún panel de origin/main se colocaba contra su contenedor");
});
