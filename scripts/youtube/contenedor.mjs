/**
 * Corre una orden de YouTube DENTRO del contenedor de la App, que es donde
 * están la base, `AUTH_SECRET` y la red hacia Google.
 *
 * Por qué ahí y no aquí: el permiso permanente del canal está sellado con una
 * llave que sale de `AUTH_SECRET`, y esa variable no sale del contenedor. Así
 * que lo que se manda es el CÓDIGO (`lib/youtube-acceso.mjs`, tal cual, por una
 * dirección `data:`) y lo que vuelve es el resultado: un estado sin secretos, o
 * un permiso de UNA hora para subir. El permanente nunca viaja.
 *
 * Mismo camino que `scripts/sintetizar-en-el-contenedor.mjs`: la API de Docker
 * que expone Portainer (`PORTAINER_URL` + `PORTAINER_TOKEN`).
 *
 * Con `YOUTUBE_CONTENEDOR=local` la orden corre en un `node` de aquí, contra la
 * base y la `AUTH_SECRET` del entorno: es lo que usa el banco para ejercer el
 * MISMO conductor sin Portainer.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SERVICIO_DE_LA_APP = "agente-app_verzay_app";
const MARCA = "@@YOUTUBE@@";

/**
 * El conductor: carga el módulo de acceso, abre Prisma con el de la App y
 * ejecuta UNA orden. Imprime una sola línea con la marca y el resultado en
 * JSON; lo demás que salga (avisos de Prisma) se ignora.
 */
const CONDUCTOR = `
import { createRequire } from "node:module";
import path from "node:path";
const MARCA = ${JSON.stringify(MARCA)};
const decir = (x) => process.stdout.write("\\n" + MARCA + JSON.stringify(x) + "\\n");
const require = createRequire(path.join(process.cwd(), "conductor-youtube.cjs"));
let db = null;
try {
  const m = await import("data:text/javascript;base64," + process.env.YT_MODULO);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
  const datos = JSON.parse(Buffer.from(process.env.YT_DATOS || "e30=", "base64").toString("utf8"));
  let r;
  switch (process.env.YT_ORDEN) {
    case "estado":
      r = { ok: true, estado: await m.elEstadoDeLaConexion(db) };
      break;
    case "guardar-cliente": {
      const l = m.leerElCliente(datos.cliente);
      if (!l.ok) { r = { ok: false, codigo: "cliente_invalido", motivo: l.motivo }; break; }
      const g = await m.guardarElCliente(db, l.cliente);
      r = { ok: true, ...g, estado: await m.elEstadoDeLaConexion(db) };
      break;
    }
    case "enlace": {
      const c = await m.leerLaConexion(db);
      if (!c || !c.cliente) { r = { ok: false, codigo: "sin_cliente", motivo: "Todavía no hay credenciales de Google guardadas." }; break; }
      const vuelta = m.laVuelta(c.cliente, datos.origen);
      const estado = m.firmarElEstado({ personaId: "agente", nonce: m.unNonce(), via: "pegado", exp: Date.now() + m.VIGENCIA_DEL_VIAJE_MS });
      r = { ok: true, tipo: c.cliente.tipo, vuelta, enlace: m.elEnlaceDeAutorizacion({ cliente: c.cliente, vuelta, estado }) };
      break;
    }
    case "terminar": {
      const c = await m.leerLaConexion(db);
      if (!c || !c.cliente) { r = { ok: false, codigo: "sin_cliente", motivo: "Todavía no hay credenciales de Google guardadas." }; break; }
      let u;
      try { u = new URL(String(datos.direccion || "").trim()); } catch { r = { ok: false, codigo: "direccion_invalida", motivo: "Eso no es una dirección completa: pega la de la barra del navegador entera." }; break; }
      if (u.searchParams.get("error")) { r = { ok: false, codigo: "cancelado", motivo: "Se canceló la autorización en Google." }; break; }
      const estado = m.leerElEstado(u.searchParams.get("state"));
      const codigo = u.searchParams.get("code");
      if (!estado || estado.via !== "pegado" || !codigo) { r = { ok: false, codigo: "estado_invalido", motivo: "La dirección no es de un enlace de autorización vigente: pide uno nuevo." }; break; }
      const vuelta = m.laVuelta(c.cliente, datos.origen);
      const t = await m.cambiarElCodigo({ cliente: c.cliente, codigo, vuelta });
      const canal = await m.elCanalAutorizado({ accessToken: t.accessToken });
      await m.guardarElAcceso(db, { refreshToken: t.refreshToken, alcance: t.alcance, canal, conectadoPor: "agente" });
      r = { ok: true, canal };
      break;
    }
    case "token": {
      const p = await m.unPermisoParaSubir(db);
      r = { ok: true, ...p };
      break;
    }
    case "canal": {
      const p = await m.unPermisoParaSubir(db);
      const canal = await m.elCanalAutorizado({ accessToken: p.accessToken });
      r = { ok: true, canal };
      break;
    }
    case "buscar-subida":
      r = { ok: true, subida: await m.laSubidaDeLaHuella(db, String(datos.huella)) };
      break;
    case "anotar-subida":
      await m.anotarLaSubida(db, datos.subida);
      r = { ok: true };
      break;
    case "anotar-miniatura":
      await m.anotarLaMiniatura(db, String(datos.videoId));
      r = { ok: true };
      break;
    case "anotar-error":
      await m.anotarElError(db, String(datos.motivo));
      r = { ok: true };
      break;
    default:
      r = { ok: false, codigo: "orden_desconocida", motivo: "Orden desconocida: " + process.env.YT_ORDEN };
  }
  decir(r);
} catch (e) {
  decir({ ok: false, codigo: (e && e.codigo) || "error", motivo: String((e && e.message) || e).slice(0, 600) });
} finally {
  if (db) await db.$disconnect().catch(() => {});
}
`;

function elModulo() {
    return readFileSync(path.join(RAIZ, "lib", "youtube-acceso.mjs")).toString("base64");
}

/** @param {string} salida */
function leerLaRespuesta(salida) {
    const linea = salida
        .replace(/\r/g, "")
        .split("\n")
        .reverse()
        .find((l) => l.startsWith(MARCA));
    if (!linea) {
        throw new Error(`[youtube] el contenedor no contestó con un resultado. Salida:\n${salida.slice(-800)}`);
    }
    return JSON.parse(linea.slice(MARCA.length));
}

/**
 * @param {string} orden
 * @param {Record<string, unknown>} [datos]
 * @returns {Promise<any>}
 */
export async function enElContenedor(orden, datos = {}) {
    const env = [
        `YT_ORDEN=${orden}`,
        `YT_DATOS=${Buffer.from(JSON.stringify(datos)).toString("base64")}`,
        `YT_MODULO=${elModulo()}`,
    ];
    if (process.env.YOUTUBE_CONTENEDOR === "local") return enLocal(env);
    return enPortainer(env);
}

/** @param {string[]} env */
function enLocal(env) {
    return new Promise((resolve, reject) => {
        const extra = Object.fromEntries(env.map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]));
        const hijo = spawn(process.execPath, ["--input-type=module", "-e", CONDUCTOR], {
            cwd: RAIZ,
            env: { ...process.env, ...extra },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let salida = "";
        hijo.stdout.on("data", (d) => (salida += d));
        hijo.stderr.on("data", (d) => (salida += d));
        hijo.on("error", reject);
        hijo.on("close", () => {
            try {
                resolve(leerLaRespuesta(salida));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/** @param {string[]} env */
async function enPortainer(env) {
    const url = process.env.PORTAINER_URL;
    const token = process.env.PORTAINER_TOKEN;
    if (!url || !token) throw new Error("[youtube] faltan PORTAINER_URL y PORTAINER_TOKEN para hablar con el contenedor de la App.");
    const api = (ruta, opciones = {}) =>
        fetch(`${url}/api/endpoints/1/docker${ruta}`, {
            ...opciones,
            headers: { "X-API-Key": token, "Content-Type": "application/json", ...(opciones.headers || {}) },
        });
    const filtro = encodeURIComponent(JSON.stringify({ service: [SERVICIO_DE_LA_APP], "desired-state": ["running"] }));
    const tareas = await (await api(`/tasks?filters=${filtro}`)).json();
    const contenedor = (Array.isArray(tareas) ? tareas : []).map((t) => t.Status?.ContainerStatus?.ContainerID).find(Boolean);
    if (!contenedor) throw new Error(`[youtube] no hay ningún contenedor corriendo de ${SERVICIO_DE_LA_APP}`);
    const exec = await (
        await api(`/containers/${contenedor}/exec`, {
            method: "POST",
            body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Env: env, WorkingDir: "/app", Cmd: ["node", "--input-type=module", "-e", CONDUCTOR] }),
        })
    ).json();
    if (!exec.Id) throw new Error(`[youtube] Portainer no creó la ejecución: ${JSON.stringify(exec).slice(0, 200)}`);
    const r = await api(`/exec/${exec.Id}/start`, { method: "POST", body: JSON.stringify({ Detach: false, Tty: true }) });
    return leerLaRespuesta(await r.text());
}
