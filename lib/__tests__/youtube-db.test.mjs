/**
 * YouTube de punta a punta: la herramienta del agente, las dos rutas de la App
 * y la base, contra POSTGRES y contra un Google de mentira con la forma del de
 * verdad (`fingido/youtube/google.mjs`).
 *
 * Lo que solo se puede contestar aquí:
 *
 * 1. **El acceso se guarda una vez y sirve para siempre.** Se guarda el JSON,
 *    se autoriza UNA vez —por el enlace del agente y por la ruta del
 *    navegador— y las subidas siguientes no piden nada. En la base el permiso
 *    permanente y el secreto del cliente van SELLADOS: ni una de las dos
 *    cadenas aparece en claro en ninguna columna, ni en lo que imprime la
 *    herramienta.
 * 2. **La subida queda PROGRAMADA de verdad**: el archivo llega entero (se
 *    compara su sha256), en privado y con su `publishAt` en UTC, con la
 *    miniatura puesta; y se comprueba LEYENDO el video después, no dándolo por
 *    hecho.
 * 3. **Las averías no pierden nada**: un trozo cortado se reanuda donde iba, un
 *    permiso de una hora que caduca a mitad se renueva, una miniatura que el
 *    canal no admite deja el video subido y dice cómo reintentarla, y un
 *    proyecto sin auditar —el video se queda en privado sin fecha— se DICE y
 *    sale con código 2.
 * 4. **No se sube dos veces lo mismo** (la huella), salvo con `--forzar`.
 * 5. **La puerta**: la ruta de conectar solo la abre el súper administrador de
 *    verdad (con «Ingresar» no), y la vuelta de Google exige el `state`
 *    firmado, su cookie y la MISMA persona.
 *
 * El conductor del contenedor corre aquí mismo (`YOUTUBE_CONTENEDOR=local`):
 * es el MISMO código que se manda al contenedor de la App por Portainer.
 *
 * Solo corre en el modo bueno: el «antes» no tenía nada de esto, y eso lo
 * afirma `youtube-antes.test.mjs`. Se levanta con `scripts/banco-youtube.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

// Credenciales de MENTIRA, armadas al correr: escritas literales en el código
// se parecen a unas de verdad y el escáner de secretos de GitHub frena el push
// (el repositorio es público). El Google de mentira las acepta igual.
const unClientId = (nombre) => [`${Date.now()}`.slice(-10), nombre].join("-") + ".apps." + "googleusercontent" + ".com";
const unSecreto = () => ["GOCSPX", randomBytes(14).toString("base64url")].join("-");
const CLIENT_ID = unClientId("verzay");
const SECRETO = unSecreto();
const OTRO_ID = unClientId("otro");
const OTRO_SECRETO = unSecreto();
const ORIGEN = "https://app.banco.test";

delete process.env.NODE_ENV;
process.env.YOUTUBE_CONTENEDOR = "local";
process.env.YOUTUBE_ORIGEN = ORIGEN;
const { levantarGoogleFalso, unJpeg } = await import(join(AQUI, "fingido", "youtube", "google.mjs"));
const falso = await levantarGoogleFalso({ clientId: CLIENT_ID, clientSecret: SECRETO });
const G = falso.g;
process.env.YOUTUBE_GOOGLE_FALSO = falso.url;

const yt = await import(join(RAIZ, "scripts", "youtube", "youtube.mjs"));
const m = await import(join(AQUI, ".compilado", "youtube", "entrada.js"));
const { db } = m;
const glob = /** @type {any} */ (globalThis);

/* ── Quién mira ───────────────────────────────────────────────────────────── */
const CARLOS = { id: "carlos", name: "Carlos", role: "super_admin", ownerId: null, rolDeLaPersona: "super_admin" };
const ANA = { id: "ana", name: "Ana", role: "user", ownerId: null };
const BRUNO_SUPER = { id: "bruno", name: "Bruno", role: "super_admin", ownerId: null };
// Carlos dentro de la cuenta de un cliente con «Ingresar»: su rol propio no cuenta.
const CARLOS_EN_UN_CLIENTE = { id: "cliente-x", name: "Cliente X", role: "user", ownerId: null, sessionUserId: "carlos", rolDeLaPersona: "super_admin", porImpersonacion: true };
const como = (u) => m.ponerAQuienMira(u);

/* ── Lo que imprime la herramienta ────────────────────────────────────────── */
/** @type {string[]} */
const todoLoImpreso = [];
function unLog() {
    /** @type {string[]} */
    const lineas = [];
    const log = (/** @type {unknown} */ x) => {
        lineas.push(String(x));
        todoLoImpreso.push(String(x));
    };
    return { log, lineas, texto: () => lineas.join("\n") };
}

/* ── Archivos de prueba ───────────────────────────────────────────────────── */
const DIR = mkdtempSync(join(tmpdir(), "banco-youtube-"));
const escribir = (nombre, contenido) => {
    const ruta = join(DIR, nombre);
    writeFileSync(ruta, contenido);
    return ruta;
};
const JSON_ESCRITORIO = escribir(
    "escritorio.json",
    JSON.stringify({
        installed: {
            client_id: CLIENT_ID,
            project_id: "verzay-canal",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            client_secret: SECRETO,
            redirect_uris: ["http://localhost"],
        },
    }),
);
const JSON_CUENTA_DE_SERVICIO = escribir(
    "servicio.json",
    JSON.stringify({ type: "service_account", project_id: "verzay-canal", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n", client_email: "hojas@verzay-canal.iam.gserviceaccount.com" }),
);
const unJsonWeb = (clientId, secreto, vueltas) =>
    JSON.stringify({ web: { client_id: clientId, project_id: "verzay-canal", client_secret: secreto, redirect_uris: vueltas } });

const VIDEO = escribir("video.mp4", randomBytes(700 * 1024));
const SHA_DEL_VIDEO = createHash("sha256").update(readFileSync(VIDEO)).digest("hex");
const MINIATURA = escribir("miniatura.jpg", unJpeg(8192));
const DESCRIPCION = escribir("descripcion.txt", "Así funciona Verzay con tus clientes.\n\nAgenda tu demo: https://agente.ia-app.com");
const ANIO = new Date().getUTCFullYear() + 1;
const PUBLICAR = `${ANIO}-03-15 18:00`;
const PUBLICAR_ISO = `${ANIO}-03-15T23:00:00.000Z`;
const RAPIDO = { trozo: 262144, esperar: async () => {} };
const opcionesDeSubida = (extra = {}) => ({
    video: VIDEO,
    titulo: "Verzay: atiende tus chats con IA",
    descripcion: DESCRIPCION,
    miniatura: MINIATURA,
    publicar: PUBLICAR,
    etiquetas: "verzay, #ia, Verzay",
    ...extra,
});

/* ── La base ──────────────────────────────────────────────────────────────── */
const laFila = async () => (await db.$queryRawUnsafe(`SELECT * FROM "youtube_canal" WHERE "id" = 'verzay'`))[0] ?? null;
const lasSubidas = async () => db.$queryRawUnsafe(`SELECT * FROM "youtube_subidas" ORDER BY "creadoEn"`);

await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "youtube_canal"`);
await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "youtube_subidas"`);

test.after(async () => {
    await falso.cerrar();
    await db.$disconnect();
});

/* ── 1. Las credenciales ──────────────────────────────────────────────────── */

test("una cuenta de SERVICIO se rechaza antes de guardar nada, diciendo cuál hace falta", async () => {
    const { log } = unLog();
    await assert.rejects(() => yt.guardarCliente(JSON_CUENTA_DE_SERVICIO, log), /CUENTA DE SERVICIO.*Aplicación web/s);
    const e = await yt.estado(unLog().log);
    assert.equal(e.hayCliente, false);
});

test("el JSON de escritorio se guarda SELLADO: ni el client_id ni el secreto en claro", async () => {
    const l = unLog();
    const r = await yt.guardarCliente(JSON_ESCRITORIO, l.log);
    assert.equal(r.permisoConservado, false);
    assert.match(l.texto(), /Credenciales guardadas \(cifradas\)/);
    assert.match(l.texto(), /Falta autorizar el canal/);
    const fila = await laFila();
    assert.ok(fila.cliente, "la columna del cliente tiene que tener algo");
    assert.ok(!String(fila.cliente).includes(SECRETO), "el secreto no puede ir en claro");
    assert.ok(!String(fila.cliente).includes(CLIENT_ID), "el client_id tampoco");
    assert.match(String(fila.cliente), /^v1\./);
    const e = await yt.estado(unLog().log);
    assert.equal(e.hayCliente, true);
    assert.equal(e.tipo, "installed");
    assert.equal(e.proyecto, "verzay-canal");
    assert.equal(e.conectado, false);
    assert.equal(e.clienteTermina, "verzay".slice(-6));
});

/* ── 2. Autorizar con el enlace del agente (cliente de escritorio) ────────── */

let laDireccionBuena = "";

test("autorizar da los pasos y un enlace a la pantalla de permisos de Google", async () => {
    const l = unLog();
    const r = await yt.autorizar(l.log);
    assert.equal(r.tipo, "installed");
    assert.match(l.texto(), /YouTube Data API v3/);
    assert.match(l.texto(), /En producción/);
    const linea = r.pasos.find((p) => p.startsWith("Abre este enlace"));
    assert.ok(linea, "falta el paso del enlace");
    const enlace = linea.slice(linea.indexOf("http"));
    assert.ok(enlace.startsWith(`${falso.url}/o/oauth2/v2/auth?`), enlace);
    // «Acepta» en Google: vuelve a localhost con el código.
    const res = await fetch(enlace, { redirect: "manual" });
    assert.equal(res.status, 302, await res.text().catch(() => ""));
    laDireccionBuena = String(res.headers.get("location"));
    assert.ok(laDireccionBuena.startsWith("http://localhost/?") || laDireccionBuena.startsWith("http://localhost?"), laDireccionBuena);
});

test("terminar con una dirección CANCELADA, tocada o del navegador no conecta nada", async () => {
    await assert.rejects(() => yt.terminar("http://localhost/?error=access_denied&state=x", unLog().log), /cancel/i);
    await assert.rejects(() => yt.terminar("esto no es una dirección", unLog().log), /dirección completa/);
    const u = new URL(laDireccionBuena);
    const tocada = new URL(laDireccionBuena);
    tocada.searchParams.set("state", `${u.searchParams.get("state")}x`);
    await assert.rejects(() => yt.terminar(tocada.toString(), unLog().log), /enlace de autorización vigente/);
    // Un `state` firmado de verdad pero empezado desde el NAVEGADOR no vale aquí.
    const delNavegador = new URL(laDireccionBuena);
    delNavegador.searchParams.set(
        "state",
        m.firmarElEstado({ personaId: "agente", nonce: m.unNonce(), via: "navegador", exp: Date.now() + m.VIGENCIA_DEL_VIAJE_MS }),
    );
    await assert.rejects(() => yt.terminar(delNavegador.toString(), unLog().log), /enlace de autorización vigente/);
    assert.equal((await yt.estado(unLog().log)).conectado, false);
});

test("terminar con la dirección buena conecta el canal y guarda el permiso SELLADO", async () => {
    const l = unLog();
    const r = await yt.terminar(laDireccionBuena, l.log);
    assert.equal(r.canal.id, "UCverzay");
    assert.match(l.texto(), /Canal conectado: «Verzay» \(UCverzay\)/);
    const fila = await laFila();
    assert.ok(fila.acceso && !String(fila.acceso).includes(G.refreshToken), "el permiso permanente no puede ir en claro");
    assert.equal(fila.canalId, "UCverzay");
    assert.equal(fila.conectadoPor, "agente");
    const e = await yt.estado(unLog().log);
    assert.equal(e.conectado, true);
    assert.equal(e.verificado, true);
    assert.equal(e.ultimoError, null);
    // El mismo código no se cambia dos veces: se dice qué pasó, en palabras.
    await assert.rejects(() => yt.terminar(laDireccionBuena, unLog().log), /ya se usó o caducó/);
});

/* ── 3. Subir programado ──────────────────────────────────────────────────── */

let primerVideo = "";

test("subir: el archivo llega entero, en privado, con su fecha en UTC y su miniatura", async () => {
    const aperturas = G.aperturas;
    const trozos = G.trozosRecibidos;
    const l = unLog();
    const r = await yt.subir(opcionesDeSubida(), l.log, RAPIDO);
    primerVideo = r.videoId;
    assert.equal(r.quedo.estado, "programado");
    assert.equal(r.miniaturaPuesta, true);
    assert.equal(G.aperturas, aperturas + 1);
    assert.ok(G.trozosRecibidos - trozos >= 3, "con trozos de 256 KiB, 700 KiB son tres trozos");

    const v = G.videos.get(r.videoId);
    assert.equal(v.sha256, SHA_DEL_VIDEO, "el archivo tiene que llegar entero y sin tocar");
    assert.equal(v.status.privacyStatus, "private");
    assert.equal(v.status.publishAt, PUBLICAR_ISO);
    assert.equal(v.snippet.title, "Verzay: atiende tus chats con IA");
    assert.deepEqual(v.snippet.tags, ["verzay", "ia"]);
    assert.match(v.snippet.description, /Agenda tu demo/);
    assert.equal(v.sesion.avisar, "true");
    assert.equal(v.sesion.tipo, "video/mp4");
    assert.equal(G.miniaturas.get(r.videoId)?.tipo, "image/jpeg");

    const [fila] = await lasSubidas();
    assert.equal(fila.videoId, r.videoId);
    assert.equal(fila.miniatura, true);
    assert.equal(new Date(fila.publicarEn).toISOString(), PUBLICAR_ISO);
    assert.match(l.texto(), new RegExp(`se publica el .*15 de marzo de ${ANIO}, 6:00\\sp\\.\\sm\\.\\s\\(hora de Colombia\\)`));
    assert.match(l.texto(), /subido 100%/);
    assert.match(l.texto(), /✔ Programado para/);
});

test("el mismo video con el mismo título y fecha NO se sube dos veces; con --forzar sí", async () => {
    const aperturas = G.aperturas;
    const l = unLog();
    const r = await yt.subir(opcionesDeSubida(), l.log, RAPIDO);
    assert.equal(r.repetido, true);
    assert.equal(r.videoId, primerVideo);
    assert.equal(G.aperturas, aperturas, "no puede abrir otra subida");
    assert.match(l.texto(), /ya se subió/);

    const f = await yt.subir(opcionesDeSubida({ forzar: true }), unLog().log, RAPIDO);
    assert.notEqual(f.videoId, primerVideo);
    assert.equal(G.aperturas, aperturas + 1);
});

test("un trozo cortado a medias (503) se REANUDA donde iba, sin repetir ni perder bytes", async () => {
    G.cortarEnElTrozo = G.trozosRecibidos + 2;
    const r = await yt.subir(opcionesDeSubida({ titulo: "Reanudar un trozo cortado" }), unLog().log, RAPIDO);
    G.cortarEnElTrozo = 0;
    assert.equal(r.quedo.estado, "programado");
    assert.equal(G.videos.get(r.videoId).sha256, SHA_DEL_VIDEO);
});

test("el permiso de una hora que caduca a mitad se RENUEVA y la subida sigue", async () => {
    const emitidos = G.tokensEmitidos;
    G.caducarDespuesDelTrozo = G.trozosRecibidos + 1;
    const r = await yt.subir(opcionesDeSubida({ titulo: "Renovar el permiso a mitad" }), unLog().log, RAPIDO);
    G.caducarDespuesDelTrozo = 0;
    assert.equal(r.quedo.estado, "programado");
    assert.equal(G.videos.get(r.videoId).sha256, SHA_DEL_VIDEO);
    assert.ok(G.tokensEmitidos >= emitidos + 2, "tuvo que pedir un permiso nuevo a mitad");
});

test("un proyecto SIN AUDITAR deja el video sin fecha: se dice y sale con código 2", async () => {
    G.sinAuditar = true;
    const l = unLog();
    await assert.rejects(
        () => yt.subir(opcionesDeSubida({ titulo: "Proyecto sin auditar" }), l.log, RAPIDO),
        (e) => e.salida === 2 && /no quedó programado/.test(e.message),
    );
    G.sinAuditar = false;
    assert.match(l.texto(), /⚠ .*auditoría/);
});

test("una miniatura que el canal no admite deja el video SUBIDO y dice cómo reintentarla", async () => {
    G.miniaturaProhibida = true;
    const l = unLog();
    const r = await yt.subir(opcionesDeSubida({ titulo: "Canal sin verificar" }), l.log, RAPIDO);
    G.miniaturaProhibida = false;
    assert.equal(r.quedo.estado, "programado");
    assert.equal(r.miniaturaPuesta, false);
    assert.match(l.texto(), /La miniatura NO se puso/);
    assert.match(l.texto(), /youtube\.com\/verify/);
    assert.match(l.texto(), new RegExp(`miniatura --video-id ${r.videoId} --archivo`));
    const fila = (await lasSubidas()).find((s) => s.videoId === r.videoId);
    assert.equal(fila.miniatura, false);

    const m2 = await yt.miniatura({ "video-id": r.videoId, archivo: MINIATURA }, unLog().log);
    assert.equal(m2.videoId, r.videoId);
    assert.equal((await lasSubidas()).find((s) => s.videoId === r.videoId).miniatura, true);
    assert.ok(G.miniaturas.has(r.videoId));
});

test("todo lo que está mal se dice JUNTO y no se abre ninguna subida", async () => {
    const aperturas = G.aperturas;
    const malo = escribir("malo.jpg", Buffer.from("no soy una imagen"));
    await assert.rejects(
        () =>
            yt.subir(
                opcionesDeSubida({ titulo: "x".repeat(101), publicar: "31/04/2026 10:00", miniatura: malo, etiquetas: "a<b" }),
                unLog().log,
                RAPIDO,
            ),
        (e) => /No se subió nada/.test(e.message) && (e.message.match(/\n- /g) ?? []).length >= 3,
    );
    await assert.rejects(() => yt.subir({ titulo: "sin video" }, unLog().log, RAPIDO), /Falta --video/);
    await assert.rejects(() => yt.subir(opcionesDeSubida({ video: join(DIR, "no-existe.mp4") }), unLog().log, RAPIDO), /No existe el video/);
    assert.equal(G.aperturas, aperturas);
});

test("--probar comprueba el permiso y el canal sin subir nada", async () => {
    const aperturas = G.aperturas;
    const l = unLog();
    const r = await yt.subir(opcionesDeSubida({ titulo: "Solo probar", probar: true }), l.log, RAPIDO);
    assert.equal(r.probado, true);
    assert.equal(r.canal.id, "UCverzay");
    assert.equal(G.aperturas, aperturas);
    assert.match(l.texto(), /No se subió nada/);
});

test("un permiso retirado (o en modo «Prueba») se dice con qué hacer, y queda anotado", async () => {
    G.refreshRetirado = true;
    await assert.rejects(() => yt.subir(opcionesDeSubida({ titulo: "Permiso retirado" }), unLog().log, RAPIDO), /En producción/);
    G.refreshRetirado = false;
    const e = await yt.estado(unLog().log);
    assert.match(String(e.ultimoError), /En producción/);
});

test("nada de lo impreso lleva el permiso permanente, el secreto ni un permiso de una hora", () => {
    const todo = todoLoImpreso.join("\n");
    assert.ok(!todo.includes(G.refreshToken), "el permiso permanente salió impreso");
    assert.ok(!todo.includes(SECRETO), "el secreto del cliente salió impreso");
    assert.ok(!/ya29\./.test(todo), "un permiso de una hora salió impreso");
});

/* ── 4. Cambiar de credenciales ───────────────────────────────────────────── */

test("el MISMO cliente conserva el permiso; uno DISTINTO lo tira (no sirve con otro)", async () => {
    const l = unLog();
    const r = await yt.guardarCliente(JSON_ESCRITORIO, l.log);
    assert.equal(r.permisoConservado, true);
    assert.match(l.texto(), /se conserva/);
    assert.equal((await yt.estado(unLog().log)).conectado, true);

    G.cliente = { clientId: OTRO_ID, clientSecret: OTRO_SECRETO };
    const web = escribir("web.json", unJsonWeb(OTRO_ID, OTRO_SECRETO, ["https://otra.app/callback"]));
    const l2 = unLog();
    const r2 = await yt.guardarCliente(web, l2.log);
    assert.equal(r2.permisoConservado, false);
    const e = await yt.estado(unLog().log);
    assert.equal(e.tipo, "web");
    assert.equal(e.conectado, false);
    assert.equal(e.canalId, null);

    const pasos = unLog();
    await yt.autorizar(pasos.log);
    assert.match(pasos.texto(), new RegExp(`añade ${ORIGEN}/api/youtube/oauth`));
    assert.match(pasos.texto(), new RegExp(`${ORIGEN}/api/youtube/conectar`));

    // Ya con la vuelta registrada, el paso lo dice en vez de pedirla.
    const conVuelta = escribir("web2.json", unJsonWeb(OTRO_ID, OTRO_SECRETO, [`${ORIGEN}/api/youtube/oauth`]));
    await yt.guardarCliente(conVuelta, unLog().log);
    const pasos2 = unLog();
    await yt.autorizar(pasos2.log);
    assert.match(pasos2.texto(), /ya está en el cliente/);
});

/* ── 5. Las rutas de la App: conectar desde el navegador ──────────────────── */

const pedir = (ruta) => new Request(`${ORIGEN}${ruta}`);

test("conectar: sin sesión al login; un cliente o Carlos dentro de un cliente, 403", async () => {
    glob.__cookiesDelBanco = {};
    como(null);
    const sin = await m.conectarGET(pedir("/api/youtube/conectar"));
    assert.equal(sin.status, 307);
    assert.equal(sin.headers.get("location"), `${ORIGEN}/login?callbackUrl=%2Fapi%2Fyoutube%2Fconectar`);

    como(ANA);
    assert.equal((await m.conectarGET(pedir("/api/youtube/conectar"))).status, 403);
    como(CARLOS_EN_UN_CLIENTE);
    assert.equal((await m.conectarGET(pedir("/api/youtube/conectar"))).status, 403);
});

let laVueltaDeGoogle = "";
let laCookie = "";

test("conectar: el súper administrador va a Google con el state firmado y la cookie del viaje", async () => {
    como(CARLOS);
    const res = await m.conectarGET(pedir("/api/youtube/conectar"));
    assert.equal(res.status, 307);
    const destino = new URL(String(res.headers.get("location")));
    assert.equal(destino.origin + destino.pathname, `${falso.url}/o/oauth2/v2/auth`);
    assert.equal(destino.searchParams.get("redirect_uri"), `${ORIGEN}/api/youtube/oauth`);
    assert.equal(destino.searchParams.get("access_type"), "offline");
    const cookie = String(res.headers.get("set-cookie"));
    assert.match(cookie, /youtube_oauth_nonce=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\/api\/youtube\/oauth/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Secure/i);
    laCookie = /youtube_oauth_nonce=([^;]+)/.exec(cookie)[1];
    const g = await fetch(destino, { redirect: "manual" });
    assert.equal(g.status, 302);
    laVueltaDeGoogle = String(g.headers.get("location"));
    assert.ok(laVueltaDeGoogle.startsWith(`${ORIGEN}/api/youtube/oauth?`), laVueltaDeGoogle);
});

test("la vuelta: sin cookie, con el state tocado, con otra persona o del enlace del agente, NO conecta", async () => {
    const vuelta = (u) => m.vueltaGET(new Request(u));
    como(CARLOS);

    glob.__cookiesDelBanco = {};
    let r = await vuelta(laVueltaDeGoogle);
    assert.equal(r.status, 400);
    assert.match(await r.text(), /La autorización caducó/);

    glob.__cookiesDelBanco = { youtube_oauth_nonce: laCookie };
    const tocada = new URL(laVueltaDeGoogle);
    tocada.searchParams.set("state", `${tocada.searchParams.get("state")}x`);
    assert.equal((await vuelta(tocada.toString())).status, 400);

    // Otro súper administrador con la cookie de Carlos: la persona no es la que empezó.
    como(BRUNO_SUPER);
    r = await vuelta(laVueltaDeGoogle);
    assert.equal(r.status, 403);

    // Un state del ENLACE del agente («pegado») no entra por la ruta del navegador.
    como(CARLOS);
    const pegado = new URL(laVueltaDeGoogle);
    pegado.searchParams.set("state", m.firmarElEstado({ personaId: "carlos", nonce: laCookie, via: "pegado", exp: Date.now() + 60000 }));
    assert.equal((await vuelta(pegado.toString())).status, 400);

    r = await vuelta(`${ORIGEN}/api/youtube/oauth?error=access_denied`);
    assert.match(await r.text(), /Se canceló la autorización/);
    // Toda página de la vuelta borra la cookie del viaje.
    assert.match(String(r.headers.get("set-cookie")), /youtube_oauth_nonce=;.*Max-Age=0/i);

    assert.equal((await m.elEstadoDeLaConexion(db)).conectado, false);
});

test("la vuelta buena conecta el canal, escapa su nombre y avisa si no está verificado", async () => {
    G.tituloDelCanal = 'Verzay <b>&</b>';
    G.miniaturaProhibida = true;
    como(CARLOS);
    glob.__cookiesDelBanco = { youtube_oauth_nonce: laCookie };
    const r = await m.vueltaGET(new Request(laVueltaDeGoogle));
    const html = await r.text();
    G.miniaturaProhibida = false;
    assert.equal(r.status, 200, html);
    assert.match(html, /Canal de YouTube conectado/);
    assert.match(html, /Verzay &lt;b&gt;&amp;&lt;\/b&gt;/);
    assert.ok(!html.includes("<b>&</b>"), "el nombre del canal tiene que ir escapado");
    assert.match(html, /youtube\.com\/verify/);
    assert.ok(!html.includes(G.refreshToken));
    const e = await m.elEstadoDeLaConexion(db);
    assert.equal(e.conectado, true);
    assert.equal(e.verificado, false);
    const fila = await laFila();
    assert.equal(fila.conectadoPor, "carlos");

    // El mismo código otra vez: 502, con el motivo en palabras y anotado.
    const otra = await m.vueltaGET(new Request(laVueltaDeGoogle));
    assert.equal(otra.status, 502);
    assert.match(await otra.text(), /ya se usó o caducó/);
    assert.match(String((await m.elEstadoDeLaConexion(db)).ultimoError), /ya se usó o caducó/);
    G.tituloDelCanal = "Verzay";
});

test("con el permiso del navegador también se sube, sin volver a autorizar", async () => {
    const r = await yt.subir(opcionesDeSubida({ titulo: "Subida con el permiso web" }), unLog().log, RAPIDO);
    assert.equal(r.quedo.estado, "programado");
});

/* ── 6. Otra llave y la base que se va ────────────────────────────────────── */

test("con OTRA AUTH_SECRET el acceso no se abre: se dice, no se confunde con «sin credenciales»", async () => {
    const otra = { ...process.env, AUTH_SECRET: "una-llave-que-no-es-la-de-la-app" };
    const c = await m.leerLaConexion(db, otra);
    assert.equal(c.sinDescifrar, true);
    assert.equal(c.cliente, null);
    await assert.rejects(() => m.unPermisoParaSubir(db, { env: otra }), (e) => e.codigo === "sin_descifrar");
    const e = await m.elEstadoDeLaConexion(db, otra);
    assert.equal(e.sinDescifrar, true);
    assert.equal(e.hayCliente, false);
});

test("si la tabla desaparece por debajo, se vuelve a crear sola (42P01)", async () => {
    await db.$executeRawUnsafe(`DROP TABLE "youtube_canal"`);
    const e = await m.elEstadoDeLaConexion(db);
    assert.equal(e.hayCliente, false);
});

/* ── 7. La herramienta de verdad, como la corre el agente ─────────────────── */

test("la línea de órdenes: estado sale con 0, un error con 1 y un video sin programar con 2", async () => {
    // Asíncrono a propósito: el Google de mentira corre en ESTE proceso, y un
    // spawnSync le bloquearía el bucle de eventos — el hijo se quedaría
    // esperando una respuesta que nadie puede darle.
    const correr = (...args) =>
        new Promise((resolver, rechazar) => {
            const hijo = spawn(process.execPath, [join(RAIZ, "scripts", "youtube", "youtube.mjs"), ...args], { cwd: RAIZ, env: process.env });
            let stdout = "";
            let stderr = "";
            hijo.stdout.on("data", (d) => (stdout += d));
            hijo.stderr.on("data", (d) => (stderr += d));
            hijo.on("error", rechazar);
            hijo.on("close", (status) => resolver({ status, stdout, stderr }));
        });
    const estado = await correr("estado");
    assert.equal(estado.status, 0, estado.stderr);
    assert.match(estado.stdout, /Todavía no hay credenciales/);

    const sinVideo = await correr("subir", "--titulo", "x");
    assert.equal(sinVideo.status, 1);
    assert.match(sinVideo.stderr, /Falta --video/);

    // Se vuelve a conectar por el enlace del agente y se sube con un proyecto sin auditar.
    G.cliente = { clientId: CLIENT_ID, clientSecret: SECRETO };
    await yt.guardarCliente(JSON_ESCRITORIO, unLog().log);
    const r = await yt.autorizar(unLog().log);
    const enlace = r.pasos.find((p) => p.startsWith("Abre este enlace")).replace(/^.*?(http\S+)$/, "$1");
    const g = await fetch(enlace, { redirect: "manual" });
    await yt.terminar(String(g.headers.get("location")), unLog().log);

    G.sinAuditar = true;
    const otraFecha = `${ANIO}-04-20 09:30`;
    const sinProgramar = await correr("subir", "--video", VIDEO, "--titulo", "Desde la línea de órdenes", "--publicar", otraFecha, "--sin-avisar");
    G.sinAuditar = false;
    assert.equal(sinProgramar.status, 2, `${sinProgramar.stdout}\n${sinProgramar.stderr}`);
    assert.match(sinProgramar.stdout, /auditoría/);
    assert.match(sinProgramar.stderr, /no quedó programado/);
    const v = [...G.videos.values()].find((x) => x.snippet.title === "Desde la línea de órdenes");
    assert.equal(v.sesion.avisar, "false", "--sin-avisar no avisa a los suscriptores");
});
