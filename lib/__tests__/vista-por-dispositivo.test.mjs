// La pantalla que comparte Verzy se ve en el formato de CADA sala: vertical en
// el teléfono, intermedio en la tableta y horizontal en el ordenador, con la
// MISMA página para todos.
//
// Antes la pantalla de una cita era una sola ventana y la última sala en decir
// su tamaño se la quedaba: con el cliente en el teléfono y alguien en el
// ordenador, los dos veían lo mismo.
//
// La pantalla de Verzy de verdad (Chromium, CDP, screencast) contra Postgres y
// una plataforma de mentira que sirve `/inicio` y `/diagnostico` y apunta el agente de cada
// petición. Las tres salas piden su tamaño; cada flujo (`abrirElFlujo` con su
// dispositivo) se mide por el tamaño de su JPEG.
// Lo corre `scripts/banco-vista-por-dispositivo.sh`.
//
// `MODO=roto` carga la pantalla de `ANTES_REF` y afirma el fallo: el teléfono
// y el ordenador reciben el mismo fotograma.
import test from "node:test";
import assert from "node:assert/strict";

const MODO = process.env.MODO ?? "bueno";
const { levantarLaPlataforma } = await import("./vista-por-dispositivo/plataforma.mjs");
const plataforma = await levantarLaPlataforma(Number(process.env.PORT));
const { P, elTamanoDeLaPantalla, db } = await import("./.compilado/vista-por-dispositivo/entrada.js");
const CITA = "cita-vistas";

/** Ancho y alto de un JPEG (marcador SOF). */
function lasMedidas(jpeg) {
    for (let i = 2; i < jpeg.length - 9; ) {
        if (jpeg[i] !== 0xff) { i += 1; continue; }
        const m = jpeg[i + 1];
        const largo = jpeg.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xc3) return { alto: jpeg.readUInt16BE(i + 5), ancho: jpeg.readUInt16BE(i + 7) };
        i += 2 + largo;
    }
    return null;
}

/** El primer fotograma NUEVO del flujo de un dispositivo, pasado `desde`. */
async function unFotograma(dispositivo, esperaMs = 1_500) {
    const corte = new AbortController();
    const fotos = [];
    const flujo = P.abrirElFlujo(CITA, (j) => fotos.push(j), corte.signal, dispositivo);
    await new Promise((ok) => setTimeout(ok, esperaMs));
    corte.abort();
    await flujo;
    const ultima = fotos.at(-1);
    return ultima ? lasMedidas(ultima) : null;
}
const orden = (o) => P.pedirALaPantalla(CITA, o);
const tamano = (ancho, alto, dispositivo) => ({ tipo: "tamano", datos: elTamanoDeLaPantalla(ancho, alto, dispositivo) });

test("cada sala ve la pantalla de Verzy en el formato de SU dispositivo", async (t) => {
    // El cliente entra por el teléfono (es el primero en hablar), luego un
    // asesor en el ordenador y alguien en una tableta.
    assert.equal((await orden(tamano(390, 700, "movil"))).ok, true);
    assert.equal((await orden({ tipo: "ir", datos: { lugar: "/diagnostico" } })).ok, true);
    assert.equal((await orden(tamano(1280, 720, "pc"))).ok, true);
    assert.equal((await orden(tamano(820, 1000, "tablet"))).ok, true);
    await new Promise((ok) => setTimeout(ok, 2_500));

    const movil = await unFotograma("movil");
    const pc = await unFotograma("pc");
    const tablet = await unFotograma("tablet");
    console.info("[banco] fotogramas", { movil, pc, tablet, vistas: P.lasVistasDeLaPantalla?.(CITA) });
    assert.ok(movil && pc && tablet, "los tres flujos dan fotogramas");

    if (MODO === "roto") {
        await t.test("ANTES: el teléfono y el ordenador veían el mismo fotograma", () => {
            assert.deepEqual(movil, pc);
        });
        return;
    }

    await t.test("el teléfono la ve en VERTICAL", () => {
        assert.ok(movil.alto > movil.ancho, JSON.stringify(movil));
    });
    await t.test("el ordenador la ve en HORIZONTAL", () => {
        assert.ok(pc.ancho > pc.alto, JSON.stringify(pc));
    });
    await t.test("la tableta, en su formato intermedio (ni el del teléfono ni el del ordenador)", () => {
        assert.notDeepEqual(tablet, movil);
        assert.notDeepEqual(tablet, pc);
        const formato = tablet.ancho / tablet.alto;
        assert.ok(formato > movil.ancho / movil.alto && formato < pc.ancho / pc.alto, `formato ${formato}`);
    });
    await t.test("todas enseñan la MISMA página, cada una con su vista de la plataforma", async () => {
        const vistas = P.lasVistasDeLaPantalla(CITA);
        assert.deepEqual(vistas.map((v) => v.dispositivo).sort(), ["movil", "pc", "tablet"]);
        for (const v of vistas) assert.match(v.url, /\/diagnostico$/, `${v.dispositivo}: ${v.url}`);
        const agentes = globalThis.__peticiones.filter((p) => p.ruta === "/diagnostico").map((p) => p.agente);
        assert.ok(agentes.some((a) => /Pixel 8\b.*Mobile/.test(a)), "la pidió un teléfono");
        assert.ok(agentes.some((a) => /Pixel Tablet/.test(a)), "la pidió una tableta");
        assert.ok(agentes.some((a) => /X11; Linux/.test(a)), "la pidió un ordenador");
    });
    await t.test("cuando Verzy enseña los planes, los espejos van a la misma página y bajan a los precios", async () => {
        // «/planes» lleva a la landing, en su sección de precios (`#pricing`).
        assert.equal((await orden({ tipo: "ir", datos: { lugar: "/planes" } })).ok, true);
        await new Promise((ok) => setTimeout(ok, 2_500));
        const vistas = P.lasVistasDeLaPantalla(CITA);
        for (const v of vistas) assert.match(v.url, /\/inicio(#pricing)?$/, `${v.dispositivo}: ${v.url}`);
        for (const v of vistas.filter((x) => x.papel === "espejo")) {
            assert.ok(v.bajada > 0.3, `${v.dispositivo} bajó ${v.bajada}`);
        }
    });
});

test.after(async () => {
    await db.$disconnect().catch(() => {});
    plataforma.close();
    setTimeout(() => process.exit(0), 200).unref?.();
});
