/**
 * El panel de filtros de Chats: de qué cuenta se ofrecen las etiquetas y los
 * embudos, y cómo filtra una etapa. La decisión, pura.
 *
 * `MODO=roto` corre lo de antes —sin línea elegida, las etiquetas de TODAS las
 * cuentas mezcladas, y ningún filtro de embudos— y afirma el fallo. El «antes»
 * del panel se lee de git, pinchado a un commit (`ANTES_REF`), nunca de
 * `origin/main`, que pasa a ser el «ahora» en cuanto esto se fusione.
 *
 * Se levanta con `scripts/banco-filtro-de-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
    lasCuentasDeLasLineas,
    hayQueElegirCuenta,
    laCuentaDelFiltro,
    losEmbudosDelFiltro,
    elEmbudoDelFiltro,
    alternarUnaSola,
    pasaElFiltroDeEtapa,
    pasaElFiltroDeEtiquetas,
    etiquetasDelFiltro,
} from "./.compilado/filtro-de-chats/entrada.js";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF ?? "f3f296c";

const MADRE = "madre";
const ATENCION = "atencion";
const VENTAS = "ventas";

const LINEAS = { L_MADRE: MADRE, L_ATENCION: ATENCION, L_VENTAS: VENTAS, L_VENTAS_2: VENTAS };

const ETIQUETAS = [
    { id: 1, name: "VIP", userId: MADRE },
    { id: 2, name: "Interesado", userId: ATENCION },
    { id: 3, name: "Reclamo", userId: ATENCION },
    { id: 4, name: "Interesado", userId: VENTAS },
];

const EMBUDOS = [
    { cuentaId: MADRE, nombre: "Madre", embudos: [{ id: "em", nombre: "Ventas", porDefecto: true, etapas: [{ id: "em1", nombre: "Nuevo", color: "#94A3B8" }] }] },
    {
        cuentaId: ATENCION,
        nombre: "Atención",
        embudos: [
            { id: "ea1", nombre: "Embudo de ventas", porDefecto: true, etapas: [{ id: "ea1-n", nombre: "Nuevo", color: "#94A3B8" }, { id: "ea1-c", nombre: "Cotizado", color: "#EAB308" }] },
            { id: "ea2", nombre: "Soporte", porDefecto: false, etapas: [{ id: "ea2-a", nombre: "Abierto", color: "#3B82F6" }] },
        ],
    },
    { cuentaId: VENTAS, nombre: "Ventas", embudos: [] },
];

const ids = (lista) => lista.map((x) => x.id);

/** Lo que había: sin línea elegida, todas las etiquetas; sin embudos. */
const etiquetasDeAntes = (todas, cuentaDeLaLinea) =>
    cuentaDeLaLinea ? todas.filter((t) => t.userId === cuentaDeLaLinea) : [...todas];

if (ROTO) {
    test("ROTO: sin línea elegida, las etiquetas de las hijas salen MEZCLADAS", () => {
        const ofrecidas = etiquetasDeAntes(ETIQUETAS, null);
        const cuentas = new Set(ofrecidas.map((t) => t.userId));
        assert.ok(cuentas.size > 1, "se esperaba la mezcla de cuentas");
        // Dos «Interesado» de cuentas distintas, indistinguibles en el panel.
        assert.equal(ofrecidas.filter((t) => t.name === "Interesado").length, 2);
    });

    test("ROTO: el panel no tenía ni cuenta que elegir ni sección de Embudos", () => {
        const panel = execFileSync(
            "git",
            ["show", `${ANTES_REF}:app/(root)/chats/_components/TagFilterPanel.tsx`],
            { encoding: "utf8" },
        );
        assert.ok(!/Embudos/.test(panel), "el panel de antes ya tenía Embudos");
        assert.ok(!/onElegirCuenta/.test(panel), "el panel de antes ya elegía cuenta");
        const barra = execFileSync(
            "git",
            ["show", `${ANTES_REF}:app/(root)/chats/_components/chat-sidebar.tsx`],
            { encoding: "utf8" },
        );
        assert.ok(!/selectedEtapaIds/.test(barra), "la lista de antes ya filtraba por etapa");
    });
} else {
    test("las cuentas salen de las líneas, sin repetir y con la propia delante", () => {
        assert.deepEqual(lasCuentasDeLasLineas(LINEAS, MADRE), [MADRE, ATENCION, VENTAS]);
        assert.deepEqual(lasCuentasDeLasLineas({ L1: VENTAS, L2: MADRE }, MADRE), [MADRE, VENTAS]);
        assert.deepEqual(lasCuentasDeLasLineas({}, MADRE), []);
    });

    test("con varias cuentas y sin línea elegida, primero se elige la cuenta", () => {
        const cuentas = lasCuentasDeLasLineas(LINEAS, MADRE);
        assert.equal(hayQueElegirCuenta(cuentas, null), true);
        assert.equal(laCuentaDelFiltro({ cuentas, cuentaDeLaLineaElegida: null, elegida: null }), null);
    });

    test("elegida la hija, solo SUS etiquetas: nunca mezcladas con otra hija", () => {
        const cuentas = lasCuentasDeLasLineas(LINEAS, MADRE);
        const cuenta = laCuentaDelFiltro({ cuentas, elegida: ATENCION });
        assert.equal(cuenta, ATENCION);
        assert.deepEqual(ids(etiquetasDelFiltro(ETIQUETAS, cuenta)), [2, 3]);
        assert.deepEqual(ids(etiquetasDelFiltro(ETIQUETAS, laCuentaDelFiltro({ cuentas, elegida: VENTAS }))), [4]);
    });

    test("con una línea elegida en Canales manda su cuenta, sin preguntar", () => {
        const cuentas = lasCuentasDeLasLineas(LINEAS, MADRE);
        assert.equal(hayQueElegirCuenta(cuentas, VENTAS), false);
        assert.equal(laCuentaDelFiltro({ cuentas, cuentaDeLaLineaElegida: VENTAS, elegida: ATENCION }), VENTAS);
    });

    test("con una sola cuenta, esa; una elegida que ya no está no vale", () => {
        assert.equal(hayQueElegirCuenta([MADRE], null), false);
        assert.equal(laCuentaDelFiltro({ cuentas: [MADRE] }), MADRE);
        assert.equal(laCuentaDelFiltro({ cuentas: [MADRE, ATENCION], elegida: "ajena" }), null);
    });

    test("los embudos son de UNA cuenta; con varios se elige el embudo primero", () => {
        assert.deepEqual(ids(losEmbudosDelFiltro(EMBUDOS, ATENCION)), ["ea1", "ea2"]);
        assert.deepEqual(losEmbudosDelFiltro(EMBUDOS, null), []);
        assert.deepEqual(losEmbudosDelFiltro(EMBUDOS, VENTAS), []);
        const deAtencion = losEmbudosDelFiltro(EMBUDOS, ATENCION);
        assert.equal(elEmbudoDelFiltro(deAtencion, null), null);
        assert.equal(elEmbudoDelFiltro(deAtencion, "ea2")?.id, "ea2");
        // Uno de otra cuenta no vale.
        assert.equal(elEmbudoDelFiltro(deAtencion, "em"), null);
        // Con uno solo, ese, sin elegir.
        assert.equal(elEmbudoDelFiltro(losEmbudosDelFiltro(EMBUDOS, MADRE), null)?.id, "em");
    });

    test("la etapa filtra EXACTA y se elige igual que una etiqueta", () => {
        const conversaciones = [
            { id: "a", etapa: { id: "ea1-n" }, tags: [{ id: 2 }] },
            { id: "b", etapa: { id: "ea1-c" }, tags: [{ id: 3 }] },
            { id: "c", etapa: null, tags: [] },
        ];
        let etapas = alternarUnaSola(new Set(), "ea1-c");
        assert.deepEqual(
            conversaciones.filter((c) => pasaElFiltroDeEtapa(c.etapa?.id, etapas)).map((c) => c.id),
            ["b"],
        );
        // Pulsar la misma la quita: vuelven todas.
        etapas = alternarUnaSola(etapas, "ea1-c");
        assert.equal(etapas.size, 0);
        assert.equal(conversaciones.filter((c) => pasaElFiltroDeEtapa(c.etapa?.id, etapas)).length, 3);
        // Pulsar otra la deja sola, como las etiquetas.
        assert.deepEqual([...alternarUnaSola(new Set(["ea1-n"]), "ea1-c")], ["ea1-c"]);
        // Etiquetas con la misma forma.
        const tags = alternarUnaSola(new Set(), 2);
        assert.deepEqual(
            conversaciones.filter((c) => pasaElFiltroDeEtiquetas(c.tags, tags)).map((c) => c.id),
            ["a"],
        );
    });
}
