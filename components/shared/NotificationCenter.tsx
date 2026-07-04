"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  AtSign,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageCircle,
  PlugZap,
  RefreshCw,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getNotificationCenterData,
  type NotificationCenterData,
  type NotificationKind,
} from "@/actions/notification-center-actions";
import { markCollabNotificationReadAction } from "@/actions/collab-actions";
import { useChatUnreadStore } from "@/stores/useChatUnreadStore";
import { cn } from "@/lib/utils";

const NC_KEY = "nc_dismissed_v1";
function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(window.sessionStorage.getItem(NC_KEY) ?? "[]") as string[]); }
  catch { return new Set(); }
}
function saveDismissed(id: string): void {
  try {
    const s = loadDismissed(); s.add(id);
    window.sessionStorage.setItem(NC_KEY, JSON.stringify([...s]));
  } catch {}
}

const KIND_META: Record<
  NotificationKind,
  { label: string; Icon: typeof Bell; color: string; filterClass: string; activeClass: string }
> = {
  task: {
    label: "Tareas",
    Icon: AlertTriangle,
    color: "text-red-600",
    filterClass: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    activeClass: "border-red-400 bg-red-100 text-red-800",
  },
  appointment: {
    label: "Citas",
    Icon: CalendarClock,
    color: "text-amber-600",
    filterClass: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    activeClass: "border-amber-400 bg-amber-100 text-amber-800",
  },
  connection: {
    label: "Errores",
    Icon: PlugZap,
    color: "text-red-600",
    filterClass: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    activeClass: "border-red-500 bg-red-100 text-red-800",
  },
  chat: {
    label: "Chats",
    Icon: MessageCircle,
    color: "text-emerald-600",
    filterClass: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    activeClass: "border-emerald-400 bg-emerald-100 text-emerald-800",
  },
  mention: {
    label: "Menciones",
    Icon: AtSign,
    color: "text-blue-600",
    filterClass: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
    activeClass: "border-blue-400 bg-blue-100 text-blue-800",
  },
};

const FILTER_ORDER: NotificationKind[] = ["mention", "chat", "appointment", "task", "connection"];

const EMPTY_DATA: NotificationCenterData = {
  total: 0,
  counts: { task: 0, appointment: 0, connection: 0, chat: 0, mention: 0 },
  items: [],
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationCenter() {
  const [data, setData] = useState<NotificationCenterData>(EMPTY_DATA);
  const [open, setOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<NotificationKind | "all">("all");
  const [isPending, startTransition] = useTransition();
  const storeChatCount = useChatUnreadStore((s) => s.unreadCount);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await getNotificationCenterData();
      if (res.success) {
        const dismissed = loadDismissed();
        const items = res.data.items.filter((i) => !dismissed.has(i.id));
        const counts = { task: 0, appointment: 0, connection: 0, chat: 0, mention: 0 } as Record<NotificationKind, number>;
        for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
        setData({ items, counts, total: items.length });
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  const dismiss = useCallback((id: string, kind: NotificationKind, href: string) => {
    saveDismissed(id);
    // Las notificaciones de colaboración se marcan como leídas en el servidor
    // (id con prefijo "collab:") para que no reaparezcan.
    if (id.startsWith("collab:")) {
      void markCollabNotificationReadAction(id.slice("collab:".length));
    }
    setData((prev) => ({
      items: prev.items.filter((i) => i.id !== id),
      counts: { ...prev.counts, [kind]: Math.max(0, (prev.counts[kind] ?? 0) - 1) },
      total: Math.max(0, prev.total - 1),
    }));
    setOpen(false);
    window.location.href = href;
  }, []);

  // Conteo de chats viene del mismo store que el badge izquierdo del sidebar
  const effectiveCounts = useMemo(
    () => ({ ...data.counts, chat: storeChatCount }),
    [data.counts, storeChatCount],
  );
  const badgeTotal = useMemo(
    () => Object.values(effectiveCounts).reduce((sum, n) => sum + n, 0),
    [effectiveCounts],
  );

  const summary = useMemo(
    () => FILTER_ORDER.map((kind) => [kind, effectiveCounts[kind] ?? 0] as [NotificationKind, number]),
    [effectiveCounts],
  );

  const filteredItems = useMemo(
    () => (activeKind === "all" ? data.items : data.items.filter((item) => item.kind === activeKind)),
    [activeKind, data.items],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0 overflow-visible rounded-full border border-border bg-background shadow-sm transition-all hover:border-amber-200 hover:bg-amber-50"
          aria-label="Centro de notificaciones"
        >
          <Bell className="h-4 w-4 text-amber-500" />
          {badgeTotal > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
              {badgeTotal > 99 ? "99+" : badgeTotal}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex max-h-[min(82vh,620px)] w-[min(92vw,380px)] flex-col overflow-hidden p-0">
        <div className="flex shrink-0 items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">Notificaciones</DropdownMenuLabel>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={isPending}>
            <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
          </Button>
        </div>
        <DropdownMenuSeparator />

        {summary.length > 0 && (
          <div className="grid shrink-0 grid-cols-2 gap-1 px-2 py-2 sm:grid-cols-4">
            {summary.map(([kind, count]) => {
              const meta = KIND_META[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setActiveKind(kind)}
                  className={cn(
                    "flex min-w-0 items-center justify-between gap-1 rounded-md border px-1.5 py-1 text-left transition-colors",
                    meta.filterClass,
                    activeKind === kind && meta.activeClass,
                  )}
                >
                  <span className="min-w-0 truncate text-[11px]">{meta.label}</span>
                  <Badge variant="outline" className="h-4 min-w-4 shrink-0 rounded border-current bg-white/70 px-1 text-[9px] text-current">
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}

        <ScrollArea className="h-[min(56vh,420px)] min-h-0">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">
                  {data.items.length === 0 ? "Todo al dia" : "Sin resultados"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.items.length === 0
                    ? "No hay alertas importantes por ahora."
                    : "No hay notificaciones en este filtro."}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-1">
              {filteredItems.map((item) => {
                const meta = KIND_META[item.kind];
                const Icon = meta.Icon;
                const date = formatDate(item.date);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => dismiss(item.id, item.kind, item.href)}
                    className="flex w-full gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="self-center flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className={cn("h-4 w-4", meta.color)} />
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{item.title}</span>
                      </span>
                      {date && (
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{date}</span>
                        </span>
                      )}
                      {item.description && (
                        <span className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-2">{item.description}</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
