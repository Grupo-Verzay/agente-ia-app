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
 * Al subir la capa de CARPETAS este modulo paso a servir a las dos —una sola
 * funcion con un discriminante, no dos copias— y de ahi salen dos casos mas:
 * que la llave de los espacios **no cambio ni un caracter** (si hubiera
 * cambiado, todo el mundo habria perdido de golpe lo que tenia plegado el dia
 * del despliegue) y que las dos capas no se pisan entre ellas.
 *
 * Aqui corren las funciones REALES de `lib/plegado-del-arbol.ts`, que no
 * importa nada.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx esbuild lib/plegado-del-arbol.ts --format=esm \
 *       --outdir=lib/__tests__/.compilado
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
    llaveDeLoPlegado,
    loPlegado,
    guardarLoPlegado,
    alternarEnElArbol,
    desplegarEnElArbol,
} = await import("./.compilado/plegado-del-arbol.js");

/** La capa que este banco ejerce en casi todos sus casos. */
const QUE = "espacios";

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
    const base = llaveDeLoPlegado(QUE, "cuenta-1", "persona-1");
    assert.notEqual(base, llaveDeLoPlegado(QUE, "cuenta-2", "persona-1"));
    assert.notEqual(base, llaveDeLoPlegado(QUE, "cuenta-1", "persona-2"));
});

test("dos personas en el mismo navegador NO se pisan", () => {
    montarElAlmacen();
    guardarLoPlegado(QUE, "c", "yair", ["e1"]);
    guardarLoPlegado(QUE, "c", "sofia", ["e2", "e3"]);

    assert.deepEqual([...loPlegado(QUE, "c", "yair")], ["e1"]);
    assert.deepEqual([...loPlegado(QUE, "c", "sofia")].sort(), ["e2", "e3"]);
});

test("modo ROTO: con `_` de separador las dos llaves COLISIONAN", () => {
    // La forma vieja, escrita aqui a proposito. Sin este caso no se sabe si el
    // `::` de al lado arregla algo o solo es otra forma de escribirlo.
    const vieja = (cuentaId, personaId) => `documentacion_espacios_plegados_${cuentaId}_${personaId}`;
    assert.equal(vieja("a", "b_c"), vieja("a_b", "c"));

    // Y con la de verdad, no.
    assert.notEqual(llaveDeLoPlegado(QUE, "a", "b_c"), llaveDeLoPlegado(QUE, "a_b", "c"));
});

test("la llave de los ESPACIOS no cambio al subir las carpetas", () => {
    // Escrita literal a proposito. Si esto cambiara, todo el mundo perderia de
    // golpe lo que tenia plegado el dia del despliegue — sin error, sin aviso,
    // y sin forma de relacionarlo con el cambio.
    assert.equal(
        llaveDeLoPlegado("espacios", "cuenta-1", "persona-1"),
        "documentacion_espacios_plegados_cuenta-1::persona-1",
    );
});

test("las dos capas NO se pisan: la misma cuenta, la misma persona, dos llaves", () => {
    const datos = montarElAlmacen();
    guardarLoPlegado("espacios", "c", "p", ["ventas"]);
    guardarLoPlegado("carpetas", "c", "p", ["operaciones"]);

    assert.equal(datos.size, 2, "dos entradas distintas");
    assert.deepEqual([...loPlegado("espacios", "c", "p")], ["ventas"]);
    assert.deepEqual([...loPlegado("carpetas", "c", "p")], ["operaciones"]);

    // Y desplegarlo todo en una capa no toca la otra.
    guardarLoPlegado("espacios", "c", "p", []);
    assert.equal(loPlegado("espacios", "c", "p").size, 0);
    assert.deepEqual([...loPlegado("carpetas", "c", "p")], ["operaciones"]);
});

/* ───────────────────────── Leer y guardar ───────────────────────────────── */

test("sin nada guardado no hay nada plegado: un espacio nuevo nace DESPLEGADO", () => {
    montarElAlmacen();
    const plegados = loPlegado(QUE, "c", "p");
    assert.equal(plegados.size, 0);
    // Y por eso un espacio que nadie ha tocado sale abierto sin sembrar nada.
    assert.equal(plegados.has("un-espacio-cualquiera"), false);
});

test("plegar uno no pliega a los demas", () => {
    montarElAlmacen();
    guardarLoPlegado(QUE, "c", "p", ["e1"]);
    const plegados = loPlegado(QUE, "c", "p");
    assert.equal(plegados.has("e1"), true);
    assert.equal(plegados.has("e2"), false);
});

test("con el conjunto vacio se BORRA la entrada, no se escribe `[]`", () => {
    const datos = montarElAlmacen();
    const llave = llaveDeLoPlegado(QUE, "c", "p");

    guardarLoPlegado(QUE, "c", "p", ["e1"]);
    assert.equal(datos.has(llave), true);

    guardarLoPlegado(QUE, "c", "p", []);
    assert.equal(datos.has(llave), false);

    // Y de ahi sale la trampa que hay que conocer del lado de la pantalla: un
    // efecto sobre el conjunto correria TAMBIEN en el montaje, con el conjunto
    // vacio del arranque, y borraria la preferencia guardada antes de que la
    // hidratacion llegara a leerla. Se guarda solo donde de verdad cambia algo.
    guardarLoPlegado(QUE, "c", "p", ["e1", "e2"]);
    guardarLoPlegado(QUE, "c", "p", new Set());
    assert.equal(loPlegado(QUE, "c", "p").size, 0);
});

/* ────────────────── Lo que no se entiende: DESPLEGADO ───────────────────── */

test("un valor rancio que no es una lista se lee como NADA plegado", () => {
    const datos = montarElAlmacen();
    for (const basura of ['{"e1":true}', '"e1"', "17", "no es json", "null"]) {
        datos.set(llaveDeLoPlegado(QUE, "c", "p"), basura);
        assert.equal(loPlegado(QUE, "c", "p").size, 0, `con ${basura}`);
    }
});

test("de una lista se quedan solo las cadenas con algo dentro", () => {
    const datos = montarElAlmacen();
    datos.set(llaveDeLoPlegado(QUE, "c", "p"), JSON.stringify(["e1", "", "   ", 7, null, "e2"]));
    assert.deepEqual([...loPlegado(QUE, "c", "p")].sort(), ["e1", "e2"]);
});

test("un `localStorage` que LANZA no rompe nada, ni al leer ni al guardar", () => {
    montarElAlmacen({ romper: true });
    // La ventana privada: se lee vacio, o sea todo desplegado.
    assert.equal(loPlegado(QUE, "c", "p").size, 0);
    // Y guardar no revienta la pantalla: simplemente no se recuerda.
    assert.doesNotThrow(() => guardarLoPlegado(QUE, "c", "p", ["e1"]));
    assert.doesNotThrow(() => guardarLoPlegado(QUE, "c", "p", []));
});

/* ─────────────────────── Alternar y desplegar ───────────────────────────── */

test("alternar no toca el conjunto que recibe", () => {
    const antes = new Set(["e1"]);
    const plegado = alternarEnElArbol(antes, "e2");
    const desplegado = alternarEnElArbol(antes, "e1");

    assert.deepEqual([...antes], ["e1"], "el de dentro no se toca");
    assert.deepEqual([...plegado].sort(), ["e1", "e2"]);
    assert.deepEqual([...desplegado], []);
});

test("desplegar devuelve `null` cuando no habia nada que desplegar", () => {
    // Es lo que hace utilizable «el espacio del documento abierto se despliega
    // solo»: se llama cada vez que cambia el documento abierto, y casi siempre
    // su espacio ya esta desplegado. Sin el `null` se escribiria en
    // `localStorage` y se repintaria el arbol entero en cada clic, para nada.
    assert.equal(desplegarEnElArbol(new Set(["e1"]), "e2"), null);
    assert.equal(desplegarEnElArbol(new Set(), "e1"), null);
    assert.equal(desplegarEnElArbol(new Set(["e1"]), ""), null);

    const nuevo = desplegarEnElArbol(new Set(["e1", "e2"]), "e1");
    assert.deepEqual([...nuevo], ["e2"]);
});

test("encadenadas: se pliega, se guarda, se relee y sigue plegado", () => {
    montarElAlmacen();
    // Lo que de verdad hace la pantalla, de punta a punta.
    let plegados = loPlegado(QUE, "c", "p");
    plegados = alternarEnElArbol(plegados, "ventas");
    guardarLoPlegado(QUE, "c", "p", plegados);

    // Otra carga de la pagina.
    const recargado = loPlegado(QUE, "c", "p");
    assert.equal(recargado.has("ventas"), true);

    // Y abrir un documento de ese espacio lo despliega solo, tambien al
    // recargar: es el mismo conjunto, no una rama aparte.
    const trasAbrir = desplegarEnElArbol(recargado, "ventas");
    assert.notEqual(trasAbrir, null);
    guardarLoPlegado(QUE, "c", "p", trasAbrir);
    assert.equal(loPlegado(QUE, "c", "p").has("ventas"), false);
});
