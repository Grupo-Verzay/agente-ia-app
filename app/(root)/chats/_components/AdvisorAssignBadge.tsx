'use client';

import { useState, useEffect } from 'react';
import { UserCheck, UserPlus, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AdvisorInfo } from '@/actions/team-actions';
import type { AssignmentLogEntry } from '@/actions/advisor-assign-actions';

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

const ACTION_LABELS: Record<string, string> = {
  assigned: 'Asignado',
  released: 'Liberado',
  taken: 'Tomado',
  bulk_assigned: 'Auto-asignado',
  transferred: 'Transferido',
  resolved: 'Resuelto',
};

interface AdvisorAssignBadgeProps {
  assignedAdvisorId: string | null | undefined;
  advisors: AdvisorInfo[];
  advisorRole?: string | null;
  currentAdvisorId?: string;
  sessionId?: number;
  onAssign?: (advisorId: string | null) => Promise<void>;
  size?: 'sm' | 'md';
}

export function AdvisorAssignBadge({
  assignedAdvisorId,
  advisors,
  advisorRole,
  currentAdvisorId,
  sessionId,
  onAssign,
  size = 'sm',
}: AdvisorAssignBadgeProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AssignmentLogEntry[] | null>(null);

  const assigned = advisors.find((a) => a.id === assignedAdvisorId) ?? null;
  const isAgent = advisorRole === 'agente';
  const isMySession = assignedAdvisorId === currentAdvisorId;

  const isPill = size === 'sm';

  useEffect(() => {
    if (!open || !sessionId || isAgent) return;
    setHistory(null);
    import('@/actions/advisor-assign-actions').then(({ getAssignmentHistory }) =>
      getAssignmentHistory(sessionId).then(setHistory),
    );
  }, [open, sessionId, isAgent]);

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

  // Agente: tomar si libre, indicador si asignado
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
            'inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/50 px-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50',
            isPill ? 'h-6 text-[10px]' : 'h-7 text-xs',
          )}
          title="Tomar esta conversación"
        >
          <UserPlus className={cn('shrink-0', isPill ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')} />
          Tomar
        </button>
      );
    }
    if (isMySession) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800 px-2 text-green-700 dark:text-green-400',
            isPill ? 'h-6 text-[10px]' : 'h-7 text-xs',
          )}
          title="Mi conversación"
        >
          <UserCheck className={cn('shrink-0', isPill ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')} />
          Yo
        </span>
      );
    }
    // Asignado a otro
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center font-semibold text-white shrink-0',
          isPill
            ? cn('h-6 rounded-full px-1.5 text-[10px]', assigned ? colorFor(assignedAdvisorId!) : 'bg-muted text-muted-foreground')
            : cn('h-6 w-6 rounded-full text-xs', assigned ? colorFor(assignedAdvisorId!) : 'bg-muted text-muted-foreground'),
        )}
        title={assigned ? (assigned.name ?? assigned.email) : 'Asignado'}
      >
        {assigned ? initials(assigned) : '?'}
      </span>
    );
  }

  // Dueño / admin: popover para asignar/reasignar + historial
  return (
    <Popover onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => e.stopPropagation()}
          title={assigned ? (assigned.name ?? assigned.email) : 'Sin asignar — click para asignar'}
          className={cn(
            'inline-flex items-center justify-center shrink-0 transition-opacity disabled:opacity-50',
            assigned
              ? cn(
                  'font-semibold text-white',
                  isPill
                    ? cn('h-6 rounded-full px-1.5 text-[10px]', colorFor(assigned.id))
                    : cn('h-6 w-6 rounded-full text-xs', colorFor(assigned.id)),
                )
              : cn(
                  'border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary',
                  isPill ? 'h-6 rounded-full px-1 gap-0.5 text-[10px]' : 'h-6 w-6 rounded-full',
                ),
          )}
        >
          {assigned
            ? initials(assigned)
            : isPill
              ? <><UserPlus className="h-2.5 w-2.5 shrink-0" /><span>Asignar</span></>
              : <UserPlus className="h-2.5 w-2.5" />
          }
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-48 p-1"
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
            <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0', colorFor(a.id))}>
              {initials(a)}
            </span>
            <span className="truncate">{a.name ?? a.email}</span>
          </button>
        ))}

        {sessionId && (
          <>
            <div className="my-1 border-t border-border/50" />
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              Historial
            </p>
            {history === null ? (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">Cargando...</p>
            ) : history.length === 0 ? (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">Sin historial.</p>
            ) : (
              history.slice(0, 3).map((entry) => {
                const advisor = advisors.find((a) => a.id === entry.advisorId);
                const name = advisor?.name ?? advisor?.email ?? entry.advisorId ?? '—';
                return (
                  <div key={entry.id} className="px-2 py-0.5 text-[10px] text-muted-foreground flex justify-between gap-1">
                    <span className="truncate">{ACTION_LABELS[entry.action] ?? entry.action}: {name}</span>
                    <span className="shrink-0">{new Date(entry.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
                  </div>
                );
              })
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
