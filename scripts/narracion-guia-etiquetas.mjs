/**
 * Lo que se DICE en el vídeo de la guía de Etiquetas, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-etiquetas.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-etiquetas.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Etiquetas: tus contactos en un tablero",
        texto: "Esta es la pantalla de Etiquetas: tus contactos repartidos en un tablero, con una columna por cada etiqueta.",
    },
    menu: {
        rotulo: "El menú: está en Contactos",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Etiquetas la encuentras dentro de Contactos.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    tablero: {
        rotulo: "Una columna por etiqueta",
        texto: "Cada columna es una etiqueta, y la primera junta a los que todavía no tienen ninguna; cada tarjeta es un contacto, con su puntaje y su estado.",
    },
    arrastrar: {
        rotulo: "Arrastra para cambiar la etiqueta",
        texto: "Para cambiarle la etiqueta a un contacto, arrastras su tarjeta a otra columna, y se guarda al soltarla.",
    },
    calificar: {
        rotulo: "La IA lo califica del 0 al 100",
        texto: "Con el destello, la IA lee lo que ha hablado contigo y le pone un puntaje del cero al cien, con el motivo debajo.",
    },
    filtrar: {
        rotulo: "Filtra por puntaje",
        texto: "Arriba filtras por puntaje: con Listo ves solo a los que están para comprar, y pulsándolo otra vez vuelve el tablero entero.",
    },
    seleccion: {
        rotulo: "Varios contactos a la vez",
        texto: "Si marcas varias tarjetas, sale una barra para ponerles una etiqueta a todos de una vez.",
    },
    crear: {
        rotulo: "Crea una etiqueta con su color",
        texto: "En Gestionar creas tus etiquetas: pulsas Nuevo, le pones un nombre y un color, y la guardas.",
    },
    editar: {
        rotulo: "Edítala sin perder sus contactos",
        texto: "Con Editar le cambias el nombre o el color, y los contactos que la tenían la conservan.",
    },
    ordenar: {
        rotulo: "Arrástrala para ordenar las columnas",
        texto: "Y las ordenas arrastrándolas por el asa: las columnas del tablero siguen ese mismo orden.",
    },
    cierre: {
        rotulo: "Eliminar pide confirmación",
        texto: "Si una ya no te sirve, la papelera la borra después de confirmar, y tus contactos no se tocan. Así se trabaja con Etiquetas.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
