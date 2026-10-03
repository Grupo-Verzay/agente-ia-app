/**
 * Lo que se DICE en el vídeo de la guía de Calificación, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads: una frase por idea, con lo que se
 * hace en pantalla DENTRO de la frase —el guion de
 * `capturar-guia-calificacion.mjs` pulsa en la palabra que lo nombra
 * (`alDecir`)—. La frase de la barra de arriba es LA MISMA que en Leads, letra
 * por letra: su audio sale de la misma entrada de la caché.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-calificacion.test.mjs`) lo comprueba.
 */
export const NARRACION = {
    intro: {
        rotulo: "Calificación: tus contactos por etapa",
        texto: "Esta es la pantalla de Calificación: tus contactos ordenados en un tablero, de los fríos a los listos para comprar.",
    },
    menu: {
        rotulo: "El menú: está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Calificación la encuentras dentro de Panel.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    tablero: {
        rotulo: "Seis columnas, una por etapa",
        texto: "Hay seis columnas: Sin clasificar, Frío, Tibio, Caliente, Finalizado y Descartado; cada tarjeta es un contacto, con su puntaje y el tiempo que lleva ahí.",
    },
    buscar: {
        rotulo: "Busca por nombre o número",
        texto: "Con el buscador encuentras a cualquiera por su nombre o su número, y el contador te dice cuántos ves.",
    },
    arrastrar: {
        rotulo: "Arrastra para cambiar la etapa",
        texto: "Para cambiarle la etapa a un contacto, arrastras su tarjeta a otra columna, y se guarda al soltarla.",
    },
    calificar: {
        rotulo: "La IA lo califica del 0 al 100",
        texto: "Con el destello, la IA lee lo que ha hablado contigo y le pone un puntaje del cero al cien, con el motivo debajo; y con Calificar con IA los califica a todos.",
    },
    filtrar: {
        rotulo: "Filtra por puntaje",
        texto: "Arriba filtras por puntaje: con Alto ves solo a los que van bien encaminados, y pulsándolo otra vez vuelve el tablero entero.",
    },
    automatizaciones: {
        rotulo: "Lo que pasa solo al entrar en una columna",
        texto: "Y con el engranaje de cada columna creas automatizaciones: lo que pasa solo cuando un contacto entra ahí, como enviarle un mensaje o avisar a tu asesor. Así se trabaja con Calificación.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
