/**
 * La NARRACIÓN del vídeo de apertura del canal de YouTube: «Mientras tú
 * dormías, esto pasó con un cliente».
 *
 * Es un CORTE del vídeo de ventas (`/demo`), no otro vídeo: la misma clínica,
 * la misma Laura, las mismas tres pantallas y el panel de verdad. Lo que cambia
 * es el guion —la historia pasa DE NOCHE, con la clínica cerrada— y dos
 * escenas que se graban de nuevo: la llamada con IA, más larga y completa, y el
 * cierre con varias líneas y asesores trabajando a la vez.
 *
 * Las voces son las del vídeo de ventas, con sus mismas instrucciones
 * (`../video-de-ventas/narracion.mjs`): el narrador, Sofía y Laura suenan igual
 * en los dos. Las dos notas de voz NO se vuelven a sintetizar: son las del
 * vídeo de ventas, y se leen de su caché. Lo nuevo —esta narración y la llamada
 * entera— vive en su propia caché (`scripts/video-de-youtube/voz/`), para que
 * la del vídeo de ventas siga teniendo exactamente lo suyo.
 */
import path from "node:path";
import { LA_VOZ_EN_LA_LLAMADA, VOZ_DE_VENTAS } from "../video-de-ventas/narracion.mjs";

export const CACHE_DE_YOUTUBE = path.resolve(import.meta.dirname, "voz");

/** El título del vídeo y lo que va en su descripción de YouTube. */
export const TITULO_DE_YOUTUBE = "Mientras tú dormías, esto pasó con un cliente";

/**
 * Los dos enlaces del llamado («los enlaces están en la descripción»): el
 * número y la reunión son los MISMOS de la página `/demo` (`LLAMADO_DEL_VIDEO`
 * de `lib/video-de-ventas.ts`; el banco los compara para que no se separen).
 * El mensaje ya escrito dice que viene de YouTube: así se sabe de dónde llegó.
 */
export const ENLACES_DE_YOUTUBE = Object.freeze({
    whatsapp: `https://wa.me/573233612620?text=${encodeURIComponent("Hola, vi el video de Verzay en YouTube y quiero verlo funcionando en mi negocio.")}`,
    agendar: "https://verzay.com/agendar-una-reunion",
});

/** La descripción de YouTube, lista para pegar. */
export const DESCRIPCION_DE_YOUTUBE = [
    "Son las nueve de la noche, la clínica está cerrada y Laura escribe por WhatsApp. Esto es lo que pasa con ella hasta que confirma su cita, sin que nadie del equipo toque nada: la IA le responde al instante, la escucha y le contesta con voz, le manda el PDF y el video, le insiste, la llama, le agenda la cita y le recuerda un día antes.",
    "",
    "Verzay — Responde, vende, agenda y hace seguimiento. 24/7.",
    "",
    `💬 Escríbenos por WhatsApp: ${ENLACES_DE_YOUTUBE.whatsapp}`,
    `📅 Agenda una cita: ${ENLACES_DE_YOUTUBE.agendar}`,
    "",
    "Demostración con datos de ejemplo. El panel es la plataforma real; el celular, WhatsApp Web, la hoja de cálculo, la llamada y el esquema de las líneas del equipo son recreaciones fieles, y las respuestas de la IA siguen un guion.",
].join("\n");

/**
 * Las frases, en el orden en que suenan, con las palabras del guion. Una por
 * escena (la once lleva dos, con el respiro en medio). Lo que dice cada una es
 * lo que se está VIENDO pasar en ese momento.
 */
export const NARRACION_DE_YOUTUBE = Object.freeze({
    gancho: {
        texto:
            "Cada minuto sin respuesta es una venta que se enfría. Tiendas, clínicas, cursos, consultorías, agencias de viajes… y cualquier negocio que venda por WhatsApp, responde al instante.",
    },
    noche: { texto: "Son las nueve de la noche. En la clínica ya no hay nadie despierto. Pero Laura sí está escribiendo." },
    texto: { texto: "La IA responde al instante, le da el precio, y sin que nadie lo haga a mano, su ficha ya está completa." },
    voz: { texto: "Si Laura prefiere mandar un audio, la IA lo escucha y le contesta también con voz." },
    sheets: { texto: "Todo lo que Laura cuenta queda guardado también en tu hoja de cálculo, sin que nadie lo escriba." },
    medios: {
        texto:
            "Le manda el PDF, el video, entiende la foto que ella envía, y como ya está interesada, queda marcada como cliente caliente, sin que nadie la etiquete a mano.",
    },
    seguimiento: { texto: "Si Laura se queda callada, la IA no la deja ir: insiste con texto, y si hace falta, hasta la llama." },
    cita: { texto: "La cita queda en el calendario, y un día antes, el recordatorio sale solo. Laura confirma, y tú lo sabes al instante." },
    asesor: { texto: "Y si en algún momento Laura necesita hablar con una persona, la IA la pasa directo con tu equipo." },
    unDia: { texto: "Esto no fue un tutorial, fue un día cualquiera para un cliente real." },
    crece: { texto: "Y si tu negocio crece, Verzay crece contigo: varias líneas, varios asesores, un solo panel." },
    llamado: { texto: "Escríbenos por WhatsApp o agenda una cita. Los enlaces están en la descripción." },
});

/**
 * La LLAMADA con IA, entera: Sofía saluda, le ofrece los cupos, Laura elige,
 * Sofía confirma el jueves a las diez y se despide. Es la escena que se deja
 * hablar sola: no lleva narración encima. Las horas que se dicen son las de
 * los cupos de la historia (`elCalendario`: jueves 10:00 y 11:30, viernes por
 * la tarde), y «anoche» es porque Laura escribió la noche anterior.
 */
export const LA_LLAMADA_COMPLETA = Object.freeze([
    { quien: "ia", texto: "¡Hola, Laura! Te habla Sofía, de Clínica Sonríe. Anoche nos escribiste por el blanqueamiento dental. ¿Tienes un minuto?" },
    { quien: "clienta", texto: "¡Hola, Sofía! Sí, claro, cuéntame." },
    {
        quien: "ia",
        texto: "Te llamo por tu valoración gratis. Esta semana tengo cupos el jueves a las diez o a las once y media de la mañana, y el viernes en la tarde. ¿Cuál te queda mejor?",
    },
    { quien: "clienta", texto: "El jueves a las diez me queda perfecto." },
    { quien: "ia", texto: "¡Listo! Te dejo agendada el jueves a las diez. Ahora te llega la confirmación por WhatsApp, y un día antes te mando un recordatorio." },
    { quien: "clienta", texto: "¡Súper! Muchas gracias, Sofía." },
    { quien: "ia", texto: "Gracias a ti, Laura. ¡Que tengas una linda tarde!" },
]);

/** Todo lo que hay que sintetizar para este corte: la narración y la llamada, cada una con su voz. */
export function loQueSeSintetiza() {
    return [
        ...Object.values(NARRACION_DE_YOUTUBE).map((n) => ({ texto: n.texto, voz: VOZ_DE_VENTAS })),
        ...LA_LLAMADA_COMPLETA.map((l) => ({ texto: l.texto, voz: LA_VOZ_EN_LA_LLAMADA[l.quien] })),
    ];
}
