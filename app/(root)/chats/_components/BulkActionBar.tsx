"use client";

import { X, Archive, Trash2, Users, Tag, Pin, CheckSquare, MailOpen, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdvisorInfo } from "@/actions/team-actions";
import type { SimpleTag } from "@/types/session";
import { cn } from "@/lib/utils";

type BulkActionBarProps = {
  count: number;
  totalCount: number;
  onClear: () => void;
  onSelectAll: () => void;
  onArchive: (archived: boolean) => void;
  onDelete?: () => void;
  onPin?: (pin: boolean) => void;
  onMarkRead?: (read: boolean) => void;
  onAssignAdvisor?: (advisorId: string | null) => void;
  onAddTag?: (tagId: number) => void;
  advisors?: AdvisorInfo[];
  advisorRole?: string | null;
  allTags?: SimpleTag[];
};

const PALETTE = [
  "bg-blue-500","bg-violet-500","bg-emerald-500",
  "bg-amber-500","bg-rose-500","bg-cyan-500","bg-fuchsia-500",
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function BulkActionBar({
  count,
  totalCount,
  onClear,
  onSelectAll,
  onArchive,
  onDelete,
  onPin,
  onMarkRead,
  onAssignAdvisor,
  onAddTag,
  advisors,
  advisorRole,
  allTags,
}: BulkActionBarProps) {
  const isOwnerOrAdmin = advisorRole !== "agente";
  const allSelected = count === totalCount && totalCount > 0;

  return (
    // Un solo renglon. La cuenta va en pastilla, como los contadores de las
    // pestanas de arriba, para que se lea como numero y no como un icono mas
    // de la fila. Y "seleccionar todos" se queda junto a ella y no al lado de
    // la papelera: son dos botones pequenos, uno marca los 141 chats y el otro
    // los borra, y un clic corrido ahi sale caro.
    <div className="flex min-w-0 items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-1.5 py-1">
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        title="Quitar selección"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <span
        className="inline-grid h-6 min-w-[1.5rem] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground"
        title={`${count} chat${count !== 1 ? "s" : ""} seleccionado${count !== 1 ? "s" : ""}`}
      >
        {count}
      </span>

      <button
        type="button"
        onClick={onSelectAll}
        title={allSelected ? "Quitar la selección" : `Seleccionar los ${totalCount}`}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-background",
          allSelected ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <CheckSquare className="h-3.5 w-3.5" />
      </button>

      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 items-center gap-0.5">

        {onMarkRead && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Marcar como leído / no leído"
              >
                <MailOpen className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                MARCAR CHATS
              </p>
              <DropdownMenuItem onSelect={() => onMarkRead(true)}>
                <MailOpen className="h-3.5 w-3.5" />
                Marcar como leído
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMarkRead(false)}>
                <MailX className="h-3.5 w-3.5" />
                Marcar como no leído
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onPin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Anclar / Desanclar"
              >
                <Pin className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                ANCLAR CHATS
              </p>
              <DropdownMenuItem onSelect={() => onPin(true)}>
                <Pin className="h-3.5 w-3.5" />
                Anclar chats
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPin(false)}>
                <Pin className="h-3.5 w-3.5 opacity-40" />
                Desanclar chats
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Archivar / Desarchivar"
            >
              <Archive className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              ARCHIVAR CHATS
            </p>
            <DropdownMenuItem onSelect={() => onArchive(true)}>
              <Archive className="h-3.5 w-3.5" />
              Archivar chats
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onArchive(false)}>
              <Archive className="h-3.5 w-3.5 opacity-40" />
              Desarchivar chats
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isOwnerOrAdmin && onAssignAdvisor && (advisors?.length ?? 0) > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Asignar asesor"
              >
                <Users className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                ASIGNAR ASESOR
              </p>
              <DropdownMenuItem
                onSelect={() => onAssignAdvisor(null)}
                className="flex items-center gap-2"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
                Sin asignar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {advisors?.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  onSelect={() => onAssignAdvisor(a.id)}
                  className="flex items-center gap-2"
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorFor(a.id))} />
                  <span className="truncate">{a.name ?? a.email}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onAddTag && (allTags?.length ?? 0) > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Agregar etiqueta"
              >
                <Tag className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                ETIQUETAR
              </p>
              {allTags?.map((tag) => (
                <DropdownMenuItem
                  key={tag.id}
                  onSelect={() => onAddTag(tag.id)}
                >
                  {tag.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onDelete && (
          <>
            <span className="flex-1" aria-hidden="true" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
              title="Eliminar chats"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
