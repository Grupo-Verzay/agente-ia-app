import "server-only";
import { db } from "@/lib/db";
import { laCuentaQuePaga } from "@/lib/cuenta-que-paga-la-llamada";

/**
 * La cuenta a la que el backend cobró la llamada de este sid: la MISMA
 * consulta y el MISMO desempate que las cuatro de `voicebot.service.ts`
 * (`ORDER BY "id" ASC LIMIT 1`). Ver `lib/cuenta-que-paga-la-llamada.ts`.
 *
 * Sin puerta de sesión, a propósito: la llaman la ruta interna del flujo, el
 * aviso de fin y el barrido, que no tienen sesión. El sid sale de la FILA,
 * que la escribió este servidor al lanzar la llamada — nunca del navegador.
 */
export async function elDuenoDelSid(sid: string | null | undefined): Promise<string | null> {
    const limpio = String(sid ?? "").trim();
    if (!limpio) return null;
    const filas = await db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "User" WHERE "astra_calls_sid" = ${limpio}
        ORDER BY "id" ASC LIMIT 1
    `;
    return filas[0]?.id ?? null;
}

/**
 * Quién paga la transcripción de una llamada. Si no coincide con la cuenta de
 * la fila **se dice**: es la señal de un sid compartido, y sin el aviso nadie
 * entendería por qué la bolsa que baja no es la de la cuenta que se mira.
 */
export async function laCuentaQuePagaLaLlamada(input: {
    cuentaDeLaFila: string;
    astraSid?: string | null;
}): Promise<string> {
    let duenoDelSid: string | null = null;
    try {
        duenoDelSid = await elDuenoDelSid(input.astraSid);
    } catch (error) {
        // Sin poder preguntar se queda con la fila, que es lo que hacía antes;
        // pero no en silencio.
        console.warn("[llamadas] no se pudo resolver la cuenta del sid", {
            astraSid: input.astraSid,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    const paga = laCuentaQuePaga({ cuentaDeLaFila: input.cuentaDeLaFila, duenoDelSid });
    if (paga !== input.cuentaDeLaFila) {
        console.warn("[llamadas] la llamada la pagó otra cuenta con el mismo sid", {
            astraSid: input.astraSid,
            cuentaDeLaFila: input.cuentaDeLaFila,
            cuentaQuePaga: paga,
        });
    }
    return paga;
}
