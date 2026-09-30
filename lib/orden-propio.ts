/**
 * El orden PROPIO de una lista: el que cada persona pone arrastrando y solo ve
 * ella.
 *
 * Regla de la plataforma: donde haya una lista o unas tarjetas que se puedan
 * reordenar, se reordenan **arrastrando y soltando**, como en Módulos. Aquí va
 * la parte de Documentación, que son tres listas:
 *
 * | tipo | qué ordena | quién la ve |
 * | --- | --- | --- |
 * | `doc-portada` | las cuatro tarjetas de la portada | todo el que abre Documentación |
 * | `guias-publicadas` | las guías públicas que deja la IA (`/guia/<modulo>`) | la casa |
 * | `tutoriales` | las tarjetas de tutoriales | todo el que abre Tutoriales |
 *
 * **Es de la PERSONA, no de la cuenta**: cada quien coloca su pantalla y no se
 * la mueve a nadie. Vive en `orden_en_tablero` con `tableroId` = la persona,
 * como la lista de directos del chat de equipo —un mecanismo para todos los
 * órdenes, no uno por pantalla—.
 *
 * Puro a propósito: lo que decide —qué ids valen y cómo se lee lo guardado— se
 * prueba sin levantar nada. La colocación y el arrastre son los de Proyectos y
 * Diagramas (`lib/orden-de-las-tarjetas.ts`), no una copia.
 */
import type { OrdenGuardado } from "@/lib/orden-de-las-tarjetas";

export const TIPOS_DE_ORDEN_PROPIO = ["doc-portada", "guias-publicadas", "tutoriales"] as const;
export type TipoDeOrdenPropio = (typeof TIPOS_DE_ORDEN_PROPIO)[number];

/**
 * Las tarjetas de la portada de Documentación, por su id estable. El id NO es
 * el título: el título se puede reescribir y el orden guardado no puede
 * perderse por eso.
 */
export const TARJETAS_DE_LA_PORTADA = ["actualizaciones", "tutoriales", "guias", "meta"] as const;

/** Cuántos ids se guardan de una vez. Ninguna de estas listas tiene más. */
export const TOPE_DEL_ORDEN_PROPIO = 500;

/** Lo que llega de fuera pasa por la lista: un tipo inventado no escribe nada. */
export function comoTipoDeOrdenPropio(valor: unknown): TipoDeOrdenPropio | null {
    const texto = String(valor ?? "").trim();
    return (TIPOS_DE_ORDEN_PROPIO as readonly string[]).includes(texto) ? (texto as TipoDeOrdenPropio) : null;
}

/**
 * Lo guardado, leído con cuidado: un arreglo, un nulo o una posición que no es
 * un número no son un orden. Lo que no se entiende cae en «nada colocado», que
 * es la lista tal cual llega —se ve de más, nunca de menos—.
 */
export function comoOrdenGuardado(valor: unknown): OrdenGuardado {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
    const orden: OrdenGuardado = {};
    for (const [id, posicion] of Object.entries(valor as Record<string, unknown>)) {
        if (typeof posicion === "number" && Number.isFinite(posicion)) orden[id] = posicion;
    }
    return orden;
}

/**
 * La lista que llega del navegador, sin repetidos y solo con lo que de verdad
 * está en esa pantalla. Un id inventado no abre nada —esto solo guarda
 * posiciones— pero llenaría la tabla de filas que nadie sabría de dónde salen.
 */
export function losIdsQueValen(ids: unknown, permitidos: Iterable<string>): string[] {
    if (!Array.isArray(ids)) return [];
    const validos = new Set(permitidos);
    const vistos = new Set<string>();
    const salida: string[] = [];
    for (const crudo of ids) {
        if (typeof crudo !== "string") continue;
        const id = crudo.trim();
        if (!id || vistos.has(id) || !validos.has(id)) continue;
        vistos.add(id);
        salida.push(id);
        if (salida.length >= TOPE_DEL_ORDEN_PROPIO) break;
    }
    return salida;
}
