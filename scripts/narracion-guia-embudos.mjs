/**
 * Lo que se DICE en el vídeo de la guía de Embudos, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-embudos.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-embudos.test.mjs`) comprueba que el guion las dice
 * todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Embudos: tus conversaciones por etapas",
        texto: "Esta es la pantalla de Embudos: aquí ves todas tus conversaciones ordenadas por etapas, desde que llegan nuevas hasta que se ganan o se pierden.",
    },
    menu: {
        rotulo: "El menú: está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Embudos lo encuentras dentro de Panel.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    tablero: {
        rotulo: "Una columna por etapa, una tarjeta por chat",
        texto: "Cada columna es una etapa, con cuántas conversaciones tiene, y cada tarjeta es un contacto con sus etiquetas y el asesor que lo lleva.",
    },
    arrastrar: {
        rotulo: "Arrastra la tarjeta para cambiar de etapa",
        texto: "Para avanzar una conversación, arrastras su tarjeta a la siguiente columna, y los números se ponen al día al momento.",
    },
    selectores: {
        rotulo: "Elige el embudo, la cuenta y el asesor",
        texto: "En la barra eliges qué ver: el embudo, la cuenta, si de la tuya cuelgan otras, y el asesor, para mirar solo lo de una persona.",
    },
    crear: {
        rotulo: "Crea otro embudo con Nuevo",
        texto: "Con Nuevo creas otro embudo, por ejemplo para soporte, y en los tres puntos lo renombras, lo usas por defecto o lo eliminas.",
    },
    etapas: {
        rotulo: "Cambia el nombre, el color y el orden",
        texto: "El engranaje de una columna abre sus etapas: les cambias el nombre, el color y el orden, y las de Nuevo, Ganado y Perdido llevan candado.",
    },
    asesores: {
        rotulo: "Un embudo para cada asesor",
        texto: "En Asignar asesores eliges qué embudo usa cada persona de tu equipo, y sus conversaciones lo siguen.",
    },
    perdido: {
        rotulo: "Vacía Perdido y recupéralo en 30 días",
        texto: "La columna Perdido se vacía con su papelera, y lo vaciado lo recuperas durante treinta días. Así se trabaja con Embudos.",
    },
};

const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

/** Cómo se le pasa el texto a la voz: igual que en las demás guías. */
export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
