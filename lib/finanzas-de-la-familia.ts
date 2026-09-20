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
    // Un arreglo se JUNTA, no se recorta a su primer elemento. Llega por dos
    // caminos y los dos lo necesitan entero: `?cuentas=a&cuentas=b`, que es como
    // Next entrega un parámetro repetido, y la lista de ids que le pasa una
    // acción. Quedándose con `raw[0]` se consultaba **una sola cuenta** y la
    // pantalla salía con menos filas de las pedidas, sin un solo error.
    const texto = Array.isArray(raw) ? raw.join(",") : raw;
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

/* ───────────────────── Lo que se está mirando ahora ─────────────────────── */

/**
 * Las cuentas elegidas, en el orden en que se ofrecen.
 *
 * Se filtra contra `disponibles` y no al revés: lo que no esté ahí no se puede
 * nombrar, así que un id que llegó por la URL y no alcanza **no aparece** en
 * ninguna lista de la pantalla. Es la misma regla de `laSeleccionQueVale` un
 * paso más adelante, aplicada a lo que se pinta.
 */
export function lasCuentasElegidas(
    disponibles: readonly CuentaDeFinanzas[],
    elegidas: readonly string[],
): CuentaDeFinanzas[] {
    const puestas = new Set(elegidas);
    return disponibles.filter((c) => puestas.has(c.id));
}

/**
 * ¿Se está consolidando? Es **más de una cuenta**, no «hay selector».
 *
 * De aquí cuelga todo lo que cambia en una lista: la columna «Cuenta», que las
 * filas de otra cuenta no se editen, y el aviso de monedas. Con una sola cuenta
 * elegida —el caso de siempre, y el único que ve una cuenta hija— la pantalla
 * tiene que verse exactamente como antes de que esto existiera.
 */
export function estaConsolidando(elegidas: readonly string[]): boolean {
    return elegidas.length > 1;
}

/** El nombre de cada cuenta elegida, para pintarlo en la fila. */
export function nombresPorCuenta(cuentas: readonly CuentaDeFinanzas[]): Record<string, string> {
    const nombres: Record<string, string> = {};
    for (const c of cuentas) nombres[c.id] = c.nombre;
    return nombres;
}

/**
 * Consolidar es para MIRAR, no para editar.
 *
 * Las acciones de escritura de Finanzas acotan por la cuenta con la que se
 * llaman —`deleteSale` hace `where: { id, userId }`—, así que una fila de otra
 * cuenta **no casa con ninguna** y el botón contesta «Venta no encontrada». Eso
 * es «menú abierto, puerta cerrada»: se ofrece algo que la acción de detrás
 * rechaza.
 *
 * Así que la fila ajena se ve y no se toca: sin lápiz, sin papelera y sin
 * casilla. Para editarla se entra a esa cuenta, que es donde manda su fila
 * efectiva. Ensanchar la escritura a toda la familia sería lo contrario de lo
 * que dice la regla de alcance.
 */
export function esDeOtraCuenta(duenoDeLaFila: string | null | undefined, propia: string): boolean {
    const dueno = String(duenoDeLaFila ?? "").trim();
    return Boolean(dueno) && dueno !== propia;
}

/**
 * Cuántas filas trae una lista, que **crece con las cuentas elegidas**.
 *
 * Ventas y Gastos traen 200 filas por cuenta desde siempre. Dejando ese 200
 * fijo al consolidar, las cinco cuentas se repartirían las mismas 200 —van
 * ordenadas por fecha, así que se intercalan— y **cada una enseñaría menos de
 * lo que enseña sola**: consolidar se vería como perder filas.
 *
 * Con techo, porque esta lista viaja entera al navegador y se filtra allí: sin
 * él, una familia grande manda miles de filas con sus adjuntos dentro.
 */
export const TOPE_POR_CUENTA = 200;
export const TECHO_DE_LA_LISTA = 1000;

export function topeDeLaLista(cuantasCuentas: number): number {
    const cuentas = Math.max(1, Math.floor(cuantasCuentas));
    return Math.min(cuentas * TOPE_POR_CUENTA, TECHO_DE_LA_LISTA);
}

/* ──────────────────────────── La moneda ─────────────────────────────────── */

export type MonedaDeLaSeleccion = {
    /** La moneda común, o `null` si no la hay. */
    moneda: string | null;
    /** Por qué no se puede sumar. `null` cuando sí se puede. */
    motivo: string | null;
};

/**
 * ¿Comparten moneda las cuentas elegidas? **Esta es la única que lo decide.**
 *
 * Estaba escrita dentro de `consolidar`, o sea que solo la sabía el desglose
 * del resumen. Al extender el selector a Ventas, Gastos, Clientes y
 * Proveedores haría falta la misma pregunta en cinco sitios, y copiada en cada
 * uno el día que se afine una las otras se quedan atrás — que aquí no se ve
 * como un error: se ve como una pantalla que suma pesos con dólares y enseña
 * un número perfectamente creíble.
 *
 * Sumar monedas distintas es la familia del «999999999 de -1 créditos»: *un
 * número que no se puede calcular no se sustituye por otro*.
 */
export function laMonedaDeLaSeleccion(
    cuentas: readonly { moneda: string }[],
): MonedaDeLaSeleccion {
    if (cuentas.length === 0) {
        return { moneda: null, motivo: "No hay ninguna cuenta elegida." };
    }

    const monedas = new Set(cuentas.map((c) => c.moneda));
    if (monedas.size > 1) {
        const lista = Array.from(monedas).sort().join(", ");
        return {
            moneda: null,
            motivo: `Las cuentas elegidas usan monedas distintas (${lista}), así que no se pueden sumar.`,
        };
    }

    return { moneda: cuentas[0].moneda, motivo: null };
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

    // La decide `laMonedaDeLaSeleccion`, que es la MISMA que miran el selector y
    // las cuatro listas. Escrita aquí dentro solo la sabía este desglose.
    const { moneda, motivo } = laMonedaDeLaSeleccion(filas);
    if (!moneda) return { filas, total: null, moneda: null, sinTotalPorque: motivo };

    const ingresos = filas.reduce((suma, f) => suma + f.ingresos, 0);
    const gastos = filas.reduce((suma, f) => suma + f.gastos, 0);

    return {
        filas,
        total: { ingresos, gastos, balance: ingresos - gastos },
        moneda,
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
