/**
 * Lo que se DICE en el vídeo de la guía de Reuniones, frase a frase, en el
 * orden en que ocurre en pantalla. Misma forma que `narracion-guia-leads.mjs`:
 * `rotulo` es el subtítulo corto de abajo y `texto`, lo que se oye.
 *
 * Una frase por idea, como se habla en una llamada, y cada una lleva dentro lo
 * que se hace en pantalla mientras suena: el guion
 * (`capturar-guia-reuniones.mjs`) pulsa en la palabra que lo nombra
 * (`alDecir`). El banco (`lib/__tests__/video-guia-reuniones.test.mjs`)
 * comprueba que el guion las dice todas, en este orden —el de las secciones de
 * la guía— y que cada `alDecir` nombra un trozo de la frase que suena.
 */
export const NARRACION = {
    intro: {
        rotulo: "Reuniones: videollamadas sin salir de la plataforma",
        texto: "Esta es la pantalla de Reuniones: desde aquí abres una videollamada con tu equipo o con tus clientes, sin salir de la plataforma.",
    },
    menu: {
        rotulo: "El menú: Reuniones está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Reuniones la encuentras dentro de Panel.",
    },
    pestanas: {
        rotulo: "Abiertas, Pasadas y Grabaciones",
        texto: "Arriba tienes tres pestañas: las reuniones abiertas, las pasadas y las grabaciones, cada una con su número.",
    },
    abrir: {
        rotulo: "Abre una reunión nueva",
        texto: "Para abrir una, eliges cuánto tiempo vale el enlace, le pones un nombre y pulsas Nuevo.",
    },
    sala: {
        rotulo: "La reunión se abre aquí mismo",
        texto: "La reunión se abre aquí mismo, encima de la plataforma, y con este botón copias el enlace para quien tenga que entrar.",
    },
    invitados: {
        rotulo: "El invitado llama a la puerta",
        texto: "Quien llega por el enlace pone su nombre y espera en la puerta: tú decides si pasa, con Dejar entrar.",
    },
    mandos: {
        rotulo: "Micrófono, cámara, pantalla, mano y fondo",
        texto: "Abajo están los mandos: el micrófono, la cámara, compartir la pantalla, levantar la mano para pedir la palabra, y el fondo, que puedes desenfocar.",
    },
    vista: {
        rotulo: "Quien habla en grande, o todos en cuadrícula",
        texto: "Quien habla sale en grande, y con este botón pones a todos en cuadrícula.",
    },
    chat: {
        rotulo: "El chat y la gente de la reunión",
        texto: "Aquí se abre el chat, que solo ve quien está dentro, y la lista de la gente.",
    },
    grabar: {
        rotulo: "Graba en video o solo el audio",
        texto: "Con el botón redondo grabas la reunión, en video o solo el audio, y a todos les sale el aviso de que se está grabando.",
    },
    pastilla: {
        rotulo: "Plégala y sigue trabajando",
        texto: "Si necesitas la pantalla, la pliegas a una pastilla y la reunión se sigue oyendo mientras trabajas.",
    },
    cierre: {
        rotulo: "Pasadas y grabaciones, para después",
        texto: "Y cuando termina, en Pasadas ves cuánto duró y quién entró, y en Grabaciones la vuelves a ver o la pasas a texto. Así se trabaja con Reuniones.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de respaldo). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
