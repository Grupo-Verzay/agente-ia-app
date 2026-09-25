/**
 * El «antes» de las siete etapas: las acciones y sus tres módulos tal como
 * estaban cuando un embudo nacía con tres etapas, ninguna del sistema, y una
 * cuenta nueva abría el tablero **sin ningún embudo**.
 *
 * Los cuatro ficheros se sacan de git y los `import` se apuntan a los viejos con
 * alias de esbuild: sin eso resolverían a los de hoy —que ya llevan el arreglo—
 * y el modo roto pasaría sin ejercer nada.
 *
 * **`ANTES_DE_LAS_SIETE` va PINCHADO a un commit, nunca a `origin/main`.** En
 * cuanto este cambio se fusione, `origin/main` pasa a ser el «después»: el modo
 * roto dejaría de reproducir el fallo y se pondría verde sin ejercerlo, que es
 * la peor forma de tener un banco.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    tableroDelEmbudoAction,
    crearEmbudoAction,
    guardarEtapasAction,
} from "../.antes/sin-siete/actions/embudos-actions";
export { db } from "@/lib/db";
