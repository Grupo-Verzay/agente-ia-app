/**
 * Las reglas de los recordatorios de cita y de la zona de la cuenta, sin base.
 *
 * `MODO=roto` corre las formas de antes escritas aquí LITERALES —el
 * `normalizeTimeToSeconds` indulgente de las dos rutas de la API y el texto con
 * la hora en la zona del teléfono del cliente— y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const r = ROTO ? null : await import("./.compilado/recordatorios-de-la-cita/recordatorios-de-la-cita.js");
const z = ROTO ? null : await import("./.compilado/recordatorios-de-la-cita/zona-de-la-cuenta.js");

/** EL DE ANTES, literal (app/api/schedule/appointment/route.ts). */
function normalizeTimeToSecondsDeAntes(timeStr) {
    const unitToSeconds = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
    const [unit, valueStr] = (timeStr ?? "").split("-");
    const value = parseInt(valueStr, 10);
    if (unit in unitToSeconds && !isNaN(value)) return value * unitToSeconds[unit];
    const raw = parseInt(timeStr, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

const HORA_ISO_DE_LA_AUTOMATIZACION = "2026-09-28T15:00:00.000Z";

test("una plantilla con la hora de la acción «Recordatorio» (ISO) no programa nada", () => {
    if (ROTO) {
        // 2026 segundos: el recordatorio de más ~34 minutos antes de cada cita.
        assert.equal(normalizeTimeToSecondsDeAntes(HORA_ISO_DE_LA_AUTOMATIZACION), 2026);
        assert.equal(Math.round(2026 / 60), 34);
        return;
    }
    assert.equal(r.segundosAntesDeLaCita(HORA_ISO_DE_LA_AUTOMATIZACION), 0);
    assert.equal(r.segundosAntesDeLaCita("1800"), 0, "un número suelto tampoco");
    assert.equal(r.segundosAntesDeLaCita("hours-3"), 3 * 3600);
    assert.equal(r.segundosAntesDeLaCita("hours-1"), 3600);
    assert.equal(r.segundosAntesDeLaCita("minutes-30"), 1800);
    assert.equal(r.segundosAntesDeLaCita("days-1"), 86400);
    assert.equal(r.segundosAntesDeLaCita("hours-0"), 0);
});

test("los recordatorios de 3 h y 1 h de una cita: su instante y su texto en la zona de la CUENTA", { skip: ROTO }, () => {
    const inicio = new Date("2026-10-05T15:00:00.000Z"); // 10:00 en Bogotá
    const salida = r.losRecordatoriosDeLaCita(
        [
            { id: "p3", time: "hours-3", description: "Hola @client_name, tu cita de @service_name es el @appointment_datetime" },
            { id: "p1", time: "hours-1", description: "En una hora: @appointment_datetime" },
            { id: "basura", time: HORA_ISO_DE_LA_AUTOMATIZACION, description: "no" },
        ],
        { nombreDelCliente: "Ana", inicio, zona: "America/Bogota", duracionMinutos: 30, servicio: "Corte" },
        new Date("2026-10-01T00:00:00Z"),
    );
    assert.deepEqual(salida.map((s) => [s.plantillaId, s.cuando]), [
        ["p3", "2026-10-05T12:00:00.000Z"],
        ["p1", "2026-10-05T14:00:00.000Z"],
    ]);
    assert.match(salida[0].mensaje, /^Hola Ana, tu cita de Corte es el 05\/10\/2026 10:00 AM \(hora Bogota\)\.$/);
});

test("un cliente con teléfono de otro país lee la hora de la CUENTA, no la de su país", () => {
    const inicio = new Date("2026-10-05T15:00:00.000Z");
    if (ROTO) {
        // Lo de antes: la zona salía de `getTimezoneFromPhone` (España para un +34).
        const antes = new Intl.DateTimeFormat("es", { timeZone: "Europe/Madrid", hour: "numeric" }).format(inicio);
        assert.equal(antes, "17", "la cita de las 10 en Bogotá le llegaba como a las 17");
        return;
    }
    const texto = r.elTextoDelRecordatorio("@appointment_datetime", {
        nombreDelCliente: "Ana", inicio, zona: "America/Bogota", duracionMinutos: 30,
    });
    assert.match(texto, /10:00 AM \(hora Bogota\)/);
});

test("un recordatorio manual se lee en el reloj de SU cuenta", { skip: ROTO }, () => {
    assert.equal(z.laHoraParaElMotor("28/09/2026 15:30", "America/Bogota"), "2026-09-28T20:30:00.000Z");
    assert.equal(z.laHoraParaElMotor("28/09/2026 15:30", "Europe/Madrid"), "2026-09-28T13:30:00.000Z");
    assert.equal(z.laHoraParaElMotor("28/09/2026 15:30", "America/Mexico_City", 60), "2026-09-28T21:31:00.000Z");
    assert.equal(z.laHoraParaElMotor("2026-09-28T20:30:00.000Z", "Europe/Madrid"), "2026-09-28T20:30:00.000Z");
    assert.equal(z.laZonaDeLaCuenta("Nada/Inventada"), "America/Bogota");
    assert.equal(z.deInstanteAReloj(new Date("2026-09-28T20:30:00Z"), "America/Bogota"), "28/09/2026 15:30");
});

test("barrido: los cuatro caminos de una cita usan la MISMA regla", { skip: ROTO }, async () => {
    const { readFileSync } = await import("node:fs");
    const leer = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
    assert.match(leer("actions/appointments-actions.ts"), /programarLosRecordatoriosDeLaCita\(created\.id\)/, "el chat pasa por createAppointment");
    assert.match(leer("lib/cita-publica.server.ts"), /programarLosRecordatoriosDeLaCita\(/);
    const agente = leer("app/api/schedule/appointment/route.ts");
    assert.doesNotMatch(agente, /db\.seguimiento\.create/, "el agente ya no programa por su cuenta");
    assert.doesNotMatch(agente, /getTimezoneFromPhone\(/);
    const reservas = leer("app/api/bookings/appointment/route.ts");
    assert.match(reservas, /segundosAntesDeLaCita/);
    assert.doesNotMatch(reservas, /getTimezoneFromPhone\(/);
    assert.doesNotMatch(reservas, /parseInt\(timeStr/);
});
