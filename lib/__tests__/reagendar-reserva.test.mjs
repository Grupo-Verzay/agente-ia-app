/**
 * Multiagenda igualada a Agenda — la regla y un barrido, sin base.
 *
 *  - Qué recordatorios lleva una reserva (`losRecordatoriosDeLaReserva`): los
 *    del servicio si tiene, y si no los de la agenda de la cuenta; solo los que
 *    no han pasado; con la MISMA hora estricta que Agenda.
 *  - Que los DOS tableros de Multiagenda ofrecen «Reagendar» con el MISMO
 *    diálogo que Agenda (`DialogoDeReagendar de="reserva"`), que avisan al
 *    cliente al cambiar el estado, que el calendario confirma antes de
 *    cancelar, y que crear y reagendar programan con la MISMA regla.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` con `git show` y AFIRMA el
 * fallo: ni reagendar, ni aviso, ni automatizaciones.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "16e81b7";

function leer(ruta) {
    if (ROTO) {
        try {
            return execSync(`git show ${ANTES}:${JSON.stringify(ruta).slice(1, -1)}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        } catch {
            return "";
        }
    }
    return readFileSync(ruta, "utf8");
}

const CALENDARIO = "app/(root)/bookings/_components/dashboard/BookingsDashboardCalendar.tsx";
const TABLERO = "app/(root)/bookings/_components/dashboard/BookingsKanban.tsx";
const ACCIONES = "actions/bookings-actions.ts";
const RUTA = "app/api/bookings/appointment/route.ts";

test("los dos tableros de Multiagenda ofrecen «Reagendar» con el MISMO diálogo que Agenda", () => {
    for (const f of [CALENDARIO, TABLERO]) {
        const s = leer(f);
        if (ROTO) {
            assert.ok(!s.includes("DialogoDeReagendar"), `${f}: antes no había reagendar`);
            continue;
        }
        assert.match(s, /<DialogoDeReagendar\s+de="reserva"/, `${f}: el diálogo de Agenda, con las acciones de reservas`);
    }
    if (!ROTO) {
        assert.match(leer(CALENDARIO), /OPCION_REAGENDAR/, "el calendario la ofrece al lado de los estados, como Agenda");
        assert.match(leer(TABLERO), /data-reagendar-tarjeta/, "el tablero en su tarjeta, como Agenda");
    }
});

test("cambiar el estado avisa al cliente desde los dos tableros, y cancelar se confirma", () => {
    const cal = leer(CALENDARIO);
    const tab = leer(TABLERO);
    if (ROTO) {
        assert.ok(!cal.includes("sendBookingStatusNotification") && !tab.includes("sendBookingStatusNotification"), "antes no se avisaba");
        return;
    }
    assert.match(cal, /sendBookingStatusNotification/);
    assert.match(tab, /sendBookingStatusNotification/);
    assert.match(cal, /status !== 'FINALIZADO' && status !== 'DESCARTADO'/, "Finalizado y Descartado no se avisan, como en Agenda");
    assert.match(cal, /data-confirmar-cancelacion/, "cancelar pasa por la confirmación, como en Agenda");
});

test("el servidor dispara las automatizaciones con la MISMA función que Agenda", () => {
    const acciones = leer(ACCIONES);
    const citas = leer("actions/appointments-actions.ts");
    if (ROTO) {
        assert.ok(!acciones.includes("appt-automations") && !acciones.includes("dispararLasAutomatizacionesDeCita"), "antes no se disparaban");
        return;
    }
    assert.match(acciones, /dispararLasAutomatizacionesDeCita\(/);
    assert.match(citas, /dispararLasAutomatizacionesDeCita/, "Agenda usa la misma");
    assert.ok(!/fetch\([^)]*appt-automations/.test(citas), "ninguna de las dos lleva su copia del fetch");
});

test("crear una reserva y reagendarla programan recordatorios con la MISMA regla", () => {
    const ruta = leer(RUTA);
    const reprog = ROTO ? "" : readFileSync("lib/reagendar-reserva.server.ts", "utf8");
    if (ROTO) {
        assert.ok(!ruta.includes("losRecordatoriosDeLaReserva"));
        return;
    }
    assert.match(ruta, /losRecordatoriosDeLaReserva\(/);
    assert.match(reprog, /losRecordatoriosDeLaReserva\(/);
});

test("la regla de los recordatorios de una reserva", async (t) => {
    if (ROTO) return;
    const { losRecordatoriosDeLaReserva, esRecordatorioDeReserva, losRecordatoriosDelServicio } = await import(
        "./.compilado/reagendar-reserva/recordatorios-de-la-reserva.js"
    );
    const ahora = new Date("2026-10-01T12:00:00Z");
    const inicio = new Date("2026-10-03T15:00:00Z");
    const datos = { nombreDelCliente: "Ana", inicio, zona: "America/Bogota", duracionMinutos: 45, servicio: "Corte" };
    const plantillas = [
        { id: "p24", time: "days-1", description: "Hola @client_name, mañana: @service_name" },
        { id: "p3", time: "hours-3", description: "En 3 horas" },
        { id: "roto", time: "2026-09-28T10:00:00Z", description: "ISO: no cuenta" },
    ];

    await t.test("sin recordatorios propios del servicio mandan las plantillas de agenda", () => {
        const r = losRecordatoriosDeLaReserva({ servicioId: "s1", delServicio: null, plantillas, datos }, ahora);
        assert.deepEqual(r.map((x) => [x.idNodo, x.cuando]), [
            ["booking-reminder-p24", "2026-10-02T15:00:00.000Z"],
            ["booking-reminder-p3", "2026-10-03T12:00:00.000Z"],
        ]);
        assert.equal(r[0].mensaje, "Hola Ana, mañana: Corte");
    });

    await t.test("con recordatorios propios mandan esos y no las plantillas", () => {
        const r = losRecordatoriosDeLaReserva(
            { servicioId: "s1", delServicio: [{ timeMinutes: 60, message: "1h @client_name" }, { timeMinutes: 0, message: "no" }, { message: "sin minutos" }], plantillas, datos },
            ahora,
        );
        assert.deepEqual(r.map((x) => [x.idNodo, x.cuando, x.mensaje]), [["booking-svc-reminder-s1-0", "2026-10-03T14:00:00.000Z", "1h Ana"]]);
    });

    await t.test("los que ya pasaron no se programan", () => {
        const pronto = { ...datos, inicio: new Date(ahora.getTime() + 2 * 3_600_000) };
        const r = losRecordatoriosDeLaReserva({ servicioId: "s1", delServicio: null, plantillas, datos: pronto }, ahora);
        assert.equal(r.length, 0);
    });

    await t.test("qué es un recordatorio de reserva", () => {
        assert.equal(esRecordatorioDeReserva("booking-reminder-x"), true);
        assert.equal(esRecordatorioDeReserva("booking-svc-reminder-s-0"), true);
        assert.equal(esRecordatorioDeReserva("appt-reminder-x"), false);
        assert.equal(esRecordatorioDeReserva(null), false);
        assert.equal(losRecordatoriosDelServicio("nada").length, 0);
    });
});
