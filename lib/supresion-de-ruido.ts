/**
 * La supresión de ruido del micrófono en una videollamada.
 *
 * Se procesa EN EL NAVEGADOR sobre la pista del micrófono: es la misma
 * cancelación de ruido que WebRTC usa para las llamadas, encendida con la
 * restricción `noiseSuppression` de `getUserMedia`. No añade servidor y **no
 * toca la malla** —la pista sigue siendo la misma, solo cambia su procesado—,
 * así que activarla o quitarla no obliga a renegociar nada. Solo cuando el
 * navegador no deja cambiarla en caliente se vuelve a pedir el micro y se
 * empuja la pista nueva con `replaceTrack`, que también está dentro de una
 * conexión ya negociada.
 *
 * Aquí vive lo que se puede probar sin navegador: la preferencia que se
 * recuerda, la restricción de audio que se le pasa al micrófono y si un
 * `applyConstraints` de verdad prendió.
 */

/**
 * Encendida por defecto: es lo que ya hace el navegador cuando se pide
 * `audio: true` sin más, y lo que quiere la inmensa mayoría en una reunión.
 * Apagarla es una decisión; no haberla tocado, no.
 */
export const SUPRESION_POR_DEFECTO = true;

/**
 * La llave es del NAVEGADOR, no de la persona: la supresión es una preferencia
 * del micrófono de este equipo —como el permiso de los avisos—, y a una reunión
 * se entra también sin cuenta por el enlace público, donde no hay persona a la
 * que colgarla.
 */
const LLAVE = "verzay:supresion-de-ruido";

export function leerLaSupresion(): boolean {
    try {
        const v = window.localStorage.getItem(LLAVE);
        if (v === "1") return true;
        if (v === "0") return false;
        // Ni escrito ni reconocible —un valor de otra versión, algo a medias—:
        // se cae al valor por defecto (encendida), que es el lado seguro.
        return SUPRESION_POR_DEFECTO;
    } catch {
        // Ventana privada o almacenamiento bloqueado: se cae al valor por
        // defecto en vez de tumbar la sala.
        return SUPRESION_POR_DEFECTO;
    }
}

export function guardarLaSupresion(activada: boolean): void {
    try {
        window.localStorage.setItem(LLAVE, activada ? "1" : "0");
    } catch {
        // Si no se puede guardar, la elección vale para esta reunión y ya.
        // Peor sería tumbar el botón por no poder recordarla.
    }
}

/**
 * La restricción con la que se pide —o se reajusta— el micrófono.
 *
 * Solo toca `noiseSuppression`: el eco y el control de ganancia se quedan con
 * el valor por defecto del navegador, que es lo que ya había. Tocar los tres
 * cambiaría un comportamiento que nadie pidió.
 */
export function laRestriccionDeAudio(activada: boolean): MediaTrackConstraints {
    return { noiseSuppression: activada };
}

/**
 * ¿El `applyConstraints` de verdad dejó la supresión como se pedía?
 *
 * `applyConstraints` no lanza cuando el navegador ignora `noiseSuppression`
 * sobre una pista viva, así que hay que MIRAR lo que quedó. Un `undefined`
 * —el navegador no dice cómo quedó— NO cuenta como fallo: hay navegadores que
 * no exponen el ajuste aunque lo hayan aplicado, y re-pedir el micro en ese
 * caso sería un corte de audio en cada pulsación para nada. Solo cuenta como
 * fallo cuando el navegador dice, en claro, que quedó al revés.
 */
export function seAplico(
    ajusteObtenido: boolean | undefined,
    deseado: boolean,
): boolean {
    if (ajusteObtenido === undefined) return true;
    return ajusteObtenido === deseado;
}
