/**
 * Editar y borrar un mensaje propio del chat del equipo.
 *
 * Puro: quién puede tocar qué se decide aquí y lo comprueban **la acción** —que
 * es la puerta de verdad— y la pantalla, que solo usa esto para no ofrecer un
 * botón que después da error.
 *
 * # Lo propio, y nada más
 *
 * La regla entera cabe en una línea: **se toca lo que se escribió uno mismo**.
 * No hay excepción para quien administra, y eso es a propósito — un
 * administrador ya lee los directos de su cuenta, y dejarle además reescribir
 * lo que dijo otro convierte el hilo en algo que no se puede leer como prueba
 * de nada.
 *
 * # Sin ventana de tiempo
 *
 * WhatsApp deja editar quince minutos. Aquí no hay plazo, y conviene que esté
 * escrito para no «arreglarlo» después: este hilo es interno y lo que se
 * corrige a los tres días es normalmente un dato —un número de cuenta, una
 * hora— que sigue haciendo falta bien. Y lo que la ventana protege —que nadie
 * reescriba la historia sin que se note— ya lo cubre la marca de editado, que
 * se queda puesta para siempre.
 */

/** Lo mínimo que hay que saber de un mensaje para decidir. */
export type MensajeQueSeToca = {
    autorId: string;
    /** Cuándo se borró, si se borró. Un borrado ya no se toca más. */
    borradoEn?: string | null;
    /** El registro de una llamada no es un mensaje que alguien escribiera. */
    llamada?: { fin: string; segundos: number } | null;
};

/**
 * Si esta persona puede EDITAR este mensaje.
 *
 * Cuatro condiciones, y las cuatro cierran algo distinto:
 *
 * 1. **Es suyo.** Es la regla entera.
 * 2. **Puede escribir en ese canal.** Editar es escribir: sin esto, alguien
 *    que dejó de pertenecer a un canal seguiría reescribiendo dentro.
 * 3. **No está borrado.** Un borrado no tiene texto que corregir, y dejar
 *    editarlo sería una forma de resucitarlo.
 * 4. **No es una llamada.** Ese mensaje no lo escribió nadie: lo escribió el
 *    registro de la llamada, y editarlo sería cambiar un hecho.
 */
export function sePuedeEditar(input: {
    mensaje: MensajeQueSeToca;
    yo: string;
    puedoEscribir: boolean;
}): boolean {
    const { mensaje, yo, puedoEscribir } = input;
    if (!yo || mensaje.autorId !== yo) return false;
    if (!puedoEscribir) return false;
    if (mensaje.borradoEn) return false;
    if (mensaje.llamada) return false;
    return true;
}

/**
 * Si esta persona puede BORRAR este mensaje.
 *
 * Lo mismo que editar salvo una cosa: **una llamada sí se puede borrar**. No
 * se está cambiando lo que pasó, se está quitando una línea del hilo — y quien
 * llamó es quien puede quitarla.
 */
export function sePuedeBorrar(input: {
    mensaje: MensajeQueSeToca;
    yo: string;
    puedoEscribir: boolean;
}): boolean {
    const { mensaje, yo, puedoEscribir } = input;
    if (!yo || mensaje.autorId !== yo) return false;
    if (!puedoEscribir) return false;
    if (mensaje.borradoEn) return false;
    return true;
}

/**
 * Lo que se lee en el sitio de un mensaje borrado.
 *
 * **El mensaje no desaparece: deja su señal.** Quitando la burbuja entera, una
 * conversación de tres se quedaría con huecos que nadie sabe explicar —«¿me
 * contestó y no me llegó?»— y una respuesta que citaba ese mensaje hablaría
 * sola. Con la señal, lo que se lee es lo que pasó.
 */
export const LO_QUE_QUEDA_AL_BORRAR = "Mensaje eliminado";

/**
 * Si un mensaje editado tiene que decir que lo está.
 *
 * Siempre que haya marca, sin plazo ni excepción: es lo único que separa
 * corregir una errata de reescribir lo que uno dijo, y quien lo lee tiene
 * derecho a saber cuál de las dos fue.
 */
export function seEditó(mensaje: { editadoEn?: string | null }): boolean {
    return Boolean(mensaje.editadoEn);
}
