/**
 * Lo que se DICE en el vídeo de la guía de Crear flujos, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads y de las demás guías: una frase por
 * idea, como se habla en una llamada, con lo que se hace en pantalla DENTRO de
 * la frase —el guion de `capturar-guia-flujos.mjs` pulsa en la palabra que lo
 * nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El banco (`lib/__tests__/video-guia-flujos.test.mjs`) comprueba que el guion
 * las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Crear flujos: respuestas automáticas, paso a paso",
        texto: "Esta es la pantalla de Crear flujos: aquí armas respuestas automáticas, paso a paso, que la plataforma envía sola en tus chats de WhatsApp.",
    },
    menu: {
        rotulo: "El menú: Crear flujos está en Creación de Flujos",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Crear flujos la encuentras dentro de Creación de Flujos.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    tipos: {
        rotulo: "Cuatro tipos: Inicio, IA, Flujo y Chatbot",
        texto: "Hay cuatro tipos de flujo: Inicio da la bienvenida, IA lo lanza la inteligencia artificial, Chatbot responde a una palabra clave, y Flujo lo pones en marcha tú.",
    },
    crear: {
        rotulo: "Crea un flujo: nombre y tipo",
        texto: "Con el botón Nuevo le pones un nombre, eliges el tipo, y al pulsar Crear entras directo al editor.",
    },
    editor: {
        rotulo: "El editor: cada paso es una pieza",
        texto: "En el editor, el más del centro agrega el primer paso: elige Texto y escribe el mensaje que recibirá tu cliente.",
    },
    agregar: {
        rotulo: "El «+» agrega el paso siguiente",
        texto: "Detrás de cada paso hay un más para agregar el siguiente: un mensaje, un menú, una pausa, o una automatización como etiquetar al cliente.",
    },
    seguimientos: {
        rotulo: "Seguimientos: le insistes si no responde",
        texto: "Y con los seguimientos le escribes de nuevo horas o días después, solo si el cliente no ha respondido.",
    },
    cierre: {
        rotulo: "Ordena y listo: el flujo trabaja solo",
        texto: "Pulsa Ordenar para ponerlo todo en fila, y listo: tu flujo ya trabaja solo. Así se crean flujos.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [
    [/\bWhatsApp\b/g, "guatsap"],
    [/\bIA\b/g, "i a"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
