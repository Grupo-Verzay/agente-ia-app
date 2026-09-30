/**
 * Lo que se DICE en el vídeo de la guía de Mis macros, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-macros.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-macros.test.mjs`) comprueba que el guion las dice
 * todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Mis macros: varias acciones en un solo botón",
        texto: "Esta es la pantalla de Mis macros: juntas en un solo botón lo que haces una y otra vez con una conversación.",
    },
    menu: {
        rotulo: "El menú: Mis macros está en Automatizaciones",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Mis macros la encuentras dentro de Automatizaciones.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    lista: {
        rotulo: "Tu lista de macros",
        texto: "En la lista ves cada macro con su color, cuántas acciones tiene y cuántas veces la has usado.",
    },
    crear: {
        rotulo: "Crea una macro: nombre, color y acciones",
        texto: "Con Nuevo creas una: le pones un nombre, eliges su color y le agregas acciones, que se hacen en orden, de arriba abajo.",
    },
    acciones: {
        rotulo: "Lo que puede hacer una macro",
        texto:
            "Puede enviar un mensaje, también por otra de tus líneas, una respuesta rápida, un archivo o una nota de voz, " +
            "poner una etiqueta, cambiar la calificación, asignar un asesor, crear una tarea o resolver la conversación.",
    },
    chat: {
        rotulo: "Lánzala en un chat con un clic",
        texto: "Luego, en cualquier conversación de Chats, pulsas Macros, eliges la tuya y todas sus acciones se hacen de una vez.",
    },
    resultado: {
        rotulo: "Te dice qué se hizo",
        texto: "Al terminar te dice qué se hizo, y si alguna acción no salió, cuál y por qué.",
    },
    buscar: {
        rotulo: "Filtra, busca y ordena tus macros",
        texto: "Con Gestionar macros vuelves aquí, donde las filtras entre activas e inactivas, las buscas por su nombre y las arrastras para ordenarlas.",
    },
    cierre: {
        rotulo: "Duplica, desactiva o elimina",
        texto: "Y desde su menú las duplicas, las desactivas sin perderlas o las eliminas. Así se trabaja con Mis macros.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
