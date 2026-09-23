'use client';

import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SafeImage } from '@/components/custom/SafeImage';
import { cn } from '@/lib/utils';
import type { MediaData } from './chat-message-types';
import { MediaViewer, useMediaGallery } from './media-viewer';
import { DocumentCard } from './DocumentCard';
import { NotaDeVoz, MARCO_DE_UN_ADJUNTO, ANCHO_DE_LA_NOTA } from '@/components/shared/NotaDeVoz';

/**
 * El ancho de un adjunto, que es tambien el del PIE que lo acompana.
 *
 * El texto que acompana a una foto no tenia tope, asi que estiraba la burbuja
 * hasta donde llegara la frase y la foto quedaba flotando en una caja mucho mas
 * ancha que ella. Dandole el mismo tope, el texto salta de linea justo donde
 * acaba la imagen y la burbuja mide lo que mide la foto.
 *
 * Vive aqui y se exporta para que sea UN solo valor: si se cambia el ancho del
 * adjunto y el del pie se queda con el viejo, vuelve el desajuste.
 *
 * Para un documento y un audio el ancho es FIJO, no `w-full max-w-[350px]`.
 * `w-full` es el 100% de la BURBUJA, y la burbuja mide lo que mide su
 * contenido: la tarjeta de un PDF con nombre largo salia a 350 px y la del
 * mismo PDF con nombre corto -o la que llega sin nombre, rotulada "Documento
 * PDF"- salia visiblemente mas estrecha. Dos tarjetas del mismo tipo con
 * anchos distintos en la misma conversacion, una entrando y otra saliendo.
 *
 * Fijo y con `max-w-full`, para que en un movil se encoja en vez de salirse.
 * Una imagen o un video NO llevan ancho fijo: cada uno se pinta con su forma.
 */
export function anchoDelAdjunto(tipo: MediaData['type']): string {
  return tipo === 'audio' || tipo === 'document'
    ? ANCHO_DE_LA_NOTA
    : 'max-w-full md:max-w-[300px]';
}

interface MediaRendererProps {
  media: MediaData | undefined;
  /**
   * La nota de voz que mandamos ya la ESCUCHÓ el contacto.
   *
   * Es un booleano y no el estado del acuse a propósito: esto pinta adjuntos,
   * no sabe de palomitas. Quien decide es la burbuja, que es la que tiene el
   * estado y sabe si el mensaje es nuestro.
   */
  reproducido?: boolean;
  /**
   * Lo que va DEBAJO del audio: el texto ya transcrito, o el motivo por el que
   * no lo hay.
   *
   * Llega como nodo y no como cadena porque quien lo arma es
   * `useTranscribirNota`, en `MessageBubble`: el botón que lo produce vive en
   * el renglón de la hora, así que las dos mitades comparten un solo estado y
   * este componente solo las coloca. Debajo y no en lugar del audio: el audio
   * es lo que mandó el cliente —con su tono y sus pausas— y el texto es una
   * ayuda para leerlo de un vistazo, no un sustituto.
   */
  pieDeLaNota?: React.ReactNode;
}

export const MediaRenderer: React.FC<MediaRendererProps> = React.memo(({
  media,
  reproducido,
  pieDeLaNota,
}) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const gallery = useMediaGallery();

  if (!media) return null;

  const { type, url, mimeType, caption, fileName } = media;

  // Un documento se rotula con SU NOMBRE. Antes salía `caption || mimeType`, y
  // como casi ningún archivo lleva pie de foto, lo normal era ver el mimetype:
  // "application/pdf", o peor, "application/octet-stream". Eso no le dice a
  // nadie qué archivo es. Si no hay nombre se dice "Documento" y, cuando se
  // sabe de qué tipo es, se añade ("Documento PDF").
  const extension = (fileName || url || '').split('?')[0].split('#')[0].split('/').pop()?.split('.').pop() ?? '';
  const esExtensionUtil = /^[a-z0-9]{2,5}$/i.test(extension) && extension.toLowerCase() !== 'stream';
  const rotuloDelDocumento =
    fileName ||
    caption ||
    (esExtensionUtil ? `Documento ${extension.toUpperCase()}` : 'Documento');

  // Imágenes y videos usan la galería compartida del chat (navegación
  // anterior/siguiente estilo WhatsApp). Si por algún motivo no hay galería,
  // se abre el visor local de este mensaje.
  const openViewer = () => {
    if ((type === 'image' || type === 'video') && gallery?.openByUrl(url)) return;
    setViewerOpen(true);
  };
  const baseStyle = MARCO_DE_UN_ADJUNTO;

  return (
    <>
      <div className={cn(baseStyle, anchoDelAdjunto(type))}>
        {type === 'image' && (
          <SafeImage
            src={url}
            alt={caption || 'Imagen'}
            className="w-full h-auto object-cover max-h-[300px] cursor-zoom-in"
            onClick={openViewer}
            loading="lazy"
            decoding="async"
          />
        )}

        {type === 'video' && (
          <div className="relative group bg-black">
            <video
              src={url}
              controls
              className="w-full h-auto max-h-[300px] bg-black"
              preload="metadata"
              aria-label={caption || 'Video'}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 bg-black/60 text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={openViewer}
              aria-label="Abrir en visor"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {type === 'audio' && (
          // La nota de voz es UNA pieza, la misma que pinta el detalle de una
          // llamada en CRM › Llamadas: ver `components/shared/NotaDeVoz.tsx`.
          <NotaDeVoz src={url} reproducido={!!reproducido} onAbrir={() => setViewerOpen(true)} />
        )}

        {/* La transcripcion, debajo del audio y sin quitarlo — o el motivo por
          * el que no la hay.
          *
          * Nada se transcribe al llegar: se pide con la pastilla del renglon de
          * la hora, con el precio delante, y se guarda para no volver a
          * cobrarlo. Si no sale, el MOTIVO se queda aqui: una nota sin texto al
          * lado de otras con texto se lee como que la funcion esta rota, y eso
          * acaba en una llamada a soporte. */}
        {type === 'audio' && pieDeLaNota}

        {type === 'document' && (
          <DocumentCard
            url={url}
            fileName={rotuloDelDocumento}
            mimeType={mimeType ?? ''}
            onOpen={() => setViewerOpen(true)}
          />
        )}
      </div>

      <MediaViewer
        media={media}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
});

MediaRenderer.displayName = 'MediaRenderer';
