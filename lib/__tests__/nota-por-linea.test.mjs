/**
 * LA NOTA INTERNA SE QUEDA EN SU LÍNEA — la regla y un barrido del código.
 *
 * El mismo contacto escribe a dos líneas (Ventas y Atención) y tiene una ficha
 * en cada una. La conversación abierta pedía su ficha SOLO por el número, y el
 * servidor devolvía la que mejor casara entre todas las líneas: una nota
 * escrita en Atención se guardaba en la ficha de Ventas y salía en las dos
 * conversaciones y en la vista previa de la fila de Ventas.
 *
 * Aquí se prueba lo puro (`lib/sesion-de-la-conversacion-abierta.ts`) y que la
 * pantalla PASA por ello: el fallo no estaba en ninguna función, estaba en que
 * nadie le decía al servidor de qué línea era la conversación.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` con `git show` y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "97b6d07";

const HOOK = "app/(root)/chats/_components/hooks/useChatSession.ts";
const MAIN = "app/(root)/chats/_components/chat-main.tsx";
const CLIENTE = "app/(root)/chats/_components/chats-client.tsx";
const REGLA = "lib/sesion-de-la-conversacion-abierta.ts";

function leer(ruta) {
    if (!ROTO) return readFileSync(ruta, "utf8");
    try {
        return execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
}

/** Sin comentarios: un comentario que explica el arreglo no puede contar como el arreglo. */
function sinComentarios(texto) {
    return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** La llamada `useChatSession({ ... })` de chat-main, entera. */
function laLlamadaAlHook(main) {
    const desde = main.indexOf("useChatSession({");
    assert.ok(desde >= 0, "chat-main llama a useChatSession");
    return main.slice(desde, main.indexOf("});", desde));
}

/** El efecto que carga las notas de la ficha, entero (del `useEffect` a sus dependencias). */
function elEfectoDeLasNotas(main) {
    const carga = main.indexOf("getInternalNotesBySessionAction(session.id)");
    assert.ok(carga >= 0, "chat-main carga las notas de la ficha");
    const desde = main.lastIndexOf("useEffect(", carga);
    return main.slice(desde, main.indexOf("}, [", carga));
}

// ── MODO=roto: el fallo, leído del código de antes ──────────────────────────

test("MODO=roto: la conversación abierta pedía la ficha SOLO por el número", { skip: !ROTO }, () => {
    assert.equal(leer(REGLA), null, "no existía ninguna regla de la ficha por línea");

    const hook = sinComentarios(leer(HOOK));
    assert.match(hook, /getSessionByRemoteJid\(effectiveUserIds, remoteJid, \{ aliases: candidates \}\)/,
        "el fallo: se pedía la ficha sin la línea");
    assert.doesNotMatch(hook, /instanceId/, "ni una mención a la línea en el hook");
    assert.match(hook, /\[userId, remoteJid, aliasesKey, sessionUserIds, onSessionResolved\]/,
        "el fallo: pasar a la otra línea del mismo número no volvía a pedir nada");

    const main = sinComentarios(leer(MAIN));
    assert.doesNotMatch(laLlamadaAlHook(main), /instanceName/, "el fallo: chat-main no le daba la línea al hook");
    assert.doesNotMatch(elEfectoDeLasNotas(main), /setNotes\(\[\]\)/,
        "el fallo: al cambiar de ficha las notas de la anterior se quedaban puestas");
});

// ── La regla ────────────────────────────────────────────────────────────────

const r = ROTO ? null : await import("./.compilado/sesion-de-la-conversacion-abierta.js");
const N = "573001112233@s.whatsapp.net";
const LID = "999888777666@lid";

test("con la línea conocida, se pregunta SOLO por esa línea", { skip: ROTO }, () => {
    const b = r.laBusquedaDeLaSesionAbierta(N, [N, LID, "", null, undefined], "ATENCION");
    assert.equal(b.remoteJid, N);
    assert.equal(b.opciones.instanceId, "ATENCION");
    assert.deepEqual(b.opciones.aliases, [N, LID], "sin repetidos ni vacíos");
});

test("sin línea, se pregunta como siempre: por el número", { skip: ROTO }, () => {
    for (const sin of [undefined, null, "", "   "]) {
        const b = r.laBusquedaDeLaSesionAbierta(N, [LID], sin);
        assert.equal("instanceId" in b.opciones, false, `«${sin}» no es una línea`);
        assert.deepEqual(b.opciones.aliases, [N, LID]);
    }
    assert.equal(r.laLineaDeLaConversacion("  VENTAS "), "VENTAS");
});

test("la llave de la conversación lleva la línea: dos líneas del mismo número son dos conversaciones", { skip: ROTO }, () => {
    const ventas = r.laLlaveDeLaConversacionAbierta(N, "VENTAS");
    const atencion = r.laLlaveDeLaConversacionAbierta(N, "ATENCION");
    assert.notEqual(ventas, atencion);
    assert.equal(ventas, r.laLlaveDeLaConversacionAbierta(N, " VENTAS "), "la misma línea, la misma llave");
    assert.notEqual(r.laLlaveDeLaConversacionAbierta(N, undefined), ventas);
});

test("la memoria de la bandeja: la ficha de Atención no pisa la global de Ventas ni toca su fila", { skip: ROTO }, async () => {
    const { conLaSesionAlDia } = await import("./.compilado/crm-de-la-conversacion-abierta.js");
    const ventas = { id: 1, pushName: "Laura", leadStatus: "CALIENTE", tags: [{ id: 7 }] };
    const atencion = { id: 2, pushName: "Laura", leadStatus: "FRIO", tags: [] };
    const previous = { [N]: ventas, [`VENTAS::${N}`]: ventas, [`ATENCION::${N}`]: atencion };

    // La global es de otra línea: no se escribe entera.
    assert.equal(r.seEscribeEnLaGlobal(previous, N, 2, "ATENCION"), false);
    // Lo que la fila enseña se pone al día por id: SOLO la de Atención.
    const fresca = { leadStatus: "TIBIO", pushName: "Laura", customName: null, assignedAdvisorId: null };
    const { siguiente, tocadas } = conLaSesionAlDia(previous, 2, fresca);
    assert.equal(tocadas, 1);
    assert.equal(siguiente[`ATENCION::${N}`].leadStatus, "TIBIO");
    assert.equal(siguiente[`VENTAS::${N}`], ventas, "la fila de Ventas, intacta");
    assert.equal(siguiente[N], ventas, "la global, intacta");

    // La global vacía, o ya de esta ficha: se escribe. Sin línea: como siempre.
    assert.equal(r.seEscribeEnLaGlobal({}, N, 2, "ATENCION"), true);
    assert.equal(r.seEscribeEnLaGlobal({ [N]: atencion }, N, 2, "ATENCION"), true);
    assert.equal(r.seEscribeEnLaGlobal(previous, N, 2, undefined), true);
});

test("sin ficha en ESTA línea no se borra la del contacto en otra; sin línea, como siempre", { skip: ROTO }, () => {
    const previous = { [N]: { id: 1 }, [`VENTAS::${N}`]: { id: 1 } };
    assert.equal(r.sinFichaEnLaLinea(previous, N, "LIBRE"), previous, "no se toca nada");
    const sinLinea = r.sinFichaEnLaLinea(previous, N, undefined);
    assert.equal(N in sinLinea, false, "sin línea se borra la global");
    assert.equal(`VENTAS::${N}` in sinLinea, true, "y la de la línea se queda");
    const vacio = {};
    assert.equal(r.sinFichaEnLaLinea(vacio, N, undefined), vacio);
});

// ── El barrido: que la pantalla PASA por la regla ───────────────────────────

test("el hook pide la ficha con la línea, vuelve a pedir al cambiar de línea y tira la respuesta tardía", { skip: ROTO }, () => {
    const hook = sinComentarios(leer(HOOK));
    assert.match(hook, /laBusquedaDeLaSesionAbierta\(remoteJid, aliasesKey\.split\('\|'\), linea\)/);
    assert.match(hook, /getSessionByRemoteJid\(effectiveUserIds, busqueda\.remoteJid, busqueda\.opciones\)/);
    assert.doesNotMatch(hook, /getSessionByRemoteJid\([^)]*\{ aliases:/, "nunca una búsqueda sin la línea escrita a mano");
    assert.match(hook, /\[userId, remoteJid, aliasesKey, linea, sessionUserIds, onSessionResolved\]/,
        "la línea entra en las dependencias: cambiar de línea vuelve a pedir");
    assert.equal((hook.match(/llaveActualRef\.current !== pedida/g) ?? []).length, 2,
        "la respuesta de otra conversación se tira, también si falla");
    assert.match(hook, /seededJidRef\.current === llaveDeLaConversacion/, "la semilla es por número Y línea");
    assert.match(hook, /onSessionResolved\?\.\(remoteJid, resolved\.data, linea\)/, "la bandeja sabe de qué línea es");
});

test("chat-main le da la línea al hook, suelta las notas al cambiar de ficha y no escribe en el vacío", { skip: ROTO }, () => {
    const main = sinComentarios(leer(MAIN));
    assert.match(laLlamadaAlHook(main), /instanceName: info\?\.instanceName/);
    const efecto = elEfectoDeLasNotas(main);
    assert.ok(efecto.indexOf("setNotes([])") >= 0, "se sueltan las notas de la ficha anterior");
    assert.ok(efecto.indexOf("setNotes([])") < efecto.indexOf("if (!session?.id) return"),
        "ANTES de la guarda: una conversación sin ficha no enseña las de otra");
    const enviar = main.slice(main.indexOf("const handleSendNote"), main.indexOf("const handleSendNote") + 600);
    assert.doesNotMatch(enviar, /if \(!session\?\.id\) return;/, "una nota sin ficha no se pierde en silencio");
    assert.match(enviar, /toast\.error\(/);
});

test("la bandeja aplica la ficha por su línea, con las dos reglas", { skip: ROTO }, () => {
    const cliente = sinComentarios(leer(CLIENTE));
    const desde = cliente.indexOf("const handleSessionResolved");
    const cuerpo = cliente.slice(desde, cliente.indexOf("[],", desde));
    assert.match(cuerpo, /\(remoteJid: string, session: Session \| null, linea\?: string\)/);
    assert.match(cuerpo, /sinFichaEnLaLinea\(previous, remoteJid, linea\)/);
    assert.match(cuerpo, /seEscribeEnLaGlobal\(previous, remoteJid, session\.id, linea\)/);
    assert.doesNotMatch(cuerpo, /delete next\[remoteJid\]/, "el borrado a ciegas de la global se fue");
});
