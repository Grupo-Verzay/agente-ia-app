/**
 * La NARRACIÓN del vídeo de Tienda Nativa y sus voces. Misma voz del locutor,
 * mismas instrucciones y misma caché que el vídeo de la clínica (`../voz`):
 * las frases idénticas (gancho y promesa) no se vuelven a sintetizar.
 */
import { CACHE_DE_VENTAS as CACHE, VOZ_DE_VENTAS } from "../narracion.mjs";
import { VOZ_CEDAR } from "../../voz-cedar.mjs";
import { NOTAS_DE_VOZ } from "./historia.mjs";

export const CACHE_DE_VENTAS = CACHE;
export { VOZ_DE_VENTAS };

export const VOZ_DE_MATEO = Object.freeze({
    ...VOZ_CEDAR,
    voz: NOTAS_DE_VOZ.clienta.voz,
    instrucciones:
        "Eres Mateo, un cliente colombiano de unos veintiocho años, grabando una nota de voz de WhatsApp " +
        "desde el celular: natural, relajado y amable, a ritmo normal de conversación. Nada de locutor.",
});

export const NARRACION = Object.freeze({
    gancho: {
        texto:
            "Cada minuto sin respuesta es una venta que se enfría. Tiendas en línea, clínicas, cursos, consultorías, agencias de viajes… y cualquier negocio que venda por WhatsApp, responde al instante.",
    },
    promesa: { texto: "Con Verzay, una inteligencia artificial les contesta al instante, entiende lo que piden y lo deja todo listo en tu CRM." },
    tresPantallas: { texto: "Mira la misma conversación en el celular de la tienda, en WhatsApp Web y en el panel de Verzay, al mismo tiempo." },
    anuncio: { texto: "Son las once de la noche. Mateo ve un anuncio y escribe. Nía, la IA de la tienda, le contesta al instante con fotos y video." },
    voz: { texto: "¿Pregunta por la talla con una nota de voz? La entiende y le manda la guía de tallas." },
    sheets: { texto: "Consulta el inventario en tu Google Sheets, y cada pedido queda anotado ahí." },
    carrito: { texto: "Arma el carrito, le ofrece unas medias para el envío gratis, y Mateo dice que sí." },
    pago: { texto: "Le envía el link de pago, y su ficha se llena sola con el pedido." },
    seguimiento: { texto: "¿Mateo no paga? Una hora después la IA le recuerda su carrito, y la venta se recupera." },
    envio: { texto: "Toma la dirección, despacha y le manda la guía de envío en PDF." },
    recordatorio: { texto: "El día de la entrega le llega el aviso, y responde dónde va su pedido." },
    asesor: { texto: "¿Un cambio? La conversación pasa directo a Andrea, de soporte, con toda la historia." },
    embudo: { texto: "Cada pedido avanza solo por tu embudo: en carrito, pagado, enviado, entregado." },
    reportes: { texto: "Y en tus reportes ves el ticket promedio y los carritos recuperados, sin perseguir a nadie." },
    multiagente: { texto: "Si tu tienda crece, separas tus líneas: ventas, soporte y despachos, cada una con sus asesores." },
    resumen: { texto: "Toda tu tienda, en un solo WhatsApp." },
    cierre: { texto: "Verzay atiende, vende y despacha por WhatsApp… incluso mientras tu tienda duerme." },
});

/** Todo lo que hay que sintetizar: la narración y las dos notas de Mateo. */
export function loQueSeSintetiza() {
    return [
        ...Object.values(NARRACION).map((n) => ({ texto: n.texto, voz: VOZ_DE_VENTAS })),
        { texto: NOTAS_DE_VOZ.clienta.texto, voz: VOZ_DE_MATEO },
        { texto: NOTAS_DE_VOZ.cambio.texto, voz: VOZ_DE_MATEO },
    ];
}
