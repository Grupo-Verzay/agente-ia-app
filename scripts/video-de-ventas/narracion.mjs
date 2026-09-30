/**
 * La NARRACIÓN del vídeo de ventas y las voces de su historia.
 *
 * Es la misma voz de las guías —Cedar, de OpenAI, con el mismo modelo y el
 * mismo formato (`scripts/voz-cedar.mjs`)— y el mismo recorte de pausas
 * (`RITMO`, `scripts/voz-de-la-guia.mjs`). Lo único que cambia son las
 * INSTRUCCIONES: esto es una pieza de venta, no una guía, así que el tono es de
 * anuncio —seguro, con energía— y no el de quien enseña una pantalla. Como la
 * llave de cada frase sale de modelo, voz, instrucciones y texto, sus frases
 * viven en su propia caché (`scripts/video-de-ventas/voz/`) y no se mezclan
 * nunca con las de las guías.
 *
 * Las NOTAS DE VOZ de la historia son otras dos voces del mismo modelo: la
 * clienta (`coral`) y Sofía, la asistente de la clínica (`marin`). Suenan en el
 * vídeo tal cual, como las oiría el negocio en su WhatsApp.
 */
import { VOZ_CEDAR } from "../voz-cedar.mjs";
import { NOTAS_DE_VOZ } from "./historia.mjs";
import path from "node:path";

export const CACHE_DE_VENTAS = path.resolve(import.meta.dirname, "voz");

export const VOZ_DE_VENTAS = Object.freeze({
    ...VOZ_CEDAR,
    instrucciones:
        "Habla en español latinoamericano neutro, con voz cálida, segura y con energía, como el locutor " +
        "de un anuncio premium de tecnología: entusiasta sin gritar, convincente y cercano. Ritmo ágil y " +
        "fluido, enlazando las ideas de corrido, sin pausas largas ni tono de lectura. " +
        "Pronuncia «Verzay» como «versái», «WhatsApp» como «guatsap», «WhatsApp Web» como «guatsap güeb», " +
        "«CRM» letra por letra («ce, erre, eme»), «IA» como «i, a» y «PDF» como «pe, de, efe».",
});

export const VOZ_DE_LA_CLIENTA = Object.freeze({
    ...VOZ_CEDAR,
    voz: NOTAS_DE_VOZ.clienta.voz,
    instrucciones:
        "Eres Laura, una clienta colombiana de unos treinta años, grabando una nota de voz de WhatsApp " +
        "desde el celular: natural, espontánea y amable, a ritmo normal de conversación, con curiosidad. " +
        "Nada de locutora.",
});

export const VOZ_DE_SOFIA = Object.freeze({
    ...VOZ_CEDAR,
    voz: NOTAS_DE_VOZ.ia.voz,
    instrucciones:
        "Eres Sofía, la asistente de una clínica odontológica, grabando una nota de voz de WhatsApp para " +
        "una clienta: cálida, sonriente, segura y resolutiva, a ritmo natural y fluido de conversación. " +
        "Español latinoamericano neutro.",
});

/**
 * Las frases, en el orden en que suenan. Cortas a propósito: el vídeo es un
 * gancho de un minuto y medio, no una explicación paso a paso; cada frase dice
 * lo que se está VIENDO pasar en ese momento.
 */
export const NARRACION = Object.freeze({
    gancho: { texto: "Restaurantes, clínicas, tiendas en línea, consultorías y agencias: tus clientes te escriben por WhatsApp a cualquier hora." },
    promesa: { texto: "Con Verzay, una inteligencia artificial les contesta al instante, entiende lo que piden y lo deja todo listo en tu CRM." },
    tresPantallas: { texto: "Mira la misma conversación en el celular del negocio, en WhatsApp Web y en el panel de Verzay, al mismo tiempo." },
    texto: { texto: "Laura pregunta por un blanqueamiento. La IA le da el precio, y su ficha se llena sola." },
    voz: { texto: "¿Te manda una nota de voz? La escucha, la entiende y le contesta con su propia voz." },
    medios: { texto: "Le envía la lista de precios, un video de la clínica, y entiende la imagen que Laura le manda." },
    caliente: { texto: "Laura ya está interesada: queda calificada como caliente y etiquetada, sin que nadie toque nada." },
    seguimiento: { texto: "¿Y si deja de responder? La IA le hace seguimiento sola, con los cupos de la semana." },
    cita: { texto: "Laura elige un horario, y la cita queda agendada en tu calendario." },
    recordatorio: { texto: "Un día antes le llega el recordatorio. Confirma, y tú lo ves al instante." },
    embudo: { texto: "Cada cliente avanza solo por tu embudo, con toda su historia en su ficha." },
    cierre: { texto: "Verzay responde, vende, agenda y hace seguimiento las veinticuatro horas. Agenda una reunión y míralo funcionando en tu negocio." },
});

/** Todo lo que hay que sintetizar: la narración y las dos notas de voz, cada una con su voz. */
export function loQueSeSintetiza() {
    return [
        ...Object.values(NARRACION).map((n) => ({ texto: n.texto, voz: VOZ_DE_VENTAS })),
        { texto: NOTAS_DE_VOZ.clienta.texto, voz: VOZ_DE_LA_CLIENTA },
        { texto: NOTAS_DE_VOZ.ia.texto, voz: VOZ_DE_SOFIA },
    ];
}
