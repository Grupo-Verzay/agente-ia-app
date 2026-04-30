"use client";

import Link from "next/link";
import { useMemo, useState, type RefObject } from "react";
import {
    Activity,
    BarChart3,
    CheckCheck,
    Clock3,
    Settings2,
    LayoutList,
    TrendingUp,
} from "lucide-react";
import type { RegistrosFilters } from "@/actions/registro-action";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RegistroWithSession, TipoRegistro } from "@/types/session";
import { MetricCard } from "./MetricCard";
import { CrmGlobalActionsMenu } from "./CrmGlobalActionsMenu";
import type { DashboardStats } from "./MainDashboard";
import { CrmRecordsSection } from "./records-table/CrmRecordsSection";
import { AnalyticsView } from "./AnalyticsView";

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
    const [viewMode, setViewMode] = useState<"registros" | "analiticas">("registros");

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
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                    <div className="space-y-1">
                        <p className="text-sm font-semibold">Reglas IA del CRM</p>
                        <p className="text-sm text-muted-foreground">
                            Gestiona en una vista dedicada los follow-ups, la
                            clasificacion de lead y el sintetizador del CRM.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button asChild>
                            <Link href="/crm/rules">
                                <Settings2 className="h-4 w-4" />
                                Reglas
                            </Link>
                        </Button>

                        <CrmGlobalActionsMenu
                            userId={userId}
                            stats={stats}
                            onDataChanged={onRecordsChanged}
                        />
                    </div>
                </div>

                {/* Metric Cards */}
                <div className="flex flex-wrap gap-3">
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
                </div>

                {/* View toggle */}
                <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 w-fit">
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
                    />
                ) : (
                    <AnalyticsView userId={userId} stats={stats} />
                )}
            </div>
        </TooltipProvider>
    );
};
