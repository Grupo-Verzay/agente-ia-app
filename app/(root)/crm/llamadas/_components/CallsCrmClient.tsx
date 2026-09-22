'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Phone,
  PhoneOutgoing,
  PhoneMissed,
  PhoneCall,
  Loader2,
  Search,
  Download,
  ChevronDown,
  CalendarClock,
  Tag,
  FileText,
  MoreVertical,
  Trash2,
  MessageSquare,
  ArrowUpDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { elDetalleDeLaLlamada } from '@/lib/detalle-de-la-llamada';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  getMissedCallReplyConfig,
  saveMissedCallReplyConfig,
} from '@/actions/missed-call-reply-actions';
import {
  getCallsCrmData,
  setCallDisposition,
  scheduleCallbackAction,
  clearMissedCallsAction,
  setCallLeadStatusAction,
  setCallContactNameAction,
  diagnoseCallsAction,
  deleteCallAction,
  deleteAllCallsAction,
  type CallsCrmData,
  type CallRow,
  type CallsKpis,
} from '@/actions/calls-crm-actions';
import { CALL_DISPOSITIONS, getDispositionMeta } from '@/lib/call-dispositions';
import { startBotCallAction } from '@/actions/voicebot-actions';
import { BarraDeAcciones } from '@/components/shared/BarraDeAcciones';
import { PastillasDeMetricas } from '@/components/shared/PastillasDeMetricas';
import { DialogoDeLlamar } from './DialogoDeLlamar';
import { DIAS_POR_DEFECTO } from './rango-de-dias';
import { InsigniaDeCuenta } from '@/components/shared/InsigniaDeCuenta';
import { esDeOtraCuentaDelCrm } from '@/lib/crm-de-la-familia';
import { abrirLlamadaAqui } from '@/components/chats/AnfitrionDeLlamada';
import { CallDetailDialog } from './CallDetailDialog';
import { EXPORTACION_DE_CLIENTES_HABILITADA } from "@/lib/exportaciones";

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

// Número limpio y legible: "+57 321 603 1493" (agrupa desde la derecha).
function formatPhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  const parts: string[] = [];
  let rest = d;
  if (rest.length > 4) { parts.unshift(rest.slice(-4)); rest = rest.slice(0, -4); }
  else { return `+${rest}`; }
  if (rest.length > 3) { parts.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
  else if (rest) { parts.unshift(rest); rest = ''; }
  if (rest.length > 3) { parts.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
  else if (rest) { parts.unshift(rest); rest = ''; }
  if (rest) parts.unshift(rest);
  return `+${parts.join(' ')}`;
}

// Nombres "basura" que no aportan (ej. el propio WhatsApp se nombra "Você"/"You").
function cleanName(name?: string | null): string {
  const n = (name || '').trim();
  if (!n) return '';
  if (/^(você|voce|you|tú|tu)$/i.test(n)) return '';
  return n;
}

type SortKey = 'contacto' | 'tipo' | 'duracion' | 'fecha' | 'detalle' | 'resultado';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

// Encabezado centrado con flecha de ordenar (↕), estilo Registros.
function Th({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey?: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
}) {
  if (!sortKey) {
    return <th className="px-2 py-2 text-center font-medium">{label}</th>;
  }
  const active = sort?.key === sortKey;
  return (
    <th className="px-2 py-2 text-center font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
      >
        {label}
        <ArrowUpDown className={cn('h-3.5 w-3.5', active ? 'opacity-100' : 'opacity-50')} />
      </button>
    </th>
  );
}

const DATE_FMT = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/*
 * Aquí había un `onKpisChange` con el que esta pantalla le subía sus cifras al
 * panel del CRM para que las pintara en cuatro tarjetas encima. Las tarjetas se
 * fueron —no filtraban nada allí— y las pastillas de abajo, que sí filtran,
 * salen ya también en modo embebido. Sin tarjetas arriba, el canal sobra.
 */
export function CallsCrmClient({
  embedded = false,
  cuentas,
  cuentaPropia,
  unificado = false,
  nombresDeCuenta = {},
  dias = DIAS_POR_DEFECTO,
  refresco = 0,
  alCargar,
}: {
  embedded?: boolean;
  /**
   * Las cuentas que el filtro tiene puestas. Se re-resuelven en el servidor
   * —una accion ES un endpoint— y aqui solo deciden que se pide.
   */
  cuentas: string[];
  cuentaPropia: string;
  unificado?: boolean;
  nombresDeCuenta?: Record<string, string>;
  /**
   * El rango de días. Lo manda la fila de pestañas del CRM, que es donde vive
   * ahora: el número que se elige arriba y el que consulta esta pantalla salen
   * de la MISMA lista (`rango-de-dias.ts`), o serían dos y un día dirían cosas
   * distintas.
   */
  dias?: number;
  /** Sube al pulsar «Actualizar» arriba; con eso se vuelve a pedir la vuelta. */
  refresco?: number;
  /** Para que el botón de arriba pueda girar mientras la consulta va y vuelve. */
  alCargar?: (cargando: boolean) => void;
}) {
  const [data, setData] = useState<CallsCrmData | null>(null);
  const [loading, setLoading] = useState(true);
  const days = dias;
  const [direction, setDirection] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const [callbackTarget, setCallbackTarget] = useState<{ phone: string; name?: string } | null>(null);
  const [dialNumber, setDialNumber] = useState('');

  const [botDialing, setBotDialing] = useState(false);
  const dialDigits = dialNumber.replace(/\D/g, '');
  const startDial = () => {
    if (dialDigits.length >= 6) abrirLlamadaAqui({ phone: dialDigits });
  };
  const startBotDial = async () => {
    if (dialDigits.length < 6 || botDialing) return;
    setBotDialing(true);
    const res = await startBotCallAction(dialDigits);
    setBotDialing(false);
    if (res.success) toast.success('El asistente de voz IA está llamando…');
    else toast.error(res.message ?? 'No se pudo iniciar la llamada con IA.');
  };

  // `alCargar` va por REFERENCIA a propósito: quien lo pasa lo escribe inline,
  // así que metiéndolo en las dependencias `load` cambiaría de identidad en
  // cada pintado del padre y el efecto de abajo volvería a pedir la vuelta
  // entera — una consulta por repintado.
  const alCargarRef = useRef(alCargar);
  alCargarRef.current = alCargar;

  // La llave es la CADENA, nunca el arreglo: el padre crea uno nuevo en cada
  // pintado, asi que con el arreglo dentro de las dependencias la lista se
  // recargaria en bucle.
  const llaveDeCuentas = cuentas.join(',');

  const load = useCallback(() => {
    setLoading(true);
    alCargarRef.current?.(true);
    getCallsCrmData({
      days,
      direction,
      cuentas: llaveDeCuentas ? llaveDeCuentas.split(',') : null,
    })
      .then(setData)
      .finally(() => {
        setLoading(false);
        alCargarRef.current?.(false);
      });
    // `refresco` no se lee aquí dentro: está en las dependencias para que
    // pulsar «Actualizar» en la fila de pestañas vuelva a disparar el efecto.
    // Sin él el botón no haría nada, que es peor que no tenerlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, direction, llaveDeCuentas, refresco]);

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

  const deleteAll = async () => {
    if (!confirm('¿Eliminar TODAS las llamadas del historial? Esta acción no se puede deshacer.')) return;
    const res = await deleteAllCallsAction();
    if (res.success) {
      toast.success(`${res.deleted ?? 0} llamada(s) eliminada(s).`);
      load();
    } else {
      toast.error(res.message ?? 'No se pudieron eliminar.');
    }
  };

  // ── Config: mensaje automático al no contestar una llamada saliente ──
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgEnabled, setCfgEnabled] = useState(false);
  const [cfgText, setCfgText] = useState('');

  const openMissedCfg = async () => {
    setCfgOpen(true);
    setCfgLoading(true);
    try {
      const cfg = await getMissedCallReplyConfig();
      setCfgEnabled(cfg.enabled);
      setCfgText(cfg.text);
    } finally {
      setCfgLoading(false);
    }
  };

  const saveMissedCfg = async () => {
    setCfgSaving(true);
    const res = await saveMissedCallReplyConfig({ enabled: cfgEnabled, text: cfgText });
    setCfgSaving(false);
    if (res.success) {
      toast.success('Configuración guardada.');
      setCfgOpen(false);
    } else {
      toast.error(res.message ?? 'No se pudo guardar.');
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

  const visibleCalls = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const digits = raw.replace(/\D/g, '');
    let calls = data?.calls ?? [];
    if (raw) {
      calls = calls.filter((c) => {
        const nameHit = (c.contactName ?? '').toLowerCase().includes(raw);
        const phoneHit = digits.length > 0 && c.phone.includes(digits);
        return nameHit || phoneHit;
      });
    }
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      calls = [...calls].sort((a, b) => {
        let cmp = 0;
        switch (sort.key) {
          case 'contacto': cmp = a.phone.localeCompare(b.phone); break;
          case 'tipo': cmp = a.direction.localeCompare(b.direction); break;
          case 'duracion': cmp = a.durationSecs - b.durationSecs; break;
          case 'fecha': cmp = a.ts - b.ts; break;
          // La MISMA funcion que pinta la celda: ordenando por `leadSynthesis`
          // a secas, la columna se ordenaba por un valor y ensenaba otro.
          case 'detalle': cmp = elDetalleDeLaLlamada(a).localeCompare(elDetalleDeLaLlamada(b)); break;
          case 'resultado': cmp = (a.disposition ?? '').localeCompare(b.disposition ?? ''); break;
        }
        return cmp * dir;
      });
    }
    return calls;
  }, [data, query, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === 'asc'
          ? { key, dir: 'desc' }
          : null
        : { key, dir: 'asc' },
    );

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

      {/*
        UNA sola fila, la misma que el resto de listas de la plataforma
        (`BarraDeAcciones`, cinco huecos y el orden ES la regla):

            [buscador] [·· pastillas + dirección ··] [Exportar] [Llamar] [⋯]

        Antes eran DOS recuadros —el marcador arriba con su campo y sus dos
        botones, y los conteos pegados al historial— más los rangos de días,
        que se fueron a la fila de pestañas del CRM. El campo del número y
        «Llamar con IA» viven ahora dentro del diálogo de «Llamar», que es el
        botón azul de esta barra: **las dos llamadas son exactamente las
        mismas de antes**, lo único que cambia es desde dónde se pulsan.
      */}
      <BarraDeAcciones
        buscador={
          <div className="relative w-56 min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por contacto o número..."
              className="w-full pl-9 text-xs"
            />
          </div>
        }
        filtros={
          <>
            {/* Aquí las pastillas SON el filtro de dirección, así que salen
                también en el teléfono (`enElTelefono`): esconderlas no
                ahorraría sitio, quitaría la función. */}
            <PastillasDeMetricas
              enElTelefono
              metricas={[
                {
                  clave: 'all',
                  icono: <Phone />,
                  etiqueta: 'Total',
                  valor: kpis?.total ?? 0,
                  color: '#3B82F6',
                  ayuda: `Duración total ${fmtDuration(kpis?.totalDurationSecs ?? 0)} · promedio ${fmtDuration(kpis?.avgDurationSecs ?? 0)} · ${kpis?.answered ?? 0} contestadas`,
                  alPulsar: () => setDirection('all'),
                  activa: direction === 'all',
                },
                {
                  clave: 'outgoing',
                  icono: <PhoneOutgoing />,
                  etiqueta: 'Salientes',
                  valor: kpis?.outgoing ?? 0,
                  color: '#22C55E',
                  ayuda: 'Llamadas realizadas desde el panel',
                  alPulsar: () => setDirection(direction === 'outgoing' ? 'all' : 'outgoing'),
                  activa: direction === 'outgoing',
                },
                {
                  clave: 'incoming',
                  icono: <PhoneMissed />,
                  etiqueta: 'Entrantes',
                  valor: kpis?.incoming ?? 0,
                  color: '#EF4444',
                  ayuda: 'Llamadas recibidas / perdidas',
                  alPulsar: () => setDirection(direction === 'incoming' ? 'all' : 'incoming'),
                  activa: direction === 'incoming',
                },
              ]}
            />
            <div
              data-grupo="direccion"
              className="flex shrink-0 rounded-lg border border-border p-0.5"
            >
              {DIRECTION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setDirection(o.value)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    direction === o.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        }
        secundarias={
          EXPORTACION_DE_CLIENTES_HABILITADA ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExport}
              disabled={visibleCalls.length === 0}
              title="Exportar CSV"
              aria-label="Exportar CSV"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span className="hidden truncate sm:inline">Exportar</span>
            </Button>
          ) : undefined
        }
        crear={
          <DialogoDeLlamar
            numero={dialNumber}
            alEscribir={setDialNumber}
            alLlamar={startDial}
            alLlamarConIa={() => void startBotDial()}
            llamandoConIa={botDialing}
          />
        }
        acciones={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10" title="Acciones" disabled={clearing}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Acciones globales</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void openMissedCfg()}>
                <MessageSquare className="mr-2 h-4 w-4" /> Mensaje al no contestar
              </DropdownMenuItem>
              {/* Los dos borrados en bloque acotan por la cuenta propia, asi
                  que debajo de una lista de tres cuentas prometerian lo que no
                  hacen: se van mientras se consolida, como «Eliminar todas» de
                  Finanzas. */}
              {!unificado && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void clearMissed()} className="text-red-600 focus:text-red-700">
                    <PhoneMissed className="mr-2 h-4 w-4" /> Limpiar perdidas
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void deleteAll()} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar todas las llamadas
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Gráficos eliminados aquí: ya están en la pestaña Analíticas. */}

      {/* Tabla */}
      <Card className="border-border flex-1">
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : visibleCalls.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-center text-sm text-muted-foreground">
                {query.trim() ? 'No hay llamadas que coincidan con la búsqueda.' : 'No hay llamadas en este periodo.'}
              </p>
              {!query.trim() && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    const d = await diagnoseCallsAction();
                    const lines = [
                      `Llamadas encontradas (todas las fechas): ${d.totalInScope}`,
                      `Por cuenta: ${d.perScope.map((p) => `${p.id.slice(-6)}=${p.calls}`).join(', ') || '—'}`,
                      d.lastCall
                        ? `Última: ${new Date(d.lastCall.ts).toLocaleString()} — "${d.lastCall.content}"`
                        : 'Última: ninguna',
                      `Instancias: ${d.instances.map((i) => `${i.instanceName ?? '?'}(${i.instanceType ?? '?'})`).join(', ') || '—'}`,
                    ];
                    // eslint-disable-next-line no-alert
                    alert(lines.join('\n'));
                  }}
                >
                  🔍 Diagnóstico
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    {unificado && <Th label="Cuenta" sort={sort} onSort={toggleSort} />}
                    <Th label="Contacto" sortKey="contacto" sort={sort} onSort={toggleSort} />
                    <Th label="Tipo" sortKey="tipo" sort={sort} onSort={toggleSort} />
                    <Th label="Duración" sortKey="duracion" sort={sort} onSort={toggleSort} />
                    <Th label="Fecha" sortKey="fecha" sort={sort} onSort={toggleSort} />
                    <Th label="Detalle" sortKey="detalle" sort={sort} onSort={toggleSort} />
                    <Th label="Resultado" sortKey="resultado" sort={sort} onSort={toggleSort} />
                    <Th label="Estado" sort={sort} onSort={toggleSort} />
                    <Th label="Acciones" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {visibleCalls.map((c) => (
                    <CallTableRow
                      key={c.id}
                      call={c}
                      nombreDeLaCuenta={unificado ? nombresDeCuenta[c.cuentaId] : undefined}
                      ajena={esDeOtraCuentaDelCrm(c.cuentaId, cuentaPropia)}
                      onCall={() => abrirLlamadaAqui({ phone: c.phone, contactName: c.contactName ?? undefined })}
                      onDisposition={(value) => applyDisposition(c.id, value)}
                      onCallback={() => setCallbackTarget({ phone: c.phone, name: c.contactName ?? undefined })}
                      onOpenChat={() => openChat(c.phone)}
                      onChanged={load}
                      onDelete={async () => {
                        if (!confirm('¿Eliminar esta llamada del historial?')) return;
                        const res = await deleteCallAction(c.id);
                        if (res.success) { toast.success('Llamada eliminada.'); load(); }
                        else toast.error(res.message ?? 'No se pudo eliminar.');
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {callbackTarget && (
        <CallbackDialog
          open={!!callbackTarget}
          onClose={() => setCallbackTarget(null)}
          phone={callbackTarget.phone}
          contactName={callbackTarget.name}
        />
      )}

      {/* Config: mensaje automático al no contestar una llamada saliente */}
      <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Mensaje al no contestar
            </DialogTitle>
          </DialogHeader>
          {cfgLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Cuando hagas una llamada saliente y el cliente no conteste, se le enviará
                automáticamente este mensaje por WhatsApp (queda registrado en el chat).
              </p>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="missed-call-enabled" className="text-sm font-medium">
                  Enviar mensaje al no contestar
                </Label>
                <Switch id="missed-call-enabled" checked={cfgEnabled} onCheckedChange={setCfgEnabled} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Mensaje</Label>
                <Textarea
                  value={cfgText}
                  onChange={(e) => setCfgText(e.target.value)}
                  rows={4}
                  placeholder="Escribe el mensaje que se enviará al contacto..."
                  disabled={!cfgEnabled}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfgOpen(false)} disabled={cfgSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveMissedCfg()} disabled={cfgSaving || cfgLoading}>
              {cfgSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
/**
 * El nombre bajo el número, editable en el sitio.
 *
 * En un historial de llamadas un número suelto no dice de qué cliente es, y el
 * nombre que da WhatsApp muchas veces no existe o no sirve. Un clic sobre él lo
 * abre para escribir; Enter guarda, Escape cancela y vaciarlo devuelve el de
 * WhatsApp.
 */
function ContactNameCell({
  phone,
  name,
  onSaved,
}: {
  phone: string;
  name: string;
  onSaved?: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(name);
  const [guardando, setGuardando] = useState(false);

  // El nombre puede cambiar por debajo (recarga de la lista) mientras no se esté
  // escribiendo en él.
  useEffect(() => {
    if (!editando) setValor(name);
  }, [name, editando]);

  const guardar = async () => {
    const limpio = valor.trim();
    setEditando(false);
    if (limpio === name) return;

    setGuardando(true);
    const res = await setCallContactNameAction({ phone, name: limpio || null });
    setGuardando(false);
    if (!res.success) {
      setValor(name);
      toast.error(res.message || 'No se pudo guardar el nombre.');
      return;
    }
    toast.success(limpio ? 'Nombre guardado.' : 'Nombre quitado.');
    onSaved?.();
  };

  if (editando) {
    return (
      <Input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void guardar();
          }
          if (e.key === 'Escape') {
            setValor(name);
            setEditando(false);
          }
        }}
        placeholder="Nombre del contacto"
        className="mx-auto mt-1 h-7 max-w-[180px] text-center text-xs"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      disabled={guardando}
      title="Editar el nombre del contacto"
      className={cn(
        'mx-auto mt-0.5 block max-w-[180px] truncate rounded px-1 text-xs transition-colors hover:bg-muted disabled:opacity-60',
        name ? 'text-muted-foreground hover:text-foreground' : 'italic text-muted-foreground/60 hover:text-foreground',
      )}
    >
      {name || 'Poner nombre'}
    </button>
  );
}

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
  onDelete,
  onChanged,
  nombreDeLaCuenta,
  ajena = false,
}: {
  call: CallRow;
  onCall: () => void;
  onDisposition: (value: string) => void;
  onCallback: () => void;
  onOpenChat: () => void;
  onDelete: () => void;
  onChanged?: () => void;
  /** Solo llega consolidando. */
  nombreDeLaCuenta?: string;
  /**
   * **Consolidar es para MIRAR, no para editar.** Las cuatro escrituras de
   * Llamadas —el resultado, el borrado, el nombre del contacto y el estado del
   * lead— acotan por la cuenta propia (`scopeIds` / `ownerId`), asi que sobre
   * una fila de una cuenta hermana contestarian «no encontrada»: menu abierto,
   * puerta cerrada. Es la misma regla que ya rige en Finanzas.
   *
   * Y es la excepcion dentro del CRM: en Registros y en el tablero las
   * acciones resuelven el dueno DESDE LA FILA (`assertUserCanUseApp(
   * session.userId)`), asi que ahi la madre SI esta autorizada y no se gatea
   * nada — gatearlo seria quitarle algo que los permisos ya le dan.
   */
  ajena?: boolean;
}) {
  const isOut = call.direction === 'outgoing';
  const dispMeta = getDispositionMeta(call.disposition);
  const callable = /\d{6,}/.test(call.phone);
  const [detailOpen, setDetailOpen] = useState(false);
  const hasDetail = call.hasRecording || !!call.transcript || !!call.summary;
  const name = cleanName(call.contactName);
  // No es solo `leadSynthesis`: una llamada con su resumen y su transcripcion
  // guardados decia «Sin detalle», y eso se lee como que la grabacion no dejo
  // nada. Ver `lib/detalle-de-la-llamada.ts`.
  const sintesis = elDetalleDeLaLlamada(call);
  const recordingUrl =
    call.recordingUrl // llamadas Meta: URL directa de la grabación subida a S3
      ? call.recordingUrl
      : call.astraSid && call.astraCallId
        ? `/api/calls/recording?sid=${encodeURIComponent(call.astraSid)}&callId=${encodeURIComponent(call.astraCallId)}`
        : null;
  return (
    <>
    <tr className="border-b last:border-0 align-top hover:bg-muted/40">
      {nombreDeLaCuenta !== undefined && (
        <td className="px-2 py-2 text-center">
          <InsigniaDeCuenta nombre={nombreDeLaCuenta} />
        </td>
      )}
      {/* Contacto: número limpio (primario) + nombre si aporta */}
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          onClick={onOpenChat}
          title="Abrir chat del contacto"
          className="whitespace-nowrap font-medium tabular-nums hover:text-blue-600 hover:underline"
        >
          {formatPhone(call.phone)}
        </button>
        {ajena ? (
          name ? <p className="truncate text-xs text-muted-foreground">{name}</p> : null
        ) : (
          <ContactNameCell phone={call.phone} name={name} onSaved={onChanged} />
        )}
      </td>
      {/* Tipo */}
      <td className="px-2 py-2 text-center">
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
      {/* Duración */}
      <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{fmtDuration(call.durationSecs)}</td>
      {/* Fecha */}
      <td className="px-2 py-2 text-center whitespace-nowrap text-muted-foreground">{DATE_FMT.format(new Date(call.ts))}</td>
      {/* Detalle: botón clicable que abre el detalle completo (como en Registros) */}
      <td className="max-w-[260px] px-2 py-2 text-center">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          title="Ver detalle de la llamada"
          className="block w-full text-center"
        >
          <span
            className={cn(
              'block truncate text-sm',
              sintesis
                ? 'text-muted-foreground hover:text-foreground'
                : 'italic text-muted-foreground/60 hover:text-foreground',
            )}
          >
            {sintesis || 'Sin detalle'}
          </span>
        </button>
      </td>
      {/* Resultado (disposición) */}
      <td className="px-2 py-2 text-center">
        {ajena ? (
          dispMeta ? (
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium', dispMeta.badgeClass)}>
              <Tag className="h-3 w-3" /> {dispMeta.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        ) : (
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
        )}
      </td>
      {/* Estado (junto al resultado) */}
      <td className="px-2 py-2 text-center">
        {ajena ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <LeadStatusButton phone={call.phone} contactName={call.contactName} />
        )}
      </td>
      {/* Acciones */}
      <td className="px-2 py-2 text-center">
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {callable && (
                <DropdownMenuItem onSelect={onCall}>
                  <Phone className="mr-2 h-4 w-4" /> Llamar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onOpenChat}>
                <MessageSquare className="mr-2 h-4 w-4" /> Abrir chat
              </DropdownMenuItem>
              {callable && (
                <DropdownMenuItem onSelect={onCallback}>
                  <CalendarClock className="mr-2 h-4 w-4" /> Agendar callback
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setDetailOpen(true)}>
                <FileText className="mr-2 h-4 w-4" /> Ver detalle
              </DropdownMenuItem>
              {!ajena && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
    <CallDetailDialog
      call={call}
      recordingUrl={recordingUrl}
      open={detailOpen}
      onOpenChange={setDetailOpen}
      onSynthesisSaved={onChanged}
    />
    </>
  );
}

