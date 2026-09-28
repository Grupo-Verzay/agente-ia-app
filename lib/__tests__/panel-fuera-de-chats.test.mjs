/**
 * El panel lateral empuja el contenido en TODAS las pantallas, sin navegador.
 *
 * 1. La cuenta de la franja fuera de Chats (`laFranjaDelContenido`): el panel
 *    empieza exactamente donde acaba la caja con la reserva puesta.
 * 2. Un barrido del código: la envoltura y la caja llevan su marca en el
 *    layout, la medida se monta una vez, el CSS reserva fuera de Chats SIN
 *    tocar Chats (`:not(:has([data-chat-view]))`) y con el mismo punto de corte,
 *    y los tres marcos de panel llevan la marca que el CSS coloca.
 *
 * `MODO=roto` lee el layout y el CSS de `ANTES_REF` y AFIRMA el fallo: fuera de
 * Chats no se reservaba nada, así que el panel tapaba el contenido.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "626a48c";
const leer = (f) => (ROTO ? execSync(`git show ${ANTES}:"${f}"`, { encoding: "utf8" }) : readFileSync(f, "utf8"));

const layout = leer("app/(root)/layout.tsx");
const css = leer("app/globals.css");

if (ROTO) {
    test("ANTES: fuera de Chats no había ninguna reserva de la franja", () => {
        assert.ok(!layout.includes("data-contenido-de-la-app"), "el layout ya marcaba la envoltura");
        assert.ok(!css.includes("data-contenido-de-la-app"), "el CSS ya reservaba fuera de Chats");
        // Lo único que reservaba era la bandeja de Chats y Correo.
        assert.match(css, /\[data-panel-lateral="abierto"\] \[data-chat-view\]/);
        const reservas = css.match(/\[data-panel-lateral="abierto"\][^{]*\{[^}]*padding-right/g) ?? [];
        assert.equal(reservas.length, 1, "había más de una reserva");
        assert.ok(reservas[0].includes("[data-chat-view]"), "la única reserva no era la de Chats");
    });
} else {
    const { laFranjaDelContenido, MARCA_DEL_CONTENIDO, MARCA_DE_LA_CAJA } = await import(
        "./.compilado/panel-lateral.js"
    );

    test("la franja empieza justo donde acaba la caja con la reserva puesta", () => {
        const ventana = 1440;
        const ancho = 384;
        const relleno = 4;
        const envoltura = { left: 48, right: 1440 };
        // Con el panel abierto el relleno derecho es ancho + relleno.
        const cajaDerecha = envoltura.right - relleno - ancho;
        const m = laFranjaDelContenido({ top: 57, height: 839 }, envoltura, relleno, ventana);
        assert.equal(m.arriba, 57);
        assert.equal(m.alto, 839);
        const franjaIzquierda = ventana - m.derecha - ancho;
        assert.equal(franjaIzquierda, cajaDerecha);
    });

    test("un relleno que no se entiende cuenta como cero, nunca como NaN", () => {
        for (const r of [NaN, -3, undefined]) {
            const m = laFranjaDelContenido({ top: 0, height: 10 }, { right: 1000 }, r, 1000);
            assert.equal(m.derecha, 0);
        }
    });

    test("el layout marca la envoltura y la caja, y monta la medida una vez", () => {
        assert.ok(layout.includes(MARCA_DEL_CONTENIDO), "falta la marca de la envoltura");
        assert.ok(layout.includes(MARCA_DE_LA_CAJA), "falta la marca de la caja");
        assert.equal(layout.match(/<MedidaDelContenido\s*\/>/g)?.length, 1);
        // La caja va DENTRO de la envoltura: la marca de la caja sale después.
        assert.ok(layout.indexOf(MARCA_DEL_CONTENIDO) < layout.indexOf(MARCA_DE_LA_CAJA));
    });

    test("el CSS reserva fuera de Chats, sin tocar Chats y desde lg", () => {
        const bloque = css.slice(css.indexOf("FUERA de Chats, el panel también EMPUJA"));
        assert.match(bloque, /@media \(min-width: 1024px\)/, "el punto de corte no es el de Chats");
        assert.match(
            bloque,
            /\[data-panel-lateral="abierto"\] \[data-contenido-de-la-app\]:not\(:has\(\[data-chat-view\]\)\)\s*\{\s*padding-right: calc\(var\(--ancho-lateral\)/,
            "falta la reserva de la envoltura, o reserva también en Chats",
        );
        assert.match(bloque, /:root\[data-contenido-medido\]:not\(\[data-chats-medidos\]\) \[data-franja-lateral\]/,
            "la franja fuera de Chats pisaría la colocación de Chats");
        // La de Chats sigue intacta.
        assert.match(css, /:root\[data-panel-lateral="abierto"\] \[data-chat-view\]\s*\{\s*padding-right: var\(--ancho-lateral\)/);
        // Y la transición es la misma que la de la bandeja de Chats.
        const curva = "500ms cubic-bezier(0.17, 0.61, 0.54, 0.9)";
        assert.ok(css.includes(`[data-chat-view] {\n  transition: padding-right ${curva}`));
        assert.ok(css.includes(`[data-contenido-de-la-app] {\n  transition: padding-right ${curva}`));
    });

    test("los tres marcos de panel llevan la marca que el CSS coloca", () => {
        for (const f of [
            "components/shared/PanelLateral.tsx",
            "components/chat-equipo/PanelDeEquipo.tsx",
            "app/(root)/ai-chat/components/ChatSheet.tsx",
        ]) {
            const s = readFileSync(f, "utf8");
            assert.ok(s.includes("data-franja-lateral"), `${f} sin data-franja-lateral`);
            assert.ok(s.includes("data-hoja-lateral"), `${f} sin data-hoja-lateral`);
        }
    });
}
