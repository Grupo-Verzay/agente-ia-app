/**
 * La REGLA del acceso por mención, y un BARRIDO de que el código la usa.
 *
 * Lo puro se prueba sin base. El barrido existe porque el fallo de esta familia
 * no está en ninguna función: está en que a una hermana se le pase —la otra
 * campanita, otro camino de resolver, el gate de la pantalla—. En `MODO=roto`
 * el barrido lee los mismos ficheros de `ANTES_REF` y afirma que no estaba nada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "2017da3";
const r = await import("./.compilado/mencion/acceso-por-mencion.js");

function leer(ruta) {
    if (!ROTO) return readFileSync(ruta, "utf8");
    try {
        return execSync(`git show "${ANTES_REF}:${ruta}"`, { encoding: "utf8" });
    } catch {
        return "";
    }
}

const base = { esAgente: true, personaId: "yo", puedeTomarSinAsignar: false, esParticipante: false, mencionVigente: false };

test("quien no es agente ve todo lo de su cuenta; la mención no le cambia nada", { skip: ROTO }, () => {
    assert.equal(r.porQueVeLaConversacion({ ...base, esAgente: false, asignadoA: "otro" }), "cuenta");
});

test("lo que ya existía manda sobre la mención: suya, bolsa, participante", { skip: ROTO }, () => {
    assert.equal(r.porQueVeLaConversacion({ ...base, asignadoA: "yo", mencionVigente: true }), "suya");
    assert.equal(r.porQueVeLaConversacion({ ...base, asignadoA: null, puedeTomarSinAsignar: true, mencionVigente: true }), "bolsa");
    assert.equal(r.porQueVeLaConversacion({ ...base, asignadoA: "otro", esParticipante: true, mencionVigente: true }), "participante");
    assert.equal(r.porQueVeLaConversacion({ ...base, asignadoA: "otro", mencionVigente: true }), "mencion");
    assert.equal(r.porQueVeLaConversacion({ ...base, asignadoA: "otro" }), null);
    // Sin asesor pero sin permiso de tomar: la bolsa no se la abre la mención.
    assert.equal(r.porQueVeLaConversacion({ ...base, asignadoA: null, mencionVigente: true }), "mencion");
});

test("el acceso vale mientras no se resuelva DESPUÉS de mencionar", { skip: ROTO }, () => {
    assert.equal(r.laMencionSigueVigente(new Date(1000), null), true);
    assert.equal(r.laMencionSigueVigente(new Date(1000), new Date(2000)), false, "resuelta después: se acabó");
    assert.equal(r.laMencionSigueVigente(new Date(3000), new Date(2000)), true, "mencionado en una ya resuelta: vale");
    assert.equal(r.laMencionSigueVigente(new Date(NaN), new Date(2000)), false, "una fecha rota no abre nada");
});

test("quitarlo: el dueño, quien administra, quien lo dio y el propio; nadie más", { skip: ROTO }, () => {
    const q = (x) => r.puedeQuitarElAcceso({ mandaEnLaCuenta: false, asignadoA: "duena", otorgadoPorId: "ana", delAcceso: "invitado", ...x });
    assert.equal(q({ personaId: "duena" }), true, "la asignada");
    assert.equal(q({ personaId: "jefe", mandaEnLaCuenta: true }), true, "quien administra");
    assert.equal(q({ personaId: "ana" }), true, "quien lo dio");
    assert.equal(q({ personaId: "invitado" }), true, "el propio invitado se sale");
    assert.equal(q({ personaId: "otro_agente" }), false, "un agente cualquiera no");
    assert.equal(q({ personaId: "x", asignadoA: null, otorgadoPorId: null }), false, "sin dueño no se lo da a cualquiera");
});

test("a quién: avisar a todo el equipo, abrir solo a los agentes, nunca a uno mismo ni a gente de fuera", { skip: ROTO }, () => {
    const equipo = new Map([["ag1", { esAgente: true }], ["adm", { esAgente: false }], ["yo", { esAgente: true }]]);
    const mencionados = ["ag1", "adm", "yo", "fuera", "ag1", ""];
    assert.deepEqual(r.quienesRecibenElAviso(mencionados, equipo, "yo"), ["ag1", "adm"]);
    assert.deepEqual(r.quienesRecibenAcceso(mencionados, equipo, "yo"), ["ag1"]);
});

test("el enlace del aviso lleva a ESA conversación y dice que es una mención", { skip: ROTO }, () => {
    assert.equal(r.enlaceDeLaMencion({ remoteJid: "57300@s.whatsapp.net", sessionId: 42 }), "/chats?jid=57300%40s.whatsapp.net&mencion=42");
    assert.equal(r.enlaceDeLaMencion({ remoteJid: "57300@s.whatsapp.net", sessionId: null }), "/chats?jid=57300%40s.whatsapp.net");
    assert.equal(r.enlaceDeLaMencion({ remoteJid: null, sessionId: 42 }), "/chats");
    assert.equal(r.comoSesionDeLaMencion("42"), 42);
    assert.equal(r.comoSesionDeLaMencion(["7"]), 7);
    for (const malo of ["", "0", "-3", "4.5", "1;drop", undefined, null, "99999999999"]) {
        assert.equal(r.comoSesionDeLaMencion(malo), null, `${malo} no es una conversación`);
    }
});

test("qué ve el agente: invitado, sin acceso solo si entró por la mención, y lo demás como siempre", { skip: ROTO }, () => {
    assert.equal(r.laVistaDelInvitado({ motivo: "mencion", entroPorMencion: true }), "invitado");
    assert.equal(r.laVistaDelInvitado({ motivo: "mencion", entroPorMencion: false }), "invitado");
    assert.equal(r.laVistaDelInvitado({ motivo: null, entroPorMencion: true }), "sin-acceso");
    assert.equal(r.laVistaDelInvitado({ motivo: null, entroPorMencion: false }), "normal", "una mención no cierra puertas que ya estaban abiertas");
    assert.equal(r.laVistaDelInvitado({ motivo: undefined, entroPorMencion: true }), "normal", "mientras se pregunta no se cierra nada");
    assert.equal(r.laVistaDelInvitado({ motivo: "suya", entroPorMencion: true }), "normal");
});

/* ── Barrido ─────────────────────────────────────────────────────────── */

test("barrido: las DOS campanitas llevan al mismo enlace de la mención", () => {
    const servidor = leer("actions/notification-center-actions.ts");
    const navegador = leer("components/shared/NotificationCenter.tsx");
    if (ROTO) {
        assert.ok(!servidor.includes("enlaceDeLaMencion") && !navegador.includes("enlaceDeLaMencion"),
            "el fallo: el aviso llevaba a la lista, sin decir a qué conversación ni que era una mención");
        return;
    }
    assert.match(servidor, /enlaceDeLaMencion\(/);
    assert.match(navegador, /enlaceDeLaMencion\(/);
    assert.ok(!/href: n\.remoteJid \? `\/chats\?jid=/.test(navegador), "sin copia a mano del enlace");
});

test("barrido: resolver limpia los accesos, y la nota da acceso validando el equipo", () => {
    const resolver = leer("actions/advisor-assign-actions.ts");
    const nota = leer("actions/internal-notes-actions.ts");
    if (ROTO) {
        assert.ok(!resolver.includes("olvidarLosAccesosDe"), "el fallo: resolver no cerraba nada");
        assert.ok(!nota.includes("darAccesoPorMencion"), "el fallo: mencionar no abría nada");
        return;
    }
    const cuerpo = resolver.slice(resolver.indexOf("export async function resolveSession"), resolver.indexOf("export async function resolverSesionesAction"));
    assert.match(cuerpo, /olvidarLosAccesosDe\(sessionId\)/);
    assert.match(nota, /elEquipoDeLaCuenta\(/);
    assert.match(nota, /darAccesoPorMencion\(/);
    // Participantes y menciones comparten la lista del equipo: una sola.
    assert.match(leer("actions/collab-actions.ts"), /elEquipoDeLaCuenta\(/);
});

test("barrido: la pantalla pasa por el gate del invitado y la @ sale también escribiendo al cliente", () => {
    const cliente = leer("app/(root)/chats/_components/chats-client.tsx");
    const main = leer("app/(root)/chats/_components/chat-main.tsx");
    const ficha = leer("app/(root)/chats/_components/ContactInfoPanel.tsx");
    if (ROTO) {
        assert.ok(!cliente.includes("useAccesoDeInvitado"), "el fallo: nada distinguía a un invitado");
        assert.match(main, /solo en modo nota/, "el fallo: la @ solo existía si se sabía activar la nota");
        return;
    }
    assert.match(cliente, /useAccesoDeInvitado\(/);
    assert.match(cliente, /<SinAccesoPorMencion \/>/);
    assert.match(ficha, /<AccesosPorMencion sessionId=/);
    const cambio = main.slice(main.indexOf("const handleInputChange"), main.indexOf("const applySlashSuggestion"));
    assert.ok(!/if \(noteMode\) \{\s*const m = value\.match/.test(cambio), "la @ no depende del modo nota");
    const aplicar = main.slice(main.indexOf("const applyMentionSuggestion"), main.indexOf("/* ─── Message actions"));
    assert.match(aplicar, /setNoteMode\(true\)/, "elegir a alguien pasa a nota interna");
});
