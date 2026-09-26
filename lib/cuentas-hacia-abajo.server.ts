import "server-only";

import { db } from "@/lib/db";
import { laFamiliaDeLaCuenta } from "@/lib/familia-de-cuentas";
import { lasCuentasQueCuelganDe } from "@/lib/crm-de-la-familia";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import { recordarPorSesion } from "@/lib/cache-de-sesion";

/**
 * Qué cuentas alcanza una pantalla que cruza cuentas: la propia y las que
 * cuelgan de ella HACIA ABAJO. Nunca su madre, nunca sus hermanas.
 *
 * # Por qué esto es UNA función y no una por pantalla
 *
 * Es la lección que costó el #948. El CRM y Finanzas resolvían esto con
 * `laFamiliaDeLaCuenta` + `lasCuentasQueCuelganDe`; **Embudos escribió su
 * propia versión** y le añadió una tercera fuente —`clientesDeLaCuenta`, la
 * cartera de un reseller o de una cuenta de la casa—. Para una cuenta `admin`
 * esa función devuelve **todas las cuentas cliente de la plataforma**, así que
 * el selector de Embudos las ofrecía todas: cuentas sin ningún vínculo con la
 * que se estaba mirando.
 *
 * No se arregló quitándole la tercera fuente a una copia: se quitó la copia.
 * Dos formas de contestar «qué cuentas alcanza esta pantalla» son una que se
 * afina y otra que se queda atrás, y la que se queda atrás no se ve como un
 * error — se ve como un selector que ofrece cuentas que no son de nadie.
 *
 * # Lo que decide, y nada más
 *
 * | | qué añade |
 * | --- | --- |
 * | `linked_accounts` hacia abajo | sus hijas, y las hijas de sus hijas |
 * | el superadministrador de verdad | la familia entera, porque toda cuelga de él |
 *
 * **La cartera NO entra.** Que una cuenta administre o facture a un cliente no
 * la pone dentro de su estructura: administrar es otra pregunta, y la contesta
 * `/panel/clientes` con `clientesDeLaCuenta`. Mezclarlas es lo que llenó el
 * selector de Embudos de cuentas ajenas.
 *
 * # Y esto solo OFRECE
 *
 * La puerta de verdad sigue siendo `assertCanAccessTargetUser` en cada acción.
 * Esta lista se construye de una fuente que ya va hacia abajo; la puerta es lo
 * que lo garantiza aunque algún día la fuente se ensanche sin querer.
 */
export type CuentaAlcanzada = {
    id: string;
    nombre: string;
    /** Lo pide el selector de Finanzas; donde no se suma dinero no decide nada. */
    moneda: string;
    esLaPropia: boolean;
};

/**
 * La llave con la que se recuerda: **los ids que deciden la respuesta y nada
 * más**. La familia de una cuenta solo depende de esa cuenta, así que dos
 * pantallas con el mismo `propia` comparten entrada —que es la mitad de la
 * gracia de compartir la función—.
 *
 * `todaLaFamilia` ENTRA: el superadministrador y el administrador de la misma
 * cuenta no ven lo mismo, y con la llave compartida cinco segundos le pasarían
 * a uno el alcance del otro.
 */
function llaveDelAlcance(propia: string, todaLaFamilia: boolean): string {
    return `cuentas-hacia-abajo|${todaLaFamilia ? "toda" : "abajo"}|${propia}`;
}

/**
 * Las cuentas alcanzables con sus nombres, recordadas unos segundos.
 *
 * Una pantalla del CRM o del tablero de Embudos son decenas de peticiones —la
 * carga, el refresco, cada acción de la barra— y todas preguntan lo mismo. Sin
 * recordarlo, cada una repite el `UNION` recursivo sobre `linked_accounts` para
 * devolver la misma lista de cinco ids. El plazo es el de `lib/cache-de-sesion`
 * (5 s) y lo que tarda en notarse es vincular o desvincular una cuenta, que no
 * es una operación de cada minuto.
 *
 * **Devuelve `[]` cuando no hay nada que elegir** —una sola cuenta—, que es lo
 * que apaga el selector en las dos pantallas.
 */
export async function lasCuentasQueAlcanzaHaciaAbajo(
    propia: string,
    todaLaFamilia: boolean,
): Promise<CuentaAlcanzada[]> {
    const casa = String(propia ?? "").trim();
    if (!casa) return [];
    return recordarPorSesion(
        llaveDelAlcance(casa, todaLaFamilia),
        () => consultarElAlcance(casa, todaLaFamilia),
        // Un alcance recortado por un fallo de la base NO se queda pegado cinco
        // segundos: sería propagar esa pérdida de vista a las peticiones de al
        // lado, y eso se ve como un selector que a veces ofrece menos cuentas.
        { sirveParaCachear: (cuentas) => cuentas.length > 0 },
    );
}

async function consultarElAlcance(
    propia: string,
    todaLaFamilia: boolean,
): Promise<CuentaAlcanzada[]> {
    try {
        const familia = await laFamiliaDeLaCuenta(propia);

        // El superadministrador ve la familia entera. Cualquier otro, lo que
        // cuelga de su cuenta hacia abajo — nunca su madre ni sus hermanas.
        const alcanzables = todaLaFamilia
            ? familia.cuentas
            : lasCuentasQueCuelganDe(propia, familia.enlaces ?? []);

        // Con una sola cuenta no hay nada que elegir ni que unificar.
        if (alcanzables.length <= 1) return [];

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

        return filas
            .map((f) => ({
                id: f.id,
                // `nombreDeLaCuenta` y no `company` a secas: esa columna nace
                // «Empresa Demo» y el selector ofrecería filas iguales.
                nombre: nombreDeLaCuenta(f) || f.id,
                moneda: f.preferredCurrencyCode || "COP",
                esLaPropia: f.id === propia,
            }))
            // La propia primero —es la que se mira a diario— y el resto por
            // nombre, para que la lista no cambie de orden entre dos cargas.
            .sort((a, b) => {
                if (a.esLaPropia !== b.esLaPropia) return a.esLaPropia ? -1 : 1;
                return a.nombre.localeCompare(b.nombre, "es");
            });
    } catch (error) {
        // Nunca lanza: la pantalla tiene que abrir igual, y el lado seguro es
        // la cuenta propia —se ve de menos, nunca de más—. Pero **no es mudo**:
        // un selector que desaparece sin decir nada se lee como que la función
        // no existe, y una vista que deja de unificar, como que faltan datos.
        console.warn("[cuentas] no se pudieron resolver las cuentas que cuelgan", {
            cuenta: propia,
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}
