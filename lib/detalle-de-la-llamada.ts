/**
 * Qué se lee en la columna «Detalle» de CRM › Llamadas.
 *
 * Puro a propósito: lo preguntan **la celda y el ordenador de la columna**, y
 * con la condición escrita en los dos sitios la tabla se ordena por un valor y
 * enseña otro — que es la familia de «dos fórmulas para la misma pantalla» que
 * este repositorio ya pagó media docena de veces.
 *
 * # Es el resumen de ESTA llamada, y nada más
 *
 * La columna pintaba primero `leadSynthesis`, la síntesis del LEAD que arman
 * los seguimientos del CRM. Eso es contexto del chat, no de la llamada: dos
 * llamadas al mismo contacto salían con el mismo detalle, y el de ninguna de
 * las dos decía qué pasó en ella. La síntesis se queda en el chat, que es donde
 * se edita.
 *
 * Tampoco se cae a la transcripción: la primera línea de una transcripción es
 * el saludo («Hola, ¿hablo con…?»), que no dice nada de la llamada. Sin
 * resumen, «Sin detalle» — que es la verdad.
 *
 * **Una línea, no un párrafo.** La celda va con `truncate`: un resumen en
 * viñetas metido entero sale como un renglón de guiones. Lo entero se lee al
 * abrir el detalle, que es para lo que está.
 */
export function elDetalleDeLaLlamada(call: { summary?: string | null }): string {
    return laPrimeraLinea(call.summary);
}

/**
 * La primera línea con algo escrito, sin su viñeta.
 *
 * El resumen sale en viñetas (`- punto clave`), así que sin quitar el guión la
 * celda abre con un signo suelto. Y se busca **la primera línea NO vacía**: un
 * salto de línea al principio dejaría la celda en blanco con el texto justo
 * debajo, que es un hueco que nadie sabría explicar.
 */
function laPrimeraLinea(texto: string | null | undefined): string {
    for (const linea of (texto ?? '').split('\n')) {
        const limpia = linea.replace(/^\s*[-*•]\s*/, '').replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
        if (limpia) return limpia;
    }
    return '';
}
