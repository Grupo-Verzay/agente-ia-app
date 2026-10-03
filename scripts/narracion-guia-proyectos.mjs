/**
 * Lo que se DICE en el vídeo de la guía de Proyectos, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-proyectos.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-proyectos.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Proyectos: el trabajo de tu equipo",
        texto: "Esta es la pantalla de Proyectos: cada tarjeta es un proyecto, con su estado, su equipo, su fecha límite y cuánto trabajo le queda.",
    },
    menu: {
        rotulo: "El menú: está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Proyectos lo encuentras dentro de Panel.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    filtros: {
        rotulo: "Busca y filtra por estado o responsable",
        texto: "Con el buscador encuentras un proyecto por su nombre, y con estos dos desplegables lo filtras por su estado o por quién lo lleva.",
    },
    carpetas: {
        rotulo: "Carpetas y orden a tu gusto",
        texto: "Las carpetas agrupan tus proyectos: pulsa una para ver solo los suyos, y arrastra una tarjeta por su asa para cambiarla de sitio.",
    },
    crear: {
        rotulo: "Crea un proyecto con su equipo",
        texto: "Con Nuevo creas un proyecto: le pones nombre, la fecha límite, quién es el responsable y quiénes trabajan en él.",
    },
    tablero: {
        rotulo: "El tablero: cinco columnas",
        texto: "Al pulsar una tarjeta se abre su tablero: las tareas van por columnas, de por hacer a hecho, y las mueves arrastrándolas.",
    },
    vencimiento: {
        rotulo: "El color de la fecha y su filtro",
        texto: "La fecha de cada tarea va en rojo si ya se pasó y en ámbar si vence hoy o mañana, y con este filtro te quedas solo con las vencidas.",
    },
    tarea: {
        rotulo: "La tarea: tipo, fecha, responsable y archivos",
        texto: "Al abrir una tarea ves su tipo, para cuándo es, quién la lleva, sus archivos y la conversación del equipo sobre ella.",
    },
    cierre: {
        rotulo: "Así se trabaja con Proyectos",
        texto: "La flecha te devuelve a tus proyectos. Así se trabaja con Proyectos.",
    },
};

const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

/** Cómo se le pasa el texto a la voz: igual que en las demás guías. */
export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
