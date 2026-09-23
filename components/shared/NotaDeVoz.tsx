'use client';

import React from 'react';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Cómo se pinta una nota de voz. UNA sola pieza, y la usan las dos pantallas
 * que enseñan audio grabado: la burbuja de Chats (`MediaRenderer`) y el
 * detalle de una llamada de CRM › Llamadas.
 *
 * El detalle llegó a tener su reproductor propio —una barra larga con el
 * tiempo al lado— y se leía como otra cosa. Con una copia en cada pantalla, el
 * día que se afine una la otra se queda atrás; por eso el marco, el ancho, el
 * icono y el `<audio>` salen de aquí, sin excepciones de tamaño ni de color.
 *
 * # La duración, desde que se abre
 *
 * `preload="metadata"`: el navegador baja la cabecera y pinta el total sin
 * pulsar play. Con un WAV basta. Un webm grabado en vivo —las llamadas de
 * Meta, grabadas en el navegador— NO declara su duración en la cabecera y el
 * navegador dice `Infinity`, o sea «0:00». Para ese caso se usa el truco de
 * siempre: se busca al final del todo, el navegador calcula la duración de
 * verdad (`durationchange`) y se vuelve al principio. Solo corre cuando la
 * duración NO se sabe, así que un WAV o un ogg no pasan por aquí.
 */

/** El marco de un adjunto de la burbuja; lo comparten la nota y el documento. */
export const MARCO_DE_UN_ADJUNTO = 'my-1 rounded-md overflow-hidden border dark:border-gray-600';
/** El ancho de una nota de voz (y de un documento), el mismo en todas partes. */
export const ANCHO_DE_LA_NOTA = 'w-[350px] max-w-full';

/** Busca el final para que el navegador calcule una duración que no declara. */
export function pedirLaDuracionDeVerdad(audio: HTMLAudioElement): void {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return;
  if (audio.dataset.buscandoDuracion === '1') return;
  audio.dataset.buscandoDuracion = '1';
  const alSaber = () => {
    if (!Number.isFinite(audio.duration)) return;
    audio.removeEventListener('durationchange', alSaber);
    delete audio.dataset.buscandoDuracion;
    try {
      audio.currentTime = 0;
    } catch {
      /* el reproductor ya se desmontó */
    }
  };
  audio.addEventListener('durationchange', alSaber);
  try {
    audio.currentTime = 1e101;
  } catch (err) {
    audio.removeEventListener('durationchange', alSaber);
    delete audio.dataset.buscandoDuracion;
    console.warn('[nota de voz] no se pudo calcular la duracion del audio', err);
  }
}

export function NotaDeVoz({
  src,
  reproducido = false,
  onAbrir,
}: {
  src: string;
  /** Azul cuando el contacto la escuchó (Chats). */
  reproducido?: boolean;
  /** Abre el visor (Chats). Sin él, el micrófono es solo el icono. */
  onAbrir?: () => void;
}) {
  const colorDelMic = reproducido
    ? 'text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300'
    : 'text-gray-500 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400';
  const rotulo = reproducido ? 'Reproducido por el contacto' : 'Abrir reproductor';

  return (
    <div
      className="p-2 bg-gray-50/90 dark:bg-gray-700 flex items-center gap-2 border border-gray-200/70 dark:border-gray-600 rounded-lg"
      data-nota-de-voz
    >
      {/*
        El micrófono es el tercer estado de una nota de voz, como en
        WhatsApp: azul cuando el contacto la escuchó. No es lo mismo que
        las dos palomitas azules —eso es que abrió el chat—, y por eso se
        dice aquí y no allí. Lo que hace se lee al posarse encima.
      */}
      {onAbrir ? (
        <button
          type="button"
          onClick={onAbrir}
          className={cn('flex-shrink-0 transition-colors', colorDelMic)}
          title={rotulo}
          aria-label={rotulo}
        >
          <Mic className="w-5 h-5" />
        </button>
      ) : (
        <span className={cn('flex-shrink-0 transition-colors', colorDelMic)} aria-hidden>
          <Mic className="w-5 h-5" />
        </span>
      )}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        src={src}
        controls
        className="flex-1 h-8"
        preload="metadata"
        onLoadedMetadata={(e) => pedirLaDuracionDeVerdad(e.currentTarget)}
      />
    </div>
  );
}

/** La nota con su marco y su ancho, para pintarla fuera de una burbuja. */
export function NotaDeVozSuelta(props: React.ComponentProps<typeof NotaDeVoz>) {
  return (
    <div className={cn(MARCO_DE_UN_ADJUNTO, ANCHO_DE_LA_NOTA)}>
      <NotaDeVoz {...props} />
    </div>
  );
}
