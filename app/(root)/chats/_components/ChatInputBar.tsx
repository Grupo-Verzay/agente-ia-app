'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowRight, Check, Lock, Mic, Plus, PenLine, Send, SendIcon, SmilePlus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SafeImage } from '@/components/custom/SafeImage';
import { AttachmentMenu } from './attachment-menu';
import { ChatAutomationPicker } from './ChatAutomationPicker';
import { cn } from '@/lib/utils';
import { formatSecs } from './chat-message-utils';
import {
  getAdvisorSignatureAction,
  toggleSessionSignatureAction,
  updateAdvisorSignatureAction,
} from '@/actions/chat-manual-actions';
import { EmojiPickerPanel } from './EmojiPickerPanel';
import type { ComposeMedia } from './attachment-menu';
import type { ChatQuickReplyOption, ChatToolActionResult, ChatWorkflowOption } from '@/types/chat';
import type { Session } from '@/types/session';
import type { RecordedAudioData, UIBubble } from './chat-message-types';
import { SwitchStatus } from '../../sessions/_components';

interface ChatInputBarProps {
  input: string;
  composeMedia: ComposeMedia | null;
  replyTo: UIBubble | null;
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
  onClearReplyTo: () => void;
  onStartRecording: () => void;
  onStopRecordingAndPreview: () => void;
  onCancelRecording: () => void;
  onSend: () => void;
  onApplySlashSuggestion: (message: string) => void;
  onSendQuickReply: (quickReplyId: number) => Promise<ChatToolActionResult>;
  onSendWorkflow: (workflowId: string) => Promise<ChatToolActionResult>;
  onSessionMutate: () => void;
  onGenerateSuggestion?: () => void;
  noteMode?: boolean;
  onToggleNoteMode?: () => void;
  onSendNote?: (content: string) => Promise<void>;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  input,
  composeMedia,
  replyTo,
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
  onClearReplyTo,
  onStartRecording,
  onStopRecordingAndPreview,
  onCancelRecording,
  onSend,
  onApplySlashSuggestion,
  onSendQuickReply,
  onSendWorkflow,
  onSessionMutate,
  onGenerateSuggestion,
  noteMode = false,
  onToggleNoteMode,
  onSendNote,
}) => {
  const [signatureText, setSignatureText] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [inputMenuOpen, setInputMenuOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emojiOpen]);

  const insertEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? input.length;
    const end = textarea.selectionEnd ?? input.length;
    const newValue = input.slice(0, start) + emoji + input.slice(end);
    const syntheticEvent = { target: { value: newValue } } as React.ChangeEvent<HTMLTextAreaElement>;
    onInputChange(syntheticEvent);
    setEmojiOpen(false);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
    }, 0);
  }, [input, onInputChange, textareaRef]);
  const [isLoadingSignature, setIsLoadingSignature] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const [isTogglingSignature, setIsTogglingSignature] = useState(false);

  const signatureEnabled = session?.signatureEnabled ?? false;

  const handlePopoverOpenChange = async (open: boolean) => {
    setIsPopoverOpen(open);
    if (open) {
      setIsLoadingSignature(true);
      try {
        const text = await getAdvisorSignatureAction();
        setSignatureText(text);
      } finally {
        setIsLoadingSignature(false);
      }
    }
  };

  const handleSaveSignature = async () => {
    setIsSavingSignature(true);
    try {
      const result = await updateAdvisorSignatureAction(signatureText);
      if (result.success) toast.success('Firma guardada.');
      else toast.error(result.message);
    } finally {
      setIsSavingSignature(false);
    }
  };

  const handleToggleSignature = async (enabled: boolean) => {
    if (!session?.id) return;
    setIsTogglingSignature(true);
    try {
      const result = await toggleSessionSignatureAction(session.id, enabled);
      if (result.success) {
        onSessionMutate();
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsTogglingSignature(false);
    }
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find((item) =>
      item.type.startsWith('image/'),
    );
    if (!imageItem) return;

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máximo 8 MB).');
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

    onComposeMediaChange({
      mediatype: 'image',
      dataUrl,
      mimeType: file.type || 'image/png',
      fileName: file.name || `imagen-${Date.now()}.png`,
    });
  }, [onComposeMediaChange]);

  const isPreviewingAudio = recordedAudio !== null && !isRecording;
  const isInputActive = !isRecording && !isPreviewingAudio && !isSending;
  const isSendButtonVisible = isInputActive && (input.trim().length > 0 || !!composeMedia);

  const handleSendNote = async () => {
    if (!onSendNote || !input.trim()) return;
    await onSendNote(input.trim());
  };

  return (
    <div className={cn(
      "p-3 border-t dark:border-gray-700 transition-colors",
      noteMode
        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
        : "bg-gray-50 dark:bg-gray-900",
    )}>
      {/* Preview de respuesta a un mensaje */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/50">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              {replyTo.sender === 'user' ? 'Tú' : 'Contacto'}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {replyTo.media
                ? `[${replyTo.media.type}]${replyTo.content ? ` ${replyTo.content}` : ''}`
                : replyTo.content || ''}
            </div>
          </div>
          <button
            onClick={onClearReplyTo}
            type="button"
            aria-label="Cancelar respuesta"
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
      <div className="relative flex flex-nowrap items-center gap-2">
        <div className="relative flex flex-nowrap z-10 items-center justify-center">
          {/* Firma + SwitchStatus — solo desktop */}
          <div className="pr-2 md:flex hidden items-center gap-1">
            {session && (
              <SwitchStatus
                key={`${session.id}-${session.status ? 'on' : 'off'}`}
                checked={session.status ?? false}
                sessionId={session.id ?? -1}
                mutateSessions={onSessionMutate}
              />
            )}
            {session && (
              <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-8 w-8 rounded-full shrink-0 transition-colors',
                      signatureEnabled
                        ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                    title={signatureEnabled ? 'Firma activa' : 'Configurar firma del asesor'}
                    aria-label="Firma del asesor"
                    type="button"
                  >
                    <PenLine className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-72 p-3 space-y-3">
                  <p className="text-xs font-semibold text-foreground">Firma del asesor</p>

                  <div className="flex items-center gap-1.5">
                    <Input
                      value={isLoadingSignature ? '' : signatureText}
                      onChange={(e) => setSignatureText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSaveSignature(); } }}
                      placeholder={isLoadingSignature ? 'Cargando…' : '— Nombre | Cargo'}
                      disabled={isLoadingSignature || isSavingSignature}
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                      onClick={handleSaveSignature}
                      disabled={isLoadingSignature || isSavingSignature}
                      title="Guardar firma"
                      type="button"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs text-muted-foreground">Activa en este chat</span>
                    <Switch
                      checked={signatureEnabled}
                      onCheckedChange={handleToggleSignature}
                      disabled={isTogglingSignature}
                      aria-label="Activar firma en este chat"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Botón toggle — solo móvil */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              'sm:hidden h-8 w-8 rounded-full shrink-0 transition-colors',
              inputMenuOpen
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
            aria-label="Herramientas de mensaje"
            onClick={() => setInputMenuOpen((v) => !v)}
          >
            {inputMenuOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </Button>

          {/* Los 4 botones de acción:
              - Móvil: ocultos por defecto, se muestran como panel flotante cuando inputMenuOpen
              - Desktop (sm+): siempre visibles en fila */}
          <div
            className={cn(
              'items-center gap-1',
              inputMenuOpen
                ? 'absolute bottom-full left-0 mb-2 z-50 flex flex-col rounded-xl border border-border bg-popover p-2 shadow-lg'
                : 'hidden sm:flex',
            )}
          >
            <ChatAutomationPicker
              quickReplies={quickReplies}
              workflows={workflows}
              onSendQuickReply={onSendQuickReply}
              onSendWorkflow={onSendWorkflow}
            />
            <AttachmentMenu onComposeMediaChange={onComposeMediaChange} maxBase64MB={8} />
            {onToggleNoteMode && session && !isRecording && !isPreviewingAudio && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => { onToggleNoteMode(); setInputMenuOpen(false); }}
                className={cn(
                  'h-8 w-8 rounded-full shrink-0 transition-colors',
                  noteMode
                    ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
                aria-label="Nota interna"
                title={noteMode ? 'Desactivar nota interna' : 'Nota interna'}
              >
                <Lock className="w-4 h-4" />
              </Button>
            )}
            {!isRecording && !isPreviewingAudio && onGenerateSuggestion && (
              <Button
                onClick={() => { onGenerateSuggestion(); setInputMenuOpen(false); }}
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full shrink-0 text-violet-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950"
                aria-label="Generar respuesta sugerida con IA"
                title="Generar sugerencia con IA"
                type="button"
              >
                <Sparkles className="w-4 h-4" />
              </Button>
            )}
            {!isRecording && !isPreviewingAudio && (
              <div className="relative" ref={emojiRef}>
                <Button
                  onClick={() => setEmojiOpen((v) => !v)}
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Emojis"
                  title="Emojis"
                  type="button"
                >
                  <SmilePlus className="w-4 h-4" />
                </Button>
                {emojiOpen && (
                  <div className="absolute bottom-9 left-0 z-50">
                    <EmojiPickerPanel onSelect={insertEmoji} />
                  </div>
                )}
              </div>
            )}
          </div>
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
              ? 'Pie de foto (opcional)...'
              : noteMode
                ? 'Nota interna (solo visible para el equipo)...'
                : 'Escribe... (/ atajos)'
          }
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyPress}
          onPaste={handlePaste}
          disabled={!isInputActive}
          rows={1}
          aria-label="Escribe tu mensaje"
          className={cn(
            'min-h-10 rounded-xl w-full shadow-sm',
            'pl-4 pr-24 py-2 resize-none overflow-y-auto text-sm leading-relaxed',
            'transition-[height] duration-100 ease-out',
            noteMode
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none'
              : 'bg-white dark:bg-gray-800 dark:text-white border border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
          )}
        />

        <div className="absolute right-1.5 flex flex-row items-center gap-1 bottom-1.5">
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
            onClick={noteMode ? () => void handleSendNote() : onSend}
            size="icon"
            className={cn(
              "h-7 w-7 rounded-full shrink-0",
              noteMode ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-500 hover:bg-blue-600",
            )}
            aria-label={noteMode ? "Guardar nota" : "Enviar"}
            title={noteMode ? "Guardar nota interna" : "Enviar"}
            disabled={noteMode ? !input.trim() : (!isPreviewingAudio && !isSendButtonVisible)}
            type="button"
          >
            {noteMode ? <Lock className="w-3.5 h-3.5 text-white" /> : <SendIcon className="w-3.5 h-3.5 text-white" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
