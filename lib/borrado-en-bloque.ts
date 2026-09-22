/**
 * Lo que devuelve un borrado en bloque, y por qué no es un booleano.
 *
 * Borrar veinte filas y decir «listo» cuando se fueron dieciocho es peor que
 * un error: nadie vuelve a mirar. La barra cuenta lo que salió y lo que no
 * (`AccionesMasivas`), así que la acción tiene que saber distinguirlo.
 *
 * Es de las pocas cosas de esta familia que **no se deshacen**, así que el
 * resumen viaja hasta la pantalla y se dice con números, nunca con un «ok».
 */
export type ResumenDelBorrado = {
    success: boolean;
    borrados: number;
    fallaron: number;
    message: string;
};

/**
 * El tope de ids que una acción de borrado en bloque acepta de una vez.
 *
 * No es una preferencia: una lista que llega del navegador entra tal cual en un
 * `IN (…)`, y sin tope basta con mandar cien mil ids para tener una consulta
 * que ningún índice ordena y un proceso ocupado un rato largo. Con el tope, lo
 * que pasa es que se rechaza y se dice.
 *
 * El número sale de lo que cabe en una pantalla larga con «marcar todo»
 * pulsado; más que eso no es una selección, es un borrado de tabla.
 */
export const TOPE_DE_IDS = 500;

/**
 * Sanea la lista de ids que llega del navegador.
 *
 * Tres cosas, y las tres han costado un incidente en esta casa: se quitan los
 * repetidos —dos veces el mismo id en un `IN` no borra dos veces, pero sí
 * infla el conteo que se le devuelve a la persona—, se descarta lo que no sea
 * una cadena con contenido, y se acota al tope.
 */
export function comoListaDeIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const limpios = ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    return Array.from(new Set(limpios)).slice(0, TOPE_DE_IDS);
}

/**
 * Lo mismo, con ids que son NÚMEROS.
 *
 * Las sesiones del CRM se identifican con un entero, no con un `cuid`. Se
 * descarta lo que no sea un entero finito —`NaN`, un decimal, una cadena— en
 * vez de convertirlo: `Number("")` es 0 y `Number(null)` también, así que un
 * saneado indulgente convierte basura en el id 0 y lo mete en el `IN`.
 */
export function comoListaDeIdsNumericos(ids: unknown): number[] {
    if (!Array.isArray(ids)) return [];
    const limpios = ids.filter(
        (id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0,
    );
    return Array.from(new Set(limpios)).slice(0, TOPE_DE_IDS);
}

/**
 * Borra de una en una cuando no se puede con un solo `deleteMany`.
 *
 * Es el caso de lo que arrastra limpieza detrás —ficheros en el bucket, filas
 * de otra tabla sin clave foránea—. **En serie y no en paralelo**: el pool de
 * Prisma es de diez por proceso, y veinte borrados a la vez se comen los
 * turnos de las consultas que traen mensajes, que es lo que la gente está
 * mirando.
 *
 * Lo que falla no para el resto: se cuenta y se sigue. Un id roto en mitad de
 * la lista no puede dejar sin borrar a los diecinueve de detrás.
 */
export async function borrarUnaAUna(
    ids: string[],
    borrar: (id: string) => Promise<boolean>,
): Promise<{ borrados: number; fallaron: number }> {
    let borrados = 0;
    let fallaron = 0;

    for (const id of ids) {
        try {
            const fue = await borrar(id);
            if (fue) borrados += 1;
            else fallaron += 1;
        } catch (error) {
            console.error("[borrado] una fila no se pudo eliminar", { id, error });
            fallaron += 1;
        }
    }

    return { borrados, fallaron };
}

/** El texto que se devuelve, con los números delante. */
export function comoResumen(borrados: number, fallaron: number, queSon: string): ResumenDelBorrado {
    if (borrados === 0 && fallaron > 0) {
        return { success: false, borrados, fallaron, message: `No se pudo eliminar ${fallaron === 1 ? "el elemento" : "ninguno de los elementos"}.` };
    }
    if (fallaron > 0) {
        return { success: true, borrados, fallaron, message: `Se eliminaron ${borrados} ${queSon}; ${fallaron} no se pudieron eliminar.` };
    }
    return { success: true, borrados, fallaron, message: `${borrados} ${queSon} eliminados.` };
}
