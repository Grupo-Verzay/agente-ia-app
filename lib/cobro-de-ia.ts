import { alcanzaPara, seCobra, type SaldoDeLaCuenta } from "@/lib/saldo-de-la-cuenta";

/**
 * **La regla de la plataforma: todo uso de IA descuenta créditos de la cuenta
 * DUEÑA de lo que se analiza** —la conversación, el correo—, nunca de otra
 * cuenta, y nunca lo asume la plataforma.
 *
 * Aquí está la parte que se decide sin tocar la base, para que el análisis de
 * sentimiento, la sugerencia de respuesta de Chats y la de Correo digan
 * EXACTAMENTE lo mismo. Con la regla copiada en cada uno, el día que se afine
 * una las otras cobran otra cosa —y eso no se ve: se nota en la factura—.
 *
 * - **Cuánto**: los tokens que dice el proveedor. Si no los dice, se estiman
 *   por el largo del texto (cuatro caracteres por token, la cuenta de siempre),
 *   y nunca cero: un uso que no mueve el contador es un uso gratis que paga la
 *   plataforma.
 * - **Si alcanza**: `alcanzaPara(saldo, 1)`, la MISMA función que las
 *   transcripciones. Una cuenta que paga su propia IA es `ilimitado` y no se le
 *   descuenta (no la paga la plataforma: la paga ella con su llave); una sin
 *   bolsa NO usa la IA de la casa gratis.
 */

/** Lo mínimo que tiene que quedar para lanzar una petición a la IA. */
export const CREDITOS_MINIMOS_PARA_USAR_LA_IA = 1;

export type PermisoDeIa =
    | { ok: true }
    | { ok: false; motivo: "sin_bolsa" | "sin_creditos" };

export function puedeUsarLaIa(saldo: SaldoDeLaCuenta): PermisoDeIa {
    if (alcanzaPara(saldo, CREDITOS_MINIMOS_PARA_USAR_LA_IA)) return { ok: true };
    return { ok: false, motivo: saldo.estado === "sin_bolsa" ? "sin_bolsa" : "sin_creditos" };
}

/** El aviso que se enseña cuando no se usa la IA por créditos, nombrando la cuenta. */
export function elAvisoSinCreditos(motivo: "sin_bolsa" | "sin_creditos", cuenta?: string | null): string {
    const de = cuenta ? ` de «${cuenta}»` : "";
    return motivo === "sin_bolsa"
        ? `La cuenta${de} no tiene créditos de IA asignados.`
        : `A la cuenta${de} no le quedan créditos de IA. Recarga para seguir usándola.`;
}

/** Los tokens que se descuentan de un uso: los del proveedor, o una estimación; nunca cero. */
export function losTokensDelUso(input: {
    tokens?: number | null;
    entrada?: string | null;
    salida?: string | null;
}): number {
    const dichos = Number(input.tokens);
    if (Number.isFinite(dichos) && dichos > 0) return Math.ceil(dichos);
    const largo = (input.entrada?.length ?? 0) + (input.salida?.length ?? 0);
    return Math.max(1, Math.ceil(largo / 4));
}

/** Si ESTE saldo se descuenta (no, si la cuenta paga su propia IA o no tiene tope). */
export { seCobra };

/**
 * Los tokens que dice la respuesta CRUDA de un proveedor, cuando se le llama
 * sin pasar por `createAiClient`: OpenAI los trae en `usage.total_tokens` y
 * Gemini en `usageMetadata.totalTokenCount`. Si no los dice, `null`, y quien
 * cobra los estima por el largo con `losTokensDelUso` (nunca cero).
 *
 * Vive aquí, una vez, porque la usan el resumen al cerrar, la puntuación del
 * lead, el informe semanal, el aprendizaje de ventas y las imágenes: con la
 * lectura copiada en cada uno, el día que un proveedor cambie de forma uno
 * cobraría los tokens y otro la estimación.
 */
export function losTokensDelProveedor(respuesta: unknown): number | null {
    if (!respuesta || typeof respuesta !== "object") return null;
    const r = respuesta as {
        usage?: { total_tokens?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown } | null;
        usageMetadata?: { totalTokenCount?: unknown; promptTokenCount?: unknown; candidatesTokenCount?: unknown } | null;
    };
    const numero = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const openai = numero(r.usage?.total_tokens) || numero(r.usage?.prompt_tokens) + numero(r.usage?.completion_tokens);
    if (openai > 0) return Math.ceil(openai);
    const gemini =
        numero(r.usageMetadata?.totalTokenCount) ||
        numero(r.usageMetadata?.promptTokenCount) + numero(r.usageMetadata?.candidatesTokenCount);
    if (gemini > 0) return Math.ceil(gemini);
    return null;
}

/**
 * Lo que se descuenta por una IMAGEN generada cuando el proveedor no dice sus
 * tokens (el modelo `imagen-4` de Google, `generateImages`, no los devuelve).
 * Es la cuenta de la propia Gemini: una imagen de salida son 1.290 tokens. Sin
 * esto, la estimación por el largo cobraría solo el prompt —unas decenas de
 * tokens— por la operación más cara de la plataforma.
 */
export const TOKENS_DE_UNA_IMAGEN = 1290;
