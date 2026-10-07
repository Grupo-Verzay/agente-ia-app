/**
 * Qué se ve en grande y qué en miniatura en la sala de la videollamada con IA.
 * Pura: la sala solo le pasa lo que sabe y pinta lo que esto devuelve.
 *
 * Las reglas:
 * 1. Verzy va en GRANDE solo durante la presentación inicial. En cuanto
 *    termina (primera pantalla compartida, un asesor que toma la palabra, una
 *    reentrada o el tope de tiempo), ya no vuelve a crecer solo: queda en
 *    miniatura el resto de la reunión.
 * 2. Sin nada compartido (fuera de la presentación) va la PORTADA de Verzay a
 *    todo lo ancho, nunca el avatar ampliado.
 * 3. Si un asesor dijo «Verzy, yo sigo desde aquí»: su cámara ocupa el sitio de
 *    Verzy; si comparte pantalla, su pantalla en grande y su cámara en
 *    miniatura. Verzy no se ve hasta que lo llamen de nuevo.
 * 4. La cámara del CLIENTE no se pinta nunca.
 */

export type LoGrande = "avatar" | "pantalla-verzy" | "portada" | "asesor-camara" | "asesor-pantalla";
export type LoPequeno = "avatar" | "asesor-camara" | null;

export type EntradaDeLaDisposicion = {
    presentacionTerminada: boolean;
    /** ¿Verzy tiene una pantalla abierta (la que comparte o la última)? */
    pantallaVerzy: boolean;
    /** ¿Un asesor tomó la palabra («Verzy, yo sigo desde aquí»)? */
    asesorAlMando: boolean;
    asesor: { camara: boolean; pantalla: boolean };
};

export type Disposicion = { grande: LoGrande; mini: LoPequeno };

/** Lo que dura como mucho la presentación inicial con Verzy en grande. */
export const TOPE_DE_LA_PRESENTACION_MS = 120_000;

/** El texto de la portada que se ve cuando no se comparte nada. */
export const TEXTO_DE_LA_PORTADA = "Verzay — Soluciones Digitales con IA";

export function laDisposicion(e: EntradaDeLaDisposicion): Disposicion {
    if (e.asesorAlMando) {
        if (e.asesor.pantalla) return { grande: "asesor-pantalla", mini: e.asesor.camara ? "asesor-camara" : null };
        if (e.asesor.camara) return { grande: "asesor-camara", mini: null };
        return { grande: e.pantallaVerzy ? "pantalla-verzy" : "portada", mini: null };
    }
    if (e.pantallaVerzy) return { grande: "pantalla-verzy", mini: "avatar" };
    if (!e.presentacionTerminada) return { grande: "avatar", mini: null };
    return { grande: "portada", mini: "avatar" };
}
