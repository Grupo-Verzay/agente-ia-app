/**
 * **Quién paga la transcripción de una llamada: la MISMA cuenta que pagó la
 * llamada.**
 *
 * Puro a propósito, como el resto de lo que decide sobre una grabación: de aquí
 * tiran la maquinaria del servidor y el banco, y así la decisión se prueba sin
 * levantar nada.
 *
 * # El fallo, y por qué no era «la cuenta madre»
 *
 * Se reportó como «la transcripción falla con *No hay créditos suficientes:
 * hacen falta 14 y quedan 0* aunque la cuenta desde la que salió la llamada sí
 * tiene créditos», y la sospecha era que se estaba leyendo el saldo de la madre.
 * La causa es más de fondo, y es por eso que arreglarlo mirando a la madre no
 * habría servido de nada:
 *
 * > **La cuenta que paga una llamada y la cuenta bajo la que queda su fila se
 * > resuelven con DOS preguntas distintas, y el dato que las une —
 * > `User.astra_calls_sid`— no es único.**
 *
 * | quién | cómo resuelve la cuenta |
 * | --- | --- |
 * | el **cobrador** de la llamada (wacalls → el backend) | `WHERE astra_calls_sid = <sid>` |
 * | la **App**, al llamar | el dueño de la línea, y de ahí `elSidDe(cuenta)` |
 * | la **transcripción**, hasta ahora | el dueño de la FILA de `chat_messages` |
 *
 * Las dos primeras son **inversas de la misma columna**, y una inversa solo es
 * una función cuando la columna es única. `astra_calls_sid` es un `String?`
 * pelado: **sin índice único y sin índice de ninguna clase**. Así que dos
 * cuentas pueden llevar el mismo sid, y entonces el `LIMIT 1` **sin `ORDER BY`**
 * de los cuatro sitios del backend que hacen esa consulta devuelve *una
 * cualquiera* — y puede no ser la misma en dos consultas seguidas.
 *
 * Resultado: la llamada la cobra la cuenta que el índice haya devuelto y la
 * transcripción mira la bolsa del dueño de la fila. Cuando esa segunda cuenta no
 * tiene fila en `ia_credits`, `losCreditosQueQuedan` devuelve **0** —que es lo
 * correcto para ella— y sale «quedan 0» sobre una llamada que acabó de pagarse
 * con créditos de verdad.
 *
 * # La regla
 *
 * > **Quien paga la transcripción es el dueño del `astraSid` con el que se lanzó
 * > la llamada**, que es la definición literal de «quien pagó la llamada»: es la
 * > misma llave y el mismo desempate que usa el cobrador. Y cuando ese sid no
 * > resuelve a nadie —una llamada de Meta, una fila vieja sin el par de ids— se
 * > cae al dueño de la fila, que es lo que se hacía.
 *
 * Así las dos no pueden discrepar **por construcción**, y no porque dos sitios
 * se acuerden de hacer lo mismo.
 */

/** De dónde salió la cuenta que paga. Se escribe en el registro. */
export type OrigenDelPagador =
    /** El dueño del `astraSid`: quien pagó la llamada. */
    | "sid"
    /** No hay sid, o no resuelve a nadie: el dueño de la fila, como siempre. */
    | "fila"
    /** El sid resuelve a una cuenta de FUERA de la familia: no se le cobra. */
    | "ajena";

export type ElQuePaga = {
    cuentaId: string;
    origen: OrigenDelPagador;
    /** La cuenta del sid cuando NO se sigue, para poder decirlo. */
    descartada?: string;
};

/**
 * Decide a qué cuenta se le lee el saldo y se le cobra.
 *
 * `familiaDeLaFila` son las cuentas de la familia del dueño de la fila
 * (`laFamiliaDeLaCuenta`), y es una **guarda**, no el criterio: el sid se sigue
 * porque es quien pagó, y la familia solo impide cobrarle a un extraño si algún
 * día dos cuentas sin relación comparten sid. Equivocarse hacia «la fila» cuesta
 * el fallo que se acaba de arreglar; equivocarse hacia «una cuenta cualquiera»
 * le gasta los créditos a alguien que no tuvo nada que ver.
 */
export function laCuentaQuePaga(input: {
    /** El dueño de la fila de `chat_messages`. Nunca vacío. */
    cuentaDeLaFila: string;
    /** El dueño del `astraSid`, ya resuelto. `null` = no se sabe. */
    cuentaDelSid: string | null;
    /** La familia del dueño de la fila, él incluido. */
    familiaDeLaFila: readonly string[];
}): ElQuePaga {
    const fila = String(input.cuentaDeLaFila ?? "").trim();
    const delSid = String(input.cuentaDelSid ?? "").trim();

    if (!delSid) return { cuentaId: fila, origen: "fila" };
    // El caso normal: el sid es de la misma cuenta bajo la que quedó la fila.
    // No hay nada que decidir y no se dice nada, que es lo que mantiene el
    // registro legible.
    if (delSid === fila) return { cuentaId: fila, origen: "fila" };

    // Una familia que no se pudo leer llega vacía (`laFamiliaDeLaCuenta` se cae
    // al lado seguro). Sin ella no se puede afirmar que el sid sea de la casa,
    // así que se queda con la fila: se ve de menos, nunca de más.
    if (!input.familiaDeLaFila.includes(delSid)) {
        return { cuentaId: fila, origen: "ajena", descartada: delSid };
    }
    return { cuentaId: delSid, origen: "sid" };
}
