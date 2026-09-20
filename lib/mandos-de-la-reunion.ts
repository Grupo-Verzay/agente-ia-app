/**
 * Cuándo se ven los mandos de una reunión, y cuándo se apartan.
 *
 * El video ocupa **toda** la caja: la cabecera y la barra de mandos no tienen
 * franja propia, flotan encima. Y flotar encima obliga a lo otro —que se
 * aparten solas—, porque una barra permanente sobre el video tapa justo la
 * esquina donde está el nombre de quien habla y, en un móvil, una cuarta parte
 * de la imagen.
 *
 * Puro a propósito, como el resto de lo que decide sobre esta ventana
 * (`lib/ventana-de-reunion.ts`, `lib/ventana-flotante.ts`): de aquí tiran el
 * hook que lo pone en marcha y el banco.
 *
 * # Lo que NO se esconde, y es la mitad que importa
 *
 * Los avisos. El de «se está grabando» ocupa una franja entera en rojo a
 * propósito —grabar la voz y la cara de los demás sin que se note no es una
 * función, es otra cosa— y uno que se aparta a los tres segundos es uno que no
 * se ve. Lo mismo con el de reconexión y con la sala de espera, que además
 * lleva botones que hay que poder pulsar. Esos tres siguen en el flujo, encima
 * del video y sin temporizador ninguno.
 *
 * Lo que se esconde es lo que la persona ya sabe que está ahí y sabe cómo
 * traer de vuelta: los mandos.
 */

/**
 * Cuánto se espera sin actividad antes de apartarlos.
 *
 * Tres segundos y medio, que es el orden de lo que hacen las salas de video que
 * la gente ya usa. Más corto —un segundo— se aparta mientras uno todavía está
 * decidiendo cuál pulsar; mucho más largo deja de apartarse en la práctica,
 * porque en una reunión el ratón se mueve cada pocos segundos.
 */
export const CADA_CUANTO_SE_ESCONDEN_MS = 3_500;

/**
 * Cuánto se ignora una señal seguida de otra.
 *
 * `mousemove` llega decenas de veces por segundo y cada una reprograma el
 * temporizador. No cambia lo que se ve, pero son decenas de `setTimeout` por
 * segundo durante toda la reunión, en la pantalla que además está pintando
 * video. **Con los mandos ya escondidos no se frena nada**: ahí la señal SÍ
 * cambia lo que se ve, y esperar 250 ms a enseñarlos se nota como un ratón que
 * no responde.
 */
export const FRENO_DE_LAS_SENALES_MS = 250;

/**
 * Los motivos por los que los mandos no se pueden apartar ahora mismo.
 *
 * Un conjunto y no un contador: un contador se desequilibra en cuanto un
 * `onMouseLeave` no llega —y no llega cuando el elemento se desmonta con el
 * puntero encima, que aquí pasa cada vez que se abre un menú— y a partir de ahí
 * los mandos se quedan puestos para siempre o no vuelven nunca. Con nombres,
 * poner el mismo dos veces no cuenta dos veces.
 *
 * - `menu`: hay un desplegable abierto (el de grabar, el del fondo). Si la
 *   barra se aparta con su menú abierto, el menú se queda flotando solo sobre
 *   el video, anclado a un botón que ya no se ve.
 * - `encima`: el puntero está sobre la barra. Quien tiene el ratón encima de
 *   los mandos los está mirando, aunque no lo mueva.
 */
export type MotivoParaNoEsconderse = "menu" | "encima";

/**
 * Si los mandos se ven, con el reloj delante.
 *
 * Se decide con una resta y no con una bandera que alguien apaga y enciende:
 * así «hace cuánto que no pasa nada» y «hay un motivo para quedarse» son dos
 * entradas separadas, y el banco puede ejercer el cruce de las dos sin esperar
 * tres segundos y medio de verdad.
 */
export function seVenLosMandos(input: {
    /** Cuándo fue la última señal de la persona. */
    ultimaSenal: number;
    ahora: number;
    /** Los motivos activos para no apartarlos. */
    motivos: readonly MotivoParaNoEsconderse[];
    /**
     * Si el temporizador corre siquiera.
     *
     * Apagado —la reunión plegada a una pastilla, que no tiene mandos que
     * esconder— se ven siempre. Dejarlos escondidos ahí es empezar la vuelta
     * siguiente sin ellos.
     */
    activo: boolean;
}): boolean {
    if (!input.activo) return true;
    if (input.motivos.length > 0) return true;
    return input.ahora - input.ultimaSenal < CADA_CUANTO_SE_ESCONDEN_MS;
}

/**
 * Si una señal de la persona hay que atenderla o se puede frenar.
 *
 * La asimetría es el encargo: con los mandos escondidos **toda** señal se
 * atiende —es lo que los devuelve, y es lo único que la persona puede hacer
 * para traerlos—, y con ellos puestos se frena, porque entonces la señal solo
 * sirve para reprogramar un temporizador que ya está programado.
 */
export function hayQueAtenderLaSenal(input: {
    seVen: boolean;
    ultimaSenal: number;
    ahora: number;
}): boolean {
    if (!input.seVen) return true;
    return input.ahora - input.ultimaSenal >= FRENO_DE_LAS_SENALES_MS;
}
