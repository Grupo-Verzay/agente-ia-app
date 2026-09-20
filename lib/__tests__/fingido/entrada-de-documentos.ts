/**
 * La entrada que se empaqueta para el banco de compartir en Documentación.
 *
 * Existe por una razón concreta: el `currentUser()` de mentira se inyecta con
 * un alias de esbuild, así que queda **dentro** del paquete. Importándolo
 * aparte desde el banco se estaría moviendo otra copia —otro módulo, otra
 * variable— y `ponerAQuienMira` no tendría ningún efecto sobre el código que
 * corre. Reexportándolo desde aquí, el banco mueve la misma.
 *
 * Lo que sale por aquí son **las acciones de verdad**, no las funciones de la
 * base: lo que este banco viene a comprobar es que lo nuevo —compartir,
 * ordenar, fijar y archivar— pasa por `accesoAEsteEspacio` /
 * `accesoAEsteDocumento` y no por otro sitio.
 */
export { ponerAQuienMira } from "./auth-de-documentos";

export {
    archivarDocumentoAction,
    borrarCarpetaAction,
    compartirConCuentasAction,
    crearCarpetaAction,
    moverEspacioACarpetaAction,
    renombrarCarpetaAction,
    crearDocumentoAction,
    crearEspacioAction,
    fijarDocumentoAction,
    lasCuentasParaCompartirAction,
    leerElArbolAction,
    leerLosPermisosAction,
    loQueSePuedeCompartirAction,
    ponerPermisoAction,
    quitarPermisoAction,
    buscarAction,
} from "@/actions/documentacion-actions";

export { guardarElOrdenDeLaColumnaAction } from "@/actions/orden-de-tablero-actions";

export { db } from "@/lib/db";
