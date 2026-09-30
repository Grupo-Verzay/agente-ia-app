/**
 * Lo que se DICE en el vídeo de la guía de Catálogo, frase a frase, en el
 * orden en que ocurre en pantalla. Misma forma que la de Leads
 * (`narracion-guia-leads.mjs`): `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena y `texto` lo que se oye, escrito como se lee.
 *
 * Una frase por idea, con lo que se hace en pantalla DENTRO de ella: el guion
 * (`capturar-guia-catalogo.mjs`) pulsa en la palabra que lo nombra
 * (`alDecir`). Frases sueltas de cuatro palabras son las que dejan la
 * narración cortada.
 *
 * Recorre la pantalla entera en el orden de las secciones de la guía —el menú,
 * la barra de arriba, Ver catálogo y lo que ve el cliente, el enlace
 * personalizado, el número de WhatsApp y los cuatro apartados restantes, y
 * Guardar—, y el banco (`lib/__tests__/video-guia-catalogo.test.mjs`) lo
 * comprueba.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, y con el mismo texto la voz sale
 * de la misma caché.
 */
export const NARRACION = {
    intro: {
        rotulo: "Catálogo: tus productos en una página para compartir",
        texto: "Esta es la pantalla de Catálogo: aquí decides cómo se ve el catálogo de tus productos que compartes con tus clientes.",
    },
    menu: {
        rotulo: "El menú: Catálogo está en Panel",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y Catálogo lo encuentras dentro de Panel.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    verCatalogo: {
        rotulo: "Ver catálogo: así lo ve tu cliente",
        texto: "Con Ver catálogo lo abres tal como lo ve tu cliente: tu portada, tus productos y las categorías.",
    },
    buscar: {
        rotulo: "Tu cliente busca y filtra por categoría",
        texto: "Tu cliente busca un producto por su nombre o toca una categoría para ver solo esos; con Todos vuelve a verlos todos.",
    },
    botonWhatsApp: {
        rotulo: "Cada producto, con su botón de WhatsApp",
        texto: "Y en cada producto tiene el botón verde para escribirte por WhatsApp, con el nombre del producto ya puesto.",
    },
    enlace: {
        rotulo: "Tu enlace personalizado",
        texto: "De vuelta en la configuración, aquí eliges un enlace corto con el nombre de tu negocio y lo guardas con este botón.",
    },
    numero: {
        rotulo: "El número al que te escriben",
        texto: "En Datos básicos va el número de WhatsApp al que te escriben tus clientes.",
    },
    identidad: {
        rotulo: "Portada y color",
        texto: "En Identidad visual pones la imagen de portada y eliges el color de precios y botones.",
    },
    textos: {
        rotulo: "Los textos del catálogo",
        texto: "En Textos del catálogo cambias el título, la descripción y lo que dice el botón de WhatsApp.",
    },
    redes: {
        rotulo: "Tus redes sociales",
        texto: "En Redes sociales pones tu Instagram, tu Facebook y tu TikTok.",
    },
    opciones: {
        rotulo: "Qué datos se ven de cada producto",
        texto: "Y en Opciones de visualización decides si se ven las unidades disponibles y el código de cada producto.",
    },
    cierre: {
        rotulo: "Guardar aplica los cambios",
        texto: "Cuando termines, pulsa Guardar y tu catálogo se actualiza al momento. Así se trabaja con Catálogo.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes). */
const PRONUNCIACION = [
    [/\bWhatsApp\b/g, "guatsap"],
    [/\bInstagram\b/g, "instagram"],
    [/\bFacebook\b/g, "feisbuk"],
    [/\bTikTok\b/g, "tik tok"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
