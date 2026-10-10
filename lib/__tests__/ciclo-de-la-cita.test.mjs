/**
 * Las reglas del ciclo automático de la cita (`lib/ciclo-de-la-cita.ts`), sin
 * base: qué recordatorios salen y cuándo, qué cuenta como «Sí»/«No», qué es un
 * rechazo literal y qué hace la espera minuto a minuto.
 *
 * Se levanta con `scripts/banco-ciclo-de-la-cita.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    BOTONES_DE_ASISTENCIA,
    MINUTOS_DE_ESPERA,
    PRORROGA_MAXIMA_MIN,
    elLimiteDeLaEspera,
    elNodoDelCiclo,
    esUnRechazoLiteral,
    laDecisionDeLaLlamada,
    laEsperaConProrroga,
    laLlaveDelCiclo,
    laRespuestaDeAsistencia,
    losRecordatoriosDelCiclo,
    queHacerEnLaEspera,
    sePuedeDescartar,
} from "./.compilado/ciclo-de-la-cita/ciclo-de-la-cita.js";

const INICIO = new Date("2026-10-12T20:00:00.000Z"); // 15:00 en Bogotá
const min = (n) => new Date(INICIO.getTime() + n * 60_000);
const DATOS = { nombreDelCliente: "Ana", inicio: INICIO, zona: "America/Bogota", servicio: "Asesoría", enlaceDeReunion: "https://x/videollamada/ana" };

test("los cuatro recordatorios: 3 h, 1 h con botones, 30 min y el enlace a la hora", () => {
    const r = losRecordatoriosDelCiclo(DATOS, min(-24 * 60));
    assert.deepEqual(r.map((x) => x.clave), ["3h", "1h", "30m", "0"]);
    assert.deepEqual(r.map((x) => x.cuando), [min(-180), min(-60), min(-30), INICIO].map((d) => d.toISOString()));
    assert.deepEqual(r.map((x) => x.tipo), ["text", "botones", "text", "text"]);
    assert.match(r[0].mensaje, /3:00/);
    assert.match(r[1].mensaje, /Confirmas tu asistencia/);
    assert.match(r[1].mensaje, /\*Sí\* o \*No\*/, "el texto lleva el «Sí/No» por si la línea no pinta botones");
    assert.match(r[2].mensaje, /por comenzar/);
    assert.match(r[3].mensaje, /https:\/\/x\/videollamada\/ana/, "a la hora va el enlace de la reunión");
    assert.deepEqual([...BOTONES_DE_ASISTENCIA], ["Sí", "No"]);
});

test("una cita agendada con poco margen no recibe los que ya pasaron", () => {
    const r = losRecordatoriosDelCiclo(DATOS, min(-45));
    assert.deepEqual(r.map((x) => x.clave), ["30m", "0"]);
});

test("las llaves caen bajo el prefijo que reagendar y cancelar ya borran", () => {
    assert.equal(laLlaveDelCiclo("c1", "1h"), "appt-reminder:c1:ciclo-1h");
    assert.ok(elNodoDelCiclo("0").startsWith("appt-reminder-"), "el motor los manda a su hora por ese prefijo");
});

test("«Sí»/«No»: solo cuando el mensaje ES la respuesta", () => {
    for (const t of ["Sí", "si", "SI!", "✅ Sí", "sí, confirmo", "Si voy"]) assert.equal(laRespuestaDeAsistencia(t), "si", t);
    for (const t of ["No", "no.", "No puedo", "no voy a poder"]) assert.equal(laRespuestaDeAsistencia(t), "no", t);
    for (const t of ["sí, pero ¿puedo cambiar la hora?", "no sé", "ok", "", "nos vemos", "si me interesa mucho el plan"]) {
        assert.equal(laRespuestaDeAsistencia(t), null, t);
    }
});

test("Descartado: solo un rechazo explícito y literal, sin inferir tono", () => {
    for (const t of ["No me interesa", "Gracias, pero no estoy interesada.", "esto no es lo que buscaba", "ya no me interesa, gracias"]) {
        assert.equal(esUnRechazoLiteral(t), true, t);
    }
    for (const t of [
        "la voy a cancelar",           // coloquial: puede ser reagendar
        "no llego a tiempo",
        "mejor otro día",
        "¿y si no me interesa?",       // una pregunta no es un rechazo
        "no es que no me interese",
        "me interesa mucho",
        "uff no sé",
    ]) {
        assert.equal(esUnRechazoLiteral(t), false, t);
    }
    assert.equal(sePuedeDescartar("ATENDIDA"), true);
    for (const e of ["CANCELADA", "FINALIZADO", "DESCARTADO"]) assert.equal(sePuedeDescartar(e), false, e);
});

const BASE = { estado: "PENDIENTE", inicio: INICIO, entroEn: null, asistencia: null, llamadaEn: null, decision: null, esperaHasta: null };

test("la espera, minuto a minuto", () => {
    assert.equal(queHacerEnLaEspera(BASE, min(-1)), "nada", "antes de la hora no se hace nada");
    assert.equal(queHacerEnLaEspera(BASE, min(0)), "esperar");
    assert.equal(queHacerEnLaEspera(BASE, min(4)), "esperar");
    assert.equal(queHacerEnLaEspera(BASE, min(5)), "llamar", "minuto 5: la IA de voz llama");
    assert.equal(queHacerEnLaEspera({ ...BASE, llamadaEn: min(5) }, min(6)), "esperar", "una sola llamada");
    assert.equal(queHacerEnLaEspera({ ...BASE, llamadaEn: min(5) }, min(MINUTOS_DE_ESPERA)), "no_asistida", "minuto 10: No asistida");
    assert.equal(queHacerEnLaEspera(BASE, min(MINUTOS_DE_ESPERA)), "no_asistida", "aunque la llamada no saliera");
});

test("si entra, Atendida (también si entra antes de la hora)", () => {
    assert.equal(queHacerEnLaEspera({ ...BASE, entroEn: min(-3) }, min(-2)), "atendida");
    assert.equal(queHacerEnLaEspera({ ...BASE, entroEn: min(7), llamadaEn: min(5) }, min(8)), "atendida");
});

test("pide más tiempo: se extiende la espera; dice que no puede: No asistida, nunca Cancelada", () => {
    const pedida = laDecisionDeLaLlamada({ decision: "mas_tiempo", minutos: 15 });
    assert.deepEqual(pedida, { decision: "mas_tiempo", minutos: 15 });
    const hasta = laEsperaConProrroga(INICIO, min(6), 15);
    assert.equal(hasta.toISOString(), min(21).toISOString());
    const e = { ...BASE, llamadaEn: min(5), decision: "mas_tiempo", esperaHasta: hasta };
    assert.equal(elLimiteDeLaEspera(e).toISOString(), min(21).toISOString());
    assert.equal(queHacerEnLaEspera(e, min(12)), "esperar", "al minuto 12 se sigue esperando");
    assert.equal(queHacerEnLaEspera(e, min(21)), "no_asistida", "acabada la prórroga, No asistida");

    assert.equal(laEsperaConProrroga(INICIO, min(5), 2).toISOString(), min(MINUTOS_DE_ESPERA).toISOString(), "nunca menos que el minuto 10");
    assert.equal(laDecisionDeLaLlamada({ decision: "mas_tiempo", minutos: 300 }).minutos, PRORROGA_MAXIMA_MIN, "con tope");
    assert.equal(laDecisionDeLaLlamada({ decision: "mas_tiempo" }).minutos, 10, "sin minutos, los de por defecto");

    assert.equal(queHacerEnLaEspera({ ...BASE, llamadaEn: min(5), decision: "no_puede" }, min(6)), "no_asistida");
    assert.equal(laDecisionDeLaLlamada({ decision: "cancelar" }), null, "«cancelar» no es una decisión de la llamada");
});

test("quien dijo «No» al recordatorio no recibe la llamada", () => {
    assert.equal(queHacerEnLaEspera({ ...BASE, asistencia: "no" }, min(6)), "esperar");
    assert.equal(queHacerEnLaEspera({ ...BASE, asistencia: "si" }, min(6)), "llamar", "el «Sí» no salta la llamada si no entra");
});

test("solo se mueven Pendiente y Confirmada, y nunca una cita vieja", () => {
    for (const estado of ["CANCELADA", "FINALIZADO", "DESCARTADO", "ATENDIDA", "NO_ASISTIDA"]) {
        assert.equal(queHacerEnLaEspera({ ...BASE, estado }, min(30)), "nada", estado);
    }
    assert.equal(queHacerEnLaEspera({ ...BASE, estado: "CONFIRMADA" }, min(30)), "no_asistida");
    assert.equal(queHacerEnLaEspera(BASE, min(24 * 60)), "nada", "un reloj parado no marca las de ayer al volver");
});
