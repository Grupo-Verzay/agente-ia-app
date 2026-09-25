/**
 * Cuántas veces puede dispararse un flujo en una misma conversación, y cuánto
 * tiene que pasar entre una vez y la siguiente.
 *
 * Lo normal —y lo que tienen todos los flujos que nadie ha tocado— es UNA vez y
 * sin espera: el mismo comportamiento de siempre. El dueño lo abre a propósito
 * en los flujos que lo necesitan (medios de pago, ubicación).
 *
 * Quien lo APLICA es el backend (`api-webhook`, `repeticiones-de-flujo.ts` y
 * `ChatHistoryService.reservarEjecucion`), que lleva su copia de este saneado
 * con LOS MISMOS topes. Si se cambia uno, se cambia el otro.
 *
 * Puro a propósito: lo prueba `lib/__tests__/repeticiones-de-flujo.test.mjs`.
 */

export type RepeticionesDeFlujo = {
    /** Cuántas veces puede dispararse en una conversación. Nunca menos de 1. */
    maxEjecuciones: number;
    /** Minutos mínimos desde la última vez. `null` = sin espera. */
    esperaMinutos: number | null;
};

export const REPETICIONES_POR_DEFECTO: RepeticionesDeFlujo = {
    maxEjecuciones: 1,
    esperaMinutos: null,
};

export const TOPE_DE_EJECUCIONES = 100;
/** 365 días, el mismo techo del selector de tiempo de la plataforma. */
export const TOPE_DE_ESPERA_MINUTOS = 365 * 24 * 60;

export type UnidadDeEspera = "minutes" | "hours" | "days";

export const MINUTOS_POR_UNIDAD: Record<UnidadDeEspera, number> = {
    minutes: 1,
    hours: 60,
    days: 24 * 60,
};

function entero(v: unknown): number | null {
    // `Number(null)` es 0 y `Number("")` también: «no hay valor» y «vale cero»
    // se separan a mano antes de convertir.
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

/**
 * Lo que llega del navegador o de la base pasa por aquí. Lo que no se entiende
 * cae en lo de siempre (1 vez, sin espera): equivocarse hacia «más veces» es un
 * flujo que se repite sin que nadie lo haya pedido.
 */
export function comoRepeticiones(raw: unknown): RepeticionesDeFlujo {
    if (!raw || typeof raw !== "object") return { ...REPETICIONES_POR_DEFECTO };
    const r = raw as Record<string, unknown>;

    const max = entero(r.maxEjecuciones);
    const maxEjecuciones = max === null || max < 1 ? 1 : Math.min(max, TOPE_DE_EJECUCIONES);

    const espera = entero(r.esperaMinutos);
    const esperaMinutos =
        espera === null || espera <= 0 ? null : Math.min(espera, TOPE_DE_ESPERA_MINUTOS);

    return { maxEjecuciones, esperaMinutos };
}

/** ¿Es lo de siempre? Entonces no hace falta guardar ni enseñar nada. */
export function esLoDeSiempre(r: RepeticionesDeFlujo): boolean {
    return r.maxEjecuciones === 1 && r.esperaMinutos === null;
}

/**
 * Lo tecleado (un número y una unidad) a minutos. Vacío es `null` —sin
 * espera—, que es el valor por defecto; un cero también, porque esperar cero
 * minutos es no esperar.
 */
export function esperaEnMinutos(valor: string, unidad: UnidadDeEspera): number | null {
    const n = entero(valor.trim());
    if (n === null || n <= 0) return null;
    return Math.min(n * MINUTOS_POR_UNIDAD[unidad], TOPE_DE_ESPERA_MINUTOS);
}

/**
 * Minutos guardados a lo que se enseña: la unidad más grande en la que el
 * número sale entero. Al revés, 1.440 minutos se leerían «1440 minutos» en vez
 * de «1 día».
 */
export function esperaParaElFormulario(minutos: number | null): { valor: string; unidad: UnidadDeEspera } {
    if (!minutos || minutos <= 0) return { valor: "", unidad: "minutes" };
    if (minutos % MINUTOS_POR_UNIDAD.days === 0) return { valor: String(minutos / MINUTOS_POR_UNIDAD.days), unidad: "days" };
    if (minutos % MINUTOS_POR_UNIDAD.hours === 0) return { valor: String(minutos / MINUTOS_POR_UNIDAD.hours), unidad: "hours" };
    return { valor: String(minutos), unidad: "minutes" };
}

/** Resumen corto para la tarjeta del flujo: «Hasta 3 veces · cada 2 h». */
export function resumenDeRepeticiones(r: RepeticionesDeFlujo): string | null {
    if (esLoDeSiempre(r)) return null;
    const veces = r.maxEjecuciones === 1 ? "1 vez" : `Hasta ${r.maxEjecuciones} veces`;
    if (!r.esperaMinutos) return veces;
    const { valor, unidad } = esperaParaElFormulario(r.esperaMinutos);
    const sufijo = unidad === "days" ? "d" : unidad === "hours" ? "h" : "min";
    return `${veces} · cada ${valor} ${sufijo}`;
}
