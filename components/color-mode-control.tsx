'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

// Selector claro/oscuro/sistema (mismo estilo segmentado que FontSizeControl).
// Reusa next-themes (el mismo que el botón de la barra lateral).
const OPTIONS = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
] as const;

export function ColorModeControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? theme ?? 'system' : 'system';

  return (
    <div className="flex w-full items-center rounded-lg border border-border bg-muted/30 p-1 gap-1">
      {OPTIONS.map((opt) => {
        const active = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-center transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
