/**
 * Lo que se DICE en el vídeo de la guía de Respuestas Rápidas, frase a frase,
 * en el orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se
 * lee abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-respuestas-rapidas.mjs` pulsa
 * en la palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-respuestas-rapidas.test.mjs`) comprueba que el
 * guion las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Respuestas Rápidas: tus mensajes de siempre",
        texto: "Esta es la pantalla de Respuestas Rápidas: aquí guardas los mensajes que escribes una y otra vez, para enviarlos en segundos desde cualquier chat.",
    },
    menu: {
        rotulo: "El menú: está en Automatizaciones",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Respuestas Rápidas la encuentras dentro de Automatizaciones.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    crear: {
        rotulo: "Crea una respuesta con su atajo",
        texto: "Con Nuevo creas una: eliges Texto simple, le pones un atajo corto, la categoría y el mensaje, y al crearla sale la primera de la lista.",
    },
    flujo: {
        rotulo: "Las de flujo hacen que arranque un flujo",
        texto: "Si una respuesta tiene que hacer más que enviar un texto, en vez del mensaje ejecuta un flujo, como esta de Medios de pago.",
    },
    editar: {
        rotulo: "Edítala sin abrir nada",
        texto: "Para cambiarla no abres ninguna ventana: pulsas el mensaje, lo corriges, y con Enter se guarda solo.",
    },
    filtrar: {
        rotulo: "Las pastillas filtran por tipo",
        texto: "Las pastillas filtran por tipo: con Ejecutan flujo ves solo esas, y con Todas vuelves a verlas todas.",
    },
    buscar: {
        rotulo: "Búscala por su atajo o por lo que dice",
        texto: "Con el buscador la encuentras por su atajo o por lo que dice, aunque no escribas las tildes.",
    },
    ordenar: {
        rotulo: "Arrástrala para ordenar la lista",
        texto: "Y para dejar arriba las que más usas, las arrastras por el asa: el orden se guarda solo, y es el mismo en tus chats.",
    },
    eliminar: {
        rotulo: "Elimínala desde sus tres puntos",
        texto: "Si una ya no te sirve, la eliminas desde sus tres puntos, y siempre te pide confirmación antes de borrarla.",
    },
    chat: {
        rotulo: "En un chat: la barra y el atajo",
        texto: "Y en tus chats las tienes a mano: abres la conversación, tecleas la barra y el atajo, y el mensaje queda listo para enviar.",
    },
    cierre: {
        rotulo: "El rayo: todas tus respuestas",
        texto: "Con el rayo ves todas tus respuestas, también las que ejecutan un flujo, y las envías con un toque. Así se trabaja con Respuestas Rápidas.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
