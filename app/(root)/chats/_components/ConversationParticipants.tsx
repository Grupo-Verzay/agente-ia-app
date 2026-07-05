'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, X, Loader2, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
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

  // Sincroniza cuando se agrega un participante desde otro lugar (menú Acciones).
  useEffect(() => {
    const onChanged = () => void load();
    window.addEventListener('verzay:participants-changed', onChanged);
    return () => window.removeEventListener('verzay:participants-changed', onChanged);
  }, [load]);

  const participantIds = useMemo(
    () => new Set(participants.map((p) => p.userId)),
    [participants],
  );

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

  const hasParticipants = participants.length > 0;

  const addButton = (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy || addable.length === 0}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
            'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground',
          )}
        >
          <UserPlus className="h-4 w-4" />
          {hasParticipants ? 'Agregar usuario' : 'Agregar usuarios'}
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
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white',
                    colorFor(a.id),
                  )}
                >
                  {initials(a.name, a.email)}
                </span>
                <span className="truncate text-foreground">{a.name || a.email}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="rounded-xl border border-border bg-gradient-to-b from-muted/30 to-transparent p-3 shadow-sm">
      {/* Encabezado */}
      <div
        className={cn(
          'mb-2.5 flex items-center gap-2',
          !hasParticipants && 'justify-center',
        )}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Users className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold text-foreground">
          {hasParticipants ? 'Usuarios del chat' : 'Participantes'}
        </span>
        {hasParticipants && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[11px] font-bold text-primary">
            {participants.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          {hasParticipants && (
            <ul className="mb-2.5 flex flex-col gap-0.5">
              {participants.map((p) => (
                <li
                  key={p.userId}
                  className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-background',
                      colorFor(p.userId),
                    )}
                  >
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
                    className="text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-red-500 disabled:opacity-40"
                    title="Quitar usuario"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {addButton}
        </>
      )}
    </div>
  );
}
