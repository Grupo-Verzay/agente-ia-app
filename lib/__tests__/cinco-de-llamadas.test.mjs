/**
 * Los cinco asuntos de CRM › Llamadas: la DECISIÓN, sin navegador.
 *
 * `MODO=roto` carga lo que había en ANTES_REF y **afirma los fallos**: Detalle
 * enseñaba la síntesis del lead, y había siete resultados con «Agendó»,
 * «Buzón de voz» y «Número equivocado». Lo que no existía antes —la
 * propuesta de la IA y el reproductor— no tiene «antes» que afirmar, y se
 * dice en vez de fingirlo.
 *
 * Se levanta con `scripts/banco-cinco-de-llamadas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/cinco-de-llamadas-puro.mjs");

const SINTESIS = "Lead de tres sedes, viene de la campaña de agosto";
const RESUMEN = "- Pidió la cotización del plan anual\n- Quiere que le llamen el jueves";

test("1 · Detalle: la primera línea del RESUMEN de la llamada, no la síntesis del lead", () => {
    const llamada = { leadSynthesis: SINTESIS, summary: RESUMEN, transcript: "Agente: hola" };
    if (ROTO) {
        assert.equal(m.elDetalleDeLaLlamada(llamada), SINTESIS, "el roto no reproduce: ya enseñaba el resumen");
        return;
    }
    assert.equal(m.elDetalleDeLaLlamada(llamada), "Pidió la cotización del plan anual", "sin la viñeta");
});

test("1 · Detalle sin resumen: vacío —la tabla pinta «Sin detalle»—, aunque haya síntesis y transcripción", () => {
    const sinResumen = { leadSynthesis: SINTESIS, summary: null, transcript: "Agente: hola\nCliente: no" };
    if (ROTO) {
        assert.notEqual(m.elDetalleDeLaLlamada(sinResumen), "", "el roto no reproduce");
        return;
    }
    assert.equal(m.elDetalleDeLaLlamada(sinResumen), "");
    assert.equal(m.elDetalleDeLaLlamada({ summary: "   \n\n" }), "");
    assert.equal(m.elDetalleDeLaLlamada({ summary: "## Resumen\n**Interesado** en el plan" }), "Resumen");
});

test("5 · los resultados son CINCO, en su orden, y «Agendó» es «Link enviado»", () => {
    const rotulos = m.CALL_DISPOSITIONS.map((d) => d.label);
    if (ROTO) {
        assert.ok(rotulos.includes("Buzón de voz"), "el roto no reproduce");
        assert.ok(rotulos.includes("Número equivocado"));
        assert.equal(rotulos.length, 7);
        return;
    }
    assert.deepEqual(rotulos, ["Interesado", "Link enviado", "Volver a llamar", "No contesta", "No interesado"]);
    // Lo guardado antes no se reescribe: se LEE como el de ahora.
    assert.equal(m.getDispositionMeta("agendo")?.label, "Link enviado");
    assert.equal(m.getDispositionMeta("buzon")?.label, "No contesta");
    assert.equal(m.getDispositionMeta("numero_equivocado"), null, "vuelve a «Marcar resultado»");
    assert.equal(m.getDispositionMeta(null), null, "sin clasificar: «Marcar resultado»");
});

test("5 · lo que contesta la IA se lee como uno de los cinco, y Link enviado gana sobre Interesado", () => {
    if (ROTO) return; // no había clasificación automática
    const casos = {
        interesado: "interesado",
        link_enviado: "link_enviado",
        volver_llamar: "Volver a llamar",
        no_contesta: "no_contesta",
        no_interesado: "No interesado.",
    };
    for (const [valor, contesta] of Object.entries(casos)) {
        assert.equal(m.leerElResultadoDeLaIa(contesta), valor, `«${contesta}»`);
    }
    assert.equal(m.leerElResultadoDeLaIa("Interesado, y se le envió: link enviado"), "link_enviado");
    assert.equal(m.leerElResultadoDeLaIa("no interesado"), "no_interesado", "no se confunde con interesado");
    assert.equal(m.leerElResultadoDeLaIa("buzón de voz"), null, "lo que no es de los cinco no se inventa");
    assert.equal(m.resultadoSinConversacion({ transcript: "" }), "no_contesta", "sin conversación no se pregunta");
    assert.equal(m.resultadoSinConversacion({ transcript: "hola" }), null);
});

test("5 · la persona MANDA: la IA solo escribe sobre vacío o sobre lo suyo", () => {
    if (ROTO) return;
    assert.equal(m.laIaPuedeEscribir({ disposition: null }), true);
    assert.equal(m.laIaPuedeEscribir({ disposition: "interesado", dispositionSource: "ia" }), true);
    assert.equal(m.laIaPuedeEscribir({ disposition: "interesado", dispositionSource: "manual" }), false);
    assert.equal(m.laIaPuedeEscribir({ disposition: "agendo" }), false, "lo de antes, sin origen, es de una persona");
    assert.deepEqual(m.elResultadoQueSeVe({ disposition: "link_enviado", dispositionSource: "ia" }), {
        valor: "link_enviado",
        deIa: true,
    });
    assert.deepEqual(m.elResultadoQueSeVe({ disposition: "link_enviado", dispositionSource: "manual" }), {
        valor: "link_enviado",
        deIa: false,
    });
    assert.deepEqual(m.elResultadoQueSeVe({ disposition: null, dispositionSource: "ia" }), { valor: null, deIa: false });
});

test("3 · el reproductor: el total es el de la columna Duración, sin esperar al audio", () => {
    if (ROTO) return; // el <audio> nativo no tenía total propio
    assert.equal(m.laDuracionDelReproductor(187, Number.NaN), 187, "antes de bajar metadatos");
    assert.equal(m.laDuracionDelReproductor(187, 190.4), 187, "manda la columna Duración");
    assert.equal(m.laDuracionDelReproductor(0, Number.POSITIVE_INFINITY), 0, "un webm sin cabecera no es un total");
    assert.equal(m.laDuracionDelReproductor(0, 42.5), 42.5, "sin Duración, la del audio");
    assert.equal(m.elTiempoDelReproductor(187), "3:07");
    assert.equal(m.elTiempoDelReproductor(3725), "1:02:05");
    assert.equal(m.elTiempoDelReproductor(Number.NaN), "0:00");
});
