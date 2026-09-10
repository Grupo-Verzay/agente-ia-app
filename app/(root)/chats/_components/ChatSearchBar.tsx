"use client";

import { useEffect, useMemo } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getInstanceUiDisplayName } from "@/lib/instance-display-name";

type Channel = {
  instanceName: string;
  displayName?: string | null;
  instanceType?: string | null;
  metaChannel?: string | null;
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
};

export function ChatSearchBar({
  onClear,
  onChange,
  value,
  channels = [],
  selectedChannel,
  channelCounts = {},
  onChannelChange,
}: ChatSearchBarProps) {
  const hasChannels = channels.length > 1;
  const activeChannel = channels.find((ch) => ch.instanceName === selectedChannel);
  const activeLabel = activeChannel
    ? getInstanceUiDisplayName(activeChannel)
    : "Todos";

  /** La suma de las lineas: el mismo total que enseña el chip de la cabecera. */
  const totalCount = Object.values(channelCounts).reduce((a, b) => a + b, 0);

  /**
   * Lineas que tienen chats pero NO tienen fila en el desplegable.
   *
   * «Todos» suma TODAS las lineas que aparecen en los chats; las filas solo
   * salen para las lineas que llegan en `channels` (las `Instancias` de la
   * cuenta y las de las cuentas vinculadas). Cuando una linea trae chats y no
   * esta en esa lista, los numeros no cuadran —«Todos 614» con las filas
   * sumando 469— y esos chats **no se pueden filtrar por ninguna fila**: el
   * filtro no llega a ellos.
   *
   * Se les pinta su propia fila, con el nombre crudo de la linea. Asi la suma
   * siempre cuadra y no queda nada inalcanzable.
   */
  const lineasSinFila = useMemo(
    () =>
      Object.keys(channelCounts).filter(
        (nombre) =>
          (channelCounts[nombre] ?? 0) > 0 &&
          !channels.some((ch) => ch.instanceName === nombre),
      ),
    [channelCounts, channels],
  );

  useEffect(() => {
    if (!hasChannels || lineasSinFila.length === 0) return;
    console.warn("[chats] hay chats de lineas que no estan en el filtro de canales", {
      lineas: lineasSinFila.map((nombre) => ({ linea: nombre, chats: channelCounts[nombre] })),
      lineasDelFiltro: channels.map((ch) => ch.instanceName),
    });
  }, [hasChannels, lineasSinFila, channelCounts, channels]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
      {hasChannels ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={activeLabel}
              className="inline-flex h-8 min-w-[56px] max-w-[104px] items-center gap-0.5 rounded-full px-2 text-sm font-semibold tracking-tight text-foreground transition-colors hover:bg-accent sm:gap-1 sm:px-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          {/* Con su propio scroll: la lista crece con las lineas de la cuenta y
              el tope es el hueco de verdad, no `vh` (ver la regla de los menus
              con listas dentro). */}
          <DropdownMenuContent
            align="start"
            className="w-56 overflow-y-auto"
            collisionPadding={12}
            style={{ maxHeight: 'min(70vh, var(--radix-dropdown-menu-content-available-height))' }}
          >
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Canales
            </p>
            {/* Todos */}
            <DropdownMenuItem
              onSelect={() => onChannelChange?.(null)}
              className="flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="text-xs font-medium">Todos</span>
              {/* La suma de las líneas, que es EXACTAMENTE lo que dice el chip
                  azul de la cabecera: los dos salen de `channelCounts`.
                  Estuvo un rato sin número porque cada uno decía una cosa —la
                  suma aquí, las filas cargadas allí— y dos «Todos» distintos
                  pegados despistan más que informar. Ya dicen lo mismo, así
                  que el número vuelve. Si algún día vuelven a separarse, se
                  arregla la fuente, no se esconde el número. */}
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
              const label = getInstanceUiDisplayName(ch);
              return (
                <DropdownMenuItem
                  key={ch.instanceName}
                  onSelect={() => onChannelChange?.(ch.instanceName)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className={cn("truncate text-xs", isActive && "font-medium text-primary")}>
                      {label}
                    </span>
                    {ch.company && ch.company !== label && (
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
            {/* Lineas con chats que no estan en `channels`: sin esta fila sus
                chats se cuentan en «Todos» y no hay forma de filtrarlos. */}
            {lineasSinFila.map((nombre) => {
              const isActive = selectedChannel === nombre;
              return (
                <DropdownMenuItem
                  key={nombre}
                  onSelect={() => onChannelChange?.(nombre)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className={cn("truncate text-xs", isActive && "font-medium text-primary")}>
                      {nombre}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      Linea sin ficha
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={cn(
                      "rounded-full px-1.5 py-px text-[10px] font-semibold",
                      isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}>
                      {channelCounts[nombre]}
                    </span>
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

      <div className="relative min-w-[36px] flex-1">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar..."
          className="h-7 rounded-full pl-7 pr-7 text-xs sm:text-sm"
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
    </div>
  );
}
