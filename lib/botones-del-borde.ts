/**
 * La columna de botones del borde derecho: cuántos son, en qué orden y dónde
 * cae cada uno. **Escrito una vez y puro**, para que se pueda probar sin
 * navegador.
 *
 * # Por qué hay un módulo para tres botones
 *
 * Porque la posición dejó de ser trivial en cuanto fueron tres. Con DOS, la
 * columna iba `top-1/2 -translate-y-1/2` y eso centraba **la pareja**: el
 * copiloto quedaba 20 px por encima de la mitad de la ventana y el del equipo
 * 20 por debajo. Ninguno de los dos estaba centrado, y con dos botones iguales
 * eso no se nota.
 *
 * El encargo es otro: **el copiloto es el EJE**, la nota va arriba y el chat
 * del equipo abajo, los dos a la misma distancia del centro. Centrar la
 * columna entera lo cumple por casualidad mientras los tres midan lo mismo y
 * el eje sea el del medio — y deja de cumplirlo en silencio el día que se
 * añada un cuarto botón o que uno cambie de alto. Un botón que se descuadra no
 * da ningún error: se ve como una columna torcida y nadie sabe desde cuándo.
 *
 * Así que la posición se calcula: la columna se pega a `top: 50%` y se sube
 * **lo que mide desde su borde de arriba hasta el centro del botón EJE**
 * (`elDesplazamientoDelEje`). Con eso el eje cae en la mitad de la ventana
 * pase lo que pase, y la simetría de los otros dos sale de que estén a la
 * misma distancia de él en la lista.
 *
 * # Y en píxeles, no en una clase de Tailwind
 *
 * Tailwind solo genera lo que ve escrito literal, así que una clase compuesta
 * en tiempo de ejecución —`-translate-y-[58px]` armado con un `map`— **no
 * existiría en el CSS** y la columna se quedaría sin desplazar, con el build en
 * verde. Es la familia de `removeConsole`. Se aplica con `style`, que es lo
 * único que no depende de lo que el compilador haya visto.
 */

/** Lo que mide un botón de lado: `h-9 w-9`. Los tres iguales, a propósito. */
export const LADO_DEL_BOTON = 36;

/** La separación entre dos botones de la columna: `gap-1`. */
export const HUECO_ENTRE_BOTONES = 4;

/** Los que hay. El id es el que llevan en el DOM (`data-boton-del-borde`). */
export type BotonDelBorde = "nota" | "copiloto" | "equipo";

/**
 * De arriba abajo, y **el orden ES la simetría**: el eje va en medio y los
 * otros dos a un paso de él por cada lado. Con la nota entre el copiloto y el
 * equipo, el eje dejaría de ser el del medio y los dos vecinos caerían a
 * distancias distintas del centro.
 */
export const ORDEN_DE_LOS_BOTONES: readonly BotonDelBorde[] = ["nota", "copiloto", "equipo"];

/**
 * El que se queda clavado en la mitad de la ventana.
 *
 * Es el copiloto porque es el que llevaba años ahí: mover el mando que la
 * gente ya sabe encontrar para hacerle sitio a uno nuevo es el cambio que se
 * nota y nadie pidió. Los dos nuevos vecinos se reparten alrededor.
 */
export const EJE_DE_LA_COLUMNA: BotonDelBorde = "copiloto";

/** Lo que mide la columna entera, de borde a borde. */
export function elAltoDeLaColumna(
    orden: readonly BotonDelBorde[] = ORDEN_DE_LOS_BOTONES,
): number {
    if (orden.length === 0) return 0;
    return orden.length * LADO_DEL_BOTON + (orden.length - 1) * HUECO_ENTRE_BOTONES;
}

/**
 * Cuánto hay desde el borde de ARRIBA de la columna hasta el CENTRO del eje.
 *
 * Es exactamente lo que hay que subir la columna después de pegarla a la mitad
 * de la ventana. Un eje que no esté en la lista no se inventa: se cae al
 * centro de la columna, que es lo que se hacía antes y no descuadra nada.
 */
export function elDesplazamientoDelEje(
    orden: readonly BotonDelBorde[] = ORDEN_DE_LOS_BOTONES,
    eje: BotonDelBorde = EJE_DE_LA_COLUMNA,
): number {
    const donde = orden.indexOf(eje);
    if (donde < 0) return elAltoDeLaColumna(orden) / 2;
    return donde * (LADO_DEL_BOTON + HUECO_ENTRE_BOTONES) + LADO_DEL_BOTON / 2;
}

/**
 * Dónde cae el centro de cada botón, **medido desde el centro de la ventana**.
 *
 * El eje da 0 y los demás su distancia con signo: negativo arriba, positivo
 * abajo. Es la forma en que se puede afirmar la simetría de una sola vez —los
 * dos vecinos tienen que dar el mismo número con el signo cambiado— sin tener
 * que abrir un navegador.
 */
export function elCentroDeCadaBoton(
    orden: readonly BotonDelBorde[] = ORDEN_DE_LOS_BOTONES,
    eje: BotonDelBorde = EJE_DE_LA_COLUMNA,
): Record<string, number> {
    const desplazamiento = elDesplazamientoDelEje(orden, eje);
    const centros: Record<string, number> = {};
    orden.forEach((cual, i) => {
        centros[cual] = i * (LADO_DEL_BOTON + HUECO_ENTRE_BOTONES) + LADO_DEL_BOTON / 2 - desplazamiento;
    });
    return centros;
}

/**
 * Las clases de la columna. **Sin `-translate-y-1/2`**: eso centraba la
 * columna, que es justo lo que no se quiere. Lo vertical lo pone el `style`.
 */
export const COLUMNA_DEL_BORDE =
    "fixed right-0 top-1/2 z-[60] flex flex-col items-end gap-1";

/**
 * La forma de un botón del borde: 36 px y media luna contra el borde. **La
 * misma para los tres.**
 *
 * La tenían el copiloto y el del equipo escrita cada uno por su lado, con el
 * comentario de «si uno cambia, cambian los dos» — que es la forma de decir
 * que el día que cambie uno el otro se queda. Ahora es una cadena, y los tres
 * la importan.
 */
export const BOTON_DEL_BORDE =
    "group relative flex h-9 w-9 items-center justify-center rounded-l-full border border-r-0 " +
    "border-primary/25 bg-background text-primary shadow-lg shadow-black/10 transition-all " +
    "hover:bg-primary hover:text-primary-foreground focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

/** El glifo de dentro, también uno solo. */
export const GLIFO_DEL_BOTON_DEL_BORDE = "h-4 w-4";
