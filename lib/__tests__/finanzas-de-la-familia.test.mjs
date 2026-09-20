/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Consolidar no puede inventar un numero que no se puede calcular.**
 *
 * De donde sale: cada cuenta de la familia tiene su `preferredCurrencyCode`.
 * Sumar pesos con dolares da una cifra **perfectamente creible** y que no
 * significa nada, que es la peor clase de error porque nadie la mira dos veces
 * — la misma familia del «999999999 de -1 creditos» que ya salio por WhatsApp
 * a una clienta.
 *
 * Y el segundo, igual de importante: **lo que llega del navegador no decide a
 * que se llega.** Las cuentas viajan en la URL (`?cuentas=a,b,c`), asi que un
 * id de otra familia escrito a mano tiene que caerse aqui.
 *
 * `lib/finanzas-de-la-familia.ts` no importa NADA, asi que basta transpilarlo:
 *
 *   npx tsc lib/finanzas-de-la-familia.ts --outDir lib/__tests__/.compilado \
 *     --module esnext --target es2022 --moduleResolution bundler
 *
 * y correr:  node --test lib/__tests__/finanzas-de-la-familia.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado");
const {
    laSeleccionQueVale,
    comoListaDeCuentas,
    comoParametroDeCuentas,
    consolidar,
    seEnsenaElSelector,
    TOPE_DE_CUENTAS,
    laMonedaDeLaSeleccion,
    lasCuentasElegidas,
    estaConsolidando,
    nombresPorCuenta,
    esDeOtraCuenta,
    topeDeLaLista,
    TOPE_POR_CUENTA,
    TECHO_DE_LA_LISTA,
} = await import(path.join(compilado, "finanzas-de-la-familia.js"));

const MADRE = "grupo";
const ATENCION = "atencion";
const VENTAS = "ventas";
const FAMILIA = [MADRE, ATENCION, VENTAS];

const cuenta = (id, moneda = "COP") => ({
    id,
    nombre: id,
    moneda,
    esLaPropia: id === MADRE,
});

// ─────────────────────────────────────────────────────────────────────────────
// Que cuentas se consultan de verdad
// ─────────────────────────────────────────────────────────────────────────────

test("sin seleccion se consulta SOLO la cuenta propia, como antes de esto", () => {
    assert.deepEqual(laSeleccionQueVale([], FAMILIA, MADRE), [MADRE]);
    assert.deepEqual(laSeleccionQueVale(null, FAMILIA, MADRE), [MADRE]);
    assert.deepEqual(laSeleccionQueVale(undefined, FAMILIA, MADRE), [MADRE]);
});

test("un id de OTRA familia escrito a mano en la URL se cae", () => {
    // Este es el caso de seguridad: esconder el selector no cierra la peticion
    // directa, asi que la cuenta ajena tiene que morir en esta funcion.
    assert.deepEqual(laSeleccionQueVale(["cuenta-de-otro"], FAMILIA, MADRE), [MADRE]);

    // Y mezclada con buenas, se cae ella sola y las demas siguen.
    assert.deepEqual(
        laSeleccionQueVale([ATENCION, "cuenta-de-otro", VENTAS], FAMILIA, MADRE),
        [ATENCION, VENTAS],
    );
});

test("los repetidos no se consultan dos veces", () => {
    assert.deepEqual(laSeleccionQueVale([ATENCION, ATENCION, ATENCION], FAMILIA, MADRE), [ATENCION]);
});

test("la basura del parametro no llega a la consulta", () => {
    assert.deepEqual(laSeleccionQueVale(["", "   ", null, undefined], FAMILIA, MADRE), [MADRE]);
});

test("una cuenta hija no alcanza a sus hermanas", () => {
    // Su lista de alcanzables es ella sola: es lo que le devuelve el servidor
    // cuando no es la madre. Pedir a las hermanas no le sirve de nada.
    assert.deepEqual(laSeleccionQueVale([MADRE, VENTAS], [ATENCION], ATENCION), [ATENCION]);
});

// ─────────────────────────────────────────────────────────────────────────────
// El parametro de la URL
// ─────────────────────────────────────────────────────────────────────────────

test("la lista se lee de la URL y se acota antes de tocar la base", () => {
    assert.deepEqual(comoListaDeCuentas("a,b,c"), ["a", "b", "c"]);
    assert.deepEqual(comoListaDeCuentas(" a , b "), ["a", "b"]);
    assert.deepEqual(comoListaDeCuentas(""), []);
    assert.deepEqual(comoListaDeCuentas(null), []);

    const muchas = Array.from({ length: TOPE_DE_CUENTAS + 40 }, (_, i) => `c${i}`).join(",");
    assert.equal(comoListaDeCuentas(muchas).length, TOPE_DE_CUENTAS);
});

test("lo que se escribe en la URL vuelve a leerse igual", () => {
    const ids = [MADRE, ATENCION];
    assert.deepEqual(comoListaDeCuentas(comoParametroDeCuentas(ids)), ids);
});

// ─────────────────────────────────────────────────────────────────────────────
// Consolidar: el total y el desglose
// ─────────────────────────────────────────────────────────────────────────────

test("con la misma moneda suma, y el desglose cuadra con el total", () => {
    const res = consolidar(
        [cuenta(MADRE), cuenta(ATENCION), cuenta(VENTAS)],
        new Map([
            [MADRE, { ingresos: 100, gastos: 40 }],
            [ATENCION, { ingresos: 50, gastos: 10 }],
            [VENTAS, { ingresos: 25, gastos: 5 }],
        ]),
    );

    assert.equal(res.moneda, "COP");
    assert.deepEqual(res.total, { ingresos: 175, gastos: 55, balance: 120 });
    assert.equal(res.sinTotalPorque, null);

    // La mitad que de verdad importa: el desglose SUMA el total. Si algun dia
    // divergen, la pantalla ensena dos numeros que se contradicen.
    const sumaDeFilas = res.filas.reduce((s, f) => s + f.balance, 0);
    assert.equal(sumaDeFilas, res.total.balance);
});

test("una cuenta sin movimientos sale igual, con ceros", () => {
    // «Una fila por cuenta» es literal: sin esto, la cuenta que no aporto nada
    // desaparece del desglose y parece que no estaba elegida.
    const res = consolidar(
        [cuenta(MADRE), cuenta(ATENCION)],
        new Map([[MADRE, { ingresos: 10, gastos: 0 }]]),
    );

    assert.equal(res.filas.length, 2);
    const vacia = res.filas.find((f) => f.cuentaId === ATENCION);
    assert.deepEqual(
        { ingresos: vacia.ingresos, gastos: vacia.gastos, balance: vacia.balance },
        { ingresos: 0, gastos: 0, balance: 0 },
    );
});

test("CON MONEDAS DISTINTAS no hay total, y el desglose sigue entero", () => {
    const res = consolidar(
        [cuenta(MADRE, "COP"), cuenta(ATENCION, "USD")],
        new Map([
            [MADRE, { ingresos: 1_000_000, gastos: 0 }],
            [ATENCION, { ingresos: 200, gastos: 0 }],
        ]),
    );

    // Lo que NO puede pasar: un total de 1.000.200 de nada.
    assert.equal(res.total, null);
    assert.equal(res.moneda, null);
    assert.match(res.sinTotalPorque, /monedas distintas/);
    assert.match(res.sinTotalPorque, /COP/);
    assert.match(res.sinTotalPorque, /USD/);

    // Y el desglose sigue siendo cierto: cada fila en la suya.
    assert.equal(res.filas.length, 2);
    assert.equal(res.filas.find((f) => f.cuentaId === MADRE).moneda, "COP");
    assert.equal(res.filas.find((f) => f.cuentaId === ATENCION).moneda, "USD");
});

test("una sola cuenta tiene total, y es el suyo", () => {
    const res = consolidar([cuenta(ATENCION, "USD")], new Map([[ATENCION, { ingresos: 7, gastos: 2 }]]));
    assert.equal(res.moneda, "USD");
    assert.deepEqual(res.total, { ingresos: 7, gastos: 2, balance: 5 });
});

test("el balance negativo se conserva, no se recorta a cero", () => {
    const res = consolidar([cuenta(MADRE)], new Map([[MADRE, { ingresos: 10, gastos: 90 }]]));
    assert.equal(res.total.balance, -80);
});

test("sin ninguna cuenta no se inventa un total de cero", () => {
    const res = consolidar([], new Map());
    assert.equal(res.total, null);
    assert.ok(res.sinTotalPorque);
});

// ─────────────────────────────────────────────────────────────────────────────
// Quien ve el selector
// ─────────────────────────────────────────────────────────────────────────────

test("el selector pide las TRES condiciones", () => {
    const si = { mandaEnSuCuenta: true, esLaMadre: true, cuantasCuentas: 3 };
    assert.equal(seEnsenaElSelector(si), true);

    // Un agente participa, no administra.
    assert.equal(seEnsenaElSelector({ ...si, mandaEnSuCuenta: false }), false);
    // Una cuenta hija sigue viendo unicamente lo suyo: ese es el encargo.
    assert.equal(seEnsenaElSelector({ ...si, esLaMadre: false }), false);
    // Y un selector con una sola opcion dentro no filtra nada.
    assert.equal(seEnsenaElSelector({ ...si, cuantasCuentas: 1 }), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Las dos encadenadas, que es lo que ningun caso suelto prueba
// ─────────────────────────────────────────────────────────────────────────────

test("lo que el selector OFRECE es exactamente lo que se puede consolidar", () => {
    // Probar cada mitad por su cuenta deja pasar el caso real: que la pantalla
    // ofrezca una cuenta que la consulta luego descarta, y el desglose salga
    // con una fila menos sin decir por que.
    const disponibles = [cuenta(MADRE), cuenta(ATENCION), cuenta(VENTAS)];

    const elegidas = laSeleccionQueVale(
        comoListaDeCuentas(comoParametroDeCuentas([MADRE, VENTAS])),
        disponibles.map((c) => c.id),
        MADRE,
    );

    const res = consolidar(
        disponibles.filter((c) => elegidas.includes(c.id)),
        new Map([
            [MADRE, { ingresos: 10, gastos: 1 }],
            [VENTAS, { ingresos: 20, gastos: 2 }],
        ]),
    );

    assert.deepEqual(res.filas.map((f) => f.cuentaId), [MADRE, VENTAS]);
    assert.deepEqual(res.total, { ingresos: 30, gastos: 3, balance: 27 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Las cuatro LISTAS: Ventas, Gastos, Clientes y Proveedores
//
// El mismo selector, la misma regla de alcance y la misma regla de monedas.
// Lo que estas piezas protegen es que las cuatro contesten IGUAL: escritas a
// mano en cada pantalla, el día que se afine una las otras tres se quedan
// atrás — y eso no se ve como un error, se ve como que «en Gastos a veces no
// funciona».
// ─────────────────────────────────────────────────────────────────────────────

test("la moneda de la seleccion: una sola manda; dos distintas NO dan total", () => {
    assert.deepEqual(
        laMonedaDeLaSeleccion([cuenta(MADRE), cuenta(VENTAS)]),
        { moneda: "COP", motivo: null },
    );

    const mezcla = laMonedaDeLaSeleccion([cuenta(MADRE, "COP"), cuenta(VENTAS, "USD")]);
    assert.equal(mezcla.moneda, null);
    // Y el motivo NOMBRA las dos monedas: «no se puede» a secas manda a
    // buscar el fallo, y aquí no hay ningún fallo que buscar.
    assert.match(mezcla.motivo, /COP/);
    assert.match(mezcla.motivo, /USD/);
});

test("sin ninguna cuenta elegida tampoco hay total, y lo dice", () => {
    const vacia = laMonedaDeLaSeleccion([]);
    assert.equal(vacia.moneda, null);
    assert.ok(vacia.motivo);
});

test("`consolidar` y el selector contestan lo MISMO sobre la mezcla", () => {
    // Es la razón por la que la regla está en una sola función: la tarjeta de
    // Finanzas decide si pinta el total, y el selector de las listas decide si
    // se pone en ámbar. Con dos copias, una diría que sí y la otra que no.
    const revueltas = [cuenta(MADRE, "COP"), cuenta(VENTAS, "USD")];
    const res = consolidar(revueltas, new Map([
        [MADRE, { ingresos: 10, gastos: 1 }],
        [VENTAS, { ingresos: 20, gastos: 2 }],
    ]));
    assert.equal(res.total, null);
    assert.equal(res.sinTotalPorque, laMonedaDeLaSeleccion(revueltas).motivo);
    // Pero el desglose sale igual: cada fila en su moneda, que es cierta.
    assert.equal(res.filas.length, 2);
});

test("`lasCuentasElegidas` conserva el orden de las disponibles, no el de la URL", () => {
    const disponibles = [cuenta(MADRE), cuenta(ATENCION), cuenta(VENTAS)];
    // La propia va primero en `disponibles` a propósito; si mandara el orden
    // de la URL, la columna «Cuenta» cambiaría de orden entre dos cargas.
    assert.deepEqual(
        lasCuentasElegidas(disponibles, [VENTAS, MADRE]).map((c) => c.id),
        [MADRE, VENTAS],
    );
    // Y un id que no está entre las disponibles no aparece.
    assert.deepEqual(lasCuentasElegidas(disponibles, ["de-fuera"]), []);
});

test("consolidar es tener MAS de una: con una sola la lista se ve como siempre", () => {
    assert.equal(estaConsolidando([]), false);
    assert.equal(estaConsolidando([MADRE]), false);
    assert.equal(estaConsolidando([MADRE, VENTAS]), true);
});

test("`esDeOtraCuenta` solo es cierto con dueño y distinto", () => {
    assert.equal(esDeOtraCuenta(VENTAS, MADRE), true);
    assert.equal(esDeOtraCuenta(MADRE, MADRE), false);
    // Sin dueño NO se da por ajena: se pintaría un «—» donde hay una fila
    // perfectamente editable, y el lápiz desaparecería sin decir por qué.
    assert.equal(esDeOtraCuenta(null, MADRE), false);
    assert.equal(esDeOtraCuenta(undefined, MADRE), false);
    assert.equal(esDeOtraCuenta("   ", MADRE), false);
});

test("los nombres se indexan por id, para la columna «Cuenta»", () => {
    assert.deepEqual(
        nombresPorCuenta([cuenta(MADRE), cuenta(VENTAS)]),
        { [MADRE]: MADRE, [VENTAS]: VENTAS },
    );
});

test("el tope de la lista CRECE con las cuentas, pero tiene techo", () => {
    // Sin esto, consolidar tres cuentas enseñaría un tercio de cada una y
    // parecería que faltan filas.
    assert.equal(topeDeLaLista(1), TOPE_POR_CUENTA);
    assert.equal(topeDeLaLista(3), TOPE_POR_CUENTA * 3);
    // El techo existe porque la lista viaja ENTERA al navegador.
    assert.equal(topeDeLaLista(50), TECHO_DE_LA_LISTA);
    // Y nunca cero: una lista con `take: 0` sale vacía y se lee como que no
    // hay nada.
    assert.equal(topeDeLaLista(0), TOPE_POR_CUENTA);
    assert.equal(topeDeLaLista(-3), TOPE_POR_CUENTA);
});

test("un ARREGLO en la URL no se recorta a su primer id", () => {
    // `searchParams.cuentas` llega como arreglo cuando el parámetro se repite
    // (`?cuentas=a&cuentas=b`). Antes se cogía `raw[0]`, así que consolidar
    // por ese camino enseñaba UNA cuenta y parecía que el selector no hacía
    // nada.
    assert.deepEqual(comoListaDeCuentas([MADRE, VENTAS]), [MADRE, VENTAS]);
    assert.deepEqual(comoListaDeCuentas([`${MADRE},${VENTAS}`]), [MADRE, VENTAS]);
});
