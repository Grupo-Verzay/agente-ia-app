/**
 * El `cache()` de React, para un banco que corre fuera de una petición de Next.
 *
 * Lo usan `cuenta-que-manda` y `gestion-de-clientes` para no resolver dos veces
 * lo mismo dentro de una misma petición. Fuera de una, React no lo ofrece y el
 * paquete revienta al cargarse (`cache is not a function`). Aquí devuelve la
 * función tal cual: **no memoriza**, así que el banco pregunta de más y nunca
 * de menos — que es el lado seguro cuando lo que se comprueba son permisos.
 */
export function cache<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn;
}
