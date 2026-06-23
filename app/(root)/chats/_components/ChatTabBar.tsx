"use client";

import type { ComponentType } from "react";
import { Inbox, Users, UserCheck, UserX, Bot, Headphones, Archive, Trash2, ChevronDown, Lock, MessageCircle, Check, Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TabCounts, TabKey } from "./chat-sidebar.types";
import type { ClientStatus, ServiceType } from "@/types/session";

type ChatTabBarProps = {
  onTabChange: (tab: TabKey) => void;
  tab: TabKey;
  tabCounts: TabCounts;
  showMine?: boolean;
  rightSlot?: React.ReactNode;
  unreadOnly?: boolean;
  onToggleUnread?: () => void;
  unreadCount?: number;
  starredOnly?: boolean;
  onToggleStarred?: () => void;
  starredCount?: number;
  notesOnly?: boolean;
  onToggleNotes?: () => void;
  notesCount?: number;
  clientStatusFilter?: ClientStatus | null;
  onSetClientStatus?: (v: ClientStatus) => void;
  clientActiveCount?: number;
  clientInactiveCount?: number;
  serviceTypeFilter?: ServiceType | null;
  onSetServiceType?: (v: ServiceType) => void;
  iaCount?: number;
  humanCount?: number;
};

const MAIN_TABS: { key: TabKey; label: string; Icon: ComponentType<{ className?: string }>; color: string }[] = [
  { key: "mine", label: "Mías",  Icon: UserCheck, color: "#7C3AED" },
  { key: "all",  label: "Todos", Icon: Inbox,     color: "#007BFF" },
];

const GROUPS_COLOR = "#28A745";

export function ChatTabBar({ onTabChange, tab, tabCounts, showMine = false, rightSlot, unreadOnly, onToggleUnread, unreadCount, starredOnly, onToggleStarred, starredCount, notesOnly, onToggleNotes, notesCount, clientStatusFilter, onSetClientStatus, clientActiveCount, clientInactiveCount, serviceTypeFilter, onSetServiceType, iaCount, humanCount }: ChatTabBarProps) {
  const visibleTabs = MAIN_TABS.filter((t) => t.key !== "mine" || showMine);
  const isOverflowActive = tab === "archived" || tab === "deleted" || starredOnly || notesOnly || !!clientStatusFilter || !!serviceTypeFilter;
  const renderTab = ({ key, label, color }: (typeof MAIN_TABS)[number]) => {
    const count = tabCounts[key];
    const isActive = tab === key;

    return (
      <button
        key={key}
        type="button"
        onClick={() => onTabChange(key)}
        className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-all"
        style={
          isActive
            ? { background: color, borderColor: color, color: "#fff" }
            : { borderColor: `${color}50`, color, background: `${color}10` }
        }
      >
        <span>{label}</span>
        {count > 0 && (
          <span
            className="flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
            style={{ background: isActive ? "rgba(255,255,255,0.3)" : color }}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex w-full items-center gap-1">
      <div className="flex flex-1 items-center justify-evenly gap-1 overflow-hidden">
        {visibleTabs.map(renderTab)}

        {/* Botón No leídos */}
        {onToggleUnread && (
          <button
            type="button"
            onClick={onToggleUnread}
            className={cn(
              "inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-all",
              unreadOnly
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-orange-300 bg-orange-50 text-orange-500 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20"
            )}
          >
            <span>No leídos</span>
            {(unreadCount ?? 0) > 0 && (
              <span
                className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
                style={{ background: unreadOnly ? "rgba(255,255,255,0.3)" : "#f97316" }}
              >
                {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Badge Grupos */}
        <button
          type="button"
          onClick={() => onTabChange("groups")}
          title="Grupos"
          className={cn(
            "inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium transition-all",
            tab === "groups"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-emerald-400/50 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400"
          )}
        >
          <Users className="h-3 w-3 shrink-0" />
          {tabCounts.groups > 0 && (
            <span
              className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
              style={{ background: tab === "groups" ? "rgba(255,255,255,0.3)" : GROUPS_COLOR }}
            >
              {tabCounts.groups > 99 ? "99+" : tabCounts.groups}
            </span>
          )}
        </button>
      </div>

      {rightSlot}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all shrink-0",
              isOverflowActive
                ? "border-slate-500 bg-slate-500 text-white"
                : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
            )}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 p-1">
          {onToggleStarred && (
            <DropdownMenuItem
              onSelect={onToggleStarred}
              className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
            >
              <span className="flex items-center gap-1.5 text-xs">
                <Star className={cn("h-3 w-3 shrink-0", starredOnly ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                Destacados
              </span>
              <span className="flex items-center gap-1">
                {(starredCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{starredCount}</span>}
                {starredOnly && <Check className="h-3 w-3 text-primary" />}
              </span>
            </DropdownMenuItem>
          )}
          {onToggleNotes && (
            <DropdownMenuItem
              onSelect={onToggleNotes}
              className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
            >
              <span className="flex items-center gap-1.5 text-xs">
                <Lock className={cn("h-3 w-3 shrink-0", notesOnly ? "text-amber-500" : "text-muted-foreground")} />
                Con notas
              </span>
              <span className="flex items-center gap-1">
                {(notesCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{notesCount}</span>}
                {notesOnly && <Check className="h-3 w-3 text-primary" />}
              </span>
            </DropdownMenuItem>
          )}
          {onSetClientStatus && (
            <>
              <div className="my-1 border-t border-border/50" />
              <DropdownMenuItem
                onSelect={() => onSetClientStatus('ACTIVO')}
                className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <UserCheck className={cn("h-3 w-3 shrink-0", clientStatusFilter === 'ACTIVO' ? "text-emerald-500" : "text-muted-foreground")} />
                  Cliente activo
                </span>
                <span className="flex items-center gap-1">
                  {(clientActiveCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{clientActiveCount}</span>}
                  {clientStatusFilter === 'ACTIVO' && <Check className="h-3 w-3 text-primary" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onSetClientStatus('INACTIVO')}
                className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <UserX className={cn("h-3 w-3 shrink-0", clientStatusFilter === 'INACTIVO' ? "text-rose-500" : "text-muted-foreground")} />
                  Cliente inactivo
                </span>
                <span className="flex items-center gap-1">
                  {(clientInactiveCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{clientInactiveCount}</span>}
                  {clientStatusFilter === 'INACTIVO' && <Check className="h-3 w-3 text-primary" />}
                </span>
              </DropdownMenuItem>
            </>
          )}
          {onSetServiceType && (
            <>
              <div className="my-1 border-t border-border/50" />
              <DropdownMenuItem
                onSelect={() => onSetServiceType('IA')}
                className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <Bot className={cn("h-3 w-3 shrink-0", serviceTypeFilter === 'IA' ? "text-violet-500" : "text-muted-foreground")} />
                  Asistencia IA
                </span>
                <span className="flex items-center gap-1">
                  {(iaCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{iaCount}</span>}
                  {serviceTypeFilter === 'IA' && <Check className="h-3 w-3 text-primary" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onSetServiceType('HUMANO')}
                className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <Headphones className={cn("h-3 w-3 shrink-0", serviceTypeFilter === 'HUMANO' ? "text-blue-500" : "text-muted-foreground")} />
                  Asistencia humana
                </span>
                <span className="flex items-center gap-1">
                  {(humanCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{humanCount}</span>}
                  {serviceTypeFilter === 'HUMANO' && <Check className="h-3 w-3 text-primary" />}
                </span>
              </DropdownMenuItem>
            </>
          )}
          {(onToggleStarred || onToggleUnread || onToggleNotes || onSetClientStatus || onSetServiceType) && (
            <div className="my-1 border-t border-border/50" />
          )}
          <DropdownMenuItem
            onSelect={() => onTabChange("archived")}
            className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
          >
            <span className="flex items-center gap-1.5 text-xs">
              <Archive className="h-3 w-3 text-muted-foreground shrink-0" />
              Archivados
            </span>
            {tabCounts.archived > 0 && (
              <span className="text-[10px] text-muted-foreground">{tabCounts.archived}</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onTabChange("deleted")}
            className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
          >
            <span className="flex items-center gap-1.5 text-xs">
              <Trash2 className="h-3 w-3 text-muted-foreground shrink-0" />
              Eliminados
            </span>
            {tabCounts.deleted > 0 && (
              <span className="text-[10px] text-muted-foreground">{tabCounts.deleted}</span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


