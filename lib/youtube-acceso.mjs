// @ts-check
/**
 * El acceso al canal de YouTube de la casa: las credenciales de Google, el
 * permiso permanente (el `refresh_token`) y el canal autorizado.
 *
 * # Por qué es un `.mjs` y no un `.ts`
 *
 * Lo usan DOS sitios que no comparten nada: las rutas de la App
 * (`/api/youtube/conectar` y `/api/youtube/oauth`), que corren en Next, y la
 * herramienta del agente (`scripts/youtube/youtube.mjs`), que lo manda tal cual
 * a correr DENTRO del contenedor de la App por Portainer. Un `.ts` necesitaría
 * compilarse para ese segundo viaje, y dos copias de esto —una por sitio— son
 * una que se afina y otra que se queda atrás. Aquí se sella el acceso y aquí se
 * abre: tienen que ser la misma función.
 *
 * Por eso solo importa módulos de Node (`node:crypto`): se carga dentro del
 * contenedor desde una dirección `data:`, y desde ahí solo se alcanzan los
 * módulos de Node. La base llega por parámetro (`db`, un PrismaClient).
 *
 * # El permiso permanente NO sale nunca del contenedor
 *
 * El `refresh_token` se guarda sellado (AES-256-GCM) con una llave que sale de
 * `AUTH_SECRET` por HKDF y con un contexto propio, `verzay-youtube`: no es la
 * llave de las sesiones ni la de los buzones de Correo. Quien sube un video
 * recibe un `access_token` de una hora, nunca el permanente.
 *
 * Lo que cuesta, y se dice: **si `AUTH_SECRET` cambia, el acceso no se puede
 * abrir** y hay que volver a autorizar. `abrir` devuelve `null` en vez de
 * lanzar, y el estado lo enseña como «hay que volver a autorizar».
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const CONTEXTO_DEL_SELLO = "verzay-youtube";

/** La única fila de `youtube_canal`: el canal es de la casa, no de una cuenta. */
export const FILA_DEL_CANAL = "verzay";

/**
 * Los dos permisos, y ninguno más. `youtube.upload` sube y programa; el de
 * lectura deja preguntar qué canal se autorizó y cómo quedó un video. No se
 * pide `youtube` a secas: ese deja borrar videos del canal, y la herramienta no
 * lo necesita.
 */
export const PERMISOS_DE_YOUTUBE = Object.freeze([
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]);

/** Dónde vuelve Google con el permiso, para unas credenciales de tipo «Aplicación web». */
export const RUTA_DE_VUELTA = "/api/youtube/oauth";
/** Dónde se empieza la autorización desde el navegador. */
export const RUTA_DE_CONECTAR = "/api/youtube/conectar";

/* ── El sello ─────────────────────────────────────────────────────────────── */

/** @param {Record<string, string | undefined>} env */
function elSecreto(env) {
    const secreto = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
    if (!secreto) throw new Error("Falta AUTH_SECRET: sin ella no se puede guardar el acceso a YouTube.");
    return secreto;
}

/**
 * @param {"credenciales" | "estado"} uso
 * @param {Record<string, string | undefined>} env
 */
function laLlave(uso, env) {
    return Buffer.from(hkdfSync("sha256", elSecreto(env), CONTEXTO_DEL_SELLO, uso, 32));
}

/**
 * AES-256-GCM: `v1.<iv>.<etiqueta>.<cifrado>`, todo en base64url.
 * @param {unknown} datos
 * @param {Record<string, string | undefined>} [env]
 */
export function sellar(datos, env = process.env) {
    const iv = randomBytes(12);
    const cifrador = createCipheriv("aes-256-gcm", laLlave("credenciales", env), iv);
    const cifrado = Buffer.concat([cifrador.update(JSON.stringify(datos), "utf8"), cifrador.final()]);
    const etiqueta = cifrador.getAuthTag();
    return ["v1", iv.toString("base64url"), etiqueta.toString("base64url"), cifrado.toString("base64url")].join(".");
}

/**
 * @template T
 * @param {string | null | undefined} sellado
 * @param {Record<string, string | undefined>} [env]
 * @returns {T | null}
 */
export function abrir(sellado, env = process.env) {
    try {
        const [version, iv, etiqueta, cifrado] = String(sellado ?? "").split(".");
        if (version !== "v1" || !iv || !etiqueta || !cifrado) return null;
        const descifrador = createDecipheriv("aes-256-gcm", laLlave("credenciales", env), Buffer.from(iv, "base64url"));
        descifrador.setAuthTag(Buffer.from(etiqueta, "base64url"));
        const claro = Buffer.concat([descifrador.update(Buffer.from(cifrado, "base64url")), descifrador.final()]);
        return JSON.parse(claro.toString("utf8"));
    } catch {
        return null;
    }
}

/* ── El `state` del viaje de autorización ─────────────────────────────────── */

/**
 * @typedef {{ personaId: string, nonce: string, via: "navegador" | "pegado", exp: number }} EstadoDelViaje
 */

/**
 * El `state` va FIRMADO y con caducidad. Sin firma, quien armara la vuelta a
 * mano podría colgarle al canal de la casa el permiso de OTRA cuenta de Google.
 * @param {EstadoDelViaje} estado
 * @param {Record<string, string | undefined>} [env]
 */
export function firmarElEstado(estado, env = process.env) {
    const cuerpo = Buffer.from(JSON.stringify(estado)).toString("base64url");
    const firma = createHmac("sha256", laLlave("estado", env)).update(cuerpo).digest("base64url");
    return `${cuerpo}.${firma}`;
}

/**
 * @param {string | null | undefined} valor
 * @param {number} [ahora]
 * @param {Record<string, string | undefined>} [env]
 * @returns {EstadoDelViaje | null}
 */
export function leerElEstado(valor, ahora = Date.now(), env = process.env) {
    const [cuerpo, firma] = String(valor ?? "").split(".");
    if (!cuerpo || !firma) return null;
    const esperada = createHmac("sha256", laLlave("estado", env)).update(cuerpo).digest();
    const recibida = Buffer.from(firma, "base64url");
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
    try {
        const estado = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
        if (!estado?.personaId || !estado?.nonce || !(estado.exp > ahora)) return null;
        if (estado.via !== "navegador" && estado.via !== "pegado") return null;
        return estado;
    } catch {
        return null;
    }
}

export function unNonce() {
    return randomBytes(18).toString("base64url");
}

/** Diez minutos: lo que se tarda en leer la pantalla de permisos y aceptar. */
export const VIGENCIA_DEL_VIAJE_MS = 10 * 60_000;

/* ── Las direcciones de Google ────────────────────────────────────────────── */

/**
 * Las direcciones de Google. `YOUTUBE_GOOGLE_FALSO` las cambia por un servidor
 * de mentira, y **solo fuera de producción**: es lo que deja al banco ejercer
 * el viaje entero sin hablar con Google, y en el contenedor de verdad
 * (`NODE_ENV=production`) no se puede encender por accidente.
 * @param {Record<string, string | undefined>} [env]
 */
export function lasDireccionesDeGoogle(env = process.env) {
    const falsa = env.NODE_ENV !== "production" ? String(env.YOUTUBE_GOOGLE_FALSO || "").replace(/\/+$/, "") : "";
    if (falsa) {
        return {
            autorizar: `${falsa}/o/oauth2/v2/auth`,
            token: `${falsa}/token`,
            api: `${falsa}/youtube/v3`,
            subir: `${falsa}/upload/youtube/v3`,
        };
    }
    return {
        autorizar: "https://accounts.google.com/o/oauth2/v2/auth",
        token: "https://oauth2.googleapis.com/token",
        api: "https://www.googleapis.com/youtube/v3",
        subir: "https://www.googleapis.com/upload/youtube/v3",
    };
}

/* ── Las credenciales que da Google Cloud ─────────────────────────────────── */

/**
 * @typedef {{ tipo: "web" | "installed", clientId: string, clientSecret: string, redirectUris: string[], proyecto: string | null }} ClienteDeGoogle
 */

/**
 * Lee el JSON que se descarga de Google Cloud › Credenciales.
 *
 * Hay tres clases de JSON de Google y solo dos sirven. La que NO sirve es la
 * que más fácil se confunde: la **cuenta de servicio** (`"type":
 * "service_account"`), que es con la que esta plataforma ya escribe en Google
 * Sheets. Una cuenta de servicio no tiene canal de YouTube ni puede subir al de
 * nadie, así que se rechaza diciendo cuál hace falta en vez de guardarla y
 * fallar después.
 * @param {unknown} entrada El texto del archivo, o el objeto ya leído.
 * @returns {{ ok: true, cliente: ClienteDeGoogle } | { ok: false, motivo: string }}
 */
export function leerElCliente(entrada) {
    /** @type {any} */
    let json = entrada;
    if (typeof entrada === "string") {
        try {
            json = JSON.parse(entrada);
        } catch {
            return { ok: false, motivo: "El archivo no es un JSON válido." };
        }
    }
    if (!json || typeof json !== "object") return { ok: false, motivo: "El archivo no es un JSON de credenciales de Google." };
    if (json.type === "service_account") {
        return {
            ok: false,
            motivo:
                "Ese archivo es de una CUENTA DE SERVICIO, y con ella no se puede subir a un canal de YouTube. " +
                "Hace falta un «ID de cliente de OAuth» de tipo «Aplicación web» (Google Cloud › APIs y servicios › Credenciales).",
        };
    }
    const tipo = json.web ? "web" : json.installed ? "installed" : null;
    const datos = tipo ? json[tipo] : null;
    if (!tipo || !datos) {
        return { ok: false, motivo: "No es un JSON de un cliente de OAuth: le falta el bloque «web» o «installed»." };
    }
    const clientId = String(datos.client_id ?? "").trim();
    const clientSecret = String(datos.client_secret ?? "").trim();
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
        return { ok: false, motivo: "El «client_id» del archivo no tiene la forma de Google (…apps.googleusercontent.com)." };
    }
    if (!clientSecret) return { ok: false, motivo: "Al archivo le falta el «client_secret»." };
    const redirectUris = Array.isArray(datos.redirect_uris)
        ? datos.redirect_uris.map((/** @type {unknown} */ u) => String(u ?? "").trim()).filter(Boolean)
        : [];
    return {
        ok: true,
        cliente: { tipo, clientId, clientSecret, redirectUris, proyecto: datos.project_id ? String(datos.project_id) : null },
    };
}

/**
 * Dónde vuelve Google con el permiso. Con «Aplicación web» es la ruta de la
 * App; con «Escritorio» Google solo admite el propio equipo (`localhost`), así
 * que la vuelta no carga y la dirección se pega a mano.
 * @param {ClienteDeGoogle} cliente
 * @param {string} origen
 */
export function laVuelta(cliente, origen) {
    if (cliente.tipo === "web") return `${String(origen).replace(/\/+$/, "")}${RUTA_DE_VUELTA}`;
    return cliente.redirectUris.find((u) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) || "http://localhost";
}

/**
 * Lo que se le enseña al navegador: la pantalla de permisos de Google.
 *
 * - `access_type=offline` + `prompt=consent`: sin las dos, Google no devuelve
 *   el permiso permanente y habría que autorizar en cada subida.
 * - `select_account`: el canal de la casa suele ser una cuenta de MARCA, y así
 *   Google deja elegirla en vez de quedarse con la cuenta personal abierta.
 * @param {{ cliente: ClienteDeGoogle, vuelta: string, estado: string, env?: Record<string, string | undefined> }} p
 */
export function elEnlaceDeAutorizacion({ cliente, vuelta, estado, env = process.env }) {
    const u = new URL(lasDireccionesDeGoogle(env).autorizar);
    u.searchParams.set("client_id", cliente.clientId);
    u.searchParams.set("redirect_uri", vuelta);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", PERMISOS_DE_YOUTUBE.join(" "));
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "select_account consent");
    u.searchParams.set("include_granted_scopes", "true");
    u.searchParams.set("state", estado);
    return u.toString();
}

/* ── Los errores de Google, en palabras que digan qué hacer ───────────────── */

export class ErrorDeYoutube extends Error {
    /** @param {string} codigo @param {string} motivo */
    constructor(codigo, motivo) {
        super(motivo);
        this.name = "ErrorDeYoutube";
        this.codigo = codigo;
    }
}

/**
 * Traduce lo que contesta Google a qué hacer. El motivo de Google viene en
 * inglés y nombra ajustes de Google Cloud; sin traducir, «invalid_grant» o
 * «accessNotConfigured» no le dicen a nadie dónde tocar.
 *
 * Lo que no se reconoce se devuelve TAL CUAL: inventar un motivo es peor.
 * @param {number} estado El código HTTP.
 * @param {any} cuerpo La respuesta ya leída como JSON (o lo que haya).
 * @returns {{ codigo: string, motivo: string }}
 */
export function elMotivoDeGoogle(estado, cuerpo) {
    const errorOAuth = typeof cuerpo?.error === "string" ? cuerpo.error : "";
    const detalle = String(cuerpo?.error_description ?? cuerpo?.error?.message ?? "").trim();
    const razones = Array.isArray(cuerpo?.error?.errors) ? cuerpo.error.errors.map((/** @type {any} */ e) => String(e?.reason ?? "")) : [];
    const razon = razones[0] || String(cuerpo?.error?.status ?? "");
    const texto = `${detalle} ${razones.join(" ")}`.toLowerCase();

    if (errorOAuth === "invalid_grant") {
        return {
            codigo: "permiso_caducado",
            motivo:
                "Google ya no reconoce el permiso guardado: se retiró, o el proyecto sigue en modo «Prueba» (ahí el permiso caduca a los 7 días). " +
                "Pasa la pantalla de consentimiento a «En producción» y vuelve a autorizar.",
        };
    }
    if (errorOAuth === "invalid_client" || errorOAuth === "unauthorized_client") {
        return { codigo: "cliente_invalido", motivo: "Google no reconoce el ID de cliente o su secreto: vuelve a descargar el JSON de credenciales." };
    }
    if (errorOAuth === "redirect_uri_mismatch" || texto.includes("redirect_uri")) {
        return { codigo: "vuelta_no_registrada", motivo: "La dirección de vuelta no está registrada en el cliente de OAuth de Google Cloud." };
    }
    if (razon === "accessNotConfigured" || texto.includes("has not been used in project") || texto.includes("is disabled")) {
        return { codigo: "api_apagada", motivo: "La «YouTube Data API v3» no está activada en el proyecto de Google Cloud: actívala en APIs y servicios › Biblioteca." };
    }
    if (razon === "quotaExceeded" || razon === "dailyLimitExceeded" || razon === "rateLimitExceeded") {
        return { codigo: "cuota", motivo: "Se acabó la cuota diaria de la API de YouTube (unas 6 subidas al día). Se puede volver a subir mañana." };
    }
    if (razon === "uploadLimitExceeded") {
        return { codigo: "limite_de_subidas", motivo: "YouTube no deja subir más videos hoy a este canal: es un límite del canal. Prueba mañana." };
    }
    if (razon === "youtubeSignupRequired" || razon === "channelNotFound") {
        return { codigo: "sin_canal", motivo: "La cuenta autorizada no tiene canal de YouTube: autoriza con la cuenta del canal." };
    }
    if (razon === "insufficientPermissions" || razon === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || texto.includes("insufficient")) {
        return { codigo: "sin_permiso", motivo: "Al autorizar no se marcó el permiso de subir videos a YouTube. Vuelve a autorizar y marca todas las casillas." };
    }
    if (razon === "invalidPublishAt") {
        return { codigo: "fecha_invalida", motivo: "YouTube no aceptó la fecha de publicación: tiene que ser futura." };
    }
    if (razon === "invalidTitle" || razon === "invalidDescription" || razon === "invalidTags") {
        return { codigo: "datos_invalidos", motivo: `YouTube no aceptó el ${razon === "invalidTitle" ? "título" : razon === "invalidDescription" ? "texto de la descripción" : "listado de etiquetas"}.` };
    }
    if (estado === 401) {
        return { codigo: "sin_sesion", motivo: "Google rechazó el permiso de esta subida (401)." };
    }
    if (estado === 403 && /thumbnail|custom/.test(texto)) {
        return { codigo: "miniatura_no_permitida", motivo: "El canal no tiene activadas las miniaturas personalizadas: verifica el canal con un teléfono en youtube.com/verify." };
    }
    return {
        codigo: errorOAuth || razon || `http_${estado}`,
        motivo: detalle ? `Google contestó: ${detalle}` : `Google contestó con un error ${estado}.`,
    };
}

/**
 * @param {Response} res
 * @param {string} contexto
 */
async function fallo(res, contexto) {
    let cuerpo = null;
    try {
        cuerpo = await res.json();
    } catch {
        // Una respuesta que no es JSON también es un fallo: se traduce por su código.
    }
    const { codigo, motivo } = elMotivoDeGoogle(res.status, cuerpo);
    return new ErrorDeYoutube(codigo, `${contexto}: ${motivo}`);
}

/* ── El viaje del permiso ─────────────────────────────────────────────────── */

/**
 * Cambia el código de la vuelta por el permiso permanente.
 * @param {{ cliente: ClienteDeGoogle, codigo: string, vuelta: string, fetch?: typeof globalThis.fetch, env?: Record<string, string | undefined> }} p
 */
export async function cambiarElCodigo({ cliente, codigo, vuelta, fetch = globalThis.fetch, env = process.env }) {
    const res = await fetch(lasDireccionesDeGoogle(env).token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code: codigo,
            client_id: cliente.clientId,
            client_secret: cliente.clientSecret,
            redirect_uri: vuelta,
            grant_type: "authorization_code",
        }),
    });
    if (!res.ok) {
        const e = await fallo(res, "No se pudo terminar la autorización");
        // Al cambiar un CÓDIGO, «invalid_grant» no es un permiso retirado: es que
        // ese código ya se usó o caducó (dura unos minutos). Decirlo como lo
        // otro mandaría a tocar la pantalla de consentimiento para nada.
        if (e.codigo === "permiso_caducado") {
            throw new ErrorDeYoutube("codigo_caducado", "No se pudo terminar la autorización: el código de Google ya se usó o caducó (dura unos minutos). Vuelve a empezar la autorización.");
        }
        throw e;
    }
    const t = await res.json();
    if (!t?.refresh_token) {
        throw new ErrorDeYoutube("sin_permiso_permanente", "Google no devolvió el permiso permanente. Quita el acceso de la app en myaccount.google.com/permissions y vuelve a autorizar.");
    }
    const alcance = String(t.scope ?? "");
    if (!alcance.includes("youtube.upload")) {
        throw new ErrorDeYoutube("sin_permiso", "Al autorizar no se marcó el permiso de «subir videos de YouTube». Vuelve a autorizar y marca todas las casillas.");
    }
    return { refreshToken: String(t.refresh_token), accessToken: String(t.access_token ?? ""), alcance };
}

/**
 * Un permiso de una hora a partir del permanente.
 * @param {{ cliente: ClienteDeGoogle, refreshToken: string, fetch?: typeof globalThis.fetch, env?: Record<string, string | undefined> }} p
 */
export async function unTokenDeAcceso({ cliente, refreshToken, fetch = globalThis.fetch, env = process.env }) {
    const res = await fetch(lasDireccionesDeGoogle(env).token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: cliente.clientId,
            client_secret: cliente.clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });
    if (!res.ok) throw await fallo(res, "No se pudo renovar el permiso de YouTube");
    const t = await res.json();
    if (!t?.access_token) throw new ErrorDeYoutube("sin_token", "Google no devolvió un permiso de acceso.");
    return { accessToken: String(t.access_token), expiraEn: Date.now() + Number(t.expires_in ?? 3600) * 1000 };
}

/**
 * Qué canal se autorizó. `longUploadsStatus: "allowed"` es la marca de un canal
 * verificado con teléfono, que es lo que hace falta para las miniaturas
 * personalizadas.
 * @param {{ accessToken: string, fetch?: typeof globalThis.fetch, env?: Record<string, string | undefined> }} p
 */
export async function elCanalAutorizado({ accessToken, fetch = globalThis.fetch, env = process.env }) {
    const u = new URL(`${lasDireccionesDeGoogle(env).api}/channels`);
    u.searchParams.set("part", "snippet,status");
    u.searchParams.set("mine", "true");
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw await fallo(res, "No se pudo leer el canal autorizado");
    const j = await res.json();
    const canal = Array.isArray(j?.items) ? j.items[0] : null;
    if (!canal?.id) throw new ErrorDeYoutube("sin_canal", "La cuenta autorizada no tiene canal de YouTube: autoriza con la cuenta del canal de la casa.");
    return {
        id: String(canal.id),
        titulo: String(canal.snippet?.title ?? ""),
        verificado: canal.status?.longUploadsStatus === "allowed",
    };
}

/* ── La base ──────────────────────────────────────────────────────────────── */

/**
 * `youtube_canal` y `youtube_subidas` son tablas de la App, con
 * `CREATE TABLE IF NOT EXISTS` y sin clave foránea: ni una columna en `User`
 * (es del backend, el #360). Y cada DDL tolera «ya existe» (23505, 42P07,
 * 42710), porque con dos réplicas dos procesos pueden crearla a la vez.
 * @param {any} db
 * @param {string} sql
 */
async function ddl(db, sql) {
    try {
        await db.$executeRawUnsafe(sql);
    } catch (error) {
        const e = /** @type {any} */ (error);
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        if (!["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c))) throw error;
    }
}

/** @type {WeakMap<object, Promise<void>>} */
const tablasListas = new WeakMap();

/** @param {any} db */
function asegurarLasTablas(db) {
    let lista = tablasListas.get(db);
    if (!lista) {
        lista = (async () => {
            await ddl(
                db,
                `CREATE TABLE IF NOT EXISTS "youtube_canal" (
                    "id" TEXT PRIMARY KEY,
                    "cliente" TEXT,
                    "acceso" TEXT,
                    "canalId" TEXT,
                    "canalTitulo" TEXT,
                    "verificado" BOOLEAN,
                    "alcance" TEXT,
                    "conectadoPor" TEXT,
                    "conectadoEn" TIMESTAMP(3),
                    "ultimoError" TEXT,
                    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
                )`,
            );
            await ddl(
                db,
                `CREATE TABLE IF NOT EXISTS "youtube_subidas" (
                    "id" TEXT PRIMARY KEY,
                    "huella" TEXT NOT NULL,
                    "videoId" TEXT NOT NULL,
                    "canalId" TEXT,
                    "titulo" TEXT NOT NULL,
                    "publicarEn" TIMESTAMPTZ(3),
                    "miniatura" BOOLEAN NOT NULL DEFAULT FALSE,
                    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
                )`,
            );
            await ddl(db, `CREATE INDEX IF NOT EXISTS "youtube_subidas_huella_idx" ON "youtube_subidas" ("huella")`);
        })();
        // Si falla, se olvida: la vuelta siguiente lo vuelve a intentar.
        lista.catch(() => tablasListas.delete(db));
        tablasListas.set(db, lista);
    }
    return lista;
}

/**
 * Corre `fn` con las tablas creadas, y si Postgres dice que no existen (42P01:
 * alguien las borró por debajo, o se restauró la base) olvida el recuerdo, las
 * crea y lo intenta UNA vez más.
 * @template T
 * @param {any} db
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function conLasTablas(db, fn) {
    await asegurarLasTablas(db);
    try {
        return await fn();
    } catch (error) {
        const e = /** @type {any} */ (error);
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        if (codigo !== "42P01" && !String(e?.message ?? "").includes("42P01")) throw error;
        tablasListas.delete(db);
        await asegurarLasTablas(db);
        return await fn();
    }
}

/** @param {any} db */
async function laFila(db) {
    const filas = await db.$queryRawUnsafe(`SELECT * FROM "youtube_canal" WHERE "id" = $1`, FILA_DEL_CANAL);
    return Array.isArray(filas) && filas[0] ? filas[0] : null;
}

/**
 * Guarda las credenciales de Google. Si el `client_id` CAMBIA, el permiso
 * anterior se tira: un permiso permanente solo se puede renovar con el cliente
 * que lo creó, y guardarlo al lado de otro dejaría una conexión que falla en la
 * primera subida sin que se sepa por qué.
 * @param {any} db
 * @param {ClienteDeGoogle} cliente
 * @param {Record<string, string | undefined>} [env]
 */
export async function guardarElCliente(db, cliente, env = process.env) {
    return conLasTablas(db, async () => {
        const antes = await laFila(db);
        const anterior = antes ? /** @type {ClienteDeGoogle | null} */ (abrir(antes.cliente, env)) : null;
        const mismo = anterior?.clientId === cliente.clientId;
        const sellado = sellar(cliente, env);
        if (antes && mismo) {
            await db.$executeRawUnsafe(
                `UPDATE "youtube_canal" SET "cliente" = $2, "actualizadoEn" = CURRENT_TIMESTAMP WHERE "id" = $1`,
                FILA_DEL_CANAL,
                sellado,
            );
        } else {
            await db.$executeRawUnsafe(
                `INSERT INTO "youtube_canal" ("id", "cliente") VALUES ($1, $2)
                 ON CONFLICT ("id") DO UPDATE SET "cliente" = EXCLUDED."cliente", "acceso" = NULL, "canalId" = NULL,
                     "canalTitulo" = NULL, "verificado" = NULL, "alcance" = NULL, "conectadoPor" = NULL,
                     "conectadoEn" = NULL, "ultimoError" = NULL, "actualizadoEn" = CURRENT_TIMESTAMP`,
                FILA_DEL_CANAL,
                sellado,
            );
        }
        return { permisoConservado: Boolean(antes?.acceso && mismo) };
    });
}

/**
 * Guarda el permiso permanente y el canal al que da acceso.
 * @param {any} db
 * @param {{ refreshToken: string, alcance: string, canal: { id: string, titulo: string, verificado: boolean }, conectadoPor: string }} p
 * @param {Record<string, string | undefined>} [env]
 */
export async function guardarElAcceso(db, { refreshToken, alcance, canal, conectadoPor }, env = process.env) {
    return conLasTablas(db, async () => {
        const n = await db.$executeRawUnsafe(
            `UPDATE "youtube_canal" SET "acceso" = $2, "alcance" = $3, "canalId" = $4, "canalTitulo" = $5,
                 "verificado" = $6, "conectadoPor" = $7, "conectadoEn" = CURRENT_TIMESTAMP, "ultimoError" = NULL,
                 "actualizadoEn" = CURRENT_TIMESTAMP
             WHERE "id" = $1 AND "cliente" IS NOT NULL`,
            FILA_DEL_CANAL,
            sellar({ refreshToken }, env),
            alcance,
            canal.id,
            canal.titulo,
            canal.verificado,
            conectadoPor,
        );
        if (!n) throw new ErrorDeYoutube("sin_cliente", "No hay credenciales de Google guardadas para este permiso.");
    });
}

/**
 * La conexión ABIERTA: con el cliente y el permiso en claro. Solo para quien
 * va a hablar con Google desde el servidor; nunca se manda a un navegador.
 * @param {any} db
 * @param {Record<string, string | undefined>} [env]
 */
export async function leerLaConexion(db, env = process.env) {
    return conLasTablas(db, async () => {
        const fila = await laFila(db);
        if (!fila) return null;
        const cliente = /** @type {ClienteDeGoogle | null} */ (abrir(fila.cliente, env));
        const acceso = /** @type {{ refreshToken?: string } | null} */ (abrir(fila.acceso, env));
        return {
            cliente,
            refreshToken: acceso?.refreshToken ?? null,
            /** Había algo guardado que no se pudo abrir (cambió `AUTH_SECRET`). */
            sinDescifrar: Boolean((fila.cliente && !cliente) || (fila.acceso && !acceso)),
            canalId: fila.canalId ?? null,
            canalTitulo: fila.canalTitulo ?? null,
            verificado: fila.verificado ?? null,
        };
    });
}

/**
 * Cómo está la conexión, SIN secretos: es lo que se puede enseñar.
 * @param {any} db
 * @param {Record<string, string | undefined>} [env]
 */
export async function elEstadoDeLaConexion(db, env = process.env) {
    return conLasTablas(db, async () => {
        const fila = await laFila(db);
        const cliente = fila ? /** @type {ClienteDeGoogle | null} */ (abrir(fila.cliente, env)) : null;
        const acceso = fila ? /** @type {{ refreshToken?: string } | null} */ (abrir(fila.acceso, env)) : null;
        return {
            hayCliente: Boolean(cliente),
            tipo: cliente?.tipo ?? null,
            proyecto: cliente?.proyecto ?? null,
            /** Solo el final: basta para reconocerlo sin publicarlo. */
            clienteTermina: cliente ? cliente.clientId.split(".")[0].slice(-6) : null,
            vueltasRegistradas: cliente?.redirectUris ?? [],
            conectado: Boolean(acceso?.refreshToken),
            sinDescifrar: Boolean(fila && ((fila.cliente && !cliente) || (fila.acceso && !acceso))),
            canalId: fila?.canalId ?? null,
            canalTitulo: fila?.canalTitulo ?? null,
            verificado: fila?.verificado ?? null,
            alcance: fila?.alcance ?? null,
            conectadoEn: fila?.conectadoEn ? new Date(fila.conectadoEn).toISOString() : null,
            ultimoError: fila?.ultimoError ?? null,
        };
    });
}

/**
 * Deja escrito el último fallo, para que el estado diga por qué.
 * @param {any} db
 * @param {string} motivo
 */
export async function anotarElError(db, motivo) {
    return conLasTablas(db, () =>
        db.$executeRawUnsafe(
            `UPDATE "youtube_canal" SET "ultimoError" = $2, "actualizadoEn" = CURRENT_TIMESTAMP WHERE "id" = $1`,
            FILA_DEL_CANAL,
            String(motivo).slice(0, 500),
        ),
    );
}

/**
 * Un permiso de una hora para subir, con el canal al que da acceso.
 * @param {any} db
 * @param {{ fetch?: typeof globalThis.fetch, env?: Record<string, string | undefined> }} [p]
 */
export async function unPermisoParaSubir(db, { fetch = globalThis.fetch, env = process.env } = {}) {
    const conexion = await leerLaConexion(db, env);
    // Primero lo que no se puede abrir: con `AUTH_SECRET` cambiada el cliente
    // tampoco se abre, y decir «no hay credenciales» mandaría a buscar un JSON
    // que sí está guardado.
    if (conexion?.sinDescifrar) throw new ErrorDeYoutube("sin_descifrar", "El acceso guardado no se puede abrir (cambió AUTH_SECRET): hay que volver a guardar las credenciales y autorizar.");
    if (!conexion?.cliente) throw new ErrorDeYoutube("sin_cliente", "Todavía no hay credenciales de Google guardadas.");
    if (!conexion.refreshToken) throw new ErrorDeYoutube("sin_autorizar", "El canal todavía no está autorizado.");
    try {
        const { accessToken, expiraEn } = await unTokenDeAcceso({ cliente: conexion.cliente, refreshToken: conexion.refreshToken, fetch, env });
        return { accessToken, expiraEn, canalId: conexion.canalId, canalTitulo: conexion.canalTitulo, verificado: conexion.verificado };
    } catch (error) {
        if (error instanceof ErrorDeYoutube) await anotarElError(db, error.message);
        throw error;
    }
}

/**
 * Una subida ya hecha con la misma huella (el mismo video, título y fecha).
 * Es lo que impide que un reintento suba el video dos veces.
 * @param {any} db
 * @param {string} huella
 */
export async function laSubidaDeLaHuella(db, huella) {
    return conLasTablas(db, async () => {
        const filas = await db.$queryRawUnsafe(
            `SELECT "videoId", "titulo", "publicarEn", "miniatura", "canalId" FROM "youtube_subidas" WHERE "huella" = $1 ORDER BY "creadoEn" DESC LIMIT 1`,
            huella,
        );
        const f = Array.isArray(filas) ? filas[0] : null;
        return f
            ? { videoId: String(f.videoId), titulo: String(f.titulo), publicarEn: f.publicarEn ? new Date(f.publicarEn).toISOString() : null, miniatura: Boolean(f.miniatura), canalId: f.canalId ?? null }
            : null;
    });
}

/**
 * @param {any} db
 * @param {{ huella: string, videoId: string, canalId: string | null, titulo: string, publicarEn: string | null, miniatura: boolean }} s
 */
export async function anotarLaSubida(db, s) {
    return conLasTablas(db, () =>
        db.$executeRawUnsafe(
            `INSERT INTO "youtube_subidas" ("id", "huella", "videoId", "canalId", "titulo", "publicarEn", "miniatura")
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)
             ON CONFLICT ("id") DO UPDATE SET "miniatura" = EXCLUDED."miniatura"`,
            s.videoId,
            s.huella,
            s.videoId,
            s.canalId,
            String(s.titulo).slice(0, 200),
            s.publicarEn,
            s.miniatura,
        ),
    );
}

/**
 * @param {any} db
 * @param {string} videoId
 */
export async function anotarLaMiniatura(db, videoId) {
    return conLasTablas(db, () => db.$executeRawUnsafe(`UPDATE "youtube_subidas" SET "miniatura" = TRUE WHERE "id" = $1`, videoId));
}
