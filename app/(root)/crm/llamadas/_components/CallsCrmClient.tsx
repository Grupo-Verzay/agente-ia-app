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
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getCallsCrmData, type CallsCrmData, type CallRow, type CallsKpis } from '@/actions/calls-crm-actions';
import { MetricCard } from '@/components/custom/MetricCard';
import { CallDialog } from '../../../chats/_components/CallDialog';

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
  const [dialNumber, setDialNumber] = useState('');

  const dialDigits = dialNumber.replace(/\D/g, '');
  const startDial = () => {
    if (dialDigits.length >= 6) setCallTarget({ phone: dialDigits });
  };

  const load = useCallback(() => {
    setLoading(true);
    getCallsCrmData({ days, direction })
      .then(setData)
      .finally(() => setLoading(false));
  }, [days, direction]);

  useEffect(() => { load(); }, [load]);

  const kpis = data?.kpis;

  // En modo embebido las 4 tarjetas se pintan en el slot superior del dashboard.
  useEffect(() => { onKpisChange?.(kpis); }, [kpis, onKpisChange]);

  const pieData = useMemo(
    () => [
      { name: 'Salientes', value: kpis?.outgoing ?? 0, color: '#22c55e' },
      { name: 'Entrantes', value: kpis?.incoming ?? 0, color: '#ef4444' },
    ],
    [kpis],
  );

  const barData = useMemo(
    () =>
      (data?.byDay ?? []).map((d) => ({
        date: d.date.slice(5), // MM-DD
        Salientes: d.outgoing,
        Entrantes: d.incoming,
      })),
    [data],
  );

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
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={load} title="Actualizar">
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
            className="h-9 flex-1"
          />
          <Button
            className="h-9 gap-2 bg-green-600 text-white hover:bg-green-700"
            onClick={startDial}
            disabled={dialDigits.length < 6}
          >
            <Phone className="h-4 w-4" /> Llamar
          </Button>
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

      {/* Charts */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Llamadas por día</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {barData.length === 0 ? (
              <EmptyChart loading={loading} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Salientes" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Entrantes" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribución</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {(kpis?.total ?? 0) === 0 ? (
              <EmptyChart loading={loading} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {pieData.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

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
                    <th className="py-2 pr-3 font-medium">Duración</th>
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCalls.map((c) => (
                    <CallTableRow key={c.id} call={c} onCall={() => setCallTarget({ phone: c.phone, name: c.contactName ?? undefined })} />
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
    </div>
  );
}

function CallTableRow({ call, onCall }: { call: CallRow; onCall: () => void }) {
  const isOut = call.direction === 'outgoing';
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="py-2 pr-3">
        <div className="font-medium">{call.contactName || `+${call.phone}`}</div>
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
      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{fmtDuration(call.durationSecs)}</td>
      <td className="py-2 pr-3 text-muted-foreground">{DATE_FMT.format(new Date(call.ts))}</td>
      <td className="py-2 pr-3 text-right">
        {/\d{6,}/.test(call.phone) && (
          <Button size="sm" className="h-7 gap-1 bg-green-600 text-white hover:bg-green-700" onClick={onCall}>
            <Phone className="h-3 w-3" /> Llamar
          </Button>
        )}
      </td>
    </tr>
  );
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sin datos'}
    </div>
  );
}
