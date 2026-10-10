import "server-only";

import { timingSafeEqual } from "crypto";

/**
 * ¿La petición trae la clave interna del backend (`CRM_FOLLOW_UP_RUNNER_KEY`),
 * por `Authorization: Bearer` o `x-internal-secret`? Sin clave configurada,
 * nadie pasa. La comparación es de tiempo constante.
 */
export function traeLaClaveInterna(request: Request): boolean {
    const esperado = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "").trim();
    if (!esperado) return false;
    const bearer = request.headers.get("authorization");
    const llega = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : (request.headers.get("x-internal-secret") ?? "").trim();
    const a = Buffer.from(llega);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
}
