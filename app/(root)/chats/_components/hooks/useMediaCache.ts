'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMediaBase64FromMessage, type EvolutionMessage } from '@/actions/chat-actions';

type CacheEntry = { dataUrl: string; mime: string; length: number };
type MediaCacheMap = Map<string, CacheEntry>;

interface UseMediaCacheOptions {
  messages: EvolutionMessage[];
  instanceName?: string;
  apiKeyData?: { url: string; key: string };
  /** Clearing key — when this changes the cache is reset (e.g. when switching chats) */
  cacheResetKey?: string;
}

interface UseMediaCacheReturn {
  mediaCacheRef: React.MutableRefObject<MediaCacheMap>;
  /** Incrementing tick to force re-renders when cache is updated */
  mediaCacheTick: number;
}

function isMediaMessage(m: EvolutionMessage): boolean {
  const body = (m.message || {}) as any;
  return !!(
    body.imageMessage ||
    body.videoMessage ||
    body.audioMessage ||
    body.documentMessage ||
    body.stickerMessage
  );
}

function hasRemoteOnlyUrl(m: EvolutionMessage): boolean {
  const body = (m.message || {}) as any;
  const media =
    body.imageMessage ||
    body.videoMessage ||
    body.audioMessage ||
    body.documentMessage ||
    body.stickerMessage ||
    {};
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
  cacheResetKey,
}: UseMediaCacheOptions): UseMediaCacheReturn {
  const mediaCacheRef = useRef<MediaCacheMap>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());
  const [mediaCacheTick, setMediaCacheTick] = useState(0);

  // Reset cache when switching chats
  useEffect(() => {
    mediaCacheRef.current.clear();
    inflightRef.current.clear();
    setMediaCacheTick((t) => t + 1);
  }, [cacheResetKey]);

  useEffect(() => {
    if (!instanceName || !messages?.length || !apiKeyData) return;

    const candidates: string[] = [];
    for (const m of messages) {
      if (!isMediaMessage(m) || !hasRemoteOnlyUrl(m)) continue;
      const mid = getMessageId(m);
      if (!mid) continue;
      if (mediaCacheRef.current.has(mid) || inflightRef.current.has(mid)) continue;
      candidates.push(mid);
    }

    if (!candidates.length) return;

    let cancelled = false;

    void (async () => {
      for (const messageId of candidates) {
        try {
          inflightRef.current.add(messageId);
          const res = await getMediaBase64FromMessage(apiKeyData, instanceName, messageId);
          if (!res || cancelled) continue;
          if (res.success && res.data?.base64) {
            const dataUrl = `data:${res.data.mimetype || 'application/octet-stream'};base64,${res.data.base64}`;
            mediaCacheRef.current.set(messageId, {
              dataUrl,
              mime: res.data.mimetype,
              length: res.data.fileLength,
            });
            setMediaCacheTick((t) => t + 1);
          }
        } catch {
          // Continue with remaining messages if one fails
        } finally {
          inflightRef.current.delete(messageId);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, instanceName, apiKeyData]);

  return { mediaCacheRef, mediaCacheTick };
}
