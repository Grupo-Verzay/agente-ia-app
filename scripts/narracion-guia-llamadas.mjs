/**
 * Lo que se DICE en el vídeo de la guía de Llamadas, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-llamadas.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y su audio sale de la misma
 * entrada de la caché.
 *
 * El vídeo NO llama a nadie: señala «Llamar» y «Llamar IA» y cierra la
 * ventana. Tampoco agenda ni guarda: nombra lo que hace cada botón.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-llamadas.test.mjs`) lo comprueba.
 */
export const NARRACION = {
    intro: {
        rotulo: "Llamadas: tu historial de llamadas por WhatsApp",
        texto: "Esta es la pantalla de Llamadas: aquí llamas a tus clientes por WhatsApp, tú o la inteligencia artificial, y revisas cada llamada que hiciste o que te hicieron.",
    },
    menu: {
        rotulo: "El menú: está en Bandeja",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Llamadas la encuentras dentro de Bandeja, al lado de Chats.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    llamar: {
        rotulo: "Llamar tú, o que llame la IA",
        texto: "Con Llamar escribes el número y eliges: con Llamar hablas tú desde tu computador, y con Llamar IA es el asistente el que habla con tu cliente.",
    },
    historial: {
        rotulo: "Filtra y busca en el historial",
        texto: "Abajo está el historial: con Salientes ves las que hiciste, con Entrantes las que te hicieron, y con el buscador encuentras a un contacto por su nombre.",
    },
    chat: {
        rotulo: "El número azul abre su chat",
        texto: "Y si quieres escribirle, el número azul de cada llamada abre su conversación.",
    },
    chatAbierto: {
        rotulo: "La conversación, lista para escribirle",
        texto: "Y llegas directo a Chats con su conversación ya abierta, lista para escribirle sin tener que buscarla.",
    },
    resultado: {
        rotulo: "Marca cómo terminó la llamada",
        texto: "De vuelta en el historial, en Resultado marcas cómo terminó cada llamada; cuando lleva un destello, es lo que propuso la inteligencia artificial.",
    },
    callback: {
        rotulo: "Agenda un callback",
        texto: "Para no olvidar volver a llamar, en sus tres puntos agendas un callback con fecha y hora, y te queda como tarea.",
    },
    detalle: {
        rotulo: "El detalle: grabación, resumen y transcripción",
        texto: "Y al pulsar el detalle ves la llamada entera: la grabación, el resumen de la inteligencia artificial y la transcripción, separada por quién habla.",
    },
    mensaje: {
        rotulo: "El mensaje al no contestar",
        texto: "Por último, en los tres puntos de la barra configuras el mensaje que le llega por WhatsApp a quien no te contesta. Así se trabaja con Llamadas.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
