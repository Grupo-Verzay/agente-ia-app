'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Phone,
  PhoneOutgoing,
  PhoneMissed,
  PhoneCall,
  Loader2,
  RefreshCw,
  Search,
  Download,
  ChevronDown,
  CalendarClock,
  Tag,
  FileText,
  Bot,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  getCallsCrmData,
  setCallDisposition,
  scheduleCallbackAction,
  clearMissedCallsAction,
  setCallLeadStatusAction,
  type CallsCrmData,
  type CallRow,
  type CallsKpis,
} from '@/actions/calls-crm-actions';
import { CALL_DISPOSITIONS, getDispositionMeta } from '@/lib/call-dispositions';
import { startBotCallAction } from '@/actions/voicebot-actions';
import { MetricCard } from '@/components/custom/MetricCard';
import { CallDialog } from '../../../chats/_components/CallDialog';
import { CallDetailDialog } from './CallDetailDialog';

const DAY_OPTIONS = [
  { label: '7 días', value: 7 },
  { label: '30 días', value: 30 },
  { label: '90 días', value: 90 },
];

const DIRECTION_OPTIONS: { label: string; value: 'all' | 'outgoing' | 'incoming' }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Salientes', value: 'outgoing' },
  { label: 'Entrantes', value: 'incoming' },
];

function fmtDuration(secs: number): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const DATE_FMT = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function CallsCrmClient({
  embedded = false,
  onKpisChange,
}: { embedded?: boolean; onKpisChange?: (kpis: CallsKpis | undefined) => void } = {}) {
  const [data, setData] = useState<CallsCrmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [direction, setDirection] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [query, setQuery] = useState('');
  const [callTarget, setCallTarget] = useState<{ phone: string; name?: string } | null>(null);
  const [callbackTarget, setCallbackTarget] = useState<{ phone: string; name?: string } | null>(null);
  const [dialNumber, setDialNumber] = useState('');

  const [botDialing, setBotDialing] = useState(false);
  const dialDigits = dialNumber.replace(/\D/g, '');
  const startDial = () => {
    if (dialDigits.length >= 6) setCallTarget({ phone: dialDigits });
  };
  const startBotDial = async () => {
    if (dialDigits.length < 6 || botDialing) return;
    setBotDialing(true);
    const res = await startBotCallAction(dialDigits);
    setBotDialing(false);
    if (res.success) toast.success('El asistente de voz IA está llamando…');
    else toast.error(res.message ?? 'No se pudo iniciar la llamada con IA.');
  };

  const load = useCallback(() => {
    setLoading(true);
    getCallsCrmData({ days, direction })
      .then(setData)
      .finally(() => setLoading(false));
  }, [days, direction]);

  useEffect(() => { load(); }, [load]);

  const router = useRouter();
  const openChat = (phone: string) =>
    router.push(`/chats?jid=${encodeURIComponent(`${phone}@s.whatsapp.net`)}`);

  const [clearing, setClearing] = useState(false);
  const clearMissed = async () => {
    if (clearing) return;
    if (!confirm('¿Eliminar todas las llamadas perdidas del historial?')) return;
    setClearing(true);
    const res = await clearMissedCallsAction();
    setClearing(false);
    if (res.success) {
      toast.success(`${res.deleted ?? 0} llamada(s) perdida(s) eliminada(s).`);
      load();
    } else {
      toast.error(res.message ?? 'No se pudo limpiar.');
    }
  };

  // Actualiza la disposición de una llamada (optimista en el estado local).
  const applyDisposition = useCallback(async (callId: string, value: string) => {
    setData((prev) =>
      prev
        ? { ...prev, calls: prev.calls.map((c) => (c.id === callId ? { ...c, disposition: value } : c)) }
        : prev,
    );
    const res = await setCallDisposition(callId, value);
    if (!res.success) {
      toast.error(res.message ?? 'No se pudo guardar el resultado.');
      load(); // revertir desde el servidor
    }
  }, [load]);

  const kpis = data?.kpis;

  // En modo embebido las 4 tarjetas se pintan en el slot superior del dashboard.
  useEffect(() => { onKpisChange?.(kpis); }, [kpis, onKpisChange]);

  // Últimos números marcados (únicos) para rellamada rápida.
  const recentDials = useMemo(() => {
    const seen = new Set<string>();
    const out: { phone: string; name?: string }[] = [];
    for (const c of data?.calls ?? []) {
      if (!/\d{6,}/.test(c.phone) || seen.has(c.phone)) continue;
      seen.add(c.phone);
      out.push({ phone: c.phone, name: c.contactName ?? undefined });
      if (out.length >= 5) break;
    }
    return out;
  }, [data]);

  const visibleCalls = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const digits = raw.replace(/\D/g, '');
    const calls = data?.calls ?? [];
    if (!raw) return calls;
    return calls.filter((c) => {
      const nameHit = (c.contactName ?? '').toLowerCase().includes(raw);
      const phoneHit = digits.length > 0 && c.phone.includes(digits);
      return nameHit || phoneHit;
    });
  }, [data, query]);

  const handleExport = () => {
    if (visibleCalls.length === 0) return;
    const header = ['Contacto', 'Número', 'Tipo', 'Duración (s)', 'Fecha'];
    const rows = visibleCalls.map((c) => [
      c.contactName ?? '',
      c.phone,
      c.direction === 'outgoing' ? 'Saliente' : 'Entrante',
      String(c.durationSecs),
      new Date(c.ts).toLocaleString('es-CO'),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `llamadas-${days}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('flex flex-col gap-3', embedded ? 'h-full' : 'h-full overflow-y-auto p-1 sm:p-2')}>
      {/* Título (solo página independiente) */}
      {!embedded && (
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-950/40">
            <PhoneCall className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight">Llamadas</h1>
            <p className="text-xs text-muted-foreground">Registro y métricas de llamadas por WhatsApp</p>
          </div>
        </div>
      )}

      {/* Toolbar: buscador + rango de días */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por contacto o número..."
            className="h-9 pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Rango de días */}
          <div className="flex rounded-lg border border-border p-0.5">
            {DAY_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setDays(o.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  days === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={handleExport}
            disabled={visibleCalls.length === 0}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">Exportar</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
            onClick={() => void clearMissed()}
            disabled={clearing}
            title="Eliminar llamadas perdidas del historial"
          >
            <PhoneMissed className="h-4 w-4 shrink-0" />
            <span className="truncate">Limpiar perdidas</span>
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={load} title="Actualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Marcador */}
      <Card className="border-border">
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-950/40">
              <PhoneOutgoing className="h-4 w-4" />
            </span>
            Marcador
          </span>
          <Input
            value={dialNumber}
            onChange={(e) => setDialNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') startDial(); }}
            placeholder="Número con código de país, ej. 573001234567"
            inputMode="tel"
            className="h-9 w-full sm:w-80"
          />
          <Button
            className="h-9 gap-2 bg-green-600 text-white hover:bg-green-700"
            onClick={startDial}
            disabled={dialDigits.length < 6}
          >
            <Phone className="h-4 w-4" /> Llamar
          </Button>
          <Button
            variant="outline"
            className="h-9 gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-900/50 dark:text-violet-400 dark:hover:bg-violet-950/30"
            onClick={() => void startBotDial()}
            disabled={dialDigits.length < 6 || botDialing}
            title="El asistente de voz IA llama y conversa por ti"
          >
            {botDialing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            Llamar con IA
          </Button>

          {/* Rellamada rápida: últimos números marcados */}
          {recentDials.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
              <span className="text-xs font-medium text-muted-foreground">Rellamar:</span>
              {recentDials.map((d) => (
                <button
                  key={d.phone}
                  type="button"
                  onClick={() => setCallTarget({ phone: d.phone, name: d.name })}
                  title={`Llamar a ${d.name || `+${d.phone}`}`}
                  className="inline-flex max-w-[10rem] items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:hover:border-green-900/50 dark:hover:bg-green-950/30 dark:hover:text-green-400"
                >
                  <Phone className="h-3 w-3 shrink-0 text-green-600" />
                  <span className="truncate">{d.name || `+${d.phone}`}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs (4 tarjetas estándar) — en modo embebido van en el slot superior del dashboard */}
      {!embedded && (
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<Phone className="h-4 w-4" />}
            label="Total"
            value={kpis?.total ?? 0}
            helper={`Duración total ${fmtDuration(kpis?.totalDurationSecs ?? 0)}`}
            color="#3B82F6"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<PhoneOutgoing className="h-4 w-4" />}
            label="Salientes"
            value={kpis?.outgoing ?? 0}
            helper="Llamadas realizadas desde el panel"
            color="#22C55E"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<PhoneMissed className="h-4 w-4" />}
            label="Entrantes"
            value={kpis?.incoming ?? 0}
            helper="Llamadas recibidas / perdidas"
            color="#EF4444"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<PhoneCall className="h-4 w-4" />}
            label="Contestadas"
            value={kpis?.answered ?? 0}
            helper={`Duración promedio ${fmtDuration(kpis?.avgDurationSecs ?? 0)}`}
            color="#8B5CF6"
          />
        </div>
      </div>
      )}

      {/* Gráficos eliminados aquí: ya están en la pestaña Analíticas. */}

      {/* Tabla */}
      <Card className="border-border flex-1">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm">Historial</CardTitle>
          <div className="flex rounded-lg border border-border p-0.5">
            {DIRECTION_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setDirection(o.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  direction === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : visibleCalls.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {query.trim() ? 'No hay llamadas que coincidan con la búsqueda.' : 'No hay llamadas en este periodo.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Contacto</th>
                    <th className="py-2 pr-3 font-medium">Tipo</th>
                    <th className="py-2 pr-3 font-medium">Resultado</th>
                    <th className="py-2 pr-3 font-medium">Duración</th>
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCalls.map((c) => (
                    <CallTableRow
                      key={c.id}
                      call={c}
                      onCall={() => setCallTarget({ phone: c.phone, name: c.contactName ?? undefined })}
                      onDisposition={(value) => applyDisposition(c.id, value)}
                      onCallback={() => setCallbackTarget({ phone: c.phone, name: c.contactName ?? undefined })}
                      onOpenChat={() => openChat(c.phone)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {callTarget && /\d{6,}/.test(callTarget.phone) && (
        <CallDialog
          open={!!callTarget}
          onClose={() => setCallTarget(null)}
          phone={callTarget.phone}
          contactName={callTarget.name}
        />
      )}

      {callbackTarget && (
        <CallbackDialog
          open={!!callbackTarget}
          onClose={() => setCallbackTarget(null)}
          phone={callbackTarget.phone}
          contactName={callbackTarget.name}
        />
      )}
    </div>
  );
}

/** Diálogo para agendar un callback (tarea interna "volver a llamar"). */
function CallbackDialog({
  open,
  onClose,
  phone,
  contactName,
}: {
  open: boolean;
  onClose: () => void;
  phone: string;
  contactName?: string;
}) {
  // Valor por defecto: dentro de 1 hora, formato datetime-local (sin zona).
  const defaultWhen = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);
  const [when, setWhen] = useState(defaultWhen);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!when) return;
    const due = new Date(when);
    if (isNaN(due.getTime())) {
      toast.error('Fecha inválida.');
      return;
    }
    setSaving(true);
    const res = await scheduleCallbackAction({
      phone,
      contactName: contactName ?? null,
      dueDate: due.toISOString(),
      note: note.trim() || null,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Callback agendado. Lo verás en Tareas.');
      onClose();
    } else {
      toast.error(res.message ?? 'No se pudo agendar el callback.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Agendar callback</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="text-sm">
            <span className="font-medium">{contactName || `+${phone}`}</span>
            {contactName && <span className="ml-1 text-muted-foreground">+{phone}</span>}
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Fecha y hora
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Nota (opcional)
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motivo o detalle del callback"
              className="h-9"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            className="gap-2 bg-green-600 text-white hover:bg-green-700"
            onClick={() => void handleSave()}
            disabled={saving || !when}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LEAD_STATUS_META: Record<string, { label: string; className: string }> = {
  FRIO: { label: 'Frío', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-400' },
  TIBIO: { label: 'Tibio', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400' },
  CALIENTE: { label: 'Caliente', className: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-400' },
  FINALIZADO: { label: 'Finalizado', className: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-400' },
  DESCARTADO: { label: 'Descartado', className: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400' },
};

// Control compacto para fijar/cambiar el estado del lead desde la fila de llamada.
// Si el lead no existe aún, la acción lo crea (lead mínimo) para no perder el contacto.
function LeadStatusButton({ phone, contactName }: { phone: string; contactName?: string | null }) {
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const meta = status ? LEAD_STATUS_META[status] : null;

  const apply = async (value: string | null) => {
    const prev = status;
    setStatus(value);
    setSaving(true);
    const res = await setCallLeadStatusAction({ phone, contactName, leadStatus: value });
    setSaving(false);
    if (!res.success) {
      setStatus(prev);
      toast.error(res.message || 'No se pudo cambiar el estado.');
      return;
    }
    toast.success(res.created ? 'Lead creado y estado guardado.' : 'Estado del lead actualizado.');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={saving}
          title="Estado del lead"
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60',
            meta ? meta.className : 'border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted/60',
          )}
        >
          {meta ? meta.label : 'Estado'}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(LEAD_STATUS_META).map(([value, m]) => (
          <DropdownMenuItem key={value} onSelect={() => apply(value)}>
            {m.label}
          </DropdownMenuItem>
        ))}
        {status && (
          <DropdownMenuItem onSelect={() => apply(null)} className="text-muted-foreground">
            Quitar estado
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CallTableRow({
  call,
  onCall,
  onDisposition,
  onCallback,
  onOpenChat,
}: {
  call: CallRow;
  onCall: () => void;
  onDisposition: (value: string) => void;
  onCallback: () => void;
  onOpenChat: () => void;
}) {
  const isOut = call.direction === 'outgoing';
  const dispMeta = getDispositionMeta(call.disposition);
  const callable = /\d{6,}/.test(call.phone);
  const [detailOpen, setDetailOpen] = useState(false);
  const hasDetail = call.hasRecording || !!call.transcript || !!call.summary;
  const recordingUrl =
    call.astraSid && call.astraCallId
      ? `/api/calls/recording?sid=${encodeURIComponent(call.astraSid)}&callId=${encodeURIComponent(call.astraCallId)}`
      : null;
  return (
    <>
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="text-muted-foreground hover:text-foreground"
            title="Ver detalle de la llamada y del lead"
          >
            <FileText className={`h-4 w-4 ${hasDetail ? 'text-blue-600' : 'text-muted-foreground/60'}`} />
          </button>
          <button
            type="button"
            onClick={onOpenChat}
            title="Abrir chat del contacto"
            className="font-medium text-left hover:text-blue-600 hover:underline"
          >
            {call.contactName || `+${call.phone}`}
          </button>
        </div>
        {call.contactName && <div className="text-xs text-muted-foreground">+{call.phone}</div>}
      </td>
      <td className="py-2 pr-3">
        {isOut ? (
          <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-400">
            <PhoneOutgoing className="h-3 w-3" /> Saliente
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <PhoneMissed className="h-3 w-3" /> Perdida
          </Badge>
        )}
      </td>
      <td className="py-2 pr-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors',
                dispMeta
                  ? dispMeta.badgeClass
                  : 'border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted/60',
              )}
            >
              {dispMeta ? (
                <><Tag className="h-3 w-3" /> {dispMeta.label}</>
              ) : (
                <>Marcar resultado</>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CALL_DISPOSITIONS.map((d) => (
              <DropdownMenuItem key={d.value} onSelect={() => onDisposition(d.value)}>
                {d.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{fmtDuration(call.durationSecs)}</td>
      <td className="py-2 pr-3 text-muted-foreground">{DATE_FMT.format(new Date(call.ts))}</td>
      <td className="py-2 pr-3">
        <div className="flex items-center justify-end gap-1.5">
          <LeadStatusButton phone={call.phone} contactName={call.contactName} />
          {callable && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1"
              onClick={onCallback}
              title="Agendar callback"
            >
              <CalendarClock className="h-3 w-3" /> Callback
            </Button>
          )}
          {callable && (
            <Button size="sm" className="h-7 gap-1 bg-green-600 text-white hover:bg-green-700" onClick={onCall}>
              <Phone className="h-3 w-3" /> Llamar
            </Button>
          )}
        </div>
      </td>
    </tr>
    <CallDetailDialog
      call={call}
      recordingUrl={recordingUrl}
      open={detailOpen}
      onOpenChange={setDetailOpen}
    />
    </>
  );
}

