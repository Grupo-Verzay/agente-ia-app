/**
 * La tarjeta de un plan en la landing (la principal y la de un reseller).
 *
 * Puro: lo usan las dos landings y el banco, sin navegador.
 */
import { conCreditosIncluidos, esLaLineaDeCreditos, losCreditosComoTexto } from "@/lib/creditos-incluidos";

export type PeriodoDeCobro = "monthly" | "quarterly" | "yearly";

/**
 * Con qué periodo abre la sección de precios: MENSUAL. El precio de partida es
 * el de un mes, y el descuento de trimestral o anual lo elige a mano quien lo
 * quiera ver. Abrir en anual enseñaba un precio con descuento que nadie había
 * pedido, y al pulsar «Comenzar» el cliente se encontraba con otro número.
 *
 * Si el mensual está apagado en el panel, el siguiente que haya: trimestral y
 * después anual.
 */
export function elPeriodoDeEntrada(disponibles: readonly PeriodoDeCobro[]): PeriodoDeCobro {
    if (disponibles.includes("monthly")) return "monthly";
    if (disponibles.includes("quarterly")) return "quarterly";
    if (disponibles.includes("yearly")) return "yearly";
    return "monthly";
}

/**
 * Los puntos clave de la tarjeta, como se pintan: los créditos dicen
 * «incluidos» y no «gratis», y la línea que solo repite los créditos del plan
 * se quita — la tarjeta ya los dice al lado del precio, resaltados.
 */
export function losPuntosDeLaTarjeta(lista: readonly string[] | null | undefined, creditos: number): string[] {
    if (!Array.isArray(lista)) return [];
    return lista
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => conCreditosIncluidos(f))
        .filter((f) => !esLaLineaDeCreditos(f, creditos));
}

/** El texto de los créditos junto al precio; `null` si el plan no trae. */
export function losCreditosDeLaTarjeta(creditos: number): string | null {
    const n = Number(creditos);
    if (!Number.isFinite(n) || n <= 0) return null;
    return `${losCreditosComoTexto(n)} créditos de IA incluidos`;
}
