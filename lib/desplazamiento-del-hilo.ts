/**
 * Dónde tiene que quedarse un hilo de mensajes al pintarse.
 *
 * Puro: entran números y sale una decisión. El desplazamiento en sí es DOM y no
 * se prueba sin navegador, pero **cuándo se pega al final y cuántos mensajes
 * quedan sin leer** sí, y es lo único que puede dejar a alguien mirando a media
 * altura o arrastrarle la vista mientras lee.
 *
 * # Los dos fallos que esto viene a arreglar
 *
 * Los cinco listados de la plataforma hacían lo mismo, cada uno por su cuenta:
 * al cambiar el número de mensajes, al final. Eso está mal por las dos puntas.
 *
 * 1. **Va demasiado pronto.** Se ejecuta al pintar, y después cargan las
 *    imágenes y los audios, que **empujan el contenido hacia abajo**. El hilo
 *    se queda a media altura y hay que bajar a mano — que es el síntoma que se
 *    reportó. Una foto sin `width`/`height` declarados ocupa cero hasta que
 *    llega, así que el «final» al que se saltó no era el final.
 * 2. **Y va aunque nadie lo haya pedido.** Estando arriba leyendo algo de
 *    ayer, cada mensaje que entra tiraba de la vista al fondo. Desde fuera eso
 *    no se lee como una función: se lee como que la App no te deja leer.
 *
 * De ahí sale la regla que sostiene todo lo demás:
 *
 * > **Estar pegado abajo solo se pierde SCROLLEANDO.** Que el contenido crezca
 * > —una imagen que carga, un audio que se mide, un mensaje que entra— no
 * > despega nunca. Si despegara, el primer fallo volvería solo: la foto que
 * > carga aumenta la distancia al final, y quien mire esa distancia decidirá
 * > que la persona se ha ido a leer arriba cuando no ha tocado nada.
 */

/**
 * Cuánto se puede estar por encima del final y seguir contando como «abajo».
 *
 * **Un solo umbral, y no dos.** Con uno para pegarse y otro más lejano para
 * enseñar la flecha quedaría una franja en la que un mensaje nuevo cuenta como
 * sin leer y **no hay flecha donde enseñarlo**: el contador subiría sin que
 * nadie lo viera. Así que la misma raya decide las dos cosas.
 *
 * Ciento cincuenta es aproximadamente una burbuja: un empujón pequeño con la
 * rueda no saca a nadie del final ni hace aparecer la flecha.
 */
export const MARGEN_DE_PEGADO = 150;

export type MedidaDelHilo = {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
};

/** Si el hilo está lo bastante abajo como para seguirlo pegado al final. */
export function estaPegadoAbajo(
    m: MedidaDelHilo,
    margen: number = MARGEN_DE_PEGADO,
): boolean {
    const { scrollTop, scrollHeight, clientHeight } = m;
    if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return true;
    // Un hilo que no llena la pantalla está siempre abajo: no hay a dónde
    // subir. Sin esto, un chat de dos mensajes enseñaría la flecha para siempre.
    if (scrollHeight <= clientHeight) return true;
    return scrollHeight - scrollTop - clientHeight <= margen;
}

/** De qué hilo se está hablando, para saber si llegó algo al final. */
export type EstadoDelHilo = {
    total: number;
    /** El último mensaje. Es lo que distingue «llegó algo» de «cargué historial». */
    ultimoId: string | null;
};

/**
 * Cuántos mensajes quedan sin leer después de este pintado.
 *
 * Tres cosas que no son obvias:
 *
 * 1. **Pegado abajo, siempre cero.** Lo que se está viendo está leído.
 * 2. **Cargar historial NO cuenta.** «Cargar mensajes anteriores» sube el total
 *    sin que haya llegado nada: lo que delata una novedad es que **cambie el
 *    último**, no que el total suba. Sin esta distinción, pulsar ese botón
 *    mientras se lee arriba pondría un «+30» de mensajes viejos.
 * 3. **Abrir un hilo no deja nada sin leer.** Sin el guardián del primer
 *    pintado, entrar a una conversación de treinta mensajes marcaría treinta.
 */
export function cuantosSinLeer(
    antes: EstadoDelHilo,
    ahora: EstadoDelHilo,
    pegado: boolean,
    acumulado: number,
): number {
    if (pegado) return 0;
    // Primer pintado: no hay «antes» con el que comparar.
    if (antes.ultimoId === null) return 0;
    if (ahora.ultimoId === null) return acumulado;
    if (ahora.ultimoId === antes.ultimoId) return acumulado;
    // El último cambió: llegó algo. Cuántos, por la diferencia de totales — y
    // al menos uno, porque un mensaje que entra a la vez que se borra otro deja
    // el total igual y no por eso deja de ser un mensaje nuevo.
    return acumulado + Math.max(1, ahora.total - antes.total);
}
