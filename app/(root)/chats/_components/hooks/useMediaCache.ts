'use client';

import { useEffect, useRef, useState } from 'react';
import { getMediaBase64FromMessage, type EvolutionMessage } from '@/actions/chat-actions';

type CacheEntry = { dataUrl: string; mime: string; length: number };
type MediaCacheMap = Map<string, CacheEntry>;

interface UseMediaCacheOptions {
  messages: EvolutionMessage[];
  instanceName?: string;
  apiKeyData?: { url: string; key: string };
}

interface UseMediaCacheReturn {
  mediaCacheRef: React.MutableRefObject<MediaCacheMap>;
  /** Incrementing tick to force re-renders when cache is updated */
  mediaCacheTick: number;
}

/**
 * El cache de media es GLOBAL a la sesión del navegador y persiste entre
 * conversaciones: cada media se indexa por su `messageId` (único en WhatsApp),
 * así que un base64 ya descargado sirve sin importar qué chat esté abierto.
 * Esto hace que reabrir una conversación con imágenes/audio sea instantáneo en
 * vez de re-descargar todo por Server Action. Se acota para no crecer sin fin.
 */
const MEDIA_CACHE_MAX_ENTRIES = 160;
const globalMediaCache: MediaCacheMap = new Map();
const globalMediaInflight = new Set<string>();

/** Número de descargas de media simultáneas por lote (antes era secuencial). */
const MEDIA_DOWNLOAD_CONCURRENCY = 4;

function setMediaEntry(messageId: string, entry: CacheEntry) {
  globalMediaCache.set(messageId, entry);
  // Poda FIFO: el Map preserva orden de inserción; elimina lo más antiguo.
  while (globalMediaCache.size > MEDIA_CACHE_MAX_ENTRIES) {
    const oldest = globalMediaCache.keys().next().value;
    if (oldest === undefined) break;
    globalMediaCache.delete(oldest);
  }
}

function isMediaMessage(m: EvolutionMessage): boolean {
  const body = (m.message || {}) as import('@/actions/chat-actions').MessageContent;
  return !!(
    body.imageMessage ||
    body.videoMessage ||
    body.audioMessage ||
    body.documentMessage ||
    body.stickerMessage ||
    (body as Record<string, any>).lottieStickerMessage
  );
}

function hasRemoteOnlyUrl(m: EvolutionMessage): boolean {
  const body = (m.message || {}) as import('@/actions/chat-actions').MessageContent;
  const media = (
    body.imageMessage ||
    body.videoMessage ||
    body.audioMessage ||
    body.documentMessage ||
    body.stickerMessage ||
    (body as Record<string, any>).lottieStickerMessage ||
    {}
  ) as Record<string, any>;
  const url = body.mediaUrl || media.mediaUrl || media.url || media.directPath;
  return !!url && typeof url === 'string' && !/^data:[^;]+;base64,/.test(url);
}

function getMessageId(m: EvolutionMessage): string | null {
  return m.key?.id || m.id || null;
}

export function useMediaCache({
  messages,
  instanceName,
  apiKeyData,
}: UseMediaCacheOptions): UseMediaCacheReturn {
  // Ref estable apuntando al cache global compartido entre conversaciones.
  const mediaCacheRef = useRef<MediaCacheMap>(globalMediaCache);
  const [mediaCacheTick, setMediaCacheTick] = useState(0);

  useEffect(() => {
    if (!instanceName || !messages?.length || !apiKeyData) return;

    const pending: string[] = [];
    for (const m of messages) {
      if (!isMediaMessage(m) || !hasRemoteOnlyUrl(m)) continue;
      const mid = getMessageId(m);
      if (!mid) continue;
      if (globalMediaCache.has(mid) || globalMediaInflight.has(mid)) continue;
      pending.push(mid);
    }

    if (!pending.length) return;

    let cancelled = false;

    const downloadOne = async (messageId: string) => {
      try {
        globalMediaInflight.add(messageId);
        const res = await getMediaBase64FromMessage(apiKeyData, instanceName, messageId);
        if (!res || cancelled) return;
        if (res.success && res.data?.base64) {
          const dataUrl = `data:${res.data.mimetype || 'application/octet-stream'};base64,${res.data.base64}`;
          setMediaEntry(messageId, {
            dataUrl,
            mime: res.data.mimetype,
            length: res.data.fileLength,
          });
          setMediaCacheTick((t) => t + 1);
        }
      } catch {
        // Continúa con el resto si una descarga falla
      } finally {
        globalMediaInflight.delete(messageId);
      }
    };

    void (async () => {
      // Procesa TODA la media pendiente del chat, en lotes concurrentes para no
      // saturar el servidor pero sin el cuello secuencial de un await por item.
      for (let i = 0; i < pending.length && !cancelled; i += MEDIA_DOWNLOAD_CONCURRENCY) {
        const batch = pending.slice(i, i + MEDIA_DOWNLOAD_CONCURRENCY);
        await Promise.all(batch.map(downloadOne));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, instanceName, apiKeyData]);

  return { mediaCacheRef, mediaCacheTick };
}
