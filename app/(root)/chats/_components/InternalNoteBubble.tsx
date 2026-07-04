"use client";

import { type ReactNode } from "react";
import { Lock, Trash2 } from "lucide-react";

type InternalNoteBubbleProps = {
  content: string;
  authorName: string | null;
  authorEmail: string;
  timestamp: string;
  isOwn: boolean;
  mentionNames?: string[];
  onDelete?: () => void;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/** Resalta las @menciones (los nombres de asesores) dentro del texto de la nota. */
function renderWithMentions(content: string, mentionNames?: string[]): ReactNode {
  const names = (mentionNames ?? []).filter(Boolean);
  if (names.length === 0) return content;

  const escaped = names
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length); // nombres largos primero para no cortar
  const re = new RegExp(`@(?:${escaped.join("|")})`, "g");

  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    parts.push(
      <span key={key++} className="font-semibold text-blue-600 dark:text-blue-400">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}

export function InternalNoteBubble({
  content,
  authorName,
  authorEmail,
  timestamp,
  isOwn,
  mentionNames,
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
          {renderWithMentions(content, mentionNames)}
        </p>
      </div>
    </div>
  );
}
