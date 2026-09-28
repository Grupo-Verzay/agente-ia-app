/**
 * Qué ofrece el grabador de audio en cada momento. **Uno para toda la
 * plataforma**: Macros, los dos editores de flujos, Recordatorios, Multiagenda
 * y la biblioteca de Seguimientos del CRM pintan `GrabadorDeAudio`, y los
 * mandos salen de aquí. Con la lista escrita en cada pantalla, una acabaría
 * sin «Pausar» y la otra sin «Descartar», que es justo la asimetría que esto
 * viene a quitar.
 *
 * Puro: sin navegador, sin base. Lo prueba el banco.
 */

export type EstadoDelGrabador = "inactivo" | "grabando" | "pausado" | "lista";

export type MandoDelGrabador =
    | "grabar"
    | "pausar"
    | "reanudar"
    | "detener"
    | "descartar"
    | "usar"
    | "grabar-otra";

export function elEstadoDelGrabador(e: {
    grabando: boolean;
    pausado: boolean;
    hayGrabacion: boolean;
}): EstadoDelGrabador {
    if (e.grabando) return e.pausado ? "pausado" : "grabando";
    if (e.hayGrabacion) return "lista";
    return "inactivo";
}

/**
 * Los mandos, en el orden en que se pintan. Detener SIEMPRE está mientras hay
 * micrófono abierto —grabando o en pausa—: una grabación que solo se puede
 * parar reanudándola primero es un micrófono que se queda encendido.
 */
export function losMandosDelGrabador(estado: EstadoDelGrabador): MandoDelGrabador[] {
    switch (estado) {
        case "grabando":
            return ["pausar", "detener", "descartar"];
        case "pausado":
            return ["reanudar", "detener", "descartar"];
        case "lista":
            return ["usar", "grabar-otra", "descartar"];
        default:
            return ["grabar"];
    }
}

/** 0:07, 1:05, 12:30. Nunca un número negativo ni `NaN`. */
export function comoSeLeeElTiempo(segundos: number): string {
    const s = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * El `mimeType` de `MediaRecorder` lleva los códecs detrás
 * (`audio/webm;codecs=opus`). **Lo que se sube va sin ellos**: la validación
 * de los flujos compara el tipo del archivo contra una lista (`audio/webm`,
 * `audio/ogg`…) y con los códecs dentro rechazaba la grabación como «tipo de
 * archivo no válido».
 */
export function elMimeSinCodecs(mime: string): string {
    const base = (mime || "").split(";")[0].trim().toLowerCase();
    return base || "audio/webm";
}
