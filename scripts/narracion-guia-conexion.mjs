/**
 * Lo que se DICE en el vídeo de la guía de Conexión y Ajustes, frase a frase,
 * en el orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se
 * lee abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads: una frase por idea, con lo que se
 * hace en pantalla DENTRO de la frase (`alDecir`). La frase de la barra de
 * arriba es LA MISMA que en todas las guías, letra por letra.
 *
 * El banco (`lib/__tests__/video-guia-conexion.test.mjs`) comprueba que el
 * guion las dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Conexión y Ajustes: tu cuenta en una pantalla",
        texto: "Esta es Conexión y Ajustes: aquí conectas tus canales, pones tu IA y ajustas cómo trabaja tu cuenta, todo en ocho pestañas.",
    },
    menu: {
        rotulo: "El menú: la entrada del engranaje",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y esta pantalla es la entrada del engranaje.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    conexion: {
        rotulo: "Conexión: WhatsApp y tus otros canales",
        texto: "En Conexión ves tu línea de WhatsApp con su número, las llamadas, y cada canal que puedes sumar: Cloud API, Telegram, Facebook e Instagram.",
    },
    integraciones: {
        rotulo: "Integraciones: tu IA y tus avisos",
        texto: "En Integraciones pones la clave de tu proveedor de IA y los números que reciben los avisos de tu cuenta.",
    },
    preferencias: {
        rotulo: "Preferencias: zona, empresa y mapa",
        texto: "En Preferencias eliges tu zona horaria, el nombre de tu empresa y el enlace de tu negocio en Google Maps.",
    },
    comportamiento: {
        rotulo: "Comportamiento: cómo responde tu agente",
        texto: "En Comportamiento enciendes tu agente, decides cuándo pasa el chat a un asesor y ajustas la encuesta, los tiempos y las frases de tu negocio.",
    },
    herramientas: {
        rotulo: "Herramientas: lo que sabe hacer tu agente",
        texto: "En Herramientas eliges lo que sabe hacer tu agente, con un interruptor para cada una.",
    },
    cuenta: {
        rotulo: "Cuenta: tu plan y tus créditos",
        texto: "En Cuenta ves tu plan, cuándo vence y los créditos de IA que te quedan, y con este botón cambias de plan o compras más.",
    },
    seguridad: {
        rotulo: "Seguridad: tu correo y tu contraseña",
        texto: "En Seguridad cambias el correo con el que entras y tu contraseña.",
    },
    apariencia: {
        rotulo: "Apariencia: tu logo y el aspecto del panel",
        texto: "Y en Apariencia subes tu logo y eliges los colores, el tamaño de la letra y el modo claro u oscuro. Así se ajusta tu cuenta.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [[/\bWhatsApp\b/g, "guatsap"]];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
