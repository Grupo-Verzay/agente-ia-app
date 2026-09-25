/**
 * El «antes» del tablero de otra cuenta: las acciones y el cargador tal como
 * estaban antes de que existieran el selector de cuenta y el filtro de asesor.
 *
 * Los dos ficheros se sacan de git (`ANTES_REF`) y el `import` del cargador se
 * apunta al viejo con un alias de esbuild — sin eso resolvería al de hoy, que ya
 * lleva el arreglo, y el modo roto pasaría sin ejercer nada.
 *
 * **`ANTES_REF` va PINCHADO a un commit, nunca a `origin/main`.** En cuanto este
 * cambio se fusiona, `origin/main` pasa a ser el «después»: el modo roto dejaría
 * de reproducir el fallo y se pondría verde sin ejercerlo, que es la peor forma
 * de tener un banco.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    tableroDelEmbudoAction,
    crearEmbudoAction,
    renombrarEmbudoAction,
    usarPorDefectoAction,
    borrarEmbudoAction,
    guardarEtapasAction,
    asignarEmbudosAction,
    moverTarjetaAction,
    etapaDeLaConversacionAction,
} from "../.antes/embudos/actions/embudos-actions";
export { db } from "@/lib/db";
