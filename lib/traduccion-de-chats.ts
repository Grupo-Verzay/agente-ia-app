/**
 * La traducción de Chats: qué se traduce solo, qué se ofrece a mano, cómo se
 * guarda y cómo se lee. Puro: lo usan el servidor y la burbuja, y así los dos
 * dicen lo mismo.
 *
 * # La regla que lo sostiene todo: debajo siempre va el ESPAÑOL
 *
 * La burbuja enseña **lo que viajó por WhatsApp** —lo que escribió el cliente,
 * o lo que recibió— y debajo, más pequeño, **su versión en español**:
 *
 * | | lo que se ve arriba | lo que va debajo |
 * | --- | --- | --- |
 * | mensaje del cliente | lo que escribió (inglés) | la traducción al español |
 * | mensaje del asesor | lo que le llegó (inglés) | lo que el asesor escribió en español |
 *
 * Es simétrico por construcción: una sola forma de guardarlo
 * (`raw.traduccion = { espanol, idioma, como, en }`) sirve para las dos
 * direcciones, y el historial conserva las dos versiones de cada mensaje —el
 * texto de la fila es el que viajó y `espanol` el otro—.
 *
 * # Va en `raw`, no en una columna
 *
 * Por lo mismo que la transcripción de una nota de voz: `chat_messages` la
 * escriben tres sitios distintos y añadirle columnas desde la App es lo que
 * reventó el #360.
 */

import {
    NOMBRE_DEL_IDIOMA,
    comoIdioma,
    cuantasLetras,
    elIdiomaDelTexto,
    esOtroIdioma,
    type Idioma,
} from "@/lib/idioma-del-cliente";

export type ComoSeTradujo = "automatica" | "manual" | "al_enviar";

export type Traduccion = {
    /** La versión en español: la que se pinta debajo. */
    espanol: string;
    /** El idioma del texto que viajó por WhatsApp. */
    idioma: Idioma;
    como: ComoSeTradujo;
    /** Cuándo se tradujo (ISO). */
    en: string;
};

/** Mensajes que una vuelta traduce como mucho: el resto, en la siguiente. */
export const TOPE_POR_VUELTA = 20;

/** Lo más largo que se manda a traducir: un texto de más no se trocea, se recorta. */
export const TOPE_DE_CARACTERES = 4000;

/** Lee una traducción guardada (o que llega de fuera). Lo que no encaje, `null`. */
export function comoTraduccion(valor: unknown): Traduccion | null {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    const v = valor as Record<string, unknown>;
    const espanol = typeof v.espanol === "string" ? v.espanol.trim() : "";
    const idioma = comoIdioma(v.idioma);
    const como: ComoSeTradujo =
        v.como === "manual" || v.como === "al_enviar" ? v.como : "automatica";
    if (!espanol || !idioma) return null;
    return { espanol, idioma, como, en: typeof v.en === "string" ? v.en : "" };
}

/** La traducción que viaja dentro del `raw` de una fila de `chat_messages`. */
export function laTraduccionDelRaw(raw: unknown): Traduccion | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return comoTraduccion((raw as Record<string, unknown>).traduccion);
}

/**
 * ¿La conversación la lleva una PERSONA?
 *
 * Mientras la IA lleva la conversación, la IA contesta en el idioma del cliente
 * y no hace falta traducir nada: no se gasta un crédito. La lleva una persona
 * cuando la IA está pausada para esa conversación (un asesor escribió, o se
 * apagó a mano) o cuando quedó esperando a un asesor (`escalated_at`). Tener
 * asesor asignado a secas NO cuenta: el reparto automático asigna todas las
 * conversaciones y la IA sigue contestando.
 */
export function laLlevaUnaPersona(input: { iaActiva: boolean | null; enEspera: boolean }): boolean {
    return input.iaActiva === false || input.enEspera;
}

/** ¿Se traducen SOLOS los mensajes del cliente? */
export function seTraduceSolo(input: { idioma: Idioma | null; laLlevaUnaPersona: boolean }): boolean {
    return esOtroIdioma(input.idioma) && input.laLlevaUnaPersona;
}

/** ¿Se traduce lo que escribe el asesor antes de salir? */
export function seTraduceAlEnviar(input: { idioma: Idioma | null; texto: string; reenviado?: boolean }): boolean {
    if (input.reenviado) return false;
    if (!esOtroIdioma(input.idioma)) return false;
    if (cuantasLetras(input.texto) < 2) return false;
    // Si el asesor ya escribió en el idioma del cliente, sale tal cual.
    return elIdiomaDelTexto(input.texto) !== input.idioma;
}

/**
 * ¿Un mensaje del cliente se traduce solo? Hace falta texto con letras, que no
 * esté traducido ya y que no esté claramente en español (un cliente que cambia
 * de idioma a mitad no gasta un crédito por mensaje en español).
 */
export function hayQueTraducirlo(input: { texto: string; traduccion: Traduccion | null }): boolean {
    if (input.traduccion) return false;
    if (cuantasLetras(input.texto) < 2) return false;
    return elIdiomaDelTexto(input.texto) !== "es";
}

/**
 * ¿Se ofrece «Traducir» en el menú de un mensaje? Es el respaldo de la
 * automática, así que vale para cualquier mensaje —del cliente, del asesor o de
 * la IA— con texto, sin traducción y que no esté claramente en español.
 */
export function seOfreceTraducir(input: { texto: string; traduccion: Traduccion | null }): boolean {
    return hayQueTraducirlo(input);
}

/** Lo que dice la línea de encima del español, en las dos direcciones. */
export function elRotuloDeLaTraduccion(t: Traduccion): string {
    const nombre = NOMBRE_DEL_IDIOMA[t.idioma];
    return t.como === "al_enviar" ? `Enviado en ${nombre} · original en español` : `Traducido del ${nombre}`;
}

/** Lo que se le pide a la IA: solo la traducción, con el formato de WhatsApp intacto. */
export function laInstruccionDeTraducir(destino: Idioma): string {
    const nombre = NOMBRE_DEL_IDIOMA[destino];
    return (
        `Eres un traductor profesional. Traduce al ${nombre} el mensaje de WhatsApp que te da el usuario.\n` +
        `Devuelve SOLO la traducción: sin comillas, sin explicaciones, sin notas.\n` +
        `Conserva emojis, números, precios, enlaces, correos y nombres propios tal cual, y el formato de WhatsApp (*negrilla*, _cursiva_, ~tachado~).\n` +
        `Mantén el tono y el registro del original. Si el texto ya está en ${nombre}, devuélvelo igual.`
    );
}

/** Lo que devolvió la IA, limpio. Vacío si no devolvió nada útil. */
export function limpiarLaTraduccion(salida: string | null | undefined): string {
    let t = String(salida ?? "").trim();
    // Comillas que envuelven la respuesta entera: el modelo a veces las pone.
    const par = t.match(/^["“«']([\s\S]*)["”»']$/);
    if (par) t = par[1].trim();
    return t;
}

/** El texto recortado a lo que se manda a traducir. */
export function paraTraducir(texto: string): string {
    const t = String(texto ?? "").trim();
    return t.length > TOPE_DE_CARACTERES ? t.slice(0, TOPE_DE_CARACTERES) : t;
}

/** Una traducción nueva, lista para guardar. */
export function unaTraduccion(espanol: string, idioma: Idioma, como: ComoSeTradujo, ahora = new Date()): Traduccion {
    return { espanol: espanol.trim(), idioma, como, en: ahora.toISOString() };
}

/** Lo que dice el campo de escribir cuando lo escrito se va a traducir. */
export function elAvisoDeLaCajaDeEscribir(idioma: Idioma | null): string | null {
    if (!esOtroIdioma(idioma)) return null;
    return `Escribe en español: se enviará en ${NOMBRE_DEL_IDIOMA[idioma]}`;
}

/**
 * La traducción que trae un envío del asesor, lista para guardarla en el `raw`
 * de la fila (`{ traduccion }`) o nada (`{}`). La pone la pantalla —que acaba de
 * pedirla a `traducirParaEnviarAction`— y los TRES caminos de envío (Evolution,
 * Waha y los canales) la guardan con la misma línea: una sola forma, y así el
 * historial conserva el original en español de lo que salió traducido.
 *
 * Lo que no encaje se descarta: es un dato que llega del navegador.
 */
export function laTraduccionDelEnvio(payload: unknown): { traduccion?: Traduccion } {
    if (!payload || typeof payload !== "object") return {};
    const t = comoTraduccion((payload as Record<string, unknown>).traduccion);
    return t ? { traduccion: { ...t, como: "al_enviar" } } : {};
}

/** Cuántas burbujas de la conversación abierta se preguntan, las más recientes. */
export const BURBUJAS_QUE_SE_PREGUNTAN = 60;

/**
 * Los ids de las burbujas de las que se pregunta su traducción: las de texto de
 * WhatsApp (ni notas internas, ni llamadas, ni reacciones, ni stickers, ni las
 * optimistas que todavía no tienen id de verdad), las últimas.
 */
export function losIdsQueSePreguntan(
    burbujas: Array<{ id: string; content?: string; kind?: string; isNote?: boolean }>,
): string[] {
    const ids: string[] = [];
    for (const b of burbujas) {
        if (!b?.id || b.id.startsWith("local-") || b.isNote || b.kind) continue;
        if (cuantasLetras(b.content ?? "") < 2) continue;
        ids.push(b.id);
    }
    return ids.slice(-BURBUJAS_QUE_SE_PREGUNTAN);
}
