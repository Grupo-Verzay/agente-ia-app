/**
 * Llena la caché de la voz Cedar (`scripts/voz-de-la-guia/cedar/`) pidiendo
 * el audio DESDE el contenedor de la App en producción, por la API de
 * Portainer. Es el camino cuando el entorno de trabajo no tiene red hacia
 * api.openai.com (el de la nube no la tiene).
 *
 *   PORTAINER_URL=… PORTAINER_TOKEN=… node scripts/sintetizar-voz-desde-la-app.mjs scripts/narracion-guia-<modulo>.mjs
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **La llave de OpenAI no sale del contenedor.** Se lee allí, de Panel ›
 *    API keys (`verzay_api_keys`), y lo único que vuelve es el audio en base64
 *    y el NOMBRE de la llave que sirvió. Nada de imprimirla ni de pasarla por
 *    argumentos.
 * 2. **Se prueba «IA CRM» primero y, si no tiene crédito, las demás** en el
 *    orden de la pantalla (la predeterminada delante). El 2026-09-30 «IA CRM»
 *    contestó `429 insufficient_quota` y salió con «Agente IA». Solo se pide
 *    lo que falta (`lasQueFaltan`), así que una vuelta repetida no gasta nada.
 * 3. **La petición es `laPeticion(texto)`, la misma que `llenarLaCache`**: el
 *    audio tiene que ser el que la caché promete para esa llave.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { lasQueFaltan, laPeticion, llaveDeLaFrase, rutaDeLaFrase } from "./voz-cedar.mjs";

const { NARRACION } = await import(pathToFileURL(path.resolve(process.argv[2] ?? "scripts/narracion-guia-leads.mjs")).href);
const faltan = lasQueFaltan(Object.values(NARRACION).map((n) => n.texto));
console.log(`[voz] faltan ${faltan.length} frase(s) en la caché de Cedar`);
if (!faltan.length) process.exit(0);

const BASE = process.env.PORTAINER_URL;
const H = { "X-API-Key": process.env.PORTAINER_TOKEN ?? "", "Content-Type": "application/json" };
if (!BASE || !process.env.PORTAINER_TOKEN) throw new Error("[voz] faltan PORTAINER_URL y PORTAINER_TOKEN");

// El contenedor de la App que esté corriendo (cualquiera de las dos réplicas).
const contenedores = await (await fetch(`${BASE}/api/endpoints/1/docker/containers/json`, { headers: H })).json();
const app = contenedores.find((c) => c.State === "running" && c.Names.some((n) => n.includes("agente-app_verzay_app")));
if (!app) throw new Error("[voz] no hay ningún contenedor de la App corriendo");

const pedidas = faltan.map((t) => ({ llave: llaveDeLaFrase(t), peticion: laPeticion(t) }));
const dentro = `
const {PrismaClient}=require('@prisma/client');
const PEDIDAS=${JSON.stringify(pedidas)};
const pedir=(clave,peticion)=>fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+clave,'Content-Type':'application/json'},body:JSON.stringify(peticion)});
(async()=>{const db=new PrismaClient();
const llaves=await db.$queryRawUnsafe('SELECT "nombre","clave" FROM "verzay_api_keys" WHERE "activa" = true ORDER BY ("nombre" = $1) DESC, "porDefecto" DESC, "nombre" ASC','IA CRM');
await db.$disconnect();
let clave=null;
for(const k of llaves){const r=await pedir(k.clave,PEDIDAS[0].peticion);const b=Buffer.from(await r.arrayBuffer());
 if(r.ok){clave=k.clave;console.log('LLAVE\\t'+k.nombre);console.log('OK\\t'+PEDIDAS[0].llave+'\\t'+b.toString('base64'));break;}
 console.log('NO\\t'+k.nombre+'\\t'+r.status);}
if(!clave){console.log('FATAL\\tninguna llave de Panel > API keys tiene credito');return;}
for(const {llave,peticion} of PEDIDAS.slice(1)){const r=await pedir(clave,peticion);const b=Buffer.from(await r.arrayBuffer());
 console.log(r.ok?'OK\\t'+llave+'\\t'+b.toString('base64'):'ERR\\t'+llave+'\\t'+r.status);}
})().catch((e)=>console.log('FATAL\\t'+String(e&&e.message).slice(0,200)));`;

const ex = await (await fetch(`${BASE}/api/endpoints/1/docker/containers/${app.Id}/exec`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Tty: true, WorkingDir: "/app", Cmd: ["node", "-e", dentro] }),
})).json();
if (!ex.Id) throw new Error("[voz] Portainer no creó la ejecución");
const salida = await (await fetch(`${BASE}/api/endpoints/1/docker/exec/${ex.Id}/start`, { method: "POST", headers: H, body: JSON.stringify({ Detach: false, Tty: true }) })).text();

const porLlave = Object.fromEntries(faltan.map((t) => [llaveDeLaFrase(t), t]));
let hechas = 0;
for (const linea of salida.split(/\r?\n/)) {
    const [estado, a, b] = linea.split("\t");
    if (estado === "OK" && porLlave[a]) {
        const audio = Buffer.from(b, "base64");
        if (audio.subarray(0, 4).toString("ascii") !== "OggS") throw new Error(`[voz] no es Opus: ${a}`);
        writeFileSync(rutaDeLaFrase(porLlave[a]), audio);
        hechas += 1;
        console.log(`  ✓ voz Cedar: «${porLlave[a].slice(0, 50)}»`);
    } else if (estado === "LLAVE") console.log(`[voz] con la llave «${a}»`);
    else if (estado === "NO") console.log(`[voz] la llave «${a}» contestó ${b}`);
    else if (estado === "ERR" || estado === "FATAL") console.log(`[voz] ${linea.slice(0, 200)}`);
}
console.log(`[voz] listo: ${hechas}/${faltan.length}`);
if (hechas < faltan.length) process.exit(1);
