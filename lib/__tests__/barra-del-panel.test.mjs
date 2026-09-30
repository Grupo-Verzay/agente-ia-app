/**
 * LA BARRA DEL PANEL EN DOCUMENTACIÓN: se ve igual que en Embudos.
 *
 * Se levanta con `scripts/banco-barra-del-panel.sh`. Pinta el componente real
 * con las pestañas del panel de producción (leídas el 2026-09-30, solo
 * lectura). `MODO=roto` pinta el de antes y afirma el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const COMPILADO = join(dirname(fileURLToPath(import.meta.url)), ".compilado", "barra-del-panel");
const { pintar } = await import(join(COMPILADO, "entrada.mjs"));
const { seVeLaBarraDelPanel } = await import(join(COMPILADO, "barra-del-panel.js"));

// Las pestañas del módulo /panel, tal como están en producción.
const PESTANAS = [
    ["Operaciones", "/documentos"], ["Embudos", "/embudos"], ["Proyectos", "/proyectos"],
    ["Tickets", "/tickets"], ["Diagramas", "/diagramas"], ["Clientes", "/panel/clientes"],
    ["Instancias", "/panel/client-billing"], ["Analíticas", "/panel/analytics"],
    ["Documentacion", "/documentation"], ["Reuniones", "/reuniones/grabaciones"],
    ["Finanzas", "/dashboard/finance"], ["Notificaciones", "/panel/notificaciones"],
].map(([title, url]) => ({ title, url }));

const DOCUMENTACION = ["/documentation", "/documentation/guide", "/documentation/tutorial",
    "/documentation/actualizaciones", "/documentation/meta"];

/** Qué pestaña sale marcada (la del borde de color), o null si no hay barra. */
function laMarcada(html) {
    if (!html.includes("<nav")) return null;
    const m = /<a[^>]*class="[^"]*border-primary[^"]*"[^>]*>([^<]*)</.exec(html);
    return m ? m[1] : "";
}
/** El marcado sin la pestaña marcada, para comparar dos barras. */
const sinLaMarca = (html) => html.replace(/border-primary text-foreground/g, "X").replace(/border-transparent text-muted-foreground hover:text-foreground hover:border-border/g, "X");

test("Embudos lleva la barra del panel, con su pestaña marcada (en los dos modos)", () => {
    assert.equal(laMarcada(pintar("/embudos", PESTANAS)), "Embudos");
});

if (ROTO) {
    test("ANTES: Documentación y sus pantallas se quedaban SIN la barra", () => {
        for (const r of DOCUMENTACION) assert.equal(laMarcada(pintar(r, PESTANAS)), null, r);
    });
} else {
    test("Documentación y TODAS sus pantallas llevan la barra, con «Documentacion» marcada", () => {
        for (const r of DOCUMENTACION) assert.equal(laMarcada(pintar(r, PESTANAS)), "Documentacion", r);
    });

    test("la barra de Documentación es la MISMA que la de Embudos (solo cambia la pestaña marcada)", () => {
        assert.equal(sinLaMarca(pintar("/documentation", PESTANAS)), sinLaMarca(pintar("/embudos", PESTANAS)));
    });

    test("fuera de los apartados no sale, y se compara por segmento", () => {
        for (const r of ["/documentationes", "/chats", "/sessions", "/"]) {
            assert.equal(laMarcada(pintar(r, PESTANAS)), null, r);
        }
    });

    test("dentro de /panel la pone su propio layout: el raíz no la repite", () => {
        assert.equal(laMarcada(pintar("/panel/clientes", PESTANAS, true)), null);
        assert.equal(laMarcada(pintar("/panel/clientes", PESTANAS, false)), "Clientes");
    });

    test("la regla pura, con y sin excludePanelRoutes", () => {
        const t = [{ url: "/documentation" }, { url: "/panel/x?y=1" }];
        assert.equal(seVeLaBarraDelPanel("/documentation/meta", t, { excludePanelRoutes: true }), true);
        assert.equal(seVeLaBarraDelPanel("/panel/x", t, { excludePanelRoutes: true }), false);
        assert.equal(seVeLaBarraDelPanel("/panel/otra", t), true);
        assert.equal(seVeLaBarraDelPanel(null, t), false);
    });
}
