"use client";

import { useEffect, useState } from "react";
import {
  Search,
  ChevronDown,
  RefreshCw,
  SquarePen,
  Users,
  PanelLeftClose,
  Filter,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { readSidebarCache, type CachedSidebarRow } from "./chats-sidebar-cache";

function initials(name: string) {
  const clean = (name || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

// Botón/ícono cuadrado del toolbar, mismas medidas que el real (h-7 w-7 / sm:h-8 w-8).
function ToolbarIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground sm:h-8 sm:w-8">
      {children}
    </span>
  );
}

// Filas de skeleton (fallback cuando aún no hay caché o antes de hidratar).
function SkeletonRows() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-lg p-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Sidebar "puente": misma estructura/medidas que el sidebar real (ancho, toolbar,
// buscador, tabs, filas) para que al terminar de cargar NO se vea un salto brusco.
// Muestra la última lista de chats conocida (desde localStorage) mientras el
// servidor termina. El toolbar es estático (no interactivo).
export function CachedSidebar() {
  // null = aún no hidratado (SSR / primer render) → skeleton para no romper hidratación.
  const [rows, setRows] = useState<CachedSidebarRow[] | null>(null);

  useEffect(() => {
    setRows(readSidebarCache());
  }, []);

  return (
    <div className="hidden h-full flex-shrink-0 border-r border-border md:block md:w-[20rem] lg:w-[22rem] xl:w-[24rem]">
      <aside className="flex h-full w-full max-w-[700px] flex-col bg-background/60 backdrop-blur">
        {/* Toolbar estático — mismas clases/medidas que el real (ChatSearchBar + tabs) */}
        <div className="sticky top-0 z-10 space-y-1.5 border-b border-border bg-background/80 px-2 py-2 backdrop-blur sm:space-y-2 sm:px-3">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
            {/* Réplica de ChatSearchBar: "Todos ▾" + buscador + refrescar */}
            <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <span className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full px-2 text-sm font-semibold tracking-tight text-foreground sm:gap-1 sm:px-2.5">
                <span className="max-w-[52px] truncate sm:max-w-[90px]">Todos</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </span>
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <div className="flex h-7 items-center rounded-full border border-input bg-background pl-7 pr-7 text-xs text-muted-foreground sm:text-sm">
                  Buscar...
                </div>
              </div>
              <ToolbarIcon>
                <RefreshCw className="h-3.5 w-3.5" />
              </ToolbarIcon>
            </div>
            <ToolbarIcon>
              <SquarePen className="h-3.5 w-3.5" />
            </ToolbarIcon>
            <ToolbarIcon>
              <Users className="h-3.5 w-3.5" />
            </ToolbarIcon>
            <ToolbarIcon>
              <PanelLeftClose className="h-3.5 w-3.5" />
            </ToolbarIcon>
          </div>

          {/* Tabs — misma estructura/medidas que ChatTabBar (justify-evenly, h-6, chips
              con borde) para que la transición del puente al real NO se descuadre. */}
          <div className="flex w-full items-center gap-1">
            <div className="flex flex-1 items-center justify-evenly gap-1 overflow-hidden">
              <span
                className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap"
                style={{ borderColor: "#7C3AED50", color: "#7C3AED", background: "#7C3AED10" }}
              >
                Mías
              </span>
              <span
                className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap"
                style={{ background: "#007BFF", borderColor: "#007BFF", color: "#fff" }}
              >
                Todos
              </span>
              <span className="inline-flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-orange-300 bg-orange-50 px-2 text-xs font-medium text-orange-500 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-400">
                No leídos
              </span>
              <span className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-50 px-2 text-xs font-medium text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Users className="h-3 w-3 shrink-0" />
              </span>
            </div>
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-input text-muted-foreground">
              <Filter className="h-3 w-3" />
            </span>
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <ChevronDown className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Lista de chats (desde caché) — misma disposición que ChatContactItem */}
        <div className="flex-1 overflow-y-auto p-1">
          {!rows || rows.length === 0 ? (
            <SkeletonRows />
          ) : (
            <div className="flex flex-col gap-1 opacity-95">
              {rows.map((c, index) => (
                <div key={index} className="flex items-start gap-3 rounded-lg p-2">
                  <Avatar className="h-10 w-10 ring-2 ring-background">
                    <AvatarImage src={c.avatarSrc} alt={c.name || "Contacto"} />
                    <AvatarFallback className="text-xs font-bold">
                      {initials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate app-item-title capitalize">
                        {c.name || "Sin nombre"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.timestamp}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[15px] text-muted-foreground sm:text-sm">
                      {c.lastMessage || "-"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
