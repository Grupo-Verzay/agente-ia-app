'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MediaData } from '../chat-message-types';
import { MediaViewer } from './MediaViewer';

interface MediaGalleryContextValue {
  /** Abre el visor en la imagen/video con esa URL. Devuelve true si la encontró. */
  openByUrl: (url: string) => boolean;
  /** Hay al menos un elemento navegable en la galería. */
  hasItems: boolean;
}

const MediaGalleryContext = createContext<MediaGalleryContextValue | null>(null);

export function useMediaGallery(): MediaGalleryContextValue | null {
  return useContext(MediaGalleryContext);
}

interface MediaGalleryProviderProps {
  /** Imágenes y videos del chat, en orden cronológico. */
  items: MediaData[];
  children: React.ReactNode;
}

/**
 * Galería compartida estilo WhatsApp: un ÚNICO visor para todo el chat que
 * conoce la lista completa de imágenes/videos (no una por mensaje), de modo que
 * se puede navegar anterior/siguiente con flechas o el teclado.
 */
export const MediaGalleryProvider: React.FC<MediaGalleryProviderProps> = ({ items, children }) => {
  const [index, setIndex] = useState<number | null>(null);

  const openByUrl = useCallback(
    (url: string) => {
      const i = items.findIndex((m) => m.url === url);
      if (i === -1) return false;
      setIndex(i);
      return true;
    },
    [items],
  );

  const value = useMemo<MediaGalleryContextValue>(
    () => ({ openByUrl, hasItems: items.length > 0 }),
    [openByUrl, items.length],
  );

  return (
    <MediaGalleryContext.Provider value={value}>
      {children}
      <MediaViewer
        items={items}
        index={index ?? 0}
        open={index !== null}
        onClose={() => setIndex(null)}
        onNavigate={setIndex}
      />
    </MediaGalleryContext.Provider>
  );
};
