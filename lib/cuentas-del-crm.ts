import "server-only";

import { currentUser } from "@/lib/auth";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { lasCuentasQueAlcanzaHaciaAbajo } from "@/lib/cuentas-hacia-abajo.server";
import {
    comoListaDeCuentas,
    laSeleccionDelCrm,
    type CuentaDelCrm,
} from "@/lib/crm-de-la-familia";

/**
 * Qué cuentas del CRM alcanza quien está mirando, y cuáles tiene puestas.
 *
 * # La puerta va aquí, no en la pantalla
 *
 * Las cuentas viajan en la URL (`?cuentas=a,b,c`) y en los parámetros de cada
 * acción, así que son una lista que llega de fuera: **una acción de servidor ES
 * un endpoint**. `getRegistrosByUserId(propia, …, ids)` se puede llamar a mano
 * con los ids que uno quiera, y lo que no alcanza se cae aquí. Esconder el
 * filtro no cierra la petición directa.
 *
 * # Y la diferencia con Finanzas, que es la que decide todo
 *
 * Allí, sin parámetro, se consulta **la cuenta propia**. Aquí, **todas las de
 * la familia**: la vista unificada es el punto de partida, y el filtro sirve
 * para REDUCIR. Está contado en `lib/crm-de-la-familia.ts`, y de ahí sale la
 * consecuencia de coste que hay que conocer antes de tocar esto: **el camino
 * común sí resuelve la familia**, porque sin resolverla no se sabe cuál es el
 * «todas». Por eso se recuerda unos segundos (ver abajo).
 *
 * # El alcance va HACIA ABAJO, nunca hacia arriba ni hacia los lados
 *
 * Cada cuenta ve lo suyo y lo de las cuentas que cuelgan de ella
 * (`lasCuentasQueCuelganDe`), y nunca lo de su madre ni lo de sus hermanas. El
 * superadministrador de verdad ve la familia entera, porque todas cuelgan de él.
 *
 * Antes era «la RAÍZ de la familia ve el componente entero», con la raíz
 * sacada de un recuento de votos. Eso dejó a Yair —administrador de Verzay |
 * Atencion, una cuenta INTERMEDIA— viendo las llamadas de Carlos Arcos, que está
 * por encima: en cuanto la intermedia gana el recuento, ve hacia arriba. El
 * alcance ya no depende de quién gane ningún recuento.
 */
export type CuentasDelCrm = {
    /** La cuenta desde la que se mira: la fila EFECTIVA de quien abre. */
    propia: string;
    /** Todas las que podría elegir. Solo tiene más de una si ve el filtro. */
    disponibles: CuentaDelCrm[];
    /** Las que de verdad se consultan. **Nunca vacía.** */
    elegidas: string[];
    /** Si no, no se pinta ningún filtro. */
    puedeElegir: boolean;
};

/** Lo que alcanza una cuenta, sin la selección aplicada encima. */
type Alcance = { disponibles: CuentaDelCrm[]; puedeElegir: boolean };

const SOLA: Alcance = { disponibles: [], puedeElegir: false };

/**
 * La familia de esta cuenta, con sus nombres.
 *
 * **Quién la resuelve es `lasCuentasQueAlcanzaHaciaAbajo`**, compartida con el
 * tablero de Embudos: la propia y lo que cuelga de ella, nunca su madre ni sus
 * hermanas, con su caché de unos segundos y su fallo no mudo. Aquí solo se le
 * pone la forma que este filtro espera.
 *
 * Esa función vive aparte desde el #948, y no por gusto: Embudos tenía su
 * propia copia de esta consulta y le había añadido la cartera de clientes, así
 * que su selector ofrecía cuentas sin ningún vínculo. Dos formas de contestar
 * «qué cuentas alcanza esta pantalla» son una que se afina y otra que se queda
 * atrás.
 */
async function alcanceDeLaCuenta(propia: string, todaLaFamilia: boolean): Promise<Alcance> {
    const cuentas = await lasCuentasQueAlcanzaHaciaAbajo(propia, todaLaFamilia);
    if (cuentas.length <= 1) return SOLA;
    // El tipo pide `moneda` porque lo comparte con el selector de Finanzas.
    // Aquí no decide nada: en el CRM no se suma dinero.
    return { disponibles: cuentas.map((c) => ({ ...c })), puedeElegir: true };
}

export async function resolverLasCuentasDelCrm(
    pedida: string,
    cuentasPedidas?: string | string[] | null,
): Promise<CuentasDelCrm> {
    const soloLaSuya = (propia: string): CuentasDelCrm => ({
        propia,
        disponibles: [],
        elegidas: [propia],
        puedeElegir: false,
    });

    if (!pedida) return soloLaSuya(pedida);

    const persona = await currentUser();
    if (!persona) return soloLaSuya(pedida);

    const superAdmin = esSuperAdminDeVerdad(persona);
    const manda = canManageWorkspace(persona);

    // **La cuenta desde la que se mira tampoco la decide el navegador.** Varias
    // acciones reciben `userId` como parámetro y su puerta
    // (`assertCanAccessTargetUser`) deja pasar en los DOS sentidos de
    // `linked_accounts`: una hija que mandara el id de su madre obtendría a la
    // madre y todo lo que cuelga de ella —sus hermanas incluidas—. Así que la
    // pedida solo vale si es la propia o cuelga de ella; si no, se mira desde
    // la propia, y se dice.
    const ancla = persona.effectiveId || pedida;
    let propia = pedida;
    if (pedida !== ancla && !superAdmin) {
        const deLaPropia = manda
            ? (await alcanceDeLaCuenta(ancla, false)).disponibles.map((c) => c.id)
            : [];
        if (!deLaPropia.includes(pedida)) {
            console.warn("[crm] se pidió una cuenta que no cuelga de la propia; se mira desde la propia", {
                pedida,
                propia: ancla,
                persona: persona.sessionUserId,
            });
            propia = ancla;
        }
    }

    // Un `agente` participa, no administra: ve su cuenta y nada más.
    if (!manda) return soloLaSuya(propia);

    const { disponibles, puedeElegir } = await alcanceDeLaCuenta(propia, superAdmin);
    if (!puedeElegir) return soloLaSuya(propia);

    const elegidas = laSeleccionDelCrm(
        comoListaDeCuentas(cuentasPedidas),
        disponibles.map((c) => c.id),
    );

    return { propia, disponibles, elegidas, puedeElegir: true };
}

/**
 * Las cuentas que una consulta del CRM va a mirar de verdad.
 *
 * Es lo que llaman las acciones, y **re-resuelve** la lista que llega del
 * navegador con la misma puerta que pinta el filtro. Lo que no alcanza se
 * descarta; sin nada que valga se devuelven **todas las alcanzables**, que para
 * una cuenta hija, un agente o una cuenta sin vinculadas es `[propia]` — o sea
 * exactamente lo que esas pantallas enseñaban antes de que existiera esto.
 */
export async function lasCuentasQueConsultaElCrm(
    propia: string,
    cuentasPedidas?: string | readonly string[] | null,
): Promise<string[]> {
    const { elegidas } = await resolverLasCuentasDelCrm(
        propia,
        Array.isArray(cuentasPedidas)
            ? [...cuentasPedidas]
            : ((cuentasPedidas ?? null) as string | null),
    );
    return elegidas;
}
