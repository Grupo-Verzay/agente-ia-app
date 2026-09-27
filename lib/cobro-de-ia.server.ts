import "server-only";

import {
    descontarLaTranscripcion,
    elNombreDeLaCuentaQuePaga,
    elSaldoDeLaCuenta,
} from "@/lib/creditos-de-transcripcion";
import { elAvisoSinCreditos, losTokensDelUso, puedeUsarLaIa, seCobra } from "@/lib/cobro-de-ia";
import type { SaldoDeLaCuenta } from "@/lib/saldo-de-la-cuenta";

/**
 * Las dos puntas del cobro de un uso de IA, contra la base. La regla está en
 * `lib/cobro-de-ia.ts`; aquí solo se lee el saldo y se descuenta, con las
 * MISMAS funciones que las transcripciones —no hay una segunda forma de leer
 * créditos ni de descontarlos—.
 *
 * Se usa así: `antesDeUsarLaIa(cuenta)` ANTES de pedir nada (si no alcanza no
 * se pide), y `cobrarElUsoDeIa(...)` DESPUÉS de tener la respuesta: cobrar
 * antes y que la IA falle sería cobrar por algo que no se entregó.
 */

export type AntesDeUsarLaIa =
    | { ok: true; saldo: SaldoDeLaCuenta }
    | { ok: false; saldo: SaldoDeLaCuenta; motivo: "sin_bolsa" | "sin_creditos"; aviso: string };

export async function antesDeUsarLaIa(cuenta: string): Promise<AntesDeUsarLaIa> {
    const saldo = await elSaldoDeLaCuenta(cuenta);
    const permiso = puedeUsarLaIa(saldo);
    if (permiso.ok) return { ok: true, saldo };
    const nombre = await elNombreDeLaCuentaQuePaga(cuenta);
    return { ok: false, saldo, motivo: permiso.motivo, aviso: elAvisoSinCreditos(permiso.motivo, nombre) };
}

/**
 * Descuenta lo que costó. Nunca lanza: la respuesta ya está entregada y un
 * fallo aquí no puede deshacerla; pero no es mudo, porque un cobro que no se
 * escribe es un uso que acaba pagando la plataforma.
 */
export async function cobrarElUsoDeIa(
    cuenta: string,
    saldo: SaldoDeLaCuenta,
    uso: { tokens?: number | null; entrada?: string | null; salida?: string | null },
    donde: string,
): Promise<number> {
    if (!seCobra(saldo)) return 0;
    const tokens = losTokensDelUso(uso);
    try {
        await descontarLaTranscripcion(cuenta, tokens);
        return tokens;
    } catch (error) {
        console.warn("[ia] no se pudo descontar el uso de IA", {
            donde,
            cuenta,
            tokens,
            error: error instanceof Error ? error.message : String(error),
        });
        return 0;
    }
}

export type UsoDeIaCobrado<T> =
    | { ok: true; valor: T; tokens: number }
    | { ok: false; motivo: "sin_bolsa" | "sin_creditos"; aviso: string };

/**
 * Las dos puntas en UNA llamada, para los usos que no necesitan nada entre
 * medias: comprueba el saldo de la cuenta DUEÑA, pide a la IA y cobra.
 *
 * - Sin créditos o sin bolsa **no se llama a `pedir`** y se devuelve el aviso
 *   nombrando la cuenta. No es mudo: se dice en la consola con su `donde`.
 * - Si `pedir` lanza (la IA no contestó, credenciales rechazadas…) **no se
 *   cobra** y el error sube tal cual: quien llama ya sabe qué hacer con él.
 * - Si contesta, se cobra lo que dijo el proveedor (o la estimación), entregue
 *   algo útil o no: la IA se usó. Es la regla de la sugerencia de respuesta.
 *
 * La usan el copiloto, el asistente de prompts, el resumen al cerrar, la
 * puntuación del lead, el informe semanal, el aprendizaje de ventas y las
 * imágenes. Si se añade otro uso de IA, va por aquí.
 */
export async function usarLaIaCobrando<T>(
    cuenta: string,
    donde: string,
    pedir: () => Promise<{ valor: T; tokens?: number | null; entrada?: string | null; salida?: string | null }>,
): Promise<UsoDeIaCobrado<T>> {
    const permiso = await antesDeUsarLaIa(cuenta);
    if (!permiso.ok) {
        console.info("[ia] no se usa la IA: la cuenta dueña no tiene créditos", {
            donde,
            cuenta,
            motivo: permiso.motivo,
        });
        return { ok: false, motivo: permiso.motivo, aviso: permiso.aviso };
    }
    const r = await pedir();
    const tokens = await cobrarElUsoDeIa(
        cuenta,
        permiso.saldo,
        { tokens: r.tokens, entrada: r.entrada, salida: r.salida },
        donde,
    );
    return { ok: true, valor: r.valor, tokens };
}
