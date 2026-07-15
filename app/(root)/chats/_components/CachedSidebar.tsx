"use client";

import { useEffect, useState } from "react";
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

// Filas de skeleton (fallback cuando aún no hay caché o antes de hidratar).
function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-2xl border p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
          <div className="pl-[52px] pt-2">
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Sidebar "puente": muestra la última lista de chats conocida (desde localStorage)
// mientras la página /chats termina de cargar los datos frescos del servidor.
export function CachedSidebar() {
  // null = aún no hidratado (SSR / primer render) → skeleton para no romper hidratación.
  const [rows, setRows] = useState<CachedSidebarRow[] | null>(null);

  useEffect(() => {
    setRows(readSidebarCache());
  }, []);

  return (
    <div className="hidden h-full w-80 flex-shrink-0 border-r bg-background/70 p-4 md:flex md:w-96">
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>

        <Skeleton className="h-10 w-full rounded-xl" />

        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 rounded-xl" />
          ))}
        </div>

        {!rows || rows.length === 0 ? (
          <SkeletonRows />
        ) : (
          <div className="space-y-1 overflow-hidden opacity-90">
            {rows.map((c, index) => (
              <div key={index} className="flex items-start gap-3 rounded-2xl p-3">
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
    </div>
  );
}
