'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, X, Loader2, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import type { AdvisorInfo } from '@/actions/team-actions';
import {
  getSessionParticipantsAction,
  addSessionParticipantAction,
  removeSessionParticipantAction,
  type ParticipantInfo,
} from '@/actions/collab-actions';

function initials(name?: string | null, email?: string | null) {
  const s = (name || email || '?').trim();
  const parts = s.split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
}

interface Props {
  sessionId: number;
  advisors: AdvisorInfo[];
  currentUserId: string;
}

export function ConversationParticipants({ sessionId, advisors, currentUserId }: Props) {
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await getSessionParticipantsAction(sessionId);
    if (res.success) setParticipants(res.data);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const participantIds = useMemo(
    () => new Set(participants.map((p) => p.userId)),
    [participants],
  );

  // Asesores del equipo que aún no participan (excluye a uno mismo).
  const addable = useMemo(
    () => advisors.filter((a) => !participantIds.has(a.id) && a.id !== currentUserId),
    [advisors, participantIds, currentUserId],
  );

  const handleAdd = useCallback(
    async (advisor: AdvisorInfo) => {
      setBusy(true);
      setPickerOpen(false);
      const res = await addSessionParticipantAction(sessionId, advisor.id);
      if (res.success) {
        toast.success(`${advisor.name || 'Asesor'} agregado a la conversación.`);
        await load();
      } else {
        toast.error(res.message);
      }
      setBusy(false);
    },
    [sessionId, load],
  );

  const handleRemove = useCallback(
    async (p: ParticipantInfo) => {
      setBusy(true);
      const res = await removeSessionParticipantAction(sessionId, p.userId);
      if (res.success) {
        setParticipants((prev) => prev.filter((x) => x.userId !== p.userId));
      } else {
        toast.error(res.message);
      }
      setBusy(false);
    },
    [sessionId],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Participantes de la conversación
          </span>
        </div>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={busy || addable.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 text-primary transition hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
              title="Agregar participante"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1">
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Agregar asesor
            </p>
            <div className="max-h-56 overflow-y-auto">
              {addable.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  No hay más asesores para agregar.
                </p>
              ) : (
                addable.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => void handleAdd(a)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {initials(a.name, a.email)}
                    </span>
                    <span className="truncate text-foreground">{a.name || a.email}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : participants.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">
          Nadie más participa aún. Agrega asesores para colaborar.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {participants.map((p) => (
            <li key={p.userId} className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {initials(p.name, p.email)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {p.name || p.email}
                {p.userId === currentUserId && (
                  <span className="ml-1 text-[10px] text-muted-foreground">(tú)</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void handleRemove(p)}
                disabled={busy}
                className="text-muted-foreground/60 transition hover:text-red-500 disabled:opacity-40"
                title="Quitar participante"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
