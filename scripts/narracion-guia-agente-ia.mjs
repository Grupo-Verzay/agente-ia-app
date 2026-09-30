/**
 * Lo que se DICE en el vídeo de la guía de Agente IA, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-agente-ia.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-agente-ia.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "Agente IA: enséñale a tu asistente cómo atender",
        texto: "Esta es la pantalla de Agente IA: aquí le enseñas a tu asistente cómo atender a tus clientes, y a la derecha ves todo lo que lee.",
    },
    menu: {
        rotulo: "El menú: Agente IA está en Entrenamiento",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Agente IA lo encuentras dentro de Entrenamiento.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    canales: {
        rotulo: "Un entrenamiento por canal",
        texto: "Cada canal tiene su propio entrenamiento: WhatsApp es la base, y los que no tienes activos salen con candado.",
    },
    perfil: {
        rotulo: "El perfil: quién es tu negocio",
        texto: "En Perfil le cuentas quién es tu negocio: su nombre, dónde está, sus horarios y cómo contactarlo.",
    },
    pasos: {
        rotulo: "Los pasos de la conversación",
        texto: "En Inicio armas los pasos de la conversación: la bienvenida y luego cada etapa, con lo que el agente debe lograr en ella.",
    },
    elementos: {
        rotulo: "Acciones y respuestas de un paso",
        texto: "Con agregar acción el paso puede ejecutar un flujo, avisar a un asesor o dejar una nota interna que el cliente no ve.",
    },
    conocimiento: {
        rotulo: "Preguntas, productos y extras",
        texto: "En Preguntas, Productos y Extras le das lo que debe saber responder: tus preguntas frecuentes, tu catálogo y los casos especiales.",
    },
    palabrasClave: {
        rotulo: "Palabras clave: respuestas exactas",
        texto: "Con las palabras clave respondes al instante, sin inteligencia artificial, o pasas la conversación a un asesor.",
    },
    gestion: {
        rotulo: "Gestión: los datos para cerrar",
        texto: "En Gestión decides qué datos pide para cerrar: un pedido, una reserva o un reclamo.",
    },
    cotizaciones: {
        rotulo: "Cotizaciones con tus precios",
        texto: "Y si activas las cotizaciones, el agente envía un PDF con los precios de tu catálogo.",
    },
    cierre: {
        rotulo: "Guarda y vuelve a cualquier versión",
        texto: "Cuando terminas, guardas; y en el historial vuelves a cualquier versión anterior. Así se entrena tu Agente IA.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [
    [/\bWhatsApp\b/g, "guatsap"],
    [/\bIA\b/g, "i a"],
    [/\bPDF\b/g, "pe de efe"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
