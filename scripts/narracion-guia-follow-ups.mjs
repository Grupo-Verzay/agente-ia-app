/**
 * Lo que se DICE en el vídeo de la guía de Follow-ups IA, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads: una frase por idea, como se habla
 * en una llamada, con lo que se hace en pantalla DENTRO de la frase —el guion
 * de `capturar-guia-follow-ups.mjs` pulsa en la palabra que lo nombra
 * (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y su audio sale de la misma entrada
 * de la caché.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-follow-ups.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Follow-ups IA: resumir, clasificar y volver a escribir",
        texto: "Esta es la pantalla de Follow-ups IA: aquí decides cómo la IA resume tus conversaciones, cómo clasifica a tus leads y cuándo les vuelve a escribir.",
    },
    menu: {
        rotulo: "El menú: está en Creación de Flujos",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Follow-ups IA lo encuentras dentro de Creación de Flujos.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    sintetizador: {
        rotulo: "El sintetizador, en cuatro pasos",
        texto: "La primera pestaña es el sintetizador, un asistente de cuatro pasos: el marco base, las reglas globales, los tipos de registro y la previsualización del texto que leerá la IA.",
    },
    clasificacion: {
        rotulo: "La clasificación de leads",
        texto: "En Clasificación de leads explicas qué significa en tu negocio que un lead esté frío, tibio o caliente, y las señales para reconocerlo.",
    },
    estados: {
        rotulo: "Una regla por estado",
        texto: "Y en Follow-ups cada estado tiene su regla, con un interruptor para encenderla o apagarla.",
    },
    tiempos: {
        rotulo: "Cuánto esperar y cuántas veces",
        texto: "Eliges cuánto esperar antes de escribirle y cuántas veces insistir si no responde.",
    },
    horario: {
        rotulo: "A qué hora y qué días",
        texto: "También a qué horas y qué días puede salir el mensaje, para no escribirle a nadie de madrugada.",
    },
    mensajes: {
        rotulo: "El objetivo, el prompt y el respaldo",
        texto: "Luego el objetivo, cómo quieres que escriba la IA, y un mensaje de respaldo por si la IA no puede.",
    },
    biblioteca: {
        rotulo: "Archivos para mandar con el seguimiento",
        texto: "En la biblioteca guardas fotos, vídeos, audios y documentos que la IA puede mandar junto al mensaje.",
    },
    flujo: {
        rotulo: "Un flujo cuando el lead cambia de estado",
        texto: "Y en disparar un flujo eliges uno de tus flujos, que se lanza solo cuando un lead pasa a ese estado.",
    },
    cierre: {
        rotulo: "El resumen, y guardas",
        texto: "Al final, el resumen junta todas las reglas en una línea por estado, y Guardar reglas las guarda de una vez. Así funcionan los Follow-ups IA.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [
    [/\bFollow-ups\b/g, "fólou aps"],
    [/\bIA\b/g, "i a"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
