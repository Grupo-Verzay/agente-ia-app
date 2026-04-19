"use client";

import { Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SimpleTag } from "@/types/session";

interface SessionTagsTooltipProps {
  tags?: SimpleTag[];
  maxVisible?: number;
  className?: string;
}

export function SessionTagsTooltip({
  tags = [],
  maxVisible = 5,
  className,
}: SessionTagsTooltipProps) {
  const visibleTags = tags.slice(0, maxVisible);
  const remaining = Math.max(tags.length - visibleTags.length, 0);
  const hasTags = tags.length > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 text-xs text-muted-foreground",
              hasTags ? "hover:text-foreground" : "opacity-70",
              className,
            )}
            aria-label={hasTags ? `Ver ${tags.length} etiqueta(s)` : "Sin etiquetas"}
          >
            {hasTags ? (
              <span className="flex items-center truncate">
                {visibleTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background/80"
                  >
                    <TagIcon
                      className="h-2.5 w-2.5"
                      style={tag.color ? { color: tag.color } : undefined}
                    />
                    <span className="sr-only">{tag.name}</span>
                  </span>
                ))}

                {remaining > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    +{remaining}
                  </span>
                )}
              </span>
            ) : (
              <TagIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </TooltipTrigger>

        <TooltipContent align="start" className="max-w-64 space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold">Etiquetas</p>
            {/* <p className="text-[11px] text-muted-foreground">
              {hasTags
                ? `${tags.length} etiqueta(s) asociada(s) a este chat.`
                : "Este chat no tiene etiquetas asociadas."}
            </p> */}
          </div>

          {hasTags && (
            <div className="space-y-1.5">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-border/70"
                    style={{ backgroundColor: tag.color || "currentColor" }}
                  />
                  <span className="truncate">{tag.name}</span>
                </div>
              ))}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
