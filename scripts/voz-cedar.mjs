/**
 * La voz ESTÁNDAR de las guías públicas: Cedar, de OpenAI.
 *
 * Es la misma voz que el asistente de voz de «Llamar con IA» (`cedar` en
 * `lib/voicebot-voices.ts`), con la misma llave de la plataforma
 * (`OPENAI_SYSTEM_API_KEY`, o `OPENAI_API_KEY` si no está). Aquí no hay
 * tiempo real: cada frase se pide al endpoint de voz de OpenAI
 * (`/v1/audio/speech`, modelo `gpt-4o-mini-tts`), que habla con las mismas
 * voces.
 *
 * # La caché, y por qué va en el repositorio
 *
 * Cada frase sintetizada se guarda en `scripts/voz-de-la-guia/cedar/`, con el
 * nombre sacado de TODO lo que decide cómo suena (modelo, voz, instrucciones y
 * texto). Tres motivos:
 *   1. regenerar las capturas o el vídeo no vuelve a pagar la voz de una frase
 *      que no cambió;
 *   2. se puede regenerar sin red hacia OpenAI (el entorno de trabajo no la
 *      tiene): basta con llenar la caché una vez desde donde sí la haya, con
 *      `node scripts/sintetizar-voz-de-la-guia.mjs`;
 *   3. cambiar una frase, la voz o las instrucciones cambia el nombre, así que
 *      nunca suena una frase vieja por una nueva.
 * Se guarda en Opus (lo que devuelve OpenAI, unos 15 kB por frase), no en WAV.
 *
 * # Sin la frase en la caché NO se cae a otra voz
 *
 * Se dice qué falta y cómo llenarlo. Caer en silencio a la voz de antes
 * (espeak) dejaría el vídeo con la voz mala sin que nadie lo notara.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const VOZ_CEDAR = Object.freeze({
    proveedor: "openai",
    modelo: "gpt-4o-mini-tts",
    voz: "cedar",
    formato: "opus",
    frecuencia: 24000,
    // El RITMO es el de la misma voz en una llamada con un cliente, no el de un
    // tutorial. Con «a ritmo pausado de tutorial» (lo de antes) salía a unas 135
    // palabras por minuto y con pausas de medio segundo en cada coma: la
    // narración sonaba cortada al lado de la voz en vivo. Las instrucciones
    // piden lo fluido; `RITMO` (voz-de-la-guia.mjs) acota después las pausas
    // que aun así se cuelen, porque el modelo no siempre obedece al ritmo.
    instrucciones:
        "Habla en español latinoamericano neutro, con voz cálida, cercana y segura. " +
        "Ritmo: el natural y fluido de una llamada por WhatsApp con un cliente; ágil y continuo, " +
        "sin arrastrar las palabras ni hacer pausas largas: enlaza las ideas de corrido y respira " +
        "solo donde lo haría una persona hablando. Tono conversacional y claro, como quien le " +
        "muestra la pantalla a alguien que tiene al lado; nada de locutor ni de lectura en voz alta. " +
        "Pronuncia «Leads» como en inglés («lids»), «WhatsApp» como «guatsap», " +
        "«CSV» letra por letra («se, ese, uve»), «Google Sheets» en inglés e «IA» como «i, a».",
});

export const CACHE_CEDAR = path.resolve(import.meta.dirname, "voz-de-la-guia", "cedar");

/** El nombre del fichero de una frase: cambia con cualquier cosa que cambie cómo suena. */
export function llaveDeLaFrase(texto, voz = VOZ_CEDAR) {
    const h = createHash("sha256").update(JSON.stringify([voz.modelo, voz.voz, voz.instrucciones, voz.formato, texto])).digest("hex");
    return h.slice(0, 24);
}

/**
 * Dónde vive una frase en la caché. `voz` es la de las guías si no se dice otra:
 * el vídeo de ventas usa la misma Cedar con otras instrucciones, y las notas de
 * voz de su historia van con otras voces (`scripts/video-de-ventas/narracion.mjs`).
 */
export const rutaDeLaFrase = (texto, dir = CACHE_CEDAR, voz = VOZ_CEDAR) => path.join(dir, `${llaveDeLaFrase(texto, voz)}.ogg`);

export function lasQueFaltan(textos, dir = CACHE_CEDAR, voz = VOZ_CEDAR) {
    return [...new Set(textos)].filter((t) => !existsSync(rutaDeLaFrase(t, dir, voz)));
}

export function laLlaveDeOpenAi(env = process.env) {
    return env.OPENAI_SYSTEM_API_KEY || env.OPENAI_API_KEY || "";
}

/** El cuerpo exacto que se le manda a OpenAI. Puro. */
export function laPeticion(texto, voz = VOZ_CEDAR) {
    return { model: voz.modelo, voice: voz.voz, input: texto, instructions: voz.instrucciones, response_format: voz.formato };
}

/**
 * Pide a OpenAI las frases que falten y las deja en la caché. Devuelve cuántas
 * pidió. Sin llave, o si OpenAI dice que no, lanza con el motivo: nunca sigue
 * con una voz que no es la pedida.
 */
export async function llenarLaCache(textos, { dir = CACHE_CEDAR, llave = laLlaveDeOpenAi(), pedir = fetch, voz = VOZ_CEDAR } = {}) {
    const faltan = lasQueFaltan(textos, dir, voz);
    if (!faltan.length) return 0;
    if (!llave) {
        throw new Error(
            `[guia] faltan ${faltan.length} frase(s) de la voz Cedar y no hay llave de OpenAI ` +
                "(OPENAI_SYSTEM_API_KEY u OPENAI_API_KEY). Llénalas con `node scripts/sintetizar-voz-de-la-guia.mjs`.",
        );
    }
    mkdirSync(dir, { recursive: true });
    for (const texto of faltan) {
        const r = await pedir("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
            body: JSON.stringify(laPeticion(texto, voz)),
        });
        const cuerpo = Buffer.from(await r.arrayBuffer());
        if (!r.ok) throw new Error(`[guia] OpenAI no sintetizó «${texto.slice(0, 40)}…»: ${r.status} ${cuerpo.toString().slice(0, 200)}`);
        if (cuerpo.subarray(0, 4).toString("ascii") !== "OggS") throw new Error(`[guia] OpenAI no devolvió Opus para «${texto.slice(0, 40)}…»`);
        writeFileSync(rutaDeLaFrase(texto, dir, voz), cuerpo);
        console.log(`  ✓ voz ${voz.voz}: «${texto.slice(0, 50)}${texto.length > 50 ? "…" : ""}»`);
    }
    return faltan.length;
}

/** El audio de una frase ya en la caché, como WAV PCM mono de 16 bits a 24 kHz. */
export function wavDeLaCache(texto, dir = CACHE_CEDAR, voz = VOZ_CEDAR) {
    const ruta = rutaDeLaFrase(texto, dir, voz);
    if (!existsSync(ruta)) {
        throw new Error(
            `[guia] la frase «${texto.slice(0, 50)}…» no está sintetizada con la voz Cedar. ` +
                "Llénala con `node scripts/sintetizar-voz-de-la-guia.mjs` (necesita la llave de OpenAI y red hacia api.openai.com).",
        );
    }
    return execFileSync(
        "ffmpeg",
        ["-loglevel", "error", "-i", ruta, "-ac", "1", "-ar", String(voz.frecuencia ?? VOZ_CEDAR.frecuencia), "-c:a", "pcm_s16le", "-f", "wav", "-"],
        { maxBuffer: 64 << 20 },
    );
}
