/**
 * El reparto POR PORCENTAJE de la auto-asignación.
 *
 * Copiado byte a byte en los dos repositorios: `lib/reparto-por-porcentaje.ts`
 * en la App (que lo usa al guardar y en «Asignar sin atender») y
 * `src/modules/webhook/services/auto-assign/reparto-por-porcentaje.ts` en el
 * backend (que reparte los chats que ENTRAN). Si dijeran cosas distintas, el
 * mismo chat caería en un asesor desde un lado y en otro desde el otro. Los dos
 * bancos comparan los ficheros. Si se toca uno, se copia al otro.
 *
 * La regla, y es una frase: **cada chat nuevo va al asesor que esté más lejos
 * de su proporción ideal ACUMULADA desde que se activó el modo.** Ni lotería al
 * azar —con suerte mala un asesor se queda semanas por debajo— ni bloques
 * cerrados de 10 o de 100 —dentro del bloque se amontonan y al cerrarlo se
 * reinicia el reparto—. Un contador por asesor (`asignados`) que no se reinicia
 * nunca mientras el modo siga activo, y en cada chat se elige al que más le
 * falta. Así la desviación de cada asesor no pasa nunca de un chat y a la larga
 * la distribución es exactamente la configurada.
 *
 * Un asesor NO disponible se salta, y su contador se queda como está: cuando
 * vuelve, sigue desde donde lo dejó. Mientras falta, los disponibles se reparten
 * entre ellos en la proporción de sus porcentajes.
 *
 * Puro y sin importar nada: lo compilan los dos bancos tal cual.
 */

export type AsesorDelReparto = {
    id: string;
    /** Entero de 0 a 100. Con 0 no recibe nada. */
    porcentaje: number;
    /** Chats que ha recibido por este modo desde que se activó. */
    asignados: number;
    disponible: boolean;
};

/**
 * Los tres modos de la auto-asignación, excluyentes: la cuenta usa uno a la
 * vez. `maximo` y `ilimitado` son los de siempre (`auto_assign_max_chats`, con
 * 0 = ilimitado); `porcentaje` es este reparto.
 */
export const MODOS_DE_REPARTO = ["maximo", "ilimitado", "porcentaje"] as const;
export type ModoDeReparto = (typeof MODOS_DE_REPARTO)[number];

/** Lo que llega de fuera como modo. Lo que no se reconoce es `maximo`, el de siempre. */
export function comoModoDeReparto(valor: unknown): ModoDeReparto {
    return (MODOS_DE_REPARTO as readonly unknown[]).includes(valor) ? (valor as ModoDeReparto) : "maximo";
}

/** La suma que tienen que dar los porcentajes de los disponibles. */
export const TOTAL_DEL_REPARTO = 100;

/** Lo que llega de fuera como porcentaje: un entero de 0 a 100, o 0. */
export function comoPorcentaje(valor: unknown): number {
    const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(TOTAL_DEL_REPARTO, Math.round(n)));
}

/** Un contador que llega de la base: entero no negativo. */
function comoContador(valor: unknown): number {
    const n = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** La suma de los porcentajes de los asesores DISPONIBLES. */
export function sumaDeLosDisponibles(asesores: readonly AsesorDelReparto[]): number {
    return asesores
        .filter((a) => a.disponible)
        .reduce((total, a) => total + comoPorcentaje(a.porcentaje), 0);
}

/**
 * Si el reparto se puede guardar. Solo cuentan los DISPONIBLES: un asesor que
 * hoy no está puede conservar su porcentaje para cuando vuelva.
 */
export function porQueNoSePuedeGuardar(asesores: readonly AsesorDelReparto[]): string | null {
    if (!asesores.some((a) => a.disponible)) {
        return "No hay ningún asesor disponible para repartir los chats.";
    }
    const suma = sumaDeLosDisponibles(asesores);
    if (suma !== TOTAL_DEL_REPARTO) {
        return `La suma de los asesores disponibles es ${suma}% y tiene que ser ${TOTAL_DEL_REPARTO}%.`;
    }
    return null;
}

/**
 * El reparto de partida al activar el modo: los disponibles a partes iguales,
 * y los céntimos que sobran para los primeros. Suma exactamente 100.
 */
export function repartoAPartesIguales(ids: readonly string[]): Record<string, number> {
    const salida: Record<string, number> = {};
    if (ids.length === 0) return salida;
    const base = Math.floor(TOTAL_DEL_REPARTO / ids.length);
    let resto = TOTAL_DEL_REPARTO - base * ids.length;
    for (const id of ids) {
        salida[id] = base + (resto > 0 ? 1 : 0);
        if (resto > 0) resto--;
    }
    return salida;
}

/**
 * A quién le toca el siguiente chat. `null` = nadie disponible con porcentaje.
 *
 * Entre los candidatos (disponibles y con porcentaje), con `S` la suma de sus
 * porcentajes y `N` la suma de sus contadores, a cada uno le falta
 * `porcentaje / S · (N + 1) − asignados` para estar en su proporción ideal
 * contando el chat que entra. Se elige al que más le falta. La comparación va
 * multiplicada por `S` para quedarse en enteros: con decimales, dos empates de
 * verdad podrían romperse por un redondeo distinto en cada lado.
 *
 * Desempate: el de mayor porcentaje y, después, el id menor. Determinista, para
 * que la App y el backend elijan lo mismo con los mismos datos.
 */
export function elegirPorPorcentaje(asesores: readonly AsesorDelReparto[]): string | null {
    const candidatos = asesores
        .filter((a) => a.disponible && comoPorcentaje(a.porcentaje) > 0)
        .map((a) => ({ id: a.id, p: comoPorcentaje(a.porcentaje), c: comoContador(a.asignados) }));
    if (candidatos.length === 0) return null;

    const S = candidatos.reduce((t, a) => t + a.p, 0);
    const N = candidatos.reduce((t, a) => t + a.c, 0);

    let mejor = candidatos[0];
    let mejorFalta = mejor.p * (N + 1) - mejor.c * S;
    for (const a of candidatos.slice(1)) {
        const falta = a.p * (N + 1) - a.c * S;
        if (
            falta > mejorFalta ||
            (falta === mejorFalta && (a.p > mejor.p || (a.p === mejor.p && a.id < mejor.id)))
        ) {
            mejor = a;
            mejorFalta = falta;
        }
    }
    return mejor.id;
}
