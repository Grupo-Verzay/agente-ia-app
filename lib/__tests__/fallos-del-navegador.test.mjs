/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Un fallo del navegador no puede dejar la pantalla en blanco, y no puede
 *   irse sin dejar rastro.**
 *
 * De donde sale: en produccion salia de vez en cuando una pantalla blanca con
 * el texto «Application error: a client-side exception has occurred (see the
 * browser console for more information)». Eso no es una pantalla nuestra: es
 * `GlobalError` de Next (`node_modules/next/dist/client/components/
 * error-boundary.js`), que se monta POR ENCIMA del layout raiz y **reemplaza
 * el `<html>` entero**. Sale cuando algo revienta mas arriba del limite de
 * error que la App monta dentro del `<body>`.
 *
 * Y sale sin dejar nada: la recarga se lleva la consola por delante, asi que no
 * hay captura que pedir ni registro que mirar. Es la familia de *una recarga
 * tiene que decir por que*, un piso mas arriba.
 *
 * Las cuatro cosas que este banco no deja deshacer:
 *
 *   1. **`app/global-error.tsx` existe.** Sin el, Next pinta su pantalla en
 *      blanco: `ErrorBoundary` sin `errorComponent` es un Fragment pelado
 *      (lineas 164-179 de ese fichero), asi que la App no tenia NI UN limite
 *      del App Router.
 *   2. **Va con estilos EN LINEA.** Esa pantalla sustituye el `<html>`, asi que
 *      no hereda la hoja de estilos: con clases de Tailwind saldria texto negro
 *      sobre blanco sin forma ninguna, que se lee igual de roto.
 *   3. **Nada de nuestro se monta FUERA del limite** en el layout raiz. Lo que
 *      reviente ahi se le escapa por arriba y acaba en la pantalla en blanco,
 *      que es justo lo que este limite existe para evitar.
 *   4. **Se anota antes de recargar**, y la recarga automatica es solo para el
 *      desfase de version. Recargar por cualquier fallo es un bucle.
 *
 * Corre en dos modos, y el roto **afirma el fallo**: lee de `origin/main` el
 * layout de antes y exige que el barrido lo cace. Sin ese modo, lo verde del
 * normal no diria si el barrido mira.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx esbuild lib/fallos-del-navegador.ts --format=esm \
 *       --outdir=lib/__tests__/.compilado
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const { comoSeLee, esRecuperable, anotarElFallo, losFallosAnotados, olvidarLosFallos, comoSeCuenta } =
    await import("./.compilado/fallos-del-navegador.js");

const RAIZ = new URL("../../", import.meta.url).pathname;
const ROTO = process.env.MODO === "roto";

/** El layout de antes del arreglo, tal cual, sin copiarlo a mano. */
function layoutDeAntes() {
    return execFileSync("git", ["show", "origin/main:app/layout.tsx"], {
        cwd: RAIZ,
        encoding: "utf8",
    });
}

function elLayout() {
    return ROTO ? layoutDeAntes() : readFileSync(join(RAIZ, "app/layout.tsx"), "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. La decision: que es un desfase de version y que es un fallo cualquiera
// ─────────────────────────────────────────────────────────────────────────────

test("un desfase de version se reconoce por sus cinco formas", () => {
    const desfases = [
        ["ChunkLoadError", "Loading chunk 4821 failed."],
        ["Error", "Loading chunk app/layout failed.\n(timeout: /_next/static/chunks/x.js)"],
        ["Error", "Loading CSS chunk 12 failed."],
        ["TypeError", "error loading dynamically imported module: /_next/static/chunks/y.js"],
        ["Error", "Failed to find Server Action 'a1b2'. This request might be from an older deployment."],
    ];
    for (const [nombre, mensaje] of desfases) {
        assert.equal(esRecuperable(mensaje, nombre), true, `${nombre}: ${mensaje}`);
    }
});

test("un fallo cualquiera NO recarga la pagina sola", () => {
    // Es la mitad que importa: recargar ante cualquier error es un bucle de
    // recargas sobre una pantalla que no se va a arreglar sola.
    const normales = [
        ["TypeError", "Cannot read properties of null (reading 'nombre')"],
        ["Error", "No autorizado"],
        ["RangeError", "Maximum call stack size exceeded"],
        ["", ""],
    ];
    for (const [nombre, mensaje] of normales) {
        assert.equal(esRecuperable(mensaje, nombre), false, `${nombre}: ${mensaje}`);
    }
});

test("se lee un Error, una cadena y un objeto suelto", () => {
    const deError = comoSeLee(Object.assign(new Error("se cayo"), { digest: "abc123" }));
    assert.equal(deError.mensaje, "se cayo");
    assert.equal(deError.digest, "abc123");
    assert.ok(deError.pila);

    assert.equal(comoSeLee("una cadena pelada").mensaje, "una cadena pelada");
    assert.equal(comoSeLee({ message: "de un objeto", name: "Raro" }).nombre, "Raro");

    // Lo que no se entiende no revienta al leerlo: el lector de un fallo no
    // puede ser la segunda cosa que falla.
    assert.doesNotThrow(() => comoSeLee(null));
    assert.doesNotThrow(() => comoSeLee(undefined));
    assert.doesNotThrow(() => comoSeLee(7));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El rastro: se guarda, se topa, y no tumba nada cuando no se puede guardar
// ─────────────────────────────────────────────────────────────────────────────

/** Un `localStorage` de mentira, con el modo «revienta» de una ventana privada. */
function ponLocalStorage({ revienta = false } = {}) {
    const datos = new Map();
    globalThis.window = globalThis.window ?? {};
    globalThis.localStorage = {
        getItem: (k) => {
            if (revienta) throw new Error("acceso denegado");
            return datos.has(k) ? datos.get(k) : null;
        },
        setItem: (k, v) => {
            if (revienta) throw new Error("acceso denegado");
            datos.set(k, String(v));
        },
        removeItem: (k) => {
            if (revienta) throw new Error("acceso denegado");
            datos.delete(k);
        },
    };
    globalThis.window.localStorage = globalThis.localStorage;
    globalThis.window.location = { pathname: "/chats", href: "http://x/chats" };
    return datos;
}

test("lo anotado se guarda, y solo se guardan los ultimos", () => {
    ponLocalStorage();
    olvidarLosFallos();
    for (let i = 0; i < 9; i++) anotarElFallo("arbol", new Error(`fallo ${i}`));

    const guardados = losFallosAnotados();
    assert.equal(guardados.length, 5, "el rastro no puede crecer sin fin en el navegador de nadie");
    assert.equal(guardados.at(-1).mensaje, "fallo 8", "el ultimo que paso es el que mas sirve");
    assert.equal(guardados[0].mensaje, "fallo 4");
    assert.equal(guardados.at(-1).cazadoEn, "arbol");
});

test("sin poder guardar, anotar NO tumba nada", () => {
    // En una ventana privada tocar `localStorage` lanza. Si eso subiera, el
    // limite de error reventaria DENTRO de su propio manejador y la pantalla
    // se quedaria en blanco: exactamente lo que se venia a arreglar.
    ponLocalStorage({ revienta: true });
    assert.doesNotThrow(() => anotarElFallo("global", new Error("se cayo")));
    assert.doesNotThrow(() => losFallosAnotados());
    assert.doesNotThrow(() => olvidarLosFallos());
});

test("lo anotado se puede contar sin leer codigo", () => {
    ponLocalStorage();
    olvidarLosFallos();
    const anotado = anotarElFallo("ruta", Object.assign(new Error("Loading chunk 9 failed."), {
        name: "ChunkLoadError",
    }));
    const texto = comoSeCuenta(anotado);
    assert.match(texto, /ChunkLoadError/);
    assert.match(texto, /Loading chunk 9 failed/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. El barrido: las dos pantallas existen y nada se monta fuera del limite
// ─────────────────────────────────────────────────────────────────────────────

test("existen las dos pantallas de error del App Router", () => {
    const global = join(RAIZ, "app/global-error.tsx");
    const ruta = join(RAIZ, "app/error.tsx");

    if (ROTO) {
        // El modo roto afirma el fallo: sin `global-error.tsx` la pantalla en
        // blanco de Next es la unica que hay.
        assert.equal(
            existsSync(global) && existsSync(ruta),
            true,
            "(en el modo roto esto se comprueba contra el layout de antes, mas abajo)",
        );
        return;
    }

    assert.ok(existsSync(global), "sin app/global-error.tsx Next pinta su pantalla en blanco");
    assert.ok(existsSync(ruta), "sin app/error.tsx un fallo de una ruta sube al limite global");
});

test("la pantalla global va con estilos EN LINEA", () => {
    if (ROTO) return; // en `origin/main` no existe: lo afirma el caso de arriba
    const src = readFileSync(join(RAIZ, "app/global-error.tsx"), "utf8");

    // Sustituye el <html> entero, asi que no hereda la hoja de estilos.
    assert.ok(/<html/.test(src), "tiene que pintar su propio <html>, como GlobalError de Next");
    assert.ok(/style=\{/.test(src), "los estilos van en linea");
    assert.ok(
        !/className=/.test(src),
        "una clase de Tailwind aqui no existe: esta pantalla no carga la hoja de estilos",
    );
});

test("un fallo se anota ANTES de ofrecer el boton", () => {
    if (ROTO) return;
    const src = readFileSync(join(RAIZ, "app/global-error.tsx"), "utf8");
    assert.ok(/anotarElFallo\(/.test(src), "sin anotarlo, la recarga se lleva la consola por delante");
    assert.ok(/hardReload\(/.test(src), "tiene que haber un boton de recargar, no solo un mensaje");
});

test("nada de lo nuestro se monta FUERA del limite de error", () => {
    const src = elLayout();
    const cuerpo = src.slice(src.indexOf("<body"), src.indexOf("</body>"));
    const antesDelLimite = cuerpo.slice(0, cuerpo.indexOf("<ErrorBoundary>"));

    // Un `<script>` en linea si puede ir fuera: no es React, no puede reventar
    // el arbol, y tiene que correr ANTES de pintar (el tamaño de letra).
    const montadosFuera = [...antesDelLimite.matchAll(/<([A-Z][A-Za-z0-9]*)\s*\/>/g)].map((m) => m[1]);

    if (ROTO) {
        assert.ok(
            montadosFuera.length > 0,
            "el modo roto tiene que encontrar los componentes que quedaban fuera del limite",
        );
        assert.deepEqual(
            montadosFuera.sort(),
            ["FontScaleApplier", "StoragePersistence"],
            "asi estaba: lo que reventara en esos dos se iba a la pantalla en blanco de Next",
        );
        return;
    }

    assert.deepEqual(
        montadosFuera,
        [],
        `estos componentes se montan por encima del limite de error y lo que revienten ahi ` +
            `acaba en la pantalla en blanco de Next: ${montadosFuera.join(", ")}`,
    );
});

test("ningun hardReload se queda sin motivo", () => {
    // La regla ya estaba escrita para las tres recargas de antes; las pantallas
    // de error nuevas suman otras tres y van igual.
    const ficheros = [
        "components/chunk-recovery.tsx",
        "components/error-bundary.tsx",
        "components/shared/ErrorScreen.tsx",
        "lib/recuperar-del-desfase.ts",
        "app/error.tsx",
        "app/global-error.tsx",
    ];
    for (const rel of ficheros) {
        const ruta = join(RAIZ, rel);
        if (!existsSync(ruta)) continue;
        const src = readFileSync(ruta, "utf8");
        for (const m of src.matchAll(/hardReload\(([^)]*)\)/g)) {
            assert.ok(
                m[1].trim().length > 0,
                `${rel}: un hardReload() sin motivo no deja nada que leer al arrancar`,
            );
        }
    }
});
