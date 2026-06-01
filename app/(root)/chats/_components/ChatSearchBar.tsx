"use client";

import { Search, X, ChevronDown, Check, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Channel = {
  instanceName: string;
  linkedUserId?: string;
  company?: string;
};

type ChatSearchBarProps = {
  onClear: () => void;
  onChange: (value: string) => void;
  value: string;
  channels?: Channel[];
  selectedChannel?: string | null;
  channelCounts?: Record<string, number>;
  onChannelChange?: (channel: string | null) => void;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
};

export function ChatSearchBar({
  onClear,
  onChange,
  value,
  channels = [],
  selectedChannel,
  channelCounts = {},
  onChannelChange,
  onRefresh,
  isRefreshing,
}: ChatSearchBarProps) {
  const hasChannels = channels.length > 1;
  const activeLabel = selectedChannel ?? "Todos";
  const totalCount = Object.values(channelCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
      {hasChannels ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-1 text-xs font-bold tracking-tight text-foreground transition-colors hover:bg-accent sm:gap-1 sm:px-1.5 sm:text-sm"
            >
              <span className="max-w-[52px] truncate sm:max-w-[90px]">{activeLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Canales
            </p>
            {/* Todos */}
            <DropdownMenuItem
              onSelect={() => onChannelChange?.(null)}
              className="flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="text-sm font-medium">Todos</span>
              <div className="flex items-center gap-1.5">
                {totalCount > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                    {totalCount}
                  </span>
                )}
                {!selectedChannel && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Por instancia */}
            {channels.map((ch) => {
              const isActive = selectedChannel === ch.instanceName;
              const count = channelCounts[ch.instanceName] ?? 0;
              return (
                <DropdownMenuItem
                  key={ch.instanceName}
                  onSelect={() => onChannelChange?.(ch.instanceName)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className={cn("truncate text-sm", isActive && "font-medium text-primary")}>
                      {ch.instanceName}
                    </span>
                    {ch.company && (
                      <span className="truncate text-[10px] text-muted-foreground">{ch.company}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {count > 0 && (
                      <span className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-semibold",
                        isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        {count}
                      </span>
                    )}
                    {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="shrink-0 text-sm font-bold tracking-tight text-foreground">Chats</span>
      )}

      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar..."
          className="h-7 rounded-full pl-7 pr-7 text-xs sm:h-8"
          aria-label="Buscar chats"
        />
        {value && (
          <button
            type="button"
            aria-label="Limpiar busqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {onRefresh && (
        <button
          type="button"
          disabled={isRefreshing}
          onClick={() => void onRefresh()}
          title="Actualizar chats"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 sm:h-8 sm:w-8"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
