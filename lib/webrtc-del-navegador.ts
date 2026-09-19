/**
 * Lo que las dos pantallas de WebRTC de esta App necesitan del navegador.
 *
 * Son dos —la llamada de uno a uno del directo y la sala de video de hasta
 * cuatro— y esto es lo que comparten de verdad. Copiado, el día que se afine el
 * plazo de recolección se afina en una y la otra se queda atrás.
 */

/**
 * Cuánto se espera como mucho a que el navegador termine de recolectar.
 *
 * El tope **no es un lujo**: con una red que no contesta al STUN,
 * `iceGatheringState` puede no llegar nunca a `complete` y la oferta no saldría
 * jamás — la llamada se quedaría «preparando» para siempre y sin decir por qué.
 * Dos segundos y medio es lo que ya usaba `CallDialog` en producción.
 */
export const ESPERA_DE_CANDIDATOS_MS = 2_500;

/**
 * Esperar a que ICE termine, con tope.
 *
 * Es lo que hace que esta App pueda señalizar por la base con un reloj: se
 * espera a tener **todos** los candidatos y se manda **una sola** oferta
 * (*non-trickle*), en vez de un goteo que un reloj de segundos no podría
 * seguir.
 *
 * Y el `once: true` del oyente no basta por sí solo: `icegatheringstatechange`
 * salta también en `gathering`, así que sin comprobar el estado dentro se
 * resolvería en el primer cambio y la oferta saldría a medio recolectar — una
 * llamada que conecta a veces, según lo rápida que sea la red.
 */
export function esperarLosCandidatos(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();

        let acabado = false;
        const terminar = () => {
            if (acabado) return;
            acabado = true;
            pc.removeEventListener("icegatheringstatechange", alCambiar);
            clearTimeout(tope);
            resolve();
        };
        const alCambiar = () => {
            if (pc.iceGatheringState === "complete") terminar();
        };

        const tope = setTimeout(terminar, ESPERA_DE_CANDIDATOS_MS);
        pc.addEventListener("icegatheringstatechange", alCambiar);
    });
}
