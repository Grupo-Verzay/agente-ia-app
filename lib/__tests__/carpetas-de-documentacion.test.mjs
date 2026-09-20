/**
 * El invariante que este banco protege, en una línea:
 *
 *   **Ningún espacio puede desaparecer del árbol por culpa de su carpeta.**
 *
 * De ahí salen los casos de abajo. Una carpeta puede faltar por dos caminos
 * perfectamente normales —se borró (y borrarla NO borra sus espacios, que es el
 * encargo) o es de otra cuenta— y en los dos el espacio tiene que salir
 * **suelto**, a la vista. Esconderlo hasta que aparezca su carpeta sería
 * documentación perdida sin que nadie la haya borrado, y eso no se lee como un
 * fallo: se lee como que la App perdió lo que había dentro.
 *
 * Lo segundo que se prueba es que `agruparElArbol` y `laColumnaDelEspacio`
 * **dicen lo mismo**. Si discreparan, el arrastre creería que un espacio vive
 * en una columna que no se pinta en ninguna parte y se rendiría en silencio —o
 * sea, «el espacio no se queda donde lo dejo».
 *
 * Cómo compilar lo que importa (sale en `.compilado/`, que está en .gitignore):
 *
 *   npx esbuild lib/carpetas-de-documentacion.ts --format=esm \
 *       --outdir=lib/__tests__/.compilado
 */
import test from "node:test";
import assert from "node:assert/strict";

const { SUELTOS, agruparElArbol, comoNombreDeCarpeta, laColumnaDelEspacio } = await import(
    "./.compilado/carpetas-de-documentacion.js"
);

const ROTO = process.env.MODO === "roto";

/**
 * La forma ingenua, escrita aquí a propósito: repartir con un `Map` y **quedarse
 * solo con lo que tiene carpeta conocida**.
 *
 * Es lo que sale solo al escribir esto —un `for` sobre las carpetas metiendo
 * dentro lo que le toca— y su fallo no se ve: los espacios cuya carpeta no
 * está no van a ninguna parte. `MODO=roto` la mete en su sitio y **afirma la
 * desaparición**, que es lo único que demuestra que los casos de abajo ejercen
 * algo.
 */
function comoSeHariaMal({ carpetas, espacios, idDelEspacio, enCarpeta }) {
    const porCarpeta = new Map(carpetas.map((c) => [c.id, []]));
    const sueltos = [];
    for (const espacio of espacios) {
        const carpetaId = enCarpeta[idDelEspacio(espacio)];
        if (!carpetaId) sueltos.push(espacio);
        else porCarpeta.get(carpetaId)?.push(espacio);
    }
    return {
        carpetas: carpetas.map((c) => ({ carpeta: c, espacios: porCarpeta.get(c.id) ?? [] })),
        sueltos,
    };
}

const repartir = ROTO ? comoSeHariaMal : agruparElArbol;

/** Lo que solo cumple la buena: en el modo roto se salta con su motivo. */
const SOLO_LA_BUENA = { skip: ROTO && "esto solo lo cumple `agruparElArbol`" };

/* ───────────────────────────── La semilla ──────────────────────────────── */

const carpeta = (id, nombre = id) => ({
    id,
    cuentaId: "cuenta",
    nombre,
    creadoPorId: "p",
    creadoPorNombre: null,
    creadoEn: new Date(0),
    actualizadoEn: new Date(0),
});

const espacio = (id) => ({ id });

/** Como lo llama la pantalla: los espacios son `{ espacio: {...} }`. */
function agrupar(carpetas, espacios, enCarpeta) {
    return repartir({
        carpetas,
        espacios,
        idDelEspacio: (e) => e.id,
        enCarpeta,
    });
}

const nombres = (lista) => lista.map((e) => e.id);

/* ─────────────────────────── Repartir, y nada más ───────────────────────── */

test("sin ninguna carpeta, el árbol sale TAL CUAL llegó", () => {
    // Esto es lo que hace que subir la capa de carpetas no cambiara ningún
    // árbol hasta que alguien creó la primera.
    const espacios = [espacio("a"), espacio("b"), espacio("c")];
    const r = agrupar([], espacios, {});
    assert.deepEqual(r.carpetas, []);
    assert.deepEqual(nombres(r.sueltos), ["a", "b", "c"]);
});

test("cada espacio cae en su carpeta, y el resto queda suelto", () => {
    const r = agrupar(
        [carpeta("ops"), carpeta("ventas")],
        [espacio("a"), espacio("b"), espacio("c"), espacio("d")],
        { a: "ops", c: "ventas", d: "ops" },
    );

    assert.deepEqual(
        r.carpetas.map((c) => [c.carpeta.id, nombres(c.espacios)]),
        [
            ["ops", ["a", "d"]],
            ["ventas", ["c"]],
        ],
    );
    assert.deepEqual(nombres(r.sueltos), ["b"]);
});

test("el orden de dentro es el que traía la lista, no el del mapa", () => {
    // El mapa es un objeto y su orden de claves no significa nada. Lo que
    // manda es la lista, que llega ya colocada por `orden_en_tablero`.
    const r = agrupar([carpeta("ops")], [espacio("z"), espacio("m"), espacio("a")], {
        a: "ops",
        m: "ops",
        z: "ops",
    });
    assert.deepEqual(nombres(r.carpetas[0].espacios), ["z", "m", "a"]);
});

test("una carpeta vacía sale igual, con su lista vacía", () => {
    // Si se cayera de la lista, una carpeta recién creada no se vería y
    // parecería que no se creó.
    const r = agrupar([carpeta("nueva")], [espacio("a")], {});
    assert.equal(r.carpetas.length, 1);
    assert.deepEqual(r.carpetas[0].espacios, []);
    assert.deepEqual(nombres(r.sueltos), ["a"]);
});

/* ───────────── Una carpeta que no está deja su espacio SUELTO ───────────── */

test("carpeta BORRADA: sus espacios quedan sueltos, no desaparecen", () => {
    // El encargo literal: «eliminar una carpeta no debe eliminar los espacios
    // que contiene». Del lado de la base el borrado se lleva las filas de
    // pertenencia; esto cubre el instante en que todavía no se ha refrescado.
    const antes = agrupar([carpeta("ops")], [espacio("a"), espacio("b")], { a: "ops" });
    assert.deepEqual(nombres(antes.carpetas[0].espacios), ["a"]);

    const despues = agrupar([], [espacio("a"), espacio("b")], { a: "ops" });
    if (ROTO) {
        // El fallo, afirmado: «a» se esfuma. No sale en ninguna carpeta —no
        // queda ninguna— y tampoco entre los sueltos.
        assert.deepEqual(nombres(despues.sueltos), ["b"]);
        return;
    }
    assert.deepEqual(nombres(despues.sueltos), ["a", "b"], "ninguno se pierde");
});

test("carpeta de OTRA cuenta, o un id rancio: suelto, nunca escondido", () => {
    const r = agrupar([carpeta("ops")], [espacio("a"), espacio("b")], {
        a: "ops",
        b: "de-otra-cuenta",
    });
    assert.deepEqual(nombres(r.carpetas[0].espacios), ["a"]);
    if (ROTO) {
        assert.deepEqual(nombres(r.sueltos), [], "el roto lo esconde");
        return;
    }
    assert.deepEqual(nombres(r.sueltos), ["b"]);
});

test("NO se pierde ni se duplica ningún espacio, en ninguna combinación", SOLO_LA_BUENA, () => {
    // El invariante de arriba, ejercido a lo bruto: lo que entra es lo que sale.
    const espacios = ["a", "b", "c", "d", "e"].map(espacio);
    const combinaciones = [
        {},
        { a: "ops" },
        { a: "ops", b: "ops", c: "ops", d: "ops", e: "ops" },
        { a: "no-existe", b: "ops", c: "no-existe" },
        { a: "ops", b: "ventas", c: "ops", d: "ventas", e: "fantasma" },
    ];
    for (const enCarpeta of combinaciones) {
        const r = agrupar([carpeta("ops"), carpeta("ventas")], espacios, enCarpeta);
        const salidos = [...r.carpetas.flatMap((c) => nombres(c.espacios)), ...nombres(r.sueltos)];
        assert.deepEqual(
            salidos.slice().sort(),
            ["a", "b", "c", "d", "e"],
            `con ${JSON.stringify(enCarpeta)}`,
        );
    }
});

/* ─────────── Agrupar y la columna del arrastre dicen lo MISMO ───────────── */

test("encadenadas: la columna que dice el arrastre es donde de verdad se pinta", SOLO_LA_BUENA, () => {
    const carpetas = [carpeta("ops"), carpeta("ventas")];
    const enCarpeta = { a: "ops", b: "fantasma", c: "ventas" };
    const espacios = [espacio("a"), espacio("b"), espacio("c"), espacio("d")];

    const r = agrupar(carpetas, espacios, enCarpeta);

    // Dónde está pintado cada uno, leído del resultado.
    const donde = {};
    for (const c of r.carpetas) for (const e of c.espacios) donde[e.id] = c.carpeta.id;
    for (const e of r.sueltos) donde[e.id] = SUELTOS;

    for (const e of espacios) {
        assert.equal(
            laColumnaDelEspacio(e.id, enCarpeta, carpetas),
            donde[e.id],
            `«${e.id}»: el arrastre y el pintado tienen que coincidir`,
        );
    }
});

/* ────────────────────────────── El nombre ───────────────────────────────── */

test("el nombre se sanea en el SERVIDOR, y lo vacío no vale", () => {
    assert.equal(comoNombreDeCarpeta("  Operaciones  "), "Operaciones");
    // Los saltos se APLASTAN, no cortan: quien pega dos líneas quiere las dos.
    assert.equal(comoNombreDeCarpeta("Clientes\ngrandes"), "Clientes grandes");
    for (const nada of ["", "   ", "\n", 7, null, undefined, {}]) {
        assert.equal(comoNombreDeCarpeta(nada), null, `con ${JSON.stringify(nada)}`);
    }
});

test("un nombre kilométrico se recorta, no rompe la barra lateral", () => {
    const largo = comoNombreDeCarpeta("x".repeat(500));
    assert.equal(largo.length, 80);
});
