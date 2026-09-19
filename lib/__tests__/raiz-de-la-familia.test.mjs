/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Todos los miembros de una familia tienen que calcular la MISMA raiz.**
 *
 * De donde sale: `linked_accounts` no es un arbol. En produccion 8 de sus 13
 * filas son parejas reciprocas, asi que «de quien cuelgo» devuelve varias
 * respuestas y la version anterior se quedaba con la primera por `id ASC` — o
 * sea el orden alfabetico de un uuid. Medido contra la base real: la familia
 * de cinco cuentas calculaba TRES raices distintas segun desde donde se
 * preguntara, nadie era la madre, y Verzay | Ventas veia 3 de los 8 mensajes
 * del General.
 *
 * `lib/raiz-de-la-familia.ts` no importa NADA, asi que basta transpilarlo:
 *
 *   npx tsc lib/raiz-de-la-familia.ts --outDir lib/__tests__/.compilado \
 *     --module esnext --target es2022 --moduleResolution bundler
 *
 * y correr:  node --test lib/__tests__/raiz-de-la-familia.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");
const { laRaizQueManda } = await import(path.join(compilado, "raiz-de-la-familia.js"));

// Los ids REALES de produccion, para que el desempate se pruebe con el mismo
// orden alfabetico que despisto: los que empiezan por digito van antes que los
// que empiezan por letra.
const CASA = "cm842kthc0000qd2l66nbnytv"; // Carlos | Arcos
const ATENCION = "3c823f21-00d2-4c88-9f88-099495f97931";
const VENTAS = "cm84mjtp50000l6soenaosi2z";
const NOTIF = "f7740a22-4149-4a90-a51c-a460cde2a7c7";
const PRUEBAS = "cdfb7f70-735a-429b-9607-7d7e67600cc4";
const FAMILIA = [CASA, ATENCION, VENTAS, NOTIF, PRUEBAS];

/** Las diez filas de `linked_accounts` tal como estan hoy en produccion. */
const ENLACES_REALES = [
    { de: NOTIF, a: VENTAS },
    { de: VENTAS, a: CASA },
    { de: NOTIF, a: CASA },
    { de: VENTAS, a: ATENCION },
    { de: NOTIF, a: ATENCION },
    { de: CASA, a: ATENCION },
    { de: CASA, a: VENTAS },
    { de: CASA, a: NOTIF },
    { de: CASA, a: PRUEBAS },
    { de: ATENCION, a: VENTAS },
];

// ─────────────────────────────────────────────────────────────────────────────
// El caso real
// ─────────────────────────────────────────────────────────────────────────────

test("con la malla REAL manda la casa, que es quien vinculo a las cuatro", () => {
    assert.equal(laRaizQueManda(FAMILIA, ENLACES_REALES), CASA);
});

test("y las CINCO calculan la misma raiz, que es lo que fallaba", () => {
    // La familia es el mismo conjunto para todos los miembros, asi que basta
    // con barajarlo: si el resultado dependiera del orden en que llegan, cada
    // pestana elegiria una raiz distinta y el hilo se partiria otra vez.
    const ordenes = [
        FAMILIA,
        [...FAMILIA].reverse(),
        [VENTAS, NOTIF, PRUEBAS, CASA, ATENCION],
        [ATENCION, PRUEBAS, VENTAS, CASA, NOTIF],
        [PRUEBAS, CASA, ATENCION, NOTIF, VENTAS],
    ];
    const raices = new Set(ordenes.map((o) => laRaizQueManda(o, ENLACES_REALES)));
    assert.deepEqual([...raices], [CASA]);
});

test("ANTES: quedarse con la primera por id ASC daba una raiz distinta por cuenta", () => {
    // Esto es la regla vieja, reproducida. Sin ejecutarla no se sabe si se
    // arreglo la causa o algo que se le parece.
    const comoAntes = (yo) => {
        const arriba = ENLACES_REALES.filter((e) => e.a === yo).map((e) => e.de).sort();
        return arriba[0] ?? yo;
    };

    assert.equal(comoAntes(CASA), VENTAS); // la madre colgaba de su propia hija
    assert.notEqual(comoAntes(CASA), CASA); // …asi que no era la madre de nadie

    const raicesViejas = new Set(FAMILIA.map(comoAntes));
    assert.ok(raicesViejas.size > 1, "la regla vieja daba varias raices para la misma familia");

    // Y ninguna de las cinco se reconocia como madre.
    assert.equal(FAMILIA.filter((c) => comoAntes(c) === c).length, 0);

    // La nueva: una sola raiz, y exactamente una madre.
    const raicesNuevas = new Set(FAMILIA.map(() => laRaizQueManda(FAMILIA, ENLACES_REALES)));
    assert.equal(raicesNuevas.size, 1);
    assert.equal(FAMILIA.filter((c) => laRaizQueManda(FAMILIA, ENLACES_REALES) === c).length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lo que NO puede cambiar
// ─────────────────────────────────────────────────────────────────────────────

test("una familia normal —madre y sus hijas, sin reciprocos— sale igual que antes", () => {
    const madre = "zzz-madre"; // id alto a proposito: por orden alfabetico perderia
    const hijas = ["aaa", "bbb", "ccc"];
    const enlaces = hijas.map((h) => ({ de: madre, a: h }));
    assert.equal(laRaizQueManda([madre, ...hijas], enlaces), madre);
});

test("una cuenta sola es su propia raiz", () => {
    assert.equal(laRaizQueManda(["sola"], []), "sola");
    assert.equal(laRaizQueManda(["sola"], [{ de: "sola", a: "otra" }]), "sola");
});

test("sin ninguna cuenta no se inventa una raiz", () => {
    assert.equal(laRaizQueManda([], ENLACES_REALES), "");
});

// ─────────────────────────────────────────────────────────────────────────────
// Los bordes
// ─────────────────────────────────────────────────────────────────────────────

test("a igualdad de enlaces gana el id menor, para que el desempate sea estable", () => {
    const enlaces = [{ de: "b", a: "c" }, { de: "a", a: "c" }];
    assert.equal(laRaizQueManda(["a", "b", "c"], enlaces), "a");
    assert.equal(laRaizQueManda(["c", "b", "a"], enlaces), "a");
});

test("sin ningun enlace dentro de la familia gana el id menor, no el primero que llegue", () => {
    assert.equal(laRaizQueManda(["b", "a", "c"], []), "a");
});

test("un enlace REPETIDO no vota dos veces", () => {
    // Dos filas `b -> c` no pueden ganarle a quien vinculo dos cuentas
    // distintas: se contaria una declaracion duplicada como si fueran dos.
    const enlaces = [
        { de: "b", a: "c" },
        { de: "b", a: "c" },
        { de: "a", a: "c" },
        { de: "a", a: "d" },
    ];
    assert.equal(laRaizQueManda(["a", "b", "c", "d"], enlaces), "a");
});

test("un enlace hacia FUERA de la familia no cuenta", () => {
    // No deberia pasar —la familia es el componente entero— pero si pasara,
    // quien mas cuentas ajenas tenga no puede mandar en esta.
    const enlaces = [{ de: "b", a: "de-otra-familia" }, { de: "a", a: "c" }];
    assert.equal(laRaizQueManda(["a", "b", "c"], enlaces), "a");
});

test("la basura de la lista y de los enlaces no decide nada", () => {
    const enlaces = [
        { de: "  ", a: "a" },
        { de: "a", a: "" },
        { de: "b", a: "b" }, // a si misma: no es una declaracion sobre nadie
        { de: " a ", a: " c " },
        null,
        undefined,
    ];
    assert.equal(laRaizQueManda(["a", "b", "c", "", "   ", null], enlaces), "a");
});

test("los repetidos de la lista de cuentas no cambian la raiz", () => {
    assert.equal(
        laRaizQueManda([...FAMILIA, ...FAMILIA, CASA], ENLACES_REALES),
        laRaizQueManda(FAMILIA, ENLACES_REALES),
    );
});
