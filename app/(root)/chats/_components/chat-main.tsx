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
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import type { EvolutionMessage } from '@/actions/chat-actions';
import type { ChatQuickReplyOption, ChatToolActionResult, ChatWorkflowOption } from '@/types/chat';
import type { Session, SimpleTag } from '@/types/session';
import type { AdvisorInfo } from '@/actions/team-actions';

import { reactToMessageAction, deleteMessageAction } from '@/actions/chat-manual-actions';
import { generateSuggestedReplyAction } from '@/actions/ai-suggested-reply-action';
import { getAiMessageContentsAction } from '@/actions/ai-message-contents-action';
import {
  createInternalNoteAction,
  deleteInternalNoteAction,
  getInternalNotesBySessionAction,
  type InternalNoteData,
} from '@/actions/internal-notes-actions';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBar } from './ChatInputBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SuggestedReplyBar } from './SuggestedReplyBar';
import { ContactEditDialog } from './ContactEditDialog';
import { ContactInfoPanel } from './ContactInfoPanel';
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
  advisors?: AdvisorInfo[];
  currentAdvisorId?: string;
  advisorRole?: string | null;
  assignedAdvisorId?: string | null;
  onAssignAdvisor?: (advisorId: string | null) => Promise<void>;
  onNewMessage?: () => void;
  onLoadOlderMessages?: () => Promise<void>;
  canLoadOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onInfoPanelChange?: (open: boolean) => void;
  closeInfoPanelSignal?: number;
  onExpandChatList?: () => void;
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
  advisors,
  currentAdvisorId,
  advisorRole,
  assignedAdvisorId,
  onAssignAdvisor,
  onNewMessage,
  onLoadOlderMessages,
  canLoadOlderMessages,
  loadingOlderMessages,
  onInfoPanelChange,
  closeInfoPanelSignal,
  onExpandChatList,
}) => {
  /* ─── Refs ─── */
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipNextAutoScrollRef = useRef(false);

  /* ─── Input & compose state ─── */
  const [input, setInput] = useState('');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [composeMediaList, setComposeMediaList] = useState<ComposeMedia[]>([]);
  const [replyTo, setReplyTo] = useState<UIBubble | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [tempMessage, setTempMessage] = useState<UIBubble | null>(null);
  const [isContactEditorOpen, setIsContactEditorOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [infoPanelOpen, setInfoPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('chat-info-panel') !== 'false';
  });

  useEffect(() => {
    onInfoPanelChange?.(infoPanelOpen);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!closeInfoPanelSignal) return;
    setInfoPanelOpen(false);
    localStorage.setItem('chat-info-panel', 'false');
    onInfoPanelChange?.(false);
  }, [closeInfoPanelSignal, onInfoPanelChange]);

  /* ─── Note mode state ─── */
  const [noteMode, setNoteMode] = useState(false);
  const [notes, setNotes] = useState<InternalNoteData[]>([]);

  /* ─── AI message contents ─── */
  const [aiContents, setAiContents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!info?.instanceName || !info?.remoteJid) return;
    getAiMessageContentsAction(info.instanceName, info.remoteJid).then(setAiContents);
  }, [info?.instanceName, info?.remoteJid, messages.length]);

  /* ─── AI suggested reply state ─── */
  const [suggestion, setSuggestion] = useState('');
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState(false);

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
    : info?.remoteJid?.toLowerCase().endsWith('@lid')
      ? ''
      : info?.remoteJid?.includes('@')
        ? info.remoteJid.split('@')[0]
        : info?.remoteJid || '';

  /* ─── Message list ─── */
  const reversed = useMemo(() => messages.slice().reverse(), [messages]);
  const uiMessages = useMemo(() => {
    void mediaCacheTick;
    const all = toUIMessages(reversed, header.avatarSrc, mediaCacheRef.current);
    const filtered = deletedIds.size > 0 ? all.filter((m) => !deletedIds.has(m.id)) : all;
    if (aiContents.size === 0) return filtered;
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    return filtered.map((m) =>
      m.sender === 'user' && m.content && aiContents.has(normalize(m.content))
        ? { ...m, sentByAi: true }
        : m,
    );
  }, [reversed, header.avatarSrc, mediaCacheTick, mediaCacheRef, deletedIds, aiContents]);

  /* ─── Load notes when session changes ─── */
  useEffect(() => {
    if (!session?.id) return;
    let cancelled = false;
    getInternalNotesBySessionAction(session.id).then((res) => {
      if (!cancelled && res.success && res.data) setNotes(res.data);
    });
    return () => { cancelled = true; };
  }, [session?.id]);

  /* ─── Convert notes to UIBubbles and merge with messages ─── */
  const noteBubbles = useMemo<UIBubble[]>(
    () =>
      notes.map((n) => ({
        id: `note-${n.id}`,
        sender: n.authorId === userId ? ('user' as const) : ('other' as const),
        content: n.content,
        ts: new Date(n.createdAt).getTime(),
        isNote: true,
        noteAuthorName: n.authorName,
        noteAuthorEmail: n.authorEmail,
        noteId: n.id,
      })),
    [notes, userId],
  );

  const allMessages = useMemo<UIBubble[]>(() => {
    const combined = [...uiMessages, ...noteBubbles];
    combined.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    return combined;
  }, [uiMessages, noteBubbles]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return allMessages.filter((message) =>
      message.content?.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [allMessages, normalizedSearchQuery]);
  const searchMatchIds = useMemo(
    () => new Set(searchMatches.map((message) => message.id)),
    [searchMatches],
  );
  const activeSearchMessageId = searchMatches[activeSearchIndex]?.id;

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [normalizedSearchQuery, info?.remoteJid]);

  useEffect(() => {
    if (activeSearchIndex < searchMatches.length) return;
    setActiveSearchIndex(Math.max(0, searchMatches.length - 1));
  }, [activeSearchIndex, searchMatches.length]);

  useEffect(() => {
    if (!activeSearchMessageId) return;
    const activeElement = listRef.current?.querySelector('[data-search-active="true"]');
    activeElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeSearchMessageId]);

  const handleToggleSearch = useCallback(() => {
    setSearchOpen((current) => {
      const next = !current;
      if (!next) {
        setSearchQuery('');
        setActiveSearchIndex(0);
      }
      return next;
    });
  }, []);

  const goToPreviousSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setActiveSearchIndex((current) =>
      current <= 0 ? searchMatches.length - 1 : current - 1,
    );
  }, [searchMatches.length]);

  const goToNextSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setActiveSearchIndex((current) =>
      current >= searchMatches.length - 1 ? 0 : current + 1,
    );
  }, [searchMatches.length]);

  /* ─── Auto scroll to bottom ─── */
  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    if (loadingOlderMessages) {
      skipNextAutoScrollRef.current = true;
      return;
    }
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    scrollToBottom();
  }, [allMessages.length, loadingOlderMessages, tempMessage, scrollToBottom]);

  /* ─── Textarea auto-resize ─── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  /* ─── AI suggested reply ─── */
  const generateSuggestion = useCallback(async () => {
    if (!userId || messages.length === 0) return;
    setSuggestion('');
    setSuggestionError(false);
    setIsGeneratingSuggestion(true);
    try {
      const result = await generateSuggestedReplyAction({
        userId,
        messages,
        contactName: header.name || null,
      });
      if (result.success && result.data?.reply) {
        setSuggestion(result.data.reply);
      } else {
        setSuggestionError(true);
      }
    } catch {
      setSuggestionError(true);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  }, [userId, messages, header.name]);


  /* ─── Note handlers ─── */
  const handleToggleNoteMode = useCallback(() => setNoteMode((v) => !v), []);

  const handleSendNote = useCallback(
    async (content: string) => {
      if (!session?.id) return;
      const res = await createInternalNoteAction({ sessionId: session.id, content });
      if (res.success && res.data) {
        setNotes((prev) => [...prev, res.data!]);
        setInput('');
      } else {
        toast.error(res.message);
      }
    },
    [session?.id],
  );

  const handleDeleteNote = useCallback(async (noteId: number) => {
    const res = await deleteInternalNoteAction(noteId);
    if (res.success) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } else {
      toast.error(res.message);
    }
  }, []);

  /* ─── Compose handlers ─── */
  const handleAddComposeMedia = useCallback((m: ComposeMedia) => {
    setComposeMediaList((prev) => prev.length >= 4 ? prev : [...prev, m]);
    setInput('');
  }, []);

  const handleRemoveComposeMedia = useCallback((index: number) => {
    setComposeMediaList((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

  /* ─── Message actions ─── */
  const handleCopyMessage = useCallback((bubble: UIBubble) => {
    const text = bubble.media
      ? `[${bubble.media.type}]${bubble.content ? ` ${bubble.content}` : ''}`
      : bubble.content;
    void navigator.clipboard.writeText(text).then(() => toast.success('Copiado al portapapeles.'));
  }, []);

  const handleReactMessage = useCallback(async (bubble: UIBubble, emoji: string) => {
    if (!info?.apiKeyData || !info.instanceName || !info.remoteJid) return;
    const result = await reactToMessageAction(
      { apiKeyData: info.apiKeyData, instanceName: info.instanceName },
      info.remoteJid,
      bubble.id,
      bubble.sender === 'user',
      emoji,
    );
    if (!result.success) toast.error(result.message);
  }, [info]);

  const handleDeleteMessage = useCallback(async (bubble: UIBubble) => {
    if (!info?.apiKeyData || !info.instanceName || !info.remoteJid) return;
    setDeletedIds((prev) => new Set(prev).add(bubble.id));
    const result = await deleteMessageAction(
      { apiKeyData: info.apiKeyData, instanceName: info.instanceName },
      info.remoteJid,
      bubble.id,
      bubble.sender === 'user',
    );
    if (!result.success) {
      setDeletedIds((prev) => { const next = new Set(prev); next.delete(bubble.id); return next; });
      toast.error(result.message);
    } else {
      toast.success('Mensaje eliminado.');
    }
  }, [info]);

  /* ─── Send ─── */
  const sendNow = useCallback(async () => {
    let payload: OutgoingMessagePayload | null = null;
    let content = '';
    let media: MediaData | undefined;

    const quotedMessage = replyTo
      ? { key: { id: replyTo.id }, message: { conversation: replyTo.content } }
      : undefined;

    if (recordedAudio) {
      payload = {
        kind: 'media',
        mediatype: 'audio',
        mediaUrl: recordedAudio.base64Pure,
        mimetype: recordedAudio.mimetype,
        ptt: true,
        quotedMessage,
      };
      media = {
        type: 'audio',
        url: recordedAudio.dataUrlWithPrefix,
        mimeType: recordedAudio.mimetype,
      };
      clearRecordedAudio();
    } else if (composeMediaList.length > 0) {
      const listToSend = [...composeMediaList];
      const caption = input.trim() || '';
      setInput('');
      setComposeMediaList([]);
      setReplyTo(null);
      setSuggestion('');
      setSuggestionError(false);
      setIsSending(true);
      setTempMessage({
        id: `temp-${Date.now()}`,
        sender: 'user',
        content: caption,
        avatarSrc: '/user-avatar.png',
        ts: Date.now(),
        media: { type: listToSend[0].mediatype, url: listToSend[0].dataUrl, mimeType: listToSend[0].mimeType, caption },
        status: 'sending',
      });
      try {
        for (let i = 0; i < listToSend.length; i++) {
          const m = listToSend[i];
          await onSend({
            kind: 'media',
            mediatype: m.mediatype,
            mediaUrl: m.dataUrl,
            mimetype: m.mimeType,
            fileName: m.fileName,
            caption: i === 0 ? caption : '',
            quotedMessage: i === 0 ? quotedMessage : undefined,
          });
        }
        mutateSessionStatus();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
      } finally {
        setIsSending(false);
        setTempMessage(null);
      }
      return;
    } else {
      const text = input.trim();
      if (!text) return;
      payload = { kind: 'text', text, quotedMessage };
      content = text;
      setInput('');
    }

    if (!payload) return;
    setReplyTo(null);
    setSuggestion('');
    setSuggestionError(false);

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
      mutateSessionStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    } finally {
      setIsSending(false);
      setTempMessage(null);
    }
  }, [replyTo, recordedAudio, composeMediaList, input, onSend, clearRecordedAudio, mutateSessionStatus]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashOpen && e.key === 'Escape') {
        setSlashOpen(false);
        return;
      }
      if (!isRecording && !recordedAudio && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (noteMode) {
          void handleSendNote(input.trim());
        } else {
          void sendNow();
        }
      }
    },
    [sendNow, handleSendNote, isRecording, recordedAudio, slashOpen, noteMode, input],
  );

  const toggleInfoPanel = useCallback(() => {
    setInfoPanelOpen((v) => {
      const next = !v;
      localStorage.setItem('chat-info-panel', String(next));
      onInfoPanelChange?.(next);
      return next;
    });
  }, [onInfoPanelChange]);

  return (
    <div className="flex h-full w-full min-w-[100px] sm:border-l sm:border-r overflow-hidden">
      {/* ── Chat area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
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
        advisors={advisors}
        currentAdvisorId={currentAdvisorId}
        advisorRole={advisorRole}
        assignedAdvisorId={assignedAdvisorId}
        onAssignAdvisor={onAssignAdvisor}
        onNewMessage={onNewMessage}
        infoPanelOpen={infoPanelOpen}
        onToggleInfoPanel={toggleInfoPanel}
        searchOpen={searchOpen}
        onToggleSearch={handleToggleSearch}
        onExpandChatList={onExpandChatList}
      />

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-background/95 px-3 py-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar en este chat..."
              className="h-9 rounded-lg pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
          <span className="min-w-[4.5rem] text-center text-xs text-muted-foreground">
            {normalizedSearchQuery
              ? searchMatches.length > 0
                ? `${activeSearchIndex + 1}/${searchMatches.length}`
                : '0/0'
              : '-'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={searchMatches.length === 0}
            onClick={goToPreviousSearchMatch}
            title="Resultado anterior"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={searchMatches.length === 0}
            onClick={goToNextSearchMatch}
            title="Resultado siguiente"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleToggleSearch}
            title="Cerrar busqueda"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

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
        uiMessages={allMessages}
        loading={loading}
        listRef={listRef}
        tempMessage={tempMessage}
        onSetReplyTo={setReplyTo}
        onCopyMessage={handleCopyMessage}
        onReactMessage={handleReactMessage}
        onDeleteMessage={!advisorRole || advisorRole === 'administrador' ? handleDeleteMessage : undefined}
        onDeleteNote={handleDeleteNote}
        onLoadOlderMessages={onLoadOlderMessages}
        canLoadOlderMessages={canLoadOlderMessages}
        loadingOlderMessages={loadingOlderMessages}
        searchMatchIds={searchMatchIds}
        activeSearchMessageId={activeSearchMessageId}
      />

      <SuggestedReplyBar
        suggestion={suggestion}
        isLoading={isGeneratingSuggestion}
        hasError={suggestionError}
        onUse={(text) => {
          setInput(text);
          setSuggestion('');
          setSuggestionError(false);
          textareaRef.current?.focus();
        }}
        onRegenerate={() => void generateSuggestion()}
        onDismiss={() => {
          setSuggestion('');
          setSuggestionError(false);
          setIsGeneratingSuggestion(false);
        }}
      />

      <ChatInputBar
        input={input}
        composeMediaList={composeMediaList}
        replyTo={replyTo}
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
        onAddComposeMedia={handleAddComposeMedia}
        onRemoveComposeMedia={handleRemoveComposeMedia}
        onClearReplyTo={() => setReplyTo(null)}
        onStartRecording={startRecording}
        onStopRecordingAndPreview={stopRecordingAndPreview}
        onCancelRecording={cancelRecording}
        onSend={() => void sendNow()}
        onApplySlashSuggestion={applySlashSuggestion}
        onSendQuickReply={onSendQuickReply}
        onSendWorkflow={onSendWorkflow}
        onSessionMutate={mutateSessionStatus}
        onGenerateSuggestion={() => void generateSuggestion()}
        noteMode={noteMode}
        onToggleNoteMode={handleToggleNoteMode}
        onSendNote={handleSendNote}
      />
      </div>{/* end chat area */}

      {/* ── Contact info panel (desktop only) ── */}
      {infoPanelOpen && session && (
        <ContactInfoPanel
          session={session}
          displayedContactName={displayedContactName}
          displayedWhatsapp={displayedWhatsapp}
          avatarSrc={header.avatarSrc}
          userId={userId}
          remoteJid={info?.remoteJid}
          notesCount={notes.length}
          onClose={toggleInfoPanel}
          onSessionMutate={mutateSessionStatus}
          onSessionRefresh={refreshSessionStatus}
        />
      )}
    </div>
  );
};
