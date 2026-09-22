/**
 * Qué pestañas de la conversación caben en su fila y cuáles se pliegan en el
 * menú «Más».
 *
 * # La regla
 *
 * La fila de abajo de la cabecera lleva las pestañas (Mensajes, Notas y una por
 * integración: Sheets, Copiloto, Web…) y, pegados a la derecha, **Macros y
 * Acciones**. Era una sola caja con `overflow-x-auto`, así que cuando faltaba
 * ancho —la ficha de contacto abierta, un panel lateral, una ventana
 * estrecha— lo que se iba por la derecha, detrás de un desplazamiento sin
 * barra, eran justo Macros y Acciones: los dos mandos que se usan en cada
 * conversación, y Acciones es donde está Resolver.
 *
 * > **Lo que cede es la lista de pestañas, nunca Macros ni Acciones.** Esos dos
 * > van `shrink-0` en su propia caja; las pestañas viven en un hueco `flex-1
 * > min-w-0` que se MIDE, y lo que no cabe entra en un desplegable.
 *
 * # Tres cosas que hay que mantener
 *
 * 1. **La activa se ve siempre.** Si la pestaña abierta cae en la parte que no
 *    cabe, ocupa el sitio de la última que sí cabía: plegada, nadie sabría qué
 *    se está mirando.
 * 2. **El menú solo existe si hace falta.** Con todas dentro no se reserva su
 *    hueco: un «Más» que abre una lista vacía es un botón que no hace nada.
 * 3. **Sin medidas no se decide** (`disponible` o algún ancho no finito): se
 *    devuelven todas, que es lo que había. Un reparto calculado con ceros
 *    plegaría todas las pestañas en el primer pintado.
 *
 * Es pura: entra lo medido y sale el reparto. La mide `PestanasDelChat`.
 */

export type RepartoDePestanas<T extends string> = {
    visibles: T[];
    enMenu: T[];
};

export function repartirLasPestanas<T extends string>(
    ids: readonly T[],
    anchos: readonly number[],
    activa: T | null | undefined,
    disponible: number,
    anchoDelMenu: number,
): RepartoDePestanas<T> {
    const todas = { visibles: [...ids], enMenu: [] as T[] };
    if (ids.length === 0) return todas;
    if (!Number.isFinite(disponible) || disponible <= 0) return todas;
    if (anchos.length !== ids.length || anchos.some((a) => !Number.isFinite(a) || a < 0)) return todas;

    const total = anchos.reduce((s, a) => s + a, 0);
    if (total <= disponible) return todas;

    // No caben todas: se reserva el «Más» y entran las que quepan por orden.
    const sitio = disponible - Math.max(0, anchoDelMenu);
    const visibles: number[] = [];
    let usado = 0;
    for (let i = 0; i < ids.length; i++) {
        if (usado + anchos[i] > sitio) break;
        visibles.push(i);
        usado += anchos[i];
    }

    // La activa, si quedó fuera, entra quitando las últimas que hagan falta.
    const iActiva = activa == null ? -1 : ids.indexOf(activa);
    if (iActiva >= 0 && !visibles.includes(iActiva)) {
        while (visibles.length > 0 && usado + anchos[iActiva] > sitio) {
            usado -= anchos[visibles.pop()!];
        }
        visibles.push(iActiva);
        visibles.sort((a, b) => a - b);
    }

    const dentro = new Set(visibles);
    return {
        visibles: visibles.map((i) => ids[i]),
        enMenu: ids.filter((_, i) => !dentro.has(i)),
    };
}
