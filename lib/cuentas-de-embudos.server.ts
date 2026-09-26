import "server-only";

import { canManageWorkspace } from "@/lib/workspace-roles";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { lasCuentasQueAlcanzaHaciaAbajo } from "@/lib/cuentas-hacia-abajo.server";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import {
    TOPE_DE_CUENTAS,
    laCuentaDelTablero,
    type CuentaDelTablero,
} from "@/lib/embudos-de-la-cuenta";

/**
 * Qué cuentas puede mirar el tablero de Embudos, y cuál está mirando.
 *
 * # El alcance es el MISMO que el del CRM, y sale de la MISMA función
 *
 * `lasCuentasQueAlcanzaHaciaAbajo`: la cuenta propia y las que cuelgan de ella
 * por `linked_accounts`, nunca su madre ni sus hermanas; la familia entera solo
 * para el superadministrador de verdad, porque toda ella cuelga de él.
 *
 * Esto fue tres fuentes y ahora es una, y conviene saber por qué (#948). La
 * tercera era `clientesDeLaCuenta` —la cartera de un reseller, y en una cuenta
 * de la casa **todas las cuentas cliente de la plataforma**—, así que el
 * selector las ofrecía todas: decenas de cuentas sin ningún vínculo con la que
 * se estaba mirando. **Administrar o facturar a un cliente no lo mete en la
 * estructura de una cuenta**: eso es otra pregunta y la contesta
 * `/panel/clientes`.
 *
 * Y no se arregló quitándole la fuente a esta copia: se quitó la copia. Llamadas
 * y Finanzas resuelven esto con `laFamiliaDeLaCuenta`, y tener aquí una versión
 * paralela es exactamente cómo se llegó a que una de las tres pantallas ofreciera
 * otra cosa.
 *
 * # La lista solo OFRECE; la puerta es la de siempre
 *
 * Lo que decide de verdad es `assertCanAccessTargetUser`, la puerta de más de
 * sesenta acciones, y se le pregunta por la cuenta elegida. La lista se
 * construye de una fuente que ya va hacia abajo; esto es lo que lo garantiza
 * aunque algún día se ensanche sin querer.
 *
 * # Un `agente` no elige
 *
 * `canManageWorkspace` es la puerta de siempre: dueño, `administrador` y
 * superadministrador de verdad. Un agente participa, no administra, así que
 * alcanza **solo su cuenta** — y eso es lo que hace airtight a
 * `mandaEnLaCuenta`: si solo se llega a otra cuenta administrando, tener una
 * delante ya significa mandar en ella.
 */
export type CuentasDeEmbudos = {
    /** La cuenta cuyo tablero se está mirando. **Nunca vacía, nunca dos.** */
    elegida: string;
    /** La cuenta de quien mira: su fila efectiva. */
    propia: string;
    /** Todas las que podría elegir, la propia primera. `[]` si no hay filtro. */
    disponibles: CuentaDelTablero[];
    /** Si no, no se pinta ningún selector. */
    puedeElegir: boolean;
    /** Se recortó la lista por `TOPE_DE_CUENTAS`: la pantalla lo dice. */
    recortadas: boolean;
    /** Si manda en su PROPIA cuenta. En otra se manda por definición. */
    mandaEnLaPropia: boolean;
};

export type PersonaQueMira = Parameters<typeof canManageWorkspace>[0] &
    Parameters<typeof esSuperAdminDeVerdad>[0] & { effectiveId: string };

/**
 * Qué cuenta mira el tablero, con la pedida ya comprobada.
 *
 * La cuenta viaja en la URL (`?cuenta=`) y en los parámetros de cada acción, o
 * sea que llega de fuera: **una acción de servidor ES un endpoint**. Lo que no
 * se alcanza cae en la propia, y se dice.
 */
export async function resolverLaCuentaDelTablero(
    persona: PersonaQueMira,
    cuentaPedida?: unknown,
): Promise<CuentasDeEmbudos> {
    const propia = String(persona?.effectiveId ?? "").trim();
    const mandaEnLaPropia = canManageWorkspace(persona);

    const sola: CuentasDeEmbudos = {
        elegida: propia,
        propia,
        disponibles: [],
        puedeElegir: false,
        recortadas: false,
        mandaEnLaPropia,
    };
    if (!propia) return sola;

    // Un agente ve su cuenta y nada más: sin esto, `mandaEnLaCuenta` le daría
    // mando en la cuenta que nombrara.
    if (!mandaEnLaPropia) return sola;

    const alcanzadas = await lasCuentasQueAlcanzaHaciaAbajo(propia, esSuperAdminDeVerdad(persona));
    if (alcanzadas.length <= 1) return sola;

    // La propia SIEMPRE entra, recorte o no: es el tablero de quien mira, y
    // viene la primera de la función compartida.
    const disponibles: CuentaDelTablero[] = alcanzadas
        .slice(0, TOPE_DE_CUENTAS)
        .map((c) => ({ id: c.id, nombre: c.nombre, esLaPropia: c.esLaPropia }));
    const recortadas = alcanzadas.length > disponibles.length;

    const pedida = laCuentaDelTablero(
        cuentaPedida,
        disponibles.map((c) => c.id),
        propia,
    );

    // Y encima la puerta de siempre. La lista ya va hacia abajo por
    // construcción; esto es lo que lo garantiza aunque una fuente se ensanche.
    const elegida = pedida === propia || (await laPuertaPermiteLaCuenta(pedida)) ? pedida : propia;

    return { elegida, propia, disponibles, puedeElegir: true, recortadas, mandaEnLaPropia };
}

/**
 * La puerta canónica sobre una cuenta.
 *
 * La usan el selector y la lectura de UNA conversación, y **solo cuando la
 * cuenta no es la propia**: en la propia no hay nada que preguntar y sería una
 * consulta por carga para nada. La lista de cuentas solo dice qué se OFRECE;
 * esto es lo que decide, y es la misma puerta de más de sesenta acciones.
 */
export async function laPuertaPermiteLaCuenta(elegida: string): Promise<boolean> {
    try {
        await assertCanAccessTargetUser(elegida);
        return true;
    } catch (error) {
        console.warn("[embudos] se pidió una cuenta que la puerta no deja alcanzar", {
            pedida: elegida,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

/**
 * Las cuentas cuyas conversaciones alcanza quien mira, para comprobar UNA fila.
 *
 * Lo usa `laConversacion`: antes exigía que la conversación fuera de la cuenta
 * propia, y con el selector puesto eso rechaza la de una hija estando en su
 * tablero. Comprobar la pertenencia a este conjunto no depende de que el
 * navegador mande la cuenta correcta, que es lo que lo hace robusto.
 */
export async function lasCuentasDeEmbudosQueAlcanza(persona: PersonaQueMira): Promise<string[]> {
    const { propia, disponibles } = await resolverLaCuentaDelTablero(persona, null);
    const ids = new Set<string>([propia]);
    for (const c of disponibles) ids.add(c.id);
    return Array.from(ids).filter(Boolean);
}
