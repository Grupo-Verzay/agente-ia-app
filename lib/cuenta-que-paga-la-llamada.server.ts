import "server-only";

import { db } from "@/lib/db";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { laCuentaQuePaga, type ElQuePaga } from "@/lib/cuenta-que-paga-la-llamada";

/**
 * La consulta que convierte un `astra_calls_sid` en la cuenta que llama.
 *
 * **Con `ORDER BY "id" ASC`, y eso no es un detalle de estilo.** La columna no
 * es única —ver el comentario de `lib/cuenta-que-paga-la-llamada.ts`— así que un
 * `LIMIT 1` sin desempate devuelve una fila cualquiera, y puede devolver otra en
 * la consulta siguiente. Con el desempate, esta consulta y las del backend que
 * cobran la llamada eligen **la misma cuenta siempre**, que es lo único que hace
 * que la llamada y su transcripción no puedan separarse.
 *
 * El mismo `ORDER BY` está escrito en los cuatro sitios del backend que
 * resuelven la cuenta de un sid (`laCuentaDelSid`, en `api-webhook`). Si se
 * cambia el criterio, se cambia en los dos repositorios: es una sola pregunta.
 */
export async function elDuenoDelSid(astraSid: string | null | undefined): Promise<string | null> {
    const sid = String(astraSid ?? "").trim();
    if (!sid) return null;
    try {
        const filas = await db.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "User" WHERE "astra_calls_sid" = ${sid} ORDER BY "id" ASC LIMIT 1
        `;
        return filas[0]?.id ?? null;
    } catch (error) {
        // Un fallo de lectura NO puede dejar la transcripción sin pagador: se
        // sigue con el dueño de la fila, que es lo que se hacía. Pero no es
        // mudo: el síntoma de esto es «a esta llamada le falta el resumen», que
        // es de lo más caro de diagnosticar.
        console.warn("[llamadas] no se pudo resolver la cuenta del sid de la llamada", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * **La cuenta que paga la transcripción y el Resumen IA de una llamada.**
 *
 * La misma que pagó la llamada: el dueño de su `astraSid`. Lo demás —el
 * respaldo, y la guarda de no cobrarle a una cuenta de fuera— lo decide
 * `laCuentaQuePaga`, que es pura y está probada.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El `astraSid` sale de la FILA, nunca del navegador.** Lo escribió este
 *    mismo servidor al lanzar la llamada, así que es un dato nuestro y no una
 *    entrada. Aceptándolo de fuera, cualquiera elegiría a quién se le gastan los
 *    créditos.
 * 2. **El camino normal no paga NADA de más.** Cuando el sid es de la misma
 *    cuenta bajo la que quedó la fila —la inmensa mayoría— no se consulta la
 *    familia: la guarda solo corre cuando las dos cuentas de verdad difieren.
 * 3. **No lleva ninguna puerta de sesión**, a propósito: esto lo llaman también
 *    la ruta interna del flujo y la espera de fondo, donde no hay sesión que
 *    preguntar. La puerta está antes, en la acción (`laCuentaDeLaFilaDeLlamada`).
 *    Poner aquí un `currentUser()` no cerraría nada: apagaría la transcripción
 *    de las llamadas que lanza un flujo.
 */
export async function laCuentaQuePagaLaLlamada(
    cuentaDeLaFila: string,
    astraSid?: string | null,
): Promise<ElQuePaga> {
    const cuentaDelSid = await elDuenoDelSid(astraSid);
    // Sin sid, o con el sid de la misma cuenta, no hace falta la familia.
    if (!cuentaDelSid || cuentaDelSid === cuentaDeLaFila) {
        return laCuentaQuePaga({ cuentaDeLaFila, cuentaDelSid, familiaDeLaFila: [] });
    }

    const familia = await laFamiliaDeLaCuenta(cuentaDeLaFila);
    const quien = laCuentaQuePaga({
        cuentaDeLaFila,
        cuentaDelSid,
        familiaDeLaFila: familia.cuentas,
    });

    // Que las dos cuentas difieran es lo que este arreglo vino a resolver, así
    // que **se dice**: sin esta línea, el día que vuelva a pasar no habría
    // forma de saber si el pagador se siguió o se descartó.
    if (quien.origen === "sid") {
        console.info("[llamadas] la transcripcion la paga la cuenta que pago la llamada", {
            cuentaDeLaFila,
            cuentaQuePaga: quien.cuentaId,
        });
    } else if (quien.origen === "ajena") {
        console.warn("[llamadas] el sid de la llamada es de una cuenta de fuera de la familia; no se le cobra", {
            cuentaDeLaFila,
            descartada: quien.descartada,
        });
    }
    return quien;
}
