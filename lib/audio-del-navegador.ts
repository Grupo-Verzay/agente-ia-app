/**
 * Lo que sabe de audio el NAVEGADOR, y nada más.
 *
 * Vive aquí y no dentro de Chats porque ahora lo usan **dos pantallas**: la
 * bandeja y el chat del equipo. Con una copia en cada sitio, el día que se
 * afine algo —el formato que se elige, cómo se lee el blob— se afina en una y
 * la otra se queda atrás; y eso no se ve como un error, se ve como «en el chat
 * del equipo a veces no funciona».
 *
 * Puro y sin `server-only`: son helpers de navegador, sin base y sin sesión.
 */

export type RecordedAudioData = {
    /** Base64 puro sin prefijo */
    base64Pure: string;
    /** Data URL completa para el reproductor de audio */
    dataUrlWithPrefix: string;
    mimetype: string;
    durationSecs: number;
};

export function base64FromBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Error leyendo blob"));
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const commaIndex = dataUrl.indexOf(",");
            if (commaIndex === -1) return reject(new Error("Formato de Data URL inválido."));
            resolve(dataUrl.substring(commaIndex + 1));
        };
        reader.readAsDataURL(blob);
    });
}

/**
 * La extensión que le toca a un `mimeType` de grabación.
 *
 * **El nombre del archivo es lo que le dice el formato a OpenAI**, así que esto
 * no es cosmético: subir un opus llamándolo `.bin` es una transcripción que
 * falla sin decir por qué. Y el `mimeType` de `MediaRecorder` viene con sus
 * códecs detrás (`audio/webm;codecs=opus`), así que se corta por el `;`.
 */
export function extensionDelAudio(mimetype: string): string {
    const base = (mimetype || "").split(";")[0].trim().toLowerCase();
    if (base === "audio/ogg") return "ogg";
    if (base === "audio/mpeg" || base === "audio/mp3") return "mp3";
    if (base === "audio/mp4" || base === "audio/m4a") return "m4a";
    if (base === "audio/wav" || base === "audio/x-wav") return "wav";
    return "webm";
}

/**
 * De lo grabado a un `File` que se pueda subir.
 *
 * Se reconstruye desde el base64 que ya trae `useAudioRecording` en vez de
 * pedirle el blob: así el hook se usa **tal cual**, sin tocarle nada para este
 * caso, que es lo que mantiene una sola copia.
 */
export function comoArchivoDeAudio(grabado: RecordedAudioData, nombre?: string): File {
    const crudo = atob(grabado.base64Pure);
    const bytes = new Uint8Array(crudo.length);
    for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
    const ext = extensionDelAudio(grabado.mimetype);
    return new File([bytes], nombre ?? `nota-${Date.now()}.${ext}`, {
        type: grabado.mimetype,
    });
}
