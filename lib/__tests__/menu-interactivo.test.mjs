/**
 * El banco del «Menú con botones», sin navegador y en dos modos.
 *
 * Lo que se comprueba es lo que no puede separarse:
 *   - la regla de la App y la del backend dicen LO MISMO (rótulos, forma,
 *     conectores): lo que enseña la vista previa es lo que le llega al cliente,
 *     y los conectores que se dibujan son las ramas que el motor sigue;
 *   - el paso nuevo está en la paleta, en el catálogo por plan, y el lienzo y
 *     el nodo lo tratan igual que al menú de texto (un barrido del código).
 *
 *   MODO=roto → lee los ficheros de ANTES_REF (sin el paso) y afirma el fallo.
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "2292d03";
const leer = (ruta) =>
    ROTO ? execFileSync("git", ["show", `${ANTES}:${ruta}`], { encoding: "utf8" }) : readFileSync(ruta, "utf8");

const app = await import("./.compilado/menu/workflow-menu.js");
const hayBackend = existsSync("lib/__tests__/.compilado/menu-backend/menu-de-opciones.js");
const back = hayBackend ? await import("./.compilado/menu-backend/menu-de-opciones.js") : null;

test("el paso nuevo está en la paleta, en el catálogo y en el orden", () => {
    const tipos = leer("types/workflow-node.ts");
    const catalogo = leer("lib/workflow-features.ts");
    const esta = tipos.includes('"menu-interactivo"') && catalogo.includes('"menu-interactivo"');
    if (ROTO) return assert.equal(esta, false, "antes no existía el paso");
    assert.ok(esta);
    assert.match(tipos, /ORDEN_ACCIONES[^\n]*'menu', 'menu-interactivo'/);
});

test("el nodo y el lienzo tratan los dos menús igual", () => {
    const nodo = leer("app/(root)/workflow/[workflowId]/_components/CustomNode.tsx");
    const tarjeta = leer("app/(root)/workflow/[workflowId]/_components/NodeCard.tsx");
    const lienzo = leer("app/(root)/workflow/[workflowId]/_components/WorkflowCanvas.tsx");
    if (ROTO) {
        assert.equal(nodo.includes("esNodoDeMenu"), false);
        assert.equal(lienzo.includes("conectoresDeSalida"), false, "antes un menú nuevo se conectaba por 'out'");
        return;
    }
    assert.ok(nodo.includes("esNodoDeMenu") && nodo.includes("conRendicion"));
    assert.ok(tarjeta.includes("MenuNodeFields") && tarjeta.includes("esNodoDeMenu"));
    assert.ok(lienzo.includes("conectoresDeSalida"));
});

test("conectores: uno por opción, y el de rendición solo si se sigue por una rama", () => {
    if (ROTO) return;
    const opciones = "Pagos\nUbicación\nHablar con alguien";
    for (const tipo of ["menu", "menu-interactivo"]) {
        assert.deepEqual(app.conectoresDeSalida({ tipo, menuOptions: opciones }), ["opt-1", "opt-2", "opt-3", "no"]);
        assert.deepEqual(app.conectoresDeSalida({ tipo, menuOptions: opciones, menuFallback: "ia" }), ["opt-1", "opt-2", "opt-3"]);
    }
    assert.deepEqual(app.conectoresDeSalida({ tipo: "text" }), ["out"]);
    assert.deepEqual(app.conectoresDeSalida({ tipo: "intention" }), ["yes", "no"]);
});

test("mismo tope de opciones que el menú de texto: 10", () => {
    if (ROTO) return;
    const once = Array.from({ length: 11 }, (_, i) => `Op ${i + 1}`).join("\n");
    assert.equal(app.parseMenuOptions(once).length, 10);
    assert.equal(app.MAX_OPCIONES_MENU, 10);
});

test("reintentos ↔ intentos, y lo raro cae en los de siempre", () => {
    if (ROTO) return;
    assert.equal(app.reintentosDeIntentos(3), 2);
    assert.equal(app.intentosDeReintentos(2), 3);
    assert.equal(app.intentosDeReintentos(0), 1);
    assert.equal(app.intentosDeReintentos(99), 6);
    assert.equal(app.reintentosDeIntentos(null), 2);
    assert.equal(app.comoRendicion("cualquier"), "rama");
    assert.equal(app.comoEstiloDeMenu(undefined), "lista");
    assert.equal(app.formaDelMenuInteractivo("botones", ["a", "b", "c", "d"]), "lista", "más de 3 no caben en botones");
});

test("la regla de la App y la del backend dicen lo mismo", { skip: !back || ROTO }, () => {
    const casos = [
        ["Pagos", "Ubicación de la tienda principal del centro", "Hablar con un asesor"],
        ["Opción repetida larga número uno", "Opción repetida larga número dos"],
        Array.from({ length: 10 }, (_, i) => `Opción ${i + 1}`),
    ];
    for (const opciones of casos) {
        for (const tope of [app.TOPE_TITULO_DE_FILA, app.TOPE_TEXTO_DE_BOTON]) {
            assert.deepEqual(app.rotulosDeLasOpciones(opciones, tope), back.rotulosDeLasOpciones(opciones, tope));
        }
        for (const estilo of ["lista", "botones"]) {
            const armado = back.armarElMenuInteractivo({ pregunta: "¿Qué necesitas?", opciones, estilo, textoDelBoton: "" });
            assert.equal(armado.forma, app.formaDelMenuInteractivo(estilo, opciones));
        }
    }
    for (const k of ["MAX_OPCIONES_MENU", "MAX_REINTENTOS_MENU", "TOPE_TITULO_DE_FILA", "TOPE_TEXTO_DE_BOTON", "TOPE_BOTON_DE_LISTA", "TEXTO_DEL_BOTON_POR_DEFECTO"]) {
        assert.equal(app[k], back[k], k);
    }
    assert.equal(app.comoTextoDelBoton(""), back.comoTextoDelBoton(""));
});
