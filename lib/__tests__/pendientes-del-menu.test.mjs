/**
 * El numerito de pendientes del menú lateral: la regla pura y un barrido del
 * menú (`components/nav-main.tsx`).
 *
 * `MODO=roto` lee el menú de `ANTES_REF` (el commit de antes) y AFIRMA el
 * fallo: dentro de un desplegable ningún apartado llevaba número.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF;
const r = await import("./.compilado/pendientes-del-menu/pendientes-del-menu.js");

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\s*\}/g, "");
// El «antes» de los dos fallos del número (Agenda sin número y Recordatorios con
// uno de más): pinchado al commit anterior a su arreglo, nunca a origin/main.
const ANTES_DEL_NUMERO = process.env.ANTES_DEL_NUMERO ?? "cb56343";
const leerAntesDelNumero = (ruta) => (ROTO ? execSync(`git show "${ANTES_DEL_NUMERO}:${ruta}"`, { encoding: "utf8" }) : fs.readFileSync(ruta, "utf8"));
const leer = (ruta) => (ROTO ? execSync(`git show ${ANTES}:${ruta}`, { encoding: "utf8" }) : fs.readFileSync(ruta, "utf8"));

test("seis apartados llevan número, cada uno por su ruta, y Llamadas NO", { skip: ROTO }, () => {
    const pedidos = { "/chats": "chats", "/correo": "correo", "/schedule": "agenda", "/bookings": "multiagenda", "/tareas": "tareas", "/reminders": "recordatorios" };
    for (const [ruta, clave] of Object.entries(pedidos)) assert.equal(r.laClaveDeLaRuta(ruta), clave, ruta);
    for (const ruta of ["/crm/llamadas", "/sessions", "/tags", "/tools", "/ai", "/campaigns", "/workflow", "/macros", "/auto-replies", "/reuniones", "/chats-algo", "/correos"]) {
        assert.equal(r.laClaveDeLaRuta(ruta), null, `${ruta} no lleva número`);
    }
    // Consulta, ancla y barra final no cambian el apartado.
    assert.equal(r.laClaveDeLaRuta("/chats?jid=1"), "chats");
    assert.equal(r.laClaveDeLaRuta("/reminders/"), "recordatorios");
    assert.equal(r.laClaveDeLaRuta(null), null);
    assert.equal(Object.keys(r.RUTA_DEL_CONTADOR).length, 6);
});

test("el texto: cero y «no se sabe» no se pintan; más de 99 es «99+»", { skip: ROTO }, () => {
    assert.equal(r.elTextoDelContador("/chats", { chats: 3 }), "3");
    assert.equal(r.elTextoDelContador("/chats", { chats: 0 }), null);
    assert.equal(r.elTextoDelContador("/correo", { correo: null }), null, "null es «no se sabe», no un 0");
    assert.equal(r.elTextoDelContador("/correo", {}), null);
    assert.equal(r.elTextoDelContador("/schedule", { agenda: 100 }), "99+");
    assert.equal(r.elTextoDelContador("/crm/llamadas", { chats: 5 }), null);
    assert.equal(r.elTextoDelContador("/tareas", { tareas: Number.NaN }), null);
});

test("solo se piden los contadores de lo que el menú enseña", { skip: ROTO }, () => {
    const c = r.lasClavesDelMenu(["/chats", "/crm/llamadas", null, "/reminders", "/reminders", "/sessions"]);
    assert.deepEqual([...c].sort(), ["chats", "recordatorios"]);
});

test("Agenda y Multiagenda: el número es la fila PENDIENTE del conteo por estado de su pantalla", { skip: ROTO }, () => {
    assert.equal(r.lasPendientesDelConteo([{ status: "CONFIRMADA", count: 6 }, { status: "PENDIENTE", count: 4 }]), 4);
    assert.equal(r.lasPendientesDelConteo([{ status: "CANCELADA", count: 2 }]), 0, "sin la fila, cero");
    assert.equal(r.lasPendientesDelConteo([]), 0);
    assert.equal(r.ESTADO_DE_CITA_PENDIENTE, "PENDIENTE");
});

test("la pastilla y el menú de Agenda y Multiagenda salen de la MISMA consulta", () => {
    const acc = sinComentarios(leerAntesDelNumero("actions/pendientes-del-menu-actions.ts"));
    if (ROTO) {
        assert.ok(/userId: cuenta, status: "PENDIENTE", startTime: \{ gte: ahora \}/.test(acc), "antes: solo la cuenta propia y solo lo futuro");
        return;
    }
    assert.ok(/lasCitasPorEstado\(await lasCuentasQueConsultaElCrm\(cuenta, null\)\)/.test(acc), "Agenda: las cuentas del tablero abierto sin filtro");
    assert.ok(/lasReservasPorEstado\(team\.id\)/.test(acc));
    assert.ok(!/startTime/.test(acc), "sin un filtro de fecha que la pastilla no tiene");
    assert.ok(/lasCitasPorEstado\(/.test(sinComentarios(fs.readFileSync("actions/appointments-actions.ts", "utf8"))), "la pastilla de Agenda");
    assert.ok(/lasReservasPorEstado\(/.test(sinComentarios(fs.readFileSync("actions/bookings-actions.ts", "utf8"))), "la pastilla de Multiagenda");
});

test("Recordatorios: las pastillas, la lista y el menú dejan fuera las plantillas de la Agenda", () => {
    const p = sinComentarios(leerAntesDelNumero("app/(root)/reminders/_components/MainReminders.tsx"));
    if (ROTO) {
        assert.ok(/reminders\.forEach\(\(reminder\) =>/.test(p), "antes: las pastillas contaban también las plantillas");
        return;
    }
    assert.ok(/reminders\.filter\(seVeEnLaListaDeRecordatorios\)\.forEach/.test(p), "las pastillas");
    assert.ok(/!seVeEnLaListaDeRecordatorios\(r\)/.test(p), "la lista");
    assert.ok(/isSchedule: true/.test(fs.readFileSync("actions/pendientes-del-menu-actions.ts", "utf8")), "el menú trae la marca");
    const ahora = new Date("2026-09-27T17:00:00Z");
    const plantillas = [
        { time: "minutes-30", sentAt: null, repeatType: null, isSchedule: true },
        { time: "hours-2", sentAt: null, repeatType: null, isSchedule: true },
    ];
    assert.equal(r.cuantosRecordatoriosPendientes(plantillas, ahora, 300), 0, "con la lista vacía, sin número");
    assert.equal(r.seVeEnLaListaDeRecordatorios({ isSchedule: true }), false);
    assert.equal(r.seVeEnLaListaDeRecordatorios({ isSchedule: false }), true);
    assert.equal(r.seVeEnLaListaDeRecordatorios({}), true);
});

test("recordatorios: el grupo «Pendientes» de su pantalla, y en la zona de quien mira", { skip: ROTO }, () => {
    // 27-sep 12:00 en Bogotá (UTC-5) = 17:00 UTC.
    const ahora = new Date("2026-09-27T17:00:00Z");
    const BOGOTA = 300;
    const lista = [
        { time: null, sentAt: null, repeatType: "NONE" },                         // sin hora → pendiente
        { time: "2026-10-05T10:00:00Z", sentAt: null, repeatType: "NONE" },       // lejos → pendiente
        { time: "2026-09-27T20:00:00Z", sentAt: null, repeatType: "NONE" },       // hoy
        { time: "2026-09-28T20:00:00Z", sentAt: null, repeatType: "NONE" },       // mañana
        { time: "2026-10-05T10:00:00Z", sentAt: new Date(), repeatType: "NONE" }, // enviado
        { time: null, sentAt: null, repeatType: "DAILY" },                        // recurrente
        { time: "2026-09-27T10:00:00Z", sentAt: null, repeatType: "NONE" },       // vencido
        { time: "minutes-30", sentAt: null, repeatType: null },                   // hora que no se entiende → pendiente
    ];
    assert.equal(r.cuantosRecordatoriosPendientes(lista, ahora, BOGOTA), 3);
    // Mañana a las 22:00 de Bogotá (03:00 UTC del 29): en Bogotá es «mañana»,
    // pero en UTC ya es pasado mañana. Sin el desfase, el menú contaría uno
    // que la pantalla no pone en «Pendientes».
    const frontera = [{ time: "2026-09-29T03:00:00Z", sentAt: null, repeatType: "NONE" }];
    assert.equal(r.cuantosRecordatoriosPendientes(frontera, ahora, BOGOTA), 0, "con el desfase de Bogotá cae en «mañana», como en la pantalla");
    assert.equal(r.cuantosRecordatoriosPendientes(frontera, ahora, 0), 1, "en UTC caería en «Pendientes»: por eso viaja el desfase");
    // La hora dd/mm/aaaa hh:mm de la pantalla sigue entendiéndose.
    assert.ok(r.laHoraDelRecordatorio("05/10/2026 10:30") !== null);
});

test("el menú pinta el número en los TRES sitios y por la MISMA pieza", () => {
    const nav = sinComentarios(leer("components/nav-main.tsx"));
    if (ROTO) {
        assert.ok(!/ContadorDelMenu|elTextoDelContador/.test(nav), "antes no había contador dentro de los desplegables");
        assert.ok(/route === '\/tareas' && taskPendingCount/.test(nav) && /route === '\/chats' && chatUnreadCount/.test(nav),
            "antes solo Chats y Mis tareas, y solo sueltos, escritos a mano");
        return;
    }
    const enDesplegables = nav.match(/<ContadorDelMenu ruta=\{dest\}/g) ?? [];
    assert.equal(enDesplegables.length, 2, "el desplegable abierto y el flotante de la barra plegada");
    assert.equal((nav.match(/<ContadorSuelto ruta=\{route\}/g) ?? []).length, 1, "y el apartado suelto");
    assert.ok(!/route === '\/tareas'|route === '\/chats'/.test(nav), "ninguna ruta escrita a mano en el menú");
    assert.ok(/usePendientesDelMenu\(/.test(nav));
    assert.equal((nav.match(/CLASE_DEL_CONTADOR/g) ?? []).length >= 2, true, "una sola forma para los dos");
});

test("la pantalla de Recordatorios agrupa con la MISMA función que el menú", { skip: ROTO }, () => {
    const p = sinComentarios(fs.readFileSync("app/(root)/reminders/_components/MainReminders.tsx", "utf8"));
    assert.ok(/elGrupoDelRecordatorio/.test(p));
    assert.ok(!/const parseReminderTime/.test(p), "sin una segunda copia de la regla");
});
