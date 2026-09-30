/**
 * Llena una caché de voz de OpenAI DESDE EL CONTENEDOR DE LA APP.
 *
 * El entorno de trabajo no tiene red hacia api.openai.com (el proxy lo
 * deniega), y la llave buena es «IA CRM» de Panel › API keys (tabla
 * `verzay_api_keys`), que vive en la base de producción. Así que la síntesis
 * se pide DENTRO del contenedor de la App, por la API de Docker que expone
 * Portainer (`PORTAINER_URL` + `PORTAINER_TOKEN`): allí hay red, está la base
 * y está Prisma. Lo que vuelve es el Opus de cada frase, en base64, y se guarda
 * en la caché con la misma llave que usa `scripts/voz-cedar.mjs`.
 *
 *   node scripts/sintetizar-en-el-contenedor.mjs scripts/video-de-ventas/narracion.mjs
 *
 * El módulo tiene que exportar `loQueSeSintetiza()` —una lista de
 * `{ texto, voz }`, con `voz` como `VOZ_CEDAR`— y `CACHE_DE_VENTAS` (o se pasa
 * la carpeta como segundo argumento). Solo se piden las que faltan.
 *
 * La llave NO sale del contenedor: el script de dentro la lee de la base y la
 * usa ahí mismo. Por la salida solo viaja el audio o el motivo del fallo.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { laPeticion, rutaDeLaFrase } from "./voz-cedar.mjs";

const SERVICIO = "agente-app_verzay_app";
/**
 * La llave de Panel › API keys con la que se sintetiza. «IA CRM» es la de
 * siempre; cuando se queda sin créditos (OpenAI contesta 429) se pide con otra
 * de la misma tabla (`NOMBRE_LLAVE="Agente IA"`). La llave sigue sin salir del
 * contenedor: solo viaja su NOMBRE.
 */
const NOMBRE_DE_LA_LLAVE = process.env.NOMBRE_LLAVE || "IA CRM";

function portainer() {
    const url = process.env.PORTAINER_URL;
    const token = process.env.PORTAINER_TOKEN;
    if (!url || !token) throw new Error("[voz] faltan PORTAINER_URL y PORTAINER_TOKEN");
    return (ruta, opciones = {}) =>
        fetch(`${url}/api/endpoints/1/docker${ruta}`, {
            ...opciones,
            headers: { "X-API-Key": token, "Content-Type": "application/json", ...(opciones.headers || {}) },
        });
}

/** El script que corre dentro del contenedor. Lee las peticiones de una variable, en base64. */
const DENTRO = `
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  try {
    const filas = await p.$queryRawUnsafe('SELECT "clave" FROM "verzay_api_keys" WHERE "nombre" = $1 LIMIT 1', process.env.NOMBRE_LLAVE);
    const llave = filas[0] && filas[0].clave;
    if (!llave) { console.log('FALLO - no hay llave con ese nombre'); return; }
    const peticiones = JSON.parse(Buffer.from(process.env.PETICIONES, 'base64').toString('utf8'));
    for (let i = 0; i < peticiones.length; i++) {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + llave, 'Content-Type': 'application/json' },
        body: JSON.stringify(peticiones[i]),
      });
      const b = Buffer.from(await r.arrayBuffer());
      if (!r.ok) { console.log('FALLO ' + i + ' ' + r.status + ' ' + b.toString().slice(0, 160).replace(/\\s+/g, ' ')); continue; }
      console.log('AUDIO ' + i + ' ' + b.toString('base64'));
    }
  } finally { await p.$disconnect(); }
})().catch((e) => console.log('FALLO - ' + String(e && e.message || e).slice(0, 200)));
`;

export async function sintetizarEnElContenedor(pedidos, dir) {
    const faltan = pedidos.filter((p) => !existsSync(rutaDeLaFrase(p.texto, dir, p.voz)));
    if (!faltan.length) return 0;
    const api = portainer();
    const filtro = encodeURIComponent(JSON.stringify({ service: [SERVICIO], "desired-state": ["running"] }));
    const tareas = await (await api(`/tasks?filters=${filtro}`)).json();
    const contenedor = tareas.map((t) => t.Status?.ContainerStatus?.ContainerID).find(Boolean);
    if (!contenedor) throw new Error(`[voz] no hay ningún contenedor corriendo de ${SERVICIO}`);

    const peticiones = faltan.map((p) => laPeticion(p.texto, p.voz));
    const exec = await (
        await api(`/containers/${contenedor}/exec`, {
            method: "POST",
            body: JSON.stringify({
                AttachStdout: true,
                AttachStderr: true,
                Env: [`PETICIONES=${Buffer.from(JSON.stringify(peticiones)).toString("base64")}`, `NOMBRE_LLAVE=${NOMBRE_DE_LA_LLAVE}`],
                WorkingDir: "/app",
                Cmd: ["node", "-e", DENTRO],
            }),
        })
    ).json();
    if (!exec.Id) throw new Error(`[voz] Portainer no creó la ejecución: ${JSON.stringify(exec).slice(0, 200)}`);
    const r = await api(`/exec/${exec.Id}/start`, { method: "POST", body: JSON.stringify({ Detach: false, Tty: true }) });
    const salida = (await r.text()).replace(/\r/g, "");
    mkdirSync(dir, { recursive: true });
    let hechas = 0;
    const fallos = [];
    for (const linea of salida.split("\n")) {
        const audio = /^AUDIO (\d+) (\S+)$/.exec(linea);
        if (audio) {
            const pedido = faltan[Number(audio[1])];
            const cuerpo = Buffer.from(audio[2], "base64");
            if (cuerpo.subarray(0, 4).toString("ascii") !== "OggS") {
                fallos.push(`«${pedido.texto.slice(0, 40)}…» no vino en Opus`);
                continue;
            }
            writeFileSync(rutaDeLaFrase(pedido.texto, dir, pedido.voz), cuerpo);
            console.log(`  ✓ ${pedido.voz.voz}: «${pedido.texto.slice(0, 60)}${pedido.texto.length > 60 ? "…" : ""}»`);
            hechas++;
        } else if (linea.startsWith("FALLO")) fallos.push(linea);
    }
    if (fallos.length) throw new Error(`[voz] ${fallos.length} frase(s) sin sintetizar:\n  ${fallos.join("\n  ")}`);
    return hechas;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const modulo = await import(pathToFileURL(path.resolve(process.argv[2])).href);
    const dir = process.argv[3] ? path.resolve(process.argv[3]) : modulo.CACHE_DE_VENTAS;
    const pedidos = modulo.loQueSeSintetiza();
    const hechas = await sintetizarEnElContenedor(pedidos, dir);
    console.log(`[voz] listo: ${hechas} frase(s) nuevas, ${pedidos.length} en total`);
}
