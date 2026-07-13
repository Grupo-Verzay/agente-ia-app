'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { InternalNoteBubble } from './InternalNoteBubble';
import { ConversationDateBadge } from './ConversationDateBadge';
import { getCalendarDayKey, formatConversationDateLabel } from './chat-message-utils';
import type { UIBubble } from './chat-message-types';

// Activa virtualizacion antes para no pintar historiales largos completos.
const VIRTUALIZE_AFTER_ITEMS = 30;
const VIRTUAL_OVERSCAN_ITEMS = 12;
const ESTIMATED_DATE_HEIGHT = 44;
const ESTIMATED_TEXT_HEIGHT = 82;
const ESTIMATED_MEDIA_HEIGHT = 220;
const ESTIMATED_NOTE_HEIGHT = 96;

type RenderedListItem =
  | { type: 'date'; id: string; label: string }
  | { type: 'message'; id: string; message: UIBubble };

function estimateItemHeight(item: RenderedListItem) {
  if (item.type === 'date') return ESTIMATED_DATE_HEIGHT;

  if (item.message.isNote) return ESTIMATED_NOTE_HEIGHT;
  if (item.message.media || item.message.adPreview || item.message.kind === 'sticker') {
    return ESTIMATED_MEDIA_HEIGHT;
  }

  const textLength = item.message.content?.length ?? 0;
  return ESTIMATED_TEXT_HEIGHT + Math.min(180, Math.floor(textLength / 55) * 22);
}

/* Chat background — patrón oficial estilo WhatsApp. El fondo (color + patrón
   claro/oscuro) se resuelve por CSS en `.whatsapp-chat-background` y su override
   `.dark` (ver app/globals.css). Se hace por CSS —no por JS— para que next-themes
   aplique el tema correcto ANTES del render y no aparezca claro en oscuro al
   entrar directo a un chat por URL/recarga. */

/* Skeleton de carga */
const ChatMessageListSkeleton: React.FC = () => (
  <div className="flex-1 space-y-4">
    <div className="flex justify-center">
      <Skeleton className="h-7 w-40 rounded-full" />
    </div>
    {Array.from({ length: 5 }).map((_, index) => {
      const isUser = index % 2 === 1;
      return (
        <div key={index} className={cn('flex items-end gap-2', isUser ? 'justify-end' : 'justify-start')}>
          {!isUser && <Skeleton className="h-7 w-7 rounded-full" />}
          <div className="space-y-2">
            <Skeleton className={cn('h-4 rounded-full', isUser ? 'w-28' : 'w-36')} />
            <Skeleton className={cn('h-16 rounded-2xl', isUser ? 'w-56' : 'w-64')} />
          </div>
        </div>
      );
    })}
  </div>
);

/* Burbuja temporal (enviando) */
const SendingMessageSkeleton: React.FC<{ tempMessage: UIBubble }> = ({ tempMessage }) => {
  const isMedia = tempMessage.media !== undefined;
  const bubbleClass =
    'bg-gray-300/50 dark:bg-gray-700/50 text-gray-500 rounded-xl rounded-br-sm self-end animate-pulse';

  return (
    <div className="flex items-end gap-1 my-1 justify-end opacity-70" aria-live="polite">
      <div className={cn('p-2 break-words relative inline-block max-w-[94%] sm:max-w-[78%] lg:max-w-[72%]', bubbleClass)}>
        {isMedia ? (
          <div className="w-24 h-24 rounded-md bg-gray-400/50 dark:bg-gray-600/50 my-1" />
        ) : (
          <>
            <div className="h-3 w-48 bg-gray-400/50 dark:bg-gray-600/50 rounded mb-1" />
            <div className="h-3 w-32 bg-gray-400/50 dark:bg-gray-600/50 rounded" />
          </>
        )}
        <div className="text-[0.6rem] mt-1 flex justify-end items-center gap-1 text-gray-500/70">
          <Clock className="w-3 h-3" />
          <span>Enviando...</span>
        </div>
      </div>
    </div>
  );
};

/* ─── Fila memoizada ───
 * Cada mensaje se aísla en su propia fila memoizada para que, al llegar un
 * mensaje nuevo (o en cada poll), NO se re-dibujen todas las burbujas visibles
 * —solo la que realmente cambió—. Antes se re-renderizaba toda la lista y eso
 * generaba lag al llegar mensajes y al pintar sus íconos.
 */
interface MessageRowProps {
  message: UIBubble;
  advisorName?: string;
  callPhone?: string;
  callContactName?: string;
  isSearchMatch: boolean;
  isActiveSearchMatch: boolean;
  onSetReplyTo?: (bubble: UIBubble) => void;
  onCopyMessage?: (bubble: UIBubble) => void;
  onReactMessage?: (bubble: UIBubble, emoji: string) => void;
  onDeleteMessage?: (bubble: UIBubble) => void;
  onDeleteNote?: (noteId: number) => Promise<void>;
}

const MessageRowBase: React.FC<MessageRowProps> = ({
  message,
  advisorName,
  callPhone,
  callContactName,
  isSearchMatch,
  isActiveSearchMatch,
  onSetReplyTo,
  onCopyMessage,
  onReactMessage,
  onDeleteMessage,
  onDeleteNote,
}) => {
  const wrapperClass = cn(
    'rounded-xl transition-all duration-200',
    isSearchMatch && 'bg-amber-200/20',
    isActiveSearchMatch && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent',
  );

  return (
    <div
      data-message-id={message.id}
      data-search-active={isActiveSearchMatch ? 'true' : undefined}
      className={wrapperClass}
    >
      {message.status === 'sending' ? (
        <SendingMessageSkeleton tempMessage={message} />
      ) : message.isNote ? (
        <InternalNoteBubble
          content={message.content}
          authorName={message.noteAuthorName ?? null}
          authorEmail={message.noteAuthorEmail ?? ''}
          mentionNames={message.noteMentionNames}
          timestamp={message.ts ? new Date(message.ts).toISOString() : new Date().toISOString()}
          isOwn={message.sender === 'user'}
          onDelete={
            message.noteId !== undefined && onDeleteNote
              ? () => void onDeleteNote(message.noteId!)
              : undefined
          }
        />
      ) : (
        <MessageBubble
          message={message.content}
          isUserMessage={message.sender === 'user'}
          sentByAi={message.sentByAi}
          clientDeleted={message.clientDeleted}
          senderName={message.sender === 'user' ? (message.sentByAi ? 'Agente IA' : advisorName) : undefined}
          avatarSrc={message.avatarSrc}
          timestamp={message.ts}
          media={message.media}
          status={message.status}
          kind={message.kind}
          call={message.call}
          reaction={message.reaction}
          callPhone={callPhone}
          callContactName={callContactName}
          quotedMessage={message.quotedMessage}
          adPreview={message.adPreview}
          onReply={onSetReplyTo ? () => onSetReplyTo(message) : undefined}
          onCopy={onCopyMessage ? () => onCopyMessage(message) : undefined}
          onReact={onReactMessage ? (emoji) => onReactMessage(message, emoji) : undefined}
          onDelete={onDeleteMessage ? () => onDeleteMessage(message) : undefined}
        />
      )}
    </div>
  );
};

function areMessageRowsEqual(prev: MessageRowProps, next: MessageRowProps) {
  if (
    prev.onSetReplyTo !== next.onSetReplyTo ||
    prev.onCopyMessage !== next.onCopyMessage ||
    prev.onReactMessage !== next.onReactMessage ||
    prev.onDeleteMessage !== next.onDeleteMessage ||
    prev.onDeleteNote !== next.onDeleteNote ||
    prev.advisorName !== next.advisorName ||
    prev.callPhone !== next.callPhone ||
    prev.callContactName !== next.callContactName ||
    prev.isSearchMatch !== next.isSearchMatch ||
    prev.isActiveSearchMatch !== next.isActiveSearchMatch
  ) {
    return false;
  }

  const a = prev.message;
  const b = next.message;
  if (a === b) return true;

  // Conservador: si la burbuja tiene contenido complejo (media, llamada, cita
  // o anuncio), re-renderizamos por seguridad para nunca mostrar algo viejo.
  if (
    a.media || b.media ||
    a.call || b.call ||
    a.quotedMessage || b.quotedMessage ||
    a.adPreview || b.adPreview
  ) {
    return false;
  }

  return (
    a.id === b.id &&
    a.content === b.content &&
    a.ts === b.ts &&
    a.status === b.status &&
    a.sender === b.sender &&
    a.kind === b.kind &&
    a.reaction === b.reaction &&
    a.sentByAi === b.sentByAi &&
    a.avatarSrc === b.avatarSrc &&
    a.isNote === b.isNote &&
    a.noteId === b.noteId &&
    a.noteAuthorName === b.noteAuthorName &&
    a.noteAuthorEmail === b.noteAuthorEmail &&
    (a.noteMentionNames ?? []).join('|') === (b.noteMentionNames ?? []).join('|')
  );
}

const MessageRow = React.memo(MessageRowBase, areMessageRowsEqual);

/* Lista principal */
interface ChatMessageListProps {
  uiMessages: UIBubble[];
  loading?: boolean;
  listRef: React.RefObject<HTMLDivElement>;
  tempMessage: UIBubble | null;
  advisorName?: string;
  onSetReplyTo?: (bubble: UIBubble) => void;
  onCopyMessage?: (bubble: UIBubble) => void;
  onReactMessage?: (bubble: UIBubble, emoji: string) => void;
  onDeleteMessage?: (bubble: UIBubble) => void;
  onDeleteNote?: (noteId: number) => Promise<void>;
  onLoadOlderMessages?: () => Promise<void>;
  canLoadOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  searchMatchIds?: Set<string>;
  activeSearchMessageId?: string;
  /** Teléfono del contacto (solo dígitos) para el botón "devolver llamada" en burbujas de llamada */
  callPhone?: string;
  callContactName?: string;
}

const ChatMessageListBase: React.FC<ChatMessageListProps> = ({
  uiMessages,
  loading,
  listRef,
  tempMessage,
  advisorName,
  onSetReplyTo,
  onCopyMessage,
  onReactMessage,
  onDeleteMessage,
  onDeleteNote,
  onLoadOlderMessages,
  canLoadOlderMessages,
  loadingOlderMessages,
  searchMatchIds,
  activeSearchMessageId,
  callPhone,
  callContactName,
}) => {
  const autoLoadLockRef = useRef(false);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  const fullList = useMemo(() => {
    const list = [...uiMessages];
    if (tempMessage) list.push(tempMessage);
    return list;
  }, [uiMessages, tempMessage]);

  const renderedList = useMemo(() => {
    const items: RenderedListItem[] = [];
    let previousDayKey = '';

    for (const msg of fullList) {
      const currentDayKey = getCalendarDayKey(msg.ts);
      if (currentDayKey && currentDayKey !== previousDayKey) {
        items.push({
          type: 'date',
          id: `date-${currentDayKey}`,
          label: formatConversationDateLabel(msg.ts),
        });
        previousDayKey = currentDayKey;
      }
      items.push({ type: 'message', id: msg.id, message: msg });
    }

    return items;
  }, [fullList]);

  const virtualMetrics = useMemo(() => {
    if (renderedList.length <= VIRTUALIZE_AFTER_ITEMS || activeSearchMessageId) {
      return {
        beforeHeight: 0,
        afterHeight: 0,
        items: renderedList,
      };
    }

    const heights = renderedList.map(estimateItemHeight);
    const offsets: number[] = [];
    let totalHeight = 0;
    for (const height of heights) {
      offsets.push(totalHeight);
      totalHeight += height;
    }

    const viewportHeight = viewport.height || 640;
    const from = Math.max(0, viewport.scrollTop - viewportHeight);
    const to = viewport.scrollTop + viewportHeight * 2;

    let startIndex = offsets.findIndex((offset, index) => offset + heights[index] >= from);
    if (startIndex === -1) startIndex = 0;
    let endIndex = offsets.findIndex((offset) => offset > to);
    if (endIndex === -1) endIndex = renderedList.length;

    startIndex = Math.max(0, startIndex - VIRTUAL_OVERSCAN_ITEMS);
    endIndex = Math.min(renderedList.length, endIndex + VIRTUAL_OVERSCAN_ITEMS);

    return {
      beforeHeight: offsets[startIndex] ?? 0,
      afterHeight: Math.max(0, totalHeight - (offsets[endIndex] ?? totalHeight)),
      items: renderedList.slice(startIndex, endIndex),
    };
  }, [activeSearchMessageId, renderedList, viewport.height, viewport.scrollTop]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setViewport({ scrollTop: el.scrollTop, height: el.clientHeight });
  }, [listRef, renderedList.length]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (el) {
      setViewport({ scrollTop: el.scrollTop, height: el.clientHeight });
    }
    if (!el || !onLoadOlderMessages || !canLoadOlderMessages || loading || loadingOlderMessages || autoLoadLockRef.current) {
      return;
    }
    if (el.scrollTop > 80) return;

    autoLoadLockRef.current = true;
    void onLoadOlderMessages().finally(() => {
      autoLoadLockRef.current = false;
    });
  }, [canLoadOlderMessages, listRef, loading, loadingOlderMessages, onLoadOlderMessages]);

  if (loading && renderedList.length === 0) {
    return (
      <div
        className="whatsapp-chat-background flex flex-1 flex-col overflow-y-auto custom-scrollbar w-full"
        ref={listRef}
        onScroll={handleScroll}
      >
      <div
        className="relative z-10 flex min-h-full w-full flex-col p-2 sm:p-4"
      >
        <ChatMessageListSkeleton />
      </div>
      </div>
    );
  }

  return (
    <div
      className="whatsapp-chat-background flex flex-1 flex-col overflow-y-auto custom-scrollbar w-full"
      ref={listRef}
      onScroll={handleScroll}
    >
      <div className="relative z-10 flex min-h-full w-full flex-col p-2 sm:p-4">
        {canLoadOlderMessages && (
          <div className="flex justify-center pb-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 rounded-full bg-background/90 px-3 text-xs shadow-sm"
              disabled={loading || loadingOlderMessages}
              onClick={() => void onLoadOlderMessages?.()}
            >
              {loadingOlderMessages ? 'Cargando...' : 'Cargar mensajes anteriores'}
            </Button>
          </div>
        )}
        {loading && <div className="text-center text-gray-500 py-4">Cargando mensajes…</div>}
        {virtualMetrics.beforeHeight > 0 && (
          <div aria-hidden="true" style={{ height: virtualMetrics.beforeHeight }} />
        )}
        {virtualMetrics.items.map((item) => {
          if (item.type === 'date') {
            return <ConversationDateBadge key={item.id} label={item.label} />;
          }

          return (
            <MessageRow
              key={item.id}
              message={item.message}
              advisorName={advisorName}
              callPhone={callPhone}
              callContactName={callContactName}
              isSearchMatch={searchMatchIds?.has(item.message.id) ?? false}
              isActiveSearchMatch={activeSearchMessageId === item.message.id}
              onSetReplyTo={onSetReplyTo}
              onCopyMessage={onCopyMessage}
              onReactMessage={onReactMessage}
              onDeleteMessage={onDeleteMessage}
              onDeleteNote={onDeleteNote}
            />
          );
        })}
        {virtualMetrics.afterHeight > 0 && (
          <div aria-hidden="true" style={{ height: virtualMetrics.afterHeight }} />
        )}
      </div>
    </div>
  );
};

// Memoizado: evita re-renderizar toda la lista de mensajes cuando el padre
// (ChatMain) se re-renderiza por estados no relacionados, p. ej. cada tecla
// escrita en el input. Solo re-renderiza si cambian sus props.
export const ChatMessageList = React.memo(ChatMessageListBase);
