/**
 * Lo que se DICE en el vídeo de la guía de AI Imágenes, frase a frase, en el
 * orden en que ocurre en pantalla. `rotulo` es el subtítulo corto que se lee
 * abajo mientras suena; `texto` es lo que se oye, escrito como se lee.
 *
 * La MISMA forma que la narración de Leads (`narracion-guia-leads.mjs`): una
 * frase por idea, como se habla en una llamada, con lo que se hace en pantalla
 * DENTRO de la frase —el guion de `capturar-guia-ai-imagenes.mjs` pulsa en la
 * palabra que lo nombra (`alDecir`)—. Dichas sueltas, cada una arrancaría
 * después de un silencio y la narración sonaría cortada.
 *
 * La frase de la barra de arriba es LA MISMA que en Leads, letra por letra: la
 * barra es la misma en todas las pantallas, así que se dice igual —y su audio
 * sale de la misma entrada de la caché—.
 *
 * El orden es el de las secciones de la guía, y el banco
 * (`lib/__tests__/video-guia-ai-imagenes.test.mjs`) comprueba que el guion las
 * dice todas y en este orden.
 */
export const NARRACION = {
    intro: {
        rotulo: "AI Imágenes: anuncios de tu producto con IA",
        texto: "Esta es la pantalla de AI Imágenes: subes la foto de tu producto y la inteligencia artificial te devuelve anuncios listos para publicar.",
    },
    menu: {
        rotulo: "El menú: AI imágenes está en Apps Externas",
        texto: "A la izquierda está el menú: con estas dos flechas lo abres, y AI imágenes la encuentras dentro de Apps Externas.",
    },
    barraDeArriba: {
        rotulo: "La barra de arriba, la misma en todas las pantallas",
        texto: "Arriba, en la barra que se repite en todas las pantallas, tienes el buscador general, el botón de soporte y tus notificaciones.",
    },
    apiKey: {
        rotulo: "Tu API key de Google, una sola vez",
        texto: "Aquí está tu API key de Google: se configura una sola vez, y con Cambiar pones otra cuando quieras.",
    },
    producto: {
        rotulo: "Paso 1: sube la foto de tu producto",
        texto: "En el primer paso subes la foto de tu producto, y con Siguiente pasas a la campaña.",
    },
    campana: {
        rotulo: "Paso 2: formatos, etapa y ambiente",
        texto: "En la campaña eliges los formatos, la etapa de venta del anuncio y el ambiente de la foto, por ejemplo una mesa de mármol.",
    },
    estilo: {
        rotulo: "Paso 3: el estilo visual",
        texto: "En el estilo eliges la dirección visual del anuncio; aquí, Premium.",
    },
    motor: {
        rotulo: "Paso 4: el motor de IA",
        texto: "Y en el motor eliges el modelo de inteligencia artificial y cuántas variantes quieres de cada anuncio.",
    },
    generar: {
        rotulo: "Generar imagen",
        texto: "Pulsa Generar imagen y cada anuncio aparece en la vista previa, en su formato, en cuanto está listo.",
    },
    texto: {
        rotulo: "El texto del post, escrito para cada red",
        texto: "Debajo, la IA escribe el texto del post para esa red: al pasar a WhatsApp cambia y va sin hashtags, y con este botón lo copias.",
    },
    cierre: {
        rotulo: "Descárgalo, o genera el kit de landing",
        texto: "Con la flecha de arriba descargas la imagen, y si en la campaña enciendes el kit de landing, salen las diez imágenes de tu página de ventas. Así se trabaja con AI Imágenes.",
    },
};

/** Cómo se PRONUNCIA lo que no se escribe como suena (solo para la voz de antes, espeak). */
const PRONUNCIACION = [
    [/\bWhatsApp\b/g, "guatsap"],
    [/\bAPI key\b/g, "a pe i qui"],
    [/\bGoogle\b/g, "gugol"],
];

export function comoSeDice(texto) {
    return PRONUNCIACION.reduce((t, [de, a]) => t.replace(de, a), texto);
}
