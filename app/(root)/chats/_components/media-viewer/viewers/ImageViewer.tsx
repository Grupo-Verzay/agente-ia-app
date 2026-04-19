'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SafeImage } from '@/components/custom/SafeImage';
import { cn } from '@/lib/utils';
import type { ViewerProps } from '../viewer-types';

export const ImageViewer: React.FC<ViewerProps> = ({ url, caption }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.5, 5)), []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(z - 0.5, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const onDoubleClick = useCallback(() => {
    if (zoom > 1) resetView();
    else setZoom(2);
  }, [zoom, resetView]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      isDraggingRef.current = true;
      dragStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      e.preventDefault();
    },
    [zoom, pan],
  );

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    setPan({ x: dragStartRef.current.px + dx, y: dragStartRef.current.py + dy });
  }, []);

  const onMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut, resetView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = e.deltaY < 0 ? Math.min(z + 0.25, 5) : Math.max(z - 0.25, 1);
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div
        ref={containerRef}
        className={cn(
          'flex-1 flex items-center justify-center overflow-hidden select-none p-4 min-h-[50vh]',
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        )}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        <SafeImage
          src={url}
          alt={caption || 'Imagen'}
          className="max-w-full max-h-[70vh] object-contain rounded pointer-events-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: zoom > 1 ? 'none' : 'transform 0.15s ease',
          }}
          draggable={false}
        />
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-black/60 border-t border-white/10 shrink-0">
        <span className="text-white/30 text-xs hidden sm:block">
          Doble clic para zoom · Rueda del ratón para escalar
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            onClick={zoomOut}
            disabled={zoom <= 1}
            aria-label="Reducir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-white/60 text-xs w-12 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            onClick={zoomIn}
            disabled={zoom >= 5}
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            onClick={resetView}
            disabled={zoom === 1}
            aria-label="Restablecer vista"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
