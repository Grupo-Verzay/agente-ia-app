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
