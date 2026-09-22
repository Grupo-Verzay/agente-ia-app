"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatSearchBar } from "./ChatSearchBar";
import { ChatTabBar } from "./ChatTabBar";
import { TagFilterPanel } from "./TagFilterPanel";
import { BotonDeAsesores, BotonDeGrupos } from "./BotonesDeLaBarra";
import { MARCA_DE_LA_COLUMNA } from "@/hooks/usePanelFlotante";
import type { TabCounts } from "./chat-sidebar.types";
import {
  readSidebarCache,
  FORMA_POR_DEFECTO,
  type CachedSidebarRow,
  type FormaDeLaBarra,
} from "./chats-sidebar-cache";

/** Sin datos todavía: todos a cero, y en cero la insignia no se pinta. */
const SIN_CONTEOS: TabCounts = { all: 0, mine: 0, groups: 0, archived: 0, resolved: 0, dm: 0 };
const nada = () => { };

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

/**
 * El sidebar "puente": lo que se ve mientras /chats carga.
 *
 * La barra se pinta con **los mismos componentes que la de verdad**
 * —`ChatSearchBar`, `ChatTabBar` y los dos botones de `BotonesDeLaBarra`—, no
 * con una copia. La copia es lo que falló: el puente se quedó con la barra de
 * hace tres versiones —botón de refrescar, botón de panel, sin «En espera»— y
 * al llegar la real la barra cambiaba entera delante de quien estuviera
 * mirando. Mientras sean los mismos componentes, no pueden discrepar.
 *
 * Los datos no están todavía, así que **los contadores salen en cero** —la
 * insignia de un cero no se pinta, ni aquí ni en la real— y los manejadores no
 * hacen nada. La barra no se puede tocar (`pointer-events-none`): es una
 * fotografía, no un control, y un clic que no responde se siente peor que un
 * botón todavía apagado.
 *
 * Lo único que no se puede saber sin datos es qué PIEZAS lleva la barra de esta
 * cuenta, y eso se recuerda de la última visita (`FormaDeLaBarra`).
 */
export function CachedSidebar() {
  // null = aún no hidratado (SSR / primer render) → skeleton para no romper hidratación.
  const [rows, setRows] = useState<CachedSidebarRow[] | null>(null);
  const [forma, setForma] = useState<FormaDeLaBarra>(FORMA_POR_DEFECTO);

  useEffect(() => {
    const guardado = readSidebarCache();
    setRows(guardado.filas);
    setForma(guardado.forma);
  }, []);

  return (
    <div className="hidden h-full flex-shrink-0 border-r border-border md:block md:w-[20rem] lg:w-[22rem] xl:w-[24rem]">
      {/* La misma marca que el sidebar de verdad: este puente pinta los mismos
          componentes, y con ella sus paneles se colocan igual en vez de caer en
          «no encontré dónde colocarme». */}
      <aside
        {...{ [MARCA_DE_LA_COLUMNA]: "" }}
        className="flex h-full w-full max-w-[700px] flex-col bg-background/60 backdrop-blur"
      >
        {/* Mismas clases y MISMA altura fija que la barra real, para que el
            divisor no salte al cambiar el puente por ella. */}
        <div
          className="pointer-events-none sticky top-0 z-10 flex flex-col justify-center space-y-1.5 overflow-hidden border-b-2 border-border bg-background/80 px-2 py-2 backdrop-blur sm:space-y-2 sm:px-3"
          style={{ height: '5.125rem' }}
          aria-hidden
        >
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
            <ChatSearchBar
              value=""
              onChange={nada}
              onClear={nada}
              /* Dos entradas de mentira solo para que salga el desplegable
                 «Todos ▾» en vez del título «Chats»: `ChatSearchBar` decide por
                 cuántas líneas hay, y la lista no se puede abrir. */
              channels={forma.canales ? [{ instanceName: "" }, { instanceName: " " }] : []}
              selectedChannel={null}
            />
            {/* El embudo sale SIEMPRE en la de verdad —hospeda el rango de
                fechas, que aplica a cualquier cuenta—, así que el esqueleto lo
                pinta igual para que no salte al cargar. */}
            <TagFilterPanel
              tags={[]}
              selectedTagIds={new Set<number>()}
              onToggleTag={nada}
              onClearFilter={nada}
              rangoDesde=""
              rangoHasta=""
              campoDeFecha="inicio"
              rangoActivo={false}
              onRangoDesde={nada}
              onRangoHasta={nada}
              onCampoDeFecha={nada}
              onLimpiarRango={nada}
            />
            {forma.asesores && <BotonDeAsesores />}
            <BotonDeGrupos />
          </div>

          <ChatTabBar
            tab="all"
            onTabChange={nada}
            tabCounts={SIN_CONTEOS}
            showMine={forma.mias}
            onToggleUnread={nada}
            onToggleEnEspera={nada}
          />
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
