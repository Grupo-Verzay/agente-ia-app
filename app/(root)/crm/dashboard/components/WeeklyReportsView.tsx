'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, TrendingUp, Users, CheckCheck, Send, ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
    getWeeklyReports,
    generateMyWeeklyReport,
    deleteWeeklyReport,
    deleteAllWeeklyReports,
    type WeeklyReportItem,
} from '@/actions/weekly-report-actions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeriod(start: string, end: string) {
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    const s = new Date(start).toLocaleDateString('es-ES', opts);
    const e = new Date(end).toLocaleDateString('es-ES', { ...opts, year: 'numeric' });
    return `${s} – ${e}`;
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreColor(score: number) {
    if (score >= 76) return '#22C55E';
    if (score >= 51) return '#F59E0B';
    if (score >= 26) return '#F97316';
    return '#EF4444';
}

const TIPO_LABELS: Record<string, { emoji: string; label: string }> = {
    PAGO:      { emoji: '💰', label: 'Pagos' },
    CITA:      { emoji: '📅', label: 'Citas' },
    RESERVA:   { emoji: '🏨', label: 'Reservas' },
    SOLICITUD: { emoji: '📝', label: 'Solicitudes' },
    RECLAMO:   { emoji: '😤', label: 'Reclamos' },
    PEDIDO:    { emoji: '📦', label: 'Pedidos' },
    PRODUCTO:  { emoji: '🛍️', label: 'Productos' },
};

// ─── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ report, onDelete }: { report: WeeklyReportItem; onDelete: (id: string) => void }) {
    const [expanded, setExpanded] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const m = report.metrics;

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleting(true);
        const res = await deleteWeeklyReport(report.id);
        if (res.success) {
            onDelete(report.id);
            toast.success('Reporte eliminado');
        } else {
            toast.error(res.message ?? 'Error al eliminar');
        }
        setDeleting(false);
    };

    const actividadEntries = Object.entries(m.registrosByTipo ?? {}).filter(([tipo, count]) => count > 0 && TIPO_LABELS[tipo]);

    return (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded((v) => !v)}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                        <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-sm">{fmtPeriod(report.periodStart, report.periodEnd)}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(report.createdAt)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {m.totalLeads}
                        </span>
                        <span className="flex items-center gap-1 text-green-600">
                            <CheckCheck className="h-3 w-3" />
                            {m.conversions}
                        </span>
                    </div>

                    {report.sentAt && (
                        <Badge variant="outline" className="text-[10px] gap-1 border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30">
                            <Send className="h-2.5 w-2.5" />
                            Enviado
                        </Badge>
                    )}

                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>

                    {expanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                </div>
            </div>

            {/* Expanded content */}
            {expanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                    {/* AI Summary */}
                    {report.summary && (
                        <div className="pt-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" />
                                Resumen generado por IA
                            </p>
                            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line bg-muted/20 rounded-lg p-3 border">
                                {report.summary}
                            </p>
                        </div>
                    )}

                    {/* Metrics grid */}
                    <div className={report.summary ? '' : 'pt-4'}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            Métricas de la semana
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <MetricTile label="Total leads" value={m.totalLeads} sub={`${m.newLeads} nuevos`} color="#3B82F6" />
                            <MetricTile label="Calientes" value={m.leadsByStatus['CALIENTE'] ?? 0} sub={`${m.leadsByStatus['TIBIO'] ?? 0} tibios`} color="#EF4444" />
                            <MetricTile label="Finalizados" value={m.conversions} sub={`${m.followUpsSent} follow-ups`} color="#22C55E" />
                            <MetricTile label="Score prom." value={m.avgScore !== null ? `${m.avgScore}/100` : '—'} sub={`${m.leadsByScore.sinScore} sin puntuar`} color={m.avgScore !== null ? scoreColor(m.avgScore) : '#94A3B8'} />
                        </div>
                    </div>

                    {/* Score distribution */}
                    {m.leadsByScore.sinScore < m.totalLeads && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Distribución de puntuación
                            </p>
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { label: 'Bajo',     value: m.leadsByScore.bajo,     color: '#EF4444' },
                                    { label: 'Medio',    value: m.leadsByScore.medio,     color: '#F97316' },
                                    { label: 'Moderado', value: m.leadsByScore.moderado,  color: '#F59E0B' },
                                    { label: 'Alto',     value: m.leadsByScore.alto,      color: '#22C55E' },
                                    { label: 'Listo',    value: m.leadsByScore.listo,     color: '#16A34A' },
                                ].filter(s => s.value > 0).map((s) => (
                                    <div key={s.label} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: s.color }}>
                                        {s.label}: {s.value}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actividad por tipo */}
                    {actividadEntries.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Actividad de la semana
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {actividadEntries.map(([tipo, count]) => (
                                    <MetricTile
                                        key={tipo}
                                        label={TIPO_LABELS[tipo]?.label ?? tipo}
                                        value={count}
                                        sub=""
                                        color="#6366F1"
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function MetricTile({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
    return (
        <div className="rounded-lg border p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold" style={{ color }}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
        </div>
    );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export type ReportStats = { total: number; sent: number; avgLeads: number; avgConversions: number };

export function WeeklyReportsView({ onStatsLoaded }: { onStatsLoaded?: (s: ReportStats) => void }) {
    const [reports, setReports] = useState<WeeklyReportItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [deletingAll, setDeletingAll] = useState(false);

    const load = async () => {
        setLoading(true);
        const res = await getWeeklyReports();
        if (res.success && res.data) {
            setReports(res.data);
            onStatsLoaded?.({
                total: res.data.length,
                sent: res.data.filter((r) => r.sentAt).length,
                avgLeads: res.data.length ? Math.round(res.data.reduce((s, r) => s + r.metrics.totalLeads, 0) / res.data.length) : 0,
                avgConversions: res.data.length ? Math.round(res.data.reduce((s, r) => s + r.metrics.conversions, 0) / res.data.length) : 0,
            });
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleGenerate = async () => {
        setGenerating(true);
        const res = await generateMyWeeklyReport();
        if (res.success) {
            toast.success(res.sent ? 'Reporte generado y enviado por WhatsApp' : 'Reporte generado');
            if (!res.sent && res.message) toast.warning(res.message, { duration: 8000 });
            await load();
        } else {
            toast.error(res.message ?? 'Error al generar el reporte');
        }
        setGenerating(false);
    };

    const handleDeleteOne = (id: string) => {
        setReports((prev) => prev.filter((r) => r.id !== id));
    };

    const handleDeleteAll = async () => {
        if (!confirm('¿Eliminar todos los reportes? Esta acción no se puede deshacer.')) return;
        setDeletingAll(true);
        const res = await deleteAllWeeklyReports();
        if (res.success) {
            setReports([]);
            toast.success('Todos los reportes eliminados');
        } else {
            toast.error(res.message ?? 'Error al eliminar');
        }
        setDeletingAll(false);
    };

    return (
        <div className="flex flex-col gap-4">

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Últimos <span className="font-medium text-foreground">{reports.length}</span> reportes generados por IA
                </p>
                <div className="flex items-center gap-2">
                    {reports.length > 0 && (
                        <Button variant="outline" size="sm" onClick={handleDeleteAll} disabled={deletingAll} className="gap-1.5 text-destructive hover:text-destructive">
                            {deletingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Eliminar todos
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
                        <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                        Actualizar
                    </Button>
                    <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5">
                        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Generar reporte
                    </Button>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 rounded-xl border border-dashed text-center">
                    <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
                    <div>
                        <p className="text-sm font-medium">Sin reportes aún</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Genera tu primer reporte semanal con IA</p>
                    </div>
                    <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5 mt-1">
                        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Generar ahora
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {reports.map((r) => <ReportCard key={r.id} report={r} onDelete={handleDeleteOne} />)}
                </div>
            )}
        </div>
    );
}
