/**
 * El ORDEN de la barra de una pantalla de lista.
 *
 * La ley está escrita en `components/shared/BarraDeAcciones.tsx` y es una
 * frase: **el buscador primero, después los filtros, y a la derecha las
 * acciones secundarias pegadas al azul de crear con el `⋯` al borde.**
 *
 * ```
 * [buscador] [·· filtros ··················] [secundarias] [+ Nuevo] [⋯]
 *             ^ lo único que se desplaza
 * ```
 *
 * # Por qué hace falta un banco, y no basta con haberlo escrito
 *
 * En `/sessions` la barra salía con las cuatro pastillas de conteo **antes**
 * del buscador y con «Exportar CSV» suelto entre el buscador y el azul. La
 * ley estaba escrita y el componente la cumplía; lo que fallaba es que la
 * pantalla lo metía todo por `children`, que cae ENTERO en el carril del
 * medio. Ahí dentro el orden lo decide el JSX, no la regla.
 *
 * O sea: este fallo **no se ve mirando el componente**, se ve barriendo las
 * treinta y tantas pantallas que lo usan. Es la misma familia que el banco de
 * las guardas de las acciones —*a una hermana se le pasa*— y ha pasado ya con
 * el buscador de Clientes, el de `/crm`, el de Respuestas rápidas y los dos de
 * Datos externos.
 *
 * Así que el banco mira **las dos mitades**:
 *
 *   A. que el componente pinte los cinco huecos en el orden de la ley;
 *   B. que ninguna pantalla meta en el carril lo que no va ahí.
 *
 * Y de paso el comportamiento del #819, que es lo que impide que la barra se
 * parta en dos filas: `min-w-max` en la fila de dentro —no `w-max`— y ninguna
 * barra de desplazamiento escrita a mano; lo que no cabe lo recogen las
 * flechas de `BarraDeslizable`.
 *
 * Correr:  node --test lib/__tests__/barra-de-acciones.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const BARRA = path.join(RAIZ, "components", "shared", "BarraDeAcciones.tsx");
const TOOLBAR = path.join(RAIZ, "components", "shared", "ModuleToolbar.tsx");

/** El orden es la ley. Cambiarlo aquí se lo cambia a las treinta y tantas. */
const LA_LEY = ["buscador", "filtros", "secundarias", "crear", "acciones"];

const leer = (f) => readFileSync(f, "utf8");

/**
 * El cuerpo del `return` de `BarraDeAcciones`, que es lo que se pinta. Se
 * corta desde el `<div data-barra-de-acciones` porque lo de arriba es el
 * comentario de la ley —que nombra los cinco huecos en orden y haría pasar
 * este banco leyendo la documentación en vez del código—.
 */
function loQueSePinta() {
    const s = leer(BARRA);
    const i = s.indexOf("<div\n            data-barra-de-acciones");
    assert.notEqual(i, -1, "no se encuentra la fila de la barra");
    const j = s.indexOf("\nexport function BotonDeCrear", i);
    return s.slice(i, j === -1 ? s.length : j);
}

// ───────────────────────── A. el componente ─────────────────────────

test("EL CASO: los cinco huecos se pintan en el orden de la ley", () => {
    const zonas = [...loQueSePinta().matchAll(/data-zona="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(zonas, LA_LEY);
});

test("solo los FILTROS van dentro del carril que se desplaza", () => {
    const pintado = loQueSePinta();
    const abre = pintado.indexOf("<BarraDeslizable");
    const cierra = pintado.indexOf("</BarraDeslizable>");
    assert.ok(abre !== -1 && cierra > abre, "la barra ya no monta el carril");

    const dentro = pintado.slice(abre, cierra);
    const zonasDentro = [...dentro.matchAll(/data-zona="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
        zonasDentro,
        ["filtros"],
        "en el carril solo van los filtros: el buscador y la derecha son fijos",
    );
});

test("el buscador va ANTES del carril, y las tres de la derecha DESPUÉS", () => {
    const pintado = loQueSePinta();
    const abre = pintado.indexOf("<BarraDeslizable");
    const cierra = pintado.indexOf("</BarraDeslizable>");

    // No basta con el orden de los `data-zona`: lo que de verdad decide si el
    // buscador se va de la pantalla al desplazar es de qué lado del carril
    // está. Es el fallo que ya costó una vuelta en `/crm` y en Datos externos.
    assert.ok(
        pintado.indexOf('data-zona="buscador"') < abre,
        "el buscador está dentro del carril: la flecha se lo lleva fuera",
    );
    for (const zona of ["secundarias", "crear", "acciones"]) {
        assert.ok(
            pintado.indexOf(`data-zona="${zona}"`) > cierra,
            `«${zona}» está dentro del carril y tiene que ir fija a la derecha`,
        );
    }
});

test("la derecha no encoge; el buscador SÍ, que es lo que evita el desborde", () => {
    const pintado = loQueSePinta();
    const claseDe = (zona) => {
        const i = pintado.indexOf(`data-zona="${zona}"`);
        return pintado.slice(i, pintado.indexOf(">", i));
    };

    for (const zona of ["secundarias", "crear", "acciones"]) {
        assert.match(
            claseDe(zona),
            /\bshrink-0\b/,
            `«${zona}» puede encoger: se comprime antes de que el carril se desplace`,
        );
    }

    // Y el buscador al revés, a propósito y medido: con `shrink-0`, a 390 px
    // sus 224 px más «Exportar CSV», el azul y el `⋯` suman 447 en una caja de
    // 358 y la PÁGINA se desplaza a lo ancho. Cediendo, se estrecha antes que
    // desbordar; y con sitio de sobra no cede nada, porque el carril se lleva
    // el hueco primero (medido: 288 px a 1440, 1280 y 1024).
    assert.doesNotMatch(claseDe("buscador"), /\bshrink-0\b/, "con el buscador fijo la barra desborda en un teléfono");
    assert.match(claseDe("buscador"), /\bmin-w-0\b/, "sin `min-w-0` un flex no baja de su contenido y desborda igual");
});

test("#819: la fila del carril es `min-w-max`, nunca `w-max`", () => {
    const pintado = loQueSePinta();
    const i = pintado.indexOf('data-zona="filtros"');
    const linea = pintado.slice(i, pintado.indexOf(">", i));

    // `min-w-max` y no `w-max`: con `w-max` la fila mediría siempre su
    // contenido y un `ml-auto` de dentro se quedaría sin hueco que repartir.
    assert.match(linea, /\bmin-w-max\b/, "sin `min-w-max` la fila encoge y se parte en dos líneas");
    assert.doesNotMatch(linea, /(?<!min-)\bw-max\b/, "`w-max` rompe los `ml-auto` de dentro");
});

test("#819: la barra no escribe ninguna barra de desplazamiento a mano", () => {
    const pintado = loQueSePinta();
    // El carril lo pone `BarraDeslizable`, con sus flechas. Un `overflow-x`
    // suelto aquí es justo lo que dejaba 566 px escondidos sin ni una señal.
    assert.doesNotMatch(pintado, /overflow-x-(auto|scroll)|scrollbar-hide/);
});

// ───────────────────────── B. `ModuleToolbar` ─────────────────────────

test("ModuleToolbar reenvía los cinco huecos, y `children` cae en el carril", () => {
    const s = leer(TOOLBAR);
    const i = s.indexOf("<BarraDeAcciones");
    const uso = s.slice(i, s.indexOf("/>", i));

    assert.match(uso, /buscador=\{buscador\}/, "sin esto una pantalla no puede sacar su buscador del carril");
    assert.match(uso, /secundarias=\{secundarias\}/, "sin esto «Exportar CSV» acaba suelto en medio");
    assert.match(uso, /filtros=\{children \?\? left\}/, "la forma vieja cae en el carril, que es lo que es");
    assert.match(uso, /crear=\{right\}/);
    assert.match(uso, /acciones=\{acciones\}/);
});

// ───────────────────────── C. las pantallas ─────────────────────────

/**
 * Lo que NO puede estar dentro del carril, y por qué cada cosa:
 *
 * - un **buscador**, porque la flecha se lo lleva fuera de la pantalla y es lo
 *   que se usa en cada visita;
 * - una **acción secundaria** —exportar, columnas, refrescar—, porque no acota
 *   la lista y ahí queda suelta en mitad de la fila;
 * - un **`flex-1`**, porque dentro de una fila `min-w-max` no hay hueco que
 *   repartir: se queda en 0 px y lo que hubiera dentro desaparece sin decirlo.
 */
const BUSCADOR = /placeholder=\{?["'`][^"'`]*[Bb]uscar|<ColumnFilterInput\b|<BuscadorDeColumna\b/;
const SECUNDARIA = /\b(Columnas|Exportar|Importar|Descargar)\b|<RefreshCw\b/;

/**
 * Sin comentarios, porque casi todos estos bloques llevan escrito AL LADO por
 * qué el buscador o «Exportar CSV» ya no están ahí. Buscándolos sobre el texto
 * crudo, la explicación del arreglo hace fallar al banco que lo protege.
 */
const sinComentarios = (s) =>
    s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ").replace(/^\s*\/\/.*$/gm, " ");

/** Exclusiones, con su motivo escrito al lado. Sin motivo, el banco falla. */
const SE_PERDONA = {
    // (vacío a propósito: hoy no hay ninguna)
};

function pantallasQueUsanLaBarra() {
    const salida = [];
    const recorrer = (dir) => {
        for (const e of readdirSync(dir)) {
            if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
            const p = path.join(dir, e);
            if (statSync(p).isDirectory()) recorrer(p);
            else if (e.endsWith(".tsx")) {
                const s = leer(p);
                if (/\b(ModuleToolbar|BarraDeAcciones)\b/.test(s)) salida.push(p);
            }
        }
    };
    recorrer(path.join(RAIZ, "app"));
    recorrer(path.join(RAIZ, "components"));
    return salida.filter((p) => !p.includes(path.join("components", "shared")));
}

/** El carril de cada uso de la barra: `filtros=`, `left=` y el `children`. */
function carrilesDe(s) {
    const salida = [];
    const bloqueDesde = (i) => {
        let d = 0;
        for (let j = i; j < s.length; j++) {
            if (s[j] === "{") d++;
            else if (s[j] === "}" && --d === 0) return s.slice(i, j + 1);
        }
        return s.slice(i);
    };
    for (const m of s.matchAll(/\b(filtros|left)=\{/g)) salida.push(bloqueDesde(m.index + m[0].length - 1));

    // El `children` de `<ModuleToolbar …> … </ModuleToolbar>`. La etiqueta de
    // apertura se recorre a mano porque sus props llevan `<` y `>` dentro: una
    // expresión perezosa se cortaría en el primer `>` y el bloque saldría mal.
    for (const m of s.matchAll(/<ModuleToolbar\b/g)) {
        let d = 0, comilla = null, j = m.index + m[0].length;
        for (; j < s.length; j++) {
            const c = s[j];
            if (comilla) { if (c === comilla) comilla = null; continue; }
            if (c === '"' || c === "'" || c === "`") comilla = c;
            else if (c === "{") d++;
            else if (c === "}") d--;
            else if (c === ">" && d === 0) break;
        }
        if (s[j - 1] === "/") continue; // se cierra sola: no tiene children
        const fin = s.indexOf("</ModuleToolbar>", j);
        salida.push(s.slice(j + 1, fin === -1 ? j + 1 : fin));
    }
    return salida;
}

/** La barra entera de cada uso: la etiqueta de apertura y su cuerpo. */
function barrasDe(s) {
    const salida = [];
    for (const m of s.matchAll(/<(ModuleToolbar|BarraDeAcciones)\b/g)) {
        let d = 0, comilla = null, j = m.index + m[0].length;
        for (; j < s.length; j++) {
            const c = s[j];
            if (comilla) { if (c === comilla) comilla = null; continue; }
            if (c === '"' || c === "'" || c === "`") comilla = c;
            else if (c === "{") d++;
            else if (c === "}") d--;
            else if (c === ">" && d === 0) break;
        }
        if (s[j - 1] === "/") { salida.push(s.slice(m.index, j + 1)); continue; }
        const fin = s.indexOf(`</${m[1]}>`, j);
        salida.push(s.slice(m.index, fin === -1 ? j + 1 : fin));
    }
    return salida;
}

test("ninguna pantalla mete el BUSCADOR dentro del carril", () => {
    const malas = [];
    for (const f of pantallasQueUsanLaBarra()) {
        const rel = path.relative(RAIZ, f);
        if (rel in SE_PERDONA) continue;
        if (carrilesDe(leer(f)).some((c) => BUSCADOR.test(sinComentarios(c)))) malas.push(rel);
    }
    assert.deepEqual(malas, [], "el buscador va en `buscador=`, fuera del carril");
});

test("ninguna pantalla deja una acción SECUNDARIA suelta en el carril", () => {
    const malas = [];
    for (const f of pantallasQueUsanLaBarra()) {
        const rel = path.relative(RAIZ, f);
        if (rel in SE_PERDONA) continue;
        if (carrilesDe(leer(f)).some((c) => SECUNDARIA.test(sinComentarios(c)))) malas.push(rel);
    }
    assert.deepEqual(malas, [], "exportar, columnas y refrescar van en `secundarias=` o en el `⋯`");
});

test("#819: nada `flex-1` dentro de la barra", () => {
    const malas = [];
    for (const f of pantallasQueUsanLaBarra()) {
        const rel = path.relative(RAIZ, f);
        if (rel in SE_PERDONA) continue;
        // La barra misma le da `flex-1` al carril: eso es suyo y es correcto.
        if (barrasDe(leer(f)).some((b) => /className="[^"]*\bflex-1\b/.test(sinComentarios(b)))) malas.push(rel);
    }
    assert.deepEqual(malas, [], "en una fila `min-w-max` no hay hueco que repartir: `flex-1` se queda en 0 px");
});

test("y la lista de exclusiones no admite ninguna sin motivo", () => {
    for (const [f, motivo] of Object.entries(SE_PERDONA)) {
        assert.ok(
            typeof motivo === "string" && motivo.trim().length > 10,
            `«${f}» está excluida sin motivo escrito`,
        );
    }
});

test("el barrido de verdad ve las pantallas (si no, pasaría en vacío)", () => {
    // Un barrido que no encuentra ficheros pasa siempre y no protege nada.
    // Hoy son treinta y tantas; el suelo se deja bajo para que no haga falta
    // tocarlo al añadir o quitar una pantalla.
    assert.ok(pantallasQueUsanLaBarra().length >= 30, "el barrido no está encontrando las pantallas");
});
