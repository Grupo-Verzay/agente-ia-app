/**
 * Lo que se DICE en el vídeo de la guía de Agenda, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads: una frase por idea, con lo que se
 * hace en pantalla DENTRO de la frase (`alDecir`). La frase de la barra de
 * arriba es LA MISMA que en todas las guías, letra por letra.
 *
 * El banco (`lib/__tests__/video-guia-agenda.test.mjs`) comprueba que el guion
 * las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Agenda: tus citas en un solo lugar",
        texto: "Esta es Agenda: aquí ves las citas de tus clientes, decides en qué horarios atiendes y compartes un enlace para que te reserven solos.",
    },
    menu: {
        rotulo: "El menú: está en Contactos",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Agenda la encuentras dentro de Contactos.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    calendario: {
        rotulo: "El calendario: día, semana o mes",
        texto: "El calendario abre en el día de hoy; con Semana ves toda la semana, y cada color es el estado de la cita.",
    },
    estado: {
        rotulo: "Abre una cita y cambia su estado",
        texto: "Al pulsar una cita se abre su ficha: en Estado la pasas a Confirmada, y desde ahí también puedes reagendarla a otra fecha.",
    },
    disponibilidad: {
        rotulo: "Disponibilidad: en qué horarios atiendes",
        texto: "En Disponibilidad pones los horarios en que atiendes cada día, con uno o varios periodos.",
    },
    enlace: {
        rotulo: "Tu enlace público de reserva",
        texto: "Y con Copiar enlace compartes tu página de reserva: tu cliente elige el servicio, el día y la hora, y la cita entra sola en tu agenda.",
    },
    kanban: {
        rotulo: "El Kanban: una columna por estado",
        texto: "En Kanban ves las mismas citas en columnas por estado, y para cambiar una de estado la arrastras a otra columna.",
    },
    servicios: {
        rotulo: "Tus servicios",
        texto: "En Servicios guardas lo que ofreces, con el mensaje que recibe el cliente al agendar.",
    },
    recordatorios: {
        rotulo: "Recordatorios antes de la cita",
        texto: "En Recordatorios decides qué mensaje le llega a tu cliente y cuánto antes de la cita, por ejemplo un día antes.",
    },
    formulario: {
        rotulo: "El formulario y sus registros",
        texto: "En Formulario armas las preguntas que responde tu cliente al reservar, y en Registros ves lo que contestó cada uno.",
    },
    ajustes: {
        rotulo: "Ajustes: la reunión y Google Calendar",
        texto: "Y en Ajustes pones cuánto dura cada cita, tu enlace de reunión y el aviso mínimo, y conectas tu Google Calendar. Así se trabaja con Agenda.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
