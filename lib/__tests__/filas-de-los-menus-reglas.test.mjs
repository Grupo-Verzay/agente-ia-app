/**
 * Las reglas de `lib/filas-de-los-menus.ts` y un barrido del código.
 *
 * Lo que un banco puro SÍ puede contestar de esto: que las clases de una fila
 * salen de UN sitio, que no hay dos números para el mismo sangrado, y que lo que
 * se pidió dejar quieto sigue quieto. Dónde acaba pintándose cada píxel lo mide
 * el otro fichero, en Chromium.
 *
 * `MODO=roto` lee los dos componentes del árbol de `ANTES_REF` (que
 * `scripts/banco-filas-de-los-menus.sh` deja en `DIR_ANTES`) y **afirma el
 * fallo**: el menú de Etiquetas con la sangría de más de su grupo, el de Etapas
 * con su chulito, y ningún nombre en mayúscula.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
/** En modo roto los COMPONENTES se leen del otro árbol; el módulo, de este. */
const ARBOL = ROTO ? process.env.DIR_ANTES : RAIZ;

const ETAPAS = join("app", "(root)", "chats", "_components", "SelectorDeEtapaDelEmbudo.tsx");
const ETIQUETAS = join("app", "(root)", "tags", "components", "SessionTagsCombobox.tsx");

const leer = (rel) => fs.readFileSync(join(ARBOL, rel), "utf8");
const deAqui = (rel) => fs.readFileSync(join(RAIZ, rel), "utf8");

const M = await import(join(RAIZ, "lib", "__tests__", ".compilado", "filas-de-los-menus.js"));

/** El escalón de Tailwind de un `px-N` / `p-N`, en píxeles. */
function pxDe(clase) {
    const m = /(?:^|\s)p[xl]?-(\d+(?:\.\d+)?)(?:\s|$)/.exec(` ${clase} `);
    return m ? Number(m[1]) * 4 : null;
}

test("el sangrado de una fila y el de su rótulo son EL MISMO número", () => {
    // Es lo que impide que vuelva a haber dos: la fila, el rótulo del menú de
    // Etapas y lo que se le quita al grupo del de Etiquetas salen de aquí.
    assert.equal(M.SANGRIA_DEL_MENU, "px-2");
    assert.equal(pxDe(M.SANGRIA_DEL_MENU), 8);
    assert.equal(
        pxDe(M.FILA_DEL_MENU),
        pxDe(M.SANGRIA_DEL_MENU),
        "la caja de la fila y el sangrado del menú tienen que decir lo mismo",
    );
    // Y el grupo no mete nada: es la sangría de más que se venía a quitar.
    assert.equal(M.GRUPO_SIN_SANGRIA, "px-0");
    assert.equal(pxDe(M.GRUPO_SIN_SANGRIA), 0);
});

test("el rótulo dice lo mismo en los dos, aunque uno lo pinte cmdk", () => {
    // cmdk no deja ponerle clases al nodo del título, así que la lista está
    // escrita dos veces. Aquí se deriva una de la otra: si alguien afina una y
    // se olvida de la gemela, los dos menús dejan de leerse igual y nada más lo
    // dice. Componerlas en tiempo de ejecución NO vale —Tailwind lee el código—,
    // por eso se comprueban en vez de generarse.
    const sueltas = M.ROTULO_DEL_MENU.split(" ");
    const enElGrupo = M.ROTULO_EN_EL_GRUPO.split(/\s+/).filter(Boolean);
    assert.deepEqual(
        enElGrupo,
        sueltas.map((c) => `[&_[cmdk-group-heading]]:${c}`),
        "el rótulo de cmdk no dice lo mismo que el suelto",
    );
    // Y arranca donde arranca la fila: el mismo sangrado, no uno parecido.
    assert.ok(sueltas.includes(M.SANGRIA_DEL_MENU), "el rótulo no usa el sangrado del menú");
});

test("la caja de una fila es la de la casa, no un valor nuevo", () => {
    // `CommandItem`, `DropdownMenuItem` y `SelectItem` llevan los tres
    // `rounded-sm px-2 py-1.5`. La de Etapas iba en `rounded-md` y era la única.
    for (const c of ["rounded-sm", "px-2", "py-1.5", "text-xs"]) {
        assert.ok(M.FILA_DEL_MENU.split(" ").includes(c), `falta ${c} en FILA_DEL_MENU`);
    }
    const item = deAqui(join("components", "ui", "command.tsx"));
    assert.ok(item.includes("rounded-sm px-2 py-1.5"), "la casa dejó de usar rounded-sm px-2 py-1.5");
});

test("el nombre va en mayúscula por CSS, y recortado", () => {
    const clases = M.NOMBRE_EN_LA_FILA.split(" ");
    assert.ok(clases.includes("uppercase"), "el nombre no va en mayúscula");
    // Recortado, porque en mayúscula ocupa más. El nombre entero lo conserva el
    // globo, que el otro banco comprueba en el DOM.
    assert.ok(clases.includes("truncate"), "un nombre en mayúscula sin recorte desborda la fila");
});

test("lo PUESTO es un gris suave, y ni chulito ni recuadro", () => {
    const clases = M.FILA_PUESTA.split(" ");
    assert.ok(
        clases.some((c) => /^bg-(muted|accent)$/.test(c)),
        "la fila puesta no lleva fondo gris",
    );
    for (const prohibida of [/^border/, /^ring/, /^outline/, /^shadow/]) {
        assert.ok(
            !clases.some((c) => prohibida.test(c)),
            `la fila puesta no puede llevar recuadro (${prohibida})`,
        );
    }
    // El peso NO es decoración: `--muted` y `--accent` son el mismo valor en este
    // tema, así que el gris de lo puesto y el del cursor encima son el mismo.
    // Sin el peso, mientras se apunta a otra fila habría dos grises iguales.
    assert.ok(clases.includes("font-medium"), "sin el peso, lo puesto y lo apuntado se ven igual");
});

test("los dos componentes sacan sus clases del módulo, no escritas a mano", () => {
    const etapas = leer(ETAPAS);
    const etiquetas = leer(ETIQUETAS);

    if (ROTO) {
        assert.ok(
            !etapas.includes("filas-de-los-menus") && !etiquetas.includes("filas-de-los-menus"),
            "el «antes» no puede conocer el módulo: entonces no hay nada que afirmar",
        );
        // La sangría de más, escrita: el grupo de cmdk metía su `p-1` y nadie se
        // lo quitaba.
        assert.ok(
            /<CommandGroup key=\{grupo\.grupo\} heading=/.test(etiquetas),
            "el «antes» pintaba el grupo sin quitarle su sangría",
        );
        // Y la fila de Etapas con su redondeo propio.
        assert.ok(etapas.includes("rounded-md px-2 py-1.5"), "el «antes» escribía la caja a mano");
        return;
    }

    for (const [nombre, src] of [
        ["Etapas", etapas],
        ["Etiquetas", etiquetas],
    ]) {
        assert.ok(
            src.includes("@/lib/filas-de-los-menus"),
            `${nombre} no importa las clases del módulo compartido`,
        );
    }
    // Ninguno vuelve a escribir la caja de una fila por su cuenta.
    for (const [nombre, src] of [
        ["Etapas", etapas],
        ["Etiquetas", etiquetas],
    ]) {
        assert.ok(
            !/rounded-(sm|md) px-2 py-1\.5/.test(src),
            `${nombre} escribe la caja de la fila a mano en vez de usar FILA_DEL_MENU`,
        );
    }
});

test("el menú de Etapas no tiene chulito, y dice lo puesto a un lector de pantalla", () => {
    const src = leer(ETAPAS);
    if (ROTO) {
        assert.ok(src.includes("from 'lucide-react'") && /\bCheck\b/.test(src), "el «antes» tenía chulito");
        assert.ok(!src.includes("aria-selected"), "el «antes» no decía lo puesto");
        return;
    }
    assert.ok(!/\bCheck\b/.test(src), "el chulito sigue en el menú de Etapas");
    // Quitado el chulito, `aria-selected` es lo ÚNICO que le queda a quien no ve
    // el fondo gris.
    assert.ok(src.includes('role="listbox"'), "la lista de etapas no es un listbox");
    assert.ok(src.includes('role="option"'), "las etapas no son opciones");
    assert.ok(src.includes("aria-selected={puesta}"), "no se dice cuál está puesta");
});

test("fuera de la cabecera de Chats las filas se quedan como estaban", () => {
    if (ROTO) return;
    const src = leer(ETIQUETAS);
    // El combobox de Etiquetas lo pintan además el CRM y `/sessions`. Lo que
    // marca «esta es la de la cabecera» es la prop `panel`, la MISMA con la que
    // ya se decide dónde nace el panel: sin esa condición, unificar Chats les
    // cambiaría las filas a dos pantallas que nadie pidió tocar.
    for (const gate of [
        "panel ? cn(GRUPO_SIN_SANGRIA, ROTULO_EN_EL_GRUPO) : undefined",
        "panel && FILA_DEL_MENU",
        'panel ? NOMBRE_EN_LA_FILA : "truncate"',
        "panel ? tag.name : undefined",
    ]) {
        assert.ok(src.includes(gate), `falta la condición de la cabecera: ${gate}`);
    }
});

test("las píldoras de la lista de chats NO van en mayúscula", () => {
    // Es la mitad del encargo que se pierde sola: el estado, la etapa y las
    // etiquetas de la FILA se quedan con su capitalización. Si alguien mete el
    // `uppercase` en un componente compartido, esto se pone rojo.
    for (const rel of [
        join("app", "(root)", "chats", "_components", "ChatContactItem.tsx"),
        join("app", "(root)", "chats", "_components", "PastillaDeEtapa.tsx"),
        join("app", "(root)", "chats", "_components", "LeadStatusSelect.tsx"),
    ]) {
        assert.ok(!/\buppercase\b/.test(deAqui(rel)), `${rel} pinta en mayúscula y no debe`);
    }
});

test("Tailwind mira `lib/`, o estas clases no existen en producción", () => {
    // La familia de `removeConsole`: el código llega, lo que no está es el CSS.
    // Sin este glob, las clases de `lib/filas-de-los-menus.ts` no se generan y
    // las filas salen sin sangrado, sin redondeo y sin mayúscula, con el build
    // en verde.
    const conf = deAqui("tailwind.config.ts");
    assert.ok(/["']\.\/lib\/\*\*\/\*\.\{ts,tsx\}["']/.test(conf), "tailwind.config.ts dejó de mirar lib/");
});
