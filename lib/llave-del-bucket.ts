/**
 * De la dirección pública de un archivo a su llave dentro del bucket.
 *
 * Es lo único que decide **qué se deja borrar**, así que vive aparte y es puro:
 * una ruta que borra lo que le digan es una ruta para vaciarle el bucket a
 * otro, y eso tiene que poder comprobarse sin levantar nada.
 *
 * Devuelve `null` —no se borra nada— salvo que se cumplan las tres a la vez:
 *
 * 1. Empieza por el prefijo público de NUESTRO bucket. Otro dominio u otro
 *    bucket no se miran siquiera.
 * 2. La llave tiene **exactamente** la forma que escribe `/api/upload`:
 *    `userID/workflowID/fichero`, tres trozos. Sin esto, una llave más
 *    profunda o con `..` podría salirse de la carpeta.
 * 3. Ningún trozo está vacío ni es `.` o `..`.
 *
 * Quien la use tiene que comprobar **además** que ese `userID` es una cuenta
 * sobre la que manda: eso no se puede decidir aquí, hace falta la sesión.
 */
export function llaveDelArchivoSubido(
    url: string,
    publicUrl: string | undefined,
    bucket: string,
): { llave: string; userID: string } | null {
    if (!url || !publicUrl || !bucket) return null;

    const prefijo = `${publicUrl}/${bucket}/`;
    if (!url.startsWith(prefijo)) return null;

    const llave = url.slice(prefijo.length);
    // Una dirección puede traer `?` o `#` detrás; lo que hay después no es
    // parte de la llave y colarlo dentro haría que el borrado no encontrara
    // nada — o peor, que la comprobación de los tres trozos se despistara.
    const sinCola = llave.split(/[?#]/)[0];

    // Se decodifica ANTES de contar los trozos: `%2e%2e` y `%2F` son `..` y `/`
    // una vez decodificados, y contar sobre el texto crudo dejaría pasar un
    // salto de carpeta disfrazado.
    let decodificada: string;
    try {
        decodificada = decodeURIComponent(sinCola);
    } catch {
        return null;
    }

    const trozos = decodificada.split("/");
    if (trozos.length !== 3) return null;
    if (trozos.some((t) => !t || t === "." || t === "..")) return null;
    // Una barra invertida también sube de carpeta en algunos sistemas.
    if (decodificada.includes("\\")) return null;

    return { llave: decodificada, userID: trozos[0] };
}
