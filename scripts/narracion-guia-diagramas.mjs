/**
 * Lo que se DICE en el vídeo de la guía de Diagramas, frase a frase, en el
 * orden en que ocurre en pantalla. Mismo estándar que el de Leads
 * (`narracion-guia-leads.mjs`): `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee, con la
 * voz Cedar de siempre.
 *
 * Una frase por idea, con la acción DENTRO: el guion
 * (`capturar-guia-diagramas.mjs`) pulsa en la palabra que la nombra
 * (`alDecir`), así que nada se hace en un silencio entre dos frases.
 *
 * La frase de la barra de arriba es, carácter por carácter, la de Leads: la
 * barra es la misma en todas las pantallas, y con el mismo texto la voz sale
 * de la caché que ya está en el repositorio (`voz-de-la-guia/cedar/`) en vez
 * de pagarse otra vez.
 *
 * Las frases hablan de lo que la pantalla tiene de verdad —el menú, la barra
 * de arriba, las tarjetas y las carpetas, «+ Nuevo», el «+» de cada salida con
 * su lista, la ventana de un paso, Ordenar y el guardado automático, el menú
 * de con quién se comparte y el «⋯» de la tarjeta— y el banco
 * (`lib/__tests__/guia-diagramas.test.mjs`) comprueba que el guion las dice
 * todas y en este orden, que es el de las secciones de la guía.
 */
export const NARRACION = {
    intro: {
        rotulo: "Diagramas: tus procesos, paso a paso",
        texto: "Esta es la pantalla de Diagramas: aquí dibujas tus procesos paso a paso, para pensarlos y para explicárselos a tu equipo o a un cliente.",
    },
    menu: {
        rotulo: "El menú: Diagramas está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Diagramas lo encuentras dentro de Panel.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    tarjetas: {
        rotulo: "Cada tarjeta es un diagrama; las carpetas los agrupan",
        texto: "Cada tarjeta es un diagrama, y las carpetas los agrupan: con Ventas ves solo los de esa carpeta, y con Todas vuelves a verlos todos.",
    },
    nuevo: {
        rotulo: "Crea un diagrama nuevo",
        texto: "Con el botón Nuevo creas uno: le pones un nombre y se abre el editor, que ya trae el Inicio y una Decisión.",
    },
    agregar: {
        rotulo: "El más de cada salida agrega el siguiente paso",
        texto: "Con el más de cada salida agregas el siguiente paso: buscas su nombre, lo eliges, y queda puesto y conectado.",
    },
    escribir: {
        rotulo: "Escribe lo que pasa en cada paso",
        texto: "Pulsas la caja de un paso para escribir lo que pasa en él, y con Listo queda guardado.",
    },
    ordenar: {
        rotulo: "Ordenar, y se guarda solo",
        texto: "Ordenar acomoda todos los pasos en carriles, y cada cambio se guarda solo, sin que tengas que hacer nada.",
    },
    compartir: {
        rotulo: "Con quién del equipo lo compartes",
        texto: "Desde la tarjeta decides con quién de tu equipo lo compartes: privado, solo lectura o editable.",
    },
    cierre: {
        rotulo: "Renombrar, duplicar, compartir o eliminar",
        texto: "Y en los tres puntos lo renombras, lo duplicas, lo compartes con otras cuentas o lo eliminas. Así se trabaja con Diagramas.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de respaldo). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
