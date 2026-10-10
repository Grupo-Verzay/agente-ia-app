/**
 * Lo que pasa en la videollamada con Verzy además del guion: pedir un humano,
 * la incomodidad que no se dice, el cierre de venta (sí o no) en cualquier
 * minuto y el reloj de la reunión. Puro: lo usan la sala, el contexto de
 * Tavus y el banco.
 *
 * Como el silencio de Verzy (`lib/silencio-de-verzy.ts`), esto lo decide la
 * SALA, que oye cada frase transcrita del cliente: una herramienta nueva en la
 * persona de Tavus puede rebotar con 409 `maker_changes` y llegaría tarde.
 *
 * | qué dice el cliente | qué pasa |
 * | --- | --- |
 * | incomodidad sin decirlo | alerta SILENCIOSA al equipo; Verzy sigue igual, sin reloj |
 * | «quiero hablar con una persona» | Verzy dice que avisó a un humano; alerta; espera de 3 minutos |
 * | intención clara de comprar | Verzy salta al cierre: pago, registro, tutoriales y soporte |
 * | «no me interesa», «muy caro», «no es lo que busco» | despedida cordial, la cita a Descartado |
 *
 * El reloj (5 y 1 minuto antes del cierre agendado, y el cierre) va SIEMPRE,
 * en cualquier etapa.
 */

import { normalizar } from "@/lib/silencio-de-verzy";
import { MARCA_DEL_AVISO_INTERNO } from "@/lib/videollamada-ia";

/* ── Qué dijo el cliente ───────────────────────────────────────────────── */

/** A quién puede pedir: una persona, no Verzy. */
const UN_HUMANO =
    "(?:una persona(?: real| de verdad)?|un humano|un ser humano|alguien (?:real|de verdad|humano)|un asesor(?:a)?|una asesora|un agente (?:humano|real)|un vendedor|una vendedora|un ejecutivo|una ejecutiva|el encargado|la encargada|un representante)";

const PIDE_UN_HUMANO = [
    new RegExp(`\\b(?:hablar|hablo|conversar|comunicar(?:me)?|comunicas|comunicame|atender(?:me)?|que me atienda|pas(?:a|ar|as|ame|arme)|ponme|pones|transferir(?:me)?|transfiere(?:me|s)?|conectar(?:me)?|conecta(?:me|s)?)\\b.{0,24}\\b(?:con )?${UN_HUMANO}\\b`),
    new RegExp(`\\b(?:quiero|prefiero|necesito|pido|me gustaria)\\b.{0,12}\\b${UN_HUMANO}\\b`),
    new RegExp(`\\b(?:hay|esta|existe)\\b.{0,8}\\b${UN_HUMANO}\\b.{0,20}\\b(?:hablar|atender|atienda|conectar)`),
];

/**
 * Lo que niega el pedido. Solo lo inequívoco: «no, quiero hablar con una
 * persona» se normaliza igual que «no quiero…» (la coma se va), y perder un
 * pedido de verdad cuesta más que una alerta de más.
 */
const NO_HACE_FALTA = /\b(?:no hace falta|no es necesario|no necesito)\b.{0,24}\b(?:hablar|una persona|un humano|un asesor)/;

/** ¿El cliente pide EXPLÍCITAMENTE hablar con una persona? */
export function pideUnHumano(texto: unknown): boolean {
    if (typeof texto !== "string") return false;
    const t = normalizar(texto);
    if (!t || NO_HACE_FALTA.test(t)) return false;
    return PIDE_UN_HUMANO.some((r) => r.test(t));
}

/**
 * Un NO dicho de forma explícita y literal. Ojo con lo que lo parece y no lo
 * es: «no es caro», «no sé si me interesa» y «no está muy caro» no cierran.
 */
const NO_LE_INTERESA = [
    /(?<!\bsi )\bno me interesa\b/,
    /\bno (?:estoy|estamos) interesad[oa]s?\b/,
    /\bno nos interesa(?:n)?\b/,
    /\bno me interesan\b/,
    /(?<!\bno )\b(?:es|esta|sale|me parece|lo veo|se me hace) (?:muy|demasiado|super|bastante) caro\b/,
    /\b(?:carisimo|carisima|demasiado costoso|muy costoso)\b/,
    /\bno es lo que (?:busco|estoy buscando|buscaba|buscamos|necesito|necesitamos)\b/,
];

/** ¿El cliente cierra en NO, de forma explícita? */
export function esUnCierreNegativo(texto: unknown): boolean {
    if (typeof texto !== "string") return false;
    const t = normalizar(texto);
    if (!t) return false;
    return NO_LE_INTERESA.some((r) => r.test(t));
}

const QUIERE_COMPRAR = [
    /\b(?:quiero|quisiera|me gustaria|vamos a|voy a|deseo) (?:comprar|adquirir|contratar|pagar|empezar con|arrancar con|tomar|suscribirme|activar|registrarme)\b/,
    /\b(?:quiero|quisiera|me quedo con|vamos con|me llevo|tomo) (?:el|ese|este) plan\b/,
    /\bcomo (?:pago|le pago|puedo pagar|hago el pago|me registro|lo compro|lo adquiero|lo contrato|contrato|empiezo)\b/,
    /\b(?:mandame|enviame|pasame|dame|comparteme) (?:el|un) (?:link|enlace)(?: de pago| para pagar| para registrarme)?\b/,
    /\b(?:listo|dale|perfecto) (?:lo|me lo) (?:compro|llevo|tomo)\b/,
    /\bya (?:estoy )?(?:convencid[oa]|decidid[oa])\b/,
];

/** ¿Intención CLARA de comprar? Un «no quiero comprar» no lo es. */
export function quiereComprar(texto: unknown): boolean {
    if (typeof texto !== "string") return false;
    const t = normalizar(texto);
    if (!t || /\bno (?:quiero|voy a|puedo) (?:comprar|pagar|contratar|adquirir)\b/.test(t)) return false;
    return QUIERE_COMPRAR.some((r) => r.test(t));
}

/**
 * Señales de incomodidad o tensión que el cliente NO dice como queja. Una
 * fuerte basta; las leves cuentan si se juntan dos en sus últimas frases.
 */
const INCOMODIDAD_FUERTE = [
    /\bno me (?:estas|esta) (?:entendiendo|escuchando)\b/,
    /\bno me (?:entiendes|escuchas|entiende|escucha)\b/,
    /\bya te (?:lo )?(?:dije|explique)\b/,
    /\bte lo acabo de decir\b/,
    /\botra vez lo mismo\b/,
    /\b(?:perder|perdiendo) (?:el|mi) tiempo\b/,
    /\b(?:me (?:estas|esta) presionando|no me presiones|me siento presionad[oa])\b/,
    /\bme (?:siento|pongo) (?:incomod[oa]|nervios[oa]|rar[oa])\b/,
    /\bestoy (?:molest[oa]|incomod[oa]|aburrid[oa]|confundid[oa]|perdid[oa]|cansad[oa] de)\b/,
    /\bque (?:fastidio|pereza|molestia|incomodo)\b/,
    /\b(?:no (?:te )?confio|desconfio|me da desconfianza)\b/,
    /\b(?:es|parece|suena a) (?:una )?estafa\b/,
    /\bno respondiste\b|\bno me respondiste\b|\beso no (?:es lo que|fue lo que) (?:te )?pregunte\b/,
];

const INCOMODIDAD_LEVE = [
    /\bno (?:entiendo|entendi|comprendo)\b/,
    /\bno me queda claro\b/,
    /\b(?:esto|eso) es (?:muy )?(?:confuso|complicado|raro|enredado)\b/,
    /\bno estoy segur[oa]\b/,
    /\bmas despacio\b|\bmuy rapido\b/,
    /\b(?:eres|es) un (?:robot|bot|programa)\b|\bhablo con una maquina\b/,
    /\b(?:uff|ufff|ush|agh)\b/,
    /\bdejame pensar(?:lo)?\b/,
    /\ben serio\b/,
];

/** Cuántas frases recientes del cliente se miran para juntar señales leves. */
export const FRASES_QUE_SE_MIRAN = 4;

export type Incomodidad = { alerta: boolean; frase: string | null };

/**
 * ¿Hay incomodidad en lo último que dijo el cliente? `recientes` son sus
 * frases, la más nueva al final. Sin reloj: se mira con cada frase.
 */
export function laIncomodidad(recientes: readonly string[]): Incomodidad {
    const frases = recientes.slice(-FRASES_QUE_SE_MIRAN).filter((f) => typeof f === "string" && f.trim());
    const ultima = frases[frases.length - 1] ?? "";
    if (INCOMODIDAD_FUERTE.some((r) => r.test(normalizar(ultima)))) return { alerta: true, frase: ultima.trim() };
    const leves = frases.filter((f) => INCOMODIDAD_LEVE.some((r) => r.test(normalizar(f))));
    if (leves.length >= 2 && leves[leves.length - 1] === ultima) return { alerta: true, frase: ultima.trim() };
    return { alerta: false, frase: null };
}

/** Entre dos alertas de incomodidad de la misma llamada, como poco esto. */
export const ENTRE_ALERTAS_DE_INCOMODIDAD_MS = 5 * 60_000;

export type LoQueDijoElCliente = "cierre-negativo" | "pide-humano" | "quiere-comprar" | "incomodidad" | null;

/**
 * Qué hace la sala con una frase del cliente, en orden de prioridad: un NO
 * explícito cierra; pedir un humano gana a la incomodidad; comprar gana a
 * todo lo que no sea un no.
 */
export function loQueDijoElCliente(texto: unknown, recientes: readonly string[] = []): LoQueDijoElCliente {
    if (typeof texto !== "string" || !texto.trim()) return null;
    if (esUnCierreNegativo(texto)) return "cierre-negativo";
    if (pideUnHumano(texto)) return "pide-humano";
    if (quiereComprar(texto)) return "quiere-comprar";
    if (laIncomodidad([...recientes, texto]).alerta) return "incomodidad";
    return null;
}

/** Una frase del CLIENTE en un `app-message` de Tavus, o `null`. */
export function laFraseDelCliente(mensaje: unknown): string | null {
    const m = (mensaje ?? {}) as { event_type?: unknown; properties?: { role?: unknown; speech?: unknown } };
    if (m.event_type !== "conversation.utterance" || m.properties?.role !== "user") return null;
    const habla = typeof m.properties?.speech === "string" ? m.properties.speech.trim() : "";
    // Lo que la sala le manda a Verzy con `conversation.respond` vuelve como
    // frase del cliente: no es suya.
    if (!habla || habla.startsWith(MARCA_DEL_AVISO_INTERNO)) return null;
    return habla;
}

/** ¿Este mensaje dice que el CLIENTE empezó (true) o terminó (false) de hablar? */
export function siElClienteEstaHablando(mensaje: unknown): boolean | null {
    const m = (mensaje ?? {}) as { event_type?: unknown };
    if (m.event_type === "conversation.user.started_speaking") return true;
    if (m.event_type === "conversation.user.stopped_speaking") return false;
    return null;
}

/* ── El reloj de la reunión ────────────────────────────────────────────── */

/** Cuántos minutos antes del cierre se avisa que quedan cinco. */
export const AVISO_DE_CINCO_MIN = 5;
/** Cuántos minutos antes del cierre se avisa que queda uno. */
export const AVISO_DE_UNO_MIN = 1;
/** Cuándo empieza la despedida final, antes del corte: el corte nunca es a media frase. */
export const DESPEDIDA_ANTES_DEL_CIERRE_MS = 15_000;

export type MomentoDelReloj = "quedan-5" | "queda-1" | "despedida";
export type MomentoProgramado = { momento: MomentoDelReloj; en: Date };

/**
 * Los avisos del reloj, contados hacia atrás desde el cierre. En una reunión
 * corta, un aviso que caería en el primer minuto no se da (una reunión de 5
 * minutos no empieza diciendo «quedan 5»).
 */
export function losMomentosDelReloj(inicio: Date, cierre: Date): MomentoProgramado[] {
    const fin = cierre.getTime();
    const desde = inicio.getTime() + 60_000;
    const todos: MomentoProgramado[] = [
        { momento: "quedan-5", en: new Date(fin - AVISO_DE_CINCO_MIN * 60_000) },
        { momento: "queda-1", en: new Date(fin - AVISO_DE_UNO_MIN * 60_000) },
        { momento: "despedida", en: new Date(fin - DESPEDIDA_ANTES_DEL_CIERRE_MS) },
    ];
    return todos.filter((m) => m.momento === "despedida" || m.en.getTime() >= desde);
}

/**
 * ¿Toca dar este aviso ahora? Uno que ya pasó hace rato (la página se recargó
 * a mitad de reunión) no se da tarde: diría «quedan 5» con dos minutos.
 */
export function tocaElAviso(m: MomentoProgramado, ahora: Date, yaDados: ReadonlySet<MomentoDelReloj>): boolean {
    if (yaDados.has(m.momento)) return false;
    const retraso = ahora.getTime() - m.en.getTime();
    return retraso <= (m.momento === "despedida" ? DESPEDIDA_ANTES_DEL_CIERRE_MS : 45_000);
}

/* ── La espera de un humano ────────────────────────────────────────────── */

/** Cuánto se espera al asesor desde que el cliente lo pide, en minutos. */
export const MINUTOS_DE_ESPERA_DEL_HUMANO = 3;

/** Los tres avisos de la espera, en minutos desde que lo pidió. */
export const PASOS_DE_LA_ESPERA = [1, 2, 3] as const;
export type PasoDeLaEspera = (typeof PASOS_DE_LA_ESPERA)[number];

/* ── Lo que se le dice y se le cuenta a Verzy ─────────────────────────── */

function elPrimerNombre(nombre: string | null | undefined): string {
    return String(nombre ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Lo que Verzy dice EN EL ACTO cuando el cliente pide un humano. Nunca «ya hay alguien». */
export function alPedirUnHumano(nombre?: string | null): string {
    const n = elPrimerNombre(nombre);
    return `${n ? `Claro, ${n}. ` : "Claro. "}Dame un momento, he notificado a un humano para que ingrese a la reunión.`;
}

/** Lo que se le cuenta a Verzy (contexto) al pedir el humano. */
export const CONTEXTO_AL_PEDIR_UN_HUMANO =
    "El cliente pidió hablar con una persona y ya le dijiste que notificaste a un humano para que ingrese a la reunión. " +
    "Mientras llega, sigue la conversación con normalidad. Nunca digas que ya hay un humano conectado ni cuelgues la llamada.";

/** Lo que se le pide decir en cada minuto de la espera (`conversation.respond`). */
export function elAvisoDeLaEspera(paso: PasoDeLaEspera): string {
    if (paso === 1) {
        return "Pasó un minuto y el asesor todavía no entra. Dile al cliente con naturalidad, en una frase, que el asesor ya fue notificado y que espere un poco más; luego sigue la conversación con normalidad.";
    }
    if (paso === 2) {
        return "Pasaron dos minutos. Dile al cliente, en una frase amable, que el asesor se está demorando un poco más de lo esperado y pídele un minuto adicional; sigue atendiéndolo con normalidad.";
    }
    return (
        "Pasaron tres minutos y el asesor no pudo entrar. Ofrécele al cliente reagendar la reunión directamente con un asesor humano, sin avatar, " +
        "para que lo llame y continúe el proceso de forma personalizada. Pregúntale qué día y a qué hora le queda bien; " +
        "cuando lo confirme, agéndalo con agendar_seguimiento (tipo recordatorio, nota «Llamada con un asesor humano»)."
    );
}

/** Lo que se le cuenta a Verzy cuando el asesor entra mientras lo esperaban. */
export const AL_ENTRAR_EL_ASESOR =
    "El asesor humano acaba de entrar a la reunión. Dale la bienvenida en una frase corta, preséntaselo al cliente y déjale la palabra: no hables hasta que te pregunten.";

/** Lo que se le cuenta a Verzy (contexto) cuando el cliente quiere comprar. */
export const AL_QUERER_COMPRAR =
    "El cliente mostró intención clara de comprar. Deja el diagnóstico y la presentación y pasa ya al cierre: " +
    "1) si no dijo qué plan, pregúntaselo, y envíale el enlace de pago con enviar_por_whatsapp (que: pago, con el plan); " +
    "2) acompáñalo: puedes pedirle que comparta su pantalla para verificar el pago y guiarlo en el registro de su cuenta; " +
    "3) cuando su cuenta esté activa, oriéntalo a los videotutoriales y a agendar una reunión con el equipo de soporte e implementación desde dentro de la plataforma, ya con su sesión iniciada; " +
    "4) pregúntale si quiere que lo sigas ayudando en algo puntual ahora o si prefiere explorar por su cuenta y agendar el soporte cuando lo necesite. " +
    "Despídete de forma cercana y natural, sin guion rígido.";

/** La despedida de un NO explícito: cordial, sin insistir. */
export function laDespedidaDelNo(nombre?: string | null): string {
    const n = elPrimerNombre(nombre);
    return `Entiendo perfectamente${n ? `, ${n}` : ""}. Gracias por tu tiempo; si más adelante lo necesitas, seguimos en contacto por WhatsApp. ¡Que tengas un excelente día!`;
}

export const CONTEXTO_DEL_NO =
    "El cliente dijo con claridad que no le interesa y ya te despediste de forma cordial. No insistas, no ofrezcas nada más y no vuelvas a hablar: la llamada se está cerrando.";

/** Lo que se le pide decir cuando quedan 5 minutos. */
export function elAvisoDeCincoMinutos(enProcesoDePago: boolean): string {
    if (enProcesoDePago) {
        return (
            "Quedan 5 minutos de reunión y el cliente ya está en proceso de pago o registro. Díselo con naturalidad en una frase " +
            "y pregúntale si necesita algo más para terminar, o si prefiere agendar directamente con el equipo de soporte desde la plataforma."
        );
    }
    return (
        "Quedan 5 minutos de reunión. Díselo al cliente con naturalidad en una frase y lleva la conversación al cierre: " +
        "pregúntale qué plan quiere adquirir y, cuando lo elija, envíale el enlace de pago con enviar_por_whatsapp (que: pago). " +
        "No le ofrezcas de entrada hablar con un humano. Solo si duda o se resiste a cerrar, ofrécele como alternativa que un asesor humano " +
        "lo acompañe a completar el proceso para que tenga acceso inmediato a la solución."
    );
}

/** Lo que se le pide decir cuando queda 1 minuto. */
export const AVISO_DE_UN_MINUTO =
    "Queda 1 minuto de reunión. Avísale al cliente con naturalidad que la sesión está por cerrarse. " +
    "Si pide que lo sigan ayudando, dale una recomendación final rápida y concreta de los pasos a seguir y dile que el seguimiento continúa por WhatsApp.";

/** La despedida del minuto 30: limpia, y el seguimiento pasa a WhatsApp. */
export function laDespedidaDelCierre(nombre?: string | null): string {
    const n = elPrimerNombre(nombre);
    return `${n ? `${n}, l` : "L"}legamos al tiempo de nuestra reunión. Te escribimos por WhatsApp para seguir desde ahí con lo que necesites. ¡Gracias por tu tiempo y que tengas un excelente día!`;
}

export const CONTEXTO_DEL_CIERRE =
    "Se acabó el tiempo de la reunión y ya te despediste. No vuelvas a hablar: la llamada se está cerrando y el seguimiento sigue por WhatsApp.";

/** Lo que va por `conversation.respond`: con la marca, para que nunca pase por frase del cliente. */
export function comoAvisoInterno(texto: string): string {
    return `${MARCA_DEL_AVISO_INTERNO} ${texto}`;
}

/* ── Lo que la sala le pide al servidor ───────────────────────────────── */

export const TIPOS_DE_ATENCION = ["humano", "incomodidad", "descartado", "seguimiento", "reagendada"] as const;
export type TipoDeAtencion = (typeof TIPOS_DE_ATENCION)[number];
export type PedidoDeAtencion = { tipo: TipoDeAtencion; frase: string | null; cuando: string | null };

/** Lo que llega del navegador, saneado. `null` si no es un pedido. */
export function comoPedidoDeAtencion(valor: unknown): PedidoDeAtencion | null {
    const v = (valor && typeof valor === "object" ? valor : {}) as { tipo?: unknown; frase?: unknown; cuando?: unknown };
    const tipo = typeof v.tipo === "string" ? v.tipo.trim().toLowerCase() : "";
    if (!(TIPOS_DE_ATENCION as readonly string[]).includes(tipo)) return null;
    const frase = typeof v.frase === "string" && v.frase.trim() ? v.frase.replace(/\s+/g, " ").trim().slice(0, 200) : null;
    const cuando = typeof v.cuando === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.cuando.trim()) ? v.cuando.trim() : null;
    if (tipo === "reagendada" && !cuando) return null;
    return { tipo: tipo as TipoDeAtencion, frase, cuando };
}

/** El aviso que le llega al EQUIPO (WhatsApp y empuje). Nunca al cliente. */
export function elAvisoAlEquipo(
    pedido: PedidoDeAtencion,
    datos: { nombre: string | null; enlace: string | null },
): { titulo: string; texto: string } | null {
    const quien = datos.nombre?.trim() || "Un prospecto";
    const entra = datos.enlace ? `\n\n👉 Entra a la reunión: ${datos.enlace}` : "";
    if (pedido.tipo === "humano") {
        return {
            titulo: `${quien} pide hablar con una persona`,
            texto: `🙋 *${quien}* pidió hablar con una persona en su videollamada con Verzy. Tienes 3 minutos para entrar antes de que se le ofrezca reagendar.${entra}`,
        };
    }
    if (pedido.tipo === "incomodidad") {
        const dijo = pedido.frase ? `\nDijo: «${pedido.frase}»` : "";
        return {
            titulo: `${quien} se nota incómodo en la videollamada`,
            texto: `⚠️ *${quien}* muestra señales de incomodidad en su videollamada con Verzy. Verzy sigue con normalidad; tú decides si entrar.${dijo}${entra}`,
        };
    }
    if (pedido.tipo === "reagendada") {
        return {
            titulo: `${quien} quedó en hablar con un asesor`,
            texto: `📅 *${quien}* no alcanzó a hablar con un asesor en la videollamada y quedó para el *${(pedido.cuando ?? "").replace("T", " a las ")}*. Llámalo a esa hora para seguir el proceso de forma personalizada.`,
        };
    }
    return null;
}

/** El WhatsApp al CLIENTE cuando la reunión se cierra por tiempo. */
export function elMensajeDeSeguimiento(nombre: string | null | undefined): string {
    const n = elPrimerNombre(nombre);
    return `👋 ${n ? `Hola ${n}` : "Hola"}, gracias por la videollamada. Seguimos por aquí: escríbenos lo que necesites y te acompañamos con el siguiente paso.`;
}

/* ── Lo que Verzy sabe desde el principio ─────────────────────────────── */

/**
 * El bloque del contexto de Tavus. La sala hace cumplir lo que importa
 * (avisos, reloj, despedidas), pero Verzy lo sabe desde el primer minuto: si
 * una frase no se reconoce, igual sabe qué hacer.
 */
export function elBloqueDeAtencion(limiteMinutos: number): string {
    const quedan5 = Math.max(0, limiteMinutos - AVISO_DE_CINCO_MIN);
    const queda1 = Math.max(0, limiteMinutos - AVISO_DE_UNO_MIN);
    return [
        "ATENCIÓN HUMANA, CIERRE Y TIEMPO (manda sobre el guion)",
        `- Mensajes que empiezan con «${MARCA_DEL_AVISO_INTERNO}» te los manda el sistema, no el cliente: haz lo que piden, nunca los leas en voz alta ni menciones alertas, sistemas o avisos internos. Habla siempre con naturalidad.`,
        `- La reunión dura como mucho ${limiteMinutos} minutos, sin excepción, también si el cliente está pagando o registrándose. Hasta el minuto ${Math.max(0, quedan5 - 5)} es diagnóstico y propuesta; en el ${quedan5} quedan 5 minutos y se va al cierre; en el ${queda1} queda 1; al final se despide y el seguimiento sigue por WhatsApp. Nunca cortes sin avisar.`,
        "- Si el cliente pide hablar con una persona: di que notificaste a un humano para que ingrese a la reunión. Nunca digas que ya hay un humano conectado ni cuelgues.",
        "- Si en cualquier minuto el cliente quiere comprar, no esperes al final: envíale el enlace de pago del plan que pidió con enviar_por_whatsapp, acompáñalo con el pago y el registro (puedes pedirle que comparta pantalla para verificarlo), y con la cuenta activa oriéntalo a los videotutoriales y a agendar soporte e implementación desde la plataforma.",
        "- Si dice de forma explícita que no le interesa, que está muy caro o que no es lo que busca: despídete cordialmente y no insistas.",
    ].join("\n");
}
