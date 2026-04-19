'use client';

import React from 'react';
import { ArrowRight, PencilLine, Pin } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChatSessionActions } from './ChatSessionActions';
import { initialFromName } from './chat-message-utils';
import type { ChatHeader as ChatHeaderData } from './chat-message-types';
import type { Session, SimpleTag } from '@/types/session';
import { SessionTagsCombobox } from '../../tags/components';
import { CrmFollowUpSummaryBadge } from '../../crm/dashboard/components/CrmFollowUpSummaryBadge';
import { SwitchStatus } from '../../sessions/_components';

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
}) => {
  const initialSelectedTagIds = session?.tags?.map((t) => t?.id).filter(Boolean) ?? [];
  const sessionStatusTone = session?.status
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';

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

  const crmBadge = session && (
    <CrmFollowUpSummaryBadge
      summary={session.crmFollowUpSummary}
      userId={session.userId}
      remoteJid={session.remoteJid}
      instanceId={session.instanceId}
      onUpdated={onSessionRefresh}
    />
  );

  const sessionActions = session && (
    <ChatSessionActions
      session={session}
      userId={userId}
      mutateSessions={onSessionMutate}
    />
  );

  return (
    <div className="border-b border-border/40 bg-gradient-to-r from-background to-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/50 z-10">
      {/* ── Mobile ── */}
      <div className="md:hidden p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
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

            <Avatar className="w-12 h-12 ring-2 ring-border flex-shrink-0">
              <AvatarImage src={header.avatarSrc || '/default-avatar.png'} />
              <AvatarFallback className="font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {header.isPinned && (
                  <Pin className="h-3.5 w-3.5 fill-current text-amber-500 flex-shrink-0" />
                )}
                <h2 className="truncate text-sm font-bold leading-tight">{displayedContactName}</h2>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{displayedWhatsapp}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {session && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-muted"
                onClick={onOpenContactEditor}
                title="Editar"
              >
                <PencilLine className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {session ? (
          <div className="space-y-2 pl-14">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`${sessionStatusTone} text-xs py-0.5`}>
                {session.status ? 'Activa' : 'Pausada'}
              </Badge>
              {crmBadge}
            </div>
            {tagsCombobox}
            {session && (
              <SwitchStatus
                key={`${session.id}-${session.status ? 'on' : 'off'}`}
                checked={session.status ?? false}
                sessionId={session.id ?? -1}
                mutateSessions={onSessionMutate}
              />
            )}
            {sessionActions}
          </div>
        ) : (
          <div className="pl-14 text-xs text-muted-foreground">Sin sesión CRM sincronizada</div>
        )}
      </div>

      {/* ── Desktop ── */}
      <div className="hidden md:flex items-center justify-between p-3 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="w-14 h-14 ring-2 ring-border flex-shrink-0">
            <AvatarImage src={header.avatarSrc || '/default-avatar.png'} />
            <AvatarFallback className="text-lg font-bold">{initialFromName(displayedContactName)}</AvatarFallback>
          </Avatar>

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {header.isPinned && (
                <Pin className="h-4 w-4 fill-current text-amber-500 flex-shrink-0" />
              )}
              <h2 className="truncate text-lg font-bold">{displayedContactName}</h2>
              {session && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-muted flex-shrink-0"
                  onClick={onOpenContactEditor}
                  title="Editar contacto"
                >
                  <PencilLine className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {session && (
          <div className="flex flex-1 overflow-hidden gap-1">
            <div className="flex flex-1 justify-end gap-1">{crmBadge}</div>
            {tagsCombobox}
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">{sessionActions}</div>
      </div>

      {!session && (
        <div className="md:hidden px-4 py-2 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-200/50 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-600">
          Sin sesión CRM sincronizada
        </div>
      )}
    </div>
  );
};
