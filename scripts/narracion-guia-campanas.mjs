/**
 * Lo que se DICE en el vídeo de la guía de Campañas, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-campanas.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-campanas.test.mjs`) comprueba que el guion
 * las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Campañas: un mensaje a muchos contactos",
        texto: "Esta es la pantalla de Campañas: aquí mandas un mismo mensaje de WhatsApp a muchos contactos, sin escribirles uno por uno.",
    },
    menu: {
        rotulo: "El menú: está en Automatizaciones",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Campañas lo encuentras dentro de Automatizaciones.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    lista: {
        rotulo: "La lista: cada campaña con lo que tiene puesto",
        texto: "En la lista ves cada campaña con a cuántos contactos les llega, su fecha y su flujo, y con el buscador la encuentras por su título o por el nombre de un contacto.",
    },
    kanban: {
        rotulo: "El tablero: en qué punto está cada una",
        texto: "Con Kanban las ves en columnas: las pendientes, las de hoy, las de mañana, las recurrentes, las enviadas y las vencidas.",
    },
    crear: {
        rotulo: "Crea una con su título y su mensaje",
        texto: "Con Nuevo creas una: le pones un título y el mensaje, y con las variables cada contacto recibe su propio nombre.",
    },
    adjunto: {
        rotulo: "Súmale un archivo o una nota de voz",
        texto: "Le puedes sumar una foto, un video o un documento, o grabar ahí mismo una nota de voz con tu micrófono.",
    },
    fecha: {
        rotulo: "Elige la fecha y la hora: sale una sola vez",
        texto: "Eliges la fecha en el calendario y la hora; la campaña sale una sola vez.",
    },
    segmentar: {
        rotulo: "Segmenta por estado y etiquetas",
        texto: "Con la segmentación eliges a quién le llega: por estado del lead, por puntaje o por etiquetas, y al aplicar se marcan esos contactos.",
    },
    contactos: {
        rotulo: "Los contactos y un flujo",
        texto: "También puedes sumar contactos a mano, y elegir un flujo que arranca después del mensaje.",
    },
    pausa: {
        rotulo: "Una pausa entre envíos, y un aviso antes de crear",
        texto: "La pausa entre envíos deja unos segundos entre un mensaje y otro, para cuidar tu línea; y antes de crearla, un aviso te recuerda el riesgo de bloqueo.",
    },
    historial: {
        rotulo: "El historial: qué salió y qué falló",
        texto: "El botón de envíos abre su historial: qué salió, qué está pendiente y qué falló, y desde ahí reintentas, pausas o reanudas.",
    },
    cierre: {
        rotulo: "Edítala o elimínala cuando quieras",
        texto: "Con el lápiz la editas, y con la papelera la eliminas, siempre con confirmación. Así se trabaja con Campañas.",
    },
};

const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

/** Cómo se le pasa el texto a la voz: igual que en las demás guías. */
export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
