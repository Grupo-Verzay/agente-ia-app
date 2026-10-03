/**
 * Lo que se DICE en el vídeo de la guía de Cobros, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-cobros.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-cobros.test.mjs`) comprueba que el guion las dice
 * todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Cobros: tu cartera de clientes",
        texto: "Esta es la pantalla de Cobros: aquí tienes a los clientes que te pagan cada mes, y la plataforma les recuerda el pago por WhatsApp.",
    },
    menu: {
        rotulo: "El menú: está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Cobros lo encuentras dentro de Panel.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    cartera: {
        rotulo: "La cartera, con lo urgente arriba",
        texto: "La cartera pone arriba lo que pide algo de ti, y con los filtros ves solo los comprobantes, las vencidas, las que están por vencer o las que están al día.",
    },
    cobrarAhora: {
        rotulo: "Cobrar ahora, sin esperar al recordatorio",
        texto: "Con los tres puntos de una deuda abres su menú, y con Cobrar ahora le mandas el recordatorio en el momento, sin esperar al día que toca.",
    },
    comprobante: {
        rotulo: "Llegó el comprobante: los recordatorios paran",
        texto: "Cuando el cliente te manda el comprobante, lo marcas, y los recordatorios paran mientras lo revisas.",
    },
    confirmar: {
        rotulo: "Confirmar el pago: salta al ciclo siguiente",
        texto: "Con Confirmar pago la deuda queda al día y el vencimiento salta solo al mes siguiente, sin volver a crearla.",
    },
    historial: {
        rotulo: "El historial: cada pago con sus fechas",
        texto: "En la columna Ciclo ves cuántos meses lleva pagando, y en el historial cada pago con sus fechas.",
    },
    crear: {
        rotulo: "Crea una deuda con sus datos de pago",
        texto: "Con Nuevo registras una deuda: el cliente, su WhatsApp, qué le cobras, el monto y cuándo vence, y si quieres, su cuenta de cobro y sus propios datos de pago.",
    },
    editarYEliminar: {
        rotulo: "Edítala o elimínala, con confirmación",
        texto: "Desde el mismo menú la editas o la eliminas, siempre con confirmación.",
    },
    recordatorios: {
        rotulo: "Cuándo se recuerda: antes, el día y después",
        texto: "En Configuración escribes cómo te pagan y decides cuándo se recuerda: unos días antes, el día que vence y unos días después.",
    },
    mensajes: {
        rotulo: "Un mensaje por aviso, con sus variables",
        texto: "Cada aviso tiene su mensaje, con variables que se cambian solas por los datos de cada cliente. Así se cobra con la plataforma.",
    },
};

const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

/** Cómo se le pasa el texto a la voz: igual que en las demás guías. */
export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
