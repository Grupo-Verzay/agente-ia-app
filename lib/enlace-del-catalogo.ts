/**
 * El ENLACE del catálogo público de una cuenta: el corto (`/c/<nombre>`) si le
 * puso nombre, y si no el largo (`/catalogo/<cuenta>`).
 *
 * Lo pintan dos sitios de Panel › Catálogo —«URL activa» debajo del nombre y
 * «Catálogo público» en el pie— y los dos tienen que decir lo MISMO. El pie
 * llevaba el dominio escrito a mano («agente.ia-app.com») mientras el de
 * arriba leía el de la página: en el dominio de un reseller el pie enseñaba
 * una dirección que no es la suya, y es la que se copia para compartir.
 *
 * Puro: el dominio lo pone quien llama (`window.location.host`).
 */

export function laRutaDelCatalogo(nombre: string | null | undefined, cuentaId: string): string {
    const limpio = (nombre ?? "").trim();
    return limpio ? `/c/${limpio}` : `/catalogo/${cuentaId}`;
}

/** Lo que se ENSEÑA: el dominio de la página y la ruta, sin «https://». */
export function elEnlaceQueSeEnsena(dominio: string, ruta: string): string {
    return `${dominio.trim().replace(/\/+$/, "")}${ruta}`;
}

/**
 * El NOMBRE del enlace corto (`/c/<nombre>`) mientras se escribe: minúsculas,
 * sin acentos, y lo que no sea letra, número o guion pasa a guion.
 *
 * Antes cada acento se volvía un guion —«Café» quedaba «caf-», y al guardar
 * «caf»—, así que el enlace no se parecía al nombre del negocio. Aquí la tilde
 * se QUITA y la letra se queda. No junta ni recorta guiones: eso a mitad de
 * escribir pelearía con quien teclea un espacio.
 */
export function comoSeEscribeElNombre(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
}

/**
 * Lo que se GUARDA: lo mismo, sin guiones repetidos ni en los bordes. Vacío
 * significa que no hay nombre que guardar. Es la misma regla en la pantalla y
 * en el servidor (`updateCatalogSlug`): con dos, el nombre que se ve al
 * escribir y el que queda guardado podrían no coincidir.
 */
export function comoNombreDelEnlace(texto: string): string {
    return comoSeEscribeElNombre(texto.trim())
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
