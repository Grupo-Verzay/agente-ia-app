'use client';

import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck, CircleAlert, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaRenderer } from './MediaRenderer';
import { CHAT_TIME_FORMATTER, initialFromName } from './chat-message-utils';
import type { MediaData, MessageDeliveryState, UIBubble } from './chat-message-types';

/* ─── ExpandableText ─── */
interface ExpandableTextProps {
  message: string;
  isUserMessage: boolean;
}

const ExpandableText: React.FC<ExpandableTextProps> = ({ message, isUserMessage }) => {
  const MAX_LENGTH = 250;
  const [isExpanded, setIsExpanded] = useState(false);

  if (!message) return null;

  if (message.length <= MAX_LENGTH) {
    return <p className="text-sm whitespace-pre-wrap">{message}</p>;
  }

  const displayedText = isExpanded ? message : `${message.substring(0, MAX_LENGTH)}...`;
  const linkClass = isUserMessage
    ? 'text-gray-300 hover:text-white'
    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300';

  return (
    <p className="text-sm whitespace-pre-wrap">
      {displayedText}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className={cn('ml-1 font-semibold text-xs inline-block', linkClass)}
        type="button"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Ver menos' : 'Ver más'}
      >
        {isExpanded ? 'Ver menos' : 'Ver más...'}
      </button>
    </p>
  );
};

/* ─── MessageStatusIndicator ─── */
interface MessageStatusIndicatorProps {
  status?: MessageDeliveryState;
}

export const MessageStatusIndicator: React.FC<MessageStatusIndicatorProps> = ({ status }) => {
  if (status === 'sending') return <Clock className="h-3 w-3 text-gray-300" aria-label="Enviando" />;
  if (status === 'failed') return <CircleAlert className="h-3 w-3 text-red-300" aria-label="No enviado" />;
  if (status === 'read') return <CheckCheck className="h-3 w-3 text-sky-300" aria-label="Leido" />;
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-gray-300" aria-label="Entregado" />;
  return <Check className="h-3 w-3 text-gray-300" aria-label="Enviado" />;
};

/* ─── MessageBubble ─── */
interface MessageBubbleProps {
  message: string;
  isUserMessage: boolean;
  avatarSrc?: string;
  timestamp?: number;
  media?: MediaData;
  status?: MessageDeliveryState;
  kind?: UIBubble['kind'];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isUserMessage,
  avatarSrc,
  timestamp,
  media,
  status,
  kind,
}) => {
  const showAvatar = !isUserMessage;

  const timeAndStatus = (
    <div className="flex items-center gap-0.5">
      {timestamp && (
        <span
          className={cn(
            'text-[0.6rem] leading-none',
            isUserMessage ? 'text-gray-300' : 'text-gray-400 dark:text-gray-400/80',
          )}
          aria-label="Hora del mensaje"
        >
          {CHAT_TIME_FORMATTER.format(new Date(timestamp))}
        </span>
      )}
      {isUserMessage && (
        <span className="leading-none">
          <MessageStatusIndicator status={status} />
        </span>
      )}
    </div>
  );

  if (kind === 'sticker') {
    return (
      <div className={cn('flex items-end gap-1 my-1', isUserMessage ? 'justify-end' : 'justify-start')}>
        {showAvatar && (
          <div className="mr-1">
            <Avatar className="w-7 h-7">
              <AvatarImage src={avatarSrc || '/default-avatar.png'} />
              <AvatarFallback>{initialFromName()}</AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <div className="w-24 h-24">
            {media ? (
              <MediaRenderer media={media} />
            ) : (
              <div className="w-24 h-24 flex items-center justify-center rounded-xl bg-muted text-2xl">🏷️</div>
            )}
          </div>
          <div className={cn('flex', isUserMessage ? 'justify-end' : 'justify-start')}>
            {timeAndStatus}
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'reaction') {
    return (
      <div className={cn('flex items-end gap-1 my-1', isUserMessage ? 'justify-end' : 'justify-start')}>
        {showAvatar && (
          <div className="mr-1">
            <Avatar className="w-7 h-7">
              <AvatarImage src={avatarSrc || '/default-avatar.png'} />
              <AvatarFallback>{initialFromName()}</AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <div
            className={cn(
              'flex flex-col items-center rounded-2xl border bg-muted/40 px-3 py-2',
              isUserMessage ? 'items-end' : 'items-start',
            )}
          >
            <span className="text-3xl leading-none" role="img" aria-label="Reaccion">
              {message || '👍'}
            </span>
            <span className="mt-1 text-[0.6rem] text-muted-foreground">Reaccionó a un mensaje</span>
          </div>
          <div className={cn('flex', isUserMessage ? 'justify-end' : 'justify-start')}>
            {timeAndStatus}
          </div>
        </div>
      </div>
    );
  }

  const bubbleClass = isUserMessage
    ? 'bg-primary text-white rounded-xl rounded-br-sm self-end'
    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-xl rounded-tl-sm self-start';
  const contentClass = isUserMessage ? 'text-white' : 'text-gray-800 dark:text-gray-100';

  return (
    <div className={cn('flex items-end gap-1 my-1', isUserMessage ? 'justify-end' : 'justify-start')}>
      {showAvatar && (
        <div className="mr-1">
          <Avatar className="w-7 h-7">
            <AvatarImage src={avatarSrc || '/default-avatar.png'} />
            <AvatarFallback>{initialFromName()}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className={cn('px-2 pt-2 pb-5 break-words relative inline-block max-w-[90%] sm:max-w-[70%]', bubbleClass)}>
        {media && <MediaRenderer media={media} />}
        {message && (
          <div className={cn(contentClass, 'pr-10')}>
            <ExpandableText message={message} isUserMessage={isUserMessage} />
          </div>
        )}
        <div className="absolute right-2 bottom-1">{timeAndStatus}</div>
      </div>
    </div>
  );
};
