// Google de mentira para el banco de YouTube: la pantalla de permisos, el
// cambio de código por permiso, el canal, la subida REANUDABLE, la miniatura y
// la lectura del video. Contesta con la forma de Google de verdad —los mismos
// códigos (200/308/401/503), las mismas cabeceras (`Location`, `Range`) y los
// mismos cuerpos de error— para que lo que se prueba sea el código de la
// plataforma y no un atajo.
//
// Se le pueden pedir averías: cortar un trozo a medias con un 503, caducar el
// permiso de una hora a mitad de la subida, rechazar la miniatura (canal sin
// verificar), olvidar la fecha (proyecto sin auditar) o retirar el permiso
// permanente (`invalid_grant`).
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

export const PERMISOS = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

/**
 * @param {{ clientId: string, clientSecret: string }} cliente
 */
export async function levantarGoogleFalso(cliente) {
    const g = {
        cliente,
        /** @type {Map<string, { redirectUri: string, scope: string }>} */
        codigos: new Map(),
        refreshToken: `1//rt-${randomBytes(12).toString("hex")}`,
        refreshRetirado: false,
        /** @type {Set<string>} */
        tokens: new Set(),
        /** @type {Set<string>} */
        caducados: new Set(),
        tokensEmitidos: 0,
        /** @type {Map<string, { total: number, recibido: Buffer, cuerpo: any, avisar: string, tipo: string }>} */
        sesiones: new Map(),
        /** @type {Map<string, any>} */
        videos: new Map(),
        /** @type {Map<string, { tipo: string, bytes: Buffer }>} */
        miniaturas: new Map(),
        trozosRecibidos: 0,
        aperturas: 0,
        // Averías
        cortarEnElTrozo: 0,
        caducarDespuesDelTrozo: 0,
        miniaturaProhibida: false,
        sinAuditar: false,
        /** El nombre del canal: se puede cambiar para probar que la página lo escapa. */
        tituloDelCanal: "Verzay",
        /** @type {string[]} */
        registro: [],
    };

    const json = (res, estado, cuerpo, extra = {}) => {
        res.writeHead(estado, { "Content-Type": "application/json; charset=UTF-8", ...extra });
        res.end(JSON.stringify(cuerpo));
    };
    const errorApi = (res, estado, reason, message) => json(res, estado, { error: { code: estado, message, errors: [{ reason, message }] } });
    const leer = (req) =>
        new Promise((resolve) => {
            const partes = [];
            req.on("data", (d) => partes.push(d));
            req.on("end", () => resolve(Buffer.concat(partes)));
        });
    const elToken = (req) => String(req.headers.authorization ?? "").replace(/^Bearer /, "");
    const autorizado = (req, res) => {
        const t = elToken(req);
        if (!g.tokens.has(t) || g.caducados.has(t)) {
            errorApi(res, 401, "authError", "Invalid Credentials");
            return false;
        }
        return true;
    };
    const elVideoDe = (sesion, id) => ({
        kind: "youtube#video",
        id,
        snippet: { ...sesion.cuerpo.snippet, channelId: "UCverzay" },
        status: {
            uploadStatus: "uploaded",
            privacyStatus: sesion.cuerpo.status?.privacyStatus,
            // Un proyecto sin auditar: YouTube deja el video en privado y SIN fecha.
            ...(g.sinAuditar ? {} : sesion.cuerpo.status?.publishAt ? { publishAt: sesion.cuerpo.status.publishAt } : {}),
            selfDeclaredMadeForKids: sesion.cuerpo.status?.selfDeclaredMadeForKids,
        },
    });

    const servidor = createServer(async (req, res) => {
        const u = new URL(req.url ?? "/", "http://google.falso");
        g.registro.push(`${req.method} ${u.pathname}`);
        try {
            // ── La pantalla de permisos: «acepta» y vuelve con un código ──
            if (req.method === "GET" && u.pathname === "/o/oauth2/v2/auth") {
                const p = u.searchParams;
                const fallos = [];
                if (p.get("client_id") !== g.cliente.clientId) fallos.push("client_id");
                if (p.get("response_type") !== "code") fallos.push("response_type");
                if (p.get("access_type") !== "offline") fallos.push("access_type");
                if (!String(p.get("prompt")).split(" ").includes("consent")) fallos.push("prompt");
                const scope = String(p.get("scope") ?? "");
                if (scope.split(" ").sort().join(" ") !== [...PERMISOS].sort().join(" ")) fallos.push("scope");
                if (!p.get("state")) fallos.push("state");
                if (!p.get("redirect_uri")) fallos.push("redirect_uri");
                if (fallos.length) return json(res, 400, { error: "invalid_request", error_description: fallos.join(",") });
                const codigo = `4/${randomBytes(10).toString("hex")}`;
                g.codigos.set(codigo, { redirectUri: String(p.get("redirect_uri")), scope });
                const vuelta = new URL(String(p.get("redirect_uri")));
                vuelta.searchParams.set("state", String(p.get("state")));
                vuelta.searchParams.set("code", codigo);
                vuelta.searchParams.set("scope", scope);
                res.writeHead(302, { Location: vuelta.toString() });
                return res.end();
            }

            // ── El token ──
            if (req.method === "POST" && u.pathname === "/token") {
                const f = new URLSearchParams((await leer(req)).toString("utf8"));
                if (f.get("client_id") !== g.cliente.clientId || f.get("client_secret") !== g.cliente.clientSecret) {
                    return json(res, 401, { error: "invalid_client", error_description: "The OAuth client was not found." });
                }
                const nuevo = () => {
                    const t = `ya29.acc-${++g.tokensEmitidos}`;
                    g.tokens.add(t);
                    return t;
                };
                if (f.get("grant_type") === "authorization_code") {
                    const c = g.codigos.get(String(f.get("code")));
                    if (!c) return json(res, 400, { error: "invalid_grant", error_description: "Malformed auth code." });
                    if (c.redirectUri !== f.get("redirect_uri")) return json(res, 400, { error: "redirect_uri_mismatch", error_description: "Bad Request" });
                    g.codigos.delete(String(f.get("code")));
                    return json(res, 200, { access_token: nuevo(), expires_in: 3599, refresh_token: g.refreshToken, scope: c.scope, token_type: "Bearer" });
                }
                if (f.get("grant_type") === "refresh_token") {
                    if (f.get("refresh_token") !== g.refreshToken || g.refreshRetirado) {
                        return json(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
                    }
                    return json(res, 200, { access_token: nuevo(), expires_in: 3599, scope: PERMISOS.join(" "), token_type: "Bearer" });
                }
                return json(res, 400, { error: "unsupported_grant_type" });
            }

            // ── El canal ──
            if (req.method === "GET" && u.pathname === "/youtube/v3/channels") {
                if (!autorizado(req, res)) return;
                return json(res, 200, { items: [{ id: "UCverzay", snippet: { title: g.tituloDelCanal }, status: { longUploadsStatus: g.miniaturaProhibida ? "eligible" : "allowed" } }] });
            }

            // ── Abrir la subida reanudable ──
            if (req.method === "POST" && u.pathname === "/upload/youtube/v3/videos") {
                if (!autorizado(req, res)) return;
                if (u.searchParams.get("uploadType") !== "resumable") return errorApi(res, 400, "badRequest", "uploadType");
                const cuerpo = JSON.parse((await leer(req)).toString("utf8"));
                const total = Number(req.headers["x-upload-content-length"]);
                const id = String(++g.aperturas);
                g.sesiones.set(id, {
                    total,
                    recibido: Buffer.alloc(0),
                    cuerpo,
                    avisar: String(u.searchParams.get("notifySubscribers")),
                    tipo: String(req.headers["x-upload-content-type"] ?? ""),
                });
                res.writeHead(200, { Location: `http://${req.headers.host}/upload/sesion/${id}?upload_id=${id}` });
                return res.end();
            }

            // ── Mandar un trozo, o preguntar por dónde iba ──
            if (req.method === "PUT" && u.pathname.startsWith("/upload/sesion/")) {
                const id = u.pathname.split("/").pop();
                const s = g.sesiones.get(String(id));
                const cuerpo = await leer(req);
                if (!s) return errorApi(res, 404, "notFound", "Upload session not found");
                if (!autorizado(req, res)) return;
                const rango = String(req.headers["content-range"] ?? "");
                const rangoDe = () => (s.recibido.length ? { Range: `bytes=0-${s.recibido.length - 1}` } : {});
                const terminar = () => {
                    const videoId = `vid${id}${createHash("sha1").update(s.recibido).digest("hex").slice(0, 6)}`;
                    const v = elVideoDe(s, videoId);
                    g.videos.set(videoId, { ...v, sha256: createHash("sha256").update(s.recibido).digest("hex"), sesion: s });
                    return json(res, 200, v);
                };
                if (/^bytes \*\/\d+$/.test(rango)) {
                    if (s.recibido.length === s.total) return terminar();
                    res.writeHead(308, rangoDe());
                    return res.end();
                }
                const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(rango);
                if (!m) return errorApi(res, 400, "badRequest", "Content-Range");
                const [desde, hasta] = [Number(m[1]), Number(m[2])];
                if (desde !== s.recibido.length || hasta - desde + 1 !== cuerpo.length) return errorApi(res, 400, "badRequest", "offset");
                g.trozosRecibidos += 1;
                if (g.cortarEnElTrozo && g.trozosRecibidos === g.cortarEnElTrozo) {
                    // Llega la mitad alineada a 256 KiB, y la conexión «se cae».
                    const media = Math.floor(cuerpo.length / 2 / 262144) * 262144;
                    s.recibido = Buffer.concat([s.recibido, cuerpo.subarray(0, media)]);
                    return errorApi(res, 503, "backendError", "Backend Error");
                }
                s.recibido = Buffer.concat([s.recibido, cuerpo]);
                if (g.caducarDespuesDelTrozo && g.trozosRecibidos === g.caducarDespuesDelTrozo) {
                    g.caducados.add(elToken(req));
                }
                if (s.recibido.length === s.total) return terminar();
                res.writeHead(308, rangoDe());
                return res.end();
            }

            // ── La miniatura ──
            if (req.method === "POST" && u.pathname === "/upload/youtube/v3/thumbnails/set") {
                if (!autorizado(req, res)) return;
                const bytes = await leer(req);
                if (g.miniaturaProhibida) {
                    return errorApi(res, 403, "forbidden", "The authenticated user doesn't have permissions to upload and set custom video thumbnails.");
                }
                const videoId = String(u.searchParams.get("videoId"));
                if (!g.videos.has(videoId)) return errorApi(res, 404, "videoNotFound", "Video not found");
                g.miniaturas.set(videoId, { tipo: String(req.headers["content-type"]), bytes });
                return json(res, 200, { items: [{ default: { url: "https://i.ytimg.com/x.jpg" } }] });
            }

            // ── Leer el video ──
            if (req.method === "GET" && u.pathname === "/youtube/v3/videos") {
                if (!autorizado(req, res)) return;
                const v = g.videos.get(String(u.searchParams.get("id")));
                if (!v) return json(res, 200, { items: [] });
                const { sha256, sesion, ...video } = v;
                return json(res, 200, { items: [video] });
            }

            return errorApi(res, 404, "notFound", `${req.method} ${u.pathname}`);
        } catch (e) {
            return errorApi(res, 500, "backendError", String(e));
        }
    });
    await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
    const direccion = servidor.address();
    const url = `http://127.0.0.1:${typeof direccion === "object" && direccion ? direccion.port : 0}`;
    return { url, g, cerrar: () => new Promise((r) => servidor.close(r)) };
}

/** Un JPEG mínimo de verdad (cabecera y cola), con relleno hasta `tamano`. */
export function unJpeg(tamano = 4096) {
    const b = Buffer.alloc(tamano, 0x20);
    b.set([0xff, 0xd8, 0xff, 0xe0], 0);
    b.set([0xff, 0xd9], tamano - 2);
    return b;
}
