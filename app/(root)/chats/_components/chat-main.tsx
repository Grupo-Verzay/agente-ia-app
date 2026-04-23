'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import type { EvolutionMessage } from '@/actions/chat-actions';
import type { ChatQuickReplyOption, ChatToolActionResult, ChatWorkflowOption } from '@/types/chat';
import type { Session, SimpleTag } from '@/types/session';

import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBar } from './ChatInputBar';
import { ContactEditDialog } from './ContactEditDialog';
import { useChatSession } from './hooks/useChatSession';
import { useAudioRecording } from './hooks/useAudioRecording';
import { useMediaCache } from './hooks/useMediaCache';
import { toUIMessages } from './chat-message-utils';
import type { ComposeMedia } from './attachment-menu';
import type {
  ChatHeader as ChatHeaderData,
  ChatInfoMeta,
  MediaData,
  OutgoingMessagePayload,
  UIBubble,
} from './chat-message-types';
import { getDisplayWhatsappFromSession } from '../../crm/dashboard/helpers';

/* ─── Re-exports para compatibilidad con chats-client ─── */
export type { OutgoingMessagePayload };

type ChatMainProps = {
  userId: string;
  header: ChatHeaderData;
  messages: EvolutionMessage[];
  info?: ChatInfoMeta;
  loading?: boolean;
  onSend: (payload: OutgoingMessagePayload) => void | Promise<void>;
  onSendWorkflow: (workflowId: string) => Promise<ChatToolActionResult>;
  onSendQuickReply: (quickReplyId: number) => Promise<ChatToolActionResult>;
  onBackToList: () => void;
  allTags: SimpleTag[];
  workflows: ChatWorkflowOption[];
  quickReplies: ChatQuickReplyOption[];
  onSessionResolved?: (remoteJid: string, session: Session | null) => void;
  onSessionTagsChange?: (remoteJid: string, selectedIds: number[]) => void;
};

export const ChatMain: React.FC<ChatMainProps> = ({
  header,
  messages,
  info,
  loading,
  onSend,
  onSendQuickReply,
  onSendWorkflow,
  onBackToList,
  quickReplies,
  userId,
  allTags,
  workflows,
  onSessionResolved,
  onSessionTagsChange,
}) => {
  /* ─── Refs ─── */
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ─── Input & compose state ─── */
  const [input, setInput] = useState('');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [composeMedia, setComposeMedia] = useState<ComposeMedia | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [tempMessage, setTempMessage] = useState<UIBubble | null>(null);
  const [isContactEditorOpen, setIsContactEditorOpen] = useState(false);

  /* ─── Custom hooks ─── */
  const {
    session,
    contactNameDraft,
    isContactUpdatePending,
    setContactNameDraft,
    refreshSessionStatus,
    mutateSessionStatus,
    handleSaveContactName,
  } = useChatSession({
    userId,
    remoteJid: info?.remoteJid,
    remoteJidAliases: info?.remoteJidAliases,
    onSessionResolved,
  });

  const {
    isRecording,
    recordSecs,
    recordedAudio,
    startRecording,
    stopRecordingAndPreview,
    cancelRecording,
    clearRecordedAudio,
  } = useAudioRecording(isSending);

  const { mediaCacheRef, mediaCacheTick } = useMediaCache({
    messages,
    instanceName: info?.instanceName,
    apiKeyData: info?.apiKeyData,
    cacheResetKey: info?.remoteJid,
  });

  /* ─── Derived display values ─── */
  const displayedContactName = session?.pushName?.trim() || header.name;
  const displayedWhatsapp = session
    ? getDisplayWhatsappFromSession(session)
    : info?.remoteJid?.includes('@')
      ? info.remoteJid.split('@')[0]
      : info?.remoteJid || '';

  /* ─── Message list ─── */
  const reversed = useMemo(() => messages.slice().reverse(), [messages]);
  const uiMessages = useMemo(() => {
    void mediaCacheTick;
    return toUIMessages(reversed, header.avatarSrc, mediaCacheRef.current);
  }, [reversed, header.avatarSrc, mediaCacheTick, mediaCacheRef]);

  /* ─── Auto scroll to bottom ─── */
  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    scrollToBottom();
  }, [uiMessages.length, tempMessage, scrollToBottom]);

  /* ─── Textarea auto-resize ─── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  /* ─── Compose handlers ─── */
  const handleComposeMediaChange = useCallback((m: ComposeMedia | null) => {
    setComposeMedia(m);
    if (m) setInput('');
  }, []);

  const handleClearComposeMedia = useCallback(() => setComposeMedia(null), []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    if (value.startsWith('/') && value.length > 1) {
      setSlashQuery(value.slice(1).toLowerCase());
      setSlashOpen(true);
    } else {
      setSlashOpen(false);
    }
  }, []);

  const applySlashSuggestion = useCallback((message: string) => {
    setInput(message);
    setSlashOpen(false);
    textareaRef.current?.focus();
  }, []);

  const slashSuggestions = useMemo(() => {
    if (!slashOpen) return [];
    return quickReplies.filter((qr) => qr.name && qr.name.toLowerCase().startsWith(slashQuery));
  }, [slashOpen, slashQuery, quickReplies]);

  /* ─── Send ─── */
  const sendNow = useCallback(async () => {
    let payload: OutgoingMessagePayload | null = null;
    let content = '';
    let media: MediaData | undefined;

    if (recordedAudio) {
      payload = {
        kind: 'media',
        mediatype: 'audio',
        mediaUrl: recordedAudio.base64Pure,
        mimetype: recordedAudio.mimetype,
        ptt: true,
      };
      media = {
        type: 'audio',
        url: recordedAudio.dataUrlWithPrefix,
        mimeType: recordedAudio.mimetype,
      };
      clearRecordedAudio();
    } else if (composeMedia) {
      const caption = input.trim() || '';
      payload = {
        kind: 'media',
        mediatype: composeMedia.mediatype,
        mediaUrl: composeMedia.dataUrl,
        mimetype: composeMedia.mimeType,
        fileName: composeMedia.fileName,
        caption,
      };
      content = caption;
      media = {
        type: composeMedia.mediatype,
        url: composeMedia.dataUrl,
        mimeType: composeMedia.mimeType,
        caption,
      };
      setInput('');
      setComposeMedia(null);
    } else {
      const text = input.trim();
      if (!text) return;
      payload = { kind: 'text', text };
      content = text;
      setInput('');
    }

    if (!payload) return;

    const tempMsg: UIBubble = {
      id: `temp-${Date.now()}`,
      sender: 'user',
      content,
      avatarSrc: '/user-avatar.png',
      ts: Date.now(),
      media,
      status: 'sending',
    };
    setTempMessage(tempMsg);
    setIsSending(true);

    try {
      await onSend(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    } finally {
      setIsSending(false);
      setTempMessage(null);
    }
  }, [recordedAudio, composeMedia, input, onSend, clearRecordedAudio]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashOpen && e.key === 'Escape') {
        setSlashOpen(false);
        return;
      }
      if (!isRecording && !recordedAudio && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendNow();
      }
    },
    [sendNow, isRecording, recordedAudio, slashOpen],
  );

  return (
    <div className="flex flex-col h-[95%] md:h-full w-full min-w-[100px] border-l border-r">
      <ChatHeader
        header={header}
        session={session}
        userId={userId}
        allTags={allTags}
        displayedContactName={displayedContactName}
        displayedWhatsapp={displayedWhatsapp}
        remoteJid={info?.remoteJid}
        onBackToList={onBackToList}
        onOpenContactEditor={() => setIsContactEditorOpen(true)}
        onSessionTagsChange={onSessionTagsChange}
        onSessionMutate={mutateSessionStatus}
        onSessionRefresh={refreshSessionStatus}
      />

      <ContactEditDialog
        open={isContactEditorOpen}
        onOpenChange={setIsContactEditorOpen}
        currentName={displayedContactName}
        phoneLabel={displayedWhatsapp}
        draft={contactNameDraft}
        onDraftChange={setContactNameDraft}
        onSave={async () => {
          const ok = await handleSaveContactName();
          if (ok) setIsContactEditorOpen(false);
        }}
        isPending={isContactUpdatePending}
      />

      <ChatMessageList
        uiMessages={uiMessages}
        loading={loading}
        listRef={listRef}
        tempMessage={tempMessage}
      />

      <ChatInputBar
        input={input}
        composeMedia={composeMedia}
        isRecording={isRecording}
        recordSecs={recordSecs}
        recordedAudio={recordedAudio}
        isSending={isSending}
        session={session}
        quickReplies={quickReplies}
        workflows={workflows}
        textareaRef={textareaRef}
        slashOpen={slashOpen}
        slashSuggestions={slashSuggestions}
        onInputChange={handleInputChange}
        onKeyPress={handleKeyPress}
        onComposeMediaChange={handleComposeMediaChange}
        onClearComposeMedia={handleClearComposeMedia}
        onStartRecording={startRecording}
        onStopRecordingAndPreview={stopRecordingAndPreview}
        onCancelRecording={cancelRecording}
        onSend={() => void sendNow()}
        onApplySlashSuggestion={applySlashSuggestion}
        onSendQuickReply={onSendQuickReply}
        onSendWorkflow={onSendWorkflow}
        onSessionMutate={mutateSessionStatus}
      />
    </div>
  );
};
