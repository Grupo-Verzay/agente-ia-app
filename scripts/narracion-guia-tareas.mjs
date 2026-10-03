/**
 * Lo que se DICE en el vídeo de la guía de Mis tareas, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-tareas.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-tareas.test.mjs`) comprueba que el guion las dice
 * todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Mis tareas: tus pendientes en un sitio",
        texto: "Esta es la pantalla de Mis tareas: aquí tienes las llamadas, los seguimientos y las reuniones de tu equipo, ordenados para que no se te pase ninguno.",
    },
    menu: {
        rotulo: "El menú: está en Herramientas",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Mis tareas lo encuentras dentro de Herramientas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    lista: {
        rotulo: "La lista, agrupada por fecha",
        texto: "La lista agrupa tus tareas por cuándo vencen: arriba las vencidas, en rojo, después las de hoy, las de mañana, las de esta semana y las de más adelante.",
    },
    metricas: {
        rotulo: "Las cifras: pendientes, vencidas y para hoy",
        texto: "Arriba tienes tres cifras: cuántas te quedan pendientes, cuántas se vencieron y cuántas son para hoy.",
    },
    kanban: {
        rotulo: "El Kanban: una columna por tipo",
        texto: "Con Kanban las ves por tipo: seguimientos, llamadas, reuniones, correos y tareas, cada uno en su columna.",
    },
    automatizaciones: {
        rotulo: "Automatizaciones que se lanzan solas",
        texto: "El engranaje de una columna abre sus automatizaciones: lo que pasa solo cada vez que se crea una tarea de ese tipo, como avisar al asesor o mandarle un mensaje al cliente.",
    },
    crear: {
        rotulo: "Crea una con su tipo, fecha y asesor",
        texto: "Con Nuevo creas una tarea: eliges el tipo, escribes qué hay que hacer, la fecha y quién la hace, y al crearla aparece en su grupo.",
    },
    completar: {
        rotulo: "Complétala con su tiempo y su resultado",
        texto: "Con el círculo verde la completas: apuntas cuánto tiempo tomó, su resultado, y de paso programas la siguiente para la próxima semana.",
    },
    cierre: {
        rotulo: "Cancélala o elimínala, con confirmación",
        texto: "La X la cancela y la papelera la elimina, siempre con confirmación. Así se trabaja con Mis tareas.",
    },
};

const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

/** Cómo se le pasa el texto a la voz: igual que en las demás guías. */
export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
