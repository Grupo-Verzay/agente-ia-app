/**
 * La REGLA de los mandos de la cabecera de un canal, y un BARRIDO del código.
 *
 * Sin navegador. Lo que aquí se comprueba es la decisión —quién sale en qué
 * canal, con qué glifo y de qué color— y que la cabecera de verdad pasa por
 * ella. Que el botón dispare la llamada correcta sin abrir ningún menú, y que
 * los tres glifos se vean distintos, es la otra mitad
 * (`mandos-del-canal-dom.test.mjs`): eso no se contesta leyendo.
 *
 * `MODO=roto` lee la cabecera de `ANTES_REF` y AFIRMA el fallo: dos mandos con
 * el mismo icono de lucide y un menú intermedio con dos opciones.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    COLOR_DEL_MANDO,
    GLIFO_DEL_MANDO,
    ROTULO_DEL_MANDO,
    elAvisoDelMando,
    esUnaLlamada,
    losMandosDelCanal,
} from "./.compilado/mandos-del-canal.js";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF ?? "0c5326d";

const CABECERA = "components/chat-equipo/HiloDelEquipo.tsx";
const hoy = readFileSync(CABECERA, "utf8");
const deAntes = () =>
    execFileSync("git", ["show", `${ANTES_REF}:${CABECERA}`], { encoding: "utf8" });

/** El trozo de `FilaDelCanal`: de su `function` a la siguiente de arriba. */
function filaDelCanal(fuente) {
    const i = fuente.indexOf("function FilaDelCanal(");
    assert.ok(i > 0, "no se encontró FilaDelCanal");
    const j = fuente.indexOf("\nfunction ", i + 1);
    return fuente.slice(i, j > 0 ? j : fuente.length);
}

// ── La regla ──────────────────────────────────────────────────────────────────

test("llamar solo en un directo; la reunión en cualquier canal", () => {
    assert.deepEqual(losMandosDelCanal("directo"), ["voz", "video", "reunion"]);
    assert.deepEqual(losMandosDelCanal("area"), ["reunion"]);
    assert.deepEqual(losMandosDelCanal("general"), ["reunion"]);
});

test("NINGÚN par de mandos comparte glifo: es el fallo, escrito como regla", () => {
    for (const tipo of ["directo", "area", "general"]) {
        const glifos = losMandosDelCanal(tipo).map((m) => GLIFO_DEL_MANDO[m]);
        assert.equal(
            new Set(glifos).size,
            glifos.length,
            `en un canal ${tipo} hay dos mandos con el mismo glifo: ${glifos.join(", ")}`,
        );
    }
    // Y el invariante sobre TODOS los mandos, no solo los que hoy conviven:
    // si mañana entra un cuarto con un glifo que ya está, esto se pone rojo.
    const todos = Object.keys(GLIFO_DEL_MANDO);
    const glifos = todos.map((m) => GLIFO_DEL_MANDO[m]);
    assert.equal(new Set(glifos).size, todos.length, `glifo repetido: ${glifos.join(", ")}`);
});

test("el teléfono es la voz y la cámara la videollamada; la reunión, una pantalla", () => {
    assert.equal(GLIFO_DEL_MANDO.voz, "telefono");
    assert.equal(GLIFO_DEL_MANDO.video, "camara");
    assert.equal(GLIFO_DEL_MANDO.reunion, "pantalla");
});

test("un mando de llamada lleva su MODO dentro; la reunión no es una llamada", () => {
    assert.ok(esUnaLlamada("voz"));
    assert.ok(esUnaLlamada("video"));
    assert.ok(!esUnaLlamada("reunion"));
    // El nombre del mando ES el modo que se despacha: con dos vocabularios,
    // `comoModo` caería en voz y la videollamada arrancaría sin cámara.
    assert.deepEqual(
        losMandosDelCanal("directo").filter(esUnaLlamada),
        ["voz", "video"],
    );
});

test("las dos llamadas comparten color y la reunión no", () => {
    assert.equal(COLOR_DEL_MANDO.voz, COLOR_DEL_MANDO.video);
    assert.notEqual(COLOR_DEL_MANDO.reunion, COLOR_DEL_MANDO.voz);
});

test("los tres mandos tienen rótulo, color y glifo: ninguno a medias", () => {
    for (const mando of ["voz", "video", "reunion"]) {
        assert.ok(ROTULO_DEL_MANDO[mando]?.trim(), `sin rótulo: ${mando}`);
        assert.ok(COLOR_DEL_MANDO[mando]?.trim(), `sin color: ${mando}`);
        assert.ok(GLIFO_DEL_MANDO[mando]?.trim(), `sin glifo: ${mando}`);
    }
});

test("el aviso lleva el nombre del canal dentro", () => {
    assert.equal(elAvisoDelMando("voz", "Sofía"), "Llamada de voz con Sofía");
    assert.equal(elAvisoDelMando("video", "Sofía"), "Videollamada con Sofía");
    assert.equal(elAvisoDelMando("reunion", "Ventas"), "Reunión de video en Ventas");
});

test("los colores son clases LITERALES: Tailwind solo genera lo que ve escrito", () => {
    const fuente = readFileSync("lib/mandos-del-canal.ts", "utf8");
    const bloque = fuente.slice(fuente.indexOf("COLOR_DEL_MANDO"));
    const hasta = bloque.slice(0, bloque.indexOf("};"));
    assert.ok(!hasta.includes("${"), "un color compuesto no existiría en el CSS");
    // Y `lib/` tiene que estar en el `content` de Tailwind, o estas clases no
    // generan ni una regla y los botones salen sin color con el build en verde.
    const tw = readFileSync("tailwind.config.ts", "utf8");
    assert.ok(/\.\/lib\/\*\*/.test(tw), "tailwind.config.ts ya no mira ./lib");
});

// ── El barrido: que la cabecera pase por la regla ─────────────────────────────

test("la cabecera saca sus mandos del módulo y no de una lista a mano", () => {
    const fila = filaDelCanal(hoy);
    assert.ok(
        fila.includes("losMandosDelCanal(canal.tipo)"),
        "FilaDelCanal no pasa por losMandosDelCanal",
    );
    assert.ok(fila.includes("GLIFO_DEL_MANDO[mando]"), "el glifo no sale del módulo");
    assert.ok(fila.includes("COLOR_DEL_MANDO[mando]"), "el color no sale del módulo");
    assert.ok(fila.includes("elAvisoDelMando(mando"), "el aria-label no sale del módulo");
});

test("no queda NINGÚN menú intermedio para llamar", () => {
    const fila = filaDelCanal(hoy);
    // El único `DropdownMenu` que sobrevive en la fila es el «⋯» de limpiar.
    const menus = fila.match(/<DropdownMenu>/g) ?? [];
    assert.equal(menus.length, 1, `menús en la fila: ${menus.length} (solo el «⋯»)`);
    assert.ok(
        fila.includes('data-boton="opciones-del-canal"'),
        "el menú que queda no es el de «⋯»",
    );
    assert.ok(!fila.includes("data-llamar"), "sigue habiendo opciones de llamada en un menú");
});

test("los tres glifos son TRES iconos distintos de lucide", () => {
    const mapa = hoy.slice(hoy.indexOf("const ICONO_DEL_MANDO"));
    const cuerpo = mapa.slice(0, mapa.indexOf("};"));
    const iconos = [...cuerpo.matchAll(/^\s+(telefono|camara|pantalla):\s*(\w+),/gm)].map(
        (m) => m[2],
    );
    assert.equal(iconos.length, 3, `glifos mapeados: ${iconos.join(", ")}`);
    assert.equal(new Set(iconos).size, 3, `dos glifos con el mismo icono: ${iconos.join(", ")}`);
    // Y el alias que escondía el fallo no vuelve: `Video as VideoCamara` hacía
    // que la reunión y la videollamada fueran el mismo dibujo sin que se viera
    // al leer.
    assert.ok(!hoy.includes("Video as VideoCamara"), "vuelve el alias que escondía el fallo");
});

// ── El «antes», afirmado ──────────────────────────────────────────────────────

test("ANTES: la cámara de la reunión y la del menú eran el MISMO icono", () => {
    const antes = deAntes();
    assert.ok(
        antes.includes("Video as VideoCamara"),
        `${ANTES_REF} no trae el alias: ¿es el commit de antes?`,
    );
    const fila = filaDelCanal(antes);
    // El botón de al lado del teléfono pintaba `VideoCamara`…
    assert.ok(fila.includes("<VideoCamara "), "el botón no pintaba VideoCamara");
    // …y la opción «Videollamada» del menú pintaba `Video`. Los dos son el
    // MISMO icono de lucide: eso es lo que la cabecera no podía distinguir.
    assert.ok(fila.includes("<Video "), "el menú no pintaba Video");
    assert.ok(fila.includes("data-llamar"), "el menú de llamada no estaba ahí");
    assert.ok(fila.includes("Videollamada"), "el menú no ofrecía Videollamada");
    assert.ok(fila.includes("Llamada de voz"), "el menú no ofrecía Llamada de voz");
});

test("ANTES: la cabecera no pasaba por ninguna regla de mandos", () => {
    const antes = deAntes();
    assert.ok(!antes.includes("losMandosDelCanal"), "ya pasaba por el módulo");
    assert.ok(!antes.includes("mandos-del-canal"), "el módulo ya existía");
});

if (ROTO) {
    test("MODO=roto: el barrido de hoy CAZA la cabecera de antes", () => {
        const antes = deAntes();
        const fila = filaDelCanal(antes);
        // Las dos afirmaciones del modo bueno, ejercidas contra el «antes».
        assert.ok(
            !fila.includes("losMandosDelCanal(canal.tipo)"),
            "el barrido no cazaría la falta de regla",
        );
        const menus = fila.match(/<DropdownMenu>/g) ?? [];
        assert.ok(menus.length > 1, `el barrido no cazaría el menú de llamar (${menus.length})`);
    });
}
