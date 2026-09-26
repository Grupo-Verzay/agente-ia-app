import type { LeadStatus } from "@/types/session";

/**
 * Cuándo se pinta la pastilla de CALIFICACIÓN en la fila de la lista de Chats,
 * y qué se puede guardar en ella.
 *
 * # El fallo
 *
 * La pastilla se pintaba SIEMPRE, y sin calificación decía «Sin clasificar»
 * dentro de un recuadro de borde punteado. O sea que la inmensa mayoría de las
 * filas de una bandeja —toda conversación que nadie ha calificado todavía, que
 * es como nacen todas— gastaba una pastilla entera del renglón para decir que
 * no hay nada que decir.
 *
 * Y el renglón es lo único que escasea en esa fila: cada pastilla que se pinta
 * le quita el sitio a una que sí lleva un dato, así que «Sin clasificar»
 * empujaba al «+N» a la etapa, a los recordatorios o a las etiquetas —que sí
 * informan— para enseñar un hueco. Es la misma familia que *una insignia con
 * un cero dentro sigue llamando la atención para decir que no pasa nada*.
 *
 * > **La calificación se pinta cuando la hay: Frío, Tibio, Caliente,
 * > Finalizado o Descartado. Sin calificar no se pinta nada, y no deja hueco**
 * > —el renglón reparte con `gap`, así que lo que no se pinta no ocupa—.
 *
 * Es la misma regla que la etapa del embudo ya cumplía en la fila de al lado:
 * una cuenta sin embudos no pinta ninguna pastilla de etapa. Lo que no cuadraba
 * era que dos pastillas vecinas contestaran distinto a la misma pregunta.
 *
 * # La otra mitad: quitar la pastilla NO puede quitar el mando
 *
 * La pastilla no era solo una etiqueta: **era el disparador del menú con el que
 * se califica**, y el único que hay en Chats —el menú «⋯» de la fila no lo
 * ofrecía—. Escondiéndola a secas, una conversación sin calificar se quedaba
 * sin ninguna forma de calificarse… que es exactamente la que hay que poder
 * calificar. Eso es el «menú cerrado por dentro» que este repositorio ya pagó
 * en el tablero de Embudos, y se lee igual de mal: *no se puede*.
 *
 * Así que **calificar se muda al menú «⋯» de la fila**, al lado de «Asignar
 * agente» y «Asignar etiqueta», que es donde ya viven las acciones de la fila.
 * La pastilla sigue abriendo el mismo menú cuando existe.
 *
 * # Y las dos listas tienen que ser LA MISMA
 *
 * Lo que pinta una pastilla y lo que el menú ofrece son la misma lista de cinco
 * (`LEAD_STATUS_FILTER_OPTIONS`), más «Sin clasificar», que solo el menú
 * ofrece porque es lo que la BORRA. Si se separaran, el menú dejaría poner una
 * calificación que la fila no enseña —un cambio que no se ve— o la fila
 * pintaría una que el menú no sabe quitar. El banco las encadena en vez de
 * comprobar cada una por su lado.
 */

/**
 * ¿Se pinta la pastilla de calificación?
 *
 * Solo con calificación de verdad. `null` y `undefined` son «sin clasificar»
 * —son lo mismo: una sesión que nunca se calificó y una a la que se le quitó
 * la calificación— y no pintan nada.
 */
export function seVeLaCalificacion(status?: LeadStatus | null): status is LeadStatus {
    return status !== null && status !== undefined;
}

/**
 * Lo que el menú manda a guardar, saneado.
 *
 * Lo que llega del navegador no decide: `comoCalificacion` deja pasar las cinco
 * de la lista y **cualquier otra cosa la trata como «sin clasificar»**, que es
 * el lado seguro —se borra una calificación, que se vuelve a poner en un clic;
 * nunca se guarda un valor inventado que después ninguna pastilla sabe pintar
 * y que saldría en el CRM como una sexta columna que nadie sabe de dónde
 * salió—.
 *
 * @param valor       Lo que se eligió.
 * @param conocidas   Las calificaciones que la plataforma reconoce.
 */
export function comoCalificacion(
    valor: unknown,
    conocidas: readonly LeadStatus[],
): LeadStatus | null {
    return conocidas.includes(valor as LeadStatus) ? (valor as LeadStatus) : null;
}
