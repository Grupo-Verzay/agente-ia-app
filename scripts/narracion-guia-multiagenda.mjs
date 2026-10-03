/**
 * Lo que se DICE en el vídeo de la guía de Multiagenda, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads y de Agenda: una frase por idea,
 * con lo que se hace en pantalla DENTRO de la frase (`alDecir`). La frase de
 * la barra de arriba es LA MISMA que en todas las guías, letra por letra.
 *
 * El banco (`lib/__tests__/video-guia-multiagenda.test.mjs`) comprueba que el
 * guion las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Multiagenda: las citas de tu equipo",
        texto: "Esta es Multiagenda: la agenda de un equipo, con varios especialistas, cada uno con sus horarios y los servicios que atiende.",
    },
    menu: {
        rotulo: "El menú: está en Integraciones",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Multiagenda la encuentras dentro de Integraciones.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    calendario: {
        rotulo: "El calendario de todo el equipo",
        texto: "El Dashboard abre en el día de hoy, con las citas de todo el equipo en mañana y tarde; con Semana ves la semana entera.",
    },
    estado: {
        rotulo: "Abre una cita y cambia su estado",
        texto: "Al pulsar una cita se abre su ficha: en Estado la pasas a Confirmada, y desde ahí también puedes reagendarla.",
    },
    kanban: {
        rotulo: "El Kanban y sus automatizaciones",
        texto: "En Kanban ves las mismas citas en columnas por estado; las arrastras para cambiarlas, y el engranaje de cada columna guarda lo que pasa solo al entrar en ella.",
    },
    especialistas: {
        rotulo: "Especialistas: horarios y servicios",
        texto: "En Especialistas abres a cada persona del equipo: eliges los servicios que atiende y sus franjas de horario de cada día.",
    },
    servicios: {
        rotulo: "Los servicios del equipo",
        texto: "En Servicios guardas lo que ofrece tu equipo, con su duración, su color y el mensaje que recibe quien lo reserva.",
    },
    recordatorios: {
        rotulo: "Recordatorios por servicio",
        texto: "En Recordatorios cada servicio lleva sus propios mensajes y tú decides cuánto antes de la cita sale cada uno.",
    },
    formulario: {
        rotulo: "Un formulario por servicio",
        texto: "En Formulario armas las preguntas de cada servicio, que tu cliente responde al reservar.",
    },
    ajustes: {
        rotulo: "Ajustes: tu enlace público",
        texto: "Y en Ajustes copias tu enlace público de reservas y pones el tiempo mínimo de anticipación.",
    },
    pagina: {
        rotulo: "La página de reserva de tu cliente",
        texto: "Con ese enlace tu cliente elige el servicio, el especialista, el día y la hora, y la cita entra sola en tu calendario. Así se trabaja con Multiagenda.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
