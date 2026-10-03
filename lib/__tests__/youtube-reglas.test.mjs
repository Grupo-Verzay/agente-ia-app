/**
 * YouTube: las REGLAS puras, sin base y sin red.
 *
 * Lo que se decide aquí es lo que no se puede equivocar en silencio:
 *
 * - **Qué JSON sirve.** Un cliente de OAuth «web» o «installed», sí; una cuenta
 *   de SERVICIO —la de Google Sheets, la que más fácil se confunde—, no, y se
 *   dice por qué.
 * - **El sello.** El permiso permanente se guarda cifrado y otra `AUTH_SECRET`
 *   no lo abre (devuelve `null`, nunca lanza). El `state` del viaje va firmado,
 *   con caducidad, con su nonce y con su vía.
 * - **El enlace de Google** pide el permiso PERMANENTE (`offline` + `consent`)
 *   y solo los dos permisos que hacen falta.
 * - **La fecha.** «2026-10-10 18:00» es hora de Colombia (UTC-5 todo el año);
 *   una fecha que no existe, o una que ya pasó o está a menos de 15 minutos, se
 *   rechaza ANTES de subir nada.
 * - **Título, descripción, etiquetas, archivos**: los topes de YouTube.
 * - **Cómo quedó**: un video sin fecha después de subirlo es el bloqueo de un
 *   proyecto sin auditar, y se dice con esas palabras.
 *
 * `MODO=roto` no corre esto: lo que hay que afirmar del «antes» es que nada de
 * esto existía, y eso lo hace `youtube-antes.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const a = ROTO ? null : await import(join(RAIZ, "lib", "youtube-acceso.mjs"));
const s = ROTO ? null : await import(join(RAIZ, "lib", "youtube-subida.mjs"));
const t = ROTO ? test.skip : test;

const ENV = { AUTH_SECRET: "banco-youtube-reglas" };
const OTRO_ENV = { AUTH_SECRET: "otra-llave-distinta" };
// Credenciales de MENTIRA, armadas al correr: literales, el escáner de secretos
// de GitHub las toma por reales y frena el push (el repositorio es público).
const CLIENT_ID = ["1234567890", "abcdef"].join("-") + ".apps." + "googleusercontent" + ".com";
const SECRETO_DEL_BANCO = ["GOCSPX", "secreto", "de", "banco"].join("-");

const web = (extra = {}) => ({
    web: {
        client_id: CLIENT_ID,
        project_id: "verzay-youtube",
        client_secret: SECRETO_DEL_BANCO,
        redirect_uris: ["https://agente.ia-app.com/api/youtube/oauth"],
        ...extra,
    },
});

/* ── Las credenciales ─────────────────────────────────────────────────────── */

t("un cliente «web» se lee con su proyecto y sus vueltas", () => {
    const r = a.leerElCliente(JSON.stringify(web()));
    assert.equal(r.ok, true);
    assert.equal(r.cliente.tipo, "web");
    assert.equal(r.cliente.clientId, CLIENT_ID);
    assert.equal(r.cliente.clientSecret, SECRETO_DEL_BANCO);
    assert.equal(r.cliente.proyecto, "verzay-youtube");
    assert.deepEqual(r.cliente.redirectUris, ["https://agente.ia-app.com/api/youtube/oauth"]);
});

t("un cliente «installed» (Escritorio) también sirve, y sin vueltas no pasa nada", () => {
    const r = a.leerElCliente({ installed: { client_id: CLIENT_ID, client_secret: "x" } });
    assert.equal(r.ok, true);
    assert.equal(r.cliente.tipo, "installed");
    assert.deepEqual(r.cliente.redirectUris, []);
    assert.equal(r.cliente.proyecto, null);
});

t("una CUENTA DE SERVICIO se rechaza y dice cuál hace falta", () => {
    const r = a.leerElCliente(JSON.stringify({ type: "service_account", client_email: "x@y.iam.gserviceaccount.com", private_key: "-----BEGIN" }));
    assert.equal(r.ok, false);
    assert.match(r.motivo, /CUENTA DE SERVICIO/);
    assert.match(r.motivo, /Aplicación web/);
});

t("lo que no es un JSON de cliente de OAuth se dice con su motivo", () => {
    assert.match(a.leerElCliente("{no es json").motivo, /no es un JSON válido/);
    assert.match(a.leerElCliente(JSON.stringify({ otra: 1 })).motivo, /«web» o «installed»/);
    assert.match(a.leerElCliente(JSON.stringify(web({ client_id: "cualquier-cosa" }))).motivo, /client_id/);
    assert.match(a.leerElCliente(JSON.stringify(web({ client_secret: "  " }))).motivo, /client_secret/);
    assert.equal(a.leerElCliente(null).ok, false);
});

/* ── El sello ─────────────────────────────────────────────────────────────── */

t("sellar y abrir: ida y vuelta, y el texto en claro no aparece en el sello", () => {
    const sellado = a.sellar({ refreshToken: "1//secreto-permanente" }, ENV);
    assert.match(sellado, /^v1\./);
    assert.ok(!sellado.includes("secreto-permanente"));
    assert.deepEqual(a.abrir(sellado, ENV), { refreshToken: "1//secreto-permanente" });
    // Dos sellos del mismo dato no son iguales (IV aleatorio).
    assert.notEqual(sellado, a.sellar({ refreshToken: "1//secreto-permanente" }, ENV));
});

t("con OTRA AUTH_SECRET el sello no se abre: null, no una excepción", () => {
    const sellado = a.sellar({ refreshToken: "x" }, ENV);
    assert.equal(a.abrir(sellado, OTRO_ENV), null);
    assert.equal(a.abrir("v1.basura", ENV), null);
    assert.equal(a.abrir(null, ENV), null);
    // Un byte tocado en el cifrado: la etiqueta de GCM lo caza.
    const partes = sellado.split(".");
    partes[3] = partes[3].slice(0, -2) + (partes[3].endsWith("A") ? "BB" : "AA");
    assert.equal(a.abrir(partes.join("."), ENV), null);
});

t("sin AUTH_SECRET no se sella nada (no se cae a una llave vacía)", () => {
    assert.throws(() => a.sellar({ x: 1 }, {}), /Falta AUTH_SECRET/);
});

/* ── El state del viaje ───────────────────────────────────────────────────── */

t("el state firmado se lee; tocado, caducado, sin nonce o con otra vía, no", () => {
    const ahora = 1_800_000_000_000;
    const base = { personaId: "carlos", nonce: "n1", via: "navegador", exp: ahora + 60_000 };
    const firmado = a.firmarElEstado(base, ENV);
    assert.deepEqual(a.leerElEstado(firmado, ahora, ENV), base);
    // Con otra llave no vale.
    assert.equal(a.leerElEstado(firmado, ahora, OTRO_ENV), null);
    // Tocado el cuerpo (otra persona), la firma no casa.
    const [, firma] = firmado.split(".");
    const otro = Buffer.from(JSON.stringify({ ...base, personaId: "ana" })).toString("base64url");
    assert.equal(a.leerElEstado(`${otro}.${firma}`, ahora, ENV), null);
    // Caducado.
    assert.equal(a.leerElEstado(firmado, ahora + 60_001, ENV), null);
    // Sin nonce o con una vía inventada, aunque vaya bien firmado.
    assert.equal(a.leerElEstado(a.firmarElEstado({ ...base, nonce: "" }, ENV), ahora, ENV), null);
    assert.equal(a.leerElEstado(a.firmarElEstado({ ...base, via: "otra" }, ENV), ahora, ENV), null);
    assert.equal(a.leerElEstado("", ahora, ENV), null);
    assert.equal(a.leerElEstado("sinpunto", ahora, ENV), null);
});

t("el nonce no se repite y la vigencia son diez minutos", () => {
    assert.notEqual(a.unNonce(), a.unNonce());
    assert.ok(a.unNonce().length >= 20);
    assert.equal(a.VIGENCIA_DEL_VIAJE_MS, 10 * 60_000);
});

/* ── El enlace de Google ──────────────────────────────────────────────────── */

t("el enlace pide el permiso PERMANENTE y solo los dos permisos", () => {
    const { cliente } = a.leerElCliente(web());
    const u = new URL(a.elEnlaceDeAutorizacion({ cliente, vuelta: "https://x.test/api/youtube/oauth", estado: "EST", env: {} }));
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    const p = u.searchParams;
    assert.equal(p.get("client_id"), CLIENT_ID);
    assert.equal(p.get("redirect_uri"), "https://x.test/api/youtube/oauth");
    assert.equal(p.get("response_type"), "code");
    assert.equal(p.get("access_type"), "offline");
    assert.equal(p.get("prompt"), "select_account consent");
    assert.equal(p.get("state"), "EST");
    assert.deepEqual(p.get("scope").split(" ").sort(), [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
    ]);
    // Nada de `youtube` a secas (deja borrar videos) ni el secreto en el enlace.
    assert.ok(!p.get("scope").split(" ").includes("https://www.googleapis.com/auth/youtube"));
    assert.ok(!u.toString().includes("GOCSPX"));
});

t("el Google de mentira solo se enciende FUERA de producción", () => {
    const falso = { YOUTUBE_GOOGLE_FALSO: "http://127.0.0.1:9/" };
    assert.equal(a.lasDireccionesDeGoogle({ ...falso, NODE_ENV: "test" }).token, "http://127.0.0.1:9/token");
    assert.equal(a.lasDireccionesDeGoogle({ ...falso, NODE_ENV: "production" }).token, "https://oauth2.googleapis.com/token");
    assert.equal(a.lasDireccionesDeGoogle({}).subir, "https://www.googleapis.com/upload/youtube/v3");
});

t("la vuelta: la ruta de la App con «web», localhost con «installed»", () => {
    const { cliente: w } = a.leerElCliente(web());
    assert.equal(a.laVuelta(w, "https://agente.ia-app.com/"), "https://agente.ia-app.com/api/youtube/oauth");
    const { cliente: i } = a.leerElCliente({ installed: { client_id: CLIENT_ID, client_secret: "x", redirect_uris: ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"] } });
    assert.equal(a.laVuelta(i, "https://agente.ia-app.com"), "http://localhost");
    const { cliente: sin } = a.leerElCliente({ installed: { client_id: CLIENT_ID, client_secret: "x" } });
    assert.equal(a.laVuelta(sin, "https://agente.ia-app.com"), "http://localhost");
});

/* ── Los errores de Google ────────────────────────────────────────────────── */

t("los errores de Google se traducen a qué hacer", () => {
    const m = (estado, cuerpo) => a.elMotivoDeGoogle(estado, cuerpo);
    assert.equal(m(400, { error: "invalid_grant" }).codigo, "permiso_caducado");
    assert.match(m(400, { error: "invalid_grant" }).motivo, /En producción/);
    assert.equal(m(401, { error: "invalid_client" }).codigo, "cliente_invalido");
    assert.equal(m(400, { error: "redirect_uri_mismatch" }).codigo, "vuelta_no_registrada");
    const api = (reason, message = "x", estado = 403) => m(estado, { error: { code: estado, message, errors: [{ reason, message }] } });
    assert.equal(api("accessNotConfigured").codigo, "api_apagada");
    assert.match(api("accessNotConfigured").motivo, /YouTube Data API v3/);
    assert.equal(api("forbidden", "YouTube Data API v3 has not been used in project 123 before or it is disabled").codigo, "api_apagada");
    assert.equal(api("quotaExceeded").codigo, "cuota");
    assert.equal(api("uploadLimitExceeded", "x", 400).codigo, "limite_de_subidas");
    assert.equal(api("youtubeSignupRequired", "x", 401).codigo, "sin_canal");
    assert.equal(api("insufficientPermissions").codigo, "sin_permiso");
    assert.equal(api("invalidPublishAt", "x", 400).codigo, "fecha_invalida");
    assert.match(api("invalidTitle", "x", 400).motivo, /título/);
    assert.equal(m(401, { error: { code: 401, message: "Invalid Credentials", errors: [{ reason: "authError" }] } }).codigo, "sin_sesion");
    assert.equal(m(401, null).codigo, "sin_sesion");
    assert.equal(api("forbidden", "The authenticated user doesn't have permissions to upload and set custom video thumbnails.").codigo, "miniatura_no_permitida");
    // Lo que no se reconoce se devuelve tal cual: inventar un motivo es peor.
    const raro = m(418, { error: { message: "Soy una tetera" } });
    assert.equal(raro.codigo, "http_418");
    assert.match(raro.motivo, /Soy una tetera/);
});

/* ── La fecha ─────────────────────────────────────────────────────────────── */

const AHORA = Date.parse("2026-10-03T12:00:00Z");

t("la fecha va en hora de Colombia (UTC-5), en las dos formas", () => {
    const r = s.laHoraDePublicar("2026-10-10 18:00", AHORA);
    assert.equal(r.ok, true);
    assert.equal(r.valor.iso, "2026-10-10T23:00:00.000Z");
    assert.match(r.valor.legible, /hora de Colombia/);
    assert.match(r.valor.legible, /10 de octubre de 2026/);
    assert.equal(s.laHoraDePublicar("05/11/2026 08:30", AHORA).valor.iso, "2026-11-05T13:30:00.000Z");
    assert.equal(s.laHoraDePublicar("2026-10-10T18:00", AHORA).valor.iso, "2026-10-10T23:00:00.000Z");
    assert.equal(s.laHoraDePublicar("2026-10-10 7:05", AHORA).valor.iso, "2026-10-10T12:05:00.000Z");
    // Pasada la medianoche de Colombia, en UTC ya es el día siguiente.
    assert.equal(s.laHoraDePublicar("2026-12-31 21:30", AHORA).valor.iso, "2027-01-01T02:30:00.000Z");
});

t("con su desfase escrito, manda el desfase", () => {
    assert.equal(s.laHoraDePublicar("2026-10-10T18:00:00-05:00", AHORA).valor.iso, "2026-10-10T23:00:00.000Z");
    assert.equal(s.laHoraDePublicar("2026-10-10T18:00:00Z", AHORA).valor.iso, "2026-10-10T18:00:00.000Z");
    assert.equal(s.laHoraDePublicar("2026-10-10T18:00:00+02:00", AHORA).valor.iso, "2026-10-10T16:00:00.000Z");
});

t("una fecha que no existe se rechaza, no se corre al día siguiente", () => {
    assert.match(s.laHoraDePublicar("2026-02-30 10:00", AHORA).motivo, /no es una fecha que exista/);
    assert.match(s.laHoraDePublicar("2026-13-01 10:00", AHORA).motivo, /no es una fecha que exista/);
    assert.match(s.laHoraDePublicar("2026-10-10 25:00", AHORA).motivo, /no es una fecha que exista/);
    assert.match(s.laHoraDePublicar("31/04/2026 10:00", AHORA).motivo, /no es una fecha que exista/);
    assert.match(s.laHoraDePublicar("2026-02-30T10:00:00Z", AHORA).motivo, /no es una fecha que exista/);
    assert.match(s.laHoraDePublicar("mañana a las 6", AHORA).motivo, /No entiendo la fecha/);
    assert.match(s.laHoraDePublicar("", AHORA).motivo, /Falta la fecha/);
});

t("la publicación tiene que estar al menos 15 minutos en el futuro", () => {
    // 2026-10-10 18:00 Colombia = 23:00Z.
    const a2250 = Date.parse("2026-10-10T22:50:00Z");
    const a2240 = Date.parse("2026-10-10T22:40:00Z");
    assert.equal(s.laHoraDePublicar("2026-10-10 18:00", a2250).ok, false);
    assert.match(s.laHoraDePublicar("2026-10-10 18:00", a2250).motivo, /15 minutos en el futuro/);
    assert.equal(s.laHoraDePublicar("2026-10-10 18:00", a2240).ok, true);
    assert.equal(s.laHoraDePublicar("2020-01-01 10:00", AHORA).ok, false);
});

/* ── Título, descripción, etiquetas, categoría ────────────────────────────── */

t("el título: espacios juntados, sin < ni >, y hasta 100 caracteres", () => {
    assert.equal(s.elTitulo("  Cómo   vender\npor WhatsApp  ").valor, "Cómo vender por WhatsApp");
    assert.match(s.elTitulo("Hola <b>").motivo, /< ni >/);
    assert.match(s.elTitulo("x".repeat(101)).motivo, /101 caracteres/);
    assert.equal(s.elTitulo("x".repeat(100)).ok, true);
    // Un emoji cuenta como UNO, como lo cuenta YouTube.
    assert.equal(s.elTitulo("🎬".repeat(100)).ok, true);
    assert.match(s.elTitulo("   ").motivo, /Falta el título/);
});

t("la descripción: saltos normalizados y tope de 5000 BYTES", () => {
    assert.equal(s.laDescripcion("línea 1\r\nlínea 2\r").valor, "línea 1\nlínea 2");
    assert.equal(s.laDescripcion("").valor, "");
    assert.match(s.laDescripcion("a < b").motivo, /< ni >/);
    // 2500 eñes son 5000 bytes (cabe); 2501 no.
    assert.equal(s.laDescripcion("ñ".repeat(2500)).ok, true);
    assert.match(s.laDescripcion("ñ".repeat(2501)).motivo, /5002 bytes/);
});

t("las etiquetas: sin #, sin repetidas (se queda la PRIMERA forma) y 500 en total", () => {
    assert.deepEqual(s.lasEtiquetas("verzay, #ia, Verzay").valor, ["verzay", "ia"]);
    assert.deepEqual(s.lasEtiquetas("Verzay, verzay").valor, ["Verzay"]);
    assert.deepEqual(s.lasEtiquetas(["  marketing   digital ", ""]).valor, ["marketing digital"]);
    assert.deepEqual(s.lasEtiquetas("").valor, []);
    assert.match(s.lasEtiquetas("a, <b>").motivo, /< ni >/);
    // 50 etiquetas de 10 caracteres + 49 comas = 549.
    const muchas = Array.from({ length: 50 }, (_, i) => `etiqueta${String(i).padStart(2, "0")}`).join(",");
    assert.match(s.lasEtiquetas(muchas).motivo, /suman 549/);
});

t("la categoría: la de por defecto o un número", () => {
    assert.equal(s.laCategoria(undefined).valor, "22");
    assert.equal(s.laCategoria("28").valor, "28");
    assert.match(s.laCategoria("Educación").motivo, /no es un número de categoría/);
});

/* ── Los archivos ─────────────────────────────────────────────────────────── */

t("el video: por su extensión, y no vacío", () => {
    assert.deepEqual(s.elVideo("demo.MP4", 10).valor, { tipo: "video/mp4", tamano: 10 });
    assert.equal(s.elVideo("demo.mov", 10).valor.tipo, "video/quicktime");
    assert.equal(s.elVideo("demo.webm", 10).valor.tipo, "video/webm");
    assert.match(s.elVideo("guion.pdf", 10).motivo, /no parece un video/);
    assert.match(s.elVideo("demo.mp4", 0).motivo, /está vacío/);
});

t("la miniatura: JPG o PNG por sus PRIMEROS BYTES, y hasta 2 MB", () => {
    const jpg = Buffer.alloc(100, 0x20);
    jpg.set([0xff, 0xd8, 0xff], 0);
    const png = Buffer.alloc(100, 0x20);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const gif = Buffer.from("GIF89a" + "x".repeat(50));
    assert.equal(s.laMiniatura(jpg).valor.tipo, "image/jpeg");
    assert.equal(s.laMiniatura(png).valor.tipo, "image/png");
    assert.match(s.laMiniatura(gif).motivo, /JPG o PNG/);
    assert.match(s.laMiniatura(Buffer.alloc(0)).motivo, /vacía/);
    const grande = Buffer.alloc(2 * 1024 * 1024 + 1, 0x20);
    grande.set([0xff, 0xd8, 0xff], 0);
    assert.match(s.laMiniatura(grande).motivo, /2 MB/);
});

/* ── El cuerpo, la huella y cómo quedó ────────────────────────────────────── */

t("el cuerpo va SIEMPRE en privado con su fecha", () => {
    const c = s.elCuerpoDelVideo({ titulo: "T", descripcion: "D", etiquetas: [], categoria: "22", publicarEn: "2026-10-10T23:00:00.000Z" });
    assert.equal(c.status.privacyStatus, "private");
    assert.equal(c.status.publishAt, "2026-10-10T23:00:00.000Z");
    assert.equal(c.status.selfDeclaredMadeForKids, false);
    assert.equal(c.snippet.defaultLanguage, "es");
    assert.ok(!("tags" in c.snippet), "sin etiquetas no se manda una lista vacía");
    const conTags = s.elCuerpoDelVideo({ titulo: "T", descripcion: "D", etiquetas: ["ia"], categoria: "28", publicarEn: "2026-10-10T23:00:00.000Z" });
    assert.deepEqual(conTags.snippet.tags, ["ia"]);
    assert.equal(conTags.snippet.categoryId, "28");
});

t("la huella cambia con el archivo, el título o la fecha, y con nada más", () => {
    const base = { videoSha256: "aa", titulo: "T", publicarEn: "2026-10-10T23:00:00.000Z" };
    const h = s.laHuellaDeLaSubida(base);
    assert.equal(h, s.laHuellaDeLaSubida({ ...base }));
    assert.notEqual(h, s.laHuellaDeLaSubida({ ...base, videoSha256: "ab" }));
    assert.notEqual(h, s.laHuellaDeLaSubida({ ...base, titulo: "T2" }));
    assert.notEqual(h, s.laHuellaDeLaSubida({ ...base, publicarEn: "2026-10-11T23:00:00.000Z" }));
});

t("cómo quedó: programado, sin programar (auditoría), otra hora, rechazado", () => {
    const pedido = "2026-10-10T23:00:00.000Z";
    const v = (status) => ({ id: "x", status });
    assert.equal(s.comoQuedo(v({ uploadStatus: "uploaded", privacyStatus: "private", publishAt: pedido }), pedido).estado, "programado");
    const sin = s.comoQuedo(v({ uploadStatus: "uploaded", privacyStatus: "private" }), pedido);
    assert.equal(sin.estado, "sin_programar");
    assert.match(sin.motivo, /auditoría/);
    assert.equal(s.comoQuedo(v({ uploadStatus: "uploaded", privacyStatus: "public", publishAt: pedido }), pedido).estado, "sin_programar");
    assert.equal(s.comoQuedo(v({ uploadStatus: "uploaded", privacyStatus: "private", publishAt: "2026-10-11T23:00:00.000Z" }), pedido).estado, "otra_hora");
    // YouTube devuelve la fecha sin milisegundos: eso no es «otra hora».
    assert.equal(s.comoQuedo(v({ uploadStatus: "uploaded", privacyStatus: "private", publishAt: "2026-10-10T23:00:00Z" }), pedido).estado, "programado");
    assert.equal(s.comoQuedo(v({ uploadStatus: "rejected", rejectionReason: "duplicate" }), pedido).estado, "rechazado");
    assert.equal(s.comoQuedo(null, pedido).estado, "no_encontrado");
});

t("el trozo de la subida es múltiplo de 256 KiB", () => {
    assert.equal(s.TROZO_DE_SUBIDA % (256 * 1024), 0);
});
