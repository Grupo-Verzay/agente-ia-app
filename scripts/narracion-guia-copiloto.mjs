/**
 * Lo que se DICE en el vídeo de la guía de Copiloto, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`) y la de
 * Mis notas: una frase por idea, como se habla en una llamada, con lo que se
 * hace en pantalla DENTRO de la frase —el guion de `capturar-guia-copiloto.mjs`
 * pulsa en la palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-copiloto.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Copiloto: tu asistente de IA en la plataforma",
        texto:
            "Esta es la pantalla de Copiloto: un asistente de inteligencia artificial que te ayuda a escribir mensajes, ideas y respuestas para tu negocio.",
    },
    menu: {
        rotulo: "El menú: Copiloto está en Herramientas",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Copiloto lo encuentras dentro de Herramientas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    preguntar: {
        rotulo: "Pregunta, y la respuesta llega escribiéndose",
        texto:
            "Escribes lo que necesitas en la caja de abajo, por ejemplo el recordatorio de la cita de una clienta, pulsas Enter, y la respuesta llega escribiéndose.",
    },
    seguir: {
        rotulo: "Pídele cambios en la misma conversación",
        texto: "Si la quieres más corta, se lo pides en la misma conversación y te la vuelve a escribir, sin repetir la pregunta.",
    },
    respuestas: {
        rotulo: "Cópiala, o pide otra versión",
        texto: "Debajo de cada respuesta están sus botones: con copiar la pegas en un chat de WhatsApp, y con regenerar te escribe otra versión.",
    },
    conversaciones: {
        rotulo: "Tus conversaciones quedan guardadas",
        texto: "A la izquierda quedan guardadas tus conversaciones, cada una con su título, y con Nuevo chat empiezas otra en blanco.",
    },
    modelos: {
        rotulo: "Elige qué inteligencia artificial contesta",
        texto:
            "Arriba eliges qué inteligencia artificial te contesta en cada conversación, por ejemplo la de OpenAI o la de DeepSeek, y la cambias cuando quieras.",
    },
    archivos: {
        rotulo: "Adjunta un archivo, o dicta",
        texto: "Con el clip le pasas un archivo para que lo lea, y con el micrófono le dictas en vez de escribir.",
    },
    pantallaCompleta: {
        rotulo: "Pantalla completa, y con Esc vuelves",
        texto: "Con este botón lo pones a pantalla completa, y con la tecla Escape vuelves a la plataforma.",
    },
    fijar: {
        rotulo: "Fíjalo como pestaña en tus Chats",
        texto:
            "Y con Fijar en Chats, el copiloto sale como una pestaña en cada conversación de tus Chats: lo usas sin salir del chat con el cliente. Así se trabaja con Copiloto.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
