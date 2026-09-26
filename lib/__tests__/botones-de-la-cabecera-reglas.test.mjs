/**
 * Los BOTONES de la fila de arriba de la cabecera de la conversación, y las
 * FILAS de los dos menús que se abren desde ellos. La mitad que se contesta
 * leyendo, sin navegador.
 *
 * Lo que comprueba, y por qué cada cosa:
 *
 *   1. **El hueco entre controles vive en UN sitio** y su número y su clase
 *      dicen lo mismo. Salía de dos —el `gap-1.5` de la tira y el `gap-3` de la
 *      fila, que está ahí para otra cosa— y por eso el último control quedaba a
 *      12 px de su vecino.
 *   2. **La cabecera no escribe ese hueco a mano.** Con el número suelto en el
 *      componente, el día que se afine el de `lib/` este se queda atrás.
 *   3. **La etapa va ANTES de las etiquetas**, en las DOS filas —la de móvil y
 *      la de escritorio—: con el orden puesto en una sola, las dos filas de la
 *      misma cabecera ofrecerían los controles en orden distinto.
 *   4. **La fila de Etiquetas no abre con un `opacity-0`.** Es el fallo entero:
 *      un `opacity-0` no libera sitio, así que el chulito invisible reservaba su
 *      hueco y metía la sangría que el menú de Etapas no tiene.
 *   5. **La marca de color de una fila la escribe UNA constante**, usada por los
 *      dos menús: con la clase copiada, los dos puntos acaban de tamaños
 *      distintos y los nombres sin alinear.
 *   6. **Y Tailwind sigue mirando `lib/`**, o las clases de estos módulos no se
 *      generarían y las filas saldrían sin hueco y sin marca, con el build en
 *      verde (la familia de `removeConsole`).
 *
 * `MODO=roto` lee los COMPONENTES de `DIR_ANTES` y afirma el fallo: el hueco de
 * la fila escrito a mano, las etiquetas antes de la etapa y el chulito invisible
 * abriendo la fila.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
/** En el modo roto los componentes se leen del otro árbol; el módulo, del de ahora. */
const ARBOL = ROTO ? process.env.DIR_ANTES : RAIZ;
assert.ok(ARBOL, "falta DIR_ANTES en el modo roto");

const leer = (p) => fs.readFileSync(join(ARBOL, p), "utf8");
const CABECERA = leer("app/(root)/chats/_components/ChatHeader.tsx");
const ETIQUETAS = leer("app/(root)/tags/components/SessionTagsCombobox.tsx");
const ETAPAS = leer("app/(root)/chats/_components/SelectorDeEtapaDelEmbudo.tsx");

const {
    HUECO_ENTRE_CONTROLES,
    CLASE_HUECO_ENTRE_CONTROLES,
} = await import(join(AQUI, ".compilado", "cabeceras-de-chats.js"));
const { MARCA_DE_LA_FILA } = await import(join(AQUI, ".compilado", "filas-de-los-menus.js"));

/** La escala de Tailwind: `gap-1.5` son 6 px. */
const PX_DE_LA_CLASE = { "gap-0.5": 2, "gap-1": 4, "gap-1.5": 6, "gap-2": 8, "gap-3": 12 };

test("el hueco entre controles: un número y una clase que dicen lo mismo", () => {
    assert.equal(
        PX_DE_LA_CLASE[CLASE_HUECO_ENTRE_CONTROLES],
        HUECO_ENTRE_CONTROLES,
        `la clase ${CLASE_HUECO_ENTRE_CONTROLES} no son ${HUECO_ENTRE_CONTROLES} px`,
    );
});

test("la cabecera NO escribe el hueco de sus controles a mano", () => {
    // Las dos filas de controles: la de escritorio (la tira y la caja que la
    // envuelve con la ficha) y la de herramientas del móvil.
    if (ROTO) {
        assert.ok(
            CABECERA.includes(`items-center ${CLASE_HUECO_ENTRE_CONTROLES} overflow-x-auto`) ||
                CABECERA.includes(`justify-between ${CLASE_HUECO_ENTRE_CONTROLES}`),
            "el «antes» tenía el hueco de los controles escrito a mano en la cabecera",
        );
        return;
    }
    assert.ok(
        CABECERA.includes("CLASE_HUECO_ENTRE_CONTROLES"),
        "la cabecera no usa la constante del hueco entre controles",
    );
    // Ni una clase de hueco escrita a mano en una fila de controles.
    for (const m of CABECERA.matchAll(/className="([^"]*\boverflow-x-auto\b[^"]*)"/g)) {
        assert.ok(
            !/\bgap-[\d.]+/.test(m[1]),
            `una fila de controles escribe su hueco a mano: ${m[1]}`,
        );
    }
});

test("la etapa va ANTES de las etiquetas, en las DOS filas", () => {
    const etapas = [...CABECERA.matchAll(/\{selectorDeEtapa\}/g)].map((m) => m.index);
    const etiquetas = [...CABECERA.matchAll(/\{tagsCombobox\}/g)].map((m) => m.index);
    assert.equal(etapas.length, 2, "la etapa no se pinta en las dos filas de la cabecera");
    assert.equal(etiquetas.length, 2, "las etiquetas no se pintan en las dos filas");
    for (let i = 0; i < 2; i++) {
        if (ROTO) {
            assert.ok(
                etiquetas[i] < etapas[i],
                `el «antes» pintaba las etiquetas antes de la etapa (fila ${i + 1})`,
            );
            continue;
        }
        assert.ok(
            etapas[i] < etiquetas[i],
            `la etapa se pinta después de las etiquetas en la fila ${i + 1}`,
        );
    }
});

test("la fila de Etiquetas no abre con un `opacity-0`", () => {
    // El trozo del `CommandItem`: desde su apertura hasta su cierre.
    const i = ETIQUETAS.indexOf("<CommandItem");
    const j = ETIQUETAS.indexOf("</CommandItem>");
    assert.ok(i > 0 && j > i, "no se encontró la fila del menú de Etiquetas");
    const fila = ETIQUETAS.slice(i, j);
    // Lo que va antes del nombre: el trozo hasta el `span` que lo pinta.
    const k = fila.indexOf("NOMBRE_EN_LA_FILA");
    assert.ok(k > 0, "no se encontró el nombre en la fila de Etiquetas");
    const antesDelNombre = fila.slice(0, k);

    if (ROTO) {
        // El «antes» abría la fila con el chulito invisible SIEMPRE: no
        // distinguía Chats de las demás pantallas, así que no había ninguna rama
        // del `panel` delante del nombre y sí un `opacity-0`.
        assert.ok(/opacity-0/.test(antesDelNombre), "el «antes» abría la fila con un chulito invisible");
        assert.ok(
            !/MARCA_DE_LA_FILA/.test(antesDelNombre),
            "el «antes» no abría la fila con una marca de color",
        );
        return;
    }

    /*
     * Lo que abre la fila EN CHATS: la rama del `panel`. Fuera de Chats —el CRM y
     * `/sessions`— la fila se queda como estaba, con su chulito y su icono
     * delante, así que lo que hay que mirar es esa rama y no el trozo entero.
     */
    const m = /\{panel \? \(([\s\S]*?)\) : \(/.exec(antesDelNombre);
    assert.ok(m, "la fila de Etiquetas no distingue Chats de las demás pantallas");
    const enChats = m[1];
    assert.ok(!/opacity-0/.test(enChats), "en Chats algo invisible abre la fila y reserva su hueco");
    assert.ok(!/<Check\b/.test(enChats), "en Chats el chulito sigue delante del nombre");
    assert.ok(/MARCA_DE_LA_FILA/.test(enChats), "en Chats la fila no abre con la marca de color");

    // Y el chulito no se perdió: sigue existiendo, después del nombre.
    assert.ok(
        /<Check\b/.test(fila.slice(k)),
        "el chulito desapareció de la fila en vez de irse al final",
    );
});

test("la marca de color de una fila la escribe UNA constante", () => {
    if (ROTO) {
        assert.ok(
            /h-2 w-2 shrink-0 rounded-full/.test(ETAPAS),
            "el «antes» tenía la marca escrita a mano en Etapas",
        );
        return;
    }
    for (const [nombre, src] of [
        ["Etapas", ETAPAS],
        ["Etiquetas", ETIQUETAS],
    ]) {
        assert.ok(
            src.includes("MARCA_DE_LA_FILA"),
            `${nombre} no usa la constante de la marca`,
        );
        assert.ok(
            !src.includes(MARCA_DE_LA_FILA),
            `${nombre} escribe la marca a mano además de importarla`,
        );
    }
});

test("Tailwind sigue mirando `lib/`", () => {
    const cfg = fs.readFileSync(join(RAIZ, "tailwind.config.ts"), "utf8");
    assert.ok(/\.\/lib\/\*\*/.test(cfg), "tailwind.config.ts dejó de mirar lib/");
});
