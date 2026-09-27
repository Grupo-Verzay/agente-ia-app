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
 * 3. **Que los tres proveedores se comportan igual**: bandeja, leer, adjunto y
 *    responder, con las cabeceras de hilo, y que leer no marca nada como leído.
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
    if (u === `${GM}/profile`) return json({ emailAddress: "carla@gmail.com" });
    if (u.startsWith(`${GM}/messages?`)) return json({ messages: [{ id: "g1" }, { id: "g2" }], nextPageToken: "pagina-2" });
    if (u.startsWith(`${GM}/messages/g1?format=metadata`) || u.startsWith(`${GM}/messages/g2?format=metadata`)) {
        const id = u.includes("/g1?") ? "g1" : "g2";
        return json({
            id,
            snippet: "Hola, te escribo por…",
            labelIds: id === "g1" ? ["INBOX", "UNREAD"] : ["INBOX"],
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
    if (u.startsWith(`${GM}/messages/g1/attachments/`)) return json({ data: b64u("PDF-BYTES") });
    if (u === `${GM}/messages/send`) return json({ id: "enviado" });
    // Outlook (Graph)
    const GR = "https://graph.microsoft.com/v1.0/me";
    if (u.startsWith(`${GR}?`)) return json({ mail: "carla@empresa.onmicrosoft.com", displayName: "Carla" });
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

    const l = await m.leerCorreoAction(buzonGmail, "g1");
    assert.equal(l.success, true, l.message);
    assert.match(l.correo.html, /<b>Ana<\/b>/);
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
    assert.ok(!g.__llamadas.some((x) => /modify|batchModify|removeLabel/.test(x.url)), "leer no marca como leído");

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

    const l = await m.leerCorreoAction(buzonOutlook, "o1");
    assert.equal(l.success, true, l.message);
    assert.deepEqual(l.correo.adjuntos.map((a) => a.nombre), ["pedido.xlsx"]);

    const res = await m.adjuntoGET(new Request(`https://app.banco.test/api/correo/adjunto?buzon=${buzonOutlook}&correo=o1&adjunto=adj-o1`));
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "XLSX");

    g.__llamadas.length = 0;
    const r = await m.responderCorreoAction(buzonOutlook, "o1", "Recibido <script>x</script>\nSaludos");
    assert.equal(r.success, true, r.message);
    const envio = g.__llamadas.find((x) => x.url.endsWith("/messages/o1/reply"));
    const comment = JSON.parse(envio.cuerpo).comment;
    assert.equal(comment, "Recibido &lt;script&gt;x&lt;/script&gt;<br>Saludos", "lo escrito se escapa: es texto, no HTML");
    assert.ok(!g.__llamadas.some((x) => x.metodo === "PATCH"), "leer no marca como leído");
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

    const l = await m.leerCorreoAction(id, "7");
    assert.equal(l.success, true, l.message);
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
    assert.ok(g.__imap.aperturas.length > 0 && g.__imap.aperturas.every((a) => a.readOnly), "la bandeja se abre SIEMPRE en solo lectura");
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
    assert.ok(destino.searchParams.get("scope").includes("gmail.readonly") && destino.searchParams.get("scope").includes("gmail.send"));
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

test("NADA de Chats se tocó: ni fichas de lead, ni mensajes, ni conversaciones", async () => {
    const despues = await contarChats();
    assert.deepEqual(despues, ANTES, `antes ${JSON.stringify(ANTES)} y después ${JSON.stringify(despues)}`);
});
