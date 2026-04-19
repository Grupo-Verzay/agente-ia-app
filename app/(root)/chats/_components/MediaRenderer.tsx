'use client';

import React, { useState } from 'react';
import { ArrowUpRight, Maximize2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SafeImage } from '@/components/custom/SafeImage';
import { cn } from '@/lib/utils';
import type { MediaData } from './chat-message-types';
import { MediaViewer } from './media-viewer';

interface MediaRendererProps {
  media: MediaData | undefined;
}

export const MediaRenderer: React.FC<MediaRendererProps> = React.memo(({ media }) => {
  const [viewerOpen, setViewerOpen] = useState(false);

  if (!media) return null;

  const { type, url, mimeType, caption } = media;
  const baseStyle = 'my-1 rounded-md overflow-hidden border dark:border-gray-600';
  const audioDocStyle = 'w-full max-w-[350px]';

  return (
    <>
      <div
        className={cn(
          baseStyle,
          'max-w-full',
          type === 'audio' || type === 'document' ? audioDocStyle : 'md:max-w-[300px]',
        )}
      >
        {type === 'image' && (
          <SafeImage
            src={url}
            alt={caption || 'Imagen'}
            className="w-full h-auto object-cover max-h-[300px] cursor-zoom-in"
            onClick={() => setViewerOpen(true)}
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
              onClick={() => setViewerOpen(true)}
              aria-label="Abrir en visor"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {type === 'audio' && (
          <div className="p-2 bg-white dark:bg-gray-700 flex items-center gap-2 border-t dark:border-gray-600">
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="flex-shrink-0 text-gray-500 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              aria-label="Abrir reproductor"
            >
              <Mic className="w-5 h-5" />
            </button>
            <audio src={url} controls className="flex-1 h-8" preload="metadata" />
          </div>
        )}

        {type === 'document' && (
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className="w-full p-3 bg-blue-500 text-white flex items-center justify-between hover:bg-blue-600 transition-colors"
            aria-label="Abrir documento"
          >
            <span className="truncate text-sm">{caption || mimeType}</span>
            <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
          </button>
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
