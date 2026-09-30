/**
 * La burbuja que pinta un aviso en vivo es un BORRADOR, y el sondeo la tiene
 * que poder sustituir.
 *
 * Cuando un mensaje llega por el socket, la conversación abierta lo pinta al
 * instante como texto plano (`message.conversation` con lo que traiga el aviso:
 * «[Audio]», «[Documento]», el texto). Es un anticipo: el mensaje de verdad —su
 * reproductor, su archivo, su transcripción y la marca de «Agente IA»— lo trae
 * el reloj del chat abierto unos segundos después, con el MISMO id.
 *
 * Y no lo traía. El reloj solo mezcla lo que llega si la lista «cambió», y
 * decidía eso mirando el largo y el último mensaje: el borrador y el mensaje
 * real tienen el mismo id y la misma hora, así que para él no había nada nuevo
 * y el borrador se quedaba para siempre. Desde fuera:
 *
 * | qué llegaba en vivo | qué se quedaba en pantalla |
 * | --- | --- |
 * | una nota de voz | un «🎧 Audio» sin reproductor ni transcripción |
 * | un PDF, una imagen, un video | su etiqueta de texto, sin el archivo |
 * | la respuesta de la IA | firmada «Asesor» en vez de «Agente IA» |
 *
 * Solo se arreglaba al llegar otro mensaje por el reloj antes que por el
 * socket, o al volver a abrir el chat. Sin ningún error.
 *
 * La regla: el borrador lleva una marca (`DEL_AVISO_EN_VIVO`), y mientras quede
 * uno cuya versión real ya esté en la respuesta del reloj, la lista SÍ cambió.
 * Una vez mezclada, la versión real no lleva la marca y el reloj vuelve a no
 * hacer nada cuando no hay nada.
 *
 * Puro: lo usa `chats-client` y lo prueba su banco sin navegador.
 */

/** La marca que lleva la burbuja provisional de un aviso en vivo. */
export const DEL_AVISO_EN_VIVO = "delAvisoEnVivo" as const;

/** ¿Es esta burbuja el borrador de un aviso en vivo? */
export function esDelAvisoEnVivo(m: unknown): boolean {
    return !!m && typeof m === "object" && (m as Record<string, unknown>)[DEL_AVISO_EN_VIVO] === true;
}

/**
 * ¿Trae la respuesta del reloj la versión real de algún borrador que se está
 * viendo?
 *
 * `llave` es la misma con la que la conversación junta los mensajes (el id de
 * WhatsApp, venga como venga serializado): si no fuera la misma, se decidiría
 * sobre un emparejamiento distinto del que luego hace la mezcla.
 *
 * Una versión que también es un borrador no cuenta: sustituir un borrador por
 * otro no enseña nada nuevo y haría repintar en cada vuelta.
 */
export function traeLoQueFaltabaDeUnAviso<T>(
    enPantalla: readonly T[],
    delReloj: readonly T[],
    llave: (m: T) => string | undefined,
): boolean {
    const borradores = new Set<string>();
    for (const m of enPantalla) {
        if (!esDelAvisoEnVivo(m)) continue;
        const k = llave(m);
        if (k) borradores.add(k);
    }
    if (borradores.size === 0) return false;
    for (const m of delReloj) {
        if (esDelAvisoEnVivo(m)) continue;
        const k = llave(m);
        if (k && borradores.has(k)) return true;
    }
    return false;
}
