/**
 * La decisión del CRM de la familia, sin base y sin navegador.
 *
 * Aquí solo vive lo que se puede contestar con las listas delante: qué cuentas
 * quedan elegidas, cuándo la vista va unificada, qué fila es ajena y cuánto
 * crece el tope. Lo que este fichero NO puede probar —y por eso hay un banco
 * contra Postgres al lado— es que las consultas del CRM pasen por aquí.
 *
 * `MODO=roto` corre la forma INGENUA: consultar **solo la cuenta propia**, que
 * es lo que había antes de esto, y **afirma el fallo** —la madre no ve nada de
 * sus hijas—. Sin ese modo no se sabría si lo verde de al lado es que la regla
 * se cumple o que el caso no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-crm-de-la-familia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    laSeleccionDelCrm,
    lasCuentasQueCuelganDe,
    elCrmVaUnificado,
    nombresDeLasCuentas,
    esDeOtraCuentaDelCrm,
    elTopeDelCrm,
    TECHO_DE_CUENTAS_EN_UN_TOPE,
} from "./.compilado/crm/crm-de-la-familia.js";

const ROTO = process.env.MODO === "roto";

/** La forma que había antes: cada pantalla consultaba su propia cuenta. */
function comoEraAntes(_pedidas, _alcanzables, propia) {
    return [propia];
}

const MADRE = "madre";
const HIJA_A = "hija-a";
const HIJA_B = "hija-b";
const FAMILIA = [MADRE, HIJA_A, HIJA_B];

test("sin parámetro se consulta la FAMILIA entera, no solo la propia", () => {
    if (ROTO) {
        // El fallo, afirmado: la madre tenía que entrar cuenta por cuenta.
        assert.deepEqual(comoEraAntes(null, FAMILIA, MADRE), [MADRE]);
        return;
    }
    assert.deepEqual(laSeleccionDelCrm(null, FAMILIA), FAMILIA);
    assert.deepEqual(laSeleccionDelCrm([], FAMILIA), FAMILIA);
});

test("el filtro REDUCE: elegir una deja una", () => {
    assert.deepEqual(laSeleccionDelCrm([HIJA_A], FAMILIA), [HIJA_A]);
    assert.deepEqual(laSeleccionDelCrm([MADRE, HIJA_B], FAMILIA), [MADRE, HIJA_B]);
});

test("lo que no se alcanza se descarta, y no arrastra a lo bueno", () => {
    assert.deepEqual(laSeleccionDelCrm([HIJA_A, "de-fuera"], FAMILIA), [HIJA_A]);
    // Y una lista ENTERA de ids de fuera no deja la pantalla en blanco: cae en
    // todas las alcanzables. Un `IN ()` devolvería cero filas sin decir por qué,
    // y el caso más común de llegar aquí es un `?cuentas=` rancio, no un ataque.
    assert.deepEqual(laSeleccionDelCrm(["de-fuera", "otra"], FAMILIA), FAMILIA);
});

test("los repetidos y la basura no inflan la lista", () => {
    assert.deepEqual(
        laSeleccionDelCrm([HIJA_A, HIJA_A, "  ", null, undefined], FAMILIA),
        [HIJA_A],
    );
});

test("una cuenta HIJA solo se alcanza a sí misma", () => {
    // Su `alcanzables` es `[propia]`, así que pida lo que pida —incluso la
    // madre y su hermana escritas a mano— sale ella sola. Los vínculos van
    // solo de madre a hija, y eso se cae de aquí sin una condición aparte.
    assert.deepEqual(laSeleccionDelCrm([MADRE, HIJA_B], [HIJA_A]), [HIJA_A]);
    assert.deepEqual(laSeleccionDelCrm(null, [HIJA_A]), [HIJA_A]);
});

/* ────────────────────────────────────────────────────────────────────────────
 * El ALCANCE va hacia abajo. La fuga: Yair, administrador de Verzay | Atencion
 * —una cuenta INTERMEDIA—, veía las llamadas de Carlos Arcos, que está POR
 * ENCIMA. Antes el alcance era «la raíz del componente lo ve todo», con la raíz
 * sacada de un recuento de votos; ese recuento lo gana una intermedia en cuanto
 * vincula a tantas como su madre, o a su madre de vuelta.
 * ──────────────────────────────────────────────────────────────────────────── */
const CARLOS = "cm842kthc0000qd2l66nbnytv"; // super admin, arriba de todo
const ATENCION = "3c823f21-00d2-4c88-9f88-099495f97931"; // id MENOR: gana los empates
const VENTAS = "cm84mjtp50000l6soenaosi2z";
const NOTIF = "f7740a22-4149-4a90-a51c-a460cde2a7c7";

/** El árbol de producción, leído de `linked_accounts` el 2026-09-22. */
const ARBOL = [
    { de: CARLOS, a: ATENCION },
    { de: CARLOS, a: VENTAS },
    { de: CARLOS, a: NOTIF },
    { de: ATENCION, a: VENTAS },
];

/** Una malla que ya ha existido: enlaces de vuelta y entre hermanas. */
const MALLA = [
    ...ARBOL,
    { de: ATENCION, a: CARLOS }, // de vuelta
    { de: ATENCION, a: NOTIF }, // entre hermanas
    { de: VENTAS, a: CARLOS }, // de vuelta
];

/** Lo que había, literal: manda quien más votos tiene, a igualdad el id menor,
 *  y esa raíz ve el componente entero; las demás, solo lo suyo. */
function elAlcanceDeAntes(propia, cuentas, enlaces) {
    const votos = new Map(cuentas.map((c) => [c, 0]));
    const vistos = new Set();
    for (const { de, a } of enlaces) {
        if (vistos.has(`${de}>${a}`)) continue;
        vistos.add(`${de}>${a}`);
        votos.set(de, (votos.get(de) ?? 0) + 1);
    }
    const ordenadas = [...cuentas].sort();
    let raiz = ordenadas[0];
    for (const c of ordenadas) if (votos.get(c) > votos.get(raiz)) raiz = c;
    return raiz === propia ? cuentas : [propia];
}

const FAMILIA_VERZAY = [CARLOS, ATENCION, VENTAS, NOTIF];

test("Atencion ve lo suyo y a Ventas, NUNCA a Carlos ni a su hermana", () => {
    if (ROTO) {
        // EL FALLO: en la malla la intermedia gana el recuento (3 votos contra
        // 3 de Carlos, y su id es menor) y pasa a ver hacia arriba.
        const antes = elAlcanceDeAntes(ATENCION, FAMILIA_VERZAY, MALLA);
        assert.ok(antes.includes(CARLOS), "antes, Atencion veia a Carlos");
        return;
    }
    assert.deepEqual(lasCuentasQueCuelganDe(ATENCION, ARBOL), [ATENCION, VENTAS]);
    // En la malla, Carlos se cae —también alcanza a Atencion— aunque haya un
    // enlace de vuelta; Notif sí cuelga de Atencion ahí.
    const enLaMalla = lasCuentasQueCuelganDe(ATENCION, MALLA);
    assert.ok(!enLaMalla.includes(CARLOS));
    assert.equal(enLaMalla[0], ATENCION);
});

test("Carlos, arriba del todo, alcanza a las cuatro", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    assert.deepEqual(
        new Set(lasCuentasQueCuelganDe(CARLOS, ARBOL)),
        new Set(FAMILIA_VERZAY),
    );
});

test("una hoja —Ventas, Notif— solo se ve a sí misma", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    assert.deepEqual(lasCuentasQueCuelganDe(VENTAS, ARBOL), [VENTAS]);
    assert.deepEqual(lasCuentasQueCuelganDe(NOTIF, ARBOL), [NOTIF]);
    // Con un enlace de vuelta a la madre, la hoja SIGUE sin verla.
    assert.deepEqual(lasCuentasQueCuelganDe(VENTAS, MALLA), [VENTAS]);
});

test("una pareja recíproca se anula: ninguna ve a la otra", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    const par = [{ de: "a", a: "b" }, { de: "b", a: "a" }];
    assert.deepEqual(lasCuentasQueCuelganDe("a", par), ["a"]);
    assert.deepEqual(lasCuentasQueCuelganDe("b", par), ["b"]);
});

test("baja varios niveles, y los enlaces rotos no cuentan", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    const cadena = [{ de: "a", a: "b" }, { de: "b", a: "c" }, { de: "", a: "x" }, { de: "c", a: "c" }];
    assert.deepEqual(lasCuentasQueCuelganDe("a", cadena), ["a", "b", "c"]);
    assert.deepEqual(lasCuentasQueCuelganDe("b", cadena), ["b", "c"]);
    assert.deepEqual(lasCuentasQueCuelganDe("", cadena), []);
});

test("con una sola cuenta elegida la pantalla NO va unificada", () => {
    assert.equal(elCrmVaUnificado([MADRE]), false);
    assert.equal(elCrmVaUnificado([]), false);
    assert.equal(elCrmVaUnificado([MADRE, HIJA_A]), true);
});

test("sin dueño una fila NO es ajena", () => {
    // Se pintaría un candado sobre una fila perfectamente editable.
    assert.equal(esDeOtraCuentaDelCrm(null, MADRE), false);
    assert.equal(esDeOtraCuentaDelCrm("", MADRE), false);
    assert.equal(esDeOtraCuentaDelCrm(MADRE, MADRE), false);
    assert.equal(esDeOtraCuentaDelCrm(HIJA_A, MADRE), true);
});

test("el tope CRECE con las cuentas, y tiene techo", () => {
    assert.equal(elTopeDelCrm(200, 1), 200);
    assert.equal(elTopeDelCrm(200, 3), 600);
    // Sin esto, unificar tres cuentas haría que cada una enseñara un tercio de
    // lo que enseña sola —van ordenadas por fecha, así que se intercalan— y
    // unificar se vería como perder filas.
    assert.ok(elTopeDelCrm(200, 3) > elTopeDelCrm(200, 1));
    assert.equal(elTopeDelCrm(200, 50), 200 * TECHO_DE_CUENTAS_EN_UN_TOPE);
    // Nunca cero: una lista con `take: 0` sale vacía y se lee como que no hay nada.
    assert.ok(elTopeDelCrm(0, 0) >= 1);
});

test("los nombres se indexan por id", () => {
    const nombres = nombresDeLasCuentas([
        { id: MADRE, nombre: "Grupo Verzay", moneda: "COP", esLaPropia: true },
        { id: HIJA_A, nombre: "Verzay | Ventas", moneda: "COP", esLaPropia: false },
    ]);
    assert.equal(nombres[MADRE], "Grupo Verzay");
    assert.equal(nombres[HIJA_A], "Verzay | Ventas");
    assert.equal(nombres["no-esta"], undefined);
});
