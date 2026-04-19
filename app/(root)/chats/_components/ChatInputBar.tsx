'use client';

import React from 'react';
import { ArrowRight, Mic, Send, SendIcon, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SafeImage } from '@/components/custom/SafeImage';
import { AttachmentMenu } from './attachment-menu';
import { ChatAutomationPicker } from './ChatAutomationPicker';
import { cn } from '@/lib/utils';
import { formatSecs } from './chat-message-utils';
import type { ComposeMedia } from './attachment-menu';
import type { ChatQuickReplyOption, ChatToolActionResult, ChatWorkflowOption } from '@/types/chat';
import type { Session } from '@/types/session';
import type { RecordedAudioData } from './chat-message-types';
import { SwitchStatus } from '../../sessions/_components';

interface ChatInputBarProps {
  input: string;
  composeMedia: ComposeMedia | null;
  isRecording: boolean;
  recordSecs: number;
  recordedAudio: RecordedAudioData | null;
  isSending: boolean;
  session: Session | null;
  quickReplies: ChatQuickReplyOption[];
  workflows: ChatWorkflowOption[];
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  slashOpen: boolean;
  slashSuggestions: ChatQuickReplyOption[];
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onComposeMediaChange: (media: ComposeMedia | null) => void;
  onClearComposeMedia: () => void;
  onStartRecording: () => void;
  onStopRecordingAndPreview: () => void;
  onCancelRecording: () => void;
  onSend: () => void;
  onApplySlashSuggestion: (message: string) => void;
  onSendQuickReply: (quickReplyId: number) => Promise<ChatToolActionResult>;
  onSendWorkflow: (workflowId: string) => Promise<ChatToolActionResult>;
  onSessionMutate: () => void;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  input,
  composeMedia,
  isRecording,
  recordSecs,
  recordedAudio,
  isSending,
  session,
  quickReplies,
  workflows,
  textareaRef,
  slashOpen,
  slashSuggestions,
  onInputChange,
  onKeyPress,
  onComposeMediaChange,
  onClearComposeMedia,
  onStartRecording,
  onStopRecordingAndPreview,
  onCancelRecording,
  onSend,
  onApplySlashSuggestion,
  onSendQuickReply,
  onSendWorkflow,
  onSessionMutate,
}) => {
  const isPreviewingAudio = recordedAudio !== null && !isRecording;
  const isInputActive = !isRecording && !isPreviewingAudio && !isSending;
  const isSendButtonVisible = isInputActive && (input.trim().length > 0 || !!composeMedia);

  return (
    <div className="p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      {/* Previsualización de adjunto */}
      {composeMedia && (
        <div className="mb-2 flex items-center gap-2">
          {composeMedia.mediatype === 'image' ? (
            <div className="relative w-16 h-16 rounded-md overflow-hidden border bg-white dark:bg-gray-800">
              <SafeImage
                src={composeMedia.dataUrl}
                alt={composeMedia.fileName}
                fill
                sizes="64px"
                className="w-full h-full object-cover"
              />
              <button
                className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full p-1 z-10"
                onClick={onClearComposeMedia}
                aria-label="Quitar adjunto"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="relative w-16 h-16 rounded-md overflow-hidden border bg-white dark:bg-gray-800 flex items-center justify-center text-xs px-1 text-center">
              <span className="truncate">{composeMedia.fileName}</span>
              <button
                className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full p-1"
                onClick={onClearComposeMedia}
                aria-label="Quitar adjunto"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="text-xs text-gray-600 dark:text-gray-300">
            <div className="font-medium truncate max-w-[180px]">{composeMedia.fileName}</div>
            <div className="opacity-80">{composeMedia.mimeType}</div>
            <div className="opacity-80 capitalize">{composeMedia.mediatype}</div>
          </div>
        </div>
      )}

      {/* Indicador de grabación */}
      {isRecording && (
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-medium">Grabando…</span>
              <span className="tabular-nums">{formatSecs(recordSecs)}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-600 hover:text-red-700"
            onClick={onCancelRecording}
            title="Cancelar grabación"
            aria-label="Cancelar grabación"
            type="button"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Previsualización de audio grabado */}
      {isPreviewingAudio && recordedAudio && (
        <div className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-gray-100 dark:bg-gray-700 border dark:border-gray-600">
          <Button
            onClick={onCancelRecording}
            size="icon"
            className="rounded-full bg-red-500 hover:bg-red-600 flex-shrink-0"
            title="Borrar nota de voz"
            aria-label="Borrar nota de voz"
            type="button"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
          <audio src={recordedAudio.dataUrlWithPrefix} controls className="flex-1 h-8" />
          <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300 flex-shrink-0">
            {formatSecs(recordedAudio.durationSecs)}
          </span>
          <Button
            onClick={onSend}
            size="icon"
            className="rounded-full bg-green-500 hover:bg-green-600 flex-shrink-0"
            title="Enviar nota de voz"
            aria-label="Enviar nota de voz"
            type="button"
          >
            <Send className="w-5 h-5 text-white" />
          </Button>
        </div>
      )}

      {/* Input + botones */}
      <div className="relative flex flex-nowrap gap-2">
        <div className="relative flex flex-nowrap z-10 items-center justify-center flex-col sm:flex-row">
          <div className="pr-2 md:block hidden">
            {session && (
              <SwitchStatus
                key={`${session.id}-${session.status ? 'on' : 'off'}`}
                checked={session.status ?? false}
                sessionId={session.id ?? -1}
                mutateSessions={onSessionMutate}
              />
            )}
          </div>
          <ChatAutomationPicker
            quickReplies={quickReplies}
            workflows={workflows}
            onSendQuickReply={onSendQuickReply}
            onSendWorkflow={onSendWorkflow}
          />

          <AttachmentMenu onComposeMediaChange={onComposeMediaChange} maxBase64MB={8} />
        </div>

        {/* Sugerencias slash */}
        {slashOpen && slashSuggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 z-20 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
            {slashSuggestions.map((qr) => (
              <button
                key={qr.id}
                type="button"
                className="w-full flex items-start gap-3 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onApplySlashSuggestion(qr.message);
                }}
              >
                <span className="text-primary font-mono font-medium shrink-0">/{qr.name}</span>
                <span className="text-muted-foreground truncate">{qr.message}</span>
              </button>
            ))}
          </div>
        )}

        <Textarea
          ref={textareaRef}
          placeholder={
            composeMedia
              ? 'Añade un texto o pie de foto (opcional)...'
              : 'Escribe un mensaje... (/ para atajos)'
          }
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyPress}
          disabled={!isInputActive}
          rows={1}
          aria-label="Escribe tu mensaje"
          className={cn(
            'min-h-10 bg-white dark:bg-gray-800 dark:text-white rounded-xl border border-gray-200 dark:border-gray-700 w-full shadow-sm',
            'pl-4 pr-24 py-2 resize-none overflow-y-auto text-sm leading-relaxed',
            'transition-[height] duration-100 ease-out',
            'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
          )}
        />

        <div className="absolute right-1.5 flex items-center gap-1 bottom-1.5 flex-col sm:flex-row">
          {!isPreviewingAudio && (
            <Button
              onClick={() => (isRecording ? onStopRecordingAndPreview() : onStartRecording())}
              size="icon"
              className={cn(
                'h-7 w-7 rounded-full shrink-0',
                isRecording
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600',
              )}
              aria-label={isRecording ? 'Detener grabación y previsualizar' : 'Grabar nota de voz'}
              title={isRecording ? 'Detener y previsualizar' : 'Grabar nota de voz'}
              type="button"
            >
              <Mic className={cn('w-3.5 h-3.5', isRecording ? 'text-white' : 'text-black dark:text-white')} />
            </Button>
          )}
          <Button
            onClick={onSend}
            size="icon"
            className="h-7 w-7 rounded-full bg-blue-500 hover:bg-blue-600 shrink-0"
            aria-label="Enviar"
            title="Enviar"
            disabled={!isPreviewingAudio && !isSendButtonVisible}
            type="button"
          >
            <SendIcon className="w-3.5 h-3.5 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
};
