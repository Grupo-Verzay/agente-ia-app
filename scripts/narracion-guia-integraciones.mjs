/**
 * Lo que se DICE en el vídeo de la guía de Integrar URLs, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads y de Mis notas: una frase por idea,
 * como se habla en una llamada, con lo que se hace en pantalla DENTRO de la
 * frase —el guion de `capturar-guia-integraciones.mjs` pulsa en la palabra que
 * lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría después de un
 * silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-integraciones.test.mjs`) comprueba que el guion
 * las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Integrar URLs: tus apps dentro de cada chat",
        texto: "Esta es la pantalla de Integrar URLs: aquí pones tus apps web favoritas para abrirlas dentro de cada chat, sin cambiar de ventana.",
    },
    menu: {
        rotulo: "El menú: Integrar URLs está en Apps Externas",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, e Integrar URLs la encuentras dentro de Apps Externas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    agregar: {
        rotulo: "Agrega una app: nombre y dirección",
        texto: "Con el botón Nuevo agregas una app: le pones un nombre, pegas su dirección, y al pulsar Agregar ya queda en la lista.",
    },
    enLosChats: {
        rotulo: "Tu app, como pestaña de cada chat",
        texto: "Ahora abre cualquier chat: tu app sale como una pestaña más, al lado de Mensajes y Notas, y se abre ahí mismo sin salir de la conversación.",
    },
    editar: {
        rotulo: "Ábrela aparte o edítala",
        texto: "De vuelta en la lista, con la flecha la abres en otra pestaña y con el lápiz le cambias el nombre o la dirección.",
    },
    ordenar: {
        rotulo: "Ordena las pestañas y busca tus apps",
        texto: "Arrastra cada fila por sus puntos para decidir el orden de las pestañas, y con el buscador encuentras una app por su nombre.",
    },
    cierre: {
        rotulo: "Elimínala cuando ya no la uses",
        texto: "Y si ya no la usas, pulsa la papelera y confirma: deja de salir en tus chats. Así se trabaja con Integrar URLs.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [
    [/\bURLs\b/g, "u erre eles"],
    [/\bWhatsApp\b/g, "guatsap"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
