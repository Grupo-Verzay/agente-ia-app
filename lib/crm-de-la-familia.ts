/**
 * El CRM de una familia de cuentas: cada cuenta ve lo suyo y lo de las que
 * cuelgan de ella HACIA ABAJO, unificado, y puede reducirlo a las que elija.
 * Nunca lo de su madre ni lo de sus hermanas (`lasCuentasQueCuelganDe`).
 *
 * # Por qué esto no es «Finanzas de la familia» con otro nombre
 *
 * El mecanismo es el mismo y se reutiliza entero —`laFamiliaDeLaCuenta` para
 * saber quiénes son y `comoListaDeCuentas` para leer el parámetro de la URL—,
 * y eso es a propósito:
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

/**
 * Las cuentas que CUELGAN de esta, hacia abajo, empezando por ella misma.
 *
 * # Por qué el alcance no puede ser «la familia»
 *
 * La familia (`laFamiliaDeLaCuenta`) es el componente de `linked_accounts`
 * **sin dirección**: sirve para que un chat del equipo no se parta, pero NO es
 * un alcance. Antes se decía «la raíz ve el componente entero y las demás solo
 * lo suyo», y la raíz sale de un recuento de votos (`laRaizQueManda`). Con eso,
 * **quien ve de más lo decide un número**: una cuenta intermedia que vincule a
 * tantas como su madre —o a su propia madre de vuelta, que en esta tabla es lo
 * normal— gana el recuento y pasa a ver lo de su madre y lo de sus hermanas.
 * Es exactamente la fuga del administrador de Verzay | Atencion viendo las
 * llamadas de Carlos Arcos.
 *
 * # La regla
 *
 * > **Se ve lo que se alcanza bajando por los enlaces (`de` → `a`) sin pasar
 * > nunca por una cuenta que también alcanza a esta.** Lo primero es «mis
 * > hijas y las hijas de mis hijas»; lo segundo quita a quien está por ENCIMA
 * > —aunque haya un enlace de vuelta— y a todo lo que solo se alcanza a
 * > través de ella, que son las hermanas.
 *
 * Una pareja recíproca (`A → B` y `B → A`) se anula por los dos lados: ninguna
 * ve a la otra. Es el lado seguro a propósito —un enlace de ida y vuelta no
 * dice quién es la madre, y adivinarlo es lo que abrió la fuga—. Si hace falta
 * que una vea a la otra, se borra el enlace que sobra y queda dicho el sentido.
 *
 * Pura: entra el id y los enlaces, sale la lista. La propia va **siempre
 * primera**, aunque no aparezca en ningún enlace.
 */
export function lasCuentasQueCuelganDe(
    desde: string,
    enlaces: readonly { de: string; a: string }[],
): string[] {
    const propia = String(desde ?? "").trim();
    if (!propia) return [];
    const { hijas, madres } = losGrafos(enlaces);

    // Primero quién está por ENCIMA. Y al bajar no se PASA por ninguna de
    // ellas: con un enlace de vuelta (hija → madre), bajar atravesando a la
    // madre llevaría a las hermanas — la otra mitad de la fuga.
    const arriba = recorrer(propia, madres, new Set());
    const abajo = recorrer(propia, hijas, arriba);

    return [propia, ...Array.from(abajo).sort()];
}

/**
 * Las cuentas que están POR ENCIMA de `desde`: las que la alcanzan bajando.
 *
 * Es la otra mitad de `lasCuentasQueCuelganDe`, sacada para que la usen las
 * puertas que no son del CRM —«Ingresar», el conmutador y
 * `assertCanAccessTargetUser`—. Con dos cálculos de «quién está encima», el día
 * que se afine uno el otro deja pasar hacia arriba sin decir nada.
 *
 * No incluye a la propia. En una pareja recíproca (`A ↔ B`) cada una está por
 * encima de la otra, que es el lado seguro: ninguna manda sobre la otra.
 */
export function lasCuentasPorEncimaDe(
    desde: string,
    enlaces: readonly { de: string; a: string }[],
): string[] {
    const propia = String(desde ?? "").trim();
    if (!propia) return [];
    const { madres } = losGrafos(enlaces);
    return Array.from(recorrer(propia, madres, new Set())).sort();
}

function losGrafos(enlaces: readonly { de: string; a: string }[]) {
    const hijas = new Map<string, string[]>();
    const madres = new Map<string, string[]>();
    for (const e of enlaces ?? []) {
        const de = String(e?.de ?? "").trim();
        const a = String(e?.a ?? "").trim();
        if (!de || !a || de === a) continue;
        (hijas.get(de) ?? hijas.set(de, []).get(de)!).push(a);
        (madres.get(a) ?? madres.set(a, []).get(a)!).push(de);
    }
    return { hijas, madres };
}

function recorrer(
    propia: string,
    grafo: Map<string, string[]>,
    vetadas: Set<string>,
): Set<string> {
    const vistos = new Set<string>();
    const cola = [propia];
    while (cola.length > 0) {
        const actual = cola.shift()!;
        for (const siguiente of grafo.get(actual) ?? []) {
            if (siguiente === propia || vistos.has(siguiente)) continue;
            if (vetadas.has(siguiente)) continue;
            vistos.add(siguiente);
            cola.push(siguiente);
        }
    }
    return vistos;
}
