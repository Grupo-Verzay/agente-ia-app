'use client';

import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCheck, CircleAlert, Clock, Reply, PhoneMissed, PhoneOutgoing, Video, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaRenderer } from './MediaRenderer';
import { SafeImage } from '@/components/custom/SafeImage';
import { CHAT_TIME_FORMATTER, initialFromName } from './chat-message-utils';
import { MessageContextMenu } from './MessageContextMenu';
import { CallDialog } from './CallDialog';
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
    return <p className="text-base sm:text-[15px] whitespace-pre-wrap">{message}</p>;
  }

  const displayedText = isExpanded ? message : `${message.substring(0, MAX_LENGTH)}...`;
  const linkClass = isUserMessage
    ? 'text-gray-300 hover:text-white'
    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300';

  return (
    <p className="text-base sm:text-[15px] whitespace-pre-wrap">
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
  sentByAi?: boolean;
  senderName?: string;
  avatarSrc?: string;
  timestamp?: number;
  media?: MediaData;
  status?: MessageDeliveryState;
  kind?: UIBubble['kind'];
  call?: UIBubble['call'];
  /** Emoji de reacción pegado al mensaje (estilo WhatsApp) */
  reaction?: string;
  /** Teléfono del contacto (solo dígitos) para "devolver llamada" */
  callPhone?: string;
  callContactName?: string;
  quotedMessage?: UIBubble['quotedMessage'];
  adPreview?: UIBubble['adPreview'];
  onReply?: () => void;
  onCopy?: () => void;
  onReact?: (emoji: string) => void;
  onDelete?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isUserMessage,
  sentByAi,
  senderName,
  avatarSrc,
  timestamp,
  media,
  status,
  kind,
  call,
  reaction,
  callPhone,
  callContactName,
  quotedMessage,
  adPreview,
  onReply,
  onCopy,
  onReact,
  onDelete,
}) => {
  const [callOpen, setCallOpen] = useState(false);
  // Sin avatar por mensaje (como WhatsApp en chats 1-a-1): burbujas limpias y
  // más espacio. El avatar del contacto ya se ve en la cabecera del chat.
  const showAvatar = false;

  const senderIcon = isUserMessage ? (
    <span className="flex items-center gap-0.5 text-[0.6rem] leading-none text-gray-300" title={sentByAi ? 'Enviado por el Agente IA' : 'Enviado por asesor humano'}>
      <span>{sentByAi ? '🤖' : '👤'}</span>
      {senderName && <span className="truncate max-w-[5rem]">{senderName}</span>}
    </span>
  ) : null;

  const timeAndStatus = (
    <div className="flex items-center gap-0.5">
      {senderIcon}
      {senderIcon && timestamp && (
        <span className="text-[0.6rem] leading-none text-gray-400/70 mx-0.5">|</span>
      )}
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

  if (kind === 'call') {
    const isOutgoing = call?.direction === 'outgoing';
    const isVideo = !!call?.isVideo;
    const dur = call?.durationSecs ?? 0;
    const completed = call?.status?.toUpperCase?.() === 'COMPLETED';
    const durLabel = dur > 0
      ? ` (${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')})`
      : '';
    const label = isOutgoing
      ? `${isVideo ? 'Videollamada' : 'Llamada'} realizada${durLabel}`
      : completed || dur > 0
        ? `${isVideo ? 'Videollamada' : 'Llamada'} recibida${durLabel}`
        : `${isVideo ? 'Videollamada' : 'Llamada'} entrante`;
    const CallIcon = isOutgoing ? PhoneOutgoing : PhoneMissed;
    return (
      <div className="my-2 flex justify-center">
        <div className={cn(
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm',
          isOutgoing
            ? 'border-border bg-muted/60 text-muted-foreground'
            : 'border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400',
        )}>
          {isVideo ? <Video className="h-3.5 w-3.5 shrink-0" /> : <CallIcon className="h-3.5 w-3.5 shrink-0" />}
          <span className="font-medium">{label}</span>
          {timestamp && (
            <span className="text-[0.65rem] opacity-70">{CHAT_TIME_FORMATTER.format(new Date(timestamp))}</span>
          )}
          {callPhone && (
            <button
              type="button"
              onClick={() => setCallOpen(true)}
              className="ml-1 flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[0.65rem] font-semibold text-white transition-colors hover:bg-green-700"
              title="Devolver llamada"
            >
              <Phone className="h-3 w-3" /> Llamar
            </button>
          )}
        </div>
        {callPhone && (
          <CallDialog open={callOpen} onClose={() => setCallOpen(false)} phone={callPhone} contactName={callContactName} />
        )}
      </div>
    );
  }

  if (kind === 'sticker') {
    return (
      <div className={cn('flex items-end gap-1 my-1', isUserMessage ? 'justify-end' : 'justify-start')}>
        {showAvatar && (
          <div className="mr-1">
            <Avatar className="w-7 h-7">
              <AvatarImage src={avatarSrc || '/placeholder.svg'} />
              <AvatarFallback>{initialFromName()}</AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <div className="flex min-h-16 min-w-16 max-h-36 max-w-36 items-center justify-center">
            {media?.url && media.mimeType?.startsWith('image/') ? (
              <SafeImage
                src={media.url}
                alt="Sticker"
                className="max-h-36 max-w-36 object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : media ? (
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
              <AvatarImage src={avatarSrc || '/placeholder.svg'} />
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
    ? 'bg-[#4F7FE8] text-white rounded-xl rounded-br-sm self-end'
    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl rounded-tl-sm self-start border border-gray-200/80 dark:border-gray-700 shadow-sm';
  const contentClass = isUserMessage ? 'text-white' : 'text-gray-900 dark:text-gray-100';

  const replyBtn = onReply && (
    <button
      onClick={onReply}
      type="button"
      title="Responder"
      aria-label="Responder"
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
    >
      <Reply className="w-3.5 h-3.5" />
    </button>
  );

  const contextMenu = onCopy && onReact && (
    <MessageContextMenu
      isUserMessage={isUserMessage}
      onCopy={onCopy}
      onReact={onReact}
      onDelete={onDelete}
    />
  );

  return (
    <div className={cn('flex items-end gap-1 my-1 group', reaction && 'mb-4', isUserMessage ? 'justify-end' : 'justify-start')}>
      {showAvatar && (
        <div className="mr-1">
          <Avatar className="w-7 h-7">
            <AvatarImage src={avatarSrc || '/default-avatar.png'} />
            <AvatarFallback>{initialFromName()}</AvatarFallback>
          </Avatar>
        </div>
      )}
      {isUserMessage && replyBtn}
      {isUserMessage && contextMenu}
      <div className={cn('px-2 pt-2 pb-1.5 break-words relative inline-block max-w-[94%] sm:max-w-[78%] lg:max-w-[72%]', bubbleClass)}>
        {adPreview && (
          <div className={cn(
            'mb-1.5 rounded-lg overflow-hidden border text-xs',
            isUserMessage
              ? 'border-white/30 bg-white/10'
              : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-white/5',
          )}>
            <div className="flex items-stretch min-h-[3.5rem]">
              {adPreview.thumbnailUrl && (
                <img
                  src={adPreview.thumbnailUrl}
                  alt="Vista previa del anuncio"
                  className="w-14 h-14 object-cover shrink-0"
                />
              )}
              <div className="flex flex-col justify-center px-2 py-1.5 min-w-0">
                {adPreview.title && (
                  <span className={cn('font-semibold leading-snug', isUserMessage ? 'text-white' : 'text-gray-800 dark:text-gray-100')}>
                    {adPreview.title}
                  </span>
                )}
                {adPreview.body && (
                  <span className={cn('truncate leading-snug', isUserMessage ? 'text-white/80' : 'text-gray-500 dark:text-gray-400')}>
                    {adPreview.body}
                  </span>
                )}
              </div>
            </div>
            <div className={cn(
              'px-2 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase',
              isUserMessage ? 'bg-white/10 text-white/70' : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500',
            )}>
              {(() => {
                let host = 'Facebook';
                if (adPreview.sourceUrl) {
                  try { host = new URL(adPreview.sourceUrl).hostname.replace(/^www\./, ''); } catch { /* keep default */ }
                }
                return `Anuncio · ${host}`;
              })()}
            </div>
          </div>
        )}
        {quotedMessage && (
          <div className={cn(
            'mb-1.5 px-2 py-1.5 rounded-lg border-l-4 text-xs cursor-default',
            isUserMessage
              ? 'border-white/60 bg-white/15 text-white/90'
              : 'border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-white/10 text-gray-700 dark:text-gray-300',
          )}>
            <span className="font-semibold block mb-0.5">
              {quotedMessage.sender === 'user' ? 'Tú' : 'Contacto'}
            </span>
            <span className="block truncate max-w-[220px]">
              {quotedMessage.mediaType ? `[${quotedMessage.mediaType}]${quotedMessage.content ? ` ${quotedMessage.content}` : ''}` : quotedMessage.content}
            </span>
          </div>
        )}
        {media && <MediaRenderer media={media} />}
        {message && (
          <div className={contentClass}>
            <ExpandableText message={message} isUserMessage={isUserMessage} />
          </div>
        )}
        {/* Metadatos en flujo normal: la burbuja crece hasta cubrir ícono, nombre y hora */}
        <div className="flex justify-end mt-0.5">{timeAndStatus}</div>
        {reaction && (
          <span
            className={cn(
              'absolute -bottom-3.5 z-10 flex items-center justify-center rounded-full border border-gray-200 bg-white px-1 py-0.5 text-sm leading-none shadow-sm dark:border-gray-600 dark:bg-gray-700',
              isUserMessage ? 'right-2' : 'left-2',
            )}
            role="img"
            aria-label="Reacción"
          >
            {reaction}
          </span>
        )}
      </div>
      {!isUserMessage && replyBtn}
      {!isUserMessage && contextMenu}
    </div>
  );
};
