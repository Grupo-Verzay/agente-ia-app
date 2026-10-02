/**
 * La IA FINGIDA de la guía de Etiquetas: contesta, dentro del proceso de
 * `next start`, lo que «Calificar con IA» (`actions/lead-score-action.ts`) le
 * pide a OpenAI.
 *
 * La guía se fotografía sobre la App servida de verdad, y calificar un contacto
 * es una llamada a OpenAI con la clave de la cuenta. En el banco no hay ninguna
 * clave —ni debe haberla— ni red hacia OpenAI. Así que lo que contestaría lo
 * contesta este doble, con el puntaje que `guia-etiquetas-datos.mjs` le pone a
 * cada contacto según su reporte. Todo lo DEMÁS es de verdad: la acción, el SDK
 * con su petición, el cobro de créditos y el tablero que pinta el puntaje.
 *
 * Se carga con `NODE_OPTIONS=--import` (lo pone `generar-guia.sh` cuando existe
 * `fingido-guia-<modulo>.mjs`) y parchea `globalThis.fetch`. Todo lo que no vaya
 * a OpenAI pasa de largo.
 */
import { elPuntajeDeLaIa } from "./guia-etiquetas-datos.mjs";

const HOST = "api.openai.com";

async function elCuerpo(entrada, init) {
    if (init?.body !== undefined) return typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body);
    if (entrada && typeof entrada === "object" && "text" in entrada) return entrada.clone().text();
    return "";
}

const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async function fetchConOpenAiFingida(entrada, init) {
    const direccion = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
    let url = null;
    try {
        url = direccion ? new URL(direccion) : null;
    } catch {
        url = null;
    }
    if (url?.host !== HOST) return fetchDeVerdad(entrada, init);
    try {
        const cuerpo = await elCuerpo(entrada, init);
        const { score, reason } = elPuntajeDeLaIa(cuerpo);
        const respuesta = {
            id: "chatcmpl-guia",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "gpt-4o-mini",
            choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ score, reason }) } }],
            usage: { prompt_tokens: 320, completion_tokens: 30, total_tokens: 350 },
        };
        // Lo que tarda de verdad: sin una espera, el giro de «calificando» no se llega a ver.
        await new Promise((r) => setTimeout(r, 700));
        return new Response(JSON.stringify(respuesta), { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
        console.error("[openai-fingida] no se pudo contestar", url.pathname, e);
        return new Response(JSON.stringify({ error: { message: "La IA de la guía falló al contestar." } }), { status: 500 });
    }
};

console.log("[openai-fingida] contestando a", HOST);
