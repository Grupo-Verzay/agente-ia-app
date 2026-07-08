'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone, Lock } from 'lucide-react';
import { FaWhatsapp, FaTelegramPlane, FaFacebook, FaInstagram } from 'react-icons/fa';
import { cn } from '@/lib/utils';
import { TRAINING_CHANNELS } from '@/lib/channel-training';

// Icono por canal (mismos brand-icons que la página de Conexión).
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: FaWhatsapp,
  llamadas: Phone,
  'whatsapp-api': FaWhatsapp,
  telegram: FaTelegramPlane,
  facebook: FaFacebook,
  instagram: FaInstagram,
};

// Color de marca por canal (el icono lo conserva activo o no, para distinguir).
const ICON_COLORS: Record<string, string> = {
  whatsapp: 'text-green-600',
  llamadas: 'text-green-600',
  'whatsapp-api': 'text-emerald-600',
  telegram: 'text-sky-500',
  facebook: 'text-blue-600',
  instagram: 'text-pink-600',
};

// Tabs superiores para cambiar de canal de entrenamiento. Estilo segmentado con
// recuadro en el activo (igual que los tabs de Agenda).
export function ChannelTabs({ lockedSlugs = [] }: { lockedSlugs?: string[] }) {
  const pathname = usePathname();
  const active = pathname?.split('/')[2] || 'whatsapp';
  const locked = new Set(lockedSlugs);

  return (
    <div className="shrink-0 border-b border-border/40 px-2 py-2 sm:px-3">
      <div className="flex w-full gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
        {TRAINING_CHANNELS.map((c) => {
          const Icon = ICONS[c.slug] ?? FaWhatsapp;
          const isActive = active === c.slug;
          const isLocked = locked.has(c.slug);
          return (
            <Link
              key={c.slug}
              href={`/ia/${c.slug}`}
              title={isLocked ? 'Canal no habilitado' : undefined}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                isLocked && !isActive && 'opacity-50',
              )}
            >
              {isLocked ? (
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Icon className={cn('h-4 w-4 shrink-0', ICON_COLORS[c.slug])} />
              )}
              {c.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
