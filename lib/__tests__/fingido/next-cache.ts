/**
 * `revalidatePath` necesita el almacén de una petición de Next, que en un banco
 * no existe. Es lo ÚNICO que se finge en el banco del enlace público: no decide
 * nada, solo le dice al enrutador que vuelva a pintar una ruta.
 */
export function revalidatePath(_ruta: string) {}
export function revalidateTag(_etiqueta: string) {}
/** Tampoco decide nada: le dice a Next que no guarde en caché la respuesta. */
export function unstable_noStore() {}
/** Sin petición de Next no hay caché que guardar: devuelve la función tal cual. */
export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn;
}
