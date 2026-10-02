/**
 * Lo que la guía de Chats NO puede pedirle a nadie de verdad: el servidor de
 * llamadas (AstraCalls) y las plantillas de WhatsApp oficial (Meta). Se carga
 * DENTRO de `next start` con `--import` (lo pone `generar-guia.sh` cuando
 * existe `fingido-guia-<modulo>.mjs`), el mismo mecanismo que el Gemini fingido
 * de AI Imágenes: parchea `globalThis.fetch` antes de que Next ponga el suyo,
 * así que la acción, la tarjeta de la llamada y el selector de plantillas son
 * los de verdad. Lo único que no sale de la casa es la respuesta.
 *
 * Nadie recibe una llamada ni un WhatsApp: la «llamada» se contesta con una
 * respuesta de audio de mentira (`GUIA`) que el navegador de las capturas
 * reconoce (ver `LLAMADA_DE_EJEMPLO` en `capturar-guia-chats.mjs`).
 *
 * Las variables se ponen AQUÍ, al importar: `actions/astracalls-actions.ts`
 * lee `ASTRACALLS_URL` al cargar el módulo, y este fichero carga antes.
 */
export const ASTRACALLS_DE_LA_GUIA = "http://astracalls.guia.local";
export const BACKEND_DE_LA_GUIA = "http://backend.guia.local";

process.env.ASTRACALLS_URL = ASTRACALLS_DE_LA_GUIA;
process.env.ASTRACALLS_API_KEY = "guia";
process.env.BACKEND_URL = BACKEND_DE_LA_GUIA;

/** Lo que el servidor de llamadas devuelve como respuesta de audio: lo reconoce el navegador de las capturas. */
export const RESPUESTA_DE_AUDIO = "GUIA";

/** Las plantillas aprobadas de la línea oficial de ejemplo. */
export const PLANTILLAS_DE_EJEMPLO = [
    {
        name: "seguimiento_pedido",
        language: "es",
        category: "UTILITY",
        bodyText: "Hola {{1}}, tu pedido {{2}} ya va en camino. Llega en 2 días hábiles.",
        paramCount: 2,
    },
    {
        name: "retomar_conversacion",
        language: "es",
        category: "MARKETING",
        bodyText: "Hola {{1}}, ¿sigues interesado en los tenis que viste? Te guardamos tu talla.",
        paramCount: 1,
    },
];

const json = (cuerpo, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

let llamadas = 0;

function contestarAstraCalls(url, init) {
    const metodo = (init?.method ?? "GET").toUpperCase();
    const p = url.pathname;
    if (/\/api\/sessions\/[^/]+\/calls\/[^/]+\/webrtc$/.test(p)) return json({ sdp_answer: RESPUESTA_DE_AUDIO });
    if (/\/api\/sessions\/[^/]+\/calls$/.test(p) && metodo === "POST") {
        llamadas += 1;
        return json({ call: { callId: `guia-llamada-${llamadas}` } });
    }
    if (/\/api\/sessions\/[^/]+\/calls$/.test(p)) return json({ calls: [] });
    if (p === "/api/sessions") return json({ sessions: [] });
    return json({ ok: true });
}

function contestarAlBackend(url) {
    if (url.pathname.startsWith("/whatsapp/channels/meta-templates/")) return json({ templates: PLANTILLAS_DE_EJEMPLO });
    // Lo demás del backend no existe en la guía: se contesta como un backend caído.
    return json({ message: "El backend de la guía no contesta esto." }, 503);
}

const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async function fetchDeLaGuiaDeChats(entrada, init) {
    const texto = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
    if (typeof texto === "string") {
        if (texto.startsWith(ASTRACALLS_DE_LA_GUIA)) return contestarAstraCalls(new URL(texto), init);
        if (texto.startsWith(BACKEND_DE_LA_GUIA)) return contestarAlBackend(new URL(texto));
    }
    return fetchDeVerdad(entrada, init);
};

console.log("[chats-fingido] llamadas y plantillas de Meta contestadas por la guía");
