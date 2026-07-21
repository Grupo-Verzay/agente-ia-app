'use client';

import React, { useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { MediaData } from '../chat-message-types';
import { getViewer } from './viewer-registry';

interface MediaViewerProps {
  /** Modo de un solo elemento (documento, audio, etc.). */
  media?: MediaData;
  /** Modo galería: lista completa navegable (imágenes/videos del chat). */
  items?: MediaData[];
  index?: number;
  open: boolean;
  onClose: () => void;
  /** Navegar a otro índice de la galería (anterior/siguiente). */
  onNavigate?: (index: number) => void;
}

const TYPE_LABELS: Record<string, string> = {
  image: 'Imagen',
  video: 'Video',
  audio: 'Audio',
  document: 'Documento',
};

function isPdfMime(mimeType: string) {
  return mimeType === 'application/pdf' || mimeType.endsWith('/pdf');
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  media,
  items,
  index = 0,
  open,
  onClose,
  onNavigate,
}) => {
  const list = items && items.length ? items : media ? [media] : [];
  const total = list.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const active = list[safeIndex];

  const canNavigate = total > 1 && !!onNavigate;
  const goTo = useCallback(
    (next: number) => {
      if (!onNavigate || total === 0) return;
      onNavigate((next + total) % total); // wrap-around como WhatsApp
    },
    [onNavigate, total],
  );
  const goPrev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);
  const goNext = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);

  const handleDownload = useCallback(async () => {
    if (!active) return;
    const { url, mimeType, type } = active;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = (blob.type || mimeType).split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
      a.download = active.caption?.trim() || `${type}_${safeIndex + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }, [active, safeIndex]);

  // Navegación con teclado (← / →) mientras el visor está abierto.
  useEffect(() => {
    if (!open || !canNavigate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, canNavigate, goPrev, goNext]);

  if (!active) return null;

  const { type, url, mimeType, caption } = active;
  const ViewerComponent = getViewer(type);
  const isDocumentCard = type === 'document' && !isPdfMime(mimeType);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={
          isDocumentCard
            ? 'max-w-[92vw] sm:max-w-sm p-0 flex flex-col overflow-hidden'
            : 'max-w-[95vw] sm:max-w-[90vw] max-h-[95vh] p-0 border-none flex flex-col overflow-hidden'
        }
      >
        <DialogTitle className="sr-only">
          {caption || TYPE_LABELS[type] || 'Visor multimedia'}
        </DialogTitle>

        {/* Top bar — pr-12 deja espacio para el botón X de DialogClose */}
        <div className="flex items-center gap-3 pl-4 pr-12 py-2.5 border-b border-border">
          <div className="flex-1 min-w-0">
            {caption ? (
              <span className="text-sm text-foreground truncate block">{caption}</span>
            ) : (
              <span className="text-xs text-muted-foreground uppercase tracking-widest">
                {TYPE_LABELS[type] ?? type}
              </span>
            )}
          </div>
          {canNavigate && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {safeIndex + 1} / {total}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            aria-label="Descargar archivo"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>

        {/* Content — cada viewer llena esta área. En galería, flechas anterior/siguiente. */}
        <div className={isDocumentCard ? 'relative overflow-hidden' : 'relative flex-1 min-h-0 overflow-hidden'}>
          <ViewerComponent key={url} url={url} mimeType={mimeType} caption={caption} />

          {canNavigate && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Siguiente"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
