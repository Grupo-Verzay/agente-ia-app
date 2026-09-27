/**
 * Números que llegan del navegador a una acción de configuración de la
 * plataforma —un precio, unos créditos, un total de licencias—.
 *
 * Una acción ES un endpoint: lo que llega no tiene por qué haber pasado por el
 * `<input type="number">` de la pantalla. Un `NaN` o un negativo guardados en el
 * precio de un plan salen en la página de pago de todos los clientes, y unos
 * créditos negativos se reparten al renovar.
 *
 * Lo que no es un número válido devuelve `null`, y quien llama decide: un campo
 * obligatorio lo rechaza con su motivo; uno opcional lo guarda vacío. Nunca se
 * sustituye por otro número —un cero inventado es un plan gratis—.
 */
export function comoNumeroNoNegativo(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === "") return null;
    const n = typeof valor === "number" ? valor : Number(valor);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

/** Lo mismo, entero: créditos, licencias, límites. */
export function comoEnteroNoNegativo(valor: unknown): number | null {
    const n = comoNumeroNoNegativo(valor);
    if (n === null || !Number.isInteger(n)) return null;
    return n;
}
