"use client";

import { Lock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type InternalNoteBubbleProps = {
  content: string;
  authorName: string | null;
  authorEmail: string;
  timestamp: string;
  isOwn: boolean;
  onDelete?: () => void;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function InternalNoteBubble({
  content,
  authorName,
  authorEmail,
  timestamp,
  isOwn,
  onDelete,
}: InternalNoteBubbleProps) {
  const displayName = authorName?.trim() || authorEmail;

  return (
    <div className="flex justify-center my-1 px-4">
      <div className="w-full max-w-[80%] rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Nota interna
            </span>
            <span className="text-[10px] text-amber-600/70 dark:text-amber-500">
              · {displayName}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-amber-600/60 dark:text-amber-500">
              {formatTime(timestamp)}
            </span>
            {isOwn && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-amber-600/50 hover:text-red-500 transition-colors"
                title="Eliminar nota"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        {/* Content */}
        <p className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap break-words leading-snug">
          {content}
        </p>
      </div>
    </div>
  );
}
