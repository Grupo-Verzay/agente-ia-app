/**
 * La IA DE EJEMPLO del copiloto de las capturas: un servidor que habla como la
 * API de OpenAI (`/v1/models` y `/v1/chat/completions`, con y sin streaming) y
 * contesta con textos preparados. El copiloto local (`copiloto-de-la-guia.sh`)
 * apunta ahí su `OPENAI_REVERSE_PROXY` y el `baseURL` de DeepSeek.
 *
 * No es decoración. La guía es pública y el copiloto de verdad gasta dinero
 * por cada respuesta, así que las capturas NO hablan con ningún proveedor; y
 * con una respuesta cualquiera («Hola, soy una respuesta de ejemplo») las
 * capturas enseñarían un copiloto que no sirve para nada. Cada pregunta que
 * escribe el guion de capturas tiene aquí su respuesta de negocio y su título,
 * así la lista de conversaciones sale como la de una cuenta de verdad.
 *
 * Qué contesta lo decide la ÚLTIMA pregunta del usuario, por palabras clave
 * (`laRespuestaA`). El título lo pide el copiloto aparte —una llamada sin
 * streaming que empieza por «Provide a concise, 5-word-or-less title»— y sale
 * de la misma tabla, así título y conversación no pueden discrepar.
 *
 * Se lanza sola desde `copiloto-de-la-guia.sh`; aquí nada lee la red.
 */
import http from "node:http";

export const PUERTO = Number(process.env.PUERTO_IA_DE_EJEMPLO ?? 4010);

/** Los modelos que lista el selector del copiloto para OpenAI (los de su configuración de producción). */
export const MODELOS = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"];

/**
 * Las conversaciones de ejemplo: qué palabras las reconocen, qué título lleva
 * cada una en la lista y qué contesta la IA. Una por fila, en el orden en que
 * se buscan (la primera que case manda).
 */
export const CONVERSACIONES = [
    // La segunda pregunta de la conversación del recordatorio («Hazlo más
    // corto»): la primera fila, porque es la única que se pide sin repetir de
    // qué se habla.
    {
        claves: ["más corto", "mas corto"],
        titulo: "Recordatorio de cita",
        respuesta:
            "Más corto:\n\n" +
            "**Hola, Camila 👋** Te esperamos mañana a las **10:00 a. m.** " +
            "Si necesitas cambiar la hora, respóndenos por aquí. 😊",
    },
    {
        claves: ["recordatorio", "cita de mañana"],
        titulo: "Recordatorio de cita",
        respuesta:
            "¡Claro! Aquí tienes un mensaje corto y amable:\n\n" +
            "**Hola, Camila 👋**\n\n" +
            "Te recordamos tu cita de **mañana a las 10:00 a. m.** en nuestra sede principal. " +
            "Si necesitas cambiar la hora, respóndenos por aquí y te buscamos otro espacio.\n\n" +
            "¡Te esperamos! 😊",
    },
    {
        claves: ["bienvenida"],
        titulo: "Mensaje de bienvenida",
        respuesta:
            "Aquí tienes una propuesta de mensaje de bienvenida:\n\n" +
            "**¡Hola y bienvenido! 🎉**\n\n" +
            "Gracias por escribirnos. Somos **Mi Negocio** y estamos para ayudarte de lunes a sábado, " +
            "de 8:00 a. m. a 6:00 p. m.\n\n" +
            "Cuéntanos qué necesitas y te respondemos en minutos.",
    },
    {
        claves: ["promoci", "diciembre"],
        titulo: "Ideas de promoción para diciembre",
        respuesta:
            "Tres ideas que suelen funcionar en diciembre:\n\n" +
            "1. **Regalo sorpresa** en compras de más de $150.000.\n" +
            "2. **2x1 en la segunda unidad** durante la primera semana.\n" +
            "3. **Sorteo entre clientes frecuentes**: una entrada por cada compra del mes.\n\n" +
            "¿Quieres que te escriba el mensaje para anunciar alguna?",
    },
    {
        claves: ["descuento"],
        titulo: "Respuesta a pedido de descuento",
        respuesta:
            "Una respuesta amable que cuida el precio:\n\n" +
            "«Gracias por tu interés 😊. Nuestros precios ya incluyen instalación y soporte, " +
            "pero esta semana te podemos regalar el **envío gratis** si confirmas hoy.»",
    },
    {
        claves: ["reclamo", "queja"],
        titulo: "Resumen de un reclamo",
        respuesta:
            "**Resumen del reclamo**\n\n" +
            "- **Qué pasó:** el pedido llegó dos días tarde.\n" +
            "- **Qué pide:** la devolución del costo del envío.\n" +
            "- **Tono:** molesto pero dispuesto a seguir comprando.\n\n" +
            "**Siguiente paso sugerido:** disculparse, devolver el envío y ofrecer seguimiento del próximo pedido.",
    },
    {
        claves: ["envío", "envio", "frecuentes"],
        titulo: "Preguntas frecuentes de envíos",
        respuesta:
            "Estas son las preguntas que más llegan sobre envíos, con su respuesta:\n\n" +
            "- **¿Cuánto tarda?** De 2 a 4 días hábiles.\n" +
            "- **¿Cuánto cuesta?** Gratis desde $120.000.\n" +
            "- **¿Puedo rastrearlo?** Sí, te enviamos la guía por WhatsApp.",
    },
];

const SIN_COINCIDENCIA = {
    titulo: "Consulta del negocio",
    respuesta: "Con gusto te ayudo. ¿Me das un poco más de contexto sobre tu negocio y lo que necesitas?",
};

const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La conversación que corresponde a un texto: la primera cuya palabra clave aparezca. */
export function laRespuestaA(texto) {
    const t = sinTildes(texto ?? "");
    return CONVERSACIONES.find((c) => c.claves.some((k) => t.includes(sinTildes(k)))) ?? SIN_COINCIDENCIA;
}

/** El texto de un mensaje, sea una cadena o la lista de partes que manda el copiloto. */
const elTexto = (contenido) =>
    typeof contenido === "string" ? contenido : Array.isArray(contenido) ? contenido.map((p) => p.text ?? "").join(" ") : "";

/** Una petición de TÍTULO: el copiloto la manda sin streaming y con esta frase delante. */
export const esPeticionDeTitulo = (cuerpo) =>
    cuerpo?.stream !== true && /concise, 5-word-or-less title/i.test(elTexto(cuerpo?.messages?.at(-1)?.content));

/** Lo que se contesta a una petición de chat: el título o la respuesta, según qué pidan. */
export function loQueSeContesta(cuerpo) {
    const mensajes = cuerpo?.messages ?? [];
    if (esPeticionDeTitulo(cuerpo)) {
        // La petición de título lleva la conversación dentro («User: …»).
        const conversacion = elTexto(mensajes.at(-1)?.content);
        const pregunta = conversacion.split(/\nUser:\s*/).at(-1)?.split(/\nAI:/)[0] ?? conversacion;
        return laRespuestaA(pregunta).titulo;
    }
    const delUsuario = [...mensajes].reverse().find((m) => m.role === "user");
    return laRespuestaA(elTexto(delUsuario?.content)).respuesta;
}

function contestar(req, res, cuerpo) {
    if (req.url.endsWith("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: MODELOS.map((id) => ({ id, object: "model", owned_by: "openai" })) }));
        return;
    }
    if (!req.url.endsWith("/chat/completions")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
        return;
    }
    const texto = loQueSeContesta(cuerpo);
    const creado = Math.floor(Date.now() / 1000);
    if (!cuerpo.stream) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
            JSON.stringify({
                id: "chatcmpl-ejemplo",
                object: "chat.completion",
                created: creado,
                model: cuerpo.model,
                choices: [{ index: 0, message: { role: "assistant", content: texto }, finish_reason: "stop" }],
                usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 },
            }),
        );
        return;
    }
    // Con streaming, de a unas palabras cada 45 ms: así se VE que la respuesta
    // llega escribiéndose, que es como la ve un cliente.
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const trozos = texto.match(/\S+\s*|\s+/g) ?? [texto];
    const trozo = (delta, fin = null, extra = {}) =>
        `data: ${JSON.stringify({ id: "chatcmpl-ejemplo", object: "chat.completion.chunk", created: creado, model: cuerpo.model, choices: [{ index: 0, delta, finish_reason: fin }], ...extra })}\n\n`;
    let i = 0;
    const reloj = setInterval(() => {
        if (i < trozos.length) {
            const juntos = trozos.slice(i, i + 2).join("");
            res.write(trozo(i === 0 ? { role: "assistant", content: juntos } : { content: juntos }));
            i += 2;
            return;
        }
        clearInterval(reloj);
        res.write(trozo({}, "stop", { usage: { prompt_tokens: 20, completion_tokens: trozos.length, total_tokens: 20 + trozos.length } }));
        res.write("data: [DONE]\n\n");
        res.end();
    }, 45);
    // En la RESPUESTA, no en la petición: desde Node 16 el `close` de la
    // petición salta en cuanto se termina de leer su cuerpo, o sea antes del
    // primer trozo, y la respuesta se quedaba colgada sin decir nada.
    res.on("close", () => clearInterval(reloj));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    http
        .createServer((req, res) => {
            let crudo = "";
            req.on("data", (d) => (crudo += d));
            req.on("end", () => {
                let cuerpo = {};
                try {
                    cuerpo = crudo ? JSON.parse(crudo) : {};
                } catch {
                    cuerpo = {};
                }
                contestar(req, res, cuerpo);
            });
        })
        .listen(PUERTO, "127.0.0.1", () => console.log(`[copiloto] IA de ejemplo en 127.0.0.1:${PUERTO}`));
}
