/**
 * De donde sale la miniatura de una tarjeta de anuncio Click-to-WhatsApp.
 *
 * Un `externalAdReply` puede traer la imagen por TRES caminos, y no valen lo
 * mismo:
 *
 * | campo          | que es                          | caduca |
 * | -------------- | ------------------------------- | ------ |
 * | `thumbnail`    | los bytes, en base64            | **no** |
 * | `thumbnailUrl` | la miniatura en fbcdn           | si     |
 * | `mediaUrl`     | el MEDIO del anuncio, en fbcdn  | si     |
 *
 * Se piden en ese orden, y el orden es el arreglo:
 *
 * 1. **`thumbnail` primero, porque no caduca.** Antes se miraba
 *    `mediaUrl || thumbnail`, o sea que teniendo los bytes guardados se
 *    prefería un enlace firmado de Facebook que expira en horas. Pasado ese
 *    plazo la conversación enseñaba el icono roto del navegador con la imagen
 *    buena al lado, sin usar.
 * 2. **`thumbnailUrl` antes que `mediaUrl`**, porque es la miniatura y el otro
 *    es el medio del anuncio —que puede ser un vídeo, y un vídeo dentro de un
 *    `<img>` no se pinta nunca—.
 * 3. `mediaUrl` al final, que es lo único que se miraba.
 *
 * `thumbnailUrl` es además el campo que la App **ignoraba por completo**, y es
 * justo el que usan las líneas de Evolution: para Waha el backend lo mapea a
 * `mediaUrl` al normalizar (`normalizarAnuncio`), así que el lector se escribió
 * contra la forma de Waha y nadie lo comprobó contra la otra fuente. Es la
 * regla de CLAUDE.md sobre el id de los grupos, otra vez: **una forma de dato
 * se comprueba en TODAS sus fuentes.**
 *
 * Puro a proposito: entra el anuncio y sale una cadena para el `src`, o nada.
 * Que enseñar cuando no hay miniatura -o cuando la que hay no carga- es cosa
 * de quien pinta.
 */

/** Lo que interesa de un `externalAdReply`. Todo opcional y de tipo incierto: viene de fuera. */
export type AnuncioConMiniatura = {
  thumbnail?: unknown;
  thumbnailUrl?: unknown;
  thumbnailURL?: unknown;
  mediaUrl?: unknown;
  mediaURL?: unknown;
} | null | undefined;

/**
 * Un valor suelto convertido en algo que un `<img src>` pueda usar, o nada.
 *
 * Solo cuentan las cadenas. La miniatura viaja en bytes y, segun quien
 * serialice, puede llegar como base64 (cadena) o como lista de numeros; esa
 * lista no se pinta, y sin esta comprobacion acabaria en el `src` como
 * `data:image/jpeg;base64,1,2,3`, que es un icono roto con pasos extra.
 */
function comoImagen(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  if (!limpio) return undefined;
  if (limpio.startsWith('data:')) return limpio;
  if (/^https?:\/\//i.test(limpio)) return limpio;
  // Lo que queda son los bytes en base64. Ojo con darle otro trato a lo que
  // empieza por "/": el base64 de un JPEG empieza justo asi (`/9j/…`).
  return `data:image/jpeg;base64,${limpio}`;
}

/** La miniatura del anuncio, por orden de preferencia. `undefined` si no hay ninguna. */
export function miniaturaDelAnuncio(anuncio: AnuncioConMiniatura): string | undefined {
  if (!anuncio || typeof anuncio !== 'object') return undefined;
  return (
    comoImagen(anuncio.thumbnail) ??
    comoImagen(anuncio.thumbnailUrl) ??
    comoImagen(anuncio.thumbnailURL) ??
    comoImagen(anuncio.mediaUrl) ??
    comoImagen(anuncio.mediaURL)
  );
}
