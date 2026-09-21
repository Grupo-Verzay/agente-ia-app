'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowRight, AudioLines, Check, Lock, Mic, Plus, PenLine, Send, SendIcon, SmilePlus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SafeImage } from '@/components/custom/SafeImage';
import { AttachmentMenu } from './attachment-menu';
import { ChatAutomationPicker } from './ChatAutomationPicker';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import { SwitchStatus } from '../../sessions/_components/SwitchStatus';
import type { MetaTemplateOption } from '@/actions/channel-chat-actions';
import { cn } from '@/lib/utils';
import { formatSecs } from './chat-message-utils';
import {
  getAdvisorSignatureAction,
  toggleSessionSignatureAction,
  updateAdvisorSignatureAction,
} from '@/actions/chat-manual-actions';
import { EmojiPickerPanel } from '@/components/shared/EmojiPickerPanel';
import { FormatoDeTexto } from '@/components/shared/FormatoDeTexto';
import { EditorDeImagen } from './EditorDeImagen';
import { envolverSeleccion } from '@/lib/formato-whatsapp';
// La forma de la barra —la columna flotante, los botones redondos— vive en un
// solo sitio: la del chat de equipo es la misma, y escrita a mano en los dos,
// el dia que se afine una la otra se queda atras.
import {
  BOTON_DE_ENVIAR,
  BOTON_DE_HERRAMIENTA,
  BOTON_REDONDO_GRABANDO,
  archivosDelPortapapeles,
} from '@/lib/barra-de-escribir';
// El «+» con sus herramientas, el ancho que decide si van en fila, y los
// botones redondos de la derecha: los mismos que pinta el chat de equipo.
// Escritos dos veces, aquel acabó con el dictado en un icono de texto y sin
// pegar desde el portapapeles.
import {
  BotonesDeLaDerecha,
  ZonaDeHerramientas,
  rellenoParaLosBotones,
  useBarraCompacta,
} from '@/components/shared/BarraDeEscribir';
import { useSpeechDictation } from '@/hooks/useSpeechDictation';
import type { ComposeMedia } from './attachment-menu';
import type { ChatQuickReplyOption, ChatToolActionResult, ChatWorkflowOption } from '@/types/chat';
import type { Session } from '@/types/session';
import type { RecordedAudioData, UIBubble } from './chat-message-types';
import { getQuickReplyCategoryClass, getQuickReplyCategoryLabel } from '@/lib/quick-reply-categories';

interface ChatInputBarProps {
  input: string;
  composeMediaList: ComposeMedia[];
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
  mentionOpen?: boolean;
  mentionSuggestions?: { id: string; name: string | null; email?: string | null }[];
  onApplyMention?: (advisor: { id: string; name: string | null; email?: string | null }) => void;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onAddComposeMedia: (media: ComposeMedia) => void;
  onRemoveComposeMedia: (index: number) => void;
  /** Sustituye la foto por su version editada. Opcional: sin esto no sale el lapiz. */
  onReplaceComposeMedia?: (index: number, dataUrl: string) => void;
  onClearReplyTo: () => void;
  onStartRecording: () => void;
  onStopRecordingAndPreview: () => void;
  onCancelRecording: () => void;
  onSend: () => void;
  onApplySlashSuggestion: (message: string) => void;
  onSendQuickReply: (quickReplyId: number) => Promise<ChatToolActionResult>;
  onSendWorkflow: (workflowId: string) => Promise<ChatToolActionResult>;
  instanceType?: string;
  instanceName?: string;
  onSendTemplate?: (
    template: MetaTemplateOption,
    params: string[],
  ) => Promise<{ success: boolean; message?: string }>;
  onSessionMutate: () => void;
  /** El interruptor de la IA cambio: para pintarlo al momento en la lista. */
  onSessionStatusChange?: (status: boolean) => void;
  onGenerateSuggestion?: () => void;
  noteMode?: boolean;
  onToggleNoteMode?: () => void;
  onSendNote?: (content: string) => Promise<void>;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  input,
  composeMediaList,
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
  mentionOpen = false,
  mentionSuggestions = [],
  onApplyMention,
  onInputChange,
  onKeyPress,
  onAddComposeMedia,
  onRemoveComposeMedia,
  onReplaceComposeMedia,
  onClearReplyTo,
  onStartRecording,
  onStopRecordingAndPreview,
  onCancelRecording,
  onSend,
  onApplySlashSuggestion,
  onSendQuickReply,
  onSendWorkflow,
  instanceType,
  instanceName,
  onSendTemplate,
  onSessionMutate,
  onSessionStatusChange,
  onGenerateSuggestion,
  noteMode = false,
  onToggleNoteMode,
  onSendNote,
}) => {
  const [signatureText, setSignatureText] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Qué adjunto se está editando, o null. El editor es un paso opcional: si no
  // se abre, adjuntar y enviar funcionan igual que siempre.
  const [editando, setEditando] = useState<number | null>(null);
  const [inputMenuOpen, setInputMenuOpen] = useState(false);
  const [rightMenuOpen, setRightMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const rightMenuRef = useRef<HTMLDivElement>(null);

  // Si la barra va plegada, MEDIDO — y con la misma función que el chat de
  // equipo, que es lo que hace que las dos se vean igual con el mismo ancho.
  const { compacta: isCompactToolbar, medir: medirLaBarra } = useBarraCompacta();

  useEffect(() => {
    if (!isCompactToolbar) {
      setInputMenuOpen(false);
      setRightMenuOpen(false);
    }
  }, [isCompactToolbar]);

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

  useEffect(() => {
    if (!rightMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (rightMenuRef.current && !rightMenuRef.current.contains(e.target as Node)) {
        setRightMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [rightMenuOpen]);

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

  /**
   * Pone (o quita) una marca de formato de WhatsApp sobre lo seleccionado.
   *
   * Va por el mismo canal que el emoji —un evento sintetico a `onInputChange`—
   * porque el texto lo guarda el padre. Y devuelve la seleccion a donde estaba
   * en un `setTimeout(0)`, por lo mismo que hace `insertEmoji`: React todavia no
   * ha repintado el `value`, asi que tocar `selectionStart` antes no sirve de
   * nada.
   */
  const aplicarFormato = useCallback((marca: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const r = envolverSeleccion(
      input,
      textarea.selectionStart ?? input.length,
      textarea.selectionEnd ?? input.length,
      marca,
    );
    if (r.texto === input) return;
    onInputChange({ target: { value: r.texto } } as React.ChangeEvent<HTMLTextAreaElement>);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = r.inicio;
      textarea.selectionEnd = r.fin;
    }, 0);
  }, [input, onInputChange, textareaRef]);

  /**
   * Los atajos de teclado, delante del manejador de siempre.
   *
   * Se envuelve `onKeyPress` en vez de sustituirlo: ese es el que manda el
   * mensaje con Enter y el que mueve las sugerencias de `/` y de `@`. Aqui solo
   * se atienden las tres combinaciones de formato; **todo lo demas pasa de
   * largo, tal cual llego**.
   */
  const manejarTeclas = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      const tecla = e.key.toLowerCase();
      const marca =
        tecla === 'b' && !e.shiftKey ? '*'
        : tecla === 'i' && !e.shiftKey ? '_'
        : tecla === 'x' && e.shiftKey ? '~'
        : null;
      if (marca) {
        e.preventDefault();
        aplicarFormato(marca);
        return;
      }
    }
    onKeyPress(e);
  }, [aplicarFormato, onKeyPress]);

  // Dictado por voz (voz → texto). Escribe la transcripción en la barra usando el
  // mismo canal que el input (evento sintético a onInputChange), para editarla o
  // enviarla luego. Es independiente de la nota de voz (audio) que se manda como
  // archivo; aquí solo se convierte el habla en texto.
  const dictation = useSpeechDictation();
  const setDictatedText = useCallback(
    (value: string) => {
      onInputChange({ target: { value } } as React.ChangeEvent<HTMLTextAreaElement>);
    },
    [onInputChange],
  );
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
    // Qué trae el portapapeles lo decide `archivosDelPortapapeles`, la misma
    // función que usa el chat de equipo. Y **solo actúa si trae ficheros**: el
    // `preventDefault` va dentro de esa condición, nunca antes, o pegar texto
    // dejaría de comportarse como siempre.
    const [file] = archivosDelPortapapeles(e.clipboardData?.items, { soloImagenes: true });
    if (!file) return;

    e.preventDefault();

    if (file.size > 8 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máximo 8 MB).');
      return;
    }

    if (composeMediaList.length >= 4) {
      toast.error('Máximo 4 imágenes por mensaje.');
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

    onAddComposeMedia({
      mediatype: 'image',
      dataUrl,
      mimeType: file.type || 'image/png',
      fileName: file.name || `imagen-${Date.now()}.png`,
    });
  }, [composeMediaList.length, onAddComposeMedia]);

  const isPreviewingAudio = recordedAudio !== null && !isRecording;
  const isInputActive = !isRecording && !isPreviewingAudio && !isSending;
  const isSendButtonVisible = isInputActive && (input.trim().length > 0 || composeMediaList.length > 0);

  /**
   * El estado del que salen los botones de la derecha **y** el hueco que la
   * caja les deja. Uno solo, porque si fueran dos podrían discrepar: de más,
   * la última palabra se corta contra un hueco vacío; de menos, el texto pasa
   * por debajo del botón.
   */
  const estadoDeLaDerecha = {
    compacta: isCompactToolbar,
    conVoz: !isPreviewingAudio,
    hayDictado: dictation.supported,
    dictando: dictation.listening,
    grabando: isRecording,
    hayAlgoQueEnviar:
      isSendButtonVisible || isPreviewingAudio || (noteMode && input.trim().length > 0),
  };

  const handleSendNote = async () => {
    if (!onSendNote || !input.trim()) return;
    await onSendNote(input.trim());
  };

  // Firma del asesor — se muestra inline en desktop y dentro del menú "+" en móvil.
  // OJO: se renderiza en 2 lugares (desktop/móvil); el Popover va SIN `open`
  // controlado para que cada instancia tenga su propio estado y no se peleen.
  const signatureControl = session ? (
    <Popover onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            BOTON_DE_HERRAMIENTA,
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
  ) : null;

  return (
    // `data-barra` es la marca por la que el banco de Chromium ENCUENTRA la
    // barra para medir su ancho: lo que decide si va plegada es ese ancho
    // (`ANCHO_COMPACTO`), no el de la ventana, y sin poder medirlo el banco
    // compararía dos barras que no miden lo mismo.
    <div ref={medirLaBarra} data-barra="escribir" className={cn(
      "px-2 py-1.5 sm:px-3 sm:py-2 border-t dark:border-gray-700 transition-colors",
      noteMode
        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
        : "bg-gray-50 dark:bg-gray-900",
    )}>
      {/* Preview de respuesta a un mensaje */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 px-2.5 py-2 rounded-lg border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/50">
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

      {/* Previsualización de adjuntos */}
      {composeMediaList.length > 0 && (
        <div className="mb-2">
          {composeMediaList.length === 1 ? (
            /* 1 imagen: fila con nombre y X roja */
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-white dark:bg-gray-800">
                <SafeImage src={composeMediaList[0].dataUrl} alt={composeMediaList[0].fileName} fill sizes="40px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="truncate font-medium">{composeMediaList[0].fileName}</div>
                <div className="text-muted-foreground">{composeMediaList[0].mimeType}</div>
              </div>
              {onReplaceComposeMedia && composeMediaList[0].mediatype === 'image' && (
                <button onClick={() => setEditando(0)} aria-label="Editar foto" title="Editar foto" type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted">
                  <PenLine className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => onRemoveComposeMedia(0)} aria-label="Quitar adjunto" type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-colors hover:bg-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            /* 2-4 imágenes: grilla simétrica */
            <div className={cn(
              "grid gap-1.5",
              composeMediaList.length === 2 && "grid-cols-2",
              composeMediaList.length === 3 && "grid-cols-3",
              composeMediaList.length === 4 && "grid-cols-2",
            )}>
              {composeMediaList.map((m, i) => (
                <div key={i} className="relative h-14 overflow-hidden rounded-md border border-border bg-muted/30">
                  <SafeImage src={m.dataUrl} alt={m.fileName} fill sizes="120px" className="object-cover" />
                  <button
                    onClick={() => onRemoveComposeMedia(i)}
                    aria-label="Quitar imagen"
                    type="button"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-colors hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {onReplaceComposeMedia && m.mediatype === 'image' && (
                    <button
                      onClick={() => setEditando(i)}
                      aria-label="Editar foto"
                      title="Editar foto"
                      type="button"
                      className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-colors hover:bg-background"
                    >
                      <PenLine className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {editando !== null && composeMediaList[editando] && onReplaceComposeMedia && (
            <EditorDeImagen
              dataUrl={composeMediaList[editando].dataUrl}
              mimeType={composeMediaList[editando].mimeType}
              onCerrar={() => setEditando(null)}
              onGuardar={(nueva) => {
                onReplaceComposeMedia(editando, nueva);
                setEditando(null);
              }}
            />
          )}
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
        {/* El «+» y sus herramientas los pinta `ZonaDeHerramientas`, la misma
            que el chat de equipo: lo que cambia entre las dos barras es QUÉ
            botones van dentro, y eso entra por `children`. Lo de WhatsApp —el
            interruptor de la IA y la firma— va en `fijo`, que es lo que se
            queda fuera del menú cuando hay sitio. */}
        <ZonaDeHerramientas
          compacta={isCompactToolbar}
          abierta={inputMenuOpen}
          alAlternar={() => setInputMenuOpen((v) => !v)}
          contenedorRef={toolsRef}
          fijo={
            <>
              {session && (
                <span className="hidden md:flex items-center">
                  <SwitchStatus
                    key={`${session.id}-${session.status ? 'on' : 'off'}`}
                    sessionId={session.id ?? -1}
                    checked={session.status ?? false}
                    mutateSessions={onSessionMutate}
                    onChanged={onSessionStatusChange}
                  />
                </span>
              )}
              {signatureControl}
            </>
          }
        >
            {/* Firma — solo dentro del menú en móvil (en desktop va inline arriba) */}
            <div className={cn(isCompactToolbar ? 'block' : 'sm:hidden')}>{signatureControl}</div>
            <ChatAutomationPicker
              quickReplies={quickReplies}
              workflows={workflows}
              onSendQuickReply={onSendQuickReply}
              onSendWorkflow={onSendWorkflow}
            />
            {/* Plantillas de WhatsApp Cloud (Meta): permiten escribir fuera de la ventana de 24h */}
            {instanceType === 'meta' && instanceName && onSendTemplate && (
              <TemplatePickerDialog instanceName={instanceName} onSendTemplate={onSendTemplate} />
            )}
            <AttachmentMenu onComposeMediaChange={composeMediaList.length < 4 ? (m) => m && onAddComposeMedia(m) : undefined} maxBase64MB={8} />
            {onToggleNoteMode && session && !isRecording && !isPreviewingAudio && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => { onToggleNoteMode(); setInputMenuOpen(false); }}
                className={cn(
                  BOTON_DE_HERRAMIENTA,
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
              <FormatoDeTexto onAplicar={aplicarFormato} disabled={!isInputActive} />
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
        </ZonaDeHerramientas>

        {/* Sugerencias de @menciones (modo nota) */}
        {mentionOpen && mentionSuggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 z-20 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              Mencionar a un asesor
            </div>
            {mentionSuggestions.map((a) => (
              <button
                key={a.id}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onApplyMention?.(a);
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                  {(a.name || a.email || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium text-foreground truncate">{a.name || a.email}</span>
                {a.email && a.name && (
                  <span className="ml-auto text-xs text-muted-foreground truncate">{a.email}</span>
                )}
              </button>
            ))}
          </div>
        )}

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
                <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${getQuickReplyCategoryClass(qr.category)}`}>
                  {getQuickReplyCategoryLabel(qr.category)}
                </span>
              </button>
            ))}
          </div>
        )}

        <Textarea
          ref={textareaRef}
          placeholder={
            composeMediaList.length > 0
              ? 'Pie de foto (opcional)...'
              : noteMode
                ? 'Nota interna (solo visible para el equipo)...'
                : isCompactToolbar
                  ? '/atajos'
                  : 'Escribe... (/ atajos)'
          }
          value={input}
          onChange={onInputChange}
          onKeyDown={manejarTeclas}
          onPaste={handlePaste}
          disabled={!isInputActive}
          rows={1}
          aria-label="Escribe tu mensaje"
          className={cn(
            'min-h-10 rounded-xl w-full shadow-sm',
            'pl-4 py-2 resize-none overflow-y-auto text-base sm:text-sm leading-relaxed',
            // Sale de la MISMA lista que pinta los botones.
            rellenoParaLosBotones(estadoDeLaDerecha),
            'transition-[height] duration-100 ease-out',
            noteMode
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none'
              : 'bg-white dark:bg-gray-800 dark:text-white border border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
          )}
        />

        {/* Los botones redondos: dictado, nota de voz y enviar. **Cuáles
            salen lo decide `losBotonesDeLaDerecha`**, puro y compartido con el
            chat de equipo — donde, escrito a mano, el dictado llevaba un icono
            de texto en vez de este. */}
        <BotonesDeLaDerecha
          {...estadoDeLaDerecha}
          menuAbierto={rightMenuOpen}
          alAlternarMenu={() => setRightMenuOpen((v) => !v)}
          menuRef={rightMenuRef}
          dictado={
            dictation.supported
              ? {
                  alPulsar: () => { dictation.toggle(input, setDictatedText); setRightMenuOpen(false); },
                  deshabilitado: !isInputActive || isRecording,
                  marcado: dictation.listening,
                  etiqueta: dictation.listening ? 'Detener dictado' : 'Dictar por voz',
                  titulo: dictation.listening
                    ? 'Detener dictado'
                    : 'Dictar por voz (escribe lo que hablas)',
                  clase: dictation.listening
                    ? `${BOTON_REDONDO_GRABANDO} animate-pulse`
                    : undefined,
                  icono: (
                    <AudioLines className={cn('w-3.5 h-3.5', dictation.listening ? 'text-white' : 'text-black dark:text-white')} />
                  ),
                }
              : null
          }
          nota={{
            alPulsar: () => { (isRecording ? onStopRecordingAndPreview() : onStartRecording()); setRightMenuOpen(false); },
            marcado: isRecording,
            etiqueta: isRecording ? 'Detener grabación y previsualizar' : 'Grabar nota de voz',
            titulo: isRecording ? 'Detener y previsualizar' : 'Grabar nota de voz',
            clase: isRecording ? BOTON_REDONDO_GRABANDO : undefined,
            icono: (
              <Mic className={cn('w-3.5 h-3.5', isRecording ? 'text-white' : 'text-black dark:text-white')} />
            ),
          }}
          enviar={{
            alPulsar: () => {
              if (dictation.listening) dictation.stop();
              if (noteMode) void handleSendNote();
              else onSend();
            },
            deshabilitado: noteMode ? !input.trim() : (!isPreviewingAudio && !isSendButtonVisible),
            etiqueta: noteMode ? 'Guardar nota' : 'Enviar',
            titulo: noteMode ? 'Guardar nota interna' : 'Enviar',
            clase: noteMode ? 'bg-amber-500 hover:bg-amber-600' : BOTON_DE_ENVIAR,
            icono: noteMode
              ? <Lock className="w-3.5 h-3.5 text-white" />
              : <SendIcon className="w-3.5 h-3.5 text-white" />,
          }}
        />
      </div>
    </div>
  );
};
