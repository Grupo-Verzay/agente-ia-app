'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { TRAINING_CHANNELS } from '@/lib/channel-training';

// Tabs superiores para cambiar de canal de entrenamiento (igual patrón que CRM
// Dashboard / Agenda / panel Admin). Una sola ruta /ia; cada tab es /ia/<slug>.
export function ChannelTabs() {
  const pathname = usePathname();
  const active = pathname?.split('/')[2] || 'whatsapp';

  return (
    <div className="sticky top-0 z-10 shrink-0 border-b border-border/40 bg-muted/60 px-2 sm:px-4">
      <div className="flex items-center gap-1 overflow-x-auto">
        {TRAINING_CHANNELS.map((c) => {
          const isActive = active === c.slug;
          return (
            <Link
              key={c.slug}
              href={`/ia/${c.slug}`}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
