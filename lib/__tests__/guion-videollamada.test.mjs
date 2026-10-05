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
        // El saludo lo dice la SALA; el guion no se lo hace repetir a Verzy.
        assert.ok(!b.includes("Hola, soy Ana"));
        assert.ok(b.includes("agendar_seguimiento") && b.includes("tomar_nota"));
        assert.ok(!/\{(saludo|segunda_pregunta|tomar_nota|agendar)\}/.test(b));
        assert.ok(b.includes("lunes 9:00"));
    });

    test("cada cuenta su guion: lo guardado de una no toca el bloque de otra", () => {
        const ventas = g.elBloqueDelGuionDe({ saludo: "", secciones: { oferta: "VENTAS-OFERTA" } }, "x", H);
        const soporte = g.elBloqueDelGuionDe(null, "x", H);
        assert.ok(ventas.includes("VENTAS-OFERTA") && !soporte.includes("VENTAS-OFERTA"));
    });

    test("barrido: Videollamadas usa el MISMO editor que Llamadas, y Tavus lee su entrenamiento", () => {
        const srv = leer("lib/videollamada-ia.server.ts");
        assert.match(srv, /elGuionDeLaCita\(cita\)/);
        assert.match(srv, /elEntrenamientoDeLaCita\(cita\)/);
        assert.match(srv, /AGENTE_DE_VIDEOLLAMADAS = "system-prompt-ai-videollamadas"/);
        assert.match(leer("lib/pantalla-del-avatar.ts"), /elBloqueDelGuionDe/);
        assert.match(leer("components/videollamada/SalaDeLaVideollamada.tsx"), /text: saludo \|\| SALUDO_INICIAL/);
        const canales = leer("lib/channel-training.ts");
        assert.match(canales, /slug: 'videollamadas'.*agentId: 'system-prompt-ai-videollamadas', kind: 'chat'/);
        const orden = [...canales.matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1]);
        assert.deepEqual(orden, ["whatsapp", "llamadas", "videollamadas", "whatsapp-api", "telegram", "facebook", "instagram"]);
        const pagina = leer("app/(root)/ia/[channel]/page.tsx");
        assert.ok(!/GuionVideollamadaEditor|kind === 'video'/.test(pagina));
    });

    test("con entrenamiento escrito, el contexto lleva ese texto y no el guion", async () => {
        if (process.env.MODO === "roto") return;
        const p = await import("./.compilado/pantalla-del-avatar.js");
        const con = p.elBloqueDelGuion("lunes 9:00", null, "Eres Verzy de Café X. PERFIL-UNICO");
        assert.ok(con.includes("PERFIL-UNICO") && con.includes("lunes 9:00"));
        assert.ok(!con.includes("GUION DE LA LLAMADA"));
        const sin = p.elBloqueDelGuion("lunes 9:00", null, "   ");
        assert.ok(sin.includes("GUION DE LA LLAMADA"));
    });
}
