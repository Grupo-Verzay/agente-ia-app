/**
 * Los servicios de FUERA de la guía de Reportes, servidos dentro de
 * `next start`.
 *
 * «Generar reporte» le pide a la IA de la cuenta que escriba el resumen
 * (OpenAI, con la clave de la cuenta) y después lo manda por WhatsApp por la
 * línea de la cuenta (Waha). En el banco no hay clave ni red, y una guía no
 * puede mandarle un WhatsApp a nadie, así que este fichero —cargado ANTES que
 * Next (`NODE_OPTIONS=--import`, lo pone `generar-guia.sh` cuando existe
 * `fingido-guia-<modulo>.mjs`)— contesta en su lugar: la IA devuelve un resumen
 * de ejemplo y Waha dice que la línea está conectada y que el mensaje salió.
 *
 * Todo lo demás es de verdad: la acción, el cobro de créditos, guardar el
 * reporte, el despachador y la marca «Enviado». Lo que no vaya a estos dos
 * servidores sigue su camino tal cual.
 */
export const SERVIDOR_DE_EJEMPLO = "https://waha.minegocio.co";
const OPENAI = "api.openai.com";

/** El resumen de ejemplo que «escribe» la IA al generar un reporte. */
export const RESUMEN_DE_EJEMPLO =
    "Fue una buena semana: entraron 14 leads nuevos y cerraste 3 ventas, una más que la semana pasada. " +
    "La mayoría de los interesados preguntó por el plan Business y por los envíos fuera de la ciudad.\n\n" +
    "Hay 4 leads calientes que todavía no han recibido la cotización: escríbeles el lunes a primera hora, " +
    "antes de que se enfríen. La calidad de la atención subió a 84 sobre 100.";

function laDireccion(entrada) {
    return typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
}

const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async function fetchDeLaGuia(entrada, init) {
    const direccion = laDireccion(entrada);
    if (direccion?.startsWith(SERVIDOR_DE_EJEMPLO)) {
        const url = new URL(direccion);
        const ruta = url.pathname;
        if (/^\/api\/sessions\/[^/]+$/.test(ruta)) {
            return Response.json({ name: decodeURIComponent(ruta.split("/").pop()), status: "WORKING", me: { id: "573001234567@c.us" } });
        }
        if (ruta === "/api/contacts/check-exists") {
            const telefono = url.searchParams.get("phone") ?? "";
            return Response.json({ numberExists: true, chatId: `${telefono}@c.us` });
        }
        if (ruta === "/api/sendText") {
            return Response.json({ id: { _serialized: `true_guia_${Date.now()}` } });
        }
        return Response.json({});
    }
    let host = null;
    try {
        host = direccion ? new URL(direccion).host : null;
    } catch {
        host = null;
    }
    if (host !== OPENAI) return fetchDeVerdad(entrada, init);
    const respuesta = {
        id: "chatcmpl-guia",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4o-mini",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: RESUMEN_DE_EJEMPLO } }],
        usage: { prompt_tokens: 420, completion_tokens: 120, total_tokens: 540 },
    };
    // Lo que tarda de verdad: sin una espera el «Generando…» no se llega a ver.
    await new Promise((r) => setTimeout(r, 900));
    return new Response(JSON.stringify(respuesta), { status: 200, headers: { "content-type": "application/json" } });
};

console.log("[guia-reportes] contestando a", SERVIDOR_DE_EJEMPLO, "y", OPENAI);
