"use client";

import React from "react";
import { Archive, CalendarClock, Check, CheckCircle, Copy, Lock, MailOpen, MailX, MoreVertical, PencilLine, Pin, Star, Tag, Trash2, UserCheck, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import dynamic from "next/dynamic";

const FlowListOrder = dynamic(
  () => import("../../sessions/_components/FlowListOrder").then((m) => ({ default: m.FlowListOrder })),
  { ssr: false, loading: () => null }
);
import { SeguimientoBadge } from "../../sessions/_components/SeguimientoBadge";
import { LeadStatusSelect } from "./LeadStatusSelect";
import { ServiceTypeSelect } from "./ServiceTypeSelect";
import { ClientStatusSelect } from "./ClientStatusSelect";
import { cn } from "@/lib/utils";
import { getIconForMessageType } from "./chat-sidebar.utils";
import type { SidebarContact } from "./chat-sidebar.types";
import type { LeadStatus, ServiceType, ClientStatus, SimpleTag } from "@/types/session";
import type { AdvisorInfo } from "@/actions/team-actions";
import { AdvisorAssignBadge } from "./AdvisorAssignBadge";

const INSTANCE_COLORS = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-orange-500","bg-pink-500","bg-cyan-500","bg-amber-500"];
function instanceColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return INSTANCE_COLORS[h % INSTANCE_COLORS.length];
}
function shortInstanceLabel(name: string): string {
  const parts = name.split("_");
  return parts.length === 1 ? name.slice(0, 6) : parts[parts.length - 1];
}

const APPT_DOT: Record<string, string> = {
  PENDIENTE:   'bg-yellow-500',
  CONFIRMADA:  'bg-green-500',
  ATENDIDA:    'bg-blue-500',
  NO_ASISTIDA: 'bg-violet-500',
  CANCELADA:   'bg-red-500',
  FINALIZADO:  'bg-emerald-600',
  DESCARTADO:  'bg-zinc-500',
};

const APPT_LABEL: Record<string, string> = {
  PENDIENTE:   'Cita pendiente',
  CONFIRMADA:  'Cita confirmada',
  ATENDIDA:    'Cita atendida',
  NO_ASISTIDA: 'No asistida',
  CANCELADA:   'Cita cancelada',
  FINALIZADO:  'Cita finalizada',
  DESCARTADO:  'Descartado',
};

type ChatContactItemProps = {
  contact: SidebarContact;
  onArchive: (id: string, isArchived: boolean) => void;
  onDeleteRequest: (contact: SidebarContact) => void;
  canDelete?: boolean;
  onSelect: (id: string, lastMessageId: string, instanceName?: string) => void;
  onTogglePin: (id: string, isPinned: boolean) => void;
  onLeadStatusChange?: (remoteJid: string, status: LeadStatus | null) => void;
  onServiceTypeChange?: (remoteJid: string, value: ServiceType | null) => void;
  onClientStatusChange?: (remoteJid: string, value: ClientStatus | null) => void;
  clientValidationEnabled?: boolean;
  selected: boolean;
  advisors?: AdvisorInfo[];
  advisorRole?: string | null;
  currentAdvisorId?: string;
  onAssignAdvisor?: (remoteJid: string, advisorId: string | null) => Promise<void>;
  showInstanceBadge?: boolean;
  isChecked?: boolean;
  onToggleSelect?: (id: string) => void;
  allTags?: SimpleTag[];
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onResolve?: (id: string) => void;
  onAssignTag?: (remoteJid: string, tagId: number) => void;
  onRenameRequest?: (contact: SidebarContact) => void;
  isStarred?: boolean;
  onToggleStar?: (id: string) => void;
  hasNotes?: boolean;
};

function ChatContactItemBase({
  contact,
  onArchive,
  canDelete = true,
  onDeleteRequest,
  onSelect,
  onTogglePin,
  onLeadStatusChange,
  onServiceTypeChange,
  onClientStatusChange,
  clientValidationEnabled = false,
  selected,
  advisors,
  advisorRole,
  currentAdvisorId,
  onAssignAdvisor,
  showInstanceBadge = false,
  isChecked,
  onToggleSelect,
  allTags,
  onMarkRead,
  onMarkUnread,
  onResolve,
  onAssignTag,
  onRenameRequest,
  isStarred,
  onToggleStar,
  hasNotes,
}: ChatContactItemProps) {
  const IconComponent = getIconForMessageType(contact.messageType);
  const isUnread = contact.isUnreadLocal;
  const apptStatus = contact.chatSession?.latestAppointmentStatus;

  const MAX_BADGES = 6;

  const badgeItems: React.ReactNode[] = [];

  if (contact.chatSession) {
    // 1. Clasificación del lead (Frio, Sin clasificar, etc.)
    badgeItems.push(
      <LeadStatusSelect
        key="status"
        sessionId={contact.chatSession.id}
        currentStatus={contact.chatSession.leadStatus ?? null}
        onUpdated={(newStatus) => onLeadStatusChange?.(contact.id, newStatus)}
      />
    );
    // 2. Asesor asignado (Sin asignar / iniciales)
    if (advisors && advisors.length > 0 && (contact.chatSession.assignedAdvisorId || advisorRole === 'agente')) {
      badgeItems.push(
        <AdvisorAssignBadge
          key="advisor"
          assignedAdvisorId={contact.chatSession.assignedAdvisorId ?? null}
          advisors={advisors}
          advisorRole={advisorRole}
          currentAdvisorId={currentAdvisorId}
          sessionId={contact.chatSession.id}
          onAssign={onAssignAdvisor ? (id) => onAssignAdvisor(contact.id, id) : undefined}
          size="sm"
        />
      );
    }
    if (clientValidationEnabled) {
      // 3. Estado del cliente (Activo / Inactivo)
      badgeItems.push(
        <ClientStatusSelect
          key="clientStatus"
          sessionId={contact.chatSession.id}
          currentValue={contact.chatSession.clientStatus ?? null}
          onUpdated={(newValue) => onClientStatusChange?.(contact.id, newValue)}
        />
      );
      // 4. Tipo de asistencia (IA / Humana)
      badgeItems.push(
        <ServiceTypeSelect
          key="serviceType"
          sessionId={contact.chatSession.id}
          currentValue={contact.chatSession.serviceType ?? null}
          onUpdated={(newValue) => onServiceTypeChange?.(contact.id, newValue)}
        />
      );
    }
  }
  if (contact.chatSession?.flujos) {
    badgeItems.push(<FlowListOrder key="flow" raw={contact.chatSession.flujos} />);
  }
  if ((contact.chatSession?.pendingSeguimientos ?? 0) > 0) {
    badgeItems.push(
      <SeguimientoBadge
        key="seguimiento"
        count={contact.chatSession!.pendingSeguimientos ?? 0}
        tipos={contact.chatSession!.seguimientosTipos}
      />
    );
  }
  if (apptStatus) {
    badgeItems.push(
      <TooltipProvider key="appt">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 h-6 rounded-full border border-violet-300 bg-violet-50 px-1.5 dark:border-violet-700 dark:bg-violet-950">
              <CalendarClock className="h-3 w-3 text-violet-600 dark:text-violet-400 shrink-0" />
              <span className={cn('w-2 h-2 rounded-full shrink-0', APPT_DOT[apptStatus] ?? 'bg-gray-400')} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="z-[9999]">
            <p className="text-xs font-semibold">Cita agendada</p>
            <p className="text-xs">{APPT_LABEL[apptStatus] ?? apptStatus}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (hasNotes) {
    badgeItems.push(
      <TooltipProvider key="notes">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 h-6 rounded-full border border-amber-300 bg-amber-50 px-1.5 dark:border-amber-700 dark:bg-amber-950">
              <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="z-[9999]">
            <p className="text-xs font-semibold">Tiene notas internas</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (contact.chatSession?.tags && contact.chatSession.tags.length > 0) {
    const tags = contact.chatSession.tags;
    badgeItems.push(
      <TooltipProvider key="tags">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-violet-300 bg-violet-100 px-2 text-xs font-medium text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <Tag className="h-3 w-3 shrink-0" />
                {tags.length}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="z-[9999] max-w-[280px]">
            <div className="space-y-1">
              <div className="text-xs font-bold">Etiquetas</div>
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                {tags.map((tag) => (
                  <li key={tag.id} style={{ color: tag.color ?? undefined }}>
                    {tag.name}
                  </li>
                ))}
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const visibleBadges = badgeItems.slice(0, MAX_BADGES);
  const hiddenCount = badgeItems.length - MAX_BADGES;

  const selectionMode = isChecked !== undefined;

  return (
    <div
      role="listitem"
      data-chat-id={contact.id}
      className={cn(
        "group rounded-xl border p-2 transition hover:bg-accent hover:text-accent-foreground",
        selected && !selectionMode
          ? "-mx-1 rounded-none border-transparent bg-primary/10 px-3 sm:mx-0 sm:rounded-xl sm:border-primary sm:px-2"
          : "border-transparent",
        selectionMode && isChecked && "border-primary/40 bg-primary/5",
      )}
      aria-current={selected ? "true" : "false"}
    >
      <div className="flex items-start gap-2">
        {/* Avatar / checkbox toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleSelect) {
              onToggleSelect(contact.id);
            } else {
              onSelect(contact.id, contact.lastMessageId, contact.instanceName);
            }
          }}
          className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Avatar
            className={cn(
              "h-10 w-10 ring-2 ring-background group-hover:ring-accent transition-opacity",
              selectionMode && "opacity-30",
              !selectionMode && onToggleSelect && "group-hover:opacity-30",
            )}
          >
            <AvatarImage src={contact.avatarSrc} alt={contact.name || "Contacto"} />
            <AvatarFallback>
              {contact.name?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          {contact.isGroup && !selectionMode && (
            <Users className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background/90 p-[2px] text-muted-foreground ring-1 ring-border" />
          )}
          {/* Checkbox overlay */}
          {onToggleSelect && (
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-full transition-opacity",
                selectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors",
                  isChecked
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/50 bg-background/80",
                )}
              >
                {isChecked && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
              </span>
            </span>
          )}
        </button>

        {/* Content area */}
        <button
          type="button"
          onClick={() => {
            if (selectionMode && onToggleSelect) {
              onToggleSelect(contact.id);
            } else {
              onSelect(contact.id, contact.lastMessageId, contact.instanceName);
            }
          }}
          className="flex min-w-0 flex-1 items-start text-left"
        >
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
                    "app-item-title shrink-0 capitalize",
                    isUnread && "text-foreground",
                  )}
                >
                  {contact.name || "Sin nombre"}
                </span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                {contact.timestamp}
              </span>
            </div>

            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div
                className={cn(
                  "flex items-center gap-1 truncate text-[15px] sm:text-sm",
                  isUnread ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {IconComponent && (
                  <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" />
                )}
                <span>{contact.lastMessage || "-"}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {showInstanceBadge && contact.instanceName && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 rounded bg-muted/80 px-1 py-0.5 text-[9px] font-medium leading-3 text-muted-foreground cursor-default">
                          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${instanceColor(contact.instanceName)}`} />
                          {shortInstanceLabel(contact.instanceName)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6} className="z-[9999]">
                        <p className="text-xs font-semibold">{contact.instanceName}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isUnread && (
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
            </div>
          </div>
        </button>

        {/* Botón estrella — visible al hover o cuando está destacado */}
        {onToggleStar && !selectionMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleStar(contact.id); }}
            className={cn(
              "shrink-0 -mr-1 h-7 w-7 flex items-center justify-center rounded-full transition-all",
              isStarred
                ? "opacity-100 text-amber-400"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-amber-400",
            )}
            title={isStarred ? "Quitar destacado" : "Destacar"}
          >
            <Star className={cn("h-3.5 w-3.5", isStarred && "fill-amber-400")} />
          </button>
        )}

        {/* Dropdown menu — hidden in selection mode */}
        {!selectionMode && (
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
            <DropdownMenuContent align="end" className="w-52">
              {/* 1. Marcar como leído / no leído */}
              {contact.isUnreadLocal ? (
                <DropdownMenuItem onSelect={() => onMarkRead?.(contact.id)}>
                  <MailOpen className="h-4 w-4" />
                  Marcar como leído
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => onMarkUnread?.(contact.id)}>
                  <MailX className="h-4 w-4" />
                  Marcar como no leído
                </DropdownMenuItem>
              )}
              {/* 2. Marcar como resuelto */}
              {contact.chatSession && onResolve && (
                <DropdownMenuItem onSelect={() => onResolve(contact.id)}>
                  <CheckCircle className="h-4 w-4" />
                  Marcar como resuelto
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {/* 3. Asignar agente — solo para dueño/admin; agentes usan el AdvisorAssignBadge */}
              {onAssignAdvisor && advisors && advisors.length > 0 && advisorRole !== 'agente' && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <UserCheck className="h-4 w-4" />
                    Asignar agente
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem onSelect={() => onAssignAdvisor(contact.id, null)}>
                      <span className="text-sm text-muted-foreground">Sin asignar</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {advisors.map((a) => (
                      <DropdownMenuItem
                        key={a.id}
                        onSelect={() => onAssignAdvisor(contact.id, a.id)}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-sm">{a.name ?? a.email}</span>
                        {contact.chatSession?.assignedAdvisorId === a.id && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {/* 4. Asignar etiqueta */}
              {onAssignTag && allTags && allTags.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Tag className="h-4 w-4" />
                    Asignar etiqueta
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    {allTags.map((tag) => {
                      const hasTag = contact.chatSession?.tags?.some((t) => t.id === tag.id);
                      return (
                        <DropdownMenuItem
                          key={tag.id}
                          onSelect={() => onAssignTag(contact.id, tag.id)}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: tag.color ?? undefined }} />
                            {tag.name}
                          </span>
                          {hasTag && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              {/* 5. Copiar número */}
              {!contact.isGroup && (
                <DropdownMenuItem
                  onSelect={() => {
                    const phone = contact.id.split("@")[0];
                    void navigator.clipboard.writeText(`+${phone}`);
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copiar número
                </DropdownMenuItem>
              )}
              {/* 6. Cambiar nombre */}
              {onRenameRequest && contact.chatSession && (
                <DropdownMenuItem onSelect={() => onRenameRequest(contact)}>
                  <PencilLine className="h-4 w-4" />
                  Cambiar nombre
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {/* 7-8. Anclar / Archivar */}
              <DropdownMenuItem onSelect={() => onTogglePin(contact.id, !contact.isPinned)}>
                <Pin className="h-4 w-4" />
                {contact.isPinned ? "Desanclar chat" : "Anclar chat"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onArchive(contact.id, !contact.isArchived)}>
                <Archive className="h-4 w-4" />
                {contact.isArchived ? "Restaurar chat" : "Archivar chat"}
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  {/* 9. Eliminar */}
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onSelect={() => onDeleteRequest(contact)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar chat
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {visibleBadges.length > 0 && (
        <div
          className="mt-1 flex flex-wrap items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {visibleBadges}
          {hiddenCount > 0 && (
            <span className="inline-flex items-center h-6 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground shrink-0">
              +{hiddenCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Memoizado: con props/callbacks estables, los items de la lista no se
// re-renderizan en cada poll de mensajes/lista. Solo se actualizan cuando
// cambian sus propios datos.
export const ChatContactItem = React.memo(ChatContactItemBase);
