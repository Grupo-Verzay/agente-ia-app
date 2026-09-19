/**
 * Consolidar las finanzas de varias cuentas de una familia.
 *
 * Cada cuenta lleva su contabilidad aparte —`financeTransaction` escopa por
 * `userId`, ver `lib/finance-user.ts`— y eso no cambia. Lo que se añade es que
 * quien administra la familia pueda **elegir cuáles suma**, porque en la cuenta
 * madre conviven las finanzas de la casa con las personales y no siempre se
 * quieren mezclar.
 *
 * Todo lo que decide está aquí y es **puro**: qué cuentas valen, si se puede
 * sumar y cómo queda el desglose. Así se prueba sin levantar nada y, sobre
 * todo, **la pantalla y el servidor no pueden discrepar** — es la misma función
 * la que dice qué se pide y qué se enseña.
 */

/** Una cuenta que se puede elegir en el selector. */
export type CuentaDeFinanzas = {
    id: string;
    /** Lo que se lee en el selector: empresa, nombre o correo. */
    nombre: string;
    /** Su moneda preferida. Es lo que decide si se pueden sumar. */
    moneda: string;
    /** La cuenta desde la que se está mirando. */
    esLaPropia: boolean;
};

/** Lo que aporta una cuenta en el periodo que se está mirando. */
export type AporteDeCuenta = {
    cuentaId: string;
    nombre: string;
    moneda: string;
    ingresos: number;
    gastos: number;
    balance: number;
};

export type Consolidado = {
    /** Una fila por cuenta elegida, incluidas las que no aportaron nada. */
    filas: AporteDeCuenta[];
    /** La suma, o `null` cuando no se puede calcular. */
    total: { ingresos: number; gastos: number; balance: number } | null;
    /**
     * La moneda del total. `null` con el total en `null`.
     */
    moneda: string | null;
    /** Por qué no hay total. `null` cuando sí lo hay. */
    sinTotalPorque: string | null;
};

/**
 * Las cuentas que de verdad se van a consultar.
 *
 * **Lo que llega del navegador no decide a qué se llega.** La lista de ids
 * viaja en la URL, así que se filtra contra las cuentas que esa persona
 * alcanza; lo que no esté se descarta en silencio, que es lo correcto —un id
 * que no alcanza no es un error que enseñar, es un id que no existe para ella—.
 *
 * Y **sin selección vale la cuenta propia**, no la familia entera: es lo que
 * hace que esto no cambie nada para quien no toca el selector, ni para las
 * cuentas hijas, que no lo ven.
 */
export function laSeleccionQueVale(
    pedidas: readonly string[] | null | undefined,
    alcanzables: readonly string[],
    propia: string,
): string[] {
    const permitidas = new Set(alcanzables.map((c) => String(c ?? "").trim()).filter(Boolean));
    const vistas = new Set<string>();
    const buenas: string[] = [];

    for (const cruda of pedidas ?? []) {
        const id = String(cruda ?? "").trim();
        if (!id || vistas.has(id) || !permitidas.has(id)) continue;
        vistas.add(id);
        buenas.push(id);
    }

    return buenas.length > 0 ? buenas : [propia];
}

/**
 * La lista de ids tal como viaja en la URL (`?cuentas=a,b,c`).
 *
 * Se acota a `TOPE_DE_CUENTAS` antes de tocar la base: la familia de hoy son
 * cinco cuentas, pero el parámetro lo escribe quien quiera y un `IN (…)` con
 * miles de ids es una consulta que ningún índice ordena.
 */
export const TOPE_DE_CUENTAS = 50;

export function comoListaDeCuentas(raw: string | string[] | null | undefined): string[] {
    const texto = Array.isArray(raw) ? raw[0] : raw;
    if (!texto) return [];

    return String(texto)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, TOPE_DE_CUENTAS);
}

export function comoParametroDeCuentas(ids: readonly string[]): string {
    return ids.join(",");
}

/**
 * Agrupa lo que aportó cada cuenta y decide si hay total.
 *
 * # La moneda es lo que decide, y por eso el total puede faltar
 *
 * Cada cuenta tiene su `preferredCurrencyCode`. Sumar pesos con dólares da un
 * número que **parece bueno** y no significa nada, que es la peor clase de
 * error: nadie lo mira dos veces. Es la misma regla que ya costó un WhatsApp
 * diciéndole a una clienta «999999999 de -1 créditos» — *un número que no se
 * puede calcular no se sustituye por otro*.
 *
 * Así que con monedas distintas **el desglose sale igual** —cada fila en la
 * suya, que es cierta— y **el total no sale**, con el motivo al lado. Lo que no
 * puede pasar es que salga una cifra sumada a ciegas.
 */
export function consolidar(
    cuentas: readonly CuentaDeFinanzas[],
    aportes: ReadonlyMap<string, { ingresos: number; gastos: number }>,
): Consolidado {
    const filas: AporteDeCuenta[] = cuentas.map((c) => {
        const suyo = aportes.get(c.id);
        const ingresos = suyo?.ingresos ?? 0;
        const gastos = suyo?.gastos ?? 0;
        return {
            cuentaId: c.id,
            nombre: c.nombre,
            moneda: c.moneda,
            ingresos,
            gastos,
            balance: ingresos - gastos,
        };
    });

    if (filas.length === 0) {
        return { filas, total: null, moneda: null, sinTotalPorque: "No hay ninguna cuenta elegida." };
    }

    const monedas = new Set(filas.map((f) => f.moneda));
    if (monedas.size > 1) {
        const lista = Array.from(monedas).sort().join(", ");
        return {
            filas,
            total: null,
            moneda: null,
            sinTotalPorque: `Las cuentas elegidas usan monedas distintas (${lista}), así que no se pueden sumar.`,
        };
    }

    const ingresos = filas.reduce((suma, f) => suma + f.ingresos, 0);
    const gastos = filas.reduce((suma, f) => suma + f.gastos, 0);

    return {
        filas,
        total: { ingresos, gastos, balance: ingresos - gastos },
        moneda: filas[0].moneda,
        sinTotalPorque: null,
    };
}

/**
 * ¿Se enseña el selector?
 *
 * Tres condiciones, y las tres hacen falta:
 *
 * 1. **Manda en su cuenta** (`canManageWorkspace`). Un `agente` participa, no
 *    administra — el mismo reparto de siempre.
 * 2. **Es la cuenta MADRE de su familia.** Una cuenta hija sigue viendo
 *    únicamente lo suyo, que es el encargo; y además no podría consolidar a sus
 *    hermanas sin ver dinero que no es de nadie de su lado.
 * 3. **Y la familia tiene más de una cuenta.** Un selector con una sola opción
 *    dentro no filtra nada: ocupa sitio y enseña a no pulsarlo.
 */
export function seEnsenaElSelector(args: {
    mandaEnSuCuenta: boolean;
    esLaMadre: boolean;
    cuantasCuentas: number;
}): boolean {
    return args.mandaEnSuCuenta && args.esLaMadre && args.cuantasCuentas > 1;
}
