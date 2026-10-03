/**
 * El invariante que este banco protege, en una línea:
 *
 *   **Pulsar un mes —o un año— del resumen anual no cambia de cuenta.**
 *
 * De dónde sale: Finanzas deja elegir qué cuentas de la familia se miran, y la
 * elección viaja en la URL (`?cuentas=`). El selector QUITA el parámetro solo
 * al volver a la cuenta propia y sola, así que los enlaces de la pantalla lo
 * tienen que llevar en cualquier otro caso. Los del resumen anual lo llevaban
 * solo «consolidando» —más de una cuenta— y con UNA cuenta ajena elegida
 * salían sin él: el servidor volvía a la cuenta propia y la pantalla cambiaba
 * de cuenta al pulsar un mes.
 *
 * Y la otra cara del mismo fallo, en las listas: con UNA cuenta ajena elegida
 * no se consolida, así que sus filas se ofrecían para editar —y la acción de
 * detrás no las encuentra— y «Eliminar todas» seguía ahí, borrando lo de la
 * cuenta propia mientras se miraba la de otra.
 *
 * Tres mitades:
 *
 *   1. Las reglas puras (`laSeleccionQueViajaEnElEnlace`, `elEnlaceDelResumen`).
 *   2. **La ida y vuelta**: para cada selección posible se escribe la URL como
 *      la escribe el selector, se resuelve como la resuelve el servidor, se
 *      arma el enlace de un mes y se vuelve a resolver. Tiene que salir la
 *      MISMA selección. Probar cada lado por su cuenta es justo lo que dejó
 *      pasar esto: el selector y el servidor estaban bien.
 *   3. Un barrido del código: el resumen y las tres listas usan la regla y no
 *      vuelven a preguntar `consolidando` para decidir «¿es lo de siempre?».
 *
 * `MODO=roto` lee el resumen y las listas de ANTES_REF —pinchado a un commit,
 * nunca `origin/main`— y AFIRMA el fallo: el enlace de un mes de una cuenta
 * hija sola vuelve a la cuenta propia, sus filas se ofrecen para editar y
 * «Eliminar todas» está ahí.
 *
 * Se corre con `scripts/banco-cuenta-del-resumen.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COMPILADO = path.join(RAIZ, "lib/__tests__/.compilado/cuenta-del-resumen");
const MODO = process.env.MODO ?? "bueno";
const ANTES_REF = process.env.ANTES_REF ?? "fd21c8f";

const familia = await import(path.join(COMPILADO, "finanzas-de-la-familia.mjs"));
const { laSeleccionQueVale, comoListaDeCuentas } = familia;

const MADRE = "grupo";
const ATENCION = "atencion";
const VENTAS = "ventas";
const FAMILIA = [MADRE, ATENCION, VENTAS];

/** Todas las selecciones que el selector puede dejar puestas. */
const SELECCIONES = [
    [MADRE],
    [ATENCION],
    [VENTAS],
    [MADRE, ATENCION],
    [ATENCION, VENTAS],
    [MADRE, ATENCION, VENTAS],
];

const RUTA_PAGINA = "app/(root)/(protected)/dashboard/finance/page.tsx";
const LISTAS = [
    "app/(root)/(protected)/dashboard/finance/sales/_components/MainSales.tsx",
    "app/(root)/(protected)/dashboard/finance/expenses/_components/MainExpenses.tsx",
    "app/(root)/(protected)/dashboard/finance/_contacts/MainFinanceContacts.tsx",
];
/** Las dos listas que ofrecen «Eliminar todas». Contactos no lo tiene. */
const CON_ELIMINAR_TODAS = LISTAS.slice(0, 2);

const leer = (ruta) =>
    MODO === "roto"
        ? execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, encoding: "utf8" })
        : readFileSync(path.join(RAIZ, ruta), "utf8");

/** Lo que pide el navegador después de escribir la URL, como lo lee el servidor. */
const loQueResuelveElServidor = (url) => {
    const cuentas = new URL(url, "http://x").searchParams.get("cuentas");
    return laSeleccionQueVale(comoListaDeCuentas(cuentas), FAMILIA, MADRE);
};

/**
 * La URL que escribe el selector al elegir `ids`, con su regla de
 * `components/shared/SelectorDeCuentas.tsx` (`porDefecto: 'propia'`): solo
 * QUITA el parámetro al volver a la cuenta propia y sola.
 */
const laUrlDelSelector = (ids) => {
    const params = new URLSearchParams({ month: "2026-03" });
    const soloLaPropia = ids.length === 1 && ids[0] === MADRE;
    if (ids.length === 0 || soloLaPropia) params.delete("cuentas");
    else params.set("cuentas", ids.join(","));
    return `/dashboard/finance?${params.toString()}`;
};

if (MODO !== "roto") {
    const { esSoloLaPropia, laSeleccionQueViajaEnElEnlace } = familia;
    const { elEnlaceDelResumen } = await import(path.join(COMPILADO, "accesos-de-finanzas.mjs"));

    /* ─────────────────────────── 1. Las reglas ─────────────────────────── */

    test("esSoloLaPropia: la propia y sola, nada más", () => {
        assert.equal(esSoloLaPropia([MADRE], MADRE), true);
        assert.equal(esSoloLaPropia([ATENCION], MADRE), false, "una cuenta ajena sola NO es lo de siempre");
        assert.equal(esSoloLaPropia([MADRE, ATENCION], MADRE), false);
        assert.equal(esSoloLaPropia([], MADRE), false);
    });

    test("laSeleccionQueViajaEnElEnlace: solo se calla con la propia y sola", () => {
        assert.equal(laSeleccionQueViajaEnElEnlace([MADRE], MADRE), null);
        assert.equal(laSeleccionQueViajaEnElEnlace([], MADRE), null);
        assert.equal(laSeleccionQueViajaEnElEnlace([ATENCION], MADRE), ATENCION);
        assert.equal(laSeleccionQueViajaEnElEnlace([MADRE, VENTAS], MADRE), `${MADRE},${VENTAS}`);
        assert.equal(laSeleccionQueViajaEnElEnlace([" ", ATENCION], MADRE), ATENCION, "los huecos no viajan");
    });

    test("elEnlaceDelResumen: el resumen, en ese mes y en esas cuentas", () => {
        assert.equal(elEnlaceDelResumen("2026-05", [MADRE], MADRE), "/dashboard/finance?month=2026-05");
        assert.equal(
            elEnlaceDelResumen("2026-05", [ATENCION], MADRE),
            "/dashboard/finance?month=2026-05&cuentas=atencion",
        );
        assert.equal(
            elEnlaceDelResumen("2025-03", [ATENCION, VENTAS], MADRE),
            "/dashboard/finance?month=2025-03&cuentas=atencion,ventas",
        );
    });

    /* ─────────────────────────── 2. Ida y vuelta ───────────────────────── */

    for (const seleccion of SELECCIONES) {
        test(`pulsar un mes deja la MISMA selección: ${seleccion.join(" + ")}`, () => {
            const enLaPantalla = loQueResuelveElServidor(laUrlDelSelector(seleccion));
            assert.deepEqual(enLaPantalla, seleccion, "el selector y el servidor ya coincidían");

            for (const mes of ["2026-01", "2026-05", "2025-03", "2027-03"]) {
                const despues = loQueResuelveElServidor(elEnlaceDelResumen(mes, enLaPantalla, MADRE));
                assert.deepEqual(despues, enLaPantalla, `el mes ${mes} cambió de cuenta`);
            }
        });
    }

    test("con la propia y sola la URL sigue limpia, como la escribe el selector", () => {
        const url = elEnlaceDelResumen("2026-05", [MADRE], MADRE);
        assert.equal(new URL(url, "http://x").searchParams.has("cuentas"), false);
    });

    /* ─────────────────────────── 3. El barrido ─────────────────────────── */

    test("el resumen: los tres enlaces de la rejilla pasan por la regla", () => {
        const pagina = leer(RUTA_PAGINA);
        assert.match(pagina, /elEnlaceDelResumen\(/);
        assert.equal(pagina.includes("cuentasEnElEnlace"), false, "volvió la condición escrita a mano");
        // Ningún enlace al resumen armado a mano: el `?month=` de la rejilla sale
        // de la regla, o un enlace nuevo vuelve a soltar la selección.
        assert.equal(/href=\{`\/dashboard\/finance\?month=/.test(pagina), false);
        const usos = pagina.match(/href=\{enlaceDelMes\(/g) ?? [];
        assert.equal(usos.length, 3, "cada mes y las dos flechas de año");
    });

    for (const ruta of LISTAS) {
        test(`${path.basename(ruta)}: una fila ajena no se toca aunque no se consolide`, () => {
            const fuente = leer(ruta);
            assert.equal(/consolidando\s*&&\s*esDeOtraCuenta/.test(fuente), false);
            assert.match(fuente, /=>\s*esDeOtraCuenta\(fila\.userId, userId\)/);
        });
    }

    for (const ruta of CON_ELIMINAR_TODAS) {
        test(`${path.basename(ruta)}: «Eliminar todas» solo con la cuenta propia y sola`, () => {
            const fuente = leer(ruta);
            assert.match(fuente, /!esSoloLaPropia\(cuentasElegidas, userId\) \|\| rows\.length === 0/);
            assert.equal(/consolidando \|\| rows\.length === 0/.test(fuente), false);
        });
    }
} else {
    /* ─────────────── MODO=roto: el fallo, afirmado sobre ANTES_REF ────────── */

    const REGLA_VIEJA = "consolidando ? `&cuentas=${elegidas.join(',')}` : ''";

    test(`ANTES (${ANTES_REF}): el enlace de un mes de UNA cuenta hija vuelve a la cuenta propia`, () => {
        const pagina = leer(RUTA_PAGINA);
        assert.ok(pagina.includes(REGLA_VIEJA), "el resumen de antes llevaba la condición escrita a mano");
        assert.match(pagina, /const consolidando = elegidas\.length > 1;/);

        // La regla vieja, tal cual estaba escrita, sobre una cuenta hija sola.
        const enLaPantalla = loQueResuelveElServidor(laUrlDelSelector([ATENCION]));
        assert.deepEqual(enLaPantalla, [ATENCION], "al entrar sí se miraba la hija");
        const elegidas = enLaPantalla;
        const consolidando = elegidas.length > 1;
        const cuentasEnElEnlace = consolidando ? `&cuentas=${elegidas.join(",")}` : "";
        const despues = loQueResuelveElServidor(`/dashboard/finance?month=2026-05${cuentasEnElEnlace}`);
        assert.deepEqual(despues, [MADRE], "y pulsar un mes devolvía la pantalla a la cuenta madre");
    });

    for (const ruta of LISTAS) {
        test(`ANTES: ${path.basename(ruta)} ofrecía editar las filas de UNA cuenta ajena`, () => {
            const fuente = leer(ruta);
            assert.match(fuente, /consolidando\s*&&\s*esDeOtraCuenta\(fila\.userId, userId\)/);
            // `consolidando` es falso con una sola cuenta: la fila ajena no se bloqueaba.
            const consolidando = [ATENCION].length > 1;
            assert.equal(consolidando && ATENCION !== MADRE, false);
        });
    }

    for (const ruta of CON_ELIMINAR_TODAS) {
        test(`ANTES: ${path.basename(ruta)} ofrecía «Eliminar todas» mirando UNA cuenta ajena`, () => {
            const fuente = leer(ruta);
            assert.match(fuente, /consolidando \|\| rows\.length === 0/);
            assert.match(fuente, /deleteAll\w+\(userId\)/, "y ese botón borra la cuenta propia");
        });
    }
}
