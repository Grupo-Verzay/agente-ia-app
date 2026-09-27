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
    "app/(root)/correo/_components/ConectarCorreo.tsx",
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
    const sentencias = codigo.match(/`[^`]*"correo_cuentas"[^`]*`/g) ?? [];
    return sentencias.filter((s) => !/CREATE (TABLE|UNIQUE INDEX)/.test(s) && !/INSERT INTO/.test(s) && !/"personaId" = \$\{personaId\}/.test(s));
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
    const c = leer("app/(root)/correo/_components/CorreoClient.tsx");
    const sandbox = /sandbox="([^"]*)"/.exec(c);
    assert.ok(sandbox, "el iframe lleva sandbox");
    assert.ok(!sandbox[1].includes("allow-scripts") && !sandbox[1].includes("allow-same-origin"));
    assert.ok(!/dangerouslySetInnerHTML/.test(c), "el HTML de un correo nunca va directo al DOM de la plataforma");
    assert.match(c, /responderCorreoAction\(buzonId, correoId, texto\)/);
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
    assert.match(c, /leerCorreoAction\(buzonId, correoId, estabaSinLeer\)/);
    assert.match(c, /aria-label="Eliminar correo"/, "desde la fila de la bandeja");
    assert.match(c, /aria-label="Eliminar este correo"/, "y desde el correo abierto");
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

test("el filtro de leído: Todos, Sin leer y Leídos, y lo que no se entienda es Todos", () => {
    assert.deepEqual([...r.FILTROS_DE_LEIDO].map((f) => r.NOMBRE_DEL_FILTRO[f]), ["Todos", "Sin leer", "Leídos"]);
    const [a, b] = [{ sinLeer: true }, { sinLeer: false }];
    assert.deepEqual([a, b].filter((c) => r.pasaElFiltroDeLeido(c, "sinLeer")), [a]);
    assert.deepEqual([a, b].filter((c) => r.pasaElFiltroDeLeido(c, "leidos")), [b]);
    assert.deepEqual([a, b].filter((c) => r.pasaElFiltroDeLeido(c, "todos")), [a, b]);
    assert.equal(r.comoFiltroDeLeido("raro"), "todos");
    assert.equal(r.comoFiltroDeLeido("leidos"), "leidos");
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
    assert.match(c, /laBandejaUnificada\(porBuzon\)/);
    assert.match(c, /<InsigniaDeLinea/, "la marca del buzón es la MISMA de Chats");
    assert.match(c, /<GrupoDeOpciones[\s\S]*grupo="leido"/, "el filtro es el grupo de botones de Llamadas");
    assert.match(c, /pasaElFiltroDeLeido\(c, filtro\)/);
    assert.match(c, /key=\{llave\}/, "la fila se identifica por su llave con buzón, no por el id a secas");
    assert.match(leer("app/(root)/crm/llamadas/_components/CallsCrmClient.tsx"), /<GrupoDeOpciones/, "Llamadas usa el mismo grupo");
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
