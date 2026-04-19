"use client";

import { useState } from "react";
import { Filter, Search, Tag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SimpleTag } from "@/types/session";

type TagFilterPanelProps = {
  onClearFilter: () => void;
  onToggleTag: (tagId: number) => void;
  selectedTagIds: Set<number>;
  tags: SimpleTag[];
};

export function TagFilterPanel({
  onClearFilter,
  onToggleTag,
  selectedTagIds,
  tags,
}: TagFilterPanelProps) {
  const [search, setSearch] = useState("");
  const filterCount = selectedTagIds.size;

  const sorted = tags
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filtrar por etiquetas"
          title="Filtrar por etiquetas"
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
            filterCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {filterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
              {filterCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-56 p-2">
        {/* Search */}
        <div className="relative mb-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar etiqueta..."
            className="w-full rounded-md bg-muted/40 py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-border"
          />
        </div>

        {/* Tag list */}
        <div className="flex flex-col">
          {sorted.map((tag) => {
            const isActive = selectedTagIds.has(tag.id);
            const color = tag.color ?? "#6366F1";
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => (isActive ? onClearFilter() : onToggleTag(tag.id))}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                  isActive ? "bg-foreground/10" : "hover:bg-muted/60",
                )}
              >
                <Tag className="h-4 w-4 shrink-0" style={{ color }} />
                <span className={isActive ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {tag.name}
                </span>
              </button>
            );
          })}
          {sorted.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">Sin resultados</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
