'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, ClipboardList, Megaphone, PanelRightClose, PanelRightOpen, PencilLine, Pin, Phone, CheckCircle, LogOut, ChevronDown, UserPlus, UserRound, SquarePen, Search } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SwitchStatus } from '../../sessions/_components';
import { initialFromName } from './chat-message-utils';
import type { ChatHeader as ChatHeaderData } from './chat-message-types';
import type { Session, SimpleTag } from '@/types/session';
import type { AdvisorInfo } from '@/actions/team-actions';
import { AdvisorAssignBadge } from './AdvisorAssignBadge';
import { MacrosMenu } from './MacrosMenu';
import { SessionTagsCombobox } from '../../tags/components';
import { LeadStatusSelect } from './LeadStatusSelect';
import { resolveSession } from '@/actions/advisor-assign-actions';
import { addSessionParticipantAction } from '@/actions/collab-actions';
import { SintesisEditDialog } from './SintesisEditDialog';
import { ChatRegistrosBadge } from './ChatRegistrosBadge';
import { LeadContextSheet } from './LeadContextSheet';
import { CallDialog } from './CallDialog';
import { ChatAppointmentStatusButton } from './ChatAppointmentStatusButton';
import { ChatReminderDialog } from './ChatReminderDialog';
import { TaskFormDialog } from './TaskFormDialog';
import { cn } from '@/lib/utils';
import { useModuleStore } from '@/stores/modules/useModuleStore';

const PALETTE = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500','bg-fuchsia-500'];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(a: AdvisorInfo) {
  const name = a.name?.trim() || a.email;
  const parts = name.split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

interface ChatHeaderProps {
  header: ChatHeaderData;
  session: Session | null;
  userId: string;
  allTags: SimpleTag[];
  displayedContactName: string;
  displayedWhatsapp: string;
  instanceType?: string;
  instanceName?: string;
  remoteJid?: string;
  onBackToList: () => void;
  onOpenContactEditor: () => void;
  onSessionTagsChange?: (remoteJid: string, selectedIds: number[]) => void;
  onSessionMutate: () => void;
  onSessionRefresh: () => Promise<void>;
  advisors?: AdvisorInfo[];
  currentAdvisorId?: string;
  advisorRole?: string | null;
  assignedAdvisorId?: string | null;
  onAssignAdvisor?: (advisorId: string | null) => Promise<void>;
  onNewMessage?: () => void;
  onRunMacro?: (macroId: string) => Promise<void>;
  infoPanelOpen?: boolean;
  onToggleInfoPanel?: () => void;
  searchOpen?: boolean;
  onToggleSearch?: () => void;
  onExpandChatList?: () => void;
  chatView?: string;
  onChatViewChange?: (view: string) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  header,
  session,
  userId,
  allTags,
  displayedContactName,
  displayedWhatsapp,
  instanceType,
  instanceName,
  remoteJid,
  onBackToList,
  onOpenContactEditor,
  onSessionTagsChange,
  onSessionMutate,
  onSessionRefresh,
  advisors,
  currentAdvisorId,
  advisorRole,
  assignedAdvisorId,
  onAssignAdvisor,
  onNewMessage,
  onRunMacro,
  infoPanelOpen,
  onToggleInfoPanel,
  searchOpen,
  onToggleSearch,
  onExpandChatList,
  chatView,
  onChatViewChange,
}) => {
  const { userIntegrations } = useModuleStore();
  const adSource = session?.adSource as { title?: string; body?: string; sourceUrl?: string } | null | undefined;
  const adSourceLabel = adSource?.title || (adSource?.sourceUrl ? (() => { try { return new URL(adSource.sourceUrl!).hostname.replace(/^www\./, ''); } catch { return 'Anuncio'; } })() : null);

  const initialSelectedTagIds = session?.tags?.map((t) => t?.id).filter(Boolean) ?? [];
  const [resolving, setResolving] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  const isAgent = !!advisorRole;
  const isOwnerLike = !advisorRole || advisorRole === 'administrador';
  const isMySession = !!assignedAdvisorId && currentAdvisorId === assignedAdvisorId;
  const canResolve = !!session && (isOwnerLike || isMySession);
  const canLiberate = isMySession;
  const canTake = !assignedAdvisorId;
  const otherAdvisors = (advisors ?? []).filter((a) => a.id !== currentAdvisorId);
  const showLifecycleButton = session && (canResolve || canLiberate || canTake);

  const handleResolve = async () => {
    if (!session?.id || resolving) return;
    setResolving(true);
    const res = await resolveSession(session.id);
    setResolving(false);
    if (!res.success) { toast.error(res.message ?? 'Error al resolver.'); return; }
    toast.success('Conversación resuelta.');
    onSessionMutate();
    await onSessionRefresh();
  };

  const handleTake = async () => {
    await onAssignAdvisor?.(currentAdvisorId ?? null);
  };

  const handleTransfer = async (targetId: string) => {
    await onAssignAdvisor?.(targetId);
  };

  const handleAddParticipant = async (advisorId: string) => {
    if (!session?.id) return;
    const res = await addSessionParticipantAction(session.id, advisorId);
    if (res.success) {
      toast.success(
        res.message === 'Ya es participante.'
          ? 'Ese asesor ya participa en la conversación.'
          : 'Participante agregado a la conversación.',
      );
      // Avisa al panel lateral para que actualice la lista.
      window.dispatchEvent(new Event('verzay:participants-changed'));
    } else {
      toast.error(res.message);
    }
  };

  const participantCandidates = (advisors ?? []).filter((a) => a.id !== userId);

  const handleLiberate = async () => {
    await onAssignAdvisor?.(null);
  };

  const [callOpen, setCallOpen] = useState(false);
  const callDigits = (displayedWhatsapp || remoteJid || '').replace(/\D/g, '');
  const handleCall = () => {
    if (!callDigits) {
      toast.error('No hay número de WhatsApp para llamar.');
      return;
    }
    setCallOpen(true);
  };

  const sessionStatusTone = session?.status
    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
    : 'border-amber-300 bg-amber-100 text-amber-800';

  const tagsCombobox = session && (
    <SessionTagsCombobox
      userId={session.userId}
      sessionId={session.id}
      allTags={allTags}
      initialSelectedIds={initialSelectedTagIds}
      onSelectedIdsChange={(selectedIds) => {
        if (!remoteJid) return;
        onSessionTagsChange?.(remoteJid, selectedIds);
      }}
    />
  );

  const sessionToggle = session && (
    <SwitchStatus
      key={`${session.id}-${session.status ? 'on' : 'off'}`}
      sessionId={session.id}
      checked={session.status ?? false}
      mutateSessions={onSessionMutate}
    />
  );

  const advisorBadge = session && (advisors?.length ?? 0) > 0 && (
    <AdvisorAssignBadge
      assignedAdvisorId={assignedAdvisorId}
      advisors={advisors ?? []}
      advisorRole={advisorRole}
      currentAdvisorId={currentAdvisorId}
      sessionId={session.id}
      onAssign={onAssignAdvisor}
      size="md"
    />
  );

  const lifecycleButton = showLifecycleButton && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-1.5 px-2.5 text-sm"
          disabled={resolving}
        >
          Acciones
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 p-1" align="end">
        {onNewMessage && (
          <>
            <DropdownMenuItem
              onSelect={onNewMessage}
              className="flex items-center gap-2 cursor-pointer"
            >
              <SquarePen className="h-3.5 w-3.5 shrink-0" />
              Nuevo mensaje
            </DropdownMenuItem>
            <div className="my-1 border-t border-border/50" />
          </>
        )}
        {/* Tomar — para agentes/admins cuando la sesión está sin asignar */}
        {canTake && (
          <DropdownMenuItem
            onSelect={() => void handleTake()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            Tomar conversación
          </DropdownMenuItem>
        )}
        {canTake && (canLiberate || canResolve) && (
          <div className="my-1 border-t border-border/50" />
        )}

        {/* Transferir — solo para agentes con sesión propia */}
        {canLiberate && (
          <>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Transferir a...
            </p>
            {otherAdvisors.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No hay otros asesores.</p>
            ) : (
              otherAdvisors.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  onSelect={() => void handleTransfer(a.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer"
                >
                  <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0', colorFor(a.id))}>
                    {initials(a)}
                  </span>
                  <span className="truncate">{a.name ?? a.email}</span>
                </DropdownMenuItem>
              ))
            )}
            <div className="my-1 border-t border-border/50" />
          </>
        )}

        {/* Agregar participante (colaboración) */}
        {session && participantCandidates.length > 0 && (
          <>
            <div className="my-1 border-t border-border/50" />
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Agregar participante a...
            </p>
            {participantCandidates.map((a) => (
              <DropdownMenuItem
                key={`part-${a.id}`}
                onSelect={() => void handleAddParticipant(a.id)}
                className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer"
              >
                <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0', colorFor(a.id))}>
                  {initials(a)}
                </span>
                <span className="truncate">{a.name ?? a.email}</span>
              </DropdownMenuItem>
            ))}
            <div className="my-1 border-t border-border/50" />
          </>
        )}

        {/* Liberar y Resolver en lista vertical */}
        {canLiberate && (
          <DropdownMenuItem
            onSelect={() => void handleLiberate()}
            className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Liberar conversación
          </DropdownMenuItem>
        )}
        {canResolve && (
          <DropdownMenuItem
            onSelect={() => void handleResolve()}
            className="flex items-center gap-2 cursor-pointer text-emerald-700 dark:text-emerald-400 focus:text-emerald-700 dark:focus:text-emerald-400 focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            Resolver conversación
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const macrosMenu = session && onRunMacro ? <MacrosMenu onRunMacro={onRunMacro} /> : null;

  return (
    <div className="sticky top-0 z-10 border-b border-border/40 bg-gradient-to-r from-background to-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/50">
      {/* ── Mobile ── */}
      <div className="md:hidden px-2 py-2 space-y-2">
        {/* Fila única: volver + avatar + nombre + activa + acciones */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onBackToList}
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full hover:bg-muted flex-shrink-0 -ml-1"
            title="Volver"
            aria-label="Volver"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
          </Button>

          <Avatar className="w-8 h-8 ring-2 ring-border flex-shrink-0">
            <AvatarImage src={header.avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-xs font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>

          {/* Alto FIJO + centrado → header mide igual con o sin el subtítulo del anuncio. */}
          <div className="flex h-9 min-w-0 flex-1 flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-1">
              {header.isPinned && (
                <Pin className="h-3 w-3 fill-current text-amber-500 flex-shrink-0" />
              )}
              <h2 className="truncate text-sm font-bold leading-tight capitalize">{displayedContactName}</h2>
            </div>
            {adSourceLabel && (
              <span className="flex items-center gap-0.5 text-[0.6rem] leading-none text-blue-500 dark:text-blue-400 truncate">
                <Megaphone className="h-2.5 w-2.5 shrink-0" />
                {adSourceLabel}
              </span>
            )}
          </div>

          {session ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setMobileToolsOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md"
              >
                <Badge variant="outline" className={`${sessionStatusTone} text-xs py-0.5`}>
                  {session.status ? 'Activa' : 'Pausada'}
                </Badge>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-muted-foreground transition-transform duration-200',
                    mobileToolsOpen && 'rotate-180',
                  )}
                />
              </button>
              {macrosMenu}
              {lifecycleButton}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground flex-shrink-0">Sin sesión</span>
          )}
        </div>

        {/* Herramientas expandibles — una fila con scroll */}
        {session && mobileToolsOpen && (
          <div className="-mx-2 border-t border-border/30 bg-muted/30">
            <div className="flex items-center justify-between gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-none">
              {/* 1. Acción directa */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full bg-green-100 dark:bg-green-950/40 text-green-600 hover:bg-green-200 dark:hover:bg-green-900/50"
                onClick={handleCall}
                title="Llamar por WhatsApp"
              >
                <Phone className="h-3.5 w-3.5" />
              </Button>
              {advisorBadge}
              {/* 2. CRM / agenda */}
              <ChatReminderDialog session={session!} userId={userId} />
              <ChatAppointmentStatusButton
                sessionId={session.id}
                userId={session.userId}
                pushName={session.pushName}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-md border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => setTaskDialogOpen(true)}
                title="Nueva tarea"
              >
                <ClipboardList className="h-3.5 w-3.5" />
              </Button>
              {/* 3. Datos del contacto */}
              <ChatRegistrosBadge
                sessionId={session.id}
                sessionPushName={session.pushName}
                whatsapp={displayedWhatsapp}
                userId={session.userId}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
                flujos={session.flujos}
                leadStatus={session.leadStatus}
                leadScore={session.leadScore}
                leadScoreReason={session.leadScoreReason}
                tags={session.tags}
                sessionSeguimientos={session.seguimientos}
              />
              <SintesisEditDialog sessionId={session.id} onUpdated={onSessionRefresh} />
              {tagsCombobox}
              {/* 4. Gestión */}
              {sessionToggle}
            </div>
          </div>
        )}

        {/* Fila 2 mobile: tabs + lupa — siempre al fondo */}
        {(onChatViewChange || onToggleSearch) && (
          <div className="-mx-2 -mt-1 flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-border/20">
            <button
              onClick={() => onChatViewChange?.('messages')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                chatView === 'messages' || !chatView
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Mensajes
            </button>
            {onChatViewChange && (
              <button
                onClick={() => onChatViewChange('notes')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  chatView === 'notes'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                Notas
              </button>
            )}
            {onChatViewChange && userIntegrations.map((intg) => (
              <button
                key={intg.id}
                onClick={() => onChatViewChange(intg.id)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  chatView === intg.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {intg.name}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-0.5 mr-1">
              {onToggleSearch && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground',
                    searchOpen && 'text-blue-500 dark:text-blue-400',
                  )}
                  onClick={onToggleSearch}
                  title="Buscar en el chat"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              )}
              {onToggleInfoPanel && session && (
                <Button
                  type="button"
                  onClick={onToggleInfoPanel}
                  title={infoPanelOpen ? 'Cerrar ficha del contacto' : 'Ver ficha del contacto'}
                  className="h-7 flex items-center gap-1 px-2 rounded-lg border border-border bg-background text-foreground hover:bg-muted shrink-0 transition-colors"
                  size="sm"
                >
                  <UserRound className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                  {infoPanelOpen
                    ? <PanelRightClose className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                    : <PanelRightOpen className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop ── */}
      <div className="hidden md:flex md:flex-col overflow-hidden">
      {/* py-0 (sin padding vertical): sube la fila para alinear "Mensajes/Notas/Web"
          con los tabs del sidebar (izquierda), que no se toca. */}
      <div className="flex items-center px-3 py-0 gap-3 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onExpandChatList && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onExpandChatList}
              title="Expandir lista de chats"
              className="h-8 w-8 shrink-0 rounded-md border border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <PanelRightOpen className="h-4 w-4" />
            </Button>
          )}
          <Avatar className="w-9 h-9 ring-2 ring-border flex-shrink-0">
            <AvatarImage src={header.avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-lg font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>
          {/* Alto FIJO del bloque nombre(+subtítulo): con `justify-center` el contenido se
              centra, así el header mide EXACTAMENTE igual con o sin el subtítulo del
              anuncio → "Mensajes/Notas/Web" queda a la misma altura en todos los chats. */}
          <div className="flex h-11 flex-col justify-center overflow-hidden min-w-0">
            <div className="flex items-center gap-1.5">
              {header.isPinned && (
                <Pin className="h-4 w-4 fill-current text-amber-500 flex-shrink-0" />
              )}
              <h2 className="truncate text-sm font-bold capitalize" title={displayedContactName}>{displayedContactName}</h2>
              {session && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full hover:bg-muted flex-shrink-0"
                  onClick={onOpenContactEditor}
                  title="Editar contacto"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {adSourceLabel && (
              <span className="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 leading-tight truncate">
                <Megaphone className="h-3 w-3 shrink-0" />
                {adSourceLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {session && (
            <>
              {/* 1. Acción directa */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full bg-green-100 dark:bg-green-950/40 text-green-600 hover:bg-green-200 dark:hover:bg-green-900/50"
                onClick={handleCall}
                title="Llamar por WhatsApp"
              >
                <Phone className="h-4 w-4" />
              </Button>
              {advisorBadge}
              {/* 2. CRM / agenda */}
              <ChatReminderDialog session={session!} userId={userId} />
              <ChatAppointmentStatusButton
                sessionId={session.id}
                userId={session.userId}
                pushName={session.pushName}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-md border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => setTaskDialogOpen(true)}
                title="Nueva tarea"
              >
                <ClipboardList className="h-3.5 w-3.5" />
              </Button>
              {/* 3. Datos del contacto */}
              <ChatRegistrosBadge
                sessionId={session.id}
                sessionPushName={session.pushName}
                whatsapp={displayedWhatsapp}
                userId={session.userId}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
                flujos={session.flujos}
                leadStatus={session.leadStatus}
                leadScore={session.leadScore}
                leadScoreReason={session.leadScoreReason}
                tags={session.tags}
                sessionSeguimientos={session.seguimientos}
              />
              <LeadContextSheet session={session} onScoreUpdated={onSessionRefresh} />
              <SintesisEditDialog sessionId={session.id} onUpdated={onSessionRefresh} />
              {tagsCombobox}
            </>
          )}
          {onToggleInfoPanel && session && (
            <Button
              type="button"
              onClick={onToggleInfoPanel}
              title={infoPanelOpen ? 'Cerrar ficha del contacto' : 'Ver ficha del contacto'}
              className="hidden md:flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted shrink-0 transition-colors"
              size="sm"
            >
              <UserRound className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
              {infoPanelOpen
                ? <PanelRightClose className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                : <PanelRightOpen className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />}
            </Button>
          )}
        </div>
      </div>{/* end fila 1 */}

      {/* ── Fila 2: tabs de integraciones + búsqueda ── */}
      {(onChatViewChange || onToggleSearch) && (
        <div className="flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => onChatViewChange?.('messages')}
            className={cn(
              'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              chatView === 'messages' || !chatView
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Mensajes
          </button>
          {onChatViewChange && (
            <button
              onClick={() => onChatViewChange('notes')}
              className={cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                chatView === 'notes'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Notas
            </button>
          )}
          {onChatViewChange && userIntegrations.map((intg) => (
            <button
              key={intg.id}
              onClick={() => onChatViewChange(intg.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                chatView === intg.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {intg.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 pr-2">
            {onToggleSearch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground',
                  searchOpen && 'text-blue-500 dark:text-blue-400',
                )}
                onClick={onToggleSearch}
                title="Buscar en el chat"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            )}
            {macrosMenu}
            {lifecycleButton}
          </div>
        </div>
      )}
      </div>{/* end desktop flex-col */}

      {!session && (
        <div className="md:hidden px-2 py-2 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-200/50 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-600">
          Sin sesión CRM sincronizada
        </div>
      )}

      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        session={session}
        currentUserId={userId}
      />

      {callDigits && (
        <CallDialog
          open={callOpen}
          onClose={() => setCallOpen(false)}
          phone={callDigits}
          contactName={displayedContactName}
          instanceType={instanceType}
          instanceName={instanceName}
        />
      )}
    </div>
  );
};
