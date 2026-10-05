/**
 * Cuántas videollamadas a la vez puede tener un especialista de Multiagenda en
 * el MISMO turno. Solo vale en el modo «Videollamada con IA de Verzay»: cada
 * cita tiene su propio enlace y su propia sesión de Tavus, así que no se pisan.
 * Con el enlace fijo de siempre una sala es una persona: el tope es 1.
 *
 * Puro: lo usan la pantalla de ajustes, las acciones que reservan y reagendan,
 * y el cálculo de huecos. Con la regla escrita en cada sitio, uno ofrecería un
 * hueco que el otro rechaza.
 */

export const CAPACIDAD_MINIMA = 1;
export const CAPACIDAD_MAXIMA = 5;
/** Lo que se ofrece en la pantalla: de 1 (una a la vez) a 5. */
export const CAPACIDADES = [1, 2, 3, 4, 5] as const;

/** Lo que no se entiende es 1: una a la vez, como siempre. */
export function comoCapacidad(valor: unknown): number {
    const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
    if (!Number.isFinite(n)) return CAPACIDAD_MINIMA;
    const entero = Math.floor(n);
    if (entero < CAPACIDAD_MINIMA) return CAPACIDAD_MINIMA;
    if (entero > CAPACIDAD_MAXIMA) return CAPACIDAD_MAXIMA;
    return entero;
}

/** La que de verdad cuenta: con el enlace fijo, siempre 1. */
export function laCapacidadQueVale(capacidad: unknown, modo: "enlace" | "tavus" | string | null | undefined): number {
    return modo === "tavus" ? comoCapacidad(capacidad) : CAPACIDAD_MINIMA;
}

type Franja = { startTime: Date | string; endTime: Date | string };

const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/**
 * El mayor número de citas que coinciden a la vez dentro de [inicio, fin).
 * Barrido por eventos: dos citas que solo se tocan en un borde no coinciden.
 */
export function elMaximoSimultaneo(citas: Franja[], inicio: Date, fin: Date): number {
    const a = inicio.getTime();
    const b = fin.getTime();
    const eventos: Array<[number, number]> = [];
    for (const c of citas) {
        const s = Math.max(ms(c.startTime), a);
        const e = Math.min(ms(c.endTime), b);
        if (!(s < e)) continue;
        eventos.push([s, 1], [e, -1]);
    }
    // A igual instante, primero las salidas: lo que acaba a las 10 no choca con lo que empieza a las 10.
    eventos.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let actual = 0;
    let maximo = 0;
    for (const [, d] of eventos) {
        actual += d;
        if (actual > maximo) maximo = actual;
    }
    return maximo;
}

/** ¿Cabe una cita más en [inicio, fin) con esta capacidad? */
export function hayHueco(citas: Franja[], inicio: Date, fin: Date, capacidad: number): boolean {
    return elMaximoSimultaneo(citas, inicio, fin) < comoCapacidad(capacidad);
}

/** El aviso cuando no cabe. */
export function elAvisoSinHueco(capacidad: number): string {
    return comoCapacidad(capacidad) > 1
        ? `El especialista ya tiene ${comoCapacidad(capacidad)} citas en ese horario.`
        : "El especialista ya tiene una cita en ese horario.";
}
