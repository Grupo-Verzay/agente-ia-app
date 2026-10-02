/**
 * Lo que se DICE en el vídeo de la guía de Recordatorios, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-recordatorios.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-recordatorios.test.mjs`) comprueba que el guion
 * las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Recordatorios: mensajes que salen solos",
        texto: "Esta es la pantalla de Recordatorios: aquí programas un mensaje de WhatsApp para un contacto, y sale solo a la hora que tú elijas.",
    },
    menu: {
        rotulo: "El menú: está en Automatizaciones",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Recordatorios lo encuentras dentro de Automatizaciones.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    lista: {
        rotulo: "La lista: cada recordatorio con lo que tiene puesto",
        texto: "En la lista ves cada recordatorio con su contacto, su fecha y su flujo, y con el buscador lo encuentras por su título o por el nombre del contacto.",
    },
    kanban: {
        rotulo: "El tablero: en qué punto está cada uno",
        texto: "Con Kanban los ves en columnas: los pendientes, los de hoy, los de mañana, los que se repiten, los enviados y los vencidos.",
    },
    crear: {
        rotulo: "Crea uno con su título, mensaje y contacto",
        texto: "Con Nuevo creas uno: le pones un título, el mensaje, y eliges el contacto que lo va a recibir.",
    },
    adjunto: {
        rotulo: "Súmale un archivo o una nota de voz",
        texto: "Le puedes sumar una foto, un video o un documento, o grabar ahí mismo una nota de voz con tu micrófono.",
    },
    fecha: {
        rotulo: "Elige la fecha, la hora y si se repite",
        texto: "Eliges la fecha en el calendario, la hora, y si quieres que se repita cada semana, cada mes o cada año.",
    },
    flujo: {
        rotulo: "Un flujo que arranca justo después",
        texto: "Y si quieres, un flujo que arranca justo después del mensaje; al crearlo, aparece en la lista.",
    },
    historial: {
        rotulo: "El historial: qué salió y qué falló",
        texto: "El botón de envíos abre su historial: qué salió, qué está pendiente y qué falló, y desde ahí reintentas o pausas.",
    },
    cierre: {
        rotulo: "Edítalo o elimínalo cuando quieras",
        texto: "Con el lápiz lo editas, y con la papelera lo eliminas, siempre con confirmación. Así se trabaja con Recordatorios.",
    },
};

const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

/** Cómo se le pasa el texto a la voz: igual que en las demás guías. */
export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
