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

test("el botón de Gmail/Outlook pide leer y enviar, y nada más", () => {
    const g = new URL(r.laDireccionDeAutorizacion("gmail", { clientId: "c", vuelta: "https://a.b/api/correo/oauth/gmail", estado: "s" }));
    const permisos = g.searchParams.get("scope").split(" ");
    assert.ok(permisos.includes("https://www.googleapis.com/auth/gmail.readonly"));
    assert.ok(permisos.includes("https://www.googleapis.com/auth/gmail.send"));
    assert.ok(!permisos.some((p) => /gmail\.modify|mail\.google\.com/.test(p)), "sin permiso de borrar ni mover");
    assert.equal(g.searchParams.get("access_type"), "offline");
    const o = new URL(r.laDireccionDeAutorizacion("outlook", { clientId: "c", vuelta: "v", estado: "s" }));
    assert.ok(o.searchParams.get("scope").includes("offline_access"));
    assert.ok(!o.searchParams.get("scope").includes("ReadWrite"));
    assert.equal(r.hayLlavesDe("gmail", {}), false, "sin llaves el botón no se ofrece como si funcionara");
    assert.equal(r.hayLlavesDe("gmail", { GOOGLE_OAUTH_CLIENT_ID: "a", GOOGLE_OAUTH_CLIENT_SECRET: "b" }), true);
    assert.equal(r.comoProveedor("whatsapp"), null);
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
