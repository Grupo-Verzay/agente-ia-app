'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// Escala del tamaño de letra de TODA la app (por dispositivo). Se guarda en la
// cookie `ui_scale` (porcentaje) y se aplica escalando el font-size base del
// <html>, así crece proporcional casi todo el texto (clases rem de Tailwind).
// El no-parpadeo al cargar lo hace un script en app/layout.tsx.
const OPTIONS = [
  { value: '100', label: 'Normal' },
  { value: '110', label: 'Grande' },
  { value: '120', label: 'Más grande' },
] as const;

const COOKIE = 'ui_scale';

function readCookie(): string {
  if (typeof document === 'undefined') return '100';
  const m = document.cookie.match(/(?:^|; )ui_scale=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '100';
}

function apply(value: string) {
  // Persistir 1 año y aplicar en vivo (sin recargar).
  document.cookie = `${COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.style.fontSize = value === '100' ? '' : `${value}%`;
}

export function FontSizeControl() {
  const [value, setValue] = useState<string>('100');

  useEffect(() => {
    setValue(readCookie());
  }, []);

  const onSelect = (v: string) => {
    setValue(v);
    apply(v);
  };

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-1 gap-1">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
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
