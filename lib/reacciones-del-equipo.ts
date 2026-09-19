/**
 * Las reacciones del chat del equipo.
 *
 * Puro a propósito: lo que decide qué es una reacción válida tiene que poder
 * probarse sin levantar nada, porque **el emoji llega del navegador** y lo que
 * llega del navegador no decide lo que se guarda.
 *
 * # Por qué una tabla y no una columna
 *
 * Una reacción es de **una persona sobre un mensaje**, así que su llave
 * natural es la terna `(mensaje, persona, emoji)`. Metida en una columna del
 * mensaje —un JSON con la lista dentro— quitar la reacción de alguien sería
 * leer la fila, cambiarla y volver a escribirla: dos personas reaccionando a
 * la vez se pisarían y una de las dos desaparecería sin decir nada. Con una
 * fila por reacción eso lo resuelve Postgres con la clave primaria, que es
 * donde tiene que resolverse.
 */

/**
 * Los emojis que se ofrecen de un toque.
 *
 * Seis, los mismos que ofrece WhatsApp y por el mismo motivo: una reacción se
 * pone sin pensar, y una rejilla de trescientos convierte un gesto de un toque
 * en una decisión. Quien quiera otro lo tiene detrás del «+», con el mismo
 * selector de emojis que usa la caja de escribir.
 */
export const EMOJIS_RAPIDOS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/**
 * Cuántas reacciones distintas puede poner una persona en un mismo mensaje.
 *
 * No es una regla de producto, es un tope: sin él, quien quisiera podría
 * colgarle doscientos emojis a un mensaje ajeno y dejar la burbuja
 * inservible para todos. Cinco es más de lo que nadie usa y sigue siendo una
 * fila de chips que cabe.
 */
export const TOPE_POR_PERSONA = 5;

/**
 * Si eso que llega del navegador es un emoji con el que se puede reaccionar.
 *
 * Tres condiciones, y cada una cierra una cosa distinta:
 *
 * 1. **Lleva al menos un pictograma.** Es lo que lo hace una reacción y no
 *    otra cosa.
 * 2. **No lleva ni letras ni espacios.** Sin esto, «reaccionar» sería un
 *    segundo canal para escribir: un chip con una frase dentro, debajo del
 *    mensaje de otro y sin forma de borrarlo salvo por quien lo puso.
 * 3. **Es corto.** Un emoji compuesto —una familia, un pulgar con tono de
 *    piel— son varios puntos de código unidos por `ZWJ`; ocho caben de sobra
 *    y mil serían un texto disfrazado de emoji.
 *
 * Se comprueba **en el servidor**. Esconder los demás botones en la pantalla
 * no cierra la petición directa, que es la regla de siempre.
 */
export function esUnEmojiDeReaccion(texto: unknown): boolean {
    if (typeof texto !== "string") return false;
    const limpio = texto.trim();
    if (!limpio) return false;
    // En unidades UTF-16, que es lo que ocupa de verdad en la columna.
    if (limpio.length > 24) return false;
    // Y en puntos de código, que es lo que se ve. `👨‍👩‍👧‍👦` son siete.
    if (Array.from(limpio).length > 8) return false;
    if (/[\p{L}\s]/u.test(limpio)) return false;
    return /\p{Extended_Pictographic}/u.test(limpio);
}

/** El emoji tal y como se guarda, o `null` si no lo es. */
export function comoSeGuardaLaReaccion(texto: unknown): string | null {
    if (!esUnEmojiDeReaccion(texto)) return null;
    return (texto as string).trim();
}

/** Una fila de la tabla, tal cual sale de la base. */
export type FilaDeReaccion = {
    mensajeId: string;
    personaId: string;
    emoji: string;
};

/** Un emoji sobre un mensaje, ya agrupado, listo para pintar. */
export type ReaccionDeMensaje = {
    emoji: string;
    /** Quiénes, por id. Es el **detalle**: sin él el chip es un número. */
    quienes: string[];
    /** Si quien mira es uno de ellos. Decide si el chip va marcado. */
    mia: boolean;
};

/**
 * De filas sueltas a lo que pinta la burbuja.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **El orden es el de aparición**, no el alfabético ni el de cantidad. Con
 *    el orden por cantidad, un chip salta de sitio en cuanto alguien reacciona
 *    y se pulsa el que no era. Con el de aparición, lo que había sigue donde
 *    estaba y lo nuevo entra al final.
 * 2. **`quienes` se queda con los ids**, no con los nombres: quién es cada id
 *    lo sabe la pantalla, que ya tiene el mapa de nombres para las burbujas.
 *    Resolverlos aquí obligaría a pasar ese mapa hasta la base.
 */
export function agruparLasReacciones(
    filas: FilaDeReaccion[],
    yo: string,
): Map<string, ReaccionDeMensaje[]> {
    const porMensaje = new Map<string, ReaccionDeMensaje[]>();
    for (const fila of filas) {
        if (!fila?.mensajeId || !fila.emoji || !fila.personaId) continue;
        const lista = porMensaje.get(fila.mensajeId) ?? [];
        let grupo = lista.find((r) => r.emoji === fila.emoji);
        if (!grupo) {
            grupo = { emoji: fila.emoji, quienes: [], mia: false };
            lista.push(grupo);
        }
        if (!grupo.quienes.includes(fila.personaId)) grupo.quienes.push(fila.personaId);
        if (fila.personaId === yo) grupo.mia = true;
        porMensaje.set(fila.mensajeId, lista);
    }
    return porMensaje;
}

/**
 * Cuántas reacciones distintas tiene ya puestas una persona en un mensaje.
 *
 * Lo pregunta la base antes de meter una más. **Quitar no se cuenta**: se
 * mira solo al poner, porque quitar siempre tiene que poder hacerse — si no,
 * llegar al tope dejaría a alguien sin forma de deshacer lo que puso.
 */
export function cuantasTienePuestas(
    reacciones: ReaccionDeMensaje[] | undefined,
    yo: string,
): number {
    return (reacciones ?? []).filter((r) => r.quienes.includes(yo)).length;
}

/**
 * La misma alternancia que hace la base, pero sobre la lista que ya tiene el
 * navegador delante.
 *
 * Existe para que el chip se marque **al tocarlo** y no en la vuelta siguiente
 * del reloj, que son cinco segundos: una reacción es un gesto de un toque y un
 * toque que no responde se repite, o sea que se pone y se quita.
 *
 * Y vive **aquí, al lado de `agruparLasReacciones`**, y no suelta en la
 * pantalla, por el motivo de siempre: son dos formas de la misma regla —la del
 * servidor decide lo que se guarda, esta decide lo que se ve— y escritas en dos
 * sitios el día que se afine una la otra se queda atrás. Eso no se ve como un
 * error: se ve como un chip que se marca y se desmarca solo al refrescar.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El orden de aparición no se toca.** Quitar la última reacción de un
 *    emoji borra su grupo; poner una nueva lo añade **al final**. Reordenar
 *    aquí haría que el chip saltara de sitio justo mientras se pulsa, que es lo
 *    que el orden de aparición viene a evitar.
 * 2. **Se devuelve una lista nueva**, sin tocar la que llega: es estado de
 *    React, y mutarla deja la pantalla sin repintar.
 * 3. **El tope NO se aplica aquí.** Lo decide la base, que es la única que sabe
 *    lo que hay de verdad; si lo rechaza, quien llama devuelve la lista a como
 *    estaba. Comprobarlo también aquí sería una segunda regla que mantener a la
 *    par para no dejar poner algo que igualmente se iba a poder.
 */
export function alternarEnLaLista(
    reacciones: ReaccionDeMensaje[] | undefined,
    emoji: string,
    yo: string,
): ReaccionDeMensaje[] {
    const lista = (reacciones ?? []).map((r) => ({ ...r, quienes: [...r.quienes] }));
    const grupo = lista.find((r) => r.emoji === emoji);

    if (!grupo) {
        lista.push({ emoji, quienes: [yo], mia: true });
        return lista;
    }

    if (grupo.quienes.includes(yo)) {
        grupo.quienes = grupo.quienes.filter((q) => q !== yo);
        grupo.mia = false;
        return grupo.quienes.length ? lista : lista.filter((r) => r !== grupo);
    }

    grupo.quienes.push(yo);
    grupo.mia = true;
    return lista;
}
