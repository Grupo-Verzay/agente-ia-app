/**
 * El nivel de un cliente de reseller lo da SU LICENCIA, no un campo suelto.
 *
 * Un cliente que consume una licencia de un reseller guarda dos cosas por
 * separado: a qué licencia pertenece (`resellerSubscriptionPlanId`) y su nivel
 * (`plan`, el que abre o cierra módulos —Usuarios, por ejemplo, solo existe en
 * el Nivel 6—). Nada las ataba: el formulario de «Editar cliente» dejaba
 * escribir cualquier nivel, crear un cliente tomaba el nivel del formulario y no
 * el de la licencia, y un cliente podía elegir otro plan desde su Perfil. Así un
 * cliente de una licencia de Nivel 6 se quedaba en Nivel 5 —sin poder crear
 * usuarios— y nada lo decía: la licencia seguía contándolo como suyo.
 *
 * La regla, y es UNA: **si el cliente consume una licencia de un reseller que
 * existe, su nivel es el de esa licencia.** Lo que pida un formulario no la
 * cambia; para cambiar de nivel se cambia de licencia («Cambiar plan»).
 *
 * Es pura: entra lo leído de la base y sale la decisión. La lectura vive en
 * `nivel-de-la-licencia.server.ts`.
 */

/** Los niveles, de menor a mayor. Es el orden de `PLANS` (types/plans.ts). */
export const NIVELES = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"] as const;

/** Lo de una cuenta que dice si consume una licencia de reseller. */
export type ClienteDeLicencia = {
    isDemo: boolean | null;
    demoResellerId: string | null;
    resellerSubscriptionPlanId: string | null;
};

/** Una licencia de reseller: de quién es, qué plan reparte y su nivel. */
export type LicenciaDeReseller = {
    resellerUserId: string;
    subscriptionPlanId: string;
    plan: string;
};

/**
 * El nivel que le da su licencia, o `null` si no consume ninguna.
 *
 * Tres condiciones, y hacen falta las tres: no es una prueba (una demo no
 * consume licencia), cuelga de un reseller, y ese reseller TIENE la licencia
 * que el cliente dice usar. Sin la tercera, un cliente con un
 * `resellerSubscriptionPlanId` que ya no corresponde a ninguna licencia —un
 * reseller al que se le quitó ese plan— heredaría un nivel que nadie le da.
 */
export function elNivelDeLaLicencia(
    cliente: ClienteDeLicencia | null | undefined,
    licencias: LicenciaDeReseller[],
): string | null {
    if (!cliente) return null;
    if (cliente.isDemo) return null;
    if (!cliente.demoResellerId || !cliente.resellerSubscriptionPlanId) return null;
    const licencia = licencias.find(
        (l) =>
            l.resellerUserId === cliente.demoResellerId &&
            l.subscriptionPlanId === cliente.resellerSubscriptionPlanId,
    );
    return licencia?.plan ?? null;
}

/**
 * Qué nivel se guarda al tocar la ficha de un cliente.
 *
 * Con licencia: SIEMPRE el de la licencia, se pida lo que se pida y aunque el
 * formulario no mande el campo —así cualquier edición endereza a un cliente
 * que se hubiera quedado desalineado—. `corregido` dice si lo pedido era otro,
 * para poder avisarlo en vez de tragárselo en silencio.
 *
 * Sin licencia: lo pedido, tal cual (o nada, si no se pidió).
 */
export function elNivelQueSeGuarda(
    pedido: string | undefined | null,
    nivelDeLaLicencia: string | null,
): { plan: string | undefined; corregido: boolean } {
    const limpio = typeof pedido === "string" && pedido.trim() ? pedido.trim() : undefined;
    if (!nivelDeLaLicencia) return { plan: limpio, corregido: false };
    return {
        plan: nivelDeLaLicencia,
        corregido: limpio !== undefined && limpio !== nivelDeLaLicencia,
    };
}

/** La posición de un nivel (0 = lite). Lo que no se reconoce vale -1. */
export function laPosicionDelNivel(plan: string | null | undefined): number {
    return NIVELES.indexOf((plan ?? "") as (typeof NIVELES)[number]);
}

/**
 * ¿La cuenta está POR DEBAJO de su licencia? Es lo que se corrige en los datos
 * que ya existen: subirla al nivel que paga su reseller no le quita nada. Una
 * por ENCIMA no se toca aquí —bajarla le cerraría módulos que hoy usa—; se
 * endereza la próxima vez que alguien guarde su ficha, con aviso.
 */
export function estaPorDebajoDeSuLicencia(
    plan: string | null | undefined,
    nivelDeLaLicencia: string | null,
): boolean {
    if (!nivelDeLaLicencia) return false;
    const suyo = laPosicionDelNivel(plan);
    const deLaLicencia = laPosicionDelNivel(nivelDeLaLicencia);
    if (deLaLicencia < 0) return false;
    return suyo < deLaLicencia;
}
