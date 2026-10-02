/**
 * Lo que se DICE en el vídeo de la guía de Chats, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, con lo que se hace en pantalla DENTRO de la frase —el guion
 * de `capturar-guia-chats.mjs` pulsa en la palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y su audio sale de la misma
 * entrada de la caché.
 *
 * El vídeo NO le escribe a nadie ni llama: escribe en la caja y no envía,
 * señala «Resolver conversación» y la llamada se cuelga sin que nadie la
 * reciba (la contesta el servidor de llamadas fingido de la guía).
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-chats.test.mjs`) lo comprueba.
 */
export const NARRACION = {
    intro: {
        rotulo: "Chats: todas tus conversaciones en una bandeja",
        texto: "Esta es la pantalla de Chats: a la izquierda tienes todas las conversaciones de tus líneas de WhatsApp, y a la derecha la que tienes abierta.",
    },
    menu: {
        rotulo: "El menú: está en Bandeja",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Chats lo encuentras dentro de Bandeja, al lado de Llamadas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    lista: {
        rotulo: "Las pastillas filtran la lista",
        texto: "Las pastillas filtran la lista: Mías son las que te asignaron, Sin leer las que tienen mensajes nuevos, y En espera las que piden una persona.",
    },
    seleccion: {
        rotulo: "Varias conversaciones a la vez",
        texto: "Si pulsas la foto de una conversación, la marcas, y arriba sale lo que puedes hacer con todas las que marques a la vez.",
    },
    cabecera: {
        rotulo: "La cabecera: todo lo de ese cliente",
        texto: "Al abrir una conversación, en la cabecera asignas el asesor, creas un recordatorio o una cita, y mueves al cliente por las etapas del embudo.",
    },
    acciones: {
        rotulo: "Acciones y macros",
        texto: "En Acciones la transfieres a otro asesor o la resuelves cuando ya la atendiste, y en Macros haces varias cosas de un solo clic.",
    },
    mensajes: {
        rotulo: "Responde, reacciona o traduce un mensaje",
        texto: "Sobre cada mensaje respondes citándolo, y en sus tres puntos reaccionas, lo reenvías o lo traduces si viene en otro idioma.",
    },
    escribir: {
        rotulo: "La barra de escribir",
        texto: "Abajo escribes tu respuesta: con la barra salen tus respuestas rápidas, y con el clip adjuntas una imagen o un documento.",
    },
    ia: {
        rotulo: "La IA, la nota interna y la sugerencia",
        texto: "Este interruptor enciende o pausa la inteligencia artificial en esta conversación, el candado deja una nota interna que el cliente no ve, y el destello te sugiere una respuesta.",
    },
    ficha: {
        rotulo: "La ficha del contacto",
        texto: "El último botón de la cabecera abre la ficha del contacto, con sus datos y sus notas, sin tapar la conversación.",
    },
    llamada: {
        rotulo: "Llama por WhatsApp sin salir del chat",
        texto: "Y con el teléfono verde lo llamas por WhatsApp: la llamada sale en una tarjeta que puedes plegar, y al terminar anotas cómo fue. Así se trabaja con Chats.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
