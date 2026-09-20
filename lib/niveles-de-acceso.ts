/**
 * Los tres niveles con los que se comparte algo en esta plataforma. **Puro.**
 *
 * Son los que Notas lleva desde el principio —«Sin acceso», «Solo lectura»,
 * «Puede editar»— y los mismos que ahora usa Documentación. Están aquí, en un
 * módulo sin dependencias, por dos motivos:
 *
 * 1. **Para que los rótulos sean uno.** Con la lista copiada en cada pantalla,
 *    la tercera acaba diciendo «Editor» o «Escritura» y las tres pantallas se
 *    leen como tres productos. Ya pasó con el filtro «No leídos» / «Sin leer»
 *    de Chats, que hubo que igualar en dos sitios.
 * 2. **Para que lo pueda leer también el servidor.** El control de la pantalla
 *    es un componente de cliente; una acción que valide el nivel no puede
 *    importarlo, y sin esto tendría que escribir su propia lista.
 *
 * ## «Sin acceso» no es un permiso: es la ausencia de uno
 *
 * Y esa es la diferencia que hay que tener delante al conectar esto con una
 * base. En `note_shares` y en `doc_permisos` **no hay ninguna fila** para «sin
 * acceso»: elegirlo BORRA la fila. Guardarlo como un valor más —una fila que
 * dice «este no puede»— tendría dos formas de decir lo mismo, y cualquier
 * consulta que se olvidara de mirar la columna daría acceso a quien se lo
 * acababan de quitar.
 */

export const NIVELES_DE_ACCESO = ["ninguno", "lectura", "edicion"] as const;
export type NivelDeAcceso = (typeof NIVELES_DE_ACCESO)[number];

/** Cómo se llama cada uno en pantalla. No se escribe a mano en ningún sitio. */
export const NOMBRE_DEL_NIVEL: Record<NivelDeAcceso, string> = {
    ninguno: "Sin acceso",
    lectura: "Solo lectura",
    edicion: "Puede editar",
};

/**
 * Lo que llegue de fuera pasa por la lista, y lo que no encaje cae en
 * `ninguno`.
 *
 * El lado seguro es no dar acceso: equivocarse hacia `lectura` por un valor
 * raro sería abrir un documento por un dato que nadie escribió a propósito.
 */
export function comoNivelDeAcceso(valor: unknown): NivelDeAcceso {
    const texto = String(valor ?? "").trim().toLowerCase();
    return (NIVELES_DE_ACCESO as readonly string[]).includes(texto)
        ? (texto as NivelDeAcceso)
        : "ninguno";
}
