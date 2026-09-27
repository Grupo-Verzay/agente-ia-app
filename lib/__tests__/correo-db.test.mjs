/**
 * Correo contra POSTGRES, con las acciones y las rutas DE VERDAD.
 *
 * Lo que solo se puede contestar aquí:
 *
 * 1. **Que el correo es de quien lo conectó y de nadie más.** Otra persona —el
 *    súper administrador incluido— con el id del buzón no lo lista, no lo lee,
 *    no descarga sus adjuntos, no responde desde él y no lo desconecta. Y dentro
 *    de una cuenta ajena con «Ingresar» se sigue viendo el PROPIO.
 * 2. **Que no toca nada de Chats.** Se cuentan las filas de `Session`,
 *    `chat_messages` y `chat_conversations` antes y después de conectar, leer y
 *    responder por los tres proveedores: tienen que ser las mismas.
 * 3. **Que los tres proveedores se comportan igual**: bandeja, abrir (que
 *    MARCA como leído), eliminar (a la PAPELERA), adjunto y responder, con las
 *    cabeceras de hilo; y que bajar un adjunto o responder no marcan nada.
 * 5. **Un buzón conectado con los permisos viejos** (solo leer) sigue abriendo
 *    correos, y marcar y eliminar le dicen que vuelva a conectar — sin dejar el
 *    buzón en «volver a conectar» ni tumbar la lectura.
 * 4. **El viaje de autorización**: un `state` tocado, una cookie de otro
 *    navegador o una sesión de otra persona no cuelgan ningún buzón.
 *
 * Gmail y Outlook se fingen en el `fetch`; IMAP y SMTP en el socket. Todo lo
 * demás —el cifrado, la tabla, las acciones, las rutas, mailparser y el MIME—
 * es el código de producción.
 *
 * `MODO=roto` afirma el fallo del diseño INGENUO: buscar el buzón por su id a
 * secas, sin la persona en el `WHERE`, le entrega las credenciales de Ana a
 * quien pida su id.
 *
 * Se levanta con `scripts/banco-correo.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const m = await import(join(AQUI, ".compilado", "correo", "entrada.js"));
const { db } = m;
const g = globalThis;

/* ── Quién mira ───────────────────────────────────────────────────────────── */
const ANA = { id: "ana", name: "Ana", role: "user", ownerId: null };
const BRUNO_SUPER = { id: "bruno", name: "Bruno", role: "super_admin", ownerId: null };
// Ana dentro de la cuenta de un cliente con «Ingresar»: la fila efectiva es la del cliente.
const ANA_EN_OTRA_CUENTA = { id: "cliente-x", name: "Cliente X", role: "user", ownerId: null, sessionUserId: "ana", porImpersonacion: true };
const como = (u) => m.ponerAQuienMira(u);

/* ── Gmail y Outlook, fingidos en el fetch ────────────────────────────────── */
const b64u = (s) => Buffer.from(s).toString("base64url");
g.__llamadas = [];
g.fetch = async (url, init = {}) => {
    const u = String(url);
    const cuerpo = init.body ? String(init.body) : "";
    g.__llamadas.push({ url: u, metodo: init.method ?? "GET", cuerpo });
    const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: { "Content-Type": "application/json" } });
    // Tokens
    if (u.startsWith("https://oauth2.googleapis.com/token") || u.includes("login.microsoftonline.com") && u.endsWith("/token")) {
        const p = new URLSearchParams(cuerpo);
        if (p.get("grant_type") === "authorization_code") return json({ access_token: "acc-nuevo", refresh_token: "ref-nuevo", expires_in: 3600 });
        if (p.get("refresh_token") === "revocado") return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
        return json({ access_token: "acc-renovado", expires_in: 3600 });
    }
    // Gmail
    const GM = "https://gmail.googleapis.com/gmail/v1/users/me";
    if (u === `${GM}/profile` && g.__gmailApagada) {
        // La forma EXACTA de Google cuando la API está apagada en el proyecto.
        return json({ error: { code: 403, status: "PERMISSION_DENIED", message: "Gmail API has not been used in project 821244703851 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=821244703851 then retry.", details: [{ reason: "SERVICE_DISABLED" }] } }, 403);
    }
    if (u === `${GM}/profile`) return json({ emailAddress: "carla@gmail.com" });
    if (u.startsWith(`${GM}/messages?`)) return json({ messages: [{ id: "g1" }, { id: "g2" }], nextPageToken: "pagina-2" });
    if (u.startsWith(`${GM}/messages/g1?format=metadata`) || u.startsWith(`${GM}/messages/g2?format=metadata`)) {
        const id = u.includes("/g1?") ? "g1" : "g2";
        return json({
            id,
            snippet: "Hola, te escribo por…",
            labelIds: id === "g1" ? ["INBOX", "UNREAD"] : ["INBOX", "STARRED"],
            internalDate: "1790000000000",
            payload: { headers: [
                { name: "From", value: "Cliente Uno <uno@cliente.com>" },
                { name: "Subject", value: "Cotizacion" },
                { name: "Content-Type", value: id === "g1" ? "multipart/mixed; boundary=x" : "text/plain" },
            ] },
        });
    }
    if (u.startsWith(`${GM}/messages/g1?format=full`)) {
        return json({
            id: "g1",
            threadId: "hilo-g1",
            internalDate: "1790000000000",
            payload: {
                mimeType: "multipart/mixed",
                headers: [
                    { name: "From", value: "Cliente Uno <uno@cliente.com>" },
                    { name: "Reply-To", value: "compras@cliente.com" },
                    { name: "To", value: "ana@gmail.com" },
                    { name: "Subject", value: "Re: Cotizacion" },
                    { name: "Message-ID", value: "<orig-g1@cliente.com>" },
                    { name: "References", value: "<primero@cliente.com>" },
                ],
                parts: [
                    { partId: "0", mimeType: "multipart/alternative", parts: [
                        { partId: "0.0", mimeType: "text/plain", body: { data: b64u("Texto plano") } },
                        { partId: "0.1", mimeType: "text/html", body: { data: b64u("<p>Hola <b>Ana</b></p><script>alert(1)</script>") } },
                    ] },
                    // El attachmentId cambia en cada lectura: el id estable es el partId.
                    { partId: "1", mimeType: "application/pdf", filename: "precios.pdf", body: { size: 8, attachmentId: `att-${Math.random()}` } },
                ],
            },
        });
    }
    // Marcar y eliminar: con un token de los permisos VIEJOS, la forma exacta de Google.
    if ((/\/modify$/.test(u) || /\/trash$/.test(u)) && g.__sinPermiso) {
        return json({ error: { code: 403, status: "PERMISSION_DENIED", message: "Request had insufficient authentication scopes.", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }, 403);
    }
    if (u === `${GM}/messages/g1/modify` || u === `${GM}/messages/g2/modify`) return json({ id: "g1", labelIds: ["INBOX"] });
    if (u === `${GM}/messages/g1/trash` || u === `${GM}/messages/g2/trash`) return json({ id: "g2", labelIds: ["TRASH"] });
    if (u.startsWith(`${GM}/messages/g1/attachments/`)) return json({ data: b64u("PDF-BYTES") });
    if (u === `${GM}/messages/send`) return json({ id: "enviado" });
    // El total de la bandeja de entrada (el número del selector de bandejas).
    if (u === `${GM}/labels/INBOX`) return json({ id: "INBOX", messagesTotal: 1234, messagesUnread: 12 });
    // Outlook (Graph)
    const GR = "https://graph.microsoft.com/v1.0/me";
    if (u.startsWith(`${GR}?`)) return json({ mail: "carla@empresa.onmicrosoft.com", displayName: "Carla" });
    if (u.startsWith(`${GR}/mailFolders/inbox?`)) return json({ id: "inbox", totalItemCount: 87 });
    if (u.startsWith(`${GR}/mailFolders/inbox/messages?`)) {
        return json({
            value: [{ id: "o1", subject: "Pedido", from: { emailAddress: { name: "Proveedor", address: "p@prov.com" } }, receivedDateTime: "2026-09-20T10:00:00Z", bodyPreview: "Adjunto el pedido", isRead: false, hasAttachments: true }],
            "@odata.nextLink": "https://graph.microsoft.com/next",
        });
    }
    if (u.startsWith(`${GR}/messages/o1?`)) {
        return json({ id: "o1", subject: "Pedido", from: { emailAddress: { name: "Proveedor", address: "p@prov.com" } }, toRecipients: [{ emailAddress: { address: "ana@empresa.com" } }], body: { contentType: "html", content: "<p>Pedido</p>" }, internetMessageId: "<o1@prov.com>", conversationId: "conv-o1", hasAttachments: true, receivedDateTime: "2026-09-20T10:00:00Z" });
    }
    if (u.startsWith(`${GR}/messages/o1/attachments?`)) return json({ value: [{ id: "adj-o1", name: "pedido.xlsx", contentType: "application/vnd.ms-excel", size: 10 }] });
    if (u === `${GR}/messages/o1/attachments/adj-o1`) return json({ name: "pedido.xlsx", contentType: "application/vnd.ms-excel", contentBytes: Buffer.from("XLSX").toString("base64") });
    if (u === `${GR}/messages/o1/reply`) return new Response(null, { status: 202 });
    if (u === `${GR}/messages/o1/forward`) return new Response(null, { status: 202 });
    if (u === `${GR}/messages/o1` && init.method === "PATCH") {
        if (g.__sinPermiso) return json({ error: { code: "ErrorAccessDenied", message: "Access is denied. Check credentials and try again." } }, 403);
        return json({ id: "o1", isRead: true });
    }
    if (u === `${GR}/messages/o1/move` && g.__sinPermiso) return json({ error: { code: "ErrorAccessDenied", message: "Access is denied. Check credentials and try again." } }, 403);
    if (u === `${GR}/messages/o1/move`) return json({ id: "o1-en-eliminados" }, 201);
    return json({ error: { message: `ruta no fingida: ${u}` } }, 404);
};

/* ── IMAP y SMTP, fingidos en el socket ───────────────────────────────────── */
const FUENTE = [
    "From: Dominio Cliente <cli@dominio.com>",
    "Reply-To: soporte@dominio.com",
    "To: ana@miempresa.com",
    "Subject: Factura",
    "Message-ID: <imap-1@dominio.com>",
    "Date: Sat, 20 Sep 2026 10:00:00 +0000",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="X"',
    "",
    "--X",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Adjunto la factura",
    "--X",
    'Content-Type: application/pdf; name="factura.pdf"',
    'Content-Disposition: attachment; filename="factura.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("FACTURA").toString("base64"),
    "--X--",
    "",
].join("\r\n");
g.__imap = {
    aperturas: [],
    contrasena: "buena",
    mensajes: [{ uid: 7, leido: false, conAdjunto: true, envelope: { subject: "Factura", date: new Date("2026-09-20T10:00:00Z"), from: [{ name: "Dominio Cliente", address: "cli@dominio.com" }] }, fuente: FUENTE }],
};

/* ── Lo que Chats tiene y no puede cambiar ────────────────────────────────── */
async function contarChats() {
    const cuenta = async (tabla) => {
        const [r] = await db.$queryRawUnsafe(`SELECT to_regclass('"${tabla}"') IS NOT NULL AS existe`);
        if (!r.existe) return "sin tabla";
        const [c] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tabla}"`);
        return c.n;
    };
    return { session: await cuenta("Session"), mensajes: await cuenta("chat_messages"), conversaciones: await cuenta("chat_conversations") };
}

const ANTES = await contarChats();
await db.$executeRawUnsafe(`DELETE FROM "correo_cuentas"`).catch(() => {});

let buzonGmail;
let buzonOutlook;

test("se conecta un Gmail y las credenciales NO quedan en claro", async () => {
    buzonGmail = await m.guardarElBuzon({
        personaId: "ana", cuentaId: "ana", proveedor: "gmail", direccion: "Ana@Gmail.com", nombre: null,
        credenciales: { tipo: "oauth", accessToken: "acc-vigente", refreshToken: "ref-SECRETO-ana", expiraEn: Date.now() + 3_600_000 },
    });
    const [fila] = await db.$queryRaw`SELECT "credenciales", "direccion" FROM "correo_cuentas" WHERE "id" = ${buzonGmail}`;
    assert.equal(fila.direccion, "ana@gmail.com", "la dirección se guarda en minúsculas");
    assert.ok(!fila.credenciales.includes("ref-SECRETO-ana"), "el refresh_token no puede verse en la base");
    assert.ok(fila.credenciales.startsWith("v1."), "va sellado con AES-GCM");
    // Volver a conectar el MISMO correo actualiza, no duplica.
    const otraVez = await m.guardarElBuzon({
        personaId: "ana", cuentaId: "ana", proveedor: "gmail", direccion: "ana@gmail.com", nombre: null,
        credenciales: { tipo: "oauth", accessToken: "acc-vigente", refreshToken: "ref-SECRETO-ana", expiraEn: Date.now() + 3_600_000 },
    });
    assert.equal(otraVez, buzonGmail);
});

test("Ana ve su correo; otra persona, aunque sea súper administrador, NO", { skip: ROTO }, async () => {
    como(ANA);
    const suyos = await m.misBuzonesAction();
    assert.equal(suyos.success, true);
    assert.deepEqual(suyos.buzones.map((b) => b.id), [buzonGmail]);
    assert.ok(!JSON.stringify(suyos).includes("ref-SECRETO"), "al navegador no bajan credenciales");

    como(BRUNO_SUPER);
    const deBruno = await m.misBuzonesAction();
    assert.deepEqual(deBruno.buzones, [], "Bruno no lista el correo de Ana");
    for (const r of [
        await m.bandejaAction(buzonGmail, null),
        await m.leerCorreoAction(buzonGmail, "g1"),
        await m.responderCorreoAction(buzonGmail, "g1", "me cuelo"),
        await m.desconectarCorreoAction(buzonGmail),
    ]) {
        assert.equal(r.success, false);
        assert.match(r.message, /no está conectado/, "contesta igual que con un id inventado");
    }
    const res = await m.adjuntoGET(new Request(`https://app.banco.test/api/correo/adjunto?buzon=${buzonGmail}&correo=g1&adjunto=1`));
    assert.equal(res.status, 404, "el adjunto de otra persona no se descarga");
    assert.ok(await m.elBuzonDe("ana", buzonGmail), "y el buzón de Ana sigue ahí");
    assert.ok(!g.__llamadas.some((l) => l.url.includes("/messages/send")), "no se mandó nada desde el buzón de Ana");
});

test("dentro de otra cuenta con «Ingresar» se sigue viendo el correo PROPIO", { skip: ROTO }, async () => {
    como(ANA_EN_OTRA_CUENTA);
    const r = await m.misBuzonesAction();
    assert.deepEqual(r.buzones.map((b) => b.id), [buzonGmail], "es de la persona, no de la fila efectiva");
});

test("MODO=roto: el buzón buscado por su id A SECAS entrega las credenciales de Ana a cualquiera", { skip: !ROTO }, async () => {
    // El diseño ingenuo, escrito literal: sin la persona en el WHERE.
    const [fila] = await db.$queryRaw`SELECT "personaId", "credenciales" FROM "correo_cuentas" WHERE "id" = ${buzonGmail}`;
    assert.equal(fila.personaId, "ana");
    assert.ok(fila.credenciales, "Bruno, pidiendo el id, se lleva el buzón de Ana");
    // Y la forma buena no se lo da.
    assert.equal(await m.elBuzonDe("bruno", buzonGmail), null);
});

test("Gmail: bandeja, leer, adjunto y responder, sin marcar nada como leído", { skip: ROTO }, async () => {
    como(ANA);
    const b = await m.bandejaAction(buzonGmail, null);
    assert.equal(b.success, true, b.message);
    assert.equal(b.correos.length, 2);
    assert.equal(b.siguiente, "pagina-2");
    const [g1, g2] = b.correos;
    assert.equal(g1.de, "Cliente Uno");
    assert.equal(g1.sinLeer, true);
    assert.equal(g1.conAdjuntos, true);
    assert.equal(g2.sinLeer, false);

    g.__llamadas.length = 0;
    const l = await m.leerCorreoAction(buzonGmail, "g1", true);
    assert.equal(l.success, true, l.message);
    assert.equal(l.leido, true);
    assert.match(l.correo.html, /<b>Ana<\/b>/);
    const marca = g.__llamadas.find((x) => x.url.endsWith("/messages/g1/modify"));
    assert.ok(marca, "abrir un correo sin leer lo MARCA como leído en Gmail");
    assert.deepEqual(JSON.parse(marca.cuerpo), { removeLabelIds: ["UNREAD"] });
    g.__llamadas.length = 0;
    const yaLeido = await m.leerCorreoAction(buzonGmail, "g1", false);
    assert.equal(yaLeido.success, true);
    assert.ok(!g.__llamadas.some((x) => /modify/.test(x.url)), "uno ya leído no se vuelve a marcar");
    g.__llamadas.length = 0;
    assert.deepEqual(l.correo.adjuntos.map((a) => [a.id, a.nombre]), [["1", "precios.pdf"]], "el id es el partId, estable");

    const res = await m.adjuntoGET(new Request(`https://app.banco.test/api/correo/adjunto?buzon=${buzonGmail}&correo=g1&adjunto=1`));
    assert.equal(res.status, 200);
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "PDF-BYTES");
    assert.match(res.headers.get("content-disposition"), /^attachment;/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");

    g.__llamadas.length = 0;
    const r = await m.responderCorreoAction(buzonGmail, "g1", "Gracias, va en camino");
    assert.equal(r.success, true, r.message);
    const envio = g.__llamadas.find((x) => x.url.endsWith("/messages/send"));
    assert.ok(envio, "se mandó por Gmail");
    const cuerpo = JSON.parse(envio.cuerpo);
    assert.equal(cuerpo.threadId, "hilo-g1", "queda en el mismo hilo");
    const mime = Buffer.from(cuerpo.raw, "base64url").toString();
    assert.match(mime, /^To: compras@cliente\.com/m, "va al Reply-To, que lo decide el servidor");
    assert.match(mime, /^Subject: Re: Cotizacion$/m, "un solo «Re:»");
    assert.match(mime, /^In-Reply-To: <orig-g1@cliente\.com>/m);
    assert.match(mime, /^References: <primero@cliente\.com> <orig-g1@cliente\.com>/m);
    assert.ok(!g.__llamadas.some((x) => /modify|batchModify|trash/.test(x.url)), "bajar un adjunto o responder no marcan nada");

    g.__llamadas.length = 0;
    const e = await m.eliminarCorreoAction(buzonGmail, "g2");
    assert.equal(e.success, true, e.message);
    assert.equal(e.aLaPapelera, true);
    const papelera = g.__llamadas.find((x) => x.url.endsWith("/messages/g2/trash"));
    assert.ok(papelera && papelera.metodo === "POST", "se manda a la PAPELERA de Gmail, no se borra");
    assert.ok(!g.__llamadas.some((x) => x.metodo === "DELETE"), "nunca un borrado definitivo");

    const vacia = await m.responderCorreoAction(buzonGmail, "g1", "   ");
    assert.equal(vacia.success, false, "una respuesta en blanco no sale");
});

test("un token caducado se renueva y se guarda; uno revocado deja el buzón en «volver a conectar»", { skip: ROTO }, async () => {
    como(ANA);
    const id = await m.guardarElBuzon({
        personaId: "ana", cuentaId: "ana", proveedor: "gmail", direccion: "ana2@gmail.com", nombre: null,
        credenciales: { tipo: "oauth", accessToken: "viejo", refreshToken: "ref-ok", expiraEn: 0 },
    });
    const b = await m.bandejaAction(id, null);
    assert.equal(b.success, true, b.message);
    const buzon = await m.elBuzonDe("ana", id);
    assert.equal(buzon.credenciales.accessToken, "acc-renovado", "el token nuevo quedó guardado");
    assert.equal(buzon.credenciales.refreshToken, "ref-ok", "Google no manda refresh nuevo: se conserva el de antes");

    const revocado = await m.guardarElBuzon({
        personaId: "ana", cuentaId: "ana", proveedor: "gmail", direccion: "ana3@gmail.com", nombre: null,
        credenciales: { tipo: "oauth", accessToken: "viejo", refreshToken: "revocado", expiraEn: 0 },
    });
    const r = await m.bandejaAction(revocado, null);
    assert.equal(r.success, false);
    assert.equal(r.reconectar, true);
    const [fila] = await db.$queryRaw`SELECT "estado", "ultimoError" FROM "correo_cuentas" WHERE "id" = ${revocado}`;
    assert.equal(fila.estado, "reconectar", "se dice, no se falla en silencio en cada vuelta");
    assert.ok(fila.ultimoError);
    await m.desconectarCorreoAction(id);
    await m.desconectarCorreoAction(revocado);
});

test("Outlook: bandeja, leer, adjunto y responder por la misma interfaz", { skip: ROTO }, async () => {
    buzonOutlook = await m.guardarElBuzon({
        personaId: "ana", cuentaId: "ana", proveedor: "outlook", direccion: "ana@empresa.com", nombre: "Ana",
        credenciales: { tipo: "oauth", accessToken: "acc-o", refreshToken: "ref-o", expiraEn: Date.now() + 3_600_000 },
    });
    como(ANA);
    const b = await m.bandejaAction(buzonOutlook, null);
    assert.equal(b.success, true, b.message);
    assert.deepEqual(b.correos.map((c) => [c.id, c.sinLeer, c.conAdjuntos]), [["o1", true, true]]);
    assert.equal(b.siguiente, "1", "la página siguiente salta lo ya traído");

    g.__llamadas.length = 0;
    const l = await m.leerCorreoAction(buzonOutlook, "o1", true);
    assert.equal(l.success, true, l.message);
    assert.equal(l.leido, true);
    assert.deepEqual(l.correo.adjuntos.map((a) => a.nombre), ["pedido.xlsx"]);
    const marca = g.__llamadas.find((x) => x.metodo === "PATCH");
    assert.ok(marca && marca.url.endsWith("/messages/o1"), "abrir lo MARCA como leído en Outlook");
    assert.deepEqual(JSON.parse(marca.cuerpo), { isRead: true });

    const res = await m.adjuntoGET(new Request(`https://app.banco.test/api/correo/adjunto?buzon=${buzonOutlook}&correo=o1&adjunto=adj-o1`));
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "XLSX");

    g.__llamadas.length = 0;
    const r = await m.responderCorreoAction(buzonOutlook, "o1", "Recibido <script>x</script>\nSaludos");
    assert.equal(r.success, true, r.message);
    const envio = g.__llamadas.find((x) => x.url.endsWith("/messages/o1/reply"));
    const comment = JSON.parse(envio.cuerpo).comment;
    assert.equal(comment, "Recibido &lt;script&gt;x&lt;/script&gt;<br>Saludos", "lo escrito se escapa: es texto, no HTML");
    assert.ok(!g.__llamadas.some((x) => x.metodo === "PATCH"), "responder no marca nada");

    g.__llamadas.length = 0;
    const e = await m.eliminarCorreoAction(buzonOutlook, "o1");
    assert.equal(e.success, true, e.message);
    assert.equal(e.aLaPapelera, true);
    const mover = g.__llamadas.find((x) => x.url.endsWith("/messages/o1/move"));
    assert.deepEqual(JSON.parse(mover.cuerpo), { destinationId: "deleteditems" }, "a «Elementos eliminados», no un DELETE");
    assert.ok(!g.__llamadas.some((x) => x.metodo === "DELETE"));
});

const CARMEN = { id: "carmen", name: "Carmen", role: "user", ownerId: null };

test("la bandeja UNIFICADA: todos los buzones de la persona en una llamada, cada correo con su buzón", { skip: ROTO }, async () => {
    const oauth = (acc, ref, dentroDe = 3_600_000) => ({ tipo: "oauth", accessToken: acc, refreshToken: ref, expiraEn: Date.now() + dentroDe });
    const cGmail = await m.guardarElBuzon({ personaId: "carmen", cuentaId: "carmen", proveedor: "gmail", direccion: "carmen@gmail.com", nombre: null, credenciales: oauth("acc-c", "ref-c") });
    const cOutlook = await m.guardarElBuzon({ personaId: "carmen", cuentaId: "carmen", proveedor: "outlook", direccion: "carmen@empresa.com", nombre: null, credenciales: oauth("acc-co", "ref-co") });
    const deBruno = await m.guardarElBuzon({ personaId: "bruno", cuentaId: "bruno", proveedor: "outlook", direccion: "bruno@empresa.com", nombre: null, credenciales: oauth("acc-b", "ref-b") });

    como(CARMEN);
    const r = await m.bandejaUnificadaAction();
    assert.equal(r.success, true, r.message);
    assert.deepEqual(r.porBuzon.map((b) => b.buzonId).sort(), [cGmail, cOutlook].sort(), "sus dos buzones, y ninguno de otra persona");
    const deGmail = r.porBuzon.find((b) => b.buzonId === cGmail);
    const deOutlook = r.porBuzon.find((b) => b.buzonId === cOutlook);
    assert.equal(deGmail.ok, true);
    assert.deepEqual(deGmail.correos.map((c) => [c.id, c.buzonId]), [["g1", cGmail], ["g2", cGmail]], "cada correo lleva su buzón");
    assert.equal(deGmail.siguiente, "pagina-2");
    assert.deepEqual(deOutlook.correos.map((c) => [c.id, c.buzonId]), [["o1", cOutlook]]);

    // Cargar más: solo los buzones nombrados, y uno AJENO se ignora aunque se pida.
    g.__llamadas.length = 0;
    const mas = await m.bandejaUnificadaAction({ [cGmail]: "pagina-2", [deBruno]: "1" });
    assert.equal(mas.success, true);
    assert.deepEqual(mas.porBuzon.map((b) => b.buzonId), [cGmail], "el buzón de Bruno no se lee desde la sesión de Carmen");
    assert.ok(g.__llamadas.some((l) => l.url.includes("pageToken=pagina-2")), "se pide la página siguiente de ESE buzón");
    assert.ok(!g.__llamadas.some((l) => l.url.includes("graph.microsoft.com")), "ni se toca el de Outlook, que no se pidió");

    // Un buzón que pide volver a conectar no vacía la bandeja de los demás.
    const cRevocado = await m.guardarElBuzon({ personaId: "carmen", cuentaId: "carmen", proveedor: "gmail", direccion: "carmen.vieja@gmail.com", nombre: null, credenciales: oauth("acc-x", "revocado", -60_000) });
    const conFallo = await m.bandejaUnificadaAction();
    assert.equal(conFallo.success, true);
    const roto = conFallo.porBuzon.find((b) => b.buzonId === cRevocado);
    assert.equal(roto.ok, false);
    assert.equal(roto.reconectar, true, "dice que hay que volver a conectarlo");
    assert.equal(conFallo.porBuzon.filter((b) => b.ok).length, 2, "los otros dos llegan enteros");

    // Y quien mira otra cosa no ve nada de Carmen.
    como(BRUNO_SUPER);
    const bruno = await m.bandejaUnificadaAction({ [cGmail]: "pagina-2" });
    assert.deepEqual(bruno.porBuzon, [], "el súper administrador no lee el correo de Carmen ni pidiéndolo por su id");
    const suyo = await m.bandejaUnificadaAction();
    assert.deepEqual(suyo.porBuzon.map((b) => b.buzonId), [deBruno]);

    for (const [persona, id] of [[CARMEN, cGmail], [CARMEN, cOutlook], [CARMEN, cRevocado], [BRUNO_SUPER, deBruno]]) {
        como(persona);
        await m.desconectarCorreoAction(id);
    }
});

test("dominio propio: una contraseña mala no guarda nada; la buena se prueba y se conecta", { skip: ROTO }, async () => {
    como(ANA);
    g.__imap.contrasena = "buena";
    const mala = await m.conectarImapAction({ direccion: "ana@miempresa.com", contrasena: "mala", imapHost: "mail.miempresa.com" });
    assert.equal(mala.success, false);
    assert.match(mala.message, /entrada/);
    const [{ n }] = await db.$queryRaw`SELECT count(*)::int AS n FROM "correo_cuentas" WHERE "proveedor" = 'imap'`;
    assert.equal(n, 0, "un buzón que no conecta no se guarda");

    const invalido = await m.conectarImapAction({ direccion: "no-es-correo", contrasena: "x", imapHost: "mail.miempresa.com" });
    assert.equal(invalido.success, false);

    const r = await m.conectarImapAction({ direccion: "ana@miempresa.com", contrasena: "buena", imapHost: "mail.miempresa.com" });
    assert.equal(r.success, true, r.message);
    const id = r.buzon.id;
    const buzon = await m.elBuzonDe("ana", id);
    assert.equal(buzon.credenciales.smtpHost, "mail.miempresa.com", "sin SMTP se usa el mismo host");
    assert.equal(buzon.credenciales.smtpPuerto, 465);

    const b = await m.bandejaAction(id, null);
    assert.equal(b.success, true, b.message);
    assert.deepEqual(b.correos.map((c) => [c.id, c.sinLeer, c.conAdjuntos]), [["7", true, true]]);

    g.__imap.aperturas.length = 0;
    const l = await m.leerCorreoAction(id, "7", true);
    assert.equal(l.success, true, l.message);
    assert.equal(l.leido, true);
    assert.deepEqual(g.__imap.marcas.map((x) => [x.uid, x.flags]), [["7", ["\\Seen"]]], "abrir pone \\Seen en el servidor");
    assert.equal(g.__imap.mensajes[0].leido, true);
    assert.deepEqual(g.__imap.aperturas.map((a) => a.readOnly), [true, false], "traer en solo lectura; marcar con escritura");
    assert.deepEqual(l.correo.adjuntos.map((a) => [a.id, a.nombre]), [["0", "factura.pdf"]]);
    const res = await m.adjuntoGET(new Request(`https://app.banco.test/api/correo/adjunto?buzon=${id}&correo=7&adjunto=0`));
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "FACTURA");

    g.__smtpEnviados = [];
    const resp = await m.responderCorreoAction(id, "7", "Pagada");
    assert.equal(resp.success, true, resp.message);
    const { mensaje } = g.__smtpEnviados[0];
    assert.equal(mensaje.to, "soporte@dominio.com");
    assert.equal(mensaje.subject, "Re: Factura");
    assert.equal(mensaje.inReplyTo, "<imap-1@dominio.com>");
    assert.equal(mensaje.references, "<imap-1@dominio.com>");
    g.__imap.aperturas.length = 0;
    await m.bandejaAction(id, null);
    assert.ok(g.__imap.aperturas.every((a) => a.readOnly), "la bandeja se abre SIEMPRE en solo lectura");

    const e = await m.eliminarCorreoAction(id, "7");
    assert.equal(e.success, true, e.message);
    assert.equal(e.aLaPapelera, true);
    assert.deepEqual(g.__imap.movidos, [{ uid: "7", destino: "Papelera" }], "va a la carpeta \\Trash del servidor");
    assert.equal((g.__imap.borrados ?? []).length, 0, "nunca un borrado definitivo si hay papelera");
    const tras = await m.bandejaAction(id, null);
    assert.deepEqual(tras.correos, [], "y sale de la bandeja");

    // Un servidor SIN papelera: se borra, y la acción lo DICE.
    g.__imap.mensajes.push({ uid: 8, leido: false, conAdjunto: false, envelope: { subject: "Otro", from: [] }, fuente: FUENTE });
    g.__imap.carpetas = [{ path: "INBOX", specialUse: "\\Inbox" }];
    const sin = await m.eliminarCorreoAction(id, "8");
    g.__imap.carpetas = undefined;
    assert.equal(sin.success, true, sin.message);
    assert.equal(sin.aLaPapelera, false);
    assert.deepEqual(g.__imap.borrados, ["8"]);
    const falta = await m.eliminarCorreoAction(id, "999");
    assert.equal(falta.success, false, "uno que ya no está no se da por eliminado");
});

test("el viaje de autorización: solo cuelga el buzón de quien lo empezó, en su navegador", { skip: ROTO }, async () => {
    const CARLA = { id: "carla", name: "Carla", role: "user", ownerId: null };
    como(CARLA);
    const ida = await m.conectarGET(new Request("https://app.banco.test/api/correo/conectar/gmail"), { params: { proveedor: "gmail" } });
    assert.equal(ida.status, 307);
    const destino = new URL(ida.headers.get("location"));
    assert.equal(destino.host, "accounts.google.com");
    assert.equal(destino.searchParams.get("redirect_uri"), "https://app.banco.test/api/correo/oauth/gmail");
    assert.equal(destino.searchParams.get("access_type"), "offline");
    assert.ok(destino.searchParams.get("scope").includes("gmail.modify") && destino.searchParams.get("scope").includes("gmail.send"));
    const estado = destino.searchParams.get("state");
    const nonce = /correo_oauth_nonce=([^;]+)/.exec(ida.headers.get("set-cookie"))[1];

    const volver = (q) => m.vueltaGET(new Request(`https://app.banco.test/api/correo/oauth/gmail?${q}`), { params: { proveedor: "gmail" } });
    const cuantos = async () => (await db.$queryRaw`SELECT count(*)::int AS n FROM "correo_cuentas" WHERE "personaId" = 'carla'`)[0].n;

    // Otro navegador (sin la cookie): rechazado.
    g.__cookiesDelBanco = {};
    let r = await volver(`code=c1&state=${encodeURIComponent(estado)}`);
    assert.match(decodeURIComponent(r.headers.get("location")), /error=/);
    // Estado tocado: rechazado.
    g.__cookiesDelBanco = { correo_oauth_nonce: nonce };
    r = await volver(`code=c1&state=${encodeURIComponent(estado.slice(0, -2) + "xx")}`);
    assert.match(decodeURIComponent(r.headers.get("location")), /error=/);
    // Misma cookie, pero la sesión es de OTRA persona: rechazado.
    como(ANA);
    r = await volver(`code=c1&state=${encodeURIComponent(estado)}`);
    assert.match(decodeURIComponent(r.headers.get("location")), /otra sesión/);
    assert.equal(await cuantos(), 0, "ninguno de los tres colgó un buzón");

    // El bueno.
    como(CARLA);
    r = await volver(`code=c1&state=${encodeURIComponent(estado)}`);
    assert.match(decodeURIComponent(r.headers.get("location")), /conectado=carla@gmail\.com/);
    assert.equal(await cuantos(), 1);
    const [fila] = await db.$queryRaw`SELECT "proveedor", "direccion" FROM "correo_cuentas" WHERE "personaId" = 'carla'`;
    assert.deepEqual([fila.proveedor, fila.direccion], ["gmail", "carla@gmail.com"]);
});

test("la vuelta con la API de Gmail apagada: no cuelga nada y dice qué hacer, en español", { skip: ROTO }, async () => {
    const DANI = { id: "dani", name: "Dani", role: "user", ownerId: null };
    como(DANI);
    const ida = await m.conectarGET(new Request("https://app.banco.test/api/correo/conectar/gmail"), { params: { proveedor: "gmail" } });
    const estado = new URL(ida.headers.get("location")).searchParams.get("state");
    g.__cookiesDelBanco = { correo_oauth_nonce: /correo_oauth_nonce=([^;]+)/.exec(ida.headers.get("set-cookie"))[1] };
    g.__gmailApagada = true;
    try {
        const r = await m.vueltaGET(
            new Request(`https://app.banco.test/api/correo/oauth/gmail?code=c1&state=${encodeURIComponent(estado)}`),
            { params: { proveedor: "gmail" } },
        );
        const destino = new URL(r.headers.get("location"));
        assert.equal(destino.pathname, "/correo");
        const motivo = destino.searchParams.get("error");
        assert.ok(motivo, "vuelve CON su error, no a la pantalla limpia");
        assert.doesNotMatch(motivo, /has not been used/);
        assert.match(motivo, /API de Gmail/);
        const [{ n }] = await db.$queryRaw`SELECT count(*)::int AS n FROM "correo_cuentas" WHERE "personaId" = 'dani'`;
        assert.equal(n, 0, "sin dirección no se cuelga ningún buzón");
    } finally {
        g.__gmailApagada = false;
    }
});

test("la papelera de un servidor IMAP: la marcada \\Trash, y si no, la que se llame así", () => {
    assert.equal(m.laPapeleraImap([{ path: "INBOX" }, { path: "Basura", specialUse: "\\Trash" }, { path: "Trash" }]), "Basura");
    assert.equal(m.laPapeleraImap([{ path: "INBOX" }, { path: "INBOX.Trash" }]), "INBOX.Trash");
    assert.equal(m.laPapeleraImap([{ path: "Elementos eliminados" }]), "Elementos eliminados");
    assert.equal(m.laPapeleraImap([{ path: "INBOX" }, { path: "Enviados" }]), null);
});

test("el archivo de un servidor IMAP: la marcada \\Archive, y si no, la que se llame así", () => {
    assert.equal(m.elArchivoImap([{ path: "INBOX" }, { path: "Guardados", specialUse: "\\Archive" }, { path: "Archive" }]), "Guardados");
    assert.equal(m.elArchivoImap([{ path: "INBOX.Archivo" }]), "INBOX.Archivo");
    assert.equal(m.elArchivoImap([{ path: "INBOX" }, { path: "Papelera" }]), null);
});

test("otra persona no elimina ni marca un correo del buzón de Ana", { skip: ROTO }, async () => {
    como(BRUNO_SUPER);
    g.__llamadas.length = 0;
    const e = await m.eliminarCorreoAction(buzonGmail, "g1");
    assert.equal(e.success, false);
    assert.match(e.message, /no está conectado/);
    const l = await m.leerCorreoAction(buzonGmail, "g1", true);
    assert.equal(l.success, false);
    assert.ok(!g.__llamadas.some((x) => /modify|trash/.test(x.url)), "no llegó ni una petición al Gmail de Ana");
});

test("un buzón con los permisos VIEJOS: abre igual, y marcar/eliminar piden volver a conectar", { skip: ROTO }, async () => {
    como(ANA);
    g.__sinPermiso = true;
    try {
        for (const [buzon, correo] of [[buzonGmail, "g1"], [buzonOutlook, "o1"]]) {
            const l = await m.leerCorreoAction(buzon, correo, true);
            assert.equal(l.success, true, "el correo se abre igual");
            assert.ok(l.correo, "y se enseña");
            assert.equal(l.leido, false);
            assert.equal(l.reconectar, true);
            assert.match(l.motivoSinMarcar, /Vuelve a conectarlo/);
            const e = await m.eliminarCorreoAction(buzon, correo);
            assert.equal(e.success, false);
            assert.equal(e.reconectar, true);
            assert.doesNotMatch(e.message, /insufficient|Access is denied/, "en español y diciendo qué hacer");
            const [fila] = await db.$queryRaw`SELECT "estado" FROM "correo_cuentas" WHERE "id" = ${buzon}`;
            assert.equal(fila.estado, "conectada", "no se tumba el buzón: sigue leyendo");
        }
    } finally {
        g.__sinPermiso = false;
    }
});

/* ── Lo que se añadió para que Correo sea tan completo como Chats ────────── */

const mimeDe = (llamada) => Buffer.from(JSON.parse(llamada.cuerpo).raw, "base64url").toString();
const unPdf = { nombre: "cotizacion.pdf", tipo: "application/pdf", base64: Buffer.from("MI-PDF").toString("base64") };

test("Gmail: destacado en la bandeja, no leído, destacar, archivar, reenviar y responder con archivos y firma", { skip: ROTO }, async () => {
    como(ANA);
    const b = await m.bandejaAction(buzonGmail, null);
    assert.deepEqual(b.correos.map((c) => [c.id, c.destacado]), [["g1", false], ["g2", true]], "la estrella de Gmail es el destacado");

    g.__llamadas.length = 0;
    assert.equal((await m.marcarNoLeidoAction(buzonGmail, "g1")).success, true);
    assert.equal((await m.destacarCorreoAction(buzonGmail, "g1", true)).success, true);
    assert.equal((await m.destacarCorreoAction(buzonGmail, "g1", false)).success, true);
    const arch = await m.archivarCorreoAction(buzonGmail, "g1");
    assert.equal(arch.success, true, arch.message);
    assert.equal(arch.carpeta, "Todos los mensajes");
    const cambios = g.__llamadas.filter((x) => x.url.endsWith("/messages/g1/modify")).map((x) => JSON.parse(x.cuerpo));
    assert.deepEqual(cambios, [
        { addLabelIds: ["UNREAD"] },
        { addLabelIds: ["STARRED"] },
        { removeLabelIds: ["STARRED"] },
        { removeLabelIds: ["INBOX"] },
    ], "no leído, estrella puesta, estrella quitada y fuera de la bandeja: las etiquetas del propio Gmail");
    assert.ok(!g.__llamadas.some((x) => /trash/.test(x.url) || x.metodo === "DELETE"), "archivar NO borra");
    const raro = await m.destacarCorreoAction(buzonGmail, "g1", "si");
    assert.equal(raro.success, false, "lo que no es un booleano no se adivina");

    // Reenviar: el destinatario se valida, el original se relee con SUS archivos.
    const malo = await m.reenviarCorreoAction(buzonGmail, "g1", "no-es-correo", "mira", []);
    assert.equal(malo.success, false);
    g.__llamadas.length = 0;
    const fw = await m.reenviarCorreoAction(buzonGmail, "g1", "jefe@verzay.com, Jefe@verzay.com", "Te lo paso", [unPdf]);
    assert.equal(fw.success, true, fw.message);
    assert.deepEqual(fw.para, ["jefe@verzay.com"], "sin repetir");
    const mime = mimeDe(g.__llamadas.find((x) => x.url.endsWith("/messages/send")));
    assert.match(mime, /^To: jefe@verzay\.com/m);
    assert.match(mime, /^Subject: Fwd: Cotizacion$/m, "un solo «Fwd:», sin arrastrar el «Re:»");
    assert.match(mime, /precios\.pdf/, "va el archivo del ORIGINAL");
    assert.match(mime, /cotizacion\.pdf/, "y el que se adjuntó al reenviar");
    assert.match(mime, /Mensaje reenviado/);

    // La firma: se guarda por buzón, se pone solo si está activa, y la pone el servidor.
    const sinTexto = await m.guardarFirmaAction(buzonGmail, "   ", true);
    assert.equal(sinTexto.firmaActiva, false, "sin firma no hay nada que activar");
    const f = await m.guardarFirmaAction(buzonGmail, "Ana Ruiz\nVentas", true);
    assert.deepEqual([f.firma, f.firmaActiva], ["Ana Ruiz\nVentas", true]);
    g.__llamadas.length = 0;
    const r = await m.responderCorreoAction(buzonGmail, "g1", "Va en camino", [unPdf]);
    assert.equal(r.success, true, r.message);
    const respuesta = mimeDe(g.__llamadas.find((x) => x.url.endsWith("/messages/send")));
    assert.match(respuesta, /Va en camino\r?\n\r?\n-- \r?\nAna Ruiz\r?\nVentas/, "la firma va debajo, con su separador");
    assert.match(respuesta, /cotizacion\.pdf/, "y el archivo adjunto a la respuesta");
    await m.guardarFirmaAction(buzonGmail, "Ana Ruiz\nVentas", false);
    g.__llamadas.length = 0;
    await m.responderCorreoAction(buzonGmail, "g1", "Sin firma");
    assert.doesNotMatch(mimeDe(g.__llamadas.find((x) => x.url.endsWith("/messages/send"))), /Ana Ruiz/, "apagada, no se pone");

    const pesado = await m.responderCorreoAction(buzonGmail, "g1", "x", [{ nombre: "a.bin", tipo: "x", base64: "@@@" }]);
    assert.equal(pesado.success, false, "un adjunto que no es base64 no sale");
});

test("Outlook: no leído, destacar (bandera), archivar y reenviar por su propia API", { skip: ROTO }, async () => {
    como(ANA);
    g.__llamadas.length = 0;
    await m.marcarNoLeidoAction(buzonOutlook, "o1");
    await m.destacarCorreoAction(buzonOutlook, "o1", true);
    const arch = await m.archivarCorreoAction(buzonOutlook, "o1");
    assert.equal(arch.carpeta, "Archivo");
    const parches = g.__llamadas.filter((x) => x.metodo === "PATCH").map((x) => JSON.parse(x.cuerpo));
    assert.deepEqual(parches, [{ isRead: false }, { flag: { flagStatus: "flagged" } }]);
    const mover = g.__llamadas.find((x) => x.url.endsWith("/messages/o1/move"));
    assert.deepEqual(JSON.parse(mover.cuerpo), { destinationId: "archive" }, "a «Archivo», no a eliminados");

    g.__llamadas.length = 0;
    const fw = await m.reenviarCorreoAction(buzonOutlook, "o1", "compras@verzay.com", "Revisa esto", [unPdf]);
    assert.equal(fw.success, true, fw.message);
    const cuerpo = JSON.parse(g.__llamadas.find((x) => x.url.endsWith("/messages/o1/forward")).cuerpo);
    assert.deepEqual(cuerpo.toRecipients, [{ emailAddress: { address: "compras@verzay.com" } }]);
    assert.equal(cuerpo.message.attachments[0].name, "cotizacion.pdf");
});

test("IMAP: no leído, destacar (\\Flagged), archivar (crea Archive si falta) y reenviar por SMTP", { skip: ROTO }, async () => {
    como(ANA);
    g.__imap.contrasena = "buena";
    g.__imap.carpetas = [{ path: "INBOX", specialUse: "\\Inbox" }, { path: "Papelera", specialUse: "\\Trash" }];
    g.__imap.mensajes = [
        { uid: 20, leido: true, destacado: true, conAdjunto: true, envelope: { subject: "Factura", from: [{ name: "Cli", address: "cli@dominio.com" }] }, fuente: FUENTE },
        { uid: 21, leido: true, conAdjunto: false, envelope: { subject: "Otro", from: [] }, fuente: FUENTE },
    ];
    const c = await m.conectarImapAction({ direccion: "ana2@miempresa.com", contrasena: "buena", imapHost: "mail.miempresa.com" });
    assert.equal(c.success, true, c.message);
    const id = c.buzon.id;
    const b = await m.bandejaAction(id, null);
    assert.deepEqual(b.correos.map((x) => [x.id, x.destacado]), [["21", false], ["20", true]]);

    g.__imap.quitadas = [];
    g.__imap.marcas = [];
    await m.marcarNoLeidoAction(id, "20");
    await m.destacarCorreoAction(id, "20", false);
    await m.destacarCorreoAction(id, "21", true);
    assert.deepEqual(g.__imap.quitadas.map((x) => [x.uid, x.flags]), [["20", ["\\Seen"]], ["20", ["\\Flagged"]]]);
    assert.deepEqual(g.__imap.marcas.map((x) => [x.uid, x.flags]), [["21", ["\\Flagged"]]]);

    g.__imap.movidos = [];
    g.__imap.creadas = [];
    const arch = await m.archivarCorreoAction(id, "21");
    assert.equal(arch.success, true, arch.message);
    assert.equal(arch.carpeta, "Archive");
    assert.deepEqual(g.__imap.creadas, ["Archive"], "sin carpeta de archivo se crea una; nunca se borra");
    assert.deepEqual(g.__imap.movidos, [{ uid: "21", destino: "Archive" }]);

    g.__smtpEnviados = [];
    const fw = await m.reenviarCorreoAction(id, "20", "otro@verzay.com", "Para ti", []);
    assert.equal(fw.success, true, fw.message);
    const { mensaje } = g.__smtpEnviados[0];
    assert.equal(mensaje.to, "otro@verzay.com");
    assert.equal(mensaje.subject, "Fwd: Factura");
    assert.match(mensaje.text, /^Para ti[\s\S]*Mensaje reenviado[\s\S]*Adjunto la factura/);
    assert.deepEqual(mensaje.attachments.map((a) => a.filename), ["factura.pdf"], "con el archivo del original");
    g.__imap.carpetas = undefined;
    await m.desconectarCorreoAction(id);
});

test("anclar: se guarda con la foto del PROVEEDOR, es de la persona, y archivar lo quita", { skip: ROTO }, async () => {
    como(ANA);
    const a = await m.anclarCorreoAction(buzonGmail, "g1");
    assert.equal(a.success, true, a.message);
    assert.equal(a.anclado.asunto, "Re: Cotizacion", "la foto sale del correo, no del navegador");
    let lista = await m.misBuzonesAction();
    assert.deepEqual(lista.anclados.map((x) => [x.buzonId, x.id]), [[buzonGmail, "g1"]]);

    como(BRUNO_SUPER);
    assert.equal((await m.anclarCorreoAction(buzonGmail, "g2")).success, false);
    assert.equal((await m.desanclarCorreoAction(buzonGmail, "g1")).success, false, "no desancla lo de Ana");
    assert.deepEqual((await m.misBuzonesAction()).anclados, [], "ni ve sus anclados");
    for (const r of [
        await m.marcarNoLeidoAction(buzonGmail, "g1"),
        await m.destacarCorreoAction(buzonGmail, "g1", true),
        await m.archivarCorreoAction(buzonGmail, "g1"),
        await m.reenviarCorreoAction(buzonGmail, "g1", "bruno@x.com", "me lo llevo"),
        await m.guardarFirmaAction(buzonGmail, "Bruno", true),
        await m.sugerirRespuestaDeCorreoAction(buzonGmail, "g1"),
    ]) {
        assert.equal(r.success, false);
        assert.match(r.message, /no está conectado/);
    }

    como(ANA);
    lista = await m.misBuzonesAction();
    assert.equal(lista.anclados.length, 1, "lo de Bruno no tocó nada");
    await m.archivarCorreoAction(buzonGmail, "g1");
    lista = await m.misBuzonesAction();
    assert.deepEqual(lista.anclados, [], "archivado, deja de estar anclado");
    await m.anclarCorreoAction(buzonGmail, "g2");
    assert.equal((await m.desanclarCorreoAction(buzonGmail, "g2")).success, true);
    assert.deepEqual((await m.misBuzonesAction()).anclados, []);
});

test("la sugerencia de la IA relee el correo del proveedor y pregunta con la cuenta de quien trabaja", { skip: ROTO }, async () => {
    como(ANA);
    g.__ia = [];
    const s = await m.sugerirRespuestaDeCorreoAction(buzonGmail, "g1", "Hola,");
    assert.equal(s.success, true, s.message);
    assert.match(s.sugerencia, /Cliente Uno/);
    assert.equal(g.__ia[0].cuentaId, "ana");
    assert.match(g.__ia[0].correo.texto, /Texto plano|Hola/);
    assert.equal(g.__ia[0].borrador, "Hola,");
    g.__sinIa = true;
    const sin = await m.sugerirRespuestaDeCorreoAction(buzonGmail, "g1");
    g.__sinIa = false;
    assert.equal(sin.success, false);
    assert.match(sin.message, /IA/, "sin IA lo dice, no es un botón que no hace nada");
});

test("el total de cada bandeja sale del PROVEEDOR, de los buzones de la persona y de nadie más", { skip: ROTO }, async () => {
    const oauth = (acc, ref, dentroDe = 3_600_000) => ({ tipo: "oauth", accessToken: acc, refreshToken: ref, expiraEn: Date.now() + dentroDe });
    const dGmail = await m.guardarElBuzon({ personaId: "diana", cuentaId: "diana", proveedor: "gmail", direccion: "diana@gmail.com", nombre: null, credenciales: oauth("acc-d", "ref-d") });
    const dOutlook = await m.guardarElBuzon({ personaId: "diana", cuentaId: "diana", proveedor: "outlook", direccion: "diana@empresa.com", nombre: null, credenciales: oauth("acc-do", "ref-do") });
    const dRevocado = await m.guardarElBuzon({ personaId: "diana", cuentaId: "diana", proveedor: "gmail", direccion: "diana.vieja@gmail.com", nombre: null, credenciales: oauth("acc-dx", "revocado", -60_000) });
    const deBruno = await m.guardarElBuzon({ personaId: "bruno", cuentaId: "bruno", proveedor: "gmail", direccion: "bruno2@gmail.com", nombre: null, credenciales: oauth("acc-b2", "ref-b2") });
    const DIANA = { id: "diana", name: "Diana", role: "user", ownerId: null };
    como(DIANA);
    // Y uno de dominio propio: el STATUS de IMAP.
    const imap = await m.conectarImapAction({ direccion: "diana@miempresa.com", contrasena: "buena", imapHost: "mail.miempresa.com" });
    assert.equal(imap.success, true, imap.message);
    g.__llamadas.length = 0;
    g.__imap.estados = [];
    const r = await m.totalesDeLosBuzonesAction();
    assert.equal(r.success, true, r.message);
    const de = Object.fromEntries(r.totales.map((t) => [t.buzonId, t.total]));
    assert.deepEqual(Object.keys(de).sort(), [dGmail, dOutlook, dRevocado, imap.buzon.id].sort(), "sus cuatro buzones, y ninguno de otra persona");
    assert.equal(de[dGmail], 1234, "Gmail: el messagesTotal de INBOX, no el largo de una página");
    assert.equal(de[dOutlook], 87, "Outlook: el totalItemCount de la bandeja de entrada");
    assert.equal(de[imap.buzon.id], g.__imap.mensajes.length, "IMAP: el STATUS del servidor");
    assert.deepEqual(g.__imap.estados.map((e) => e.ruta), ["INBOX"]);
    assert.equal(de[dRevocado], null, "uno que pide volver a conectar va SIN número, no con un cero");
    assert.ok(g.__llamadas.some((l) => l.url.endsWith("/labels/INBOX")));
    assert.ok(g.__llamadas.some((l) => l.url.includes("/mailFolders/inbox?")));
    // Un proveedor que no dice el número: sin número, no cero, y no tumba a los otros.
    const antes = g.fetch;
    g.fetch = async (url, init) => (String(url).endsWith("/labels/INBOX") ? new Response(JSON.stringify({ id: "INBOX" }), { status: 200, headers: { "Content-Type": "application/json" } }) : antes(url, init));
    const sinNumero = await m.totalesDeLosBuzonesAction();
    g.fetch = antes;
    const de2 = Object.fromEntries(sinNumero.totales.map((t) => [t.buzonId, t.total]));
    assert.equal(de2[dGmail], null, "sin messagesTotal no se inventa un 0");
    assert.equal(de2[dOutlook], 87, "y el de Outlook llega igual");
    // Quien no es Diana no ve sus números.
    como(BRUNO_SUPER);
    const bruno = await m.totalesDeLosBuzonesAction();
    assert.ok(!bruno.totales.some((t) => [dGmail, dOutlook, dRevocado, imap.buzon.id].includes(t.buzonId)), "el súper administrador no cuenta el correo de Diana");
    assert.ok(bruno.totales.some((t) => t.buzonId === deBruno));
    for (const [persona, id] of [[DIANA, dGmail], [DIANA, dOutlook], [DIANA, dRevocado], [DIANA, imap.buzon.id], [BRUNO_SUPER, deBruno]]) {
        como(persona);
        await m.desconectarCorreoAction(id);
    }
});

test("NADA de Chats se tocó: ni fichas de lead, ni mensajes, ni conversaciones", async () => {
    const despues = await contarChats();
    assert.deepEqual(despues, ANTES, `antes ${JSON.stringify(ANTES)} y después ${JSON.stringify(despues)}`);
});
