'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageContextMenuProps {
  isUserMessage: boolean;
  onCopy: () => void;
  onReact: (emoji: string) => void;
  onDelete?: () => void;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  isUserMessage,
  onCopy,
  onReact,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Más opciones"
        title="Más opciones"
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute bottom-8 z-50 min-w-[160px] rounded-xl border border-border bg-popover shadow-lg',
            isUserMessage ? 'right-0' : 'left-0',
          )}
        >
          {/* Reacciones */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onReact(emoji); setOpen(false); }}
                className="text-base hover:scale-125 transition-transform leading-none"
                title={`Reaccionar con ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Copiar */}
          <button
            type="button"
            onClick={() => { onCopy(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            Copiar
          </button>

          {/* Eliminar (solo admin) */}
          {onDelete && (
            <button
              type="button"
              onClick={() => { onDelete(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors rounded-b-xl"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );
};
