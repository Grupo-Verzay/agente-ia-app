import "server-only";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { laFamiliaDeLaCuenta, esLaCuentaMadre } from "@/lib/familia-de-cuentas";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { recordarPorSesion } from "@/lib/cache-de-sesion";
import {
    comoListaDeCuentas,
    laSeleccionDelCrm,
    seEnsenaElFiltroDelCrm,
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
 * # Los vínculos van solo de madre a hija
 *
 * No hace falta ninguna comprobación aparte: `seEnsenaElFiltroDelCrm` exige ser
 * la **raíz** de la familia, y una cuenta hija no lo es. Así que una hija cae
 * en `soloLaSuya()` y ve únicamente lo suyo — ni lo de su madre ni lo de sus
 * hermanas. Es la misma puerta del selector de Finanzas, sin una condición
 * nueva al lado.
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
function llaveDelAlcanceDelCrm(propia: string): string {
    return `crm-de-la-familia|${propia}`;
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
async function alcanceDeLaCuenta(propia: string): Promise<Alcance> {
    return recordarPorSesion(
        llaveDelAlcanceDelCrm(propia),
        () => consultarElAlcance(propia),
        // Un alcance recortado por un fallo de la base NO se queda pegado cinco
        // segundos: sería propagar esa pérdida de vista a las peticiones de al
        // lado, y eso se ve como una pantalla que a veces trae menos filas.
        { sirveParaCachear: (a) => a.puedeElegir },
    );
}

async function consultarElAlcance(propia: string): Promise<Alcance> {
    try {
        const familia = await laFamiliaDeLaCuenta(propia);

        if (
            !seEnsenaElFiltroDelCrm({
                mandaEnSuCuenta: true,
                esLaMadre: esLaCuentaMadre(familia, propia),
                cuantasCuentas: familia.cuentas.length,
            })
        ) {
            return SOLA;
        }

        const filas = await db.user.findMany({
            where: { id: { in: familia.cuentas } },
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
    propia: string,
    cuentasPedidas?: string | string[] | null,
): Promise<CuentasDelCrm> {
    const soloLaSuya = (): CuentasDelCrm => ({
        propia,
        disponibles: [],
        elegidas: [propia],
        puedeElegir: false,
    });

    if (!propia) return soloLaSuya();

    const persona = await currentUser();
    if (!persona) return soloLaSuya();

    // Un `agente` participa, no administra. Va **antes** de tocar la base y
    // antes de la llave del recuerdo: sin permiso no hay ninguna consulta que
    // hacer, y su respuesta no depende de la familia.
    if (!canManageWorkspace(persona)) return soloLaSuya();

    const { disponibles, puedeElegir } = await alcanceDeLaCuenta(propia);
    if (!puedeElegir) return soloLaSuya();

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
