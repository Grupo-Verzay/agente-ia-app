/**
 * Lo que se DICE en el vídeo de la guía de Mis datos, frase a frase, en el
 * orden en que ocurre en pantalla. Misma forma que la de Leads
 * (`narracion-guia-leads.mjs`): `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena y `texto` lo que se oye, escrito como se lee.
 *
 * Una frase por idea, con lo que se hace en pantalla DENTRO de ella: el guion
 * (`capturar-guia-mis-datos.mjs`) pulsa en la palabra que lo nombra
 * (`alDecir`). Frases sueltas de cuatro palabras son las que dejan la
 * narración cortada.
 *
 * Recorre la pantalla en el orden de las secciones de la guía —el menú, la
 * barra de arriba, las dos opciones, importar una hoja de Google y lo
 * importado, la base de conocimiento y sus bloques, y el «⋯» de cada opción—,
 * y el banco (`lib/__tests__/video-guia-mis-datos.test.mjs`) lo comprueba.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y con el mismo texto la voz sale
 * de la misma caché.
 */
export const NARRACION = {
    intro: {
        rotulo: "Mis datos: la información de tu negocio para tu agente",
        texto: "Esta es la pantalla de Mis datos: aquí le das a tu agente IA la información de tu negocio para que la use al responder.",
    },
    menu: {
        rotulo: "El menú: Mis datos está en Integraciones",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Mis datos lo encuentras dentro de Integraciones.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    opciones: {
        rotulo: "Dos opciones: Google Sheets y Base de conocimiento",
        texto: "Tienes dos opciones: Google Sheets, para tus clientes o tu catálogo, y Base de conocimiento, para los textos de tu negocio.",
    },
    sheets: {
        rotulo: "Importar una hoja de Google",
        texto: "En Google Sheets pegas el enlace de tu hoja, eliges si son clientes o un catálogo y revisas sus columnas antes de importar.",
    },
    importar: {
        rotulo: "El resumen de la importación",
        texto: "Con Iniciar importación se cargan los datos, y el resumen dice cuántos se crearon y cuántos se actualizaron.",
    },
    gestionar: {
        rotulo: "Tus datos importados",
        texto: "En Gestionar ves todo lo importado: lo buscas por número, lo editas con el lápiz o creas un registro nuevo a mano.",
    },
    base: {
        rotulo: "La base de conocimiento, en bloques",
        texto: "En Base de conocimiento pegas el texto de tu negocio, y con Importar y dividir se separa en un bloque por tema.",
    },
    bloques: {
        rotulo: "Tus bloques de conocimiento",
        texto: "En Gestionar ves todos tus bloques: el interruptor apaga uno sin borrarlo, y con Nuevo creas otro en un momento.",
    },
    acciones: {
        rotulo: "Las acciones de cada opción",
        texto: "Y el botón de los tres puntos de cada opción tiene las acciones sobre todos sus datos, siempre con confirmación.",
    },
    cierre: {
        rotulo: "Tu agente responde con tus datos",
        texto: "Así tu agente IA responde con los datos de tu negocio. Así se trabaja con Mis datos.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes). */
const PRONUNCIACION = [
    [/\bGoogle Sheets\b/g, "gugol shits"],
    [/\bIA\b/g, "i a"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
