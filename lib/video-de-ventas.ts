/**
 * El VÍDEO DE VENTAS de Verzay (`/demo`): la pieza de impacto que un lead ve
 * antes de agendar una reunión. Lo graba `scripts/generar-video-de-ventas.sh`
 * contra la App de verdad —la historia de una clínica, contada a la vez en el
 * celular del negocio, en WhatsApp Web y en el panel— y lo deja en
 * `public/demo/`.
 *
 * Aquí vive lo que la PÁGINA necesita saber del vídeo, y es puro. Las
 * capacidades y el llamado están copiados de la historia
 * (`scripts/video-de-ventas/historia.mjs`, que corre con `node` y no puede
 * importar TypeScript); el banco (`scripts/banco-video-de-ventas.sh`) compara
 * las dos copias, para que la página no prometa algo que el vídeo no enseña.
 */

/** El vídeo que se publica y su portada. MP4 (H.264 + AAC): se reproduce en cualquier sitio. */
export const VIDEO_DE_VENTAS = "/demo/verzay-demo.mp4";
export const PORTADA_DEL_VIDEO_DE_VENTAS = "/demo/verzay-demo.jpg";

/** Cuánto dura, en palabras: el banco comprueba que el vídeo publicado no pasa de ahí. */
export const DURACION_DEL_VIDEO_DE_VENTAS = "Menos de dos minutos";
export const TOPE_DEL_VIDEO_DE_VENTAS_MS = 120_000;

/** Lo que el vídeo enseña, escena por escena y en su orden. */
export const CAPACIDADES_DEL_VIDEO = Object.freeze([
    { escena: "texto", titulo: "Responde y llena tu CRM", detalle: "Texto · ficha del contacto" },
    { escena: "voz", titulo: "Escucha y responde con voz", detalle: "Notas de voz" },
    { escena: "medios", titulo: "Envía y entiende archivos", detalle: "PDF · video · imágenes" },
    { escena: "caliente", titulo: "Califica y etiqueta", detalle: "Calificación · etiquetas · etapa" },
    { escena: "seguimiento", titulo: "Hace seguimiento", detalle: "Al cliente que no responde" },
    { escena: "cita", titulo: "Agenda citas", detalle: "Directo en tu calendario" },
    { escena: "recordatorio", titulo: "Recuerda y confirma", detalle: "Un día antes de la cita" },
    { escena: "embudo", titulo: "Tu embudo, al día", detalle: "Cada cliente en su etapa" },
] as const);

/**
 * Los negocios de ejemplo que abren el vídeo, en su orden (las cinco
 * tarjetas del montaje), y la frase que cierra esa sección. La página los
 * nombra con las mismas palabras: el banco los compara con
 * `NEGOCIOS_DEL_ARRANQUE` y `CIERRE_DEL_MONTAJE` de la historia.
 */
export const NEGOCIOS_DEL_VIDEO = Object.freeze(["Tienda en línea", "Clínica", "Cursos", "Consultoría", "Agencia de viajes"] as const);
export const CIERRE_DE_LOS_NEGOCIOS = "y cualquier negocio que venda por WhatsApp";

/** «tienda en línea, clínica, cursos, consultoría, agencia de viajes y cualquier negocio que venda por WhatsApp». */
export function losNegociosEnUnaFrase(): string {
    return `${NEGOCIOS_DEL_VIDEO.map((n) => n.toLowerCase()).join(", ")} ${CIERRE_DE_LOS_NEGOCIOS}`;
}

/** A dónde lleva la página: la reunión y el WhatsApp de Verzay (los del cierre del vídeo). */
export const LLAMADO_DEL_VIDEO = Object.freeze({
    agendar: "https://verzay.com/agendar-una-reunion",
    whatsapp: "573115616975",
    web: "verzay.com",
});

/** El mensaje con el que se abre el WhatsApp de Verzay desde la página. */
export const MENSAJE_PARA_VERZAY = "Hola, vi la demostración de Verzay y quiero verlo funcionando en mi negocio.";

/** El enlace de WhatsApp con el mensaje ya escrito. */
export function elEnlaceDeWhatsapp(numero: string, texto: string): string {
    const digitos = numero.replace(/\D/g, "");
    return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

/**
 * Lo que es de verdad y lo que no, dicho sin rodeos en la propia página: un
 * lead que después ve la plataforma no puede sentir que el vídeo le mintió.
 */
export const LO_QUE_ES_EL_VIDEO =
    "Demostración con datos de ejemplo. El panel es la plataforma real; el celular y WhatsApp Web son recreaciones fieles, y las respuestas de la IA siguen un guion.";
