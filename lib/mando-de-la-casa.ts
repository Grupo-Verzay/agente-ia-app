import "server-only";

import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { isAdminLike } from "@/lib/rbac";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";

/**
 * Quién manda en la CASA: la configuración de la plataforma entera.
 *
 * Precios y créditos de los planes, la ficha de venta de cada plan, las cuentas
 * bancarias y métodos de pago, los resellers —sus licencias, su perfil y qué
 * clientes cuelgan de cada uno—. Nada de eso es de una cuenta: lo que se toca
 * aquí lo ven todos los clientes de la plataforma.
 *
 * # Lo que pasaba
 *
 * Las pantallas del panel preguntaban esto (con `cuentaQueManda`) y **las
 * acciones de detrás no preguntaban nada**: `upsertSubscriptionPlan`,
 * `savePaymentMethodConfig` o `getResellersWithPools` contestaban a cualquiera
 * con sesión. Una acción de servidor ES un endpoint, así que esconder la
 * pantalla no cerraba la puerta: un cliente cambiaba el precio de un plan o el
 * número de cuenta al que pagan todos.
 *
 * Y las que sí preguntaban, preguntaban cada una a su manera — `user.role` (la
 * persona), `rolQueManda` (la cuenta) o nada—, que es como se llega a una
 * pantalla que abre y una acción que dice «No autorizado».
 *
 * # La regla, y es la de Analítica
 *
 * > Una cuenta **administradora** es de la casa. Lo que separa a la casa de un
 * > cliente es el rol de la CUENTA por la que se actúa (`admin` o
 * > `super_admin`), y el súper administrador de verdad pasa esté donde esté.
 *
 * Es exactamente `puedeVerLaAnaliticaDeLaCasa`, que ahora delega aquí: dos
 * fórmulas para «¿es de la casa?» serían una que se afina y otra que se queda.
 * Y como pasa por `esSuperAdminDeVerdad`, dentro de un cliente con «Ingresar»
 * el rol propio no cuenta: se entra para ver lo que ve él.
 *
 * Un `agente` de una cuenta de la casa no pasa (`cuentaQueManda` le devuelve su
 * propio rol, `user`), y un reseller tampoco: la suya es otra pantalla.
 */
export type PersonaDeLaCasa = {
    id?: string | null;
    role?: string | null;
    rolDeLaPersona?: string | null;
    porImpersonacion?: boolean | null;
    ownerId?: string | null;
    advisorRole?: string | null;
};

/** La mitad pura, para poder probarla sin levantar nada. */
export function mandaEnLaCasa(
    esSuperAdminDeLaPersona: boolean,
    rolDeLaCuenta: string | null | undefined,
): boolean {
    if (esSuperAdminDeLaPersona) return true;
    return isAdminLike(rolDeLaCuenta);
}

export async function mandaEnLaCasaDeVerdad(
    persona: PersonaDeLaCasa | null | undefined,
): Promise<boolean> {
    if (!persona?.id) return false;
    // Primero el súper administrador: detrás de la condición de cuenta no
    // serviría de nada (`lib/super-admin-de-verdad.ts`).
    if (esSuperAdminDeVerdad(persona)) return true;
    return mandaEnLaCasa(false, (await cuentaQueManda(persona)).role);
}
