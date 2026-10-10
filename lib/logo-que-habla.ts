/**
 * Cómo se ve Verzy con el motor propio: el LOGO de Verzay como participante,
 * igual que una llamada de WhatsApp con la cámara apagada enseña la foto de
 * perfil. Mientras Verzy habla, el logo «respira» con su voz: crece un poco y
 * le salen anillos suaves; callada, queda quieta.
 *
 * El dibujo es un VIDEO (un lienzo que se pasa a pista con `captureStream`):
 * la sala lo pinta en el mismo recuadro donde iba la cara de Tavus y la
 * grabación lo recoge igual, sin una regla nueva de disposición.
 *
 * Puro: las cuentas del dibujo. El lienzo vive en `components/videollamada`.
 */

/** El tamaño del video del logo (16:9, como la cara de Tavus). */
export const ANCHO_DEL_LOGO = 640;
export const ALTO_DEL_LOGO = 360;
/** Cuadros por segundo del dibujo: de sobra para un latido suave. */
export const CUADROS_DEL_LOGO = 24;

/** Cuánto pesa lo nuevo frente a lo de antes: sube rápido, baja despacio (no parpadea). */
export const SUBIDA = 0.5;
export const BAJADA = 0.12;
/** Por debajo de esto es silencio (ruido de la línea). */
export const UMBRAL_DE_VOZ = 0.02;
/** Cuánto crece el logo como mucho con la voz más fuerte. */
export const CRECIMIENTO_MAXIMO = 0.12;

/** El nivel de la voz (0–1) a partir de las muestras del analizador (RMS de bytes centrados en 128). */
export function elNivelDeLaVoz(muestras: ArrayLike<number>): number {
    if (!muestras.length) return 0;
    let suma = 0;
    for (let i = 0; i < muestras.length; i++) {
        const v = (Number(muestras[i]) - 128) / 128;
        suma += v * v;
    }
    const rms = Math.sqrt(suma / muestras.length);
    // La voz hablada rara vez pasa de 0,3 de RMS: se estira para usar todo el rango.
    return Math.max(0, Math.min(1, rms * 3.2));
}

/** El nivel suavizado de un cuadro al siguiente. */
export function suavizar(anterior: number, actual: number): number {
    const peso = actual > anterior ? SUBIDA : BAJADA;
    const v = anterior + (actual - anterior) * peso;
    return v < 0.001 ? 0 : v;
}

export type CuadroDelLogo = {
    /** Escala del logo (1 = quieto). */
    escala: number;
    /** Opacidad de los anillos (0 = sin anillos). */
    anillos: number;
    /** ¿Se ve hablando? Lo usa la prueba. */
    hablando: boolean;
};

/** Cómo se dibuja el logo con ese nivel de voz (ya suavizado). */
export function elCuadroDelLogo(nivel: number): CuadroDelLogo {
    const n = Math.max(0, Math.min(1, Number(nivel) || 0));
    const hablando = n > UMBRAL_DE_VOZ;
    return {
        escala: 1 + (hablando ? n * CRECIMIENTO_MAXIMO : 0),
        anillos: hablando ? Math.min(0.55, 0.15 + n * 0.6) : 0,
        hablando,
    };
}
