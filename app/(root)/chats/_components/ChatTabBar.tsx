"use client";

import type { ComponentType } from "react";
import { Inbox, Users, UserCheck, Archive, Trash2, ChevronDown, Lock, MessageCircle, Check, Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TabCounts, TabKey } from "./chat-sidebar.types";

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
};

const MAIN_TABS: { key: TabKey; label: string; Icon: ComponentType<{ className?: string }>; color: string }[] = [
  { key: "mine",   label: "Mías",   Icon: UserCheck, color: "#7C3AED" },
  { key: "all",    label: "Todos",  Icon: Inbox,     color: "#007BFF" },
  { key: "groups", label: "Grupos", Icon: Users,     color: "#28A745" },
];

export function ChatTabBar({ onTabChange, tab, tabCounts, showMine = false, rightSlot, unreadOnly, onToggleUnread, unreadCount, starredOnly, onToggleStarred, starredCount, notesOnly, onToggleNotes, notesCount }: ChatTabBarProps) {
  const visibleTabs = MAIN_TABS.filter((t) => t.key !== "mine" || showMine);
  const isOverflowActive = tab === "archived" || tab === "deleted" || unreadOnly || starredOnly || notesOnly;

  return (
    <div className="flex flex-row items-center justify-between gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5">
      {visibleTabs.map(({ key, label, Icon, color }) => {
        const count = tabCounts[key];
        const isActive = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap transition-all"
            style={
              isActive
                ? { background: color, borderColor: color, color: "#fff" }
                : { borderColor: `${color}50`, color, background: `${color}10` }
            }
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span>{label}</span>
            {count > 0 && (
              <span
                className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
                style={{ background: isActive ? "rgba(255,255,255,0.3)" : color }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}

      {rightSlot}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border px-2 text-[11px] font-medium transition-all",
              isOverflowActive
                ? "border-slate-500 bg-slate-500 text-white"
                : "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
            )}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 p-1">
          {onToggleUnread && (
            <DropdownMenuItem
              onSelect={onToggleUnread}
              className="flex items-center justify-between gap-2 cursor-pointer py-1 text-xs"
            >
              <span className="flex items-center gap-1.5 text-xs">
                <MessageCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                No leÃ­dos
              </span>
              <span className="flex items-center gap-1">
                {(unreadCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{unreadCount}</span>}
                {unreadOnly && <Check className="h-3 w-3 text-primary" />}
              </span>
            </DropdownMenuItem>
          )}
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
          {(onToggleStarred || onToggleUnread || onToggleNotes) && (
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


