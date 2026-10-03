/**
 * Lo que se DICE en el vídeo de la guía de Reportes, frase a frase, en el orden
 * en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee abajo
 * mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que las demás narraciones: una frase por idea, como se habla en
 * una llamada, con lo que se hace en pantalla DENTRO de la frase —el guion de
 * `capturar-guia-reportes.mjs` pulsa en la palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y su audio sale de la misma
 * entrada de la caché.
 *
 * El vídeo genera un reporte (lo contesta el doble: a nadie le llega nada) y NO
 * borra nada: señala la papelera y cierra la confirmación con «Volver».
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-reportes.test.mjs`) lo comprueba.
 */
export const NARRACION = {
    intro: {
        rotulo: "Reportes: cómo le fue a tu negocio cada semana",
        texto: "Esta es la pantalla de Reportes: aquí ves cómo le fue a tu negocio cada semana, con un resumen escrito por la inteligencia artificial.",
    },
    menu: {
        rotulo: "El menú: está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Reportes lo encuentras dentro de Panel, con el nombre Resumen.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    generar: {
        rotulo: "Generar reporte: la IA resume tu semana",
        texto: "Con Generar reporte, la inteligencia artificial revisa los últimos siete días y escribe el reporte, que sale el primero de la lista.",
    },
    leer: {
        rotulo: "Ábrelo: resumen, métricas y calidad",
        texto: "Al abrirlo ves el resumen, las métricas de la semana, la calidad de la atención y la actividad, como pedidos y pagos.",
    },
    whatsapp: {
        rotulo: "Te llega por WhatsApp",
        texto: "Además te llega por WhatsApp: la marca verde de Enviado dice que salió, y cada semana se genera y se envía solo.",
    },
    exportar: {
        rotulo: "Exportar y borrar",
        texto: "Con Exportar te bajas todos los reportes en Excel, y con la papelera borras uno; siempre te pregunta antes.",
    },
    iaNoSupo: {
        rotulo: "Lo que la IA no supo responder",
        texto: "Debajo están las preguntas que tu agente no supo responder, ordenadas por cuántas veces salieron, para que se las enseñes.",
    },
    registros: {
        rotulo: "Registros, filtrados por tipo",
        texto: "En la pestaña Registros ves lo que la inteligencia artificial anota de tus clientes, y lo filtras por tipo: pedidos, pagos, reclamos y más.",
    },
    calidad: {
        rotulo: "Calidad: el puntaje de cada asesor",
        texto: "Y en Calidad ves el puntaje de cada asesor: pulsa uno y abajo quedan sus conversaciones, con lo que se puede mejorar en cada una. Así se trabaja con Reportes.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
