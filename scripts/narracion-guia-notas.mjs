/**
 * Lo que se DICE en el vídeo de la guía de Mis notas, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-notas.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-notas.test.mjs`) comprueba que el guion las dice
 * todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Mis notas: tu cuaderno dentro de la plataforma",
        texto: "Esta es la pantalla de Mis notas: tu cuaderno dentro de la plataforma, con tus apuntes a mano mientras atiendes a tus clientes.",
    },
    menu: {
        rotulo: "El menú: Mis notas está en Herramientas",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Mis notas la encuentras dentro de Herramientas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    crear: {
        rotulo: "Crea una nota: se guarda sola",
        texto: "Con el botón más creas una nota: le pones un título, escribes debajo, y se guarda sola mientras escribes.",
    },
    formato: {
        rotulo: "Negrita, títulos y listas de tareas",
        texto: "Con la barra de formato pones negrita, títulos o una lista de tareas, y marcas cada tarea cuando la terminas.",
    },
    carpetas: {
        rotulo: "Ordena tus notas en carpetas",
        texto: "Tus notas se ordenan en carpetas de colores: pulsas una y ves solo lo que tiene dentro.",
    },
    buscar: {
        rotulo: "Busca en el título y en el texto",
        texto: "Arriba del panel están las pestañas, y con el buscador encuentras cualquier nota por su título o por lo que dice, aunque no escribas las tildes.",
    },
    iconoYColor: {
        rotulo: "Icono y color para distinguirla",
        texto: "Con el icono y el color distingues una nota de otra de un vistazo.",
    },
    contacto: {
        rotulo: "Vincúlala a un contacto de WhatsApp",
        texto: "También puedes vincularla a un contacto de WhatsApp, y desde la nota abres su chat.",
    },
    compartir: {
        rotulo: "Compártela con tu equipo",
        texto: "Con compartir decides quién de tu equipo la ve y quién puede editarla.",
    },
    cierre: {
        rotulo: "Archívala sin perderla",
        texto: "Y cuando ya no la necesites a la vista, archívala: queda en el Archivo y la recuperas cuando quieras. Así se trabaja con Mis notas.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
