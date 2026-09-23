/**
 * Voz o video: en qué modo va una llamada del chat de equipo, y qué mandos
 * ofrece cada uno.
 *
 * Puro a propósito: lo usan la ventana de la llamada (cliente), las acciones
 * (servidor) y el banco. Con la lista de mandos escrita en la pantalla, el día
 * que se añada uno se añade en un modo y no en el otro — que es exactamente
 * como apareció el botón de compartir pantalla en una llamada de voz.
 *
 * # Las tres reglas
 *
 * 1. **Una llamada nace en el modo en que se lanzó.** De voz, arranca en voz;
 *    una videollamada arranca ya en video, con la cámara encendida.
 * 2. **De voz se SUBE a video, y solo si el otro acepta.** Se pide, el otro ve
 *    la petición y decide. Hasta que no acepte, nadie enciende la cámara: una
 *    llamada de voz no puede convertirse en video por decisión de uno solo.
 * 3. **Compartir pantalla es de video y de nada más.** En modo voz no se pinta
 *    —ni apagado—: una llamada de voz no tiene dónde enseñar una pantalla.
 *
 * Y lo que hace que subir no corte nada: la conexión negocia audio y video en
 * `sendrecv` desde la primera oferta (`useMediosDeLlamada`), así que pasar a
 * video es encender la cámara dentro de la MISMA conexión. No hay otra oferta,
 * ni otra llamada, ni un segundo de silencio.
 */

export const MODOS = ["voz", "video"] as const;
export type ModoDeLlamada = (typeof MODOS)[number];

/**
 * Lo que llega de fuera —una columna, un evento, un parámetro— pasa por aquí.
 * Lo que no se reconozca es **voz**: equivocarse hacia video le encendería la
 * cámara a quien solo quería hablar.
 */
export function comoModo(v: unknown): ModoDeLlamada {
    return v === "video" ? "video" : "voz";
}

export type MandoDeLaLlamada = "micro" | "camara" | "pantalla" | "subirAVideo" | "colgar";

/**
 * Los mandos de una llamada ya conectada, en el orden en que se pintan.
 *
 * Mientras suena o conecta no hay ninguno más que colgar (o contestar, que es
 * de otra fila de botones): el micro todavía no está puesto.
 */
export function losMandosDeLaLlamada(
    modo: ModoDeLlamada,
    conectada: boolean,
): MandoDeLaLlamada[] {
    if (!conectada) return ["colgar"];
    return modo === "video"
        ? ["micro", "camara", "pantalla", "colgar"]
        : ["micro", "subirAVideo", "colgar"];
}

/**
 * En qué punto está una petición de pasar a video, visto desde una punta.
 *
 * - `nada`: no hay petición.
 * - `esperando`: la pedí yo y el otro todavía no contesta.
 * - `decidir`: la pidió el otro y me toca aceptar o no.
 *
 * En modo video no hay nada que pedir: una petición que se quede colgada de
 * una llamada que ya está en video no significa nada y no se enseña.
 */
export type PeticionDeVideo = "nada" | "esperando" | "decidir";

export function laPeticionDeVideo(
    modo: ModoDeLlamada,
    pedidoPor: string | null | undefined,
    yo: string,
): PeticionDeVideo {
    if (modo === "video" || !pedidoPor) return "nada";
    return pedidoPor === yo ? "esperando" : "decidir";
}

/**
 * Si quien pidió el video ve que se lo rechazaron.
 *
 * No hay columna de «rechazado»: se deduce de que **estaba esperando** y la
 * petición desapareció **sin** que la llamada pasara a video. Una columna más
 * sería un dato que alguien tiene que acordarse de limpiar.
 */
export function meRechazaronElVideo(
    antes: PeticionDeVideo,
    ahora: PeticionDeVideo,
    modoAhora: ModoDeLlamada,
): boolean {
    return antes === "esperando" && ahora === "nada" && modoAhora === "voz";
}

/** Cómo se llama la llamada, en la pantalla y en el registro del directo. */
export function nombreDelModo(modo: ModoDeLlamada): string {
    return modo === "video" ? "Videollamada" : "Llamada de voz";
}
