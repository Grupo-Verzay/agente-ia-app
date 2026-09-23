/**
 * El reproductor del detalle de una llamada: cuánto dura y cómo se lee.
 *
 * Un `<audio>` nativo marca «0:00 / 0:00» hasta que el navegador baja los
 * metadatos, y con `preload="none"` —o con un webm grabado en vivo, que no
 * declara su duración en la cabecera— eso es HASTA PULSAR PLAY. Desde fuera
 * se lee como una grabación vacía.
 *
 * La duración ya se sabe: es la de la columna Duración (`durationSecs`), que
 * sale del propio WAV al procesarlo. Así que el total se toma de ahí y el del
 * navegador solo se usa si la fila no la trae. Las dos columnas dicen lo mismo
 * porque salen del mismo número.
 *
 * Puro, para que el banco lo ejerza sin navegador.
 */

/** El total que enseña el reproductor, en segundos. Nunca `NaN` ni `Infinity`. */
export function laDuracionDelReproductor(
  durationSecs: number | null | undefined,
  audioDuration: number | null | undefined,
): number {
  if (typeof durationSecs === 'number' && Number.isFinite(durationSecs) && durationSecs > 0) {
    return durationSecs;
  }
  // Un webm sin cabecera de duración da `Infinity`: eso es «no se sabe», no un total.
  if (typeof audioDuration === 'number' && Number.isFinite(audioDuration) && audioDuration > 0) {
    return audioDuration;
  }
  return 0;
}

/** «m:ss», o «h:mm:ss» a partir de una hora. Lo que no es un número es «0:00». */
export function elTiempoDelReproductor(segundos: number | null | undefined): string {
  const s = typeof segundos === 'number' && Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const ss = String(r).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}
