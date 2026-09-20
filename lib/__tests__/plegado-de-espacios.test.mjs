/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Una preferencia de vista no puede tumbar la pantalla, ni esconder nada
 *   que no se haya plegado a mano.**
 *
 * De donde sale: plegar espacios es comodidad, y lo que se paga por ella tiene
 * que ser cero. Dos formas de romperlo, y las dos son mudas:
 *
 * - `localStorage` **tira una excepcion** en una ventana privada o con las
 *   cookies de sitio bloqueadas. Sin el `try`, esa excepcion sale en la primera
 *   carga y el arbol entero se queda sin pintar.
 * - Un dato rancio o de otra forma haria desaparecer espacios del arbol. Todo
 *   lo que no se entienda cae en «nada plegado»: se ve de mas, nunca de menos.
 *
 * Y la tercera, que tiene su propio caso porque es la que casi se cuela: con el
 * separador `_` dos personas del mismo navegador comparten llave.
 *
 * Aqui corren las funciones REALES de `lib/plegado-de-espacios.ts`, que no
 * importa nada.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx esbuild lib/plegado-de-espacios.ts --format=esm \
 *       --outdir=lib/__tests__/.compilado
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    llaveDeLosPlegados,
    losEspaciosPlegados,
    guardarLosEspaciosPlegados,
    alternarElEspacio,
    desplegarElEspacio,
} = await import("./.compilado/plegado-de-espacios.js");

/* ─────────────────── Un `localStorage` de mentira ──────────────────────── */

/** Uno que funciona. `romper` lo convierte en el de una ventana privada. */
function montarElAlmacen({ romper = false } = {}) {
    const datos = new Map();
    globalThis.localStorage = {
        getItem(k) {
            if (romper) throw new Error("acceso denegado al almacenamiento");
            return datos.has(k) ? datos.get(k) : null;
        },
        setItem(k, v) {
            if (romper) throw new Error("acceso denegado al almacenamiento");
            datos.set(k, String(v));
        },
        removeItem(k) {
            if (romper) throw new Error("acceso denegado al almacenamiento");
            datos.delete(k);
        },
    };
    return datos;
}

/* ──────────────────────────── La llave ──────────────────────────────────── */

test("la llave lleva la CUENTA y la PERSONA, y las dos cambian el resultado", () => {
    const base = llaveDeLosPlegados("cuenta-1", "persona-1");
    assert.notEqual(base, llaveDeLosPlegados("cuenta-2", "persona-1"));
    assert.notEqual(base, llaveDeLosPlegados("cuenta-1", "persona-2"));
});

test("dos personas en el mismo navegador NO se pisan", () => {
    montarElAlmacen();
    guardarLosEspaciosPlegados("c", "yair", ["e1"]);
    guardarLosEspaciosPlegados("c", "sofia", ["e2", "e3"]);

    assert.deepEqual([...losEspaciosPlegados("c", "yair")], ["e1"]);
    assert.deepEqual([...losEspaciosPlegados("c", "sofia")].sort(), ["e2", "e3"]);
});

test("modo ROTO: con `_` de separador las dos llaves COLISIONAN", () => {
    // La forma vieja, escrita aqui a proposito. Sin este caso no se sabe si el
    // `::` de al lado arregla algo o solo es otra forma de escribirlo.
    const vieja = (cuentaId, personaId) => `documentacion_espacios_plegados_${cuentaId}_${personaId}`;
    assert.equal(vieja("a", "b_c"), vieja("a_b", "c"));

    // Y con la de verdad, no.
    assert.notEqual(llaveDeLosPlegados("a", "b_c"), llaveDeLosPlegados("a_b", "c"));
});

/* ───────────────────────── Leer y guardar ───────────────────────────────── */

test("sin nada guardado no hay nada plegado: un espacio nuevo nace DESPLEGADO", () => {
    montarElAlmacen();
    const plegados = losEspaciosPlegados("c", "p");
    assert.equal(plegados.size, 0);
    // Y por eso un espacio que nadie ha tocado sale abierto sin sembrar nada.
    assert.equal(plegados.has("un-espacio-cualquiera"), false);
});

test("plegar uno no pliega a los demas", () => {
    montarElAlmacen();
    guardarLosEspaciosPlegados("c", "p", ["e1"]);
    const plegados = losEspaciosPlegados("c", "p");
    assert.equal(plegados.has("e1"), true);
    assert.equal(plegados.has("e2"), false);
});

test("con el conjunto vacio se BORRA la entrada, no se escribe `[]`", () => {
    const datos = montarElAlmacen();
    const llave = llaveDeLosPlegados("c", "p");

    guardarLosEspaciosPlegados("c", "p", ["e1"]);
    assert.equal(datos.has(llave), true);

    guardarLosEspaciosPlegados("c", "p", []);
    assert.equal(datos.has(llave), false);

    // Y de ahi sale la trampa que hay que conocer del lado de la pantalla: un
    // efecto sobre el conjunto correria TAMBIEN en el montaje, con el conjunto
    // vacio del arranque, y borraria la preferencia guardada antes de que la
    // hidratacion llegara a leerla. Se guarda solo donde de verdad cambia algo.
    guardarLosEspaciosPlegados("c", "p", ["e1", "e2"]);
    guardarLosEspaciosPlegados("c", "p", new Set());
    assert.equal(losEspaciosPlegados("c", "p").size, 0);
});

/* ────────────────── Lo que no se entiende: DESPLEGADO ───────────────────── */

test("un valor rancio que no es una lista se lee como NADA plegado", () => {
    const datos = montarElAlmacen();
    for (const basura of ['{"e1":true}', '"e1"', "17", "no es json", "null"]) {
        datos.set(llaveDeLosPlegados("c", "p"), basura);
        assert.equal(losEspaciosPlegados("c", "p").size, 0, `con ${basura}`);
    }
});

test("de una lista se quedan solo las cadenas con algo dentro", () => {
    const datos = montarElAlmacen();
    datos.set(llaveDeLosPlegados("c", "p"), JSON.stringify(["e1", "", "   ", 7, null, "e2"]));
    assert.deepEqual([...losEspaciosPlegados("c", "p")].sort(), ["e1", "e2"]);
});

test("un `localStorage` que LANZA no rompe nada, ni al leer ni al guardar", () => {
    montarElAlmacen({ romper: true });
    // La ventana privada: se lee vacio, o sea todo desplegado.
    assert.equal(losEspaciosPlegados("c", "p").size, 0);
    // Y guardar no revienta la pantalla: simplemente no se recuerda.
    assert.doesNotThrow(() => guardarLosEspaciosPlegados("c", "p", ["e1"]));
    assert.doesNotThrow(() => guardarLosEspaciosPlegados("c", "p", []));
});

/* ─────────────────────── Alternar y desplegar ───────────────────────────── */

test("alternar no toca el conjunto que recibe", () => {
    const antes = new Set(["e1"]);
    const plegado = alternarElEspacio(antes, "e2");
    const desplegado = alternarElEspacio(antes, "e1");

    assert.deepEqual([...antes], ["e1"], "el de dentro no se toca");
    assert.deepEqual([...plegado].sort(), ["e1", "e2"]);
    assert.deepEqual([...desplegado], []);
});

test("desplegar devuelve `null` cuando no habia nada que desplegar", () => {
    // Es lo que hace utilizable «el espacio del documento abierto se despliega
    // solo»: se llama cada vez que cambia el documento abierto, y casi siempre
    // su espacio ya esta desplegado. Sin el `null` se escribiria en
    // `localStorage` y se repintaria el arbol entero en cada clic, para nada.
    assert.equal(desplegarElEspacio(new Set(["e1"]), "e2"), null);
    assert.equal(desplegarElEspacio(new Set(), "e1"), null);
    assert.equal(desplegarElEspacio(new Set(["e1"]), ""), null);

    const nuevo = desplegarElEspacio(new Set(["e1", "e2"]), "e1");
    assert.deepEqual([...nuevo], ["e2"]);
});

test("encadenadas: se pliega, se guarda, se relee y sigue plegado", () => {
    montarElAlmacen();
    // Lo que de verdad hace la pantalla, de punta a punta.
    let plegados = losEspaciosPlegados("c", "p");
    plegados = alternarElEspacio(plegados, "ventas");
    guardarLosEspaciosPlegados("c", "p", plegados);

    // Otra carga de la pagina.
    const recargado = losEspaciosPlegados("c", "p");
    assert.equal(recargado.has("ventas"), true);

    // Y abrir un documento de ese espacio lo despliega solo, tambien al
    // recargar: es el mismo conjunto, no una rama aparte.
    const trasAbrir = desplegarElEspacio(recargado, "ventas");
    assert.notEqual(trasAbrir, null);
    guardarLosEspaciosPlegados("c", "p", trasAbrir);
    assert.equal(losEspaciosPlegados("c", "p").has("ventas"), false);
});
