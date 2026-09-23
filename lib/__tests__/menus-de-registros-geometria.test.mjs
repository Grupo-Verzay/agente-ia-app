/**
 * La decisión de los dos menús que cambiaron, sin navegador.
 *
 * - `bajoSuBotonEnElDialogo` (el «+ Nuevo» de Registros): pegado bajo su
 *   botón, filo derecho en el del botón y nunca más allá del diálogo.
 * - `bajoLaBarraDeArriba` (la campanita): filo derecho en el de la barra, y
 *   **el mismo `sideOffset` que antes**: donde nace no se toca.
 * - `ENCIMA_DE_SU_PANEL` va por encima de `ENCIMA_DEL_BORDE` y por debajo de la
 *   sala de reunión.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
    bajoSuBotonEnElDialogo,
    bajoLaBarraDeArriba,
    ENCIMA_DE_SU_PANEL,
    ENCIMA_DEL_BORDE,
    HUECO_DEL_DISPARADOR,
    SEPARACION_DEL_MENU,
} from "./.compilado/paneles-flotantes.js";

/** Dónde caen los filos con lo que Radix hace con `align` y `alignOffset`. */
function filos(g, disparador, ancho) {
    const crossAxis = g.align === "end" ? -g.alignOffset : g.alignOffset;
    const left = (g.align === "start" ? disparador.left : disparador.right - ancho) + crossAxis;
    return { left, right: left + ancho };
}

const z = (c) => Number(/z-\[(\d+)\]/.exec(c)?.[1]);

test("«+ Nuevo»: pegado bajo su botón, con el filo derecho en el del botón", () => {
    const dialogo = { left: 336, right: 1104, bottom: 832 };
    const boton = { left: 962, right: 1047, bottom: 113 };
    const g = bajoSuBotonEnElDialogo(dialogo, boton, "menu");
    assert.equal(g.side, "bottom");
    assert.equal(g.align, "end");
    assert.equal(g.sideOffset, SEPARACION_DEL_MENU);
    assert.equal(g.avoidCollisions, false, "sin esto Floating UI lo corre o lo voltea");
    const ancho = 137;
    const { left, right } = filos(g, boton, ancho);
    assert.equal(right, boton.right);
    assert.ok(left >= dialogo.left);
    assert.equal(Number(g.estilo.maxWidth.replace("px", "")), boton.right - dialogo.left);
});

test("«+ Nuevo»: un botón que llegara más allá del diálogo no lo saca", () => {
    const dialogo = { left: 0, right: 390, bottom: 800 };
    const boton = { left: 360, right: 420, bottom: 100 };
    const g = bajoSuBotonEnElDialogo(dialogo, boton, "menu");
    const { right } = filos(g, boton, 137);
    assert.equal(right, dialogo.right);
});

test("campana: filo en la barra, y nace EXACTAMENTE donde nacía", () => {
    for (const ventana of [1440, 1280, 1024, 390]) {
        const barra = { left: 0, right: ventana, bottom: 64 };
        const boton = { left: ventana - 48, right: ventana - 12, bottom: 50 };
        const g = bajoLaBarraDeArriba(barra, boton, ventana, "menu");
        assert.equal(g.sideOffset, Math.round(barra.bottom - boton.bottom) + HUECO_DEL_DISPARADOR);
        const tope = Number(g.estilo.maxWidth.replace("px", ""));
        assert.equal(filos(g, boton, Math.min(380, tope)).right, ventana);
        assert.match(g.estilo.maxHeight, /--radix-dropdown-menu-content-available-height/);
    }
});

test("el desplegable de dentro de un panel va por ENCIMA del panel", () => {
    assert.ok(z(ENCIMA_DE_SU_PANEL) > z(ENCIMA_DEL_BORDE));
    assert.ok(z(ENCIMA_DE_SU_PANEL) < 99, "la sala de reunión es z-[99]");
});

/**
 * El barrido de la ✕ doble. La ✕ de `DialogContent` vive dentro de una caja
 * `data-cerrar`, así que un `[&>button]:…` escrito en un diálogo ya no la
 * alcanza: el que la escondía dejaba DOS (la de la cabecera y otra cortada en
 * la esquina), y el que la pintaba de otro color dejaba de hacerlo. Se esconde
 * con `hideCloseButton`, y se estiliza con `[&>[data-cerrar]>button]`.
 */
test("ningún DialogContent intenta alcanzar su ✕ con `[&>button]`", async () => {
    const { spawnSync } = await import("node:child_process");
    // `git grep` sale con 1 cuando no encuentra nada, que es lo que se quiere.
    const r = spawnSync("git", ["grep", "-n", "-E", "<DialogContent[^>]*\\[&>button\\]", "--", "*.tsx"], {
        encoding: "utf8",
    });
    assert.ok(r.status === 0 || r.status === 1, r.stderr);
    assert.equal(r.stdout.trim(), "", r.stdout);
});
