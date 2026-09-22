import "server-only";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { recordarPorSesion } from "@/lib/cache-de-sesion";
import {
    comoListaDeCuentas,
    laSeleccionDelCrm,
    lasCuentasQueCuelganDe,
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
 * La llave con la que se recuerda el alcance.
 *
 * Son **los ids que deciden la respuesta y nada más**, igual que en
 * `getAssociatedAccountIds`: la familia de una cuenta solo depende de esa
 * cuenta, así que dos llamadas con el mismo `propia` devuelven lo mismo venga
 * de donde vengan. No entra la credencial porque no decide nada aquí — lo que
 * decide la persona (`canManageWorkspace`) se resuelve **antes**, sin tocar la
 * base, y ni siquiera llega a esta llave.
 */
function llaveDelAlcanceDelCrm(propia: string, todaLaFamilia: boolean): string {
    // `todaLaFamilia` ENTRA en la llave: el superadministrador y el
    // administrador de la misma cuenta no ven lo mismo, y compartir entrada
    // cinco segundos le pasaría a uno el alcance del otro.
    return `crm-de-la-familia|${todaLaFamilia ? "toda" : "abajo"}|${propia}`;
}

/**
 * La familia de esta cuenta, con sus nombres, recordada unos segundos.
 *
 * Son **tres consultas** (`laFamiliaDeLaCuenta`) más una de nombres, y una
 * pantalla del CRM son decenas de llamadas: la lista con su scroll infinito,
 * los totales, el tablero, los dos informes y cada acción de fila. Sin
 * recordarlo, cada una de ellas repetiría el mismo `UNION` recursivo sobre
 * `linked_accounts` para devolver la misma lista de cinco ids.
 *
 * El plazo es el de `lib/cache-de-sesion` (5 s) y se acepta a sabiendas: lo que
 * tarda en notarse es **vincular o desvincular una cuenta**, que no es una
 * operación de cada minuto.
 */
async function alcanceDeLaCuenta(propia: string, todaLaFamilia: boolean): Promise<Alcance> {
    return recordarPorSesion(
        llaveDelAlcanceDelCrm(propia, todaLaFamilia),
        () => consultarElAlcance(propia, todaLaFamilia),
        // Un alcance recortado por un fallo de la base NO se queda pegado cinco
        // segundos: sería propagar esa pérdida de vista a las peticiones de al
        // lado, y eso se ve como una pantalla que a veces trae menos filas.
        { sirveParaCachear: (a) => a.puedeElegir },
    );
}

async function consultarElAlcance(propia: string, todaLaFamilia: boolean): Promise<Alcance> {
    try {
        const familia = await laFamiliaDeLaCuenta(propia);

        // El superadministrador ve la familia entera. Cualquier otro, lo que
        // cuelga de su cuenta hacia abajo — nunca su madre ni sus hermanas.
        const alcanzables = todaLaFamilia
            ? familia.cuentas
            : lasCuentasQueCuelganDe(propia, familia.enlaces ?? []);

        // Con una sola cuenta no hay nada que elegir ni que unificar.
        if (alcanzables.length <= 1) return SOLA;

        const filas = await db.user.findMany({
            where: { id: { in: alcanzables } },
            select: {
                id: true,
                name: true,
                company: true,
                email: true,
                preferredCurrencyCode: true,
            },
        });

        const disponibles: CuentaDelCrm[] = filas
            .map((f) => ({
                id: f.id,
                // `nombreDeLaCuenta` y no `company` a secas: esa columna nace
                // «Empresa Demo» y el filtro ofrecería cinco filas iguales.
                nombre: nombreDeLaCuenta(f) || f.id,
                // El tipo lo pide porque lo comparte con el selector de
                // Finanzas. Aquí no decide nada: en el CRM no se suma dinero.
                moneda: f.preferredCurrencyCode || "COP",
                esLaPropia: f.id === propia,
            }))
            // La propia primero —es la que se mira a diario— y el resto por
            // nombre, para que la lista no cambie de orden entre dos cargas.
            .sort((a, b) => {
                if (a.esLaPropia !== b.esLaPropia) return a.esLaPropia ? -1 : 1;
                return a.nombre.localeCompare(b.nombre, "es");
            });

        return { disponibles, puedeElegir: true };
    } catch (error) {
        // Nunca lanza: el CRM tiene que abrir igual. Y el lado seguro es la
        // cuenta propia —se ve de menos, nunca de más—. Pero **no es mudo**: un
        // filtro que desaparece sin decir nada se lee como que la función no
        // existe, y una vista que deja de unificar se lee como que faltan
        // datos.
        console.warn("[crm] no se pudieron resolver las cuentas de la familia", {
            cuenta: propia,
            error: error instanceof Error ? error.message : String(error),
        });
        return SOLA;
    }
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
