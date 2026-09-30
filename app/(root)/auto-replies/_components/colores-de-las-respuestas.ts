import type { TipoDeRespuesta } from "@/lib/respuestas-rapidas";

/**
 * El color de cada clase de respuesta. Lo usan la pastilla de filtro de la barra
 * y el icono de cada tarjeta: con el color escrito en los dos sitios, el día que
 * se cambie uno la tarjeta de una respuesta de flujo dejaría de parecerse a su
 * pastilla, que es lo que la hace reconocible de un vistazo.
 */
export const COLOR_DEL_TIPO: Record<TipoDeRespuesta, string> = {
    texto: "#10B981",
    flujo: "#8B5CF6",
};

/** El de «Total», que no es una clase de respuesta. */
export const COLOR_DE_TODAS = "#3B82F6";
