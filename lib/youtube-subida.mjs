// @ts-check
/**
 * Subir un video ya terminado al canal de YouTube de la casa, PROGRAMADO.
 *
 * Esto corre donde está el archivo —el entorno del agente— y no en la App: un
 * video de cientos de megas no se pasa por la API de Docker. Lo único que se le
 * pide al contenedor es un permiso de UNA hora (`unPermisoParaSubir`); el
 * permanente no sale de allí.
 *
 * # Programado = privado con fecha
 *
 * YouTube no tiene un estado «programado»: un video programado es uno
 * `private` con `publishAt`, y llegada la hora YouTube lo pasa a público solo.
 * Por eso el cuerpo SIEMPRE va en `private` y la fecha es obligatoria.
 *
 * # Lo que no depende de nosotros, y se comprueba
 *
 * Un proyecto de Google Cloud creado después del 28-07-2020 que no ha pasado la
 * auditoría de la API de YouTube sube videos que quedan **bloqueados en
 * privado**: la llamada contesta bien y el video no se publica nunca. Por eso,
 * al terminar, se vuelve a leer el video (`comoQuedo`) y se dice si quedó con
 * su fecha. Lo que no se puede leer por la API —el bloqueo— lo avisa YouTube
 * por correo al dueño del canal.
 */
import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { ErrorDeYoutube, elMotivoDeGoogle, lasDireccionesDeGoogle } from "./youtube-acceso.mjs";

/** La zona en la que se dan las fechas. Colombia no cambia de hora: siempre -05:00. */
export const ZONA_DE_LAS_FECHAS = "America/Bogota";
const DESFASE_DE_BOGOTA_MS = 5 * 3_600_000;

/**
 * Lo mínimo que tiene que faltar para la publicación. YouTube rechaza una fecha
 * pasada, y la fecha se manda al EMPEZAR la subida: con menos margen, un video
 * grande que tarde en subir llegaría con la fecha ya vencida.
 */
export const MARGEN_MINIMO_MS = 15 * 60_000;

export const TOPE_DEL_TITULO = 100;
export const TOPE_DE_LA_DESCRIPCION_BYTES = 5000;
export const TOPE_DE_LAS_ETIQUETAS = 500;
export const TOPE_DE_LA_MINIATURA_BYTES = 2 * 1024 * 1024;
/** 22 = «Personas y blogs», la categoría por defecto de YouTube Studio. */
export const CATEGORIA_POR_DEFECTO = "22";

/** Un trozo de la subida: múltiplo de 256 KiB, como pide la subida reanudable. */
export const TROZO_DE_SUBIDA = 8 * 1024 * 1024;
const MULTIPLO_DEL_TROZO = 256 * 1024;
/** Fallos SEGUIDOS (red, 5xx) que se aguantan antes de rendirse. */
export const REINTENTOS_DE_SUBIDA = 8;

/**
 * @template T
 * @typedef {{ ok: true, valor: T } | { ok: false, motivo: string }} Resultado
 */

/* ── La fecha ─────────────────────────────────────────────────────────────── */

/**
 * La hora de publicar, dada en la hora de Colombia («2026-10-10 18:00» o
 * «10/10/2026 18:00»), o con su desfase escrito («…T18:00:00-05:00», «…Z»).
 * Devuelve el instante en UTC, que es lo que pide YouTube.
 * @param {string} texto
 * @param {number} [ahora]
 * @returns {Resultado<{ iso: string, legible: string }>}
 */
export function laHoraDePublicar(texto, ahora = Date.now()) {
    const t = String(texto ?? "").trim();
    if (!t) return { ok: false, motivo: "Falta la fecha y hora de publicación." };

    /** @type {number | null} */
    let ms = null;
    const conDesfase = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(t);
    const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    const latina = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})$/.exec(t);
    if (conDesfase) {
        const [, a, m, d, h, mi] = conDesfase.map(Number);
        if (!esFechaReal(a, m, d, h, mi)) return { ok: false, motivo: `«${t}» no es una fecha que exista.` };
        ms = Date.parse(t);
    } else if (iso || latina) {
        const [a, m, d, h, mi, s] = iso
            ? [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6] ?? "0"].map(Number)
            : [latina?.[3], latina?.[2], latina?.[1], latina?.[4], latina?.[5], "0"].map(Number);
        if (!esFechaReal(a, m, d, h, mi) || s > 59) return { ok: false, motivo: `«${t}» no es una fecha que exista.` };
        ms = Date.UTC(a, m - 1, d, h, mi, s) + DESFASE_DE_BOGOTA_MS;
    } else {
        return { ok: false, motivo: `No entiendo la fecha «${t}». Escríbela así: 2026-10-10 18:00 (hora de Colombia).` };
    }
    if (!Number.isFinite(ms)) return { ok: false, motivo: `«${t}» no es una fecha válida.` };
    if (ms < ahora + MARGEN_MINIMO_MS) {
        return { ok: false, motivo: `La publicación tiene que ser al menos ${MARGEN_MINIMO_MS / 60_000} minutos en el futuro (${laHoraLegible(new Date(ms).toISOString())} ya pasó o está muy cerca).` };
    }
    const instante = new Date(ms).toISOString();
    return { ok: true, valor: { iso: instante, legible: laHoraLegible(instante) } };
}

/** @param {number} a @param {number} m @param {number} d @param {number} h @param {number} mi */
function esFechaReal(a, m, d, h, mi) {
    if (m < 1 || m > 12 || d < 1 || h > 23 || mi > 59) return false;
    const f = new Date(Date.UTC(a, m - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Un instante, en la hora de Colombia y en palabras.
 * @param {string} iso
 */
export function laHoraLegible(iso) {
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: ZONA_DE_LAS_FECHAS,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso)) + " (hora de Colombia)";
}

/* ── El título, la descripción, las etiquetas ─────────────────────────────── */

/**
 * @param {string} texto
 * @returns {Resultado<string>}
 */
export function elTitulo(texto) {
    const t = String(texto ?? "").replace(/\s+/g, " ").trim();
    if (!t) return { ok: false, motivo: "Falta el título." };
    if (/[<>]/.test(t)) return { ok: false, motivo: "YouTube no admite los signos < ni > en el título." };
    const largo = [...t].length;
    if (largo > TOPE_DEL_TITULO) return { ok: false, motivo: `El título tiene ${largo} caracteres y YouTube admite ${TOPE_DEL_TITULO}.` };
    return { ok: true, valor: t };
}

/**
 * @param {string} texto
 * @returns {Resultado<string>}
 */
export function laDescripcion(texto) {
    const d = String(texto ?? "").replace(/\r\n?/g, "\n").trim();
    if (/[<>]/.test(d)) return { ok: false, motivo: "YouTube no admite los signos < ni > en la descripción." };
    const bytes = Buffer.byteLength(d, "utf8");
    if (bytes > TOPE_DE_LA_DESCRIPCION_BYTES) {
        return { ok: false, motivo: `La descripción ocupa ${bytes} bytes y YouTube admite ${TOPE_DE_LA_DESCRIPCION_BYTES}.` };
    }
    return { ok: true, valor: d };
}

/**
 * Las etiquetas, separadas por comas. YouTube cuenta 500 caracteres EN TOTAL,
 * y una etiqueta con espacios cuenta dos más (las comillas que le pone).
 * @param {string | string[] | undefined} entrada
 * @returns {Resultado<string[]>}
 */
export function lasEtiquetas(entrada) {
    const lista = (Array.isArray(entrada) ? entrada : String(entrada ?? "").split(","))
        .map((e) => String(e).replace(/\s+/g, " ").trim().replace(/^#/, ""))
        .filter(Boolean);
    // Se queda la PRIMERA forma de cada etiqueta: «Verzay, verzay» es una sola.
    const vistas = new Set();
    const unicas = lista.filter((e) => {
        const k = e.toLowerCase();
        if (vistas.has(k)) return false;
        vistas.add(k);
        return true;
    });
    if (unicas.some((e) => /[<>]/.test(e))) return { ok: false, motivo: "YouTube no admite < ni > en las etiquetas." };
    const total = unicas.reduce((s, e) => s + [...e].length + (e.includes(" ") ? 2 : 0), 0) + Math.max(0, unicas.length - 1);
    if (total > TOPE_DE_LAS_ETIQUETAS) return { ok: false, motivo: `Las etiquetas suman ${total} caracteres y YouTube admite ${TOPE_DE_LAS_ETIQUETAS}.` };
    return { ok: true, valor: unicas };
}

/**
 * @param {string | undefined} entrada
 * @returns {Resultado<string>}
 */
export function laCategoria(entrada) {
    const c = String(entrada ?? "").trim() || CATEGORIA_POR_DEFECTO;
    if (!/^\d{1,2}$/.test(c)) return { ok: false, motivo: `«${c}» no es un número de categoría de YouTube (22 = Personas y blogs, 27 = Educación, 28 = Ciencia y tecnología).` };
    return { ok: true, valor: c };
}

/* ── Los archivos ─────────────────────────────────────────────────────────── */

const TIPOS_DE_VIDEO = /** @type {Record<string, string>} */ ({
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mpeg: "video/mpeg",
    mpg: "video/mpeg",
});

/**
 * @param {string} nombre
 * @param {number} tamano
 * @returns {Resultado<{ tipo: string, tamano: number }>}
 */
export function elVideo(nombre, tamano) {
    const ext = String(nombre).toLowerCase().split(".").pop() ?? "";
    const tipo = TIPOS_DE_VIDEO[ext];
    if (!tipo) return { ok: false, motivo: `«${nombre}» no parece un video (mp4, mov, webm, mkv, avi o mpeg).` };
    if (!(tamano > 0)) return { ok: false, motivo: `«${nombre}» está vacío.` };
    return { ok: true, valor: { tipo, tamano } };
}

/**
 * La miniatura: JPG o PNG de hasta 2 MB. El tipo se lee de los primeros bytes,
 * no del nombre: un `.jpg` que por dentro es otra cosa lo rechazaría YouTube.
 * @param {Uint8Array} bytes
 * @returns {Resultado<{ tipo: string }>}
 */
export function laMiniatura(bytes) {
    const b = Buffer.from(bytes ?? []);
    if (!b.length) return { ok: false, motivo: "La miniatura está vacía." };
    const tipo = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg" : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" : null;
    if (!tipo) return { ok: false, motivo: "La miniatura tiene que ser JPG o PNG." };
    if (b.length > TOPE_DE_LA_MINIATURA_BYTES) {
        return { ok: false, motivo: `La miniatura pesa ${(b.length / 1048576).toFixed(1)} MB y YouTube admite 2 MB.` };
    }
    return { ok: true, valor: { tipo } };
}

/* ── El cuerpo del video ──────────────────────────────────────────────────── */

/**
 * @param {{ titulo: string, descripcion: string, etiquetas: string[], categoria: string, publicarEn: string }} p
 */
export function elCuerpoDelVideo({ titulo, descripcion, etiquetas, categoria, publicarEn }) {
    return {
        snippet: {
            title: titulo,
            description: descripcion,
            ...(etiquetas.length ? { tags: etiquetas } : {}),
            categoryId: categoria,
            defaultLanguage: "es",
            defaultAudioLanguage: "es",
        },
        status: {
            privacyStatus: "private",
            publishAt: publicarEn,
            selfDeclaredMadeForKids: false,
            license: "youtube",
            embeddable: true,
        },
    };
}

/**
 * Lo que identifica una subida: el MISMO archivo, con el mismo título y la
 * misma fecha. Es lo que deja reintentar sin subir el video dos veces.
 * @param {{ videoSha256: string, titulo: string, publicarEn: string }} p
 */
export function laHuellaDeLaSubida({ videoSha256, titulo, publicarEn }) {
    return createHash("sha256").update(`${videoSha256}\n${titulo}\n${publicarEn}`).digest("hex");
}

/** @param {string} ruta */
export async function laHuellaDelArchivo(ruta) {
    const hash = createHash("sha256");
    const fh = await open(ruta, "r");
    try {
        const buf = Buffer.alloc(4 * 1024 * 1024);
        for (;;) {
            const { bytesRead } = await fh.read(buf, 0, buf.length, null);
            if (!bytesRead) break;
            hash.update(buf.subarray(0, bytesRead));
        }
    } finally {
        await fh.close();
    }
    return hash.digest("hex");
}

/* ── Hablar con Google ────────────────────────────────────────────────────── */

/**
 * @param {Response} res
 * @param {string} contexto
 */
async function elFallo(res, contexto) {
    let cuerpo = null;
    try {
        cuerpo = await res.json();
    } catch {
        // Sin JSON se traduce por el código HTTP.
    }
    const { codigo, motivo } = elMotivoDeGoogle(res.status, cuerpo);
    return new ErrorDeYoutube(codigo, `${contexto}: ${motivo}`);
}

const PASAJEROS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * La subida REANUDABLE: se abre una sesión con los datos del video y el
 * archivo se manda por trozos. Si se corta la red o Google contesta 5xx, se
 * pregunta por dónde iba (`bytes *\/total`) y se sigue desde ahí; si el permiso
 * de una hora caduca a mitad (401), se pide otro y se sigue.
 *
 * @param {{
 *   ruta: string,
 *   tipo: string,
 *   cuerpo: object,
 *   pedirToken: () => Promise<string>,
 *   fetch?: typeof globalThis.fetch,
 *   env?: Record<string, string | undefined>,
 *   trozo?: number,
 *   esperar?: (ms: number) => Promise<void>,
 *   alAvanzar?: (subidos: number, total: number) => void,
 *   avisarSubidas?: boolean,
 * }} p
 * @returns {Promise<any>} El video que devuelve YouTube.
 */
export async function subirElVideo({
    ruta,
    tipo,
    cuerpo,
    pedirToken,
    fetch = globalThis.fetch,
    env = process.env,
    trozo = TROZO_DE_SUBIDA,
    esperar = (ms) => new Promise((r) => setTimeout(r, ms)),
    alAvanzar = () => {},
    avisarSubidas = true,
}) {
    if (trozo % MULTIPLO_DEL_TROZO !== 0) throw new Error(`El trozo de subida tiene que ser múltiplo de ${MULTIPLO_DEL_TROZO} bytes.`);
    const total = (await stat(ruta)).size;
    let token = await pedirToken();

    const inicio = new URL(`${lasDireccionesDeGoogle(env).subir}/videos`);
    inicio.searchParams.set("uploadType", "resumable");
    inicio.searchParams.set("part", "snippet,status");
    inicio.searchParams.set("notifySubscribers", String(avisarSubidas));
    const abierta = await fetch(inicio, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": String(total),
            "X-Upload-Content-Type": tipo,
        },
        body: JSON.stringify(cuerpo),
    });
    if (!abierta.ok) throw await elFallo(abierta, "YouTube no aceptó los datos del video");
    const sesion = abierta.headers.get("location");
    if (!sesion) throw new ErrorDeYoutube("sin_sesion_de_subida", "YouTube no devolvió dónde subir el archivo.");

    const fh = await open(ruta, "r");
    try {
        let desde = 0;
        let fallosSeguidos = 0;
        const buf = Buffer.alloc(Math.min(trozo, Math.max(total, 1)));
        /** @type {Response | null} */
        let res = null;

        /** Pregunta por dónde iba la subida. Devuelve el video si ya terminó. */
        const porDondeIba = async () => {
            const r = await fetch(sesion, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Range": `bytes */${total}`, "Content-Length": "0" } });
            return r;
        };

        for (;;) {
            if (desde >= total && total > 0) {
                // Todo enviado pero sin la respuesta final: se pregunta.
                res = await porDondeIba();
            } else {
                const cuantos = Math.min(trozo, total - desde);
                const { bytesRead } = await fh.read(buf, 0, cuantos, desde);
                const fin = desde + bytesRead - 1;
                try {
                    res = await fetch(sesion, {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Length": String(bytesRead),
                            "Content-Range": `bytes ${desde}-${fin}/${total}`,
                        },
                        body: buf.subarray(0, bytesRead),
                    });
                } catch {
                    res = null;
                }
            }

            if (res && (res.status === 200 || res.status === 201)) {
                alAvanzar(total, total);
                return await res.json();
            }
            if (res && res.status === 308) {
                const rango = res.headers.get("range");
                const ultimo = rango ? Number(/bytes=0-(\d+)/.exec(rango)?.[1] ?? -1) : -1;
                desde = ultimo + 1;
                fallosSeguidos = 0;
                alAvanzar(desde, total);
                continue;
            }
            if (res && res.status === 401) {
                // El permiso de una hora caducó a mitad: otro, y se pregunta por dónde iba.
                token = await pedirToken();
            } else if (res && !PASAJEROS.has(res.status)) {
                throw await elFallo(res, "YouTube cortó la subida");
            }
            fallosSeguidos += 1;
            if (fallosSeguidos > REINTENTOS_DE_SUBIDA) {
                throw new ErrorDeYoutube("subida_cortada", `La subida se cortó ${REINTENTOS_DE_SUBIDA} veces seguidas; vuelve a lanzarla y seguirá donde pueda.`);
            }
            await esperar(Math.min(32_000, 1000 * 2 ** (fallosSeguidos - 1)));
            // Después de un corte, Google dice cuánto le llegó.
            let r = null;
            try {
                r = await porDondeIba();
            } catch {
                continue;
            }
            if (r.status === 200 || r.status === 201) {
                alAvanzar(total, total);
                return await r.json();
            }
            if (r.status === 308) {
                const rango = r.headers.get("range");
                desde = rango ? Number(/bytes=0-(\d+)/.exec(rango)?.[1] ?? -1) + 1 : 0;
                alAvanzar(desde, total);
            } else if (r.status === 404 || r.status === 410) {
                throw new ErrorDeYoutube("sesion_perdida", "YouTube perdió la sesión de esta subida: vuelve a lanzarla.");
            } else if (r.status === 401) {
                token = await pedirToken();
            }
        }
    } finally {
        await fh.close();
    }
}

/**
 * Pone la miniatura. Va aparte del video, y si falla el video SIGUE subido y
 * programado: se reintenta solo la miniatura.
 * @param {{ videoId: string, bytes: Uint8Array, tipo: string, token: string, fetch?: typeof globalThis.fetch, env?: Record<string, string | undefined> }} p
 */
export async function ponerLaMiniatura({ videoId, bytes, tipo, token, fetch = globalThis.fetch, env = process.env }) {
    const u = new URL(`${lasDireccionesDeGoogle(env).subir}/thumbnails/set`);
    u.searchParams.set("videoId", videoId);
    u.searchParams.set("uploadType", "media");
    const res = await fetch(u, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": tipo, "Content-Length": String(bytes.length) },
        body: Buffer.from(bytes),
    });
    if (!res.ok) throw await elFallo(res, "YouTube no aceptó la miniatura");
}

/**
 * @param {{ videoId: string, token: string, fetch?: typeof globalThis.fetch, env?: Record<string, string | undefined> }} p
 */
export async function elVideoSubido({ videoId, token, fetch = globalThis.fetch, env = process.env }) {
    const u = new URL(`${lasDireccionesDeGoogle(env).api}/videos`);
    u.searchParams.set("part", "status,snippet");
    u.searchParams.set("id", videoId);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw await elFallo(res, "No se pudo leer el video subido");
    const j = await res.json();
    return Array.isArray(j?.items) ? j.items[0] ?? null : null;
}

/**
 * Cómo quedó el video: lo que se le pidió contra lo que YouTube dice.
 * @param {any} video
 * @param {string} publicarEn
 * @returns {{ estado: "programado" | "sin_programar" | "otra_hora" | "rechazado" | "no_encontrado", motivo: string }}
 */
export function comoQuedo(video, publicarEn) {
    if (!video) return { estado: "no_encontrado", motivo: "YouTube no devuelve el video recién subido." };
    const s = video.status ?? {};
    if (s.uploadStatus === "rejected" || s.uploadStatus === "failed") {
        return { estado: "rechazado", motivo: `YouTube rechazó el video (${s.rejectionReason || s.failureReason || s.uploadStatus}).` };
    }
    if (!s.publishAt || s.privacyStatus !== "private") {
        return {
            estado: "sin_programar",
            motivo:
                "YouTube dejó el video sin fecha de publicación. Es lo que pasa cuando el proyecto de Google Cloud no ha pasado la auditoría de la API de YouTube: " +
                "los videos que sube una app sin auditar quedan bloqueados en privado. Se publica a mano desde YouTube Studio, o se pide la auditoría.",
        };
    }
    if (Math.abs(Date.parse(s.publishAt) - Date.parse(publicarEn)) > 60_000) {
        return { estado: "otra_hora", motivo: `YouTube lo programó para ${laHoraLegible(s.publishAt)}, no para la hora pedida.` };
    }
    return { estado: "programado", motivo: `Programado para ${laHoraLegible(s.publishAt)}.` };
}
