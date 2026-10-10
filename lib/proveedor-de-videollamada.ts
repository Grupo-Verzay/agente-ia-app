/**
 * Con QUÉ se hace la videollamada con IA: dos proveedores que conviven, como
 * Evolution y Waha en WhatsApp. La cuenta elige uno en Agente IA ›
 * Videollamadas › Claves y puede cambiar cuando quiera; el resto (la sala, el
 * guion, las herramientas, la grabación, el resumen y el CRM) es el mismo.
 *
 * | proveedor | voz, oído, IA y transcripción | lo que se ve de Verzy |
 * | --- | --- | --- |
 * | `tavus` | Tavus (su persona), sala de Daily | la cara animada de Tavus |
 * | `verzay` | motor propio: OpenAI Realtime con la clave de la cuenta | el logo de Verzay que se mueve con su voz |
 *
 * Sin fila o con un valor desconocido, `tavus`: es lo que había antes y nada
 * cambia para quien no toca el ajuste.
 *
 * Puro: lo usan el servidor, la sala y el banco.
 */

export const PROVEEDORES_DE_VIDEOLLAMADA = ["tavus", "verzay"] as const;
export type ProveedorDeVideollamada = (typeof PROVEEDORES_DE_VIDEOLLAMADA)[number];

export const PROVEEDOR_DE_FABRICA: ProveedorDeVideollamada = "tavus";

export function comoProveedorDeVideollamada(valor: unknown): ProveedorDeVideollamada {
    return valor === "verzay" ? "verzay" : PROVEEDOR_DE_FABRICA;
}

export const NOMBRE_DEL_PROVEEDOR: Record<ProveedorDeVideollamada, string> = {
    tavus: "Tavus",
    verzay: "Motor propio de Verzay",
};

/**
 * ¿El proveedor elegido puede atender una videollamada? Tavus necesita la
 * clave y el avatar de la cuenta; el motor propio, su clave de OpenAI (la
 * misma de Llamadas con IA: Realtime es solo de OpenAI).
 */
export function elProveedorEstaListo(input: {
    proveedor: ProveedorDeVideollamada;
    hayAvatarDeTavus: boolean;
    hayClaveDeOpenAi: boolean;
}): boolean {
    return input.proveedor === "verzay" ? input.hayClaveDeOpenAi : input.hayAvatarDeTavus;
}

/** Lo que se le dice a quien elige la videollamada con IA sin tener lista la clave de su proveedor. */
export function loQueFaltaParaElProveedor(proveedor: ProveedorDeVideollamada): string {
    return proveedor === "verzay"
        ? "Configura tu clave de OpenAI en Agente IA › Llamadas › Claves para usar la videollamada con el motor propio de Verzay."
        : "Configura tu clave y tu avatar de Tavus en Agente IA › Videollamadas › Claves para usar la videollamada con IA.";
}

/* ── La conversación del motor propio ──────────────────────────────────── */

/**
 * La «dirección» de una conversación del motor propio. No hay sala de un
 * tercero: la sala es nuestra y se arma en el navegador. Se guarda en
 * `videollamadas_ia.conversacionUrl` como la de Tavus, así que reentrar,
 * reutilizar y reconectar siguen la MISMA regla (`queHacerAlAbrir`).
 */
export const PREFIJO_DE_LA_SALA_PROPIA = "verzay:";

export function laUrlDeLaSalaPropia(conversacionId: string): string {
    return `${PREFIJO_DE_LA_SALA_PROPIA}${conversacionId}`;
}

export function esSalaPropia(url: unknown): boolean {
    return typeof url === "string" && url.startsWith(PREFIJO_DE_LA_SALA_PROPIA);
}

/**
 * Con qué proveedor se conecta una conversación YA creada: lo dice su
 * dirección, no el ajuste de hoy. Cambiar de proveedor a mitad de una cita no
 * rompe la sala abierta: la siguiente conversación ya sale con el nuevo.
 */
export function elProveedorDeLaConversacion(url: unknown): ProveedorDeVideollamada {
    return esSalaPropia(url) ? "verzay" : "tavus";
}
