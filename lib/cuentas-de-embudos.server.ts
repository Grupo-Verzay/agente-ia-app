import "server-only";

import { db } from "@/lib/db";
import { canManageWorkspace } from "@/lib/workspace-roles";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { lasCuentasQueCuelganDe } from "@/lib/crm-de-la-familia";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { clientesDeLaCuenta } from "@/lib/cuentas-cliente";
import { recordarPorSesion } from "@/lib/cache-de-sesion";
import { isAdminOrReseller } from "@/lib/rbac";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import {
    TOPE_DE_CUENTAS,
    laCuentaDelTablero,
    type CuentaDelTablero,
} from "@/lib/embudos-de-la-cuenta";

/**
 * Qué cuentas puede mirar el tablero de Embudos, y cuál está mirando.
 *
 * # El alcance va HACIA ABAJO, y son TRES fuentes
 *
 * Una cuenta llega a otra por tres caminos, y los tres son hacia abajo. Hacen
 * falta los tres: con solo el primero, un reseller no vería a sus clientes
 * —sus líneas no cuelgan de él por `linked_accounts`— y era la mitad del
 * encargo.
 *
 * | | qué añade | quién lo usa |
 * | --- | --- | --- |
 * | `linked_accounts` hacia abajo | sus hijas, y las hijas de sus hijas | una cuenta madre con su familia |
 * | la cartera del reseller | los clientes que creó y los que le asignaron | un reseller |
 * | los clientes de la plataforma | las cuentas cliente que administra | una cuenta de la casa (`admin`, el dueño de la plataforma) |
 *
 * Las dos últimas salen de `clientesDeLaCuenta`, que es la MISMA función con la
 * que `/panel/clientes` y el reparto de módulos deciden a qué clientes llega
 * cada quien. Escribir aquí otra consulta sería un segundo reparto, y el día
 * que se afine uno el otro deja ver de más o de menos.
 *
 * **Nunca hacia arriba ni hacia los lados.** `lasCuentasQueCuelganDe` es la
 * regla del CRM tal cual: no se llega a la madre ni a una hermana, y una pareja
 * recíproca se anula por los dos lados. El superadministrador de verdad ve su
 * familia entera, porque toda ella cuelga de él.
 *
 * # La lista solo OFRECE; la puerta es la de siempre
 *
 * Lo que decide de verdad es `assertCanAccessTargetUser`, la puerta de más de
 * sesenta acciones, y se le pregunta por la cuenta elegida. Es a propósito:
 * la lista se construye de fuentes que ya van hacia abajo, y encima la cuenta
 * pasa por la puerta canónica. Si algún día una fuente se ensanchara sin
 * querer, la puerta lo sigue negando.
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
    Parameters<typeof cuentaQueManda>[0] &
    Parameters<typeof esSuperAdminDeVerdad>[0] & { effectiveId: string };

type Alcance = { disponibles: CuentaDelTablero[]; recortadas: boolean };

const SOLA: Alcance = { disponibles: [], recortadas: false };

/**
 * La llave con la que se recuerda el alcance: **los ids que deciden la
 * respuesta y nada más**. El rol entra porque decide si se consulta la cartera,
 * y `todaLaFamilia` porque el superadministrador y el administrador de la misma
 * cuenta no ven lo mismo — con la llave compartida, cinco segundos le pasarían
 * a uno el alcance del otro.
 */
function llaveDelAlcance(propia: string, rol: string, todaLaFamilia: boolean): string {
    return `embudos-de-la-cuenta|${todaLaFamilia ? "toda" : "abajo"}|${rol}|${propia}`;
}

/**
 * Las cuentas alcanzables con sus nombres, recordadas unos segundos.
 *
 * Una carga del tablero son varias peticiones —la página, el recargar, cada
 * acción de la barra— y todas preguntan lo mismo. Sin recordarlo, cada una
 * repite el `UNION` recursivo de `linked_accounts` y, en una cuenta de la casa,
 * la consulta de la cartera. El plazo es el de `lib/cache-de-sesion` (5 s) y lo
 * que tarda en notarse es vincular o desvincular una cuenta, que no es una
 * operación de cada minuto.
 */
async function alcanceDeLaCuenta(
    propia: string,
    rol: string,
    todaLaFamilia: boolean,
): Promise<Alcance> {
    return recordarPorSesion(
        llaveDelAlcance(propia, rol, todaLaFamilia),
        () => consultarElAlcance(propia, rol, todaLaFamilia),
        // Un alcance recortado por un fallo NO se queda pegado cinco segundos:
        // sería propagar esa pérdida de vista a las peticiones de al lado, y
        // eso se ve como un selector que a veces ofrece menos cuentas.
        { sirveParaCachear: (a) => a.disponibles.length > 0 },
    );
}

async function consultarElAlcance(
    propia: string,
    rol: string,
    todaLaFamilia: boolean,
): Promise<Alcance> {
    try {
        const familia = await laFamiliaDeLaCuenta(propia);
        const porEnlaces = todaLaFamilia
            ? familia.cuentas
            : lasCuentasQueCuelganDe(propia, familia.enlaces ?? []);

        // La cartera solo se consulta donde puede haber alguna: una cuenta
        // cliente normal no paga esta consulta nunca.
        const cartera = isAdminOrReseller(rol)
            ? await clientesDeLaCuenta({ id: propia, role: rol })
            : [];

        /*
         * Los nombres se piden SOLO de lo que no los trae ya.
         *
         * `clientesDeLaCuenta` devuelve nombre, empresa y correo, que es todo lo
         * que `nombreDeLaCuenta` necesita: volver a pedir esas filas sería
         * traerlas dos veces, y en una cuenta de la casa son todas las cuentas
         * cliente de la plataforma. Por los enlaces vienen solo ids —son un
         * puñado—, así que esa consulta se queda corta siempre.
         */
        const conNombre = new Map<string, { id: string; name: string | null; company: string | null; email: string | null }>();
        for (const c of cartera) if (c.id) conNombre.set(c.id, c);

        const sinNombre = [propia, ...porEnlaces].filter((id) => id && !conNombre.has(id));
        if (conNombre.size === 0 && sinNombre.length <= 1) return SOLA;

        if (sinNombre.length > 0) {
            const filas = await db.user.findMany({
                where: { id: { in: Array.from(new Set(sinNombre)) } },
                select: { id: true, name: true, company: true, email: true },
            });
            for (const f of filas) conNombre.set(f.id, f);
        }
        if (conNombre.size <= 1) return SOLA;

        const todas: CuentaDelTablero[] = Array.from(conNombre.values())
            .map((f) => ({
                id: f.id,
                // `nombreDeLaCuenta` y no `company` a secas: esa columna nace
                // «Empresa Demo», y el selector ofrecería filas iguales.
                nombre: nombreDeLaCuenta(f) || f.id,
                esLaPropia: f.id === propia,
            }))
            // La propia primero —es la que se abre a diario— y el resto por
            // nombre, para que la lista no cambie de orden entre dos cargas.
            .sort((a, b) => {
                if (a.esLaPropia !== b.esLaPropia) return a.esLaPropia ? -1 : 1;
                return a.nombre.localeCompare(b.nombre, "es");
            });

        // La propia SIEMPRE entra, recorte o no: es el tablero de quien mira.
        const disponibles = todas.slice(0, TOPE_DE_CUENTAS);
        return { disponibles, recortadas: todas.length > disponibles.length };
    } catch (error) {
        // Nunca lanza: el tablero tiene que abrir igual, y el lado seguro es la
        // cuenta propia —se ve de menos, nunca de más—. Pero **no es mudo**: un
        // selector que desaparece sin decir nada se lee como que la función no
        // existe.
        console.warn("[embudos] no se pudieron resolver las cuentas del tablero", {
            cuenta: propia,
            error: error instanceof Error ? error.message : String(error),
        });
        return SOLA;
    }
}

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

    const cuenta = await cuentaQueManda(persona);
    const { disponibles, recortadas } = await alcanceDeLaCuenta(
        propia,
        String(cuenta.role ?? ""),
        esSuperAdminDeVerdad(persona),
    );
    if (disponibles.length <= 1) return sola;

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
