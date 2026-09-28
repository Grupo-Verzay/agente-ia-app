/**
 * «Reagendar» una cita: la regla pura y un barrido del código.
 *
 *  - La regla (`lib/reagendar-cita.ts`): en qué estado queda, qué franja se
 *    acepta, qué recordatorios se programan y con qué números se buscan los
 *    viejos.
 *  - El barrido: el MISMO diálogo en los cuatro sitios donde se cambia el
 *    estado de una cita (Agenda, su tablero, la cabecera del chat y la ficha
 *    del CRM), y el MISMO selector de fecha y hora que agendar.
 *
 * `MODO=roto` lee esos cuatro ficheros de `ANTES_REF` y afirma que en
 * ninguno había forma de reagendar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import {
    OPCION_REAGENDAR,
    ROTULO_REAGENDAR,
    comoFranjaNueva,
    elEstadoAlReagendar,
    elIdNodoDelRecordatorio,
    esLaOpcionDeReagendar,
    laDuracionDeLaCita,
    losNumerosDelCliente,
    losQueTodaviaNoPasan,
} from "./.compilado/reagendar/reagendar-cita.js";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "626a48c";

const LOS_CUATRO = [
    "app/(root)/schedule/_components/dashboard/CustomCalendar.tsx",
    "app/(root)/schedule/_components/dashboard/AgendaKanban.tsx",
    "app/(root)/chats/_components/ChatAppointmentStatusButton.tsx",
    "app/(root)/crm/components/LeadSeguimientosTab.tsx",
];

function leer(ruta) {
    if (ROTO) return execSync(`git show ${ANTES_REF}:"${ruta}"`, { encoding: "utf8", maxBuffer: 1 << 26 });
    return readFileSync(ruta, "utf8");
}

const AHORA = new Date("2026-09-28T12:00:00Z");

test("el estado: Pendiente y Confirmada se quedan; lo demás vuelve a Pendiente", () => {
    assert.equal(elEstadoAlReagendar("PENDIENTE"), "PENDIENTE");
    assert.equal(elEstadoAlReagendar("CONFIRMADA"), "CONFIRMADA");
    for (const e of ["ATENDIDA", "NO_ASISTIDA", "CANCELADA", "FINALIZADO", "DESCARTADO", null, undefined, "otra"]) {
        assert.equal(elEstadoAlReagendar(e), "PENDIENTE", String(e));
    }
});

test("la franja nueva: futura, con el final después del inicio y distinta de la actual", () => {
    const actual = { inicio: "2026-09-29T15:00:00Z", fin: "2026-09-29T16:00:00Z" };
    const ok = comoFranjaNueva("2026-10-01T15:00:00Z", "2026-10-01T16:00:00Z", actual, AHORA);
    assert.equal(ok.ok, true);
    assert.equal(ok.franja.inicio.toISOString(), "2026-10-01T15:00:00.000Z");

    assert.equal(comoFranjaNueva("", "", actual, AHORA).ok, false);
    assert.equal(comoFranjaNueva("no", "es fecha", actual, AHORA).ok, false);
    assert.equal(comoFranjaNueva(7, 8, actual, AHORA).ok, false);
    const alReves = comoFranjaNueva("2026-10-01T16:00:00Z", "2026-10-01T15:00:00Z", actual, AHORA);
    assert.equal(alReves.ok, false);
    const pasada = comoFranjaNueva("2026-09-27T15:00:00Z", "2026-09-27T16:00:00Z", actual, AHORA);
    assert.equal(pasada.ok, false);
    assert.match(pasada.motivo, /ya pasó/);
    const igual = comoFranjaNueva(actual.inicio, actual.fin, actual, AHORA);
    assert.equal(igual.ok, false);
    assert.match(igual.motivo, /ya está en ese horario/);
});

test("reagendar conserva la duración de la cita", () => {
    assert.equal(laDuracionDeLaCita("2026-10-01T15:00:00Z", "2026-10-01T16:30:00Z"), 90);
    assert.equal(laDuracionDeLaCita("2026-10-01T15:00:00Z", "2026-10-01T15:00:00Z", 45), 45);
    assert.equal(laDuracionDeLaCita("x", "y", 60), 60);
});

test("solo se programan los recordatorios que todavía no han pasado", () => {
    const r = losQueTodaviaNoPasan(
        [
            { cuando: "2026-09-28T11:00:00Z", n: "pasado" },
            { cuando: "2026-09-28T12:00:00Z", n: "justo ahora" },
            { cuando: "2026-09-28T15:00:00Z", n: "3h" },
            { cuando: "nada", n: "roto" },
        ],
        AHORA,
    );
    assert.deepEqual(r.map((x) => x.n), ["3h"]);
});

test("los números del cliente: todas sus formas, y un @lid no se convierte en teléfono", () => {
    assert.deepEqual(
        losNumerosDelCliente("573001112233@s.whatsapp.net").sort(),
        ["573001112233", "573001112233@s.whatsapp.net"].sort(),
    );
    const conLid = losNumerosDelCliente("210101696733292@lid", "573001112233@s.whatsapp.net");
    assert.ok(conLid.includes("210101696733292@lid"));
    assert.ok(!conLid.includes("210101696733292"));
    assert.ok(conLid.includes("573001112233"));
    // El sufijo de dispositivo no se pega al número.
    assert.ok(losNumerosDelCliente("573001112233:39@s.whatsapp.net").includes("573001112233"));
    assert.deepEqual(losNumerosDelCliente(null), []);
});

test("el idNodo es el que ya reconocen cancelar y el panel de registros", () => {
    assert.equal(elIdNodoDelRecordatorio("abc"), "appt-reminder-abc");
    const protegidos = readFileSync("actions/seguimientos-actions.ts", "utf8");
    assert.match(protegidos, /"appt-reminder-"/);
    const registros = readFileSync("lib/registros-del-lead.ts", "utf8");
    assert.match(registros, /appt-reminder-/);
});

test("la opción de reagendar no es un estado del enum", () => {
    assert.equal(esLaOpcionDeReagendar(OPCION_REAGENDAR), true);
    assert.equal(esLaOpcionDeReagendar("PENDIENTE"), false);
    const esquema = readFileSync("prisma/schema.prisma", "utf8");
    const enumDeEstados = /enum AppointmentStatus \{([^}]*)\}/.exec(esquema)[1];
    assert.ok(!enumDeEstados.includes(OPCION_REAGENDAR));
    assert.ok(!/REAGEND/i.test(enumDeEstados), "el enum es del backend: no se toca");
    assert.equal(ROTULO_REAGENDAR, "Reagendar");
});

test(ROTO ? "ANTES: en ninguno de los cuatro sitios se podía reagendar" : "los cuatro sitios abren el MISMO diálogo de reagendar", () => {
    for (const ruta of LOS_CUATRO) {
        const codigo = leer(ruta);
        if (ROTO) {
            assert.ok(!codigo.includes("DialogoDeReagendar"), ruta);
            assert.ok(!/Reagendar/.test(codigo), ruta);
            continue;
        }
        assert.match(codigo, /import \{ DialogoDeReagendar \} from ["']@\/components\/shared\/DialogoDeReagendar["']/, ruta);
        assert.match(codigo, /<DialogoDeReagendar/, ruta);
        assert.match(codigo, /ROTULO_REAGENDAR/, `${ruta}: el rótulo sale de la regla, no escrito a mano`);
    }
});

test(ROTO ? "ANTES: el selector de fecha y hora vivía dentro de agendar" : "reagendar usa el MISMO selector de fecha y hora que agendar", () => {
    const agendar = leer("app/(root)/chats/_components/ChatCreateAppointmentSheet.tsx");
    if (ROTO) {
        assert.ok(agendar.includes("getAvailableSlots"));
        assert.ok(!agendar.includes("SelectorDeFechaYHora"));
        return;
    }
    const dialogo = readFileSync("components/shared/DialogoDeReagendar.tsx", "utf8");
    for (const [nombre, codigo] of [["agendar", agendar], ["reagendar", dialogo]]) {
        assert.match(codigo, /<SelectorDeFechaYHora/, nombre);
    }
    // La copia se fue de agendar: una sola forma de pedir los huecos.
    assert.ok(!agendar.includes("getAvailableSlots"), "agendar ya no pide los huecos por su cuenta");
    // El pie de la casa, con los dos botones como hijos directos.
    assert.match(dialogo, /<DialogFooter>\s*<Button variant="outline"[\s\S]*?<\/Button>\s*<Button/);
});

test(ROTO ? "ANTES: editar la hora de una cita no tocaba sus recordatorios" : "editar la hora de una cita rehace sus recordatorios, igual que reagendar", () => {
    const codigo = leer("actions/appointments-actions.ts");
    const cuerpo = codigo.slice(codigo.indexOf("export async function updateAppointmentDetails"));
    const hasta = cuerpo.indexOf("\nexport ", 10);
    const detalles = cuerpo.slice(0, hasta);
    if (ROTO) {
        assert.ok(!detalles.includes("reprogramarLosRecordatoriosDeLaCita"));
        return;
    }
    assert.match(detalles, /reprogramarLosRecordatoriosDeLaCita\(id\)/);
    assert.match(codigo, /export async function reagendarCitaAction/);
});
