'use client';

import { useState } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdvisorInfo } from '@/actions/team-actions';

// Paleta de colores determinista por ID
const PALETTE = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(advisor: AdvisorInfo) {
  const name = advisor.name?.trim() || advisor.email;
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface AdvisorAssignBadgeProps {
  assignedAdvisorId: string | null | undefined;
  advisors: AdvisorInfo[];
  advisorRole?: string | null;
  currentAdvisorId?: string;
  onAssign?: (advisorId: string | null) => Promise<void>;
  size?: 'sm' | 'md';
}

export function AdvisorAssignBadge({
  assignedAdvisorId,
  advisors,
  advisorRole,
  currentAdvisorId,
  onAssign,
  size = 'sm',
}: AdvisorAssignBadgeProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const assigned = advisors.find((a) => a.id === assignedAdvisorId) ?? null;
  const isAgent = advisorRole === 'agente';
  const isMySession = assignedAdvisorId === currentAdvisorId;

  const circleSize = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs';

  const handleAssign = async (advisorId: string | null) => {
    if (!onAssign) return;
    setBusy(true);
    setOpen(false);
    try {
      await onAssign(advisorId);
    } catch {
      toast.error('Error al asignar.');
    } finally {
      setBusy(false);
    }
  };

  // Agente: no puede reasignar, solo ver o tomar
  if (isAgent) {
    if (!assignedAdvisorId) {
      return (
        <button
          type="button"
          disabled={busy || !onAssign}
          onClick={(e) => {
            e.stopPropagation();
            void handleAssign(currentAdvisorId ?? null);
          }}
          className={cn(
            'inline-flex items-center gap-0.5 h-5 rounded-full border border-dashed border-muted-foreground/50 px-1.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50',
          )}
          title="Tomar esta conversación"
        >
          <UserPlus className="h-2.5 w-2.5 shrink-0" />
          Tomar
        </button>
      );
    }
    if (isMySession) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 h-5 rounded-full bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800 px-1.5 text-[10px] text-green-700 dark:text-green-400',
          )}
        >
          <UserCheck className="h-2.5 w-2.5 shrink-0" />
          Yo
        </span>
      );
    }
    // Asignado a otro — solo muestra iniciales sin interacción
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0',
          circleSize,
          colorFor(assignedAdvisorId),
        )}
        title={assigned ? (assigned.name ?? assigned.email) : 'Asignado'}
      >
        {assigned ? initials(assigned) : '?'}
      </span>
    );
  }

  // Dueño / admin: popover para asignar/reasignar
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => e.stopPropagation()}
          title={assigned ? (assigned.name ?? assigned.email) : 'Sin asignar — click para asignar'}
          className={cn(
            'inline-flex items-center justify-center rounded-full shrink-0 transition-opacity disabled:opacity-50',
            assigned
              ? cn('font-semibold text-white', circleSize, colorFor(assigned.id))
              : cn(
                  'border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary',
                  circleSize,
                ),
          )}
        >
          {assigned ? initials(assigned) : <UserPlus className="h-2.5 w-2.5" />}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-44 p-1"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Asignar asesor
        </p>

        <button
          type="button"
          onClick={() => void handleAssign(null)}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors',
            !assignedAdvisorId && 'font-semibold text-primary',
          )}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
            <UserPlus className="h-2.5 w-2.5" />
          </span>
          Sin asignar
        </button>

        {advisors.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => void handleAssign(a.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors',
              assignedAdvisorId === a.id && 'font-semibold text-primary',
            )}
          >
            <span
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0',
                colorFor(a.id),
              )}
            >
              {initials(a)}
            </span>
            <span className="truncate">{a.name ?? a.email}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
