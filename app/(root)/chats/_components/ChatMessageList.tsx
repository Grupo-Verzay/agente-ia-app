'use client';

import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { ConversationDateBadge } from './ConversationDateBadge';
import { getCalendarDayKey, formatConversationDateLabel } from './chat-message-utils';
import type { UIBubble } from './chat-message-types';

/* ─── Chat background — neutral subtle pattern ─── */
const BG_PATTERN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'>
  <rect width='260' height='260' fill='none'/>
  <!-- plus -->
  <path d='M24 14 L24 22 M20 18 L28 18' stroke='%23b8bec7' stroke-width='1.5' stroke-linecap='round' opacity='.35'/>
  <!-- chat bubble outline -->
  <path d='M60 8 Q60 4 64 4 L84 4 Q88 4 88 8 L88 20 Q88 24 84 24 L72 24 L68 28 L69 24 L60 24 Z' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.3'/>
  <!-- star -->
  <path d='M140 6 L142 12 L148 12 L143 16 L145 22 L140 18 L135 22 L137 16 L132 12 L138 12 Z' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.3'/>
  <!-- circle -->
  <circle cx='210' cy='16' r='9' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.3'/>
  <!-- phone outline -->
  <path d='M248 6 Q247 5 246 6 L244 8 Q243 9 244 10 Q246 14 249 17 Q252 20 256 22 Q257 22 258 21 L260 19 Q261 18 260 17 L258 15 Q257 14 256 15 L255 16 Q253 15 251 13 Q249 11 248 9 L249 8 Q250 7 249 6 Z' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.3'/>
  <!-- camera outline -->
  <path d='M10 68 Q9 67 8 67 L2 67 L1 65 L-3 65' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.25'/>
  <!-- heart -->
  <path d='M95 60 C95 56 99 53 103 56 C107 53 111 56 111 60 C111 65 103 71 103 71 C103 71 95 65 95 60Z' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.3'/>
  <!-- music note -->
  <path d='M165 56 L165 46 L174 43 L174 53 M165 56 C165 58 163 59 161 59 C159 59 158 57 158 55 C158 53 160 52 162 52 C163 52 165 53 165 55 M174 53 C174 55 172 56 170 56 C168 56 167 54 167 52 C167 50 169 49 171 49 C172 49 174 50 174 52' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.3'/>
  <!-- clock -->
  <circle cx='218' cy='60' r='10' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.3'/>
  <path d='M218 52 L218 60 L224 60' fill='none' stroke='%23b8bec7' stroke-width='1.2' stroke-linecap='round' opacity='.3'/>
  <!-- plus -->
  <path d='M24 116 L24 124 M20 120 L28 120' stroke='%23b8bec7' stroke-width='1.5' stroke-linecap='round' opacity='.35'/>
  <!-- chat bubble 2 -->
  <path d='M58 108 Q58 104 62 104 L82 104 Q86 104 86 108 L86 120 Q86 124 82 124 L70 124 L66 128 L67 124 L58 124 Z' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.25'/>
  <!-- arrow -->
  <path d='M130 116 L142 116 M138 112 L142 116 L138 120' fill='none' stroke='%23b8bec7' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round' opacity='.3'/>
  <!-- circle small -->
  <circle cx='195' cy='118' r='7' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.28'/>
  <!-- star small -->
  <path d='M240 108 L241 113 L246 113 L242 116 L244 121 L240 118 L236 121 L238 116 L234 113 L239 113 Z' fill='none' stroke='%23b8bec7' stroke-width='1' opacity='.28'/>
  <!-- plus -->
  <path d='M24 210 L24 218 M20 214 L28 214' stroke='%23b8bec7' stroke-width='1.5' stroke-linecap='round' opacity='.35'/>
  <!-- heart small -->
  <path d='M70 200 C70 197 73 195 76 197 C79 195 82 197 82 200 C82 204 76 208 76 208 C76 208 70 204 70 200Z' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.28'/>
  <!-- phone small -->
  <path d='M125 202 Q124 201 123 202 L121 204 Q120 205 121 206 Q123 210 126 213 Q129 216 133 217 Q134 218 135 217 L137 215 Q138 214 137 213 L135 211 Q134 210 133 211 L132 212 Q130 211 128 209 Q126 207 125 205 L126 204 Q127 203 126 202 Z' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.28'/>
  <!-- camera small -->
  <path d='M168 200 Q167 199 165 199 L157 199 L156 197 L152 197 Q151 197 150 198 L150 212 Q150 213 151 213 L179 213' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.25'/>
  <circle cx='165' cy='206' r='4' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.25'/>
  <!-- clock small -->
  <circle cx='218' cy='205' r='9' fill='none' stroke='%23b8bec7' stroke-width='1.2' opacity='.28'/>
  <path d='M218 198 L218 205 L223 205' fill='none' stroke='%23b8bec7' stroke-width='1.2' stroke-linecap='round' opacity='.28'/>
</svg>`;

const BG_PATTERN_URL = `url("data:image/svg+xml,${BG_PATTERN_SVG.replace(/\n\s*/g, ' ')}")`;

const WA_STYLE_LIGHT: React.CSSProperties = {
  backgroundColor: '#f0f2f5',
  backgroundImage: BG_PATTERN_URL,
  backgroundRepeat: 'repeat',
  backgroundSize: '260px 260px',
};

const WA_STYLE_DARK: React.CSSProperties = {
  backgroundColor: '#0d1418',
};

/* ─── Skeleton de carga ─── */
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

/* ─── Burbuja temporal (enviando) ─── */
const SendingMessageSkeleton: React.FC<{ tempMessage: UIBubble }> = ({ tempMessage }) => {
  const isMedia = tempMessage.media !== undefined;
  const bubbleClass =
    'bg-gray-300/50 dark:bg-gray-700/50 text-gray-500 rounded-xl rounded-br-sm self-end animate-pulse';

  return (
    <div className="flex items-end gap-1 my-1 justify-end opacity-70" aria-live="polite">
      <div className={cn('p-2 break-words relative inline-block max-w-[90%] sm:max-w-[70%]', bubbleClass)}>
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

/* ─── Lista principal ─── */
interface ChatMessageListProps {
  uiMessages: UIBubble[];
  loading?: boolean;
  listRef: React.RefObject<HTMLDivElement>;
  tempMessage: UIBubble | null;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  uiMessages,
  loading,
  listRef,
  tempMessage,
}) => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const bgStyle = isDark ? WA_STYLE_DARK : WA_STYLE_LIGHT;

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

  if (loading && renderedList.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto p-4 custom-scrollbar w-full" style={bgStyle} ref={listRef}>
        <ChatMessageListSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4 custom-scrollbar w-full" style={bgStyle} ref={listRef}>
      {loading && <div className="text-center text-gray-500 py-4">Cargando mensajes…</div>}
      {renderedList.map((item) =>
        item.type === 'date' ? (
          <ConversationDateBadge key={item.id} label={item.label} />
        ) : item.message.status === 'sending' ? (
          <SendingMessageSkeleton key={item.id} tempMessage={item.message} />
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
          />
        ),
      )}
    </div>
  );
};
