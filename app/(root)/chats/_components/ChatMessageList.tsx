'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { InternalNoteBubble } from './InternalNoteBubble';
import { ConversationDateBadge } from './ConversationDateBadge';
import { getCalendarDayKey, formatConversationDateLabel } from './chat-message-utils';
import type { UIBubble } from './chat-message-types';

/* Chat background — official WhatsApp pattern */
const WA_PATTERN_URL = `url("/patterns/whatsapp-chat-pattern-light.svg")`;

const WA_STYLE_LIGHT: React.CSSProperties = {
  backgroundColor: '#f0f2f5',
  backgroundImage: WA_PATTERN_URL,
  backgroundRepeat: 'repeat',
  backgroundSize: '430px 766px',
  backgroundPosition: 'top left',
};

const WA_STYLE_DARK: React.CSSProperties = {
  backgroundColor: '#0d1418',
  backgroundImage: WA_PATTERN_URL,
  backgroundRepeat: 'repeat',
  backgroundSize: '430px 766px',
  backgroundPosition: 'top left',
};

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

/* Lista principal */
interface ChatMessageListProps {
  uiMessages: UIBubble[];
  loading?: boolean;
  listRef: React.RefObject<HTMLDivElement>;
  tempMessage: UIBubble | null;
  onSetReplyTo?: (bubble: UIBubble) => void;
  onCopyMessage?: (bubble: UIBubble) => void;
  onReactMessage?: (bubble: UIBubble, emoji: string) => void;
  onDeleteMessage?: (bubble: UIBubble) => void;
  onDeleteNote?: (noteId: number) => Promise<void>;
  onLoadOlderMessages?: () => Promise<void>;
  canLoadOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  uiMessages,
  loading,
  listRef,
  tempMessage,
  onSetReplyTo,
  onCopyMessage,
  onReactMessage,
  onDeleteMessage,
  onDeleteNote,
  onLoadOlderMessages,
  canLoadOlderMessages,
  loadingOlderMessages,
}) => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const bgStyle = isDark ? WA_STYLE_DARK : WA_STYLE_LIGHT;
  const autoLoadLockRef = useRef(false);

  const fullList = useMemo(() => {
    const list = [...uiMessages];
    if (tempMessage) list.push(tempMessage);
    return list;
  }, [uiMessages, tempMessage]);

  const renderedList = useMemo(() => {
    const items: Array<
      | { type: 'date'; id: string; label: string }
      | { type: 'message'; id: string; message: UIBubble }
    > = [];
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

  const handleScroll = useCallback(() => {
    const el = listRef.current;
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
        style={bgStyle}
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
      style={bgStyle}
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
        {renderedList.map((item) =>
          item.type === 'date' ? (
            <ConversationDateBadge key={item.id} label={item.label} />
          ) : item.message.status === 'sending' ? (
            <SendingMessageSkeleton key={item.id} tempMessage={item.message} />
          ) : item.message.isNote ? (
            <InternalNoteBubble
              key={item.id}
              content={item.message.content}
              authorName={item.message.noteAuthorName ?? null}
              authorEmail={item.message.noteAuthorEmail ?? ''}
              timestamp={item.message.ts ? new Date(item.message.ts).toISOString() : new Date().toISOString()}
              isOwn={item.message.sender === 'user'}
              onDelete={
                item.message.noteId !== undefined && onDeleteNote
                  ? () => void onDeleteNote(item.message.noteId!)
                  : undefined
              }
            />
          ) : (
            <MessageBubble
              key={item.id}
              message={item.message.content}
              isUserMessage={item.message.sender === 'user'}
              avatarSrc={item.message.avatarSrc}
              timestamp={item.message.ts}
              media={item.message.media}
              status={item.message.status}
              kind={item.message.kind}
              quotedMessage={item.message.quotedMessage}
              adPreview={item.message.adPreview}
              onReply={onSetReplyTo ? () => onSetReplyTo(item.message) : undefined}
              onCopy={onCopyMessage ? () => onCopyMessage(item.message) : undefined}
              onReact={onReactMessage ? (emoji) => onReactMessage(item.message, emoji) : undefined}
              onDelete={onDeleteMessage ? () => onDeleteMessage(item.message) : undefined}
            />
          ),
        )}
      </div>
    </div>
  );
};
