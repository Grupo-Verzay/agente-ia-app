/**
 * Lo que se DICE en el vídeo de la guía de Mis formularios, frase a frase, en
 * el orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se
 * lee abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-formularios.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-formularios.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Mis formularios: tus clientes responden desde un enlace",
        texto: "Esta es la pantalla de Mis formularios: formularios que tus clientes llenan desde un enlace, y todas sus respuestas en un solo sitio.",
    },
    menu: {
        rotulo: "El menú: Mis formularios está en Apps Externas",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Mis formularios lo encuentras dentro de Apps Externas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    lista: {
        rotulo: "Cada formulario, una tarjeta",
        texto: "Cada formulario es una tarjeta, y las cifras de arriba filtran la lista: los activos y los inactivos.",
    },
    crear: {
        rotulo: "Crea un formulario: el enlace se escribe solo",
        texto: "Con el botón Nuevo creas uno: le pones un título, el enlace se escribe solo, y pulsas crear formulario.",
    },
    campos: {
        rotulo: "Agrega las preguntas en el editor",
        texto: "En el editor agregas las preguntas: escribes la pregunta, eliges el tipo de campo y marcas si es obligatoria.",
    },
    whatsapp: {
        rotulo: "Al enviarlo, tu cliente pasa a tu WhatsApp",
        texto: "Si enciendes la redirección a WhatsApp, al enviarlo tu cliente pasa a tu chat con un mensaje ya escrito con sus respuestas.",
    },
    url: {
        rotulo: "Un enlace corto, fácil de compartir",
        texto: "Y con la URL personalizada le das un enlace corto, fácil de compartir.",
    },
    publico: {
        rotulo: "Así lo ve tu cliente",
        texto: "Así lo ve tu cliente: lo llena sin tener cuenta, pulsa enviar formulario, y listo.",
    },
    registros: {
        rotulo: "Cada respuesta llega a Registros",
        texto: "Cada respuesta llega a Registros, con su estado en Google Sheets, y en ver detalle lees todo lo que contestó.",
    },
    cierre: {
        rotulo: "Desactívalo sin perder nada",
        texto: "Y si quieres pausarlo, lo desactivas sin perder ni una respuesta. Así se trabaja con Mis formularios.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [
    [/\bWhatsApp\b/g, "guatsap"],
    [/\bURL\b/g, "u erre ele"],
    [/\bGoogle Sheets\b/g, "gúgol shits"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
