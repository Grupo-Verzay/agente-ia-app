"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type RefObject } from "react";
import useSWR from "swr";
import {
    Activity,
    BarChart3,
    CalendarClock,
    CheckCheck,
    Clock3,
    Settings2,
    LayoutList,
    TrendingUp,
    Users,
    Wallet,
} from "lucide-react";
import type { RegistrosFilters } from "@/actions/registro-action";
import { getAnalyticsDataByUserId, type AnalyticsPeriod } from "@/actions/analytics-action";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RegistroWithSession, TipoRegistro } from "@/types/session";
import { MetricCard } from "./MetricCard";
import { CrmGlobalActionsMenu } from "./CrmGlobalActionsMenu";
import type { DashboardStats } from "./MainDashboard";
import { CrmRecordsSection } from "./records-table/CrmRecordsSection";
import { AnalyticsView } from "./AnalyticsView";

const ANALYTICS_PERIODS: { label: string; value: AnalyticsPeriod }[] = [
    { label: "7 días", value: "7d" },
    { label: "30 días", value: "30d" },
    { label: "90 días", value: "90d" },
    { label: "Todo", value: "all" },
];

const CRM_METRIC_COLORS = {
    totalRegistros: "#3B82F6",
    leadsConMovimientos: "#8B5CF6",
    crmFollowUpsActivos: "#0EA5E9",
    crmFollowUpsEnviados: "#14B8A6",
} as const;

export const CrmDashboard = ({
    stats,
    registros,
    activeTab,
    onActiveTabChange,
    filters,
    onFiltersChange,
    onChangeEstado,
    onChangeDetalle,
    onFollowUpChanged,
    onRecordsChanged,
    isUpdatingRegistros,
    userId,
    hasMore,
    isLoadingMore,
    sentinelRef,
    onScrollRootReady,
}: {
    stats: DashboardStats | null;
    registros: RegistroWithSession[];
    activeTab: "TODOS" | TipoRegistro;
    onActiveTabChange: (value: "TODOS" | TipoRegistro) => void;
    filters: RegistrosFilters;
    onFiltersChange: (filters: RegistrosFilters) => void;
    onChangeEstado?: (registroId: number, nuevoEstado: string) => void;
    onChangeDetalle?: (registroId: number, nuevoDetalle: string) => Promise<boolean>;
    onFollowUpChanged?: () => Promise<void> | void;
    onRecordsChanged?: () => Promise<void> | void;
    isUpdatingRegistros?: boolean;
    userId: string;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    sentinelRef: RefObject<HTMLDivElement>;
    onScrollRootReady: (el: HTMLDivElement | null) => void;
}) => {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<"registros" | "analiticas">("analiticas");
    const [period, setPeriod] = useState<AnalyticsPeriod>("30d");

    const pad = (n: number) => String(n).padStart(2, "0");
    const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const applyPeriod = (newPeriod: AnalyticsPeriod) => {
        setPeriod(newPeriod);
        if (viewMode !== "registros") return;
        if (newPeriod === "all") {
            const { fechaDesde: _fd, fechaHasta: _fh, ...rest } = filters;
            onFiltersChange(rest as typeof filters);
        } else {
            const days = newPeriod === "7d" ? 7 : newPeriod === "30d" ? 30 : 90;
            const desde = new Date();
            desde.setDate(desde.getDate() - (days - 1));
            desde.setHours(0, 0, 0, 0);
            onFiltersChange({
                ...filters,
                fechaDesde: toDateStr(desde),
                fechaHasta: toDateStr(new Date()),
            });
        }
    };

    const { data: analyticsData, isLoading: analyticsLoading } = useSWR(
        viewMode === "analiticas" ? ["crm-analytics", userId, period] : null,
        ([, uid, p]) => getAnalyticsDataByUserId(uid, p as AnalyticsPeriod)
    );
    const a = analyticsData?.success ? analyticsData.data : null;

    const totalRegistros = stats?.totalRegistros ?? registros.length;

    const leadsConMovimientosFallback = useMemo(() => {
        const sessionIds = new Set<number>();
        for (const registro of registros) {
            sessionIds.add(registro.sessionId);
        }
        return sessionIds.size;
    }, [registros]);

    const leadsConMovimientos =
        stats?.leadsConMovimientos ?? leadsConMovimientosFallback;

    const countsByTipo = useMemo<Record<TipoRegistro, number>>(() => {
        if (stats?.countsByTipo) return stats.countsByTipo;

        const base: Record<TipoRegistro, number> = {
            REPORTE: 0,
            SOLICITUD: 0,
            PEDIDO: 0,
            RECLAMO: 0,
            PAGO: 0,
            RESERVA: 0,
            PRODUCTO: 0,
        };

        for (const registro of registros) {
            base[registro.tipo] += 1;
        }

        return base;
    }, [registros, stats?.countsByTipo]);

    return (
        <TooltipProvider delayDuration={120}>
            <div className="flex h-full min-w-0 flex-col gap-2">
                {/* Metric Cards */}
                <div className="flex flex-wrap gap-3">
                    {viewMode === "registros" ? (
                        <>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<BarChart3 className="h-4 w-4" />}
                                    label="Total registros"
                                    value={totalRegistros}
                                    helper="Todos los movimientos en CRM"
                                    color={CRM_METRIC_COLORS.totalRegistros}
                                />
                            </div>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<Activity className="h-4 w-4" />}
                                    label="Leads con movimientos"
                                    value={leadsConMovimientos}
                                    helper="Sesiones con al menos un registro"
                                    color={CRM_METRIC_COLORS.leadsConMovimientos}
                                />
                            </div>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<Clock3 className="h-4 w-4" />}
                                    label="Follow-ups activos"
                                    value={stats?.crmFollowUps.active ?? 0}
                                    helper="Pendientes o en procesamiento"
                                    color={CRM_METRIC_COLORS.crmFollowUpsActivos}
                                />
                            </div>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<CheckCheck className="h-4 w-4" />}
                                    label="Follow-ups enviados"
                                    value={stats?.crmFollowUps.sent ?? 0}
                                    helper="Contactos trabajados por estado"
                                    color={CRM_METRIC_COLORS.crmFollowUpsEnviados}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<Users className="h-4 w-4" />}
                                    label="Total leads"
                                    value={analyticsLoading ? "…" : (a ? Object.values(a.leadStatusCounts).reduce((s, v) => s + v, 0) : 0)}
                                    helper={`${a?.leadStatusCounts.CALIENTE ?? 0} calientes`}
                                    color="#3B82F6"
                                />
                            </div>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<Activity className="h-4 w-4" />}
                                    label="Sesiones"
                                    value={analyticsLoading ? "…" : (a?.sessions.total ?? 0)}
                                    helper={`${a?.sessions.new ?? 0} nuevas en período`}
                                    color="#22C55E"
                                />
                            </div>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<CalendarClock className="h-4 w-4" />}
                                    label="Citas próximas"
                                    value={analyticsLoading ? "…" : (a?.appointments.upcoming ?? 0)}
                                    helper="próximos 7 días"
                                    color="#3B82F6"
                                />
                            </div>
                            <div className="flex-1">
                                <MetricCard
                                    icon={<Wallet className="h-4 w-4" />}
                                    label="Ingresos totales"
                                    value={analyticsLoading ? "…" : (a?.sales.total ? `$${a.sales.totalRevenue.toLocaleString("es-ES", { minimumFractionDigits: 2 })}` : "—")}
                                    helper={a?.sales.total ? `${a.sales.total} ventas` : "sin ventas registradas"}
                                    color="#8B5CF6"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* View toggle + period selector + actions */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
                        <button
                            type="button"
                            onClick={() => setViewMode("analiticas")}
                            className={[
                                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                viewMode === "analiticas"
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                        >
                            <TrendingUp className="h-3.5 w-3.5" />
                            Analíticas
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("registros")}
                            className={[
                                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                viewMode === "registros"
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                        >
                            <LayoutList className="h-3.5 w-3.5" />
                            Registros
                        </button>
                    </div>

                    <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
                        {ANALYTICS_PERIODS.map((p) => (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => applyPeriod(p.value)}
                                className={[
                                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                    period === p.value
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                ].join(" ")}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-sm font-medium">Reglas IA del CRM</span>
                        <Button onClick={() => router.push("/crm/rules")}>
                            <Settings2 className="h-4 w-4" />
                            Reglas
                        </Button>
                        <CrmGlobalActionsMenu
                            userId={userId}
                            stats={stats}
                            onDataChanged={onRecordsChanged}
                        />
                    </div>
                </div>

                {/* Content */}
                {viewMode === "registros" ? (
                    <CrmRecordsSection
                        activeTab={activeTab}
                        registros={registros}
                        totalRegistros={totalRegistros}
                        countsByTipo={countsByTipo}
                        filters={filters}
                        onActiveTabChange={onActiveTabChange}
                        onFiltersChange={onFiltersChange}
                        onChangeEstado={onChangeEstado}
                        onChangeDetalle={onChangeDetalle}
                        onFollowUpChanged={onFollowUpChanged}
                        onRecordsChanged={onRecordsChanged}
                        isUpdatingRegistros={isUpdatingRegistros}
                        userId={userId}
                        hasMore={hasMore}
                        isLoadingMore={isLoadingMore}
                        sentinelRef={sentinelRef}
                        onScrollRootReady={onScrollRootReady}
                        hideDateBadge={period !== "all"}
                    />
                ) : (
                    <AnalyticsView userId={userId} stats={stats} period={period} />
                )}
            </div>
        </TooltipProvider>
    );
};
