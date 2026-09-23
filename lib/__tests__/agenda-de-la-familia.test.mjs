/**
 * La Agenda de la familia: la decisión, y un barrido del código que la usa.
 *
 * Lo que se compara aquí es lo que el encargo pide «igual, no parecido»:
 *
 *  - **La insignia** —mismo puntico, misma paleta, misma palabra, misma
 *    posición— tiene que salir de la MISMA función en Agenda y en CRM ›
 *    Llamadas, y esa función tiene que decir exactamente lo que decía la regla
 *    que Llamadas llevaba escrita dentro (leída de git, no copiada a mano).
 *  - **El filtro** es el mismo `SelectorDeCuentas` con las mismas props que el
 *    CRM (`porDefecto="todas"`, `conMoneda={false}`), leídas de los dos
 *    ficheros.
 *  - **El aviso** ya no sale del navegador con la línea de quien mira.
 *
 * `MODO=roto` lee los ficheros de la Agenda de `ANTES_REF` —un commit
 * pinchado, nunca `origin/main`, que el día que esto se fusione pasa a ser el
 * «después»— y AFIRMA el fallo: ni filtro, ni insignia, y el calendario
 * avisando con `user.instancias[0]`.
 *
 * Se levanta con `scripts/banco-agenda-de-la-familia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
    laInsigniaDeLaFila,
    esCitaDeOtraCuenta,
    laLineaDeLaNotificacionDeCita,
} from "./.compilado/agenda/agenda-de-la-familia.js";

const ROTO = process.env.MODO === "roto";
/** El commit de ANTES de este cambio. */
const ANTES_REF = process.env.ANTES_REF || "20db904";

function deGit(ruta) {
    return execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { encoding: "utf8" });
}
function deHoy(ruta) {
    return readFileSync(ruta, "utf8");
}
const leer = ROTO ? deGit : deHoy;

const SCHEDULE = "app/(root)/schedule/_components/MainSchedule.tsx";
const CALENDARIO = "app/(root)/schedule/_components/dashboard/CustomCalendar.tsx";
const KANBAN = "app/(root)/schedule/_components/dashboard/AgendaKanban.tsx";
const PAGINA = "app/(root)/schedule/page.tsx";
const LLAMADAS = "app/(root)/crm/llamadas/_components/CallsCrmClient.tsx";
const CRM = "app/(root)/crm/dashboard/components/CrmDashboard.tsx";

/* ── La decisión ─────────────────────────────────────────────────────────── */

/** La regla que CRM › Llamadas llevaba escrita dentro, tal cual (de git). */
function laReglaDeLlamadas(linea, nombreDeLaCuenta) {
    const fuente = deGit(LLAMADAS);
    assert.match(fuente, /clave=\{call\.instanceName \|\| nombreDeLaCuenta\}/);
    assert.match(fuente, /nombre=\{nombreDeLaCuenta \|\| call\.instanceName \|\| '—'\}/);
    return { clave: linea || nombreDeLaCuenta, nombre: nombreDeLaCuenta || linea || "—" };
}

test("la insignia de una cita es la de CRM › Llamadas, en todos los casos", () => {
    const casos = [
        ["VERZAY_VENTAS", "Verzay | Ventas"],
        ["VERZAY_ATENCION_wh", "Verzay | Atencion"],
        ["", "Verzay | Ventas"],
        ["LINEA_SOLA", ""],
        [null, "Carlos Arcos"],
    ];
    for (const [linea, nombre] of casos) {
        assert.deepEqual(laInsigniaDeLaFila(linea, nombre), laReglaDeLlamadas(linea, nombre), `${linea} / ${nombre}`);
    }
    assert.deepEqual(laInsigniaDeLaFila(null, null), { clave: "", nombre: "—" });
});

test("una cita de otra cuenta de la familia se ve pero no es propia; sin dueño no es ajena", () => {
    assert.equal(esCitaDeOtraCuenta("hija", "madre"), true);
    assert.equal(esCitaDeOtraCuenta("madre", "madre"), false);
    assert.equal(esCitaDeOtraCuenta(null, "madre"), false);
    assert.equal(esCitaDeOtraCuenta("", "madre"), false);
});

test("el aviso sale por la línea de la conversación si es de la dueña, y si no por su línea por QR", () => {
    const lineas = [
        { instanceName: "HIJA_META_wh", esQr: false },
        { instanceName: "HIJA_QR", esQr: true },
    ];
    assert.equal(laLineaDeLaNotificacionDeCita({ lineaDeLaConversacion: "HIJA_META_wh", lineasDeLaDuena: lineas }), "HIJA_META_wh");
    // Una línea que NO es de la dueña nunca sale: se cae a la suya por QR.
    assert.equal(laLineaDeLaNotificacionDeCita({ lineaDeLaConversacion: "MADRE_QR", lineasDeLaDuena: lineas }), "HIJA_QR");
    assert.equal(laLineaDeLaNotificacionDeCita({ lineaDeLaConversacion: null, lineasDeLaDuena: lineas }), "HIJA_QR");
    // Sin línea por QR, nada: no se inventa un canal.
    assert.equal(laLineaDeLaNotificacionDeCita({ lineaDeLaConversacion: "OTRA", lineasDeLaDuena: [lineas[0]] }), null);
    assert.equal(laLineaDeLaNotificacionDeCita({ lineaDeLaConversacion: "X", lineasDeLaDuena: [] }), null);
});

/* ── El barrido del código ───────────────────────────────────────────────── */

/** Las props con que un fichero pinta `<SelectorDeCuentas …/>`. */
function propsDelSelector(fuente) {
    const m = fuente.match(/<SelectorDeCuentas([\s\S]*?)\/>/);
    if (!m) return null;
    return m[1].replace(/\s+/g, " ").trim();
}

test(ROTO ? "ANTES: la Agenda no tenía filtro por cuenta" : "el filtro de la Agenda es el de CRM › Llamadas, con las mismas props", () => {
    const agenda = propsDelSelector(leer(SCHEDULE));
    if (ROTO) {
        assert.equal(agenda, null, "la Agenda de antes no pintaba ningún SelectorDeCuentas");
        assert.doesNotMatch(leer(PAGINA), /resolverLasCuentasDelCrm/);
        return;
    }
    const crm = propsDelSelector(deHoy(CRM));
    assert.ok(crm, "el CRM pinta su filtro");
    assert.equal(agenda, crm, "mismas props, en el mismo orden");
    assert.match(agenda, /porDefecto="todas"/);
    assert.match(agenda, /conMoneda=\{false\}/);
    // Y la puerta es la del CRM, resuelta en el servidor.
    assert.match(leer(PAGINA), /resolverLasCuentasDelCrm\(effectiveId, searchParams\?\.cuentas\)/);
});

test(ROTO ? "ANTES: ninguna cita llevaba la insignia de su cuenta" : "calendario, Kanban y Llamadas pintan la insignia con la MISMA pieza y la MISMA regla", () => {
    for (const f of [CALENDARIO, KANBAN]) {
        const fuente = leer(f);
        if (ROTO) {
            assert.doesNotMatch(fuente, /InsigniaDeLinea/, f);
            continue;
        }
        assert.match(fuente, /import \{ InsigniaDeLinea \} from ['"]@\/components\/shared\/InsigniaDeLinea['"]/, f);
        assert.match(fuente, /laInsigniaDeLaFila\(/, f);
        // Pegada a la derecha del nombre, en la misma caja que en Llamadas.
        assert.match(fuente, /flex min-w-0 items-center gap-1\.5/, f);
    }
    if (!ROTO) {
        const llamadas = deHoy(LLAMADAS);
        assert.match(llamadas, /<InsigniaDeLinea \{\.\.\.laInsigniaDeLaFila\(call\.instanceName, nombreDeLaCuenta\)\} \/>/);
        assert.match(llamadas, /flex min-w-0 items-center gap-1\.5/);
    }
});

test(ROTO ? "ANTES: el calendario avisaba desde el navegador con la línea de quien mira" : "el aviso ya no sale del navegador: lo manda el servidor con la línea de la dueña", () => {
    const fuente = leer(CALENDARIO);
    if (ROTO) {
        assert.match(fuente, /user\.instancias\[0\]\?\.instanceName/);
        assert.match(fuente, /sendMessageWithHistoryAction\(/);
        return;
    }
    assert.doesNotMatch(fuente, /user\.instancias/);
    assert.doesNotMatch(fuente, /sendMessageWithHistoryAction/);
    assert.match(fuente, /sendAppointmentStatusNotification\(id, status\)/);
});

test(ROTO ? "ANTES: cualquier cita del calendario ofrecía Eliminar" : "Eliminar solo se ofrece en las citas de la cuenta propia", () => {
    const fuente = leer(CALENDARIO);
    if (ROTO) {
        assert.doesNotMatch(fuente, /esCitaDeOtraCuenta/);
        return;
    }
    assert.match(fuente, /!esCitaDeOtraCuenta\(currentAppointment\.userId, propia\)/);
});
