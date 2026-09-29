/**
 * Lo que se DICE en el vídeo de la guía de Leads, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee. La voz de
 * antes (espeak) lee letra por letra lo que no es español —«Leads» sonaría
 * «le-ads»—, así que para ella lo que se pronuncia pasa por `comoSeDice`;
 * Cedar lo lee bien tal cual.
 *
 * # El ritmo: frases que ENLAZAN, no trozos sueltos
 *
 * Cada frase lleva dentro lo que se hace en pantalla mientras suena, y el
 * guion (`capturar-guia-leads.mjs`) pulsa en la palabra que lo nombra
 * (`alDecir`). Por eso «Total vuelve a mostrarlos todos» y «Púlsalo otra vez»
 * dejaron de ser frases aparte: dichas sueltas, cada una arrancaba después de
 * un silencio y la narración sonaba cortada. Una frase por idea, como se habla
 * en una llamada.
 *
 * Las frases hablan de lo que la pantalla tiene de verdad —el menú de la
 * izquierda, la barra de arriba, los contadores, el buscador, el interruptor
 * del agente, Exportar CSV, «+ Nuevo» y el menú «⋯» de acciones masivas— y el
 * banco (`lib/__tests__/video-guia-leads.test.mjs`) comprueba que el guion las
 * dice todas y en este orden, que es el de las secciones de la guía.
 */
export const NARRACION = {
    intro: {
        rotulo: "Leads: todos tus contactos de WhatsApp",
        texto: "Esta es la pantalla de Leads: aquí tienes, en una sola lista, todos los contactos que te han escrito por WhatsApp.",
    },
    menu: {
        rotulo: "El menú: Leads está en Contactos",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Leads lo encuentras dentro de Contactos.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    contadores: {
        rotulo: "Los contadores también filtran",
        texto: "Los contadores también sirven de filtro: si tocas Clientes inactivos, la lista se queda solo con esos, y con Total vuelves a verlos todos.",
    },
    buscar: {
        rotulo: "Busca por nombre o por número",
        texto: "Con el buscador encuentras a cualquier contacto por su nombre o por su número.",
    },
    agente: {
        rotulo: "Enciende o apaga la IA para un contacto",
        texto: "Este interruptor enciende o apaga la inteligencia artificial solo para este contacto: apagado, deja de responderle y lo atiende una persona; lo pulsas otra vez y vuelve a encenderse.",
    },
    exportar: {
        rotulo: "Exporta todos tus contactos a CSV",
        texto: "Con Exportar descargas todos tus contactos en un archivo CSV, que se abre en Excel.",
    },
    nuevo: {
        rotulo: "Crea un contacto nuevo",
        texto: "Con el botón Nuevo creas un contacto: eliges la línea, escribes el número y el nombre.",
    },
    crear: {
        rotulo: "Crear lo guarda; Cancelar lo descarta",
        texto: "Con Crear queda guardado en la lista; aquí lo cancelamos, porque es solo un ejemplo.",
    },
    masivas: {
        rotulo: "Acciones masivas: el menú de los tres puntos",
        texto: "Y en los tres puntos del final están las acciones masivas: exportar a Excel o a Google Sheets, activar o desactivar a todos tus clientes a la vez, y las de riesgo alto, que borran en bloque.",
    },
    cierre: {
        rotulo: "Siempre pide confirmación",
        texto: "Cada una te pide confirmación antes de aplicarse, así que siempre puedes cancelar. Así se trabaja con Leads.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena. */
const PRONUNCIACION = [
    [/\bLeads\b/g, "Lids"],
    [/\bWhatsApp\b/g, "guatsap"],
    [/\bCSV\b/g, "se, ese, uve"],
    [/\bIA\b/g, "i, a"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
