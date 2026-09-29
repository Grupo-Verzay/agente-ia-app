/**
 * Llena la caché de la voz Cedar con las frases de una guía (ver
 * `scripts/voz-cedar.mjs`). Solo pide las que falten.
 *
 *   OPENAI_SYSTEM_API_KEY=… node scripts/sintetizar-voz-de-la-guia.mjs [narración]
 *
 * `narración` es el módulo con el guion (por defecto el de Leads); tiene que
 * exportar `NARRACION`, un objeto de frases con su `texto`. Hace falta red
 * hacia api.openai.com. Después se comitea `scripts/voz-de-la-guia/cedar/`.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { lasQueFaltan, llenarLaCache } from "./voz-cedar.mjs";

const modulo = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "narracion-guia-leads.mjs"));
const { NARRACION } = await import(pathToFileURL(modulo).href);
const textos = Object.values(NARRACION).map((n) => n.texto);
console.log(`[guia] ${textos.length} frases, faltan ${lasQueFaltan(textos).length} en la caché de Cedar`);
const pedidas = await llenarLaCache(textos);
console.log(`[guia] listo: ${pedidas} frase(s) sintetizadas con Cedar`);
