"use client";

import { useState } from "react";
import useSWR from "swr";
import {
    ResponsiveContainer,
    BarChart, Bar,
    LineChart, Line,
    XAxis, YAxis, Tooltip, CartesianGrid,
    PieChart, Pie, Cell, Legend,
} from "recharts";
import { Columns3, Download, Search, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAnalyticsDataByUserId, type AnalyticsPeriod } from "@/actions/analytics-action";
import { TagStatsCard } from "./TagStatsCard";
import type { DashboardStats } from "./MainDashboard";
import type { TipoRegistro } from "@/types/session";

const ANALYTICS_SECTIONS = {
    actividad:  "Actividad",
    leads:      "Leads y seguimientos",
    citas:      "Citas",
    sesiones:   "Sesiones",
    flujos:     "Flujos",
    etiquetas:  "Etiquetas y madurez",
    ventas:     "Ventas y gastos",
    productos:  "Productos",
    sistema:    "Créditos IA",
} as const;

type SectionKey = keyof typeof ANALYTICS_SECTIONS;

/* ─── colores ─── */
const LEAD_COLORS: Record<string, string> = {
    FRIO: "#3B82F6", TIBIO: "#F59E0B", CALIENTE: "#F97316",
    FINALIZADO: "#22C55E", DESCARTADO: "#EF4444",
};
const LEAD_LABELS: Record<string, string> = {
    FRIO: "Frío", TIBIO: "Tibio", CALIENTE: "Caliente",
    FINALIZADO: "Finalizado", DESCARTADO: "Descartado",
};
const APPT_COLORS: Record<string, string> = {
    PENDIENTE: "#F59E0B", CONFIRMADA: "#22C55E", CANCELADA: "#EF4444",
    ATENDIDA: "#3B82F6", NO_ASISTIDA: "#6B7280",
};
const APPT_LABELS: Record<string, string> = {
    PENDIENTE: "Pendiente", CONFIRMADA: "Confirmada", CANCELADA: "Cancelada",
    ATENDIDA: "Atendida", NO_ASISTIDA: "No asistió",
};
const WORKFLOW_COLORS: Record<string, string> = { PUBLISHED: "#22C55E", DRAFT: "#6B7280" };
const WORKFLOW_LABELS: Record<string, string> = { PUBLISHED: "Publicado", DRAFT: "Borrador" };
const FOLLOW_COLORS: Record<string, string> = {
    Pendiente: "#F59E0B", Procesando: "#3B82F6", Enviado: "#22C55E",
    Fallido: "#EF4444", Cancelado: "#6B7280", Ignorado: "#94A3B8",
};
const TIPO_COLORS: Record<string, string> = {
    REPORTE: "#3B82F6", SOLICITUD: "#8B5CF6", PEDIDO: "#22C55E",
    RECLAMO: "#EF4444", PAGO: "#14B8A6", RESERVA: "#F59E0B", PRODUCTO: "#EC4899",
};
const TIPO_LABELS: Record<string, string> = {
    REPORTE: "Reporte", SOLICITUD: "Solicitud", PEDIDO: "Pedido",
    RECLAMO: "Reclamo", PAGO: "Pago", RESERVA: "Reserva", PRODUCTO: "Producto",
};
const FUNNEL_ORDER = ["FRIO", "TIBIO", "CALIENTE", "FINALIZADO"] as const;

/* ─── helpers de UI ─── */

const CHART_H = "h-[220px]";

const EmptyState = ({ text }: { text: string }) => (
    <div className="flex h-full min-h-[140px] items-center justify-center text-sm text-muted-foreground text-center px-4">
        {text}
    </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">
        {children}
    </p>
);

/* Lista vertical de KPIs dentro de una card */
function KpiList({ items }: {
    items: { label: string; value: string | number; color?: string }[]
}) {
    return (
        <div className="space-y-3 pt-1">
            {items.map((item) => (
                <div
                    key={item.label}
                    className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0"
                >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-bold text-base" style={item.color ? { color: item.color } : {}}>
                        {item.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

/* Donut genérico */
function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={data} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={2}
                >
                    {data.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v}`, n]} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
        </ResponsiveContainer>
    );
}

/* ─── componente principal ─── */
export function AnalyticsView({ userId, stats, period }: { userId: string; stats: DashboardStats | null; period: AnalyticsPeriod }) {
    const { data, isLoading } = useSWR(
        ["crm-analytics", userId, period],
        ([, uid, p]) => getAnalyticsDataByUserId(uid, p as AnalyticsPeriod)
    );
    const a = data?.success ? data.data : null;
    const loading = isLoading;

    const [visibleSections, setVisibleSections] = useState<Record<SectionKey, boolean>>({
        actividad: true, leads: true, citas: true, sesiones: true,
        flujos: true, etiquetas: true, ventas: true, productos: true, sistema: true,
    });

    const toggleSection = (key: SectionKey) =>
        setVisibleSections((prev) => ({ ...prev, [key]: !prev[key] }));

    const [searchValue, setSearchValue] = useState("");
    const [leadFilter, setLeadFilter] = useState<string>("__all__");
    const [fechaDesde, setFechaDesde] = useState("");
    const [fechaHasta, setFechaHasta] = useState("");
    const advFilterCount = (leadFilter !== "__all__" ? 1 : 0) + (fechaDesde || fechaHasta ? 1 : 0);

    const resetAdvFilters = () => {
        setLeadFilter("__all__");
        setFechaDesde("");
        setFechaHasta("");
    };

    const handleExport = () => {
        if (!a) return;
        const rows = [
            ["Métrica", "Valor"],
            ["Leads total", Object.values(a.leadStatusCounts).reduce((s, v) => s + v, 0)],
            ["Leads frío", a.leadStatusCounts.FRIO],
            ["Leads tibio", a.leadStatusCounts.TIBIO],
            ["Leads caliente", a.leadStatusCounts.CALIENTE],
            ["Leads finalizado", a.leadStatusCounts.FINALIZADO],
            ["Leads descartado", a.leadStatusCounts.DESCARTADO],
            ["Sesiones total", a.sessions.total],
            ["Sesiones activas", a.sessions.active],
            ["Sesiones nuevas (período)", a.sessions.new],
            ["Citas total", a.appointments.total],
            ["Citas próximas 7d", a.appointments.upcoming],
            ["Follow-ups activos", stats?.crmFollowUps.active ?? 0],
            ["Follow-ups enviados", stats?.crmFollowUps.sent ?? 0],
            ["Flujos total", a.totalWorkflows],
            ["Ventas total", a.sales.total],
            ["Ingresos totales", a.sales.totalRevenue],
        ];
        const csv = rows.map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `analiticas-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    /* leads */
    const totalLeads = a ? Object.values(a.leadStatusCounts).reduce((s, v) => s + v, 0) : 0;
    const leadData = a
        ? Object.entries(a.leadStatusCounts)
            .map(([k, v]) => ({ key: k, name: LEAD_LABELS[k] ?? k, value: v, color: LEAD_COLORS[k] ?? "#94A3B8" }))
            .filter((d) => d.value > 0)
            .filter((d) => leadFilter === "__all__" || d.key === leadFilter)
        : [];

    /* embudo de conversión */
    const funnelData = a
        ? FUNNEL_ORDER.map((k) => ({
            key: k,
            name: LEAD_LABELS[k],
            cantidad: a.leadStatusCounts[k],
            color: LEAD_COLORS[k],
        }))
            .filter((d) => d.cantidad > 0)
            .filter((d) => leadFilter === "__all__" || d.key === leadFilter)
        : [];

    /* follow-ups */
    const followData = stats
        ? [
            { name: "Pendiente",  cantidad: stats.crmFollowUps.pending,    color: FOLLOW_COLORS["Pendiente"] },
            { name: "Procesando", cantidad: stats.crmFollowUps.processing,  color: FOLLOW_COLORS["Procesando"] },
            { name: "Enviado",    cantidad: stats.crmFollowUps.sent,        color: FOLLOW_COLORS["Enviado"] },
            { name: "Fallido",    cantidad: stats.crmFollowUps.failed,      color: FOLLOW_COLORS["Fallido"] },
            { name: "Cancelado",  cantidad: stats.crmFollowUps.cancelled,   color: FOLLOW_COLORS["Cancelado"] },
            { name: "Ignorado",   cantidad: stats.crmFollowUps.skipped,     color: FOLLOW_COLORS["Ignorado"] },
        ].filter((d) => d.cantidad > 0)
        : [];

    /* citas */
    const apptData = a
        ? Object.entries(a.appointments.counts)
            .map(([k, v]) => ({ name: APPT_LABELS[k] ?? k, value: v, color: APPT_COLORS[k] ?? "#94A3B8" }))
            .filter((d) => d.value > 0)
        : [];
    const noShowRate = a && a.appointments.total > 0
        ? Math.round(((a.appointments.counts.CANCELADA + a.appointments.counts.NO_ASISTIDA) / a.appointments.total) * 100)
        : null;

    /* flujos */
    const workflowData = a
        ? Object.entries(a.workflowCounts)
            .map(([k, v]) => ({ name: WORKFLOW_LABELS[k] ?? k, value: v, color: WORKFLOW_COLORS[k] ?? "#94A3B8" }))
        : [];

    /* sesiones */
    const sessionData = a
        ? [
            { name: "Activas",   value: a.sessions.active,   color: "#22C55E" },
            { name: "Inactivas", value: a.sessions.inactive,  color: "#6B7280" },
        ].filter((d) => d.value > 0)
        : [];
    const agentData = a
        ? [
            { name: "Agente ON",  value: a.sessions.agentActive,   color: "#3B82F6" },
            { name: "Agente OFF", value: a.sessions.agentInactive,  color: "#F59E0B" },
        ].filter((d) => d.value > 0)
        : [];

    /* registros por tipo (desde stats prop) */
    const tipoData = stats?.countsByTipo
        ? Object.entries(stats.countsByTipo as Record<TipoRegistro, number>)
            .map(([k, v]) => ({
                name: TIPO_LABELS[k] ?? k,
                cantidad: v,
                color: TIPO_COLORS[k] ?? "#94A3B8",
            }))
            .filter((d) => d.cantidad > 0)
        : [];

    /* actividad diaria */
    const activityData = a?.activityByDay ?? [];
    const activityInterval = activityData.length > 30 ? 6 : activityData.length > 14 ? 3 : 0;

    const LEAD_SUMMARY = [
        { key: "FRIO",        label: "Frío",         value: a?.leadStatusCounts.FRIO ?? 0,        color: LEAD_COLORS.FRIO },
        { key: "TIBIO",       label: "Tibio",        value: a?.leadStatusCounts.TIBIO ?? 0,       color: LEAD_COLORS.TIBIO },
        { key: "CALIENTE",    label: "Caliente",     value: a?.leadStatusCounts.CALIENTE ?? 0,    color: LEAD_COLORS.CALIENTE },
        { key: "FINALIZADO",  label: "Finalizado",   value: a?.leadStatusCounts.FINALIZADO ?? 0,  color: LEAD_COLORS.FINALIZADO },
        { key: "DESCARTADO",  label: "Descartado",   value: a?.leadStatusCounts.DESCARTADO ?? 0,  color: LEAD_COLORS.DESCARTADO },
        { key: "CITAS",       label: "Citas",        value: a?.appointments.total ?? 0,           color: "#3B82F6" },
        { key: "FOLLOW_UPS",  label: "Follow-ups",   value: stats?.crmFollowUps.active ?? 0,      color: "#0EA5E9" },
        { key: "FLUJOS",      label: "Flujos",       value: a?.totalWorkflows ?? 0,               color: "#8B5CF6" },
    ];

    return (
        <div className="flex flex-col gap-2">

            {/* ─── Barra de resumen (simétrica con tabs de Registros) ─── */}
            <div className="flex h-auto w-full flex-nowrap justify-between gap-1 overflow-x-auto rounded-md border border-border bg-muted/40 p-0">
                {LEAD_SUMMARY.map((item) => (
                    <div
                        key={item.key}
                        className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-white"
                        style={{ backgroundColor: item.color }}
                    >
                        <span className="hidden sm:inline">
                            {item.label} ({loading ? "…" : item.value})
                        </span>
                        <span className="sm:hidden">{loading ? "…" : item.value}</span>
                    </div>
                ))}
            </div>

            {/* ─── Toolbar (simétrica con CrmRecordsToolbar) ─── */}
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">

                    {/* Búsqueda */}
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder="Buscar en analíticas..."
                            className="h-9 pl-9"
                        />
                    </div>

                    {/* Filtros avanzados */}
                    <Popover>
                        <UiTooltip>
                            <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="relative h-9 gap-2 max-sm:w-9 max-sm:px-0">
                                        <SlidersHorizontal className="h-4 w-4 shrink-0" />
                                        <span className="hidden sm:inline">Filtros avanzados</span>
                                        <span className="sr-only sm:hidden">Filtros avanzados</span>
                                        {advFilterCount > 0 && (
                                            <Badge variant="secondary" className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px] sm:static sm:min-w-0 sm:rounded-full sm:px-1.5">
                                                {advFilterCount}
                                            </Badge>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Filtros avanzados</TooltipContent>
                        </UiTooltip>
                        <PopoverContent align="start" className="w-[min(92vw,320px)] p-0">
                            <ScrollArea className="h-auto max-h-[400px]">
                                <div className="space-y-4 p-4">
                                    <div>
                                        <p className="text-sm font-medium">Filtros de analíticas</p>
                                        <p className="text-xs text-muted-foreground">Afectan las gráficas de leads y embudo.</p>
                                    </div>
                                    <div className="grid gap-2">
                                        <label className="text-xs font-medium text-muted-foreground">Estado del lead</label>
                                        <Select value={leadFilter} onValueChange={setLeadFilter}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__all__">Todos</SelectItem>
                                                <SelectItem value="FRIO">Frío</SelectItem>
                                                <SelectItem value="TIBIO">Tibio</SelectItem>
                                                <SelectItem value="CALIENTE">Caliente</SelectItem>
                                                <SelectItem value="FINALIZADO">Finalizado</SelectItem>
                                                <SelectItem value="DESCARTADO">Descartado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="grid gap-2">
                                            <label className="text-xs font-medium text-muted-foreground">Desde</label>
                                            <Input type="date" className="h-9" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                                        </div>
                                        <div className="grid gap-2">
                                            <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                                            <Input type="date" className="h-9" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={resetAdvFilters}>Limpiar filtros</Button>
                                    </div>
                                </div>
                            </ScrollArea>
                        </PopoverContent>
                    </Popover>

                    <DropdownMenu>
                        <UiTooltip>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 gap-2 max-sm:w-9 max-sm:px-0">
                                        <Columns3 className="h-4 w-4 shrink-0" />
                                        <span className="hidden sm:inline">Secciones</span>
                                        <span className="sr-only sm:hidden">Secciones</span>
                                    </Button>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Mostrar / ocultar secciones</TooltipContent>
                        </UiTooltip>
                        <DropdownMenuContent align="start">
                            {(Object.entries(ANALYTICS_SECTIONS) as [SectionKey, string][]).map(([key, label]) => (
                                <DropdownMenuCheckboxItem
                                    key={key}
                                    checked={visibleSections[key]}
                                    onCheckedChange={() => toggleSection(key)}
                                >
                                    {label}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <UiTooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 gap-2 max-sm:w-9 max-sm:px-0"
                                onClick={handleExport}
                                disabled={!a}
                            >
                                <Download className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">Exportar</span>
                                <span className="sr-only sm:hidden">Exportar</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Exportar analíticas a CSV</TooltipContent>
                    </UiTooltip>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-9 rounded-md px-3 text-xs border-border">
                        <span className="hidden sm:inline">
                            {loading
                                ? "Cargando…"
                                : `${totalLeads} leads · ${a?.sessions.total ?? 0} sesiones · ${a?.appointments.total ?? 0} citas · ${a?.totalWorkflows ?? 0} flujos`}
                        </span>
                        <span className="sm:hidden">
                            {loading ? "…" : `${totalLeads} leads`}
                        </span>
                    </Badge>
                </div>
            </div>

            {/* ─── Contenido scrollable (igual que la tabla de Registros) ─── */}
            <div className="h-[420px] overflow-y-auto rounded-xl border border-border/70 bg-background p-4 lg:h-[540px]">
                <div className="space-y-4 pb-4">

            {/* ═══ ① ACTIVIDAD ═══ */}
            {visibleSections.actividad && (<>
            <SectionLabel>Actividad</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Nuevas sesiones por día</CardTitle>
                        <CardDescription>Leads entrantes en el período seleccionado.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : activityData.every((d) => d.nuevas === 0)
                            ? <EmptyState text="Sin actividad en el período." />
                            : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={activityData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
                                        <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval={activityInterval} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip formatter={(v) => [`${v}`, "Nuevas sesiones"]} />
                                        <Line type="monotone" dataKey="nuevas" stroke="#22C55E" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Registros por tipo</CardTitle>
                        <CardDescription>Distribución de movimientos en el CRM.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {tipoData.length === 0 ? <EmptyState text="Aún no hay registros." /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tipoData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip formatter={(v) => [`${v}`, "Registros"]} />
                                    <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                                        {tipoData.map((e) => <Cell key={e.name} fill={e.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            </>)}

            {/* ═══ ③ LEADS Y SEGUIMIENTOS ═══ */}
            {visibleSections.leads && (<>
            <SectionLabel>Leads y seguimientos</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Leads por temperatura</CardTitle>
                        <CardDescription>Clasificación de contactos según estado.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : leadData.length === 0
                            ? <EmptyState text="Aún no hay leads clasificados." />
                            : <DonutChart data={leadData} />}
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Embudo de conversión</CardTitle>
                        <CardDescription>Progresión de leads: Frío → Tibio → Caliente → Finalizado.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : funnelData.length === 0
                            ? <EmptyState text="Aún no hay leads clasificados." />
                            : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={funnelData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
                                        <Tooltip formatter={(v) => [`${v} leads`, ""]} />
                                        <Bar dataKey="cantidad" radius={[0, 6, 6, 0]}>
                                            {funnelData.map((e) => <Cell key={e.name} fill={e.color} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                    </CardContent>
                </Card>
            </div>

            {/* Follow-ups */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Estado de seguimientos</CardTitle>
                        <CardDescription>Desglose de follow-ups por estado actual.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {followData.length === 0
                            ? <EmptyState text="No hay seguimientos registrados." />
                            : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={followData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip formatter={(v) => [`${v}`, "Cantidad"]} />
                                        <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                                            {followData.map((e) => <Cell key={e.name} fill={e.color} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                    </CardContent>
                </Card>

                <Card className="border-border bg-muted/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base text-muted-foreground">Resumen de leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <KpiList items={[
                            { label: "Total leads clasificados", value: loading ? "…" : totalLeads, color: "#6B7280" },
                            { label: "Frío",       value: loading ? "…" : (a?.leadStatusCounts.FRIO ?? 0),        color: LEAD_COLORS.FRIO },
                            { label: "Tibio",      value: loading ? "…" : (a?.leadStatusCounts.TIBIO ?? 0),       color: LEAD_COLORS.TIBIO },
                            { label: "Caliente",   value: loading ? "…" : (a?.leadStatusCounts.CALIENTE ?? 0),    color: LEAD_COLORS.CALIENTE },
                            { label: "Finalizado", value: loading ? "…" : (a?.leadStatusCounts.FINALIZADO ?? 0),  color: LEAD_COLORS.FINALIZADO },
                            { label: "Descartado", value: loading ? "…" : (a?.leadStatusCounts.DESCARTADO ?? 0),  color: LEAD_COLORS.DESCARTADO },
                        ]} />
                    </CardContent>
                </Card>
            </div>
            </>)}

            {/* ═══ ④ CITAS ═══ */}
            {visibleSections.citas && (<>
            <SectionLabel>Citas agendadas</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Resumen de citas</CardTitle>
                        <CardDescription>Indicadores clave del período.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <KpiList items={[
                            { label: "Total citas",       value: loading ? "…" : (a?.appointments.total ?? 0),                  color: "#3B82F6" },
                            { label: "Próximas 7 días",   value: loading ? "…" : (a?.appointments.upcoming ?? 0),               color: "#22C55E" },
                            { label: "Pendientes",        value: loading ? "…" : (a?.appointments.counts.PENDIENTE ?? 0),       color: "#F59E0B" },
                            { label: "Confirmadas",       value: loading ? "…" : (a?.appointments.counts.CONFIRMADA ?? 0),      color: "#22C55E" },
                            { label: "Atendidas",         value: loading ? "…" : (a?.appointments.counts.ATENDIDA ?? 0),        color: "#8B5CF6" },
                            { label: "Canceladas",        value: loading ? "…" : (a?.appointments.counts.CANCELADA ?? 0),       color: "#EF4444" },
                            { label: "No asistió",        value: loading ? "…" : (a?.appointments.counts.NO_ASISTIDA ?? 0),     color: "#6B7280" },
                            {
                                label: "Tasa de no-show",
                                value: loading ? "…" : noShowRate !== null ? `${noShowRate}%` : "—",
                                color: noShowRate !== null && noShowRate > 30 ? "#EF4444" : "#22C55E",
                            },
                        ]} />
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Citas por estado</CardTitle>
                        <CardDescription>Distribución según el estado de cada cita.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : apptData.length === 0
                            ? <EmptyState text="Aún no hay citas agendadas." />
                            : <DonutChart data={apptData} />}
                    </CardContent>
                </Card>
            </div>
            </>)}

            {/* ═══ ⑤ SESIONES ═══ */}
            {visibleSections.sesiones && (<>
            <SectionLabel>Sesiones</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Estado de sesiones</CardTitle>
                        <CardDescription>
                            {a ? `${a.sessions.total} total · ${a.sessions.new} nuevas en período` : "Activas vs inactivas."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : sessionData.length === 0
                            ? <EmptyState text="No hay sesiones." />
                            : <DonutChart data={sessionData} />}
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Estado del agente IA</CardTitle>
                        <CardDescription>Sesiones con agente activo vs desactivado.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : agentData.length === 0
                            ? <EmptyState text="No hay sesiones." />
                            : <DonutChart data={agentData} />}
                    </CardContent>
                </Card>
            </div>
            </>)}

            {/* ═══ ⑥ FLUJOS ═══ */}
            {visibleSections.flujos && (<>
            <SectionLabel>Flujos</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Estado de flujos</CardTitle>
                        <CardDescription>
                            {a ? `${a.totalWorkflows} flujos en total` : "Publicados vs borradores."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : workflowData.length === 0
                            ? <EmptyState text="No hay flujos creados." />
                            : <DonutChart data={workflowData} />}
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Flujos más ejecutados</CardTitle>
                        <CardDescription>Sesiones activas por flujo.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {loading ? <EmptyState text="Cargando..." /> : !a?.topFlows.length
                            ? <EmptyState text="Aún no hay flujos con sesiones activas." />
                            : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={a.topFlows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                                        <Tooltip formatter={(v) => [`${v} sesiones`, "Ejecuciones"]} />
                                        <Bar dataKey="ejecuciones" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                    </CardContent>
                </Card>
            </div>
            </>)}

            {/* ═══ ⑦ ETIQUETAS Y MADUREZ ═══ */}
            {visibleSections.etiquetas && (<>
            <SectionLabel>Etiquetas y madurez</SectionLabel>
            <TagStatsCard userId={userId} />
            </>)}

            {/* ═══ ⑧ VENTAS Y GASTOS ═══ */}
            {visibleSections.ventas && a && (a.sales.total > 0 || a.expenses.total > 0) && (
                <>
                    <SectionLabel>Ventas y gastos</SectionLabel>

                    {/* Resumen financiero + Gastos por categoría */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-border bg-muted/10">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base text-muted-foreground">Resumen financiero</CardTitle>
                                <CardDescription>Comparativo del período seleccionado.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <KpiList items={[
                                    {
                                        label: "Ingresos (ventas)",
                                        value: a.sales.totalRevenue > 0
                                            ? `$${a.sales.totalRevenue.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`
                                            : "—",
                                        color: "#22C55E",
                                    },
                                    {
                                        label: "Gastos",
                                        value: a.expenses.total > 0
                                            ? `$${a.expenses.total.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`
                                            : "—",
                                        color: "#EF4444",
                                    },
                                    {
                                        label: "Balance neto",
                                        value: (() => {
                                            const net = a.sales.totalRevenue - a.expenses.total;
                                            return `${net >= 0 ? "+" : ""}$${Math.abs(net).toLocaleString("es-ES", { minimumFractionDigits: 2 })}`;
                                        })(),
                                        color: a.sales.totalRevenue >= a.expenses.total ? "#22C55E" : "#EF4444",
                                    },
                                    { label: "Total ventas", value: a.sales.total, color: "#8B5CF6" },
                                ]} />
                            </CardContent>
                        </Card>

                        <Card className="border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Gastos por categoría</CardTitle>
                                <CardDescription>Top categorías del período.</CardDescription>
                            </CardHeader>
                            <CardContent className={CHART_H}>
                                {a.expenses.byCategory.length === 0
                                    ? <EmptyState text="No hay gastos registrados en este período." />
                                    : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={a.expenses.byCategory} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                                                <XAxis type="number" tick={{ fontSize: 11 }} />
                                                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                                                <Tooltip formatter={(v) => [`$${Number(v).toLocaleString("es-ES", { minimumFractionDigits: 2 })}`, "Gastos"]} />
                                                <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                                                    {a.expenses.byCategory.map((e, i) => (
                                                        <Cell key={i} fill={e.color} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Ventas por semana */}
                    {a.sales.total > 0 && (
                        <Card className="border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Ventas en el período</CardTitle>
                                <CardDescription>
                                    <span className="font-semibold text-foreground">{a.sales.total}</span> ventas ·{" "}
                                    <span className="font-semibold text-foreground">
                                        ${a.sales.totalRevenue.toLocaleString("es-ES", { minimumFractionDigits: 2 })}
                                    </span>{" "}
                                    en ingresos
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="h-[240px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={a.sales.byWeek} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
                                        <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="ventas"   stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} name="Ventas" />
                                        <Line type="monotone" dataKey="ingresos" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="Ingresos" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* ═══ ⑨ PRODUCTOS — condicional ═══ */}
            {visibleSections.productos && a && a.products.total > 0 && (
                <>
                    <SectionLabel>Productos</SectionLabel>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Top productos por stock</CardTitle>
                                <CardDescription>Los 6 productos activos con mayor inventario.</CardDescription>
                            </CardHeader>
                            <CardContent className={CHART_H}>
                                {a.products.top.length === 0
                                    ? <EmptyState text="No hay productos con stock." />
                                    : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={a.products.top} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                                                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                                                <YAxis type="category" dataKey="title" tick={{ fontSize: 10 }} width={100} />
                                                <Tooltip formatter={(v) => [`${v} unidades`, "Stock"]} />
                                                <Bar dataKey="stock" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                            </CardContent>
                        </Card>

                        <Card className="border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Productos por categoría</CardTitle>
                                <CardDescription>Distribución y alertas de inventario.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <Badge variant="outline" className="gap-1">
                                        <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                                        {a.products.active} activos
                                    </Badge>
                                    <Badge variant="outline" className="gap-1">
                                        <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" />
                                        {a.products.inactive} inactivos
                                    </Badge>
                                    {a.products.lowStock > 0 && (
                                        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                                            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                                            {a.products.lowStock} stock bajo
                                        </Badge>
                                    )}
                                    {a.products.outOfStock > 0 && (
                                        <Badge variant="outline" className="gap-1 border-red-500 text-red-600">
                                            <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                                            {a.products.outOfStock} sin stock
                                        </Badge>
                                    )}
                                </div>
                                {a.products.byCategory.length === 0
                                    ? <EmptyState text="Sin categorías." />
                                    : (
                                        <div className="space-y-2">
                                            {a.products.byCategory.map((cat) => (
                                                <div
                                                    key={cat.category}
                                                    className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5 last:border-0"
                                                >
                                                    <span className="text-muted-foreground truncate max-w-[200px]">{cat.category}</span>
                                                    <Badge variant="secondary">{cat.cantidad}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}

            {/* ═══ ⑩ CRÉDITOS IA ═══ */}
            {visibleSections.sistema && (
                <>
                    <SectionLabel>Créditos IA</SectionLabel>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-border bg-muted/10">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base text-muted-foreground">Uso de créditos</CardTitle>
                                {a?.iaCredit?.renewalDate && (
                                    <CardDescription>
                                        Renovación:{" "}
                                        {new Date(a.iaCredit.renewalDate).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                                    </CardDescription>
                                )}
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <p className="text-xs text-muted-foreground">Cargando...</p>
                                ) : !a?.iaCredit ? (
                                    <p className="text-xs text-muted-foreground">Sin créditos configurados.</p>
                                ) : (
                                    <KpiList items={[
                                        { label: "Créditos totales",     value: a.iaCredit.total.toLocaleString(),     color: "#3B82F6" },
                                        { label: "Créditos usados",      value: a.iaCredit.used.toLocaleString(),      color: "#F97316" },
                                        { label: "Créditos disponibles", value: a.iaCredit.available.toLocaleString(), color: "#22C55E" },
                                        {
                                            label: "% de uso",
                                            value: a.iaCredit.total > 0
                                                ? `${Math.round((a.iaCredit.used / a.iaCredit.total) * 100)}%`
                                                : "—",
                                            color: a.iaCredit.total > 0 && a.iaCredit.used / a.iaCredit.total > 0.8
                                                ? "#EF4444"
                                                : "#22C55E",
                                        },
                                    ]} />
                                )}
                            </CardContent>
                        </Card>

                        {a?.iaCredit && a.iaCredit.total > 0 && (
                            <Card className="border-border">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Distribución de créditos</CardTitle>
                                </CardHeader>
                                <CardContent className={CHART_H}>
                                    <DonutChart data={[
                                        { name: "Usados",      value: a.iaCredit.used,      color: "#F97316" },
                                        { name: "Disponibles", value: a.iaCredit.available, color: "#22C55E" },
                                    ].filter((d) => d.value > 0)} />
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </>
            )}
                </div>
            </div>
        </div>
    );
}
