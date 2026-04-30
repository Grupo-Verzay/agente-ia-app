"use client";

import useSWR from "swr";
import {
    ResponsiveContainer,
    BarChart, Bar,
    LineChart, Line,
    XAxis, YAxis, Tooltip, CartesianGrid,
    PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAnalyticsDataByUserId } from "@/actions/analytics-action";
import { TagStatsCard } from "./TagStatsCard";
import type { DashboardStats } from "./MainDashboard";

/* ─── colores ─── */
const LEAD_COLORS: Record<string, string> = {
    FRIO: "#3B82F6", TIBIO: "#F59E0B", CALIENTE: "#EF4444",
    FINALIZADO: "#22C55E", DESCARTADO: "#6B7280",
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

/* ─── helpers ─── */
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

/* Fila de 4 KPIs pequeños */
function KpiRow({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {items.map((item) => (
                <div key={item.label} className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <span className="text-[11px] text-muted-foreground">{item.label}</span>
                    <span className="text-xl font-bold" style={item.color ? { color: item.color } : {}}>
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
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={50} outerRadius={78} paddingAngle={2}>
                    {data.map((e) => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v}`, n]} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
        </ResponsiveContainer>
    );
}

/* ─── componente principal ─── */
export function AnalyticsView({ userId, stats }: { userId: string; stats: DashboardStats | null }) {
    const { data, isLoading } = useSWR(
        ["crm-analytics", userId],
        ([, uid]) => getAnalyticsDataByUserId(uid)
    );
    const a = data?.success ? data.data : null;

    /* leads */
    const leadData = a
        ? Object.entries(a.leadStatusCounts)
            .map(([k, v]) => ({ name: LEAD_LABELS[k] ?? k, value: v, color: LEAD_COLORS[k] ?? "#94A3B8" }))
            .filter((d) => d.value > 0)
        : [];

    /* follow-ups */
    const followData = stats
        ? [
            { name: "Pendiente", cantidad: stats.crmFollowUps.pending, color: FOLLOW_COLORS["Pendiente"] },
            { name: "Procesando", cantidad: stats.crmFollowUps.processing, color: FOLLOW_COLORS["Procesando"] },
            { name: "Enviado", cantidad: stats.crmFollowUps.sent, color: FOLLOW_COLORS["Enviado"] },
            { name: "Fallido", cantidad: stats.crmFollowUps.failed, color: FOLLOW_COLORS["Fallido"] },
            { name: "Cancelado", cantidad: stats.crmFollowUps.cancelled, color: FOLLOW_COLORS["Cancelado"] },
            { name: "Ignorado", cantidad: stats.crmFollowUps.skipped, color: FOLLOW_COLORS["Ignorado"] },
        ].filter((d) => d.cantidad > 0)
        : [];

    /* citas */
    const apptData = a
        ? Object.entries(a.appointments.counts)
            .map(([k, v]) => ({ name: APPT_LABELS[k] ?? k, value: v, color: APPT_COLORS[k] ?? "#94A3B8" }))
            .filter((d) => d.value > 0)
        : [];

    /* flujos */
    const workflowData = a
        ? Object.entries(a.workflowCounts)
            .map(([k, v]) => ({ name: WORKFLOW_LABELS[k] ?? k, value: v, color: WORKFLOW_COLORS[k] ?? "#94A3B8" }))
        : [];

    /* sesiones */
    const sessionData = a
        ? [
            { name: "Activas", value: a.sessions.active, color: "#22C55E" },
            { name: "Inactivas", value: a.sessions.inactive, color: "#6B7280" },
        ].filter((d) => d.value > 0)
        : [];

    const agentData = a
        ? [
            { name: "Agente ON", value: a.sessions.agentActive, color: "#3B82F6" },
            { name: "Agente OFF", value: a.sessions.agentInactive, color: "#F59E0B" },
        ].filter((d) => d.value > 0)
        : [];

    const loading = isLoading;

    return (
        <div className="space-y-4 pb-4">

            {/* ═══ LEADS Y SEGUIMIENTOS ═══ */}
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
                        <CardTitle className="text-base">Estado de seguimientos</CardTitle>
                        <CardDescription>Desglose de follow-ups por estado actual.</CardDescription>
                    </CardHeader>
                    <CardContent className={CHART_H}>
                        {followData.length === 0 ? <EmptyState text="No hay seguimientos registrados." /> : (
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
            </div>

            {/* ═══ CITAS AGENDADAS ═══ */}
            <SectionLabel>Citas agendadas</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Resumen de citas</CardTitle>
                        <CardDescription>Indicadores clave de tus citas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-1">
                        {[
                            { label: "Total citas", value: loading ? "…" : a?.appointments.total ?? 0, color: "#3B82F6" },
                            { label: "Próximas 7 días", value: loading ? "…" : a?.appointments.upcoming ?? 0, color: "#22C55E" },
                            { label: "Pendientes", value: loading ? "…" : a?.appointments.counts.PENDIENTE ?? 0, color: "#F59E0B" },
                            { label: "Confirmadas", value: loading ? "…" : a?.appointments.counts.CONFIRMADA ?? 0, color: "#22C55E" },
                            { label: "Atendidas", value: loading ? "…" : a?.appointments.counts.ATENDIDA ?? 0, color: "#8B5CF6" },
                            { label: "Canceladas", value: loading ? "…" : a?.appointments.counts.CANCELADA ?? 0, color: "#EF4444" },
                            { label: "No asistió", value: loading ? "…" : a?.appointments.counts.NO_ASISTIDA ?? 0, color: "#6B7280" },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                                <span className="text-muted-foreground">{item.label}</span>
                                <span className="font-bold text-base" style={{ color: item.color }}>{item.value}</span>
                            </div>
                        ))}
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

            {/* ═══ FLUJOS ═══ */}
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

            {/* ═══ VENTAS (solo si hay datos) ═══ */}
            {a && a.sales.total > 0 && (
                <>
                    <SectionLabel>Ventas</SectionLabel>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Resumen de ventas</CardTitle>
                                <CardDescription>Indicadores de tus transacciones.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 pt-1">
                                {[
                                    { label: "Total ventas", value: a.sales.total, color: "#22C55E" },
                                    {
                                        label: "Ingresos totales",
                                        value: `$${a.sales.totalRevenue.toLocaleString("es-ES", { minimumFractionDigits: 2 })}`,
                                        color: "#3B82F6",
                                    },
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                                        <span className="text-muted-foreground">{item.label}</span>
                                        <span className="font-bold text-base" style={{ color: item.color }}>{item.value}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Ventas últimos 30 días</CardTitle>
                                <CardDescription>Cantidad de ventas e ingresos por semana.</CardDescription>
                            </CardHeader>
                            <CardContent className={CHART_H}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={a.sales.byWeek} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="ventas" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} name="Ventas" />
                                        <Line type="monotone" dataKey="ingresos" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="Ingresos" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}

            {/* ═══ PRODUCTOS (solo si hay datos) ═══ */}
            {a && a.products.total > 0 && (
                <>
                    <SectionLabel>Productos</SectionLabel>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Top productos por stock</CardTitle>
                                <CardDescription>Los 6 productos activos con mayor inventario.</CardDescription>
                            </CardHeader>
                            <CardContent className={CHART_H}>
                                {a.products.top.length === 0 ? <EmptyState text="No hay productos con stock." /> : (
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
                                {a.products.byCategory.length === 0 ? <EmptyState text="Sin categorías." /> : (
                                    <div className="space-y-2">
                                        {a.products.byCategory.map((cat) => (
                                            <div key={cat.category} className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5 last:border-0">
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

            {/* ═══ SESIONES ═══ */}
            <SectionLabel>Sesiones</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Estado de sesiones</CardTitle>
                        <CardDescription>{a ? `${a.sessions.total} sesiones en total` : "Activas vs inactivas."}</CardDescription>
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

            {/* KPIs de sesiones — fila completa */}
            {a && (
                <KpiRow items={[
                    { label: "Total sesiones", value: a.sessions.total, color: "#6B7280" },
                    { label: "Sesiones activas", value: a.sessions.active, color: "#22C55E" },
                    { label: "Agente encendido", value: a.sessions.agentActive, color: "#3B82F6" },
                    { label: "Agente apagado", value: a.sessions.agentInactive, color: "#F59E0B" },
                ]} />
            )}

            {/* ═══ ETIQUETAS Y MADUREZ ═══ */}
            <SectionLabel>Etiquetas y madurez</SectionLabel>
            <TagStatsCard userId={userId} />
        </div>
    );
}
