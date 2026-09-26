'use client';

import { useState, useEffect } from 'react';
import { UserCheck, UserPlus, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePanelFlotante, type ClaseDePanel } from '@/hooks/usePanelFlotante';
import { cn } from '@/lib/utils';
import {
  CIRCULO_DEL_ASESOR,
  FORMA_DE_LA_PASTILLA,
  GLIFO_DE_LA_PASTILLA,
  PASTILLA_DE_TEXTO,
} from '@/lib/pastillas-de-la-fila';
import type { AdvisorInfo } from '@/actions/team-actions';
import type { AssignmentLogEntry } from '@/actions/advisor-assign-actions';
import { RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";

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
  auto_assigned: 'Auto-asignado',
  bulk_assigned: 'Auto-asignado',
  transferred: 'Transferido',
  resolved: 'Resuelto',
  reopened: 'Reabierto',
};

interface AdvisorAssignBadgeProps {
  assignedAdvisorId: string | null | undefined;
  advisors: AdvisorInfo[];
  advisorRole?: string | null;
  currentAdvisorId?: string;
  sessionId?: number;
  onAssign?: (advisorId: string | null) => Promise<void>;
  size?: 'sm' | 'md';
  /**
   * Dónde nace el panel, que no es lo mismo en los dos sitios que lo pintan.
   *
   * En la FILA de la lista va pegado al filo derecho de la columna, bajo su
   * control y volteando arriba si la fila está abajo del todo. En la CABECERA
   * de la conversación va pegado al filo derecho del área de conversación y a
   * la misma altura que los otros cinco paneles de esa fila, para poder pasar
   * de uno a otro sin cerrar.
   */
  panel?: ClaseDePanel;
}

export function AdvisorAssignBadge({
  assignedAdvisorId,
  advisors,
  advisorRole,
  currentAdvisorId,
  sessionId,
  onAssign,
  size = 'sm',
  panel = 'columnaDerecha',
}: AdvisorAssignBadgeProps) {
  const [open, setOpen] = useState(false);
  const colocacion = usePanelFlotante(panel, 'popover');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AssignmentLogEntry[] | null>(null);

  const assigned = advisors.find((a) => a.id === assignedAdvisorId) ?? null;
  const isAgent = advisorRole === 'agente';
  const isMySession = assignedAdvisorId === currentAdvisorId;
  const currentAdvisor = currentAdvisorId ? advisors.find((a) => a.id === currentAdvisorId) ?? null : null;
  // Una sola fila para uno mismo: "Asignarme" arriba, y fuera de la lista de
  // abajo. Salia repetido porque `advisors` incluye a quien esta mirando.
  const canAssignToMe = !!currentAdvisorId;
  const otrosAsesores = advisors.filter((a) => a.id !== currentAdvisorId);
  const hasAssignment = !!assignedAdvisorId;

  // `sm` es la pastilla de la fila de una tarjeta de Chats, la única que lo
  // usa: lleva 2 px menos de relleno por lado, igual que las demás de la fila
  // (`lib/pastillas-de-la-fila.ts`).
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
            'inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50',
            isPill ? cn(PASTILLA_DE_TEXTO, 'font-normal') : 'h-7 px-2 text-xs',
          )}
          title="Tomar esta conversación"
        >
          <UserPlus className={cn('shrink-0', isPill ? GLIFO_DE_LA_PASTILLA : 'h-3.5 w-3.5')} />
          Tomar
        </button>
      );
    }
    if (isMySession) {
      return (
        <span
          /* No es un botón —el agente no reasigna— así que sin esta marca su
             `.text-xs` valdría 14 px dentro de `.app-module-content`, donde
             los controles lo bajan a 12: saldría con la letra más grande que
             la calificación de al lado. Medido. */
          data-ui="badge"
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-400',
            isPill ? PASTILLA_DE_TEXTO : 'h-7 px-2 text-xs',
          )}
          title="Mi conversación"
        >
          <UserCheck className={cn('shrink-0', isPill ? GLIFO_DE_LA_PASTILLA : 'h-3.5 w-3.5')} />
          Yo
        </span>
      );
    }
    // Asignado a otro
    return (
      <span
        className={cn(
          'font-semibold text-white',
          isPill
            ? cn(FORMA_DE_LA_PASTILLA, CIRCULO_DEL_ASESOR, 'text-[10px]', assigned ? colorFor(assignedAdvisorId!) : 'bg-muted text-muted-foreground')
            : cn('inline-flex shrink-0 items-center justify-center h-7 w-7 rounded-full text-xs', assigned ? colorFor(assignedAdvisorId!) : 'bg-muted text-muted-foreground'),
        )}
        title={assigned ? (assigned.name ?? assigned.email) : 'Asignado'}
      >
        {assigned ? initials(assigned) : '?'}
      </span>
    );
  }

  // Dueño / admin: popover para asignar/reasignar + historial
  return (
    <Popover
      onOpenChange={(v) => {
        setOpen(v);
        colocacion.alAbrir(v);
      }}
    >
      <PopoverTrigger asChild ref={colocacion.disparador}>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => e.stopPropagation()}
          title={
            isMySession
              ? 'Mi conversación'
              : assigned
                ? (assigned.name ?? assigned.email)
                : hasAssignment
                  ? 'Asignado'
                  : 'Sin asignar - click para asignar'
          }
          className={cn(
            'inline-flex items-center justify-center shrink-0 transition-opacity disabled:opacity-50',
            isMySession
              ? cn(
                  'border border-green-300 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400',
                  /* «Yo» es un icono y una palabra: sigue siendo una PASTILLA,
                     no un avatar, así que conserva su relleno —y el de las
                     pastillas de texto de la fila, para que se lea igual que
                     la calificación y la etapa de al lado. */
                  isPill ? PASTILLA_DE_TEXTO : 'h-7 rounded-full px-2 text-xs',
                )
              : assigned
              ? cn(
                  'font-semibold text-white',
                  /* Las iniciales de un asesor son un AVATAR: un círculo, como
                     fuera de la fila (`h-7 w-7`). Con solo el alto y relleno
                     salía de 20,9 × 24, o sea un óvalo de pie. */
                  isPill
                    ? cn(FORMA_DE_LA_PASTILLA, CIRCULO_DEL_ASESOR, 'text-[10px]', colorFor(assigned.id))
                    : cn('h-7 w-7 rounded-full text-xs', colorFor(assigned.id)),
                )
              : hasAssignment
              ? cn(
                  'font-semibold text-white',
                  isPill
                    ? cn(FORMA_DE_LA_PASTILLA, CIRCULO_DEL_ASESOR, 'text-[10px]', colorFor(assignedAdvisorId!))
                    : cn('h-7 w-7 rounded-full text-xs', colorFor(assignedAdvisorId!)),
                )
              : cn(
                  'border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary',
                  /* Sin el icono de persona, «Asignar» es una palabra y nada
                     más: pasa a ser una pastilla de TEXTO como la calificación
                     y la etapa. Iba con `text-[10px]` y 2 px de relleno por
                     lado —dos escalones por debajo de sus vecinas— porque
                     tenía que hacerle sitio a un icono que no informaba de
                     nada: la palabra ya dice lo que hace. */
                  isPill ? cn(PASTILLA_DE_TEXTO, 'font-normal') : 'h-7 w-7 rounded-full',
                ),
          )}
        >
          {isMySession
            ? <><UserCheck className={cn('shrink-0', isPill ? GLIFO_DE_LA_PASTILLA : 'h-3.5 w-3.5')} /><span>Yo</span></>
            : assigned
            ? initials(assigned)
            : hasAssignment
              ? '?'
            : isPill
              /* Solo la palabra. El icono de persona delante no añadía nada
                 —la pastilla ya dice «Asignar»— y le quitaba a la fila los
                 píxeles que hacen falta para que quepa una pastilla más. */
              ? <span data-pastilla-de-asignar>Asignar</span>
              : <UserPlus className="h-4 w-4" />
          }
        </button>
      </PopoverTrigger>

      {/*
        * Con un equipo de verdad la lista de asesores se comía el menú y el
        * Historial quedaba fuera de la pantalla: no se llegaba abajo.
        *
        * Aquí no se pliega la lista como en «Acciones» —asignar a alguien ES lo
        * que se viene a hacer, y esconderlo tras un submenú añade un clic a lo
        * principal—. Lo que se hace es **darle su propio scroll**: arriba se
        * quedan fijos «Sin asignar» y «Asignarme», abajo el Historial, y solo la
        * lista se desplaza.
        *
        * Y el tope sigue sin poder ser `70vh` a secas —eso mide la ventana, no
        * el hueco que hay entre el botón y el borde—: lo pone `usePanelFlotante`
        * con la variable de Radix, que es el hueco de verdad y se recalcula al
        * voltear. Lo que cambió es DÓNDE nace: iba `side="top" align="start"`,
        * o sea arriba y a la izquierda de su icono, que en una fila de la lista
        * lo dejaba flotando en mitad de la columna. Ahora va pegado al filo
        * derecho de la columna —o de la cabecera, según quién lo pinte— y
        * voltea arriba solo cuando de verdad no cabe.
        */}
      <PopoverContent
        {...colocacion.props}
        className={`flex w-56 flex-col overflow-hidden ${RELLENO_DEL_MENU}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="shrink-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Asignar asesor
        </p>

        <button
          type="button"
          onClick={() => void handleAssign(null)}
          className={cn(
            'flex w-full shrink-0 items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors',
            !assignedAdvisorId && 'font-semibold text-primary',
          )}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
            <UserPlus className="h-2.5 w-2.5" />
          </span>
          Sin asignar
        </button>

        {canAssignToMe && (
          <button
            type="button"
            onClick={() => void handleAssign(currentAdvisorId ?? null)}
            className={cn(
              'flex w-full shrink-0 items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors',
              isMySession && 'font-semibold text-primary',
            )}
          >
            <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0', colorFor(currentAdvisorId!))}>
              {currentAdvisor ? initials(currentAdvisor) : 'Yo'}
            </span>
            <span className="truncate">Asignarme</span>
          </button>
        )}

        {canAssignToMe && otrosAsesores.length > 0 && (
          <div className="my-1 shrink-0 border-t border-border/50" />
        )}

        {/* La única parte que se desplaza: es la que crece con el equipo. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {otrosAsesores.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void handleAssign(a.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                assignedAdvisorId === a.id && 'font-semibold text-primary',
              )}
              title={a.name ?? a.email ?? undefined}
            >
              <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0', colorFor(a.id))}>
                {initials(a)}
              </span>
              <span className="truncate">{a.name ?? a.email}</span>
            </button>
          ))}
        </div>

        {sessionId && (
          <div className="shrink-0">
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
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
