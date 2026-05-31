'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, PencilLine, Pin, Phone, CheckCircle, LogOut, ChevronDown, UserPlus, SquarePen, Power } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatSessionActions } from './ChatSessionActions';
import { initialFromName } from './chat-message-utils';
import type { ChatHeader as ChatHeaderData } from './chat-message-types';
import type { Session, SimpleTag } from '@/types/session';
import type { AdvisorInfo } from '@/actions/team-actions';
import { AdvisorAssignBadge } from './AdvisorAssignBadge';
import { SessionTagsCombobox } from '../../tags/components';
import { updateSessionStatus } from '@/actions/session-action';
import { LeadStatusSelect } from './LeadStatusSelect';
import { resolveSession } from '@/actions/advisor-assign-actions';
import { SintesisEditDialog } from './SintesisEditDialog';
import { ChatRegistrosBadge } from './ChatRegistrosBadge';
import { LeadContextSheet } from './LeadContextSheet';
import { ChatAppointmentStatusButton } from './ChatAppointmentStatusButton';
import { ChatReminderDialog } from './ChatReminderDialog';
import { cn } from '@/lib/utils';

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
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  header,
  session,
  userId,
  allTags,
  displayedContactName,
  displayedWhatsapp,
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
}) => {
  const initialSelectedTagIds = session?.tags?.map((t) => t?.id).filter(Boolean) ?? [];
  const [resolving, setResolving] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [sessionStatusLoading, setSessionStatusLoading] = useState(false);

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

  const handleLiberate = async () => {
    await onAssignAdvisor?.(null);
  };

  const handleCall = () => {
    toast.info('Próximamente disponible en planes Premium', { duration: 4000 });
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

  const sessionActions = session && (
    <ChatSessionActions
      session={session}
      userId={userId}
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
          className="h-8 text-xs gap-1.5 px-2.5"
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

  return (
    <div className="sticky top-0 z-10 border-b border-border/40 bg-gradient-to-r from-background to-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/50">
      {/* ── Mobile ── */}
      <div className="md:hidden px-3 py-2 space-y-2">
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

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              {header.isPinned && (
                <Pin className="h-3 w-3 fill-current text-amber-500 flex-shrink-0" />
              )}
              <h2 className="truncate text-sm font-bold leading-tight">{displayedContactName}</h2>
            </div>
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
              {lifecycleButton}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground flex-shrink-0">Sin sesión</span>
          )}
        </div>

        {/* Herramientas expandibles — una fila con scroll */}
        {session && mobileToolsOpen && (
          <div className="-mx-3 border-t border-border/30 bg-muted/30">
            <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 scrollbar-none">
              {/* Sesión on/off */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={sessionStatusLoading}
                className={cn(
                  'h-7 w-7 rounded-full shrink-0 transition-colors',
                  session.status
                    ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
                title={session.status ? 'Pausar sesión' : 'Activar sesión'}
                onClick={async () => {
                  setSessionStatusLoading(true);
                  const next = !(session.status ?? false);
                  const res = await updateSessionStatus(session.id, next);
                  if (res.success) {
                    toast.success(next ? 'Sesión activada.' : 'Sesión pausada.');
                    onSessionMutate();
                    await onSessionRefresh();
                  } else {
                    toast.error(res.message || 'Error al actualizar sesión.');
                  }
                  setSessionStatusLoading(false);
                }}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>

              {sessionActions}

              {/* Separador */}
              <div className="h-4 w-px bg-border/50 shrink-0 mx-0.5" />

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
              <ChatReminderDialog session={session!} userId={userId} />
              <SintesisEditDialog sessionId={session.id} onUpdated={onSessionRefresh} />
              {tagsCombobox}

              {/* Separador */}
              <div className="h-4 w-px bg-border/50 shrink-0 mx-0.5" />

              {advisorBadge}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full shrink-0 hover:bg-muted"
                onClick={onOpenContactEditor}
                title="Editar contacto"
              >
                <PencilLine className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop ── */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto] items-center p-3 gap-3 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="w-14 h-14 ring-2 ring-border flex-shrink-0">
            <AvatarImage src={header.avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-lg font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1.5 min-w-0">
            {header.isPinned && (
              <Pin className="h-4 w-4 fill-current text-amber-500 flex-shrink-0" />
            )}
            <h2 className="truncate text-lg font-bold" title={displayedContactName}>{displayedContactName}</h2>
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
        </div>

        <div className="flex items-center gap-1.5">
          {session && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-950/40 text-green-600 hover:bg-green-200 dark:hover:bg-green-900/50"
                onClick={handleCall}
                title="Llamar por WhatsApp"
              >
                <Phone className="h-4 w-4" />
              </Button>
              {advisorBadge}
              <LeadContextSheet session={session} onScoreUpdated={onSessionRefresh} />
              <SintesisEditDialog sessionId={session.id} onUpdated={onSessionRefresh} />
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
              <ChatReminderDialog session={session!} userId={userId} />
              <ChatAppointmentStatusButton
                sessionId={session.id}
                userId={session.userId}
                pushName={session.pushName}
                remoteJid={session.remoteJid}
                instanceId={session.instanceId}
              />
              {tagsCombobox}
            </>
          )}
          {sessionActions}
          {lifecycleButton}
        </div>
      </div>

      {!session && (
        <div className="md:hidden px-4 py-2 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-200/50 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-600">
          Sin sesión CRM sincronizada
        </div>
      )}
    </div>
  );
};
