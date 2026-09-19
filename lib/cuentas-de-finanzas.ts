import "server-only";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laFamiliaDeLaCuenta, esLaCuentaMadre } from "@/lib/familia-de-cuentas";
import {
    comoListaDeCuentas,
    laSeleccionQueVale,
    seEnsenaElSelector,
    type CuentaDeFinanzas,
} from "@/lib/finanzas-de-la-familia";

/**
 * Qué cuentas de Finanzas alcanza quien está mirando, y cuáles ha elegido.
 *
 * # La puerta va aquí, no en la pantalla
 *
 * Las cuentas llegan en la URL (`?cuentas=a,b,c`), así que son una lista que
 * viene de fuera: se filtra contra la familia **en el servidor**, con la misma
 * regla que ya rige en los canales que cruzan cuentas. Esconder el selector no
 * cierra la petición directa — quien escriba el parámetro a mano tiene que
 * chocar con esto, no con la pantalla.
 *
 * # Y el caso por defecto no cambia para nadie
 *
 * Sin selector o sin parámetro se devuelve **la cuenta propia y nada más**, que
 * es exactamente lo que Finanzas hacía antes de esto. Una cuenta hija, un
 * agente y cualquiera que no toque el selector ven lo mismo de siempre.
 */
export type CuentasDeFinanzas = {
    /** La cuenta desde la que se mira (`lib/finance-user`). */
    propia: string;
    /** Todas las que podría elegir. Solo tiene más de una si ve el selector. */
    disponibles: CuentaDeFinanzas[];
    /** Las que de verdad se consultan. Nunca vacía. */
    elegidas: string[];
    /** Si no, no se pinta ningún selector. */
    puedeElegir: boolean;
};

export async function resolverLasCuentasDeFinanzas(
    propia: string,
    cuentasPedidas: string | string[] | null | undefined,
): Promise<CuentasDeFinanzas> {
    const soloLaSuya = (): CuentasDeFinanzas => ({
        propia,
        disponibles: [],
        elegidas: [propia],
        puedeElegir: false,
    });

    const persona = await currentUser();
    if (!persona) return soloLaSuya();

    // Un `agente` participa, no administra. Va antes de tocar la base: sin
    // permiso no hay ninguna consulta que hacer.
    if (!canManageWorkspace(persona)) return soloLaSuya();

    try {
        const familia = await laFamiliaDeLaCuenta(propia);

        if (!seEnsenaElSelector({
            mandaEnSuCuenta: true,
            esLaMadre: esLaCuentaMadre(familia, propia),
            cuantasCuentas: familia.cuentas.length,
        })) {
            return soloLaSuya();
        }

        const filas = await db.user.findMany({
            where: { id: { in: familia.cuentas } },
            select: { id: true, name: true, company: true, email: true, preferredCurrencyCode: true },
        });

        const disponibles: CuentaDeFinanzas[] = filas
            .map((f) => ({
                id: f.id,
                nombre: f.company?.trim() || f.name?.trim() || f.email?.trim() || f.id,
                moneda: f.preferredCurrencyCode || "COP",
                esLaPropia: f.id === propia,
            }))
            // La propia primero —es la que se mira a diario— y el resto por
            // nombre, para que la lista no cambie de orden entre dos cargas.
            .sort((a, b) => {
                if (a.esLaPropia !== b.esLaPropia) return a.esLaPropia ? -1 : 1;
                return a.nombre.localeCompare(b.nombre, "es");
            });

        const elegidas = laSeleccionQueVale(
            comoListaDeCuentas(cuentasPedidas),
            disponibles.map((c) => c.id),
            propia,
        );

        return { propia, disponibles, elegidas, puedeElegir: true };
    } catch (error) {
        // Nunca lanza: Finanzas tiene que abrir igual. Y el lado seguro es la
        // cuenta propia —se ve de menos, nunca de más—. Pero no es mudo: un
        // selector que desaparece sin decir nada se lee como que la función no
        // existe.
        console.warn("[finanzas] no se pudieron resolver las cuentas de la familia", {
            cuenta: propia,
            error: error instanceof Error ? error.message : String(error),
        });
        return soloLaSuya();
    }
}
