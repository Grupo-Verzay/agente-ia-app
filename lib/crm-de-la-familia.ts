/**
 * El CRM de una familia de cuentas: la madre ve lo suyo y lo de sus hijas,
 * unificado, y puede reducirlo a las cuentas que elija.
 *
 * # Por qué esto no es «Finanzas de la familia» con otro nombre
 *
 * El mecanismo es el mismo y se reutiliza entero —`laFamiliaDeLaCuenta` para
 * saber quiénes son, `esLaCuentaMadre` para saber quién consolida,
 * `comoListaDeCuentas` para leer el parámetro de la URL—, y eso es a propósito:
 * dos formas de resolver «qué cuentas alcanza esta pantalla» son una que se
 * afina y otra que se queda atrás.
 *
 * Lo que cambia es **una sola cosa, y es la que decide todo lo demás**:
 *
 * | | sin parámetro en la URL |
 * | --- | --- |
 * | Finanzas | **solo la cuenta propia** — el selector es para juntar a mano |
 * | CRM | **TODAS las de la familia** — la vista unificada es el punto de partida |
 *
 * En Finanzas consolidar es una elección porque en la cuenta madre conviven las
 * finanzas de la casa con las personales y sumarlas casi nunca es lo que se
 * quiere. En el CRM no: los leads, los registros, las llamadas y el tablero de
 * una familia son **el mismo embudo repartido entre varias líneas**, así que
 * mirarlos de uno en uno es justo el trabajo que esto viene a quitar —entrar
 * cuenta por cuenta—.
 *
 * De ahí sale la asimetría que hay que tener delante antes de tocar nada: aquí
 * la URL limpia significa «todas», así que **el parámetro se escribe para
 * REDUCIR**, no para ampliar. Al revés que en Finanzas.
 *
 * Todo lo que decide vive aquí y es **puro**, por el mismo motivo que allí: la
 * pantalla y el servidor no pueden discrepar si es la misma función la que dice
 * qué se ofrece y qué se consulta.
 */

import {
    comoListaDeCuentas,
    seEnsenaElSelector,
    type CuentaDeFinanzas,
} from "@/lib/finanzas-de-la-familia";

/**
 * Una cuenta que se puede elegir en el filtro del CRM.
 *
 * Es el MISMO tipo que el del selector de Finanzas, y se reexporta en vez de
 * escribir uno igual al lado: lo que lo pinta es el mismo componente
 * (`components/shared/SelectorDeCuentas.tsx`), así que dos tipos gemelos serían
 * dos sitios donde añadir el campo que haga falta el día que haga falta.
 *
 * El `moneda` viaja porque el tipo lo pide; en el CRM **no se enseña ni decide
 * nada** —aquí no se suma dinero— y por eso el selector se pinta con
 * `conMoneda={false}`.
 */
export type CuentaDelCrm = CuentaDeFinanzas;

export { comoListaDeCuentas };

/**
 * Las cuentas que de verdad se van a consultar.
 *
 * **Lo que llega del navegador no decide a qué se llega.** La lista viaja en la
 * URL (`?cuentas=a,b,c`) y en los parámetros de cada acción, así que se filtra
 * contra las que esa persona alcanza; lo que no esté se descarta en silencio,
 * que es lo correcto —un id que no alcanza no es un error que enseñar, es un id
 * que no existe para ella—.
 *
 * Y **sin selección valen TODAS las alcanzables**, que es la diferencia entera
 * con Finanzas. Para una cuenta hija, para un agente y para una cuenta sin
 * vinculadas, `alcanzables` es `[propia]`, así que esto devuelve exactamente lo
 * que la pantalla enseñaba antes de que existiera el filtro.
 */
export function laSeleccionDelCrm(
    pedidas: readonly string[] | null | undefined,
    alcanzables: readonly string[],
): string[] {
    const permitidas = alcanzables
        .map((c) => String(c ?? "").trim())
        .filter(Boolean);
    const juego = new Set(permitidas);

    const vistas = new Set<string>();
    const buenas: string[] = [];

    for (const cruda of pedidas ?? []) {
        const id = String(cruda ?? "").trim();
        if (!id || vistas.has(id) || !juego.has(id)) continue;
        vistas.add(id);
        buenas.push(id);
    }

    // Sin nada que valga, todas. Nunca una lista vacía: una consulta con
    // `IN ()` devuelve cero filas y la pantalla saldría en blanco sin decir por
    // qué — y el caso más común de llegar aquí no es un ataque, es un
    // `?cuentas=` rancio de un enlace guardado.
    return buenas.length > 0 ? buenas : permitidas;
}

/**
 * ¿Se enseña el filtro por cuenta?
 *
 * Es **la misma función que decide el de Finanzas** (`seEnsenaElSelector`), y no
 * una condición nueva: manda en su cuenta —un `agente` participa, no
 * administra—, es la cuenta MADRE de su familia, y la familia tiene más de una
 * cuenta.
 *
 * La segunda condición es la que cumple el encargo por su lado más delicado:
 * **los vínculos van solo de madre a hija.** Una cuenta hija no es la raíz, así
 * que no consolida nada y sigue viendo únicamente lo suyo — ni lo de su madre
 * ni lo de sus hermanas. No hace falta ninguna comprobación aparte para eso: se
 * cae de que solo la raíz alcanza a la familia.
 */
export function seEnsenaElFiltroDelCrm(args: {
    mandaEnSuCuenta: boolean;
    esLaMadre: boolean;
    cuantasCuentas: number;
}): boolean {
    return seEnsenaElSelector(args);
}

/**
 * ¿Se está mirando más de una cuenta a la vez?
 *
 * De aquí cuelga todo lo que cambia en una lista del CRM: la columna «Cuenta»,
 * que una fila ajena no se pueda editar, y el rótulo del filtro. Con una sola
 * cuenta elegida —el caso de siempre, y el único que ve una cuenta hija— las
 * pantallas tienen que verse **exactamente** como antes de que esto existiera.
 */
export function elCrmVaUnificado(elegidas: readonly string[]): boolean {
    return elegidas.length > 1;
}

/** El nombre de cada cuenta, para pintarlo en la fila. */
export function nombresDeLasCuentas(
    cuentas: readonly CuentaDelCrm[],
): Record<string, string> {
    const nombres: Record<string, string> = {};
    for (const c of cuentas) nombres[c.id] = c.nombre;
    return nombres;
}

/**
 * Una fila de otra cuenta se VE y no se toca.
 *
 * Las acciones de escritura del CRM acotan por la cuenta con la que se llaman
 * —`updateRegistroEstado` resuelve el dueño del registro y pasa por
 * `assertUserCanUseApp`—, así que sobre una fila de una cuenta hermana un lápiz
 * contestaría «no autorizado»: «menú abierto, puerta cerrada», que es lo que
 * este repositorio ya pagó en Clientes, en Equipo y en el panel.
 *
 * Es la misma regla que Finanzas escribió en `esDeOtraCuenta`, y **sin dueño no
 * es ajena**: se pintaría un candado sobre una fila perfectamente editable.
 */
export function esDeOtraCuentaDelCrm(
    duenoDeLaFila: string | null | undefined,
    propia: string,
): boolean {
    const dueno = String(duenoDeLaFila ?? "").trim();
    return Boolean(dueno) && dueno !== propia;
}

/**
 * Cuántas filas trae una lista, que **crece con las cuentas elegidas**.
 *
 * Es la misma trampa que Finanzas ya midió: dejando el tope de una sola cuenta
 * al unificar cinco, las cinco se reparten las mismas filas —van ordenadas por
 * fecha, así que se intercalan— y **cada una enseña menos de lo que enseña
 * sola**. Unificar se vería como perder filas.
 *
 * Con techo, porque esta lista viaja entera al navegador.
 */
export function elTopeDelCrm(porCuenta: number, cuantasCuentas: number): number {
    const base = Math.max(1, Math.floor(porCuenta));
    const cuentas = Math.max(1, Math.floor(cuantasCuentas));
    return Math.min(base * cuentas, base * TECHO_DE_CUENTAS_EN_UN_TOPE);
}

/**
 * El techo del multiplicador. No es «cuántas cuentas caben en la familia» —eso
 * lo acota `TOPE_DE_LA_FAMILIA`— sino cuánto se deja crecer una lista que viaja
 * entera al navegador. Con la familia mayor de la plataforma (5) no recorta
 * nada.
 */
export const TECHO_DE_CUENTAS_EN_UN_TOPE = 5;
