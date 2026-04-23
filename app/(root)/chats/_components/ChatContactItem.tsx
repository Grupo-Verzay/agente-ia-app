"use client";

import { Archive, MoreVertical, Pin, Trash2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SessionTagsTooltip } from "../../tags/components";
import { FlowListOrder } from "../../sessions/_components/FlowListOrder";
import { SeguimientoBadge } from "../../sessions/_components/SeguimientoBadge";
import { LeadStatusSelect } from "./LeadStatusSelect";
import { cn } from "@/lib/utils";
import { getIconForMessageType } from "./chat-sidebar.utils";
import type { SidebarContact } from "./chat-sidebar.types";
import type { LeadStatus } from "@/types/session";

type ChatContactItemProps = {
  contact: SidebarContact;
  onArchive: (id: string, isArchived: boolean) => void;
  onDeleteRequest: (contact: SidebarContact) => void;
  onSelect: (id: string, lastMessageId: string) => void;
  onTogglePin: (id: string, isPinned: boolean) => void;
  onLeadStatusChange?: (remoteJid: string, status: LeadStatus | null) => void;
  selected: boolean;
};

export function ChatContactItem({
  contact,
  onArchive,
  onDeleteRequest,
  onSelect,
  onTogglePin,
  onLeadStatusChange,
  selected,
}: ChatContactItemProps) {
  const IconComponent = getIconForMessageType(contact.messageType);
  const isUnread = contact.isUnreadLocal;

  return (
    <div
      role="listitem"
      data-chat-id={contact.id}
      className={cn(
        "group rounded-xl border p-2 transition hover:bg-accent hover:text-accent-foreground",
        selected ? "border-primary bg-primary/10" : "border-transparent",
      )}
      aria-current={selected ? "true" : "false"}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onSelect(contact.id, contact.lastMessageId)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-background group-hover:ring-accent">
              <AvatarImage src={contact.avatarSrc} alt={contact.name || "Contacto"} />
              <AvatarFallback>
                {contact.name?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            {contact.isGroup && (
              <Users className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background/90 p-[2px] text-muted-foreground ring-1 ring-border" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                {contact.isPinned && (
                  <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" />
                )}
                {contact.isArchived && (
                  <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold",
                    isUnread && "text-foreground",
                  )}
                >
                  {contact.name || "Sin nombre"}
                </span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {contact.timestamp}
              </span>
            </div>

            <div className="mt-0.5 flex items-center gap-1">
              {contact.chatSession ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <LeadStatusSelect
                    sessionId={contact.chatSession.id}
                    currentStatus={contact.chatSession.leadStatus ?? null}
                    onUpdated={(newStatus) => onLeadStatusChange?.(contact.id, newStatus)}
                  />
                </span>
              ) : null}
              {contact.chatSession && (
                <FlowListOrder raw={contact.chatSession.flujos ?? ""} />
              )}
              {contact.chatSession && (
                <SeguimientoBadge
                  count={contact.chatSession.pendingSeguimientos ?? 0}
                  tipos={contact.chatSession.seguimientosTipos}
                />
              )}
              {contact.chatSession && contact.chatSession.tags.length > 0 && (
                <SessionTagsTooltip tags={contact.chatSession.tags} maxVisible={5} />
              )}
            </div>

            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div
                className={cn(
                  "flex items-center gap-1 truncate text-sm",
                  isUnread ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {IconComponent && (
                  <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" />
                )}
                <span>{contact.lastMessage || "-"}</span>
              </div>
              {isUnread && (
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onTogglePin(contact.id, !contact.isPinned);
              }}
            >
              <Pin className="h-4 w-4" />
              {contact.isPinned ? "Desanclar chat" : "Anclar chat"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onArchive(contact.id, !contact.isArchived);
              }}
            >
              <Archive className="h-4 w-4" />
              {contact.isArchived ? "Restaurar chat" : "Archivar chat"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onSelect={(e) => {
                e.preventDefault();
                onDeleteRequest(contact);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
