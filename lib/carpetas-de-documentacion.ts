/**
 * Las carpetas del árbol de Documentación: **una capa por encima de los
 * espacios**, y ninguna más.
 *
 * Una carpeta contiene espacios; un espacio sigue conteniendo documentos como
 * hasta ahora. **No se anidan**, a propósito: dos niveles ya ordenan una barra
 * lateral de veinte espacios, y un árbol de profundidad libre trae consigo
 * mover una carpeta dentro de otra, los ciclos, el «¿hasta dónde pliego?» y un
 * sangrado que a la tercera capa no cabe en 18 rem.
 *
 * ## Por qué la pertenencia es de la pareja CUENTA + ESPACIO
 *
 * Lo obvio sería una columna `carpetaId` en `doc_espacios`. No vale, y es la
 * misma razón que ya está escrita para el orden del árbol: **una cosa
 * compartida tiene UNA fila y DOS sitios.** Un espacio compartido sale en el
 * árbol de las dos cuentas —la dueña y la invitada— y cada una lo quiere
 * archivar donde le sirva; con una columna en la fila solo cabe una carpeta,
 * así que moverlo en una cuenta se lo movería a la otra… a una carpeta que en
 * la otra cuenta ni existe.
 *
 * De ahí sale la regla de abajo, que es la que sostiene todo esto.
 *
 * ## Una carpeta que no está deja su espacio SUELTO, nunca escondido
 *
 * Un `carpetaId` puede apuntar a algo que no está en la lista de carpetas por
 * dos caminos perfectamente normales:
 *
 * 1. **La carpeta se borró.** Borrarla no borra sus espacios —es el encargo—,
 *    así que quedan sueltos.
 * 2. **Es una carpeta de OTRA cuenta.** Con la pertenencia por pareja esto no
 *    debería pasar, pero una fila a mano o un id rancio sí puede.
 *
 * En los dos casos el espacio sale **suelto**, arriba del todo del árbol y a la
 * vista. Lo contrario —esconderlo hasta que aparezca su carpeta— sería un
 * espacio que desaparece sin que nadie lo haya borrado, y eso no se lee como un
 * fallo: se lee como que la documentación se perdió.
 *
 * Es puro a propósito: entra la lista de carpetas, la de espacios ya ordenada y
 * el mapa de pertenencia, y sale el árbol agrupado. Así se prueba entero sin
 * levantar nada.
 */

/** Una carpeta, tal y como la guarda `doc_carpetas`. */
export type Carpeta = {
    id: string;
    cuentaId: string;
    nombre: string;
    creadoPorId: string;
    creadoPorNombre: string | null;
    creadoEn: Date;
    actualizadoEn: Date;
};

/**
 * La «columna» de los espacios que no están en ninguna carpeta.
 *
 * Tiene nombre porque el arrastre reutiliza `resolverElArrastre`, que razona en
 * columnas: las carpetas son columnas y los sueltos son una más. Sin un
 * centinela habría que escribir una rama aparte para «soltar fuera», que es
 * justo la rama que nadie prueba.
 *
 * No puede chocar con el id de una carpeta: los ids son UUID.
 */
export const SUELTOS = "sueltos";

/** Lo más largo que puede medir el nombre de una carpeta. */
export const LARGO_DEL_NOMBRE = 80;

/**
 * El nombre que se guarda. Lo que llega del navegador pasa por aquí, **en el
 * servidor**: una carpeta sin nombre es una fila que no se puede nombrar en
 * ninguna pantalla, y una de diez mil caracteres rompe la barra lateral.
 */
export function comoNombreDeCarpeta(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    // Los saltos se APLASTAN, no cortan: quien pega un texto de dos líneas en
    // el nombre quiere que se vea entero, y cortar por el primer `Enter` sería
    // tirar lo que acaba de escribir sin decírselo. Es lo mismo que ya hace el
    // título de una tarea.
    const limpio = valor.replace(/\s+/g, " ").trim();
    if (!limpio) return null;
    return limpio.slice(0, LARGO_DEL_NOMBRE);
}

/** El árbol ya agrupado: las carpetas con lo suyo dentro, y los sueltos. */
export type ArbolAgrupado<T> = {
    carpetas: Array<{ carpeta: Carpeta; espacios: T[] }>;
    sueltos: T[];
};

/**
 * Agrupar el árbol.
 *
 * Las dos listas llegan **ya ordenadas** —las carpetas por su posición en
 * `orden_en_tablero`, los espacios por la suya— y aquí no se reordena nada: lo
 * único que se hace es repartir. Cada espacio conserva su sitio relativo dentro
 * del grupo donde cae, que es lo que hace que crear la primera carpeta no
 * cambie el orden de nada.
 *
 * Y **los sueltos van al final**, detrás de las carpetas: lo que está archivado
 * ocupa una línea plegada y lo que no, tantas como espacios tenga. Con los
 * sueltos arriba, una cuenta con quince espacios sin archivar dejaría sus
 * carpetas fuera de la pantalla, que es lo contrario de para lo que se crean.
 */
export function agruparElArbol<T>(args: {
    carpetas: Carpeta[];
    espacios: T[];
    idDelEspacio: (espacio: T) => string;
    /** espacioId → carpetaId. Lo que no esté aquí está suelto. */
    enCarpeta: Readonly<Record<string, string>>;
}): ArbolAgrupado<T> {
    const { carpetas, espacios, idDelEspacio, enCarpeta } = args;

    const porCarpeta = new Map<string, T[]>();
    for (const carpeta of carpetas) porCarpeta.set(carpeta.id, []);

    const sueltos: T[] = [];
    for (const espacio of espacios) {
        const carpetaId = enCarpeta[idDelEspacio(espacio)];
        const dentro = carpetaId ? porCarpeta.get(carpetaId) : undefined;
        // Sin carpeta, o con una que no está en la lista: SUELTO. Ver la regla
        // de arriba — esconderlo sería perderlo.
        if (dentro) dentro.push(espacio);
        else sueltos.push(espacio);
    }

    return {
        carpetas: carpetas.map((carpeta) => ({
            carpeta,
            espacios: porCarpeta.get(carpeta.id) ?? [],
        })),
        sueltos,
    };
}

/**
 * En qué columna está un espacio: su carpeta, o `SUELTOS`.
 *
 * Lo usan el arrastre y el guardado del orden, y es una función y no un
 * `enCarpeta[id] ?? SUELTOS` escrito a mano **porque tiene que decir lo mismo
 * que `agruparElArbol`**: una carpeta que no está en la lista es suelto, y sin
 * esta comprobación el arrastre creería que ese espacio vive en una columna que
 * no se pinta en ninguna parte. Ahí el arrastre se rendiría en silencio, que se
 * lee como «el espacio no se queda donde lo dejo».
 */
export function laColumnaDelEspacio(
    espacioId: string,
    enCarpeta: Readonly<Record<string, string>>,
    carpetas: readonly { id: string }[],
): string {
    const carpetaId = enCarpeta[espacioId];
    if (!carpetaId) return SUELTOS;
    return carpetas.some((c) => c.id === carpetaId) ? carpetaId : SUELTOS;
}
