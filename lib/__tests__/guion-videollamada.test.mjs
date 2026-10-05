/**
 * El guion de Verzy (Entrenamiento › Agente IA › Videollamadas), por cuenta.
 * MODO=bueno: la regla pura y un barrido de que el contexto de Tavus, la sala
 * y la pantalla lo leen. MODO=roto: lee el código de ANTES y afirma que el
 * guion iba escrito a mano y no había pestaña de Videollamadas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const MODO = process.env.MODO ?? "bueno";
const DE = process.env.RAIZ_DE_ANTES ?? ".";
const leer = (f) => (existsSync(`${DE}/${f}`) ? readFileSync(`${DE}/${f}`, "utf8") : "");

if (MODO === "roto") {
    test("antes: no había guion editable ni pestaña de Videollamadas", () => {
        assert.equal(leer("lib/guion-videollamada.ts"), "");
        assert.ok(!leer("lib/channel-training.ts").includes("videollamadas"));
        assert.ok(!leer("lib/videollamada-ia.server.ts").includes("elGuionDeLaCita"));
        assert.match(leer("lib/videollamada-ia.server.ts"), /custom_greeting = SALUDO_INICIAL/);
    });
} else {
    const g = await import("./.compilado/guion-videollamada.js");
    const H = { tomarNota: "tomar_nota", agendar: "agendar_seguimiento" };

    test("sin nada guardado sale el de fábrica, entero", () => {
        assert.deepEqual(g.elGuionQueSeUsa(null), g.GUION_DE_FABRICA);
        assert.ok(g.esElDeFabrica(g.elGuionQueSeUsa(undefined)));
    });

    test("una sección vacía cae en la de fábrica; las escritas mandan", () => {
        const u = g.elGuionQueSeUsa({ saludo: " Hola,  soy Ana ", secciones: { oferta: "Plan Pro y punto." } });
        assert.equal(u.saludo, "Hola, soy Ana");
        assert.equal(u.secciones.oferta, "Plan Pro y punto.");
        assert.equal(u.secciones.cierre, g.GUION_DE_FABRICA.secciones.cierre);
        assert.ok(!g.esElDeFabrica(u));
    });

    test("lo que llega de fuera se sanea y se topa", () => {
        const c = g.comoGuion({ saludo: 7, secciones: { reglas: "x".repeat(9000), raro: "no" } });
        assert.equal(c.saludo, "");
        assert.equal(c.secciones.reglas.length, g.TOPE_DE_UNA_SECCION);
        assert.ok(!("raro" in c.secciones));
        assert.deepEqual(Object.keys(g.comoGuion("basura").secciones), g.SECCIONES_DEL_GUION.map((s) => s.clave));
    });

    test("el bloque lleva las siete secciones en orden y sustituye las variables", () => {
        const b = g.elBloqueDelGuionDe({ saludo: "Hola, soy Ana", secciones: {} }, "lunes 9:00", H);
        let pos = -1;
        for (const s of g.SECCIONES_DEL_GUION) {
            const i = b.indexOf(`${s.titulo}:`);
            assert.ok(i > pos, `falta o va fuera de orden: ${s.titulo}`);
            pos = i;
        }
        assert.ok(b.includes("«Hola, soy Ana»"));
        assert.ok(b.includes("agendar_seguimiento") && b.includes("tomar_nota"));
        assert.ok(!/\{(saludo|segunda_pregunta|tomar_nota|agendar)\}/.test(b));
        assert.ok(b.includes("lunes 9:00"));
    });

    test("cada cuenta su guion: lo guardado de una no toca el bloque de otra", () => {
        const ventas = g.elBloqueDelGuionDe({ saludo: "", secciones: { oferta: "VENTAS-OFERTA" } }, "x", H);
        const soporte = g.elBloqueDelGuionDe(null, "x", H);
        assert.ok(ventas.includes("VENTAS-OFERTA") && !soporte.includes("VENTAS-OFERTA"));
    });

    test("barrido: el contexto de Tavus, el saludo y la pantalla leen el guion guardado", () => {
        const srv = leer("lib/videollamada-ia.server.ts");
        assert.match(srv, /elGuionDeLaCita\(cita\)/);
        assert.match(srv, /custom_greeting = elGuionQueSeUsa\(guion\)\.saludo/);
        assert.match(leer("lib/pantalla-del-avatar.ts"), /elBloqueDelGuionDe/);
        assert.match(leer("components/videollamada/SalaDeLaVideollamada.tsx"), /text: saludo \|\| SALUDO_INICIAL/);
        assert.match(leer("lib/channel-training.ts"), /slug: 'videollamadas'.*kind: 'video'/);
        const pagina = leer("app/(root)/ia/[channel]/page.tsx");
        assert.match(pagina, /channel\.kind === 'video'/);
        assert.match(pagina, /GuionVideollamadaEditor/);
        const accion = leer("actions/guion-videollamada-actions.ts");
        assert.match(accion, /laCuentaDeLaAccion/);
        assert.match(accion, /canManageWorkspace/);
    });
}
