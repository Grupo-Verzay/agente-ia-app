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
 * 5. Una vez que Verzy PIDIÓ compartir una pantalla (`yaSeCompartio`), aunque
 *    esa pantalla falle, se oculte o se corte, Verzy no vuelve a grande bajo
 *    ninguna circunstancia: sin pantalla va la portada y él en miniatura.
 */

export type LoGrande = "avatar" | "pantalla-verzy" | "portada" | "asesor-camara" | "asesor-pantalla";
export type LoPequeno = "avatar" | "asesor-camara" | null;

export type EntradaDeLaDisposicion = {
    presentacionTerminada: boolean;
    /** ¿Verzy pidió alguna vez compartir pantalla en esta reunión? Es fijo: no se apaga. */
    yaSeCompartio?: boolean;
    /** ¿Verzy tiene una pantalla abierta (la que comparte o la última)? */
    pantallaVerzy: boolean;
    /** ¿Un asesor tomó la palabra («Verzy, yo sigo desde aquí»)? */
    asesorAlMando: boolean;
    asesor: { camara: boolean; pantalla: boolean };
};

export type Disposicion = { grande: LoGrande; mini: LoPequeno };

/** Lo que dura como mucho la presentación inicial con Verzy en grande. */
export const TOPE_DE_LA_PRESENTACION_MS = 120_000;

/**
 * La pizarra que se ve cuando no se comparte nada: el NOMBRE y el ESLOGAN van
 * separados —el nombre grande, el eslogan debajo—, con el logo encima. Juntos
 * en una sola línea de texto («Verzay — …») no se leía como la marca.
 */
export const NOMBRE_DE_LA_PORTADA = "Verzay";
export const ESLOGAN_DE_LA_PORTADA = "Soluciones Digitales con IA";
/** El logo de la pizarra, servido desde `public/` (la sala es pública). */
export const LOGO_DE_LA_PORTADA = "/logo-agente.png";
/** Lo que dice la pizarra, entero (para lectores de pantalla y el banco). */
export const TEXTO_DE_LA_PORTADA = `${NOMBRE_DE_LA_PORTADA} — ${ESLOGAN_DE_LA_PORTADA}`;

export function laDisposicion(e: EntradaDeLaDisposicion): Disposicion {
    if (e.asesorAlMando) {
        if (e.asesor.pantalla) return { grande: "asesor-pantalla", mini: e.asesor.camara ? "asesor-camara" : null };
        if (e.asesor.camara) return { grande: "asesor-camara", mini: null };
        return { grande: e.pantallaVerzy ? "pantalla-verzy" : "portada", mini: null };
    }
    if (e.pantallaVerzy) return { grande: "pantalla-verzy", mini: "avatar" };
    if (!e.presentacionTerminada && !e.yaSeCompartio) return { grande: "avatar", mini: null };
    return { grande: "portada", mini: "avatar" };
}

/**
 * Dónde acaba lo grande de la sala: SIEMPRE encima de la barra de abajo
 * (80 px), donde viven los mandos y la miniatura de Verzy. Con `bottom-0`
 * la última franja de la pantalla compartida —la barra de escribir de un
 * chat, sus emojis— quedaba debajo de ellos.
 */
export const ABAJO_DE_LO_GRANDE = "bottom-20";

/**
 * Cómo se encaja la pantalla de Verzy en su caja: ENTERA y con su forma real
 * (`object-contain`), centrada. El servidor ya toma la forma de la caja
 * (`elTamanoDeLaPantalla`), así que en reposo la llena sin franjas; si la
 * forma no coincide, se ve completa antes que recortada (`cover`) o
 * deformada (`fill`).
 */
export const AJUSTE_DE_LA_PANTALLA = "h-full w-full object-contain object-center";
