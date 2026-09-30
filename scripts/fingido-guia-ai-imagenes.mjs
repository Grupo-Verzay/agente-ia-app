/**
 * El GEMINI FINGIDO de la guía de AI Imágenes: contesta, dentro del proceso de
 * `next start`, lo que la pantalla `/ai-image` le pide a Google.
 *
 * # Por qué existe
 *
 * La guía se fotografía sobre la App servida de verdad, y generar un anuncio
 * es una llamada a Gemini con la API key de la cuenta. En el banco no hay
 * ninguna clave de Google —ni debe haberla: sería la de un cliente—, y la red
 * de este entorno no llega a Google. Así que lo que Gemini contestaría lo
 * contesta este doble, con imágenes de ejemplo ya generadas
 * (`scripts/guia-ai-imagenes/*.jpg`, `generar-ejemplos-ai-imagenes.mjs`) y
 * textos escritos a mano (`scripts/guia-ai-imagenes/copies.json`).
 *
 * Todo lo DEMÁS es de verdad: la acción de servidor, el SDK de Google con su
 * petición, el cobro de créditos de la cuenta, el hook que reparte las
 * imágenes por vista y el panel del texto que las lee. Lo único que no sale de
 * la casa es la respuesta de Google.
 *
 * Se carga con `NODE_OPTIONS=--import` (lo pone `generar-guia.sh` cuando existe
 * `fingido-guia-<modulo>.mjs`) y parchea `globalThis.fetch` ANTES de que Next
 * ponga el suyo encima: Next envuelve el `fetch` que encuentra, así que las
 * peticiones del SDK acaban aquí. Todo lo que no vaya a Google pasa de largo.
 *
 * Qué imagen devuelve lo decide la PETICIÓN, no un contador: la etapa de venta
 * se lee del prompt (`MARCAS_DE_LA_ETAPA`, las mismas frases que escribe
 * `generateAdImage`) y el formato de `imageConfig.aspectRatio`. El banco
 * (`lib/__tests__/guia-ai-imagenes.test.mjs`) comprueba que esas marcas son las
 * de la acción y que las etapas y las redes son las de la pantalla: si la
 * pantalla gana una etapa, este doble no la reconoce y el banco se pone rojo.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "guia-ai-imagenes");
const HOST = "generativelanguage.googleapis.com";

/**
 * La frase con la que `generateAdImage` describe cada etapa, y el prefijo de
 * sus imágenes de ejemplo. El orden es el de `MARKETING_TEMPLATES`.
 */
export const MARCAS_DE_LA_ETAPA = [
    { etapa: "hero", marca: "SECCIÓN HERO:", nombre: "Hero Section" },
    { etapa: "pain", marca: "IDENTIFICACIÓN DEL DOLOR:", nombre: "Identificación Dolor" },
    { etapa: "solution", marca: "PRESENTACIÓN DE LA SOLUCIÓN:", nombre: "Presentación Solución" },
    { etapa: "benefits", marca: "BENEFICIOS PROFUNDOS:", nombre: "Beneficios Profundos" },
    { etapa: "social", marca: "PRUEBA SOCIAL:", nombre: "Prueba Social" },
    { etapa: "demo", marca: "DEMOSTRACIÓN / CÓMO SE USA:", nombre: "Demostración" },
    { etapa: "objections", marca: "MANEJO DE OBJECIONES:", nombre: "Manejo Objeciones" },
    { etapa: "offer", marca: "OFERTA IRRESISTIBLE:", nombre: "Oferta Irresistible" },
    { etapa: "cta", marca: "LLAMADO A LA ACCIÓN FUERTE:", nombre: "Llamado a la Acción" },
    { etapa: "trust", marca: "SECCIÓN FINAL DE CONFIANZA:", nombre: "Sección Confianza" },
];

/** Cómo nombra `instruccionesDelCopy` cada red (`LAS_REDES[red].nombre`). */
export const REDES_DEL_PROMPT = {
    "Post Instagram": "instagram",
    "Story / WhatsApp": "whatsapp",
    "Post Facebook": "facebook",
};

/** El sufijo de fichero de cada formato. */
const SUFIJO = { "1:1": "1x1", "9:16": "9x16", "16:9": "16x9" };

/** Lo que tarda en contestar: sin nada, el «Generando anuncio…» no llegaría a verse. */
const TARDA_LA_IMAGEN_MS = Number(process.env.GEMINI_FINGIDO_IMAGEN_MS ?? 500);
const TARDA_EL_TEXTO_MS = Number(process.env.GEMINI_FINGIDO_TEXTO_MS ?? 350);

/** Las etapas del prompt de una imagen: la primera marca que aparece. */
export function laEtapaDeLaImagen(prompt) {
    return MARCAS_DE_LA_ETAPA.find((m) => prompt.includes(m.marca))?.etapa ?? null;
}

/** La etapa del prompt del copy: sale de la línea «- Etapa del embudo: 1. Hero Section — …». */
export function laEtapaDelCopy(prompt) {
    const linea = /- Etapa del embudo: (.*)/.exec(prompt)?.[1] ?? "";
    return MARCAS_DE_LA_ETAPA.find((m) => linea.includes(m.nombre))?.etapa ?? null;
}

export function laRedDelCopy(prompt) {
    const nombre = /RED: (.*?)\./.exec(prompt)?.[1] ?? "";
    return REDES_DEL_PROMPT[nombre] ?? null;
}

/**
 * La imagen de ejemplo de una etapa y un formato. Cada petición de la misma
 * vista alterna entre las versiones que haya (`hero-1x1-1`, `hero-1x1-2`): son
 * las variantes. Una etapa sin ese formato cae en la del hero, y se dice.
 */
const vueltas = new Map();
export function laImagenDeEjemplo(etapa, formato) {
    const sufijo = SUFIJO[formato] ?? "1x1";
    const candidatas = [`${etapa}-${sufijo}.jpg`, `${etapa}-${sufijo}-1.jpg`, `${etapa}-${sufijo}-2.jpg`].filter((f) =>
        existsSync(path.join(DIR, f)),
    );
    if (!candidatas.length) {
        console.warn("[gemini-fingido] no hay imagen de ejemplo para", { etapa, formato });
        return etapa === "hero" ? null : laImagenDeEjemplo("hero", formato);
    }
    const llave = `${etapa}_${formato}`;
    const n = vueltas.get(llave) ?? 0;
    vueltas.set(llave, n + 1);
    return path.join(DIR, candidatas[n % candidatas.length]);
}

const COPIES = JSON.parse(readFileSync(path.join(DIR, "copies.json"), "utf8"));
const vueltasDelCopy = new Map();
export function elCopyDeEjemplo(etapa, red) {
    const versiones = [].concat(COPIES[etapa]?.[red] ?? []);
    if (!versiones.length) {
        console.warn("[gemini-fingido] no hay texto de ejemplo para", { etapa, red });
        return null;
    }
    const llave = `${etapa}_${red}`;
    const n = vueltasDelCopy.get(llave) ?? 0;
    vueltasDelCopy.set(llave, n + 1);
    return versiones[n % versiones.length];
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const json = (cuerpo, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

/** Un error con la forma de los de Google: así lo lee `porQueFalloGemini` en la pantalla. */
const error = (status, mensaje) => json({ error: { code: status, message: mensaje, status: "INVALID_ARGUMENT" } }, status);

function elTextoDeLaPeticion(cuerpo) {
    return (cuerpo?.contents ?? [])
        .flatMap((c) => c?.parts ?? [])
        .map((p) => p?.text ?? "")
        .join("\n");
}

async function contestar(url, init) {
    const cuerpo = typeof init?.body === "string" ? JSON.parse(init.body) : {};

    // Imagen 4 (`generateImages` → `:predict`).
    if (url.pathname.endsWith(":predict")) {
        const prompt = cuerpo?.instances?.[0]?.prompt ?? "";
        const etapa = laEtapaDeLaImagen(prompt);
        const fichero = etapa && laImagenDeEjemplo(etapa, cuerpo?.parameters?.aspectRatio ?? "1:1");
        if (!fichero) return error(400, "El Gemini de la guía no reconoce la etapa de este anuncio.");
        await dormir(TARDA_LA_IMAGEN_MS);
        return json({ predictions: [{ bytesBase64Encoded: readFileSync(fichero).toString("base64"), mimeType: "image/jpeg" }] });
    }

    if (!url.pathname.endsWith(":generateContent")) return error(404, `El Gemini de la guía no sabe contestar ${url.pathname}.`);

    const prompt = elTextoDeLaPeticion(cuerpo);
    const formato = cuerpo?.generationConfig?.imageConfig?.aspectRatio;

    // Una imagen: la pide `generateAdImage`, con `imageConfig`.
    if (formato) {
        const etapa = laEtapaDeLaImagen(prompt);
        const fichero = etapa && laImagenDeEjemplo(etapa, formato);
        if (!fichero) return error(400, "El Gemini de la guía no reconoce la etapa de este anuncio.");
        await dormir(TARDA_LA_IMAGEN_MS);
        return json({
            candidates: [
                {
                    content: { role: "model", parts: [{ inlineData: { mimeType: "image/jpeg", data: readFileSync(fichero).toString("base64") } }] },
                    finishReason: "STOP",
                },
            ],
            usageMetadata: { promptTokenCount: 760, candidatesTokenCount: 1290, totalTokenCount: 2050 },
        });
    }

    // El texto del post: lo pide `generarCopyDelAnuncio`.
    const etapa = laEtapaDelCopy(prompt);
    const red = laRedDelCopy(prompt);
    const texto = etapa && red ? elCopyDeEjemplo(etapa, red) : null;
    if (!texto) return error(400, "El Gemini de la guía no tiene texto para esta etapa y esta red.");
    await dormir(TARDA_EL_TEXTO_MS);
    return json({
        candidates: [{ content: { role: "model", parts: [{ text: texto }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 690, candidatesTokenCount: 110, totalTokenCount: 800 },
    });
}

const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async function fetchConGeminiFingido(entrada, init) {
    const direccion = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
    let url = null;
    try {
        url = direccion ? new URL(direccion) : null;
    } catch {
        url = null;
    }
    if (url?.host !== HOST) return fetchDeVerdad(entrada, init);
    try {
        return await contestar(url, init);
    } catch (e) {
        console.error("[gemini-fingido] no se pudo contestar", url.pathname, e);
        return error(500, "El Gemini de la guía falló al contestar.");
    }
};

console.log("[gemini-fingido] contestando a", HOST, "con los ejemplos de", DIR);
