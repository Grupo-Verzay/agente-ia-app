/**
 * La etapa del embudo en la fila de la bandeja y en la cabecera del chat: las
 * reglas, sin navegador.
 *
 * Lo que se mide aquí no es cómo se ve —eso lo mide el banco de Chromium— sino
 * lo que decide qué se ve:
 *
 *   1. El recorte del texto a 14 caracteres, con «…» DENTRO de esos 14.
 *   2. Que el índice del color y el color que pinta el tablero son el MISMO
 *      dato, encadenando las dos funciones.
 *   3. Que cada color de la paleta trae las clases de los cinco sitios donde
 *      una etapa se pinta, escritas literales (Tailwind solo ve literales).
 *   4. Un barrido del código: la fila pinta la pastilla y el selector de la
 *      cabecera ya no escribe ningún rótulo.
 *
 * `MODO=roto` lee los dos componentes de `ANTES_REF` y afirma el fallo: el
 * selector con el nombre de la etapa escrito al lado y la fila sin pastilla
 * ninguna. Se levanta con `scripts/banco-pastilla-de-etapa.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
/** En modo roto los componentes se leen del árbol de `ANTES_REF`. */
const DIR_ANTES = process.env.DIR_ANTES ?? RAIZ;

const {
    ANCHO_DE_LA_PASTILLA,
    COLORES_DE_ETAPA,
    TOPE_DE_NOMBRE,
    TOPE_DE_TEXTO_DE_PASTILLA,
    elColorDeLaEtapa,
    elIndiceDelColorDeLaEtapa,
    elTextoDeLaPastilla,
} = await import(join(AQUI, ".compilado", "embudos.js"));

/** La pastilla de al lado, que es el listón del encargo. */
const REFERENCIA = "Sin clasificar";

test("el tope son los caracteres de «Sin clasificar», la pastilla de al lado", () => {
    assert.equal(TOPE_DE_TEXTO_DE_PASTILLA, REFERENCIA.length);
});

test("lo que cabe en 14 no se toca", () => {
    for (const nombre of ["Nuevo", "En proceso", "Cerrado", REFERENCIA, "Catorce lindos"]) {
        assert.equal(elTextoDeLaPastilla(nombre), nombre, nombre);
    }
});

test("lo que pasa de 14 se corta, y los puntos van DENTRO de los 14", () => {
    // El nombre más largo que admite una etapa (`TOPE_DE_NOMBRE`), y uno justo
    // por encima del tope: los dos tienen que caber en el mismo ancho que la
    // pastilla de referencia, que es de lo que va este recorte.
    const largo = "Esperando respuesta del cliente final";
    const justo = "Sin clasificarX";
    for (const nombre of [largo, justo, "W".repeat(TOPE_DE_NOMBRE)]) {
        const texto = elTextoDeLaPastilla(nombre);
        assert.ok(texto.endsWith("…"), `${nombre} tendría que acabar en …`);
        assert.ok(
            texto.length <= TOPE_DE_TEXTO_DE_PASTILLA,
            `${texto} mide ${texto.length}, más que el tope de ${TOPE_DE_TEXTO_DE_PASTILLA}`,
        );
        assert.ok(nombre.startsWith(texto.slice(0, -1)), "lo que se enseña es el principio del nombre");
    }
});

test("no se deja un espacio colgando antes de los puntos", () => {
    // `slice` puede cortar justo detrás de un espacio; «Hola …» se lee como un
    // fallo de pintado y no como un recorte.
    assert.equal(elTextoDeLaPastilla("Reunion de     cierre"), "Reunion de…");
    assert.ok(!elTextoDeLaPastilla("Contactado por  el equipo").includes(" …"));
});

test("un nombre con espacios alrededor se limpia, no se recorta por ellos", () => {
    assert.equal(elTextoDeLaPastilla("  Nuevo  "), "Nuevo");
});

test("el índice del color y el color del tablero son el MISMO dato", () => {
    // Es lo que impide que la misma etapa salga de un color en la fila —que
    // recibe el índice ya resuelto— y de otro en el tablero, que lo deduce de
    // la posición.
    for (let posicion = 0; posicion < 14; posicion++) {
        for (const color of [null, undefined, 0, 3, 5, -1, 99, 1.5, "2"]) {
            const indice = elIndiceDelColorDeLaEtapa(color, posicion);
            assert.ok(Number.isInteger(indice) && indice >= 0 && indice < COLORES_DE_ETAPA.length);
            assert.deepEqual(
                COLORES_DE_ETAPA[indice],
                elColorDeLaEtapa(color, posicion),
                `color=${color} posicion=${posicion}`,
            );
        }
    }
});

test("cada color trae las clases de los cinco sitios, escritas literales", () => {
    assert.ok(COLORES_DE_ETAPA.length >= 6);
    for (const color of COLORES_DE_ETAPA) {
        for (const campo of ["cabecera", "punto", "texto", "pastilla"]) {
            const clase = color[campo];
            assert.equal(typeof clase, "string", `${color.nombre}.${campo}`);
            assert.ok(clase.length > 0, `${color.nombre}.${campo} vacío`);
            assert.ok(!clase.includes("${"), `${color.nombre}.${campo} no puede construirse`);
        }
        // La pastilla necesita las tres partes y su versión oscura: es la misma
        // fila donde ya conviven las de recordatorios y espera, que las llevan.
        for (const parte of ["border-", "bg-", "text-", "dark:"]) {
            assert.ok(color.pastilla.includes(parte), `${color.nombre}.pastilla sin ${parte}`);
        }
        assert.match(color.texto, /^text-/);
    }
});

test("el tope de ancho es un literal de Tailwind", () => {
    assert.match(ANCHO_DE_LA_PASTILLA, /^max-w-\[[\d.]+rem\]$/);
});

/* ── El barrido del código ───────────────────────────────────────────── */

const fila = fs.readFileSync(
    join(DIR_ANTES, "app/(root)/chats/_components/ChatContactItem.tsx"),
    "utf8",
);
const selector = fs.readFileSync(
    join(DIR_ANTES, "app/(root)/chats/_components/SelectorDeEtapaDelEmbudo.tsx"),
    "utf8",
);

test("la fila pinta la pastilla de etapa, entre el estado y el asesor", () => {
    if (ROTO) {
        assert.ok(
            !fila.includes("PastillaDeEtapa"),
            "el «antes» tendría que ser una fila SIN pastilla de etapa",
        );
        return;
    }
    assert.ok(fila.includes("PastillaDeEtapa"), "la fila no pinta la pastilla");
    const estado = fila.indexOf("<LeadStatusSelect");
    const etapa = fila.indexOf("<PastillaDeEtapa");
    const asesor = fila.indexOf("<AdvisorAssignBadge");
    assert.ok(estado > 0 && etapa > 0 && asesor > 0, "faltan pastillas en la fila");
    assert.ok(estado < etapa, "la etapa va DESPUÉS del estado");
    assert.ok(etapa < asesor, "la etapa va ANTES de «Asignar»");
});

test("el selector de la cabecera es solo un icono", () => {
    // El trigger, que es lo único que se ve sin abrir el menú.
    const desde = selector.indexOf("<PopoverTrigger");
    const hasta = selector.indexOf("</PopoverTrigger>");
    assert.ok(desde > 0 && hasta > desde, "no se encuentra el disparador");
    const trigger = selector.slice(desde, hasta);

    if (ROTO) {
        assert.ok(
            trigger.includes("actual?.nombre"),
            "el «antes» tendría que escribir el nombre de la etapa en el botón",
        );
        assert.ok(!trigger.includes("CONTROL_DE_ICONO"), "el «antes» no usaba la caja común");
        return;
    }
    assert.ok(
        trigger.includes("CONTROL_DE_ICONO"),
        "el botón tiene que medir lo que sus vecinos de la fila (`CONTROL_DE_ICONO`)",
    );
    assert.ok(trigger.includes("GLIFO_DE_CONTROL"), "el icono, el glifo común de la cabecera");
    assert.ok(
        !/\{\s*actual\?\.nombre/.test(trigger) && !/'Etapa'/.test(trigger),
        "el botón no puede llevar rótulo: lo que dice cuál es la etapa es el color",
    );
    // El nombre entero no se pierde: se lee en el globo.
    assert.ok(/title=\{.*nombre/s.test(trigger), "el globo tiene que llevar el nombre completo");
    assert.ok(/aria-label="Etapa del embudo"/.test(trigger), "un botón de icono necesita su nombre accesible");
});
