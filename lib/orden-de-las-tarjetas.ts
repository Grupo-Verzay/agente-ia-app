/**
 * El orden en que se pintan las tarjetas de Proyectos y de Diagramas.
 *
 * Puro a propósito: entra una lista y un mapa de posiciones, y sale la lista
 * colocada. Así se puede probar entero sin levantar nada, que es lo que hace
 * falta para las dos trampas que tiene esto —la de los recién llegados y la de
 * arrastrar con un filtro puesto— y que no se ven mirando la pantalla.
 *
 * ## Por qué el orden NO vive dentro de la cosa
 *
 * Ni una columna `orden` en `Project` ni en `flows`, igual que las carpetas. Y
 * el motivo de fondo **no es** el de siempre —que `Project` sea del backend, que
 * también—: es que **una cosa compartida tiene UNA fila y DOS sitios**. Un
 * proyecto compartido con la cuenta de un cliente sale en las dos pantallas, y
 * cada cuenta lo coloca donde quiera; una columna en la fila solo puede guardar
 * una posición, así que mover el proyecto en una cuenta se lo movería a la otra.
 *
 * Eso vale igual para Diagramas, y por eso las dos pantallas usan esto mismo:
 * `flows` sí es tabla nuestra y admitiría la columna, pero `flow_shares` tiene
 * el mismo problema. La posición es de la pareja **cuenta + cosa**, no de la
 * cosa.
 */

import type { TipoDeCarpeta } from "@/lib/carpetas";

/**
 * Qué pantalla ordena. Es el mismo discriminador que el de las carpetas y se
 * importa de allí a propósito: dos listas iguales en dos ficheros es una que se
 * toca y otra que se queda atrás.
 */
export type TipoDeTarjeta = TipoDeCarpeta;

/** id de la cosa → su posición. Lo que no esté aquí no se ha colocado nunca. */
export type OrdenGuardado = Record<string, number>;

/** Tope de tarjetas que se guardan de una vez. Una pantalla no tiene más. */
export const TOPE_DE_TARJETAS_ORDENADAS = 2000;

/**
 * La lista colocada.
 *
 * **Lo que no tiene posición va PRIMERO, en el orden en que venía.** Es la
 * decisión que se nota y tiene dos motivos:
 *
 * 1. Mientras nadie arrastre nada, el mapa está vacío y esto devuelve la lista
 *    **tal cual llegó**. O sea que encender esto no cambia ni una pantalla hasta
 *    que alguien mueva la primera tarjeta; el orden de siempre —lo último
 *    editado arriba— sigue mandando.
 * 2. Un proyecto creado hoy no puede caer al fondo de cuarenta tarjetas
 *    colocadas hace un mes. Crear algo y no verlo se lee como que no se creó.
 *
 * Y como arrastrar guarda la posición de **todas** las tarjetas de la lista, el
 * grupo de «sin colocar» solo lo forman las que nacieron después del último
 * arrastre. No es un cajón que crezca.
 */
export function ordenarTarjetas<T>(
    items: T[],
    orden: OrdenGuardado,
    idDe: (item: T) => string,
): T[] {
    const sinColocar: T[] = [];
    const colocadas: { item: T; posicion: number }[] = [];

    for (const item of items) {
        const posicion = orden[idDe(item)];
        if (typeof posicion === "number" && Number.isFinite(posicion)) {
            colocadas.push({ item, posicion });
        } else {
            sinColocar.push(item);
        }
    }

    // `sort` no promete ser estable entre motores para claves iguales, así que
    // dos tarjetas con la misma posición —no debería pasar, pero una fila a mano
    // lo haría— se desempatan por el orden en que venían, y no al azar.
    colocadas.sort((a, b) => a.posicion - b.posicion);

    return [...sinColocar, ...colocadas.map((c) => c.item)];
}

/**
 * Dónde queda la lista COMPLETA después de arrastrar una tarjeta sobre otra.
 *
 * Es la otra trampa, y no se ve probando sin filtros: la rejilla puede estar
 * filtrada —por texto, por estado, por carpeta— así que lo que se arrastra son
 * las **visibles** y lo que hay que guardar son **todas**. Calculando las
 * posiciones sobre lo visible se escribiría `0..n` para tres tarjetas y las
 * demás perderían su sitio sin que nadie lo notara hasta quitar el filtro.
 *
 * Por eso se mueve sobre la lista entera, usando el sitio que ocupa en ella la
 * tarjeta sobre la que se soltó. Lo escondido conserva su posición relativa.
 */
export function moverEnLaListaCompleta(
    idsCompletos: string[],
    arrastrada: string,
    soltadaSobre: string,
): string[] {
    if (arrastrada === soltadaSobre) return idsCompletos;

    const desde = idsCompletos.indexOf(arrastrada);
    const hasta = idsCompletos.indexOf(soltadaSobre);
    // Si alguna no está en la lista, no hay movimiento que calcular. Devolverla
    // igual es lo correcto: mejor que no pase nada a colocarla en un sitio
    // inventado.
    if (desde < 0 || hasta < 0) return idsCompletos;

    const copia = [...idsCompletos];
    copia.splice(desde, 1);
    copia.splice(hasta, 0, arrastrada);
    return copia;
}

/** La lista de ids convertida en el mapa que se pinta, sin esperar al servidor. */
export function ordenDeLaLista(ids: string[]): OrdenGuardado {
    const orden: OrdenGuardado = {};
    ids.forEach((id, indice) => {
        orden[id] = indice;
    });
    return orden;
}
