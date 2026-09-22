/**
 * Qué se lee en la columna «Detalle» de CRM › Llamadas.
 *
 * Puro a propósito: lo preguntan **la celda y el ordenador de la columna**, y
 * con la condición escrita en los dos sitios la tabla se ordena por un valor y
 * enseña otro — que es la familia de «dos fórmulas para la misma pantalla» que
 * este repositorio ya pagó media docena de veces.
 *
 * # Por qué hacía falta, que no es obvio
 *
 * Esa columna pintaba **solo `leadSynthesis`**, o sea la síntesis del LEAD que
 * arman los seguimientos del CRM — no la llamada. Así que una llamada con su
 * transcripción y su resumen perfectamente guardados seguía diciendo **«Sin
 * detalle»**, y desde fuera eso se lee como que la grabación no dejó nada.
 *
 * El orden no es indiferente:
 *
 * 1. **La síntesis del lead primero.** Es lo que esa columna prometía y lo que
 *    la gente ya está acostumbrada a leer ahí; cambiarlo de sitio sería
 *    arreglar un hueco rompiendo lo que funcionaba.
 * 2. **Después el resumen de ESTA llamada**, que es lo que faltaba.
 * 3. **Y por último su transcripción.** Un resumen que no salió —el modelo
 *    falló, la cuenta paga su propia IA y no hay clave— no puede dejar en
 *    blanco una celda cuando el texto de la llamada sí está.
 *
 * **Una línea, no un párrafo.** La celda es de 260 px con `truncate`: un
 * resumen en viñetas metido entero ahí sale como un renglón de guiones que no
 * dice nada. Lo entero se lee al abrir el detalle, que es para lo que está.
 */
export function elDetalleDeLaLlamada(call: {
    leadSynthesis?: string | null;
    summary?: string | null;
    transcript?: string | null;
}): string {
    return (
        laPrimeraLinea(call.leadSynthesis) ||
        laPrimeraLinea(call.summary) ||
        laPrimeraLinea(call.transcript)
    );
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
        const limpia = linea.replace(/^\s*[-*•]\s*/, '').trim();
        if (limpia) return limpia;
    }
    return '';
}
