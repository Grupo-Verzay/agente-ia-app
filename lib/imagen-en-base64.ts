/**
 * Una imagen que viaja como `data:<tipo>;base64,<datos>` —la que sube el
 * navegador y la que devuelve Gemini— se parte y se arma aquí, con SU tipo.
 *
 * AI imágenes escribía `image/png` a mano en las dos puntas: la foto del
 * producto que se sube suele ser un JPEG, y Gemini puede devolver un JPEG. Con
 * el tipo equivocado la imagen se sigue viendo —el navegador mira los bytes—,
 * pero se le dice a Google que es otra cosa y la descarga sale con una
 * extensión que no es la suya. Puro: lo usan la acción y el banco.
 */

/** Los tipos de imagen que se aceptan tal cual; lo demás cae en PNG. */
const TIPOS_DE_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"] as const;

/** El tipo de una imagen, o PNG si no se reconoce. */
export function comoTipoDeImagen(tipo: unknown): string {
    const t = typeof tipo === "string" ? tipo.trim().toLowerCase() : "";
    if (t === "image/jpg") return "image/jpeg";
    return (TIPOS_DE_IMAGEN as readonly string[]).includes(t) ? t : "image/png";
}

/**
 * Parte un `data:` en su tipo y sus datos. Sin cabecera o sin datos devuelve
 * `datos` vacío: quien llama decide qué hacer con una imagen que no es.
 */
export function partirLaImagen(dataUrl: unknown): { tipo: string; datos: string } {
    if (typeof dataUrl !== "string") return { tipo: "image/png", datos: "" };
    const m = /^data:([^;,]+)?(?:;[^,]*)?,([\s\S]*)$/.exec(dataUrl.trim());
    if (!m) return { tipo: "image/png", datos: "" };
    return { tipo: comoTipoDeImagen(m[1]), datos: m[2] ?? "" };
}

/** Arma el `data:` de una imagen con su tipo. */
export function comoDataUrl(datos: string, tipo?: unknown): string {
    return `data:${comoTipoDeImagen(tipo)};base64,${datos}`;
}

/** La extensión del fichero de descarga, sacada del tipo del `data:`. */
export function laExtensionDeLaImagen(dataUrl: unknown): string {
    const { tipo } = partirLaImagen(dataUrl);
    if (tipo === "image/jpeg") return "jpg";
    return tipo.split("/")[1] ?? "png";
}
