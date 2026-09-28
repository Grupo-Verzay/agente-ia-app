/**
 * **Quién paga una llamada — y por tanto su transcripción.**
 *
 * La llamada la cobra el backend (`api-webhook`, `VoicebotService`), y la
 * cuenta a la que se la cobra la resuelve **por el `sid` de la sesión de
 * llamadas** (`User.astra_calls_sid`), con desempate por el `id` menor:
 *
 * ```sql
 * SELECT "id" FROM "User" WHERE "astra_calls_sid" = $1 ORDER BY "id" ASC LIMIT 1
 * ```
 *
 * (`src/modules/voicebot/cuenta-del-sid.ts` de aquel repositorio). Esa columna
 * **no es única** —es un `String?` pelado, sin índice—, así que dos cuentas
 * pueden llevar el mismo sid. Y la App llama con el sid de la cuenta DUEÑA de
 * la línea (`laCuentaDeLaLlamada`), que es también la cuenta bajo la que queda
 * la fila: cuando ese sid lo comparte otra cuenta de `id` menor, el backend
 * cobra la llamada a la otra.
 *
 * > **La transcripción se cobra, y su saldo se lee, en la MISMA cuenta que
 * > cobró la llamada: la dueña del `astraSid` con el MISMO desempate.** Si el
 * > criterio cambia, cambia en los dos repositorios: es una sola pregunta.
 *
 * Sin sid (una llamada de Meta, que no pasa por el voicebot) paga la cuenta de
 * la fila, como siempre.
 */

/**
 * Elige la cuenta de un sid entre las que lo llevan: **el `id` menor**, igual
 * que `laCuentaDelSid` del backend. Pura, para que el banco ejerza el
 * desempate sin levantar una base — y en cualquier orden de llegada.
 */
export function laCuentaDelSid(candidatos: readonly (string | null | undefined)[]): string | null {
    const ids = candidatos.map((c) => String(c ?? "").trim()).filter(Boolean);
    if (ids.length === 0) return null;
    return ids.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
}

/**
 * La cuenta que paga: la dueña del sid si se conoce; si no, la de la fila.
 * Un sid que ya no es de nadie (se desvinculó) no inventa a nadie: cae en la
 * fila, que es lo único que queda.
 */
export function laCuentaQuePaga(input: {
    cuentaDeLaFila: string;
    duenoDelSid: string | null;
}): string {
    return input.duenoDelSid ?? input.cuentaDeLaFila;
}
