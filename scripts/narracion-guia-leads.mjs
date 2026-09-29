/**
 * Lo que se DICE en el vídeo de la guía de Leads, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee. La voz lee
 * letra por letra lo que no es español —«Leads» sonaría «le-ads»—, así que lo
 * que se pronuncia pasa por `comoSeDice`.
 *
 * Las frases hablan de lo que la pantalla tiene de verdad —el menú de la
 * izquierda, la barra de arriba, los contadores, el buscador, el interruptor
 * del agente, Exportar CSV y «+ Nuevo»— y el banco
 * (`lib/__tests__/video-guia-leads.test.mjs`) comprueba que el guion las dice
 * todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Leads: todos tus contactos de WhatsApp",
        texto: "Esta es la pantalla de Leads. Aquí están todos los contactos que te han escrito por WhatsApp, en una sola lista.",
    },
    menu: {
        rotulo: "El menú: Leads está en Contactos",
        texto: "A la izquierda está el menú de la plataforma. Con estas dos flechas lo abres: Leads está dentro de Contactos.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba tienes el buscador de toda la plataforma, el botón de soporte y tus notificaciones. Esa barra es la misma en todas las pantallas.",
    },
    contadores: {
        rotulo: "Los contadores también filtran",
        texto: "Los contadores de arriba también sirven de filtro. Al pulsar Clientes inactivos, la lista se queda solo con esos contactos.",
    },
    todos: {
        rotulo: "Total vuelve a mostrarlos todos",
        texto: "Y con Total vuelves a verlos todos.",
    },
    buscar: {
        rotulo: "Busca por nombre o por número",
        texto: "Con el buscador encuentras a cualquier contacto por su nombre o por su número.",
    },
    agente: {
        rotulo: "Enciende o apaga la IA para un contacto",
        texto: "Este interruptor enciende o apaga la inteligencia artificial solo para este contacto. Al apagarlo, deja de responderle y lo atiende una persona.",
    },
    agenteOtraVez: {
        rotulo: "Enciende o apaga la IA para un contacto",
        texto: "Púlsalo otra vez para volver a encenderla.",
    },
    exportar: {
        rotulo: "Exporta todos tus contactos a CSV",
        texto: "Con Exportar descargas todos tus contactos en un documento CSV, que se abre en Excel.",
    },
    nuevo: {
        rotulo: "Y crea un contacto nuevo",
        texto: "Y con el botón Nuevo creas un contacto: eliges la línea, escribes el número y el nombre.",
    },
    cierre: {
        rotulo: "Crear lo guarda; Cancelar lo descarta",
        texto: "Con Crear queda guardado en la lista. Aquí lo cancelamos, porque es solo un ejemplo. Así se trabaja con Leads.",
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
