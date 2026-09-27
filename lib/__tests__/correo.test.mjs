/**
 * Correo: las reglas PURAS y un BARRIDO del código.
 *
 * Las reglas se prueban sin red y sin base: el formulario de dominio propio, el
 * asunto y las referencias de una respuesta, la envoltura del HTML y el nombre
 * de un adjunto. El barrido comprueba lo que no se ve leyendo una función:
 *
 * - que **ningún fichero de Correo toca un camino de Chats** —guardar mensajes,
 *   fichas de lead, reparto de asesores—;
 * - que **toda consulta de `correo_cuentas` lleva la persona en el `WHERE`**;
 * - que **ninguna acción acepta un `userId`** del navegador;
 * - que el cuerpo de un correo se pinta en un iframe **sin `allow-scripts`**;
 * - y que la ruta está en el desplegable de módulos, con su icono.
 *
 * `MODO=roto` pasa el barrido sobre las versiones INGENUAS, escritas aquí
 * literales, y afirma que las caza: sin eso, lo verde no diría que el barrido
 * mira.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const r = await import(join(AQUI, ".compilado", "correo-puro", "correo.js"));

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const leer = (f) => sinComentarios(fs.readFileSync(join(RAIZ, f), "utf8"));

const FICHEROS_DE_CORREO = [
    "lib/correo.ts",
    "lib/correo-db.ts",
    "lib/correo-cifrado.server.ts",
    "lib/correo-proveedores.server.ts",
    "actions/correo-actions.ts",
    "app/api/correo/conectar/[proveedor]/route.ts",
    "app/api/correo/oauth/[proveedor]/route.ts",
    "app/api/correo/adjunto/route.ts",
    "app/(root)/correo/page.tsx",
    "app/(root)/correo/_components/CorreoClient.tsx",
    "app/(root)/correo/_components/LecturaDelCorreo.tsx",
    "app/(root)/correo/_components/ConectarCorreo.tsx",
    "app/(root)/correo/_components/FilaDeCorreo.tsx",
    "lib/mandos-del-correo.ts",
    "lib/sugerencia-de-correo.server.ts",
];

/** Los caminos de Chats. Si Correo importa o nombra uno, un correo acaba siendo un lead. */
const CAMINOS_DE_CHATS = [
    /persistChatMessage/,
    /upsertSessionFromChatMessage/,
    /chat-store/,
    /chat_messages/,
    /chat_conversations/,
    /db\.session\b/,
    /"Session"/,
    /auto-?assign/i,
    /asignarConversacion|escalarConversacion|assignSessionToAdvisor/,
    /@\/actions\/chat/,
    /persistEvolutionMessages/,
];

function tocaChats(codigo) {
    return CAMINOS_DE_CHATS.filter((re) => re.test(codigo)).map(String);
}

/** Cada sentencia sobre `correo_cuentas` que no sea el CREATE tiene que acotar por persona. */
function consultasSinPersona(codigo) {
    const sentencias = codigo.match(/`[^`]*"correo_(cuentas|anclados)"[^`]*`/g) ?? [];
    return sentencias.filter(
        (s) => !/CREATE (TABLE|UNIQUE INDEX)/.test(s) && !/ALTER TABLE/.test(s) && !/INSERT INTO/.test(s) && !/"personaId" = \$\{personaId\}/.test(s),
    );
}

/* ── Reglas puras ─────────────────────────────────────────────────────────── */

test("el formulario de dominio propio: valida, deduce y nunca guarda a medias", () => {
    const ok = r.comoDatosDeImap({ direccion: " Ana@MiEmpresa.com ", contrasena: "x", imapHost: "Mail.MiEmpresa.com" });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.datos, {
        direccion: "ana@miempresa.com", usuario: "ana@miempresa.com", contrasena: "x",
        imapHost: "mail.miempresa.com", imapPuerto: 993, imapSeguro: true,
        smtpHost: "mail.miempresa.com", smtpPuerto: 465, smtpSeguro: true,
    });
    const starttls = r.comoDatosDeImap({ direccion: "a@b.co", contrasena: "x", imapHost: "m.b.co", imapPuerto: "143", smtpPuerto: 587 });
    assert.equal(starttls.datos.imapSeguro, false, "143 va con STARTTLS");
    assert.equal(starttls.datos.smtpSeguro, false, "587 va con STARTTLS");
    for (const [raw, motivo] of [
        [{ direccion: "no", contrasena: "x", imapHost: "m.b.co" }, /dirección/],
        [{ direccion: "a@b.co", contrasena: "", imapHost: "m.b.co" }, /contraseña/],
        [{ direccion: "a@b.co", contrasena: "x", imapHost: "localhost" }, /entrada/],
        [{ direccion: "a@b.co", contrasena: "x", imapHost: "m.b.co", imapPuerto: "70000" }, /puerto/],
        [{ direccion: "a@b.co", contrasena: "x", imapHost: "m.b.co", smtpHost: "a b" }, /salida/],
    ]) {
        const v = r.comoDatosDeImap(raw);
        assert.equal(v.ok, false);
        assert.match(v.motivo, motivo);
    }
});

test("la respuesta: UN «Re:», las referencias en orden y un texto vacío no sale", () => {
    assert.equal(r.elAsuntoDeLaRespuesta("Cotización"), "Re: Cotización");
    assert.equal(r.elAsuntoDeLaRespuesta("Re: RE: Fwd: Cotización"), "Re: Cotización", "sin escalera de Re:");
    assert.equal(r.elAsuntoDeLaRespuesta(""), "Re:");
    assert.equal(r.lasReferenciasDeLaRespuesta("<a@x> <b@x>", "<c@x>"), "<a@x> <b@x> <c@x>");
    assert.equal(r.lasReferenciasDeLaRespuesta("<a@x> <c@x>", "<c@x>"), "<a@x> <c@x>", "no se repite");
    assert.equal(r.lasReferenciasDeLaRespuesta(null, null), null);
    assert.equal(r.comoTextoDeLaRespuesta("   \n "), null);
    assert.equal(r.comoTextoDeLaRespuesta(42), null);
    assert.equal(r.comoTextoDeLaRespuesta("x".repeat(r.TOPE_DE_LA_RESPUESTA + 50)).length, r.TOPE_DE_LA_RESPUESTA);
});

test("el remitente se parte bien, y sin nombre cae en la dirección", () => {
    assert.deepEqual(r.partirRemitente('"Ana Pérez" <ana@x.com>'), { nombre: "Ana Pérez", direccion: "ana@x.com" });
    assert.deepEqual(r.partirRemitente("<solo@x.com>"), { nombre: "solo@x.com", direccion: "solo@x.com" });
    assert.deepEqual(r.partirRemitente("plano@x.com"), { nombre: "plano@x.com", direccion: "plano@x.com" });
});

test("el HTML de un correo va con su CSP y su base; el texto plano se escapa", () => {
    const html = r.elDocumentoDelCorreo({ html: "<p>Hola</p><script>x()</script>", texto: null });
    assert.ok(html.includes(`content="${r.POLITICA_DEL_CORREO}"`));
    assert.ok(r.POLITICA_DEL_CORREO.startsWith("default-src 'none'"), "nada de scripts ni conexiones");
    assert.ok(!/script-src/.test(r.POLITICA_DEL_CORREO));
    assert.ok(html.indexOf('<base target="_blank">') < html.indexOf("<p>Hola</p>"), "nuestro <base> va antes que el del correo");
    const plano = r.elDocumentoDelCorreo({ html: null, texto: "<b>no soy html</b>" });
    assert.ok(plano.includes("&lt;b&gt;no soy html&lt;/b&gt;"));
});

test("el nombre de un adjunto no parte la cabecera ni mete rutas", () => {
    assert.equal(r.elNombreSeguroDelAdjunto('../../etc/"passwd"\r\nX: y'), ".._.._etc__passwd___X: y");
    assert.equal(r.elNombreSeguroDelAdjunto(""), "adjunto");
    assert.equal(r.elTamanoLegible(1536), "1,5 KB");
    assert.equal(r.elTamanoLegible(null), "");
});

test("el botón de Gmail/Outlook pide leer, organizar y enviar, y nada más", () => {
    const g = new URL(r.laDireccionDeAutorizacion("gmail", { clientId: "c", vuelta: "https://a.b/api/correo/oauth/gmail", estado: "s" }));
    const permisos = g.searchParams.get("scope").split(" ");
    assert.ok(permisos.includes("https://www.googleapis.com/auth/gmail.modify"), "marcar como leído y mandar a la papelera");
    assert.ok(permisos.includes("https://www.googleapis.com/auth/gmail.send"));
    assert.ok(!permisos.some((p) => /mail\.google\.com/.test(p)), "sin el permiso de borrar para siempre");
    assert.equal(g.searchParams.get("access_type"), "offline");
    assert.equal(g.searchParams.get("prompt"), "consent", "volver a conectar vuelve a pedir el permiso nuevo");
    const o = new URL(r.laDireccionDeAutorizacion("outlook", { clientId: "c", vuelta: "v", estado: "s" }));
    const po = o.searchParams.get("scope").split(" ");
    assert.ok(po.includes("offline_access"));
    assert.ok(po.includes("Mail.ReadWrite") && po.includes("Mail.Send"));
    assert.ok(!po.includes("Mail.Read"), "ReadWrite ya incluye leer");
    assert.equal(r.losPermisosAlRenovar("outlook"), "offline_access User.Read Mail.ReadWrite Mail.Send", "al renovar se piden los MISMOS");
    assert.equal(r.hayLlavesDe("gmail", {}), false, "sin llaves el botón no se ofrece como si funcionara");
    assert.equal(r.hayLlavesDe("gmail", { GOOGLE_OAUTH_CLIENT_ID: "a", GOOGLE_OAUTH_CLIENT_SECRET: "b" }), true);
    assert.equal(r.comoProveedor("whatsapp"), null);
});

test("la falta de permiso se reconoce en los dos proveedores, y dice qué hacer", () => {
    assert.equal(r.esFaltaDePermiso("Request had insufficient authentication scopes."), true);
    assert.equal(r.esFaltaDePermiso("ACCESS_TOKEN_SCOPE_INSUFFICIENT"), true);
    assert.equal(r.esFaltaDePermiso("ErrorAccessDenied"), true);
    assert.equal(r.esFaltaDePermiso("Access is denied. Check credentials and try again."), true);
    assert.equal(r.esFaltaDePermiso("Requested entity was not found."), false);
    assert.equal(r.esFaltaDePermiso(null), false);
    assert.match(r.MOTIVO_SIN_PERMISO_PARA_ORGANIZAR, /Vuelve a conectarlo/);
});

const C = (id, sinLeer) => ({ id, de: id, deDireccion: "", asunto: id, fragmento: "", fecha: null, sinLeer, conAdjuntos: false });

test("abrir marca leído en la lista, y deshacerlo devuelve el punto", () => {
    const lista = [C("a", true), C("b", true)];
    const leida = r.conLeido(lista, "a");
    assert.deepEqual(leida.map((c) => c.sinLeer), [false, true]);
    assert.equal(leida[1], lista[1], "lo que no cambia no se copia");
    assert.deepEqual(r.conLeido(leida, "a", true).map((c) => c.sinLeer), [true, true]);
    assert.deepEqual(r.conLeido(lista, "zzz"), lista, "un id que no está no cambia nada");
});

test("eliminar quita la fila y, si el proveedor dice que no, vuelve a SU sitio", () => {
    const lista = [C("a", false), C("b", false), C("c", false)];
    const q = r.sinElCorreo(lista, "b");
    assert.deepEqual(q.lista.map((c) => c.id), ["a", "c"]);
    assert.equal(q.posicion, 1);
    assert.deepEqual(r.devolverElCorreo(q.lista, q.quitado, q.posicion).map((c) => c.id), ["a", "b", "c"]);
    assert.deepEqual(r.devolverElCorreo([C("a")], q.quitado, 9).map((c) => c.id), ["a", "b"], "posición acotada");
    assert.equal(r.devolverElCorreo(lista, lista[1], 0), lista, "no se duplica");
    assert.deepEqual(r.sinElCorreo(lista, "zzz").posicion, -1);
});

test("la confirmación de eliminar dice adónde va en cada proveedor", () => {
    assert.match(r.laAdvertenciaDeEliminar("gmail"), /papelera de Gmail/);
    assert.match(r.laAdvertenciaDeEliminar("outlook"), /Elementos eliminados/);
    assert.match(r.laAdvertenciaDeEliminar("imap"), /no tiene papelera, se elimina definitivamente/);
});

/* ── Barrido del código ──────────────────────────────────────────────────── */

test("ningún fichero de Correo toca un camino de Chats", { skip: ROTO }, () => {
    for (const f of FICHEROS_DE_CORREO) {
        assert.deepEqual(tocaChats(leer(f)), [], `${f} no puede nombrar caminos de Chats`);
    }
});

test("toda consulta de correo_cuentas va acotada por la PERSONA", { skip: ROTO }, () => {
    assert.deepEqual(consultasSinPersona(leer("lib/correo-db.ts")), []);
});

test("ninguna acción acepta un userId, ni resuelve un ALCANCE de cuenta", { skip: ROTO }, () => {
    const a = leer("actions/correo-actions.ts");
    assert.ok(!/userId/.test(a), "el dueño sale de la sesión, nunca del navegador");
    assert.ok(!/laCuentaDeLaAccion|assertCanAccessTargetUser/.test(a), "el correo no tiene alcance: es de una persona");
    assert.ok(/laPersonaQueActua/.test(a));
    for (const exp of a.matchAll(/export\s+(async\s+function|const|function|let)\s+(\w+)/g)) {
        assert.equal(exp[1], "async function", `${exp[2]}: un fichero 'use server' solo exporta funciones async`);
    }
});

test("el cuerpo se pinta en un iframe SIN allow-scripts, y la respuesta no lleva destinatario del navegador", { skip: ROTO }, () => {
    const c = leer("app/(root)/correo/_components/LecturaDelCorreo.tsx");
    const sandbox = /sandbox="([^"]*)"/.exec(c);
    assert.ok(sandbox, "el iframe lleva sandbox");
    assert.ok(!sandbox[1].includes("allow-scripts") && !sandbox[1].includes("allow-same-origin"));
    assert.ok(!/dangerouslySetInnerHTML/.test(c), "el HTML de un correo nunca va directo al DOM de la plataforma");
    assert.match(c, /responderCorreoAction\(buzonId, correoId, texto, archivos\)/, "responder manda el texto y los archivos: el destinatario lo pone el servidor");
    assert.doesNotMatch(leer("app/(root)/correo/_components/CorreoClient.tsx"), /dangerouslySetInnerHTML|<iframe/);
});

test("barrido: abrir MARCA como leído y eliminar va a la papelera, igual en los tres", { skip: ROTO }, () => {
    const a = leer("actions/correo-actions.ts");
    assert.match(a, /export async function eliminarCorreoAction/);
    assert.match(a, /proveedor\.marcarComoLeido\(r\.buzon, correoId\)/, "abrir es la única que marca");
    const resp = a.slice(a.indexOf("export async function responderCorreoAction"));
    assert.doesNotMatch(resp.slice(0, resp.indexOf("export async function", 10)), /marcarComoLeido/, "responder no marca");
    const p = leer("lib/correo-proveedores.server.ts");
    // Los tres proveedores tienen las dos, con el mismo nombre.
    assert.equal((p.match(/async marcarComoLeido\(buzon: Buzon, id: string\)/g) ?? []).length, 3);
    assert.equal((p.match(/async eliminar\(buzon: Buzon, id: string\)/g) ?? []).length, 3);
    assert.doesNotMatch(p, /method: "DELETE"/, "Gmail y Outlook nunca borran: mandan a la papelera");
    assert.match(p, /readOnly: !escribir/, "la bandeja sigue en solo lectura salvo al marcar o eliminar");
    const c = leer("app/(root)/correo/_components/CorreoClient.tsx");
    assert.match(c, /eliminarCorreoAction\(c\.buzonId, c\.id\)/, "se elimina en el buzón DEL correo");
    const l = leer("app/(root)/correo/_components/LecturaDelCorreo.tsx");
    assert.match(l, /leerCorreoAction\(buzonId, correoId, estabaSinLeer\)/);
    assert.match(leer("app/(root)/correo/_components/FilaDeCorreo.tsx"), /aria-label="Eliminar correo"/, "desde la fila de la bandeja");
    assert.match(l, /"Eliminar este correo"/, "y desde el correo abierto");
});

/* ── Lo que se añadió para que Correo sea tan completo como Chats ────────── */

const R = (id, extra = {}) => ({ id, buzonId: "a", de: id, deDireccion: `${id}@x.com`, asunto: `Asunto ${id}`, fragmento: "", fecha: "2026-09-20T00:00:00Z", sinLeer: false, conAdjuntos: false, ...extra });
const A = (id, extra = {}) => ({ buzonId: "a", id, de: "Viejo", deDireccion: "v@x.com", asunto: "Foto", fragmento: "", fecha: null, conAdjuntos: false, ancladoEn: 1, ...extra });

test("los anclados van arriba, sin repetirse, con lo cargado por encima de la foto, y acotados a lo que se mira", () => {
    const { arriba, resto } = r.conLosAncladosArriba([R("1"), R("2"), R("3")], [A("2", { ancladoEn: 5 }), A("9", { ancladoEn: 9 })], null);
    assert.deepEqual(arriba.map((c) => c.id), ["9", "2"], "el más recién anclado primero, y el que no está cargado sale de su foto");
    assert.equal(arriba.find((c) => c.id === "2").asunto, "Asunto 2", "si está cargado manda lo cargado, no la foto vieja");
    assert.deepEqual(resto.map((c) => c.id), ["1", "3"], "un anclado no sale dos veces");
    const soloB = r.conLosAncladosArriba([R("1")], [A("2", { buzonId: "b" })], "a");
    assert.deepEqual(soloB.arriba, [], "mirando un buzón, los anclados de otro no se cuelan");
    assert.deepEqual(r.conElAnclado([A("1")], null, "a::1"), [], "quitar");
});

test("el buscador por campo: remitente, asunto o todo, sin acentos y sin mayúsculas", () => {
    const c = R("1", { de: "José Pérez", deDireccion: "jose@cliente.com", asunto: "Cotización de sillas", fragmento: "precio" });
    assert.equal(r.pasaLaBusqueda(c, "jose", "remitente"), true);
    assert.equal(r.pasaLaBusqueda(c, "cliente.com", "remitente"), true);
    assert.equal(r.pasaLaBusqueda(c, "sillas", "remitente"), false, "por remitente no mira el asunto");
    assert.equal(r.pasaLaBusqueda(c, "COTIZACION", "asunto"), true);
    assert.equal(r.pasaLaBusqueda(c, "jose", "asunto"), false);
    assert.equal(r.pasaLaBusqueda(c, "precio", "todo"), true, "el general sigue mirando el fragmento");
    assert.equal(r.pasaLaBusqueda(c, "   ", "asunto"), true);
    assert.deepEqual([...r.CAMPOS_DE_BUSQUEDA], ["todo", "remitente", "asunto"]);
    assert.equal(r.comoCampoDeBusqueda("raro"), "todo");
    assert.match(r.TEXTO_DEL_BUSCADOR.remitente, /remitente/);
});

test("reenviar: destinatarios de verdad, un solo «Fwd:», y el original debajo", () => {
    assert.deepEqual(r.comoDestinatarios("a@x.com, A@x.com; b@y.co").lista, ["a@x.com", "b@y.co"]);
    assert.equal(r.comoDestinatarios("no-es-correo").ok, false);
    assert.equal(r.comoDestinatarios("").ok, false);
    assert.equal(r.comoDestinatarios(Array.from({ length: 30 }, (_, i) => `p${i}@x.com`).join(",")).ok, false, "con tope");
    assert.equal(r.elAsuntoDelReenvio("Hola"), "Fwd: Hola");
    assert.equal(r.elAsuntoDelReenvio("Fwd: Hola"), "Fwd: Hola");
    const cuerpo = r.elCuerpoDelReenvio({ de: "Ana", deDireccion: "ana@x.com", asunto: "Hola", fecha: null, para: ["b@x.com"], texto: "Original", html: null }, "Mira esto");
    assert.match(cuerpo.texto, /^Mira esto\n\n---------- Mensaje reenviado ----------[\s\S]*Original$/);
    assert.match(cuerpo.html, /Mensaje reenviado/);
});

test("los archivos que se mandan: base64 de verdad, con tope de número y de tamaño", () => {
    const ok = r.comoAdjuntosParaEnviar([{ nombre: "a.pdf", tipo: "application/pdf", base64: "data:application/pdf;base64,QUJD" }]);
    assert.equal(ok.ok, true);
    assert.equal(ok.lista[0].base64, "QUJD", "sin el prefijo data:");
    assert.deepEqual(r.comoAdjuntosParaEnviar(undefined).lista, []);
    assert.equal(r.comoAdjuntosParaEnviar([{ nombre: "a", tipo: "x", base64: "@@@" }]).ok, false);
    assert.equal(r.comoAdjuntosParaEnviar(Array.from({ length: 11 }, () => ({ nombre: "a", tipo: "x", base64: "QUJD" }))).ok, false);
    assert.equal(r.comoAdjuntosParaEnviar([{ nombre: "a", tipo: "x", base64: "QUJD" }], r.TOPE_DE_BYTES_DEL_ENVIO).ok, false, "el tope cuenta lo ya ocupado");
});

test("la firma: debajo, con su separador, solo si está activa, y con tope", () => {
    assert.equal(r.conLaFirma("Hola", "Ana\nVentas", true), "Hola\n\n-- \nAna\nVentas");
    assert.equal(r.conLaFirma("Hola", "Ana", false), "Hola");
    assert.equal(r.conLaFirma("Hola", null, true), "Hola");
    assert.equal(r.comoFirma("   "), null);
    assert.equal(r.comoFirma("x".repeat(2000)).length, r.TOPE_DE_LA_FIRMA);
});

test("barrido: la lectura y la barra de responder son las de Chats, con solo lo que aplica a un correo", { skip: ROTO }, () => {
    const l = leer("app/(root)/correo/_components/LecturaDelCorreo.tsx");
    for (const pieza of ["CABECERA_DEL_PANEL", "CONTROL_DE_ICONO", "GLIFO_DE_CONTROL", "MARCO_DE_LA_BARRA", "ZonaDeHerramientas", "BotonesDeLaDerecha", "useAltoDeLaCaja", "useBarraCompacta", "<AttachmentMenu", "<SuggestedReplyBar"]) {
        assert.ok(l.includes(pieza), `la lectura usa ${pieza}, la pieza de Chats`);
    }
    for (const mando of ["Responder", "Reenviar", "Marcar como no leído", "Eliminar este correo", "Sugerir respuesta con IA"]) {
        assert.ok(l.includes(`"${mando}"`), `la lectura ofrece «${mando}»`);
    }
    assert.match(l, /conNota: false/, "sin nota de voz: un correo no lleva audio grabado");
    assert.match(l, /conVoz: false/, "ni dictado: a la derecha solo la flecha de enviar");
    assert.match(l, /dictado=\{null\}/);
    assert.ok(!l.includes("useSpeechDictation") && !l.includes("AudioLines"), "el icono de voz no está en un correo");
    assert.match(l, /BOTON_DE_ENVIAR, "disabled:opacity-100"/, "la flecha se ve entera con la caja vacía");
    assert.match(l, /TONO_DEL_MANDO\[cual\]/, "cada mando lleva el color de su equivalente en Chats");
    for (const deChats of ["EmojiPickerPanel", "FormatoDeTexto", "QuickReplies", "useAudioRecording", "notaInterna", "Macros"]) {
        assert.ok(!l.includes(deChats), `${deChats} es de WhatsApp: no va en un correo`);
    }
    const c = leer("app/(root)/correo/_components/CorreoClient.tsx");
    assert.match(c, /conLosAncladosArriba\(/);
    assert.match(c, /pasaLaBusqueda\(c, busqueda, campo\)|pasaLaBusqueda\(/);
    const fila = leer("app/(root)/correo/_components/FilaDeCorreo.tsx");
    assert.match(fila, /data-marca-destacado/);
    assert.match(fila, /data-marca-anclado/);
    assert.match(c, /archivarCorreoAction\(/);
    const a = leer("actions/correo-actions.ts");
    assert.match(a, /conLaFirma\(cuerpo, r\.buzon\.firma, r\.buzon\.firmaActiva\)/, "la firma la pone el servidor");
    const p = leer("lib/correo-proveedores.server.ts");
    for (const f of ["marcarComoNoLeido", "destacar", "archivar", "reenviar"]) {
        assert.equal((p.match(new RegExp(`async ${f}\\(buzon: Buzon`, "g")) ?? []).length, 3, `${f} en los tres proveedores`);
    }
    // El SuggestedReplyBar se mudó a shared, y Chats lo importa de ahí.
    assert.match(leer("app/(root)/chats/_components/chat-main.tsx"), /@\/components\/shared\/SuggestedReplyBar/);
});

const ANTES_DE_LO_COMPLETO = process.env.ANTES_DE_LO_COMPLETO || "717d426";
const deAntesC = (f) => sinComentarios(execFileSync("git", ["show", `${ANTES_DE_LO_COMPLETO}:${f}`], { cwd: RAIZ, encoding: "utf8" }));

test("MODO=roto: antes no se podía reenviar, archivar, destacar, anclar ni marcar como no leído", { skip: !ROTO }, () => {
    const a = deAntesC("actions/correo-actions.ts");
    for (const accion of ["reenviarCorreoAction", "archivarCorreoAction", "destacarCorreoAction", "anclarCorreoAction", "marcarNoLeidoAction", "guardarFirmaAction", "sugerirRespuestaDeCorreoAction"]) {
        assert.doesNotMatch(a, new RegExp(accion), `no existía ${accion}`);
    }
    const c = deAntesC("app/(root)/correo/_components/CorreoClient.tsx");
    assert.doesNotMatch(c, /AttachmentMenu|useSpeechDictation|SuggestedReplyBar/, "la barra de responder no tenía ni archivos, ni dictado, ni IA");
    assert.doesNotMatch(c, /Forward|Archive|Star\b|Pin\b/);
});

/* ── MODO=roto: lo que había, pinchado a un commit, y que el fallo está ahí ─ */
// El «antes» va PINCHADO: `origin/main` pasa a ser el «después» en cuanto esto se fusiona.
const ANTES_REF = process.env.ANTES_REF || "dc71d09";
const deAntes = (f) => sinComentarios(execFileSync("git", ["show", `${ANTES_REF}:${f}`], { cwd: RAIZ, encoding: "utf8" }));

test("MODO=roto: antes abrir NO marcaba y no había forma de eliminar", { skip: !ROTO }, () => {
    const puro = deAntes("lib/correo.ts");
    assert.match(puro, /gmail\.readonly/, "Gmail se conectaba con solo LEER: no podía marcar ni aunque quisiera");
    assert.match(puro, /"Mail\.Read"/);
    const p = deAntes("lib/correo-proveedores.server.ts");
    assert.match(p, /mailboxOpen\("INBOX", \{ readOnly: true \}\)/, "IMAP abría SIEMPRE en solo lectura");
    assert.doesNotMatch(p, /marcarComoLeido|\\\\Seen"\]|modify|isRead: true/);
    assert.doesNotMatch(p, /eliminar|trash|deleteditems/);
    const a = deAntes("actions/correo-actions.ts");
    assert.doesNotMatch(a, /eliminarCorreoAction|marcarComoLeido/);
    assert.doesNotMatch(deAntes("app/(root)/correo/_components/CorreoClient.tsx"), /Trash2|eliminarCorreoAction/, "ningún botón de eliminar");
});

test("la ruta está en el desplegable de módulos, con su icono, y los paquetes van externos", () => {
    assert.match(leer("lib/navigation-routes.ts"), /\{ route: "\/correo" \}/);
    assert.match(leer("schema/module.ts"), /EnvelopeIcon,/);
    assert.match(leer("next.config.js"), /"imapflow", "nodemailer", "mailparser"/);
});

/* ── MODO=roto: las versiones ingenuas, y que el barrido las caza ─────────── */

test("MODO=roto: el barrido caza un correo guardado por el camino de Chats", { skip: !ROTO }, () => {
    const ingenuo = `import { persistChatMessage } from "@/lib/chat-store";\nawait persistChatMessage({ remoteJid: correo.de, texto });`;
    assert.ok(tocaChats(ingenuo).length > 0);
});

test("MODO=roto: el barrido caza un buzón buscado por su id a secas", { skip: !ROTO }, () => {
    const ingenuo = 'const f = await db.$queryRaw`SELECT * FROM "correo_cuentas" WHERE "id" = ${buzonId}`;';
    assert.equal(consultasSinPersona(ingenuo).length, 1);
});

/* ── Por qué no se conectó: en palabras que digan qué hacer ─────────────────── */

// El motivo EXACTO que Google devolvió en producción el 2026-09-27 al volver
// de autorizar Gmail: la API estaba apagada en el proyecto de la plataforma.
const GMAIL_APAGADA =
    "Gmail API has not been used in project 821244703851 before or it is disabled. Enable it by visiting " +
    "https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=821244703851 then retry.";

test("la API de Gmail apagada se dice en español y con qué hacer", { skip: ROTO }, () => {
    const t = r.elMotivoLegible("gmail", GMAIL_APAGADA);
    assert.doesNotMatch(t, /has not been used/);
    assert.match(t, /API de Gmail/);
    assert.match(t, /Google Cloud/);
    assert.match(t, /vuelve a pulsar/i);
    assert.match(r.elMotivoLegible("gmail", "Request had insufficient authentication scopes."), /casillas/);
    assert.match(r.elMotivoLegible("outlook", "redirect_uri_mismatch"), /Microsoft/);
    // Lo que no se reconoce se enseña tal cual: inventar un motivo es peor.
    assert.equal(r.elMotivoLegible("gmail", "algo raro"), "algo raro");
    assert.equal(r.elMotivoLegible("gmail", ""), "No se pudo conectar el correo.");
});

test("MODO=roto: antes el motivo llegaba en inglés y sin decir qué hacer", { skip: !ROTO }, () => {
    const antes = (_p, motivo) => motivo; // la ruta pasaba `e.message` tal cual
    assert.match(antes("gmail", GMAIL_APAGADA), /has not been used/);
    assert.doesNotMatch(antes("gmail", GMAIL_APAGADA), /Google Cloud/);
});

test("barrido: la vuelta de autorización pasa el motivo por elMotivoLegible", { skip: ROTO }, () => {
    const ruta = leer("app/api/correo/oauth/[proveedor]/route.ts");
    assert.match(ruta, /elMotivoLegible\(proveedor, e\.message\)/);
    const cliente = leer("app/(root)/correo/_components/CorreoClient.tsx");
    assert.doesNotMatch(cliente, /toast\.error\(error\)/, "el error de la vuelta no puede ser solo un toast que se va");
    assert.match(cliente, /aviso=\{aviso\}[\s\S]*aviso=\{aviso\}/, "los dos sitios con botones de conectar llevan el aviso");
});

/* ── La bandeja UNIFICADA y el filtro de leído ───────────────────────────── */

const E = (buzonId, id, fecha, sinLeer = false) => ({ id, buzonId, de: id, deDireccion: "", asunto: id, fragmento: "", fecha, sinLeer, conAdjuntos: false });

test("la llave de un correo lleva su buzón: el mismo id en dos buzones son dos correos", () => {
    assert.equal(r.laLlaveDelCorreo({ id: "7", buzonId: "a" }), "a::7");
    assert.notEqual(r.laLlaveDelCorreo({ id: "7", buzonId: "a" }), r.laLlaveDelCorreo({ id: "7", buzonId: "b" }));
    assert.equal(r.laLlaveDelCorreo({ id: "7" }), "7", "sin buzón, el id: las listas de un solo buzón siguen igual");
    const lista = [E("a", "7", null, true), E("b", "7", null, true)];
    assert.deepEqual(r.conLeido(lista, "b::7").map((c) => c.sinLeer), [true, false], "abrir el de B no toca el de A");
    const q = r.sinElCorreo(lista, "a::7");
    assert.deepEqual(q.lista.map(r.laLlaveDelCorreo), ["b::7"]);
    assert.deepEqual(r.devolverElCorreo(q.lista, q.quitado, q.posicion).map(r.laLlaveDelCorreo), ["a::7", "b::7"]);
});

test("la unificada mezcla por fecha, y lo que aún puede quedar por DEBAJO de otro buzón espera", () => {
    const u = r.laBandejaUnificada({
        a: { correos: [E("a", "a1", "2026-09-20T00:00:00Z"), E("a", "a2", "2026-08-01T00:00:00Z")], siguiente: null },
        b: { correos: [E("b", "b1", "2026-09-25T00:00:00Z"), E("b", "b2", "2026-09-10T00:00:00Z")], siguiente: "p2" },
    });
    // «a2» es de agosto y B todavía puede traer correos de entre el 10-09 y agosto:
    // enseñarlo ya haría que cargar más metiera correos POR ENCIMA de él.
    assert.deepEqual(u.visibles.map(r.laLlaveDelCorreo), ["b::b1", "a::a1", "b::b2"]);
    assert.equal(u.ocultos, 1);
    assert.equal(u.hayMas, true);
    const todo = r.laBandejaUnificada({
        a: { correos: [E("a", "a1", "2026-09-20T00:00:00Z"), E("a", "a2", "2026-08-01T00:00:00Z")], siguiente: null },
        b: { correos: [E("b", "b1", "2026-09-25T00:00:00Z"), E("b", "b2", "2026-09-10T00:00:00Z"), E("b", "b3", "2026-08-15T00:00:00Z")], siguiente: null },
    });
    assert.deepEqual(todo.visibles.map(r.laLlaveDelCorreo), ["b::b1", "a::a1", "b::b2", "b::b3", "a::a2"], "cargado todo, sale todo y en orden");
    assert.equal(todo.ocultos, 0);
    assert.equal(todo.hayMas, false);
});

test("la unificada: un buzón vacío o fallido no pone horizonte, y un correo sin fecha va al final", () => {
    const u = r.laBandejaUnificada({
        a: { correos: [E("a", "x", null), E("a", "a1", "2026-09-20T00:00:00Z")], siguiente: null },
        b: { correos: [], siguiente: "p2" },
    });
    assert.deepEqual(u.visibles.map(r.laLlaveDelCorreo), ["a::a1", "a::x"]);
    assert.equal(u.hayMas, true, "el vacío con página siguiente sigue ofreciendo cargar más");
    assert.deepEqual(r.laBandejaUnificada({}).visibles, []);
    // Un solo buzón se pinta como siempre: todo lo cargado.
    const uno = r.laBandejaUnificada({ a: { correos: [E("a", "1", "2026-09-01T00:00:00Z"), E("a", "2", "2026-09-02T00:00:00Z")], siguiente: "p" } });
    assert.deepEqual(uno.visibles.map((c) => c.id), ["2", "1"]);
    assert.equal(uno.ocultos, 0);
});

test("la palabra del buzón: lo de antes de la arroba, y el dominio si eso no los distingue", () => {
    const todas = ["ana@gmail.com", "ana@verzay.com", "ventas@verzay.com"];
    assert.equal(r.laPalabraDelBuzon("ventas@verzay.com", todas), "ventas");
    assert.equal(r.laPalabraDelBuzon("ana@gmail.com", todas), "gmail");
    assert.equal(r.laPalabraDelBuzon("ana@verzay.com", todas), "verzay");
    assert.equal(r.laPalabraDelBuzon("ana@verzay.com", ["ana@verzay.com", "ana@verzay.co"]), "ana@verzay.com", "si ni el dominio los distingue, la dirección entera");
    assert.equal(r.laPalabraDelBuzon("ana@gmail.com", ["ana@gmail.com"]), "ana");
});

test("los filtros: cuatro pastillas —Destacados, Todos, Sin leer, Archivados— y el resto en la flecha", () => {
    assert.deepEqual([...r.FILTROS_EN_PASTILLA].map((f) => r.NOMBRE_DEL_FILTRO[f]), ["Destacados", "Todos", "Sin leer", "Archivados"]);
    assert.deepEqual([...r.FILTROS_EN_LA_FLECHA].map((f) => r.NOMBRE_DEL_FILTRO[f]), ["Leídos", "Con adjuntos", "Anclados"]);
    const [a, b, d, x] = [
        { sinLeer: true, destacado: false, adjuntos: false },
        { sinLeer: false, destacado: false, adjuntos: true },
        { sinLeer: false, destacado: true, adjuntos: false },
        { sinLeer: false, destacado: false, adjuntos: false },
    ];
    const f = (filtro, anclado = () => false) => [a, b, d, x].filter((c) => r.pasaElFiltroDeCorreo(c, filtro, anclado(c)));
    assert.deepEqual(f("sinLeer"), [a]);
    assert.deepEqual(f("leidos"), [b, d, x]);
    assert.deepEqual(f("destacados"), [d]);
    assert.deepEqual(f("todos"), [a, b, d, x]);
    assert.deepEqual(f("archivados"), [a, b, d, x], "«Archivados» no filtra lo cargado: es otra carpeta");
    assert.deepEqual(f("anclados", (c) => c === x), [x]);
    assert.equal(r.comoFiltroDeCorreo("raro"), "todos");
    assert.equal(r.comoFiltroDeCorreo("archivados"), "archivados");
    assert.equal(r.laCarpetaDelFiltro("archivados"), "archivo");
    for (const k of ["todos", "sinLeer", "destacados", "leidos", "conAdjuntos", "anclados"]) assert.equal(r.laCarpetaDelFiltro(k), "entrada");
    assert.equal(r.comoCarpeta("archivo"), "archivo");
    assert.equal(r.comoCarpeta("borrados"), "entrada", "lo que no se entiende es la bandeja de entrada");
    assert.equal(r.esFiltroDeLaFlecha("conAdjuntos"), true);
    assert.equal(r.esFiltroDeLaFlecha("sinLeer"), false);
});

test("un id de IMAP en el archivo lleva su prefijo: dos carpetas no comparten UID", () => {
    assert.equal(r.idImapDelArchivo("7"), "archivo:7");
    assert.deepEqual(r.partirIdImap("archivo:7"), { enArchivo: true, uid: "7" });
    assert.deepEqual(r.partirIdImap("7"), { enArchivo: false, uid: "7" });
    assert.notEqual(r.idImapDelArchivo("7"), "7");
});

test("«Nuevo»: sin leer y de las últimas 24 horas; lo leído o lo viejo no lo lleva", () => {
    const ahora = Date.parse("2026-09-27T12:00:00Z");
    const hace = (h) => new Date(ahora - h * 3600_000).toISOString();
    assert.equal(r.esCorreoNuevo({ sinLeer: true, fecha: hace(1) }, ahora), true);
    assert.equal(r.esCorreoNuevo({ sinLeer: true, fecha: hace(23.9) }, ahora), true);
    assert.equal(r.esCorreoNuevo({ sinLeer: true, fecha: hace(25) }, ahora), false);
    assert.equal(r.esCorreoNuevo({ sinLeer: false, fecha: hace(1) }, ahora), false, "leído ya no es nuevo");
    assert.equal(r.esCorreoNuevo({ sinLeer: true, fecha: null }, ahora), false, "sin fecha no se puede decir");
    assert.equal(r.esCorreoNuevo({ sinLeer: true, fecha: "no es fecha" }, ahora), false);
});

test("el lote: la acción se pinta, lo que falló vuelve, y la lista se sanea", () => {
    const c = (id, extra = {}) => ({ id, buzonId: "b", sinLeer: true, destacado: false, ...extra });
    const lista = [c("1"), c("2"), c("3")];
    const ll = (id) => r.laLlaveDelCorreo({ id, buzonId: "b" });
    const sel = new Set([ll("1"), ll("3")]);
    assert.deepEqual(r.conElLote(lista, sel, "leido").map((x) => x.sinLeer), [false, true, false]);
    assert.deepEqual(r.conElLote(lista, sel, "destacar").map((x) => x.destacado), [true, false, true]);
    assert.deepEqual(r.conElLote(lista, sel, "archivar").map((x) => x.id), ["2"], "archivar y eliminar los sacan");
    assert.deepEqual(r.conElLote(lista, sel, "eliminar").map((x) => x.id), ["2"]);
    // Lo que falló vuelve a SU sitio, con su estado de antes.
    const tras = r.conElLote(lista, sel, "archivar");
    assert.deepEqual(r.devolverLosDelLote(tras, lista, new Set([ll("3")])).map((x) => x.id), ["2", "3"]);
    const leidos = r.conElLote(lista, sel, "leido");
    assert.deepEqual(r.devolverLosDelLote(leidos, lista, new Set([ll("1")])).map((x) => x.sinLeer), [true, true, false]);
    // Saneado: repetidos fuera, basura fuera, tope.
    const l = r.comoLoteDeCorreos([{ buzonId: "b", id: "1" }, { buzonId: "b", id: "1" }, { buzonId: 3, id: "x" }, "basura", { buzonId: "c", id: "1" }]);
    assert.deepEqual(l, [{ buzonId: "b", id: "1" }, { buzonId: "c", id: "1" }]);
    assert.equal(r.comoLoteDeCorreos(Array.from({ length: 500 }, (_, i) => ({ buzonId: "b", id: String(i) }))).length, r.TOPE_DEL_LOTE);
    assert.equal(r.comoAccionEnLote("borrarTodo"), null);
    assert.equal(r.comoAccionEnLote("archivar"), "archivar");
    // La selección: alternar, y solo cuenta lo que se ve.
    const s1 = r.alternarEnLaSeleccion(new Set(), "x");
    assert.deepEqual([...s1], ["x"]);
    assert.deepEqual([...r.alternarEnLaSeleccion(s1, "x")], []);
    assert.deepEqual([...r.laSeleccionVisible(new Set([ll("1"), ll("9")]), lista)], [ll("1")], "lo que ya no se ve deja de contar");
});

test("las iniciales del remitente: dos letras, sin la dirección", () => {
    assert.equal(r.lasInicialesDelRemitente("Ana Pérez"), "AP");
    assert.equal(r.lasInicialesDelRemitente("ana@verzay.com"), "AN");
    assert.equal(r.lasInicialesDelRemitente("Ana Beatriz Pérez"), "AP");
    assert.equal(r.lasInicialesDelRemitente(""), "?");
});

test("barrido: la unificada pide todos a la vez sin que uno tumbe a los demás, y solo buzones de la persona", { skip: ROTO }, () => {
    const a = leer("actions/correo-actions.ts");
    const u = a.slice(a.indexOf("export async function bandejaUnificadaAction"));
    const cuerpo = u.slice(0, u.indexOf("export async function", 10));
    assert.match(cuerpo, /Promise\.allSettled/, "nunca Promise.all: un buzón caído no vacía la bandeja");
    assert.doesNotMatch(cuerpo, /Promise\.all\(/);
    assert.match(cuerpo, /losBuzonesDe\(persona\.id\)/, "la lista sale de la persona, no del navegador");
    assert.match(cuerpo, /elBuzonDe\(persona\.id, /);
    assert.match(cuerpo, /buzonId: visible\.id/, "cada correo sale con su buzón");
    const c = leer("app/(root)/correo/_components/CorreoClient.tsx");
    const fila = leer("app/(root)/correo/_components/FilaDeCorreo.tsx");
    assert.match(c, /laBandejaUnificada\(porCarpeta\.entrada\)/);
    assert.match(fila, /<InsigniaDeLinea/, "la marca del buzón es la MISMA de Chats");
    assert.match(c, /pasaElFiltroDeCorreo\(c, filtro, /);
    assert.match(c, /key=\{llave\}/, "la fila se identifica por su llave con buzón, no por el id a secas");
});

/* ── El selector y las pastillas son LOS de Chats ─────────────────────────── */

test("los números de las pastillas: sobre lo cargado, con «+» si quedan páginas, y en cero no hay número", () => {
    const L = (n, sin, dest = 0) => Array.from({ length: n }, (_, i) => ({ sinLeer: i < sin, destacado: i < dest, adjuntos: false }));
    const E = (n, sin, dest, hayMas = false) => ({ correos: L(n, sin, dest), hayMas });
    assert.deepEqual(r.losNumerosDelFiltro(E(4, 2, 1)), {
        destacados: "1", todos: "4", sinLeer: "2", archivados: undefined, leidos: "2", conAdjuntos: undefined, anclados: undefined,
    });
    const conMas = r.losNumerosDelFiltro(E(4, 2, 1, true));
    assert.equal(conMas.todos, "4+", "con más páginas dice «al menos»");
    assert.equal(conMas.sinLeer, "2+");
    assert.equal(r.losNumerosDelFiltro(E(3, 0, 0, true)).sinLeer, undefined, "ni siquiera «0+»");
    assert.equal(r.losNumerosDelFiltro(E(150, 120, 0)).todos, "99+");
    assert.equal(r.losNumerosDelFiltro(E(4, 0, 0), { correos: L(5, 0), hayMas: false }).archivados, "5", "el archivo cuenta solo si se trajo");
    assert.equal(r.losNumerosDelFiltro(E(4, 0, 0), null).archivados, undefined, "sin traer, sin número — nunca un 0");
    assert.equal(r.losNumerosDelFiltro(E(4, 0, 0), null, 2).anclados, "2");
});

test("barrido: Correo y Chats pintan el MISMO selector y las MISMAS pastillas", { skip: ROTO }, () => {
    const c = leer("app/(root)/correo/_components/CorreoClient.tsx");
    const busca = leer("app/(root)/chats/_components/ChatSearchBar.tsx");
    const tabs = leer("app/(root)/chats/_components/ChatTabBar.tsx");
    // El selector.
    assert.match(c, /<SelectorDeCanal/, "Correo usa el selector de canales de Chats");
    assert.match(busca, /<SelectorDeCanal/, "y Chats también, desde el mismo sitio");
    assert.doesNotMatch(c, /<select\b/, "nada de <select> nativo");
    assert.doesNotMatch(busca, /<DropdownMenu\b/, "Chats ya no lleva su propia copia del desplegable");
    // Las pastillas.
    assert.match(c, /<PastillaDeFiltro/, "los filtros de Correo son las pastillas de Chats");
    assert.doesNotMatch(c, /<GrupoDeOpciones/, "no el grupo de botones pequeños");
    assert.match(tabs, /<PastillaDeFiltro/, "y Chats las pinta desde el mismo sitio");
    assert.doesNotMatch(tabs, /const PASTILLA =|const INSIGNIA =|HUECO_QUE_ENCOGE/, "sin su copia de la forma");
    // «Todos» y «Sin leer» con los mismos tonos que en Chats.
    assert.match(c, /todos: TONO_TODOS/);
    assert.match(c, /sinLeer: TONO_SIN_LEER/);
    assert.match(c, /destacados: TONO_DESTACADOS/);
    assert.match(c, /archivados: TONO_ARCHIVADOS/);
    // La flecha «⌄» es la MISMA de Chats.
    assert.match(c, /FLECHA_DE_LA_FILA/);
    assert.match(tabs, /FLECHA_DE_LA_FILA/);
    assert.match(tabs, /TONO_TODOS/);
    assert.match(tabs, /TONO_SIN_LEER/);
    // El panel nace donde nace en Chats: colgado de su botón, bajo la barra.
    assert.match(leer("components/shared/SelectorDeCanal.tsx"), /usePanelFlotante\("columnaAncha", "menu"\)/);
    assert.match(c, /\[MARCA_DE_LA_COLUMNA\]/, "Correo marca su columna para que el panel se mida");
    assert.match(c, /\[MARCA_DE_LA_CABECERA_DE_LA_COLUMNA\]/, "y su cabecera, para nacer debajo de ella");
    // Llamadas conserva su grupo: esto no toca otras pantallas.
    assert.match(leer("app/(root)/crm/llamadas/_components/CallsCrmClient.tsx"), /<GrupoDeOpciones/);
});

// El «antes» de estos dos mandos, PINCHADO: el commit de la bandeja unificada.
const ANTES_DE_LOS_MANDOS = process.env.ANTES_DE_LOS_MANDOS || "ffc44c8";
const deAntesM = (f) => sinComentarios(execFileSync("git", ["show", `${ANTES_DE_LOS_MANDOS}:${f}`], { cwd: RAIZ, encoding: "utf8" }));

test("MODO=roto: antes Correo tenía un <select> nativo y el grupo de botones de Llamadas", { skip: !ROTO }, () => {
    const c = deAntesM("app/(root)/correo/_components/CorreoClient.tsx");
    assert.match(c, /<select\b[\s\S]*aria-label="Buzón"/, "el selector era un <select> del sistema");
    assert.match(c, /<GrupoDeOpciones[\s\S]*grupo="leido"/, "los filtros eran los botones pequeños");
    assert.doesNotMatch(c, /SelectorDeCanal|PastillaDeFiltro/);
    assert.match(deAntesM("app/(root)/chats/_components/ChatTabBar.tsx"), /const PASTILLA =/, "la pastilla vivía dentro de Chats");
});

// El «antes» de la bandeja unificada, PINCHADO: el commit justo anterior.
const ANTES_DE_LA_UNIFICADA = process.env.ANTES_DE_LA_UNIFICADA || "2eae05c";
const deAntesU = (f) => sinComentarios(execFileSync("git", ["show", `${ANTES_DE_LA_UNIFICADA}:${f}`], { cwd: RAIZ, encoding: "utf8" }));

test("MODO=roto: antes había que cambiar de buzón en buzón, sin marca de cuenta, y solo el filtro «Sin leer»", { skip: !ROTO }, () => {
    const c = deAntesU("app/(root)/correo/_components/CorreoClient.tsx");
    assert.doesNotMatch(deAntesU("actions/correo-actions.ts"), /bandejaUnificadaAction/, "no había bandeja de todos");
    assert.doesNotMatch(c, /BANDEJA_UNIFICADA|InsigniaDeLinea/, "ni opción «todas» ni marca de buzón");
    assert.match(c, /setSoloSinLeer\(\(v\) => !v\)/, "el único filtro era un interruptor de «Sin leer»");
    assert.doesNotMatch(c, /Leídos/, "no se podía pedir solo los leídos");
    // Y la lista se identificaba por el id a secas: dos buzones con el mismo id chocaban.
    assert.match(c, /key=\{c\.id\}/);
});

/* ── Las pastillas en su fila, y el selector con el número de cada bandeja ── */

test("los números del selector: el total de cada bandeja, y «Todas» solo si se sabe el de todas", () => {
    const B = [{ id: "a" }, { id: "b" }];
    assert.deepEqual(r.losNumerosDeLasBandejas(B, [{ buzonId: "a", total: 1234 }, { buzonId: "b", total: 87 }]), { todas: 1321, porBuzon: { a: 1234, b: 87 } });
    assert.deepEqual(r.losNumerosDeLasBandejas(B, [{ buzonId: "a", total: 0 }, { buzonId: "b", total: 5 }]), { todas: 5, porBuzon: { a: 0, b: 5 } }, "un cero de verdad se enseña");
    assert.deepEqual(r.losNumerosDeLasBandejas(B, [{ buzonId: "a", total: 10 }, { buzonId: "b", total: null }]), { todas: undefined, porBuzon: { a: 10, b: undefined } }, "con uno que no contestó, «Todas» va sin número: una suma a medias mentiría");
    assert.deepEqual(r.losNumerosDeLasBandejas(B, null), { todas: undefined, porBuzon: { a: undefined, b: undefined } }, "mientras no llegan, sin números");
    assert.deepEqual(r.losNumerosDeLasBandejas(B, [{ buzonId: "a", total: -3 }, { buzonId: "b", total: 1.5 }]).porBuzon, { a: undefined, b: undefined }, "un número imposible no se pinta");
    assert.deepEqual(r.losNumerosDeLasBandejas(B, [{ buzonId: "otro", total: 9 }, { buzonId: "a", total: 1 }]).porBuzon, { a: 1, b: undefined }, "un total de un buzón que no es de la lista no se cuela");
});

test("barrido: las pastillas van en SU fila en todas las anchuras, y el selector lleva número y NO el proveedor", { skip: ROTO }, () => {
    const c = leer("app/(root)/correo/_components/CorreoClient.tsx");
    assert.doesNotMatch(c, /filtros=\{[^}]*pastillas/, "las pastillas ya no van en el carril de la barra");
    assert.doesNotMatch(c, /enElTelefono/, "ni dependen de si es un teléfono: la fila es la misma en todas");
    assert.match(c, /data-fila-de-filtros[\s\S]{0,200}\{pastillas\}/, "van en su fila, debajo");
    assert.equal((c.match(/\{pastillas\}/g) ?? []).length, 1, "y se pintan UNA vez");
    assert.doesNotMatch(c, /NOMBRE_DEL_PROVEEDOR/, "ninguna fila ni rótulo dice «Gmail» u «Outlook»: lo dice el dominio");
    assert.doesNotMatch(c, /detalle:/, "el selector no lleva segunda línea");
    assert.match(c, /todos=\{\{ etiqueta: "Todas", cuenta:/, "«Todas» lleva su número");
    assert.match(c, /cuenta: deLasBandejas\.porBuzon\[b\.id\]/, "y cada bandeja el suyo");
    assert.match(c, /totalesDeLosBuzonesAction/, "sale del proveedor, por su acción");
    const prov = leer("lib/correo-proveedores.server.ts");
    for (const [que, re] of [["Gmail", /labels\/INBOX/], ["Outlook", /mailFolders\/inbox\?\$select=totalItemCount/], ["IMAP", /status\("INBOX", \{ messages: true \}\)/]]) {
        assert.match(prov, re, `${que} cuenta su bandeja de entrada`);
    }
    // Y el selector es el MISMO componente que Chats: la insignia de número es la misma.
    assert.match(leer("app/(root)/chats/_components/ChatSearchBar.tsx"), /cuenta: channelCounts\[ch\.instanceName\]/);
});

// El «antes» de estos tres ajustes, PINCHADO: el commit de la cabecera de Correo.
const ANTES_DE_LA_FILA = process.env.ANTES_DE_LA_FILA || "6205303";
const deAntesF = (f) => sinComentarios(execFileSync("git", ["show", `${ANTES_DE_LA_FILA}:${f}`], { cwd: RAIZ, encoding: "utf8" }));

test("MODO=roto: antes las pastillas iban en la fila del buscador y el selector decía el proveedor sin número", { skip: !ROTO }, () => {
    const c = deAntesF("app/(root)/correo/_components/CorreoClient.tsx");
    assert.match(c, /filtros=\{enElTelefono \? undefined : pastillas\}/, "en computador las pastillas iban en el carril del buscador");
    assert.match(c, /detalle: NOMBRE_DEL_PROVEEDOR\[b\.proveedor\]/, "cada bandeja llevaba «Gmail» debajo");
    assert.match(c, /todos=\{\{ etiqueta: "Todas" \}\}/, "«Todas» sin número");
    assert.doesNotMatch(c, /cuenta:/, "y ninguna bandeja con número");
    assert.doesNotMatch(deAntesF("actions/correo-actions.ts"), /totalesDeLosBuzonesAction/);
});

/* ── Correo como Chats: pastillas, fila, selección, panel y barra ─────────── */

test("barrido: la bandeja es la vista de Chats —empuja con el panel—, la fila no tapa nada y hay selección con la barra de Chats", { skip: ROTO }, () => {
    const c = leer("app/(root)/correo/_components/CorreoClient.tsx");
    const fila = leer("app/(root)/correo/_components/FilaDeCorreo.tsx");
    // 1. Las cuatro pastillas y la flecha de Chats.
    assert.match(c, /FILTROS_EN_PASTILLA\.map/);
    assert.match(c, /data-flecha-de-la-fila/);
    assert.match(c, /FILTROS_EN_LA_FLECHA\.map/);
    // 2. El panel lateral empuja: la bandeja es `data-chat-view` y se mide.
    assert.match(c, /data-chat-view/, "la regla de globals.css le reserva la franja del panel");
    assert.match(c, /<MedidaDeChats \/>/, "y se mide, para que el panel caiga en esa franja");
    // 5. Chips debajo del asunto y la hora de Chats.
    assert.match(fila, /data-chip-nuevo/);
    assert.match(fila, /<InsigniaDeLinea/);
    assert.match(fila, /formatTimeFromEpoch\(/, "la hora es la de la fila de Chats: hoy la hora, antes la fecha");
    // 6. Lo que sale al pasar va en el flujo, nunca `absolute` encima.
    const acciones = fila.slice(fila.indexOf("data-acciones-de-la-fila"), fila.indexOf("<DropdownMenu>"));
    assert.doesNotMatch(acciones, /absolute/, "los botones no flotan encima de la hora ni de la cuenta");
    assert.match(fila, /group-hover:w-7/, "aparecen abriendo su sitio, como la estrella de Chats");
    // 7. La barra de la selección es LA de Chats, y el lote va en una llamada.
    assert.match(c, /<BulkActionBar/);
    assert.match(c, /correosEnLoteAction\(/);
    assert.match(fila, /data-casilla-de-la-fila/);
    const a = leer("actions/correo-actions.ts");
    const lote = a.slice(a.indexOf("export async function correosEnLoteAction"));
    const cuerpo = lote.slice(0, lote.indexOf("export async function", 10));
    assert.match(cuerpo, /elBuzonDe\(persona\.id, item\.buzonId\)/, "cada correo en SU buzón, y solo buzones de la persona");
    assert.doesNotMatch(cuerpo, /Promise\.all\(/, "en serie: Next serializa las acciones y el proveedor no quiere ráfagas");
    // 3 y 4. La barra de responder y la cabecera del correo abierto.
    const l = leer("app/(root)/correo/_components/LecturaDelCorreo.tsx");
    assert.match(l, /conVoz: false/);
    assert.match(l, /TONO_DEL_MANDO/);
    const tonos = leer("lib/mandos-del-correo.ts");
    for (const m of ["responder", "reenviar", "noLeido", "destacar", "eliminar", "mas"]) assert.match(tonos, new RegExp(`${m}:`));
    assert.doesNotMatch(tonos, /\$\{/, "las clases van ENTERAS: Tailwind no genera lo compuesto");
    // Sin quitar comentarios: «./lib/**/*.ts» lleva dentro un «/*» que el limpiador se comería.
    assert.match(fs.readFileSync(join(RAIZ, "tailwind.config.ts"), "utf8"), /"\.\/lib\/\*\*/, "Tailwind mira lib/, donde viven los tonos");
    // Chats pasa a usar la MISMA flecha y la MISMA barra, que ahora saben de correos.
    assert.match(leer("app/(root)/chats/_components/ChatTabBar.tsx"), /FLECHA_DE_LA_FILA/);
    assert.match(leer("app/(root)/chats/_components/BulkActionBar.tsx"), /sustantivo/);
});

// El «antes» de ESTE cambio, PINCHADO: `origin/main` pasa a ser el «después» en cuanto se fusiona.
const ANTES_DE_COMO_CHATS = process.env.ANTES_DE_COMO_CHATS || "aecdcef";
const deAntesCC = (f) => sinComentarios(execFileSync("git", ["show", `${ANTES_DE_COMO_CHATS}:${f}`], { cwd: RAIZ, encoding: "utf8" }));

test("MODO=roto: antes eran tres pastillas sin flecha, los botones flotaban encima de la hora, no había selección ni empujaba el panel", { skip: !ROTO }, () => {
    const c = deAntesCC("app/(root)/correo/_components/CorreoClient.tsx");
    const r0 = deAntesCC("lib/correo.ts");
    assert.match(r0, /FILTROS_DE_LEIDO = \["todos", "sinLeer", "leidos"\]/, "Todos · Sin leer · Leídos");
    assert.doesNotMatch(c, /data-flecha-de-la-fila|Archivados|destacados/, "ni flecha ni Destacados ni Archivados");
    assert.match(c, /data-acciones-de-la-fila\s+className="absolute/, "los botones de la fila flotaban encima");
    assert.doesNotMatch(c, /BulkActionBar|data-casilla-de-la-fila|correosEnLoteAction/, "sin selección múltiple");
    assert.doesNotMatch(c, /data-chat-view|MedidaDeChats/, "el panel lateral la tapaba");
    assert.doesNotMatch(c, /data-chip-nuevo/, "sin chip «Nuevo»");
    assert.match(c, /function laFechaCorta/, "la hora era suya, no la de Chats");
    const l = deAntesCC("app/(root)/correo/_components/LecturaDelCorreo.tsx");
    assert.match(l, /conVoz: true/, "con el icono de voz");
    assert.match(l, /border-input bg-background p-0 text-muted-foreground/, "los mandos en gris plano");
});
