"use client";

import dynamic from "next/dynamic";

import { useRouter } from "next/navigation";
import { useMemo, useState, type RefObject } from "react";
import {
    FileText,
    Settings2,
    LayoutList,
    TrendingUp,
    Kanban,
    PhoneCall,
    RefreshCw,
    X,
} from "lucide-react";
import type { RegistrosFilters } from "@/actions/registro-action";
import type { AnalyticsPeriod } from "@/actions/analytics-action";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RegistroWithSession, TipoRegistro } from "@/types/session";
import { SelectorDeCuentas } from "@/components/shared/SelectorDeCuentas";
import { elCrmVaUnificado, nombresDeLasCuentas } from "@/lib/crm-de-la-familia";
import type { CuentasDelCrm } from "@/lib/cuentas-del-crm";
import { CrmGlobalActionsMenu } from "./CrmGlobalActionsMenu";
import type { DashboardStats } from "./MainDashboard";
import { CrmRecordsSection } from "./records-table/CrmRecordsSection";
// La vista de analítica es una de las pestañas del CRM y es la única que dibuja
// gráficas: la librería pesa 343 kB. Se carga cuando se abre esa pestaña, no al
// entrar al CRM, así que kanban, registros, llamadas y reportes dejan de pagarla.
const AnalyticsView = dynamic(
    () => import("./AnalyticsView").then((m) => m.AnalyticsView),
    { ssr: false },
);
import { KanbanBoard } from "../../kanban/_components/KanbanBoard";
import { WeeklyReportsView } from "./WeeklyReportsView";
import { LoQueLaIaNoSupoView } from "./LoQueLaIaNoSupoView";
import { CallsCrmClient } from "../../llamadas/_components/CallsCrmClient";
import { RANGOS_DE_DIAS, DIAS_POR_DEFECTO } from "../../llamadas/_components/rango-de-dias";
import { cn } from "@/lib/utils";

const ANALYTICS_PERIODS: { label: string; value: AnalyticsPeriod }[] = [
    { label: "7 días", value: "7d" },
    { label: "30 días", value: "30d" },
    { label: "90 días", value: "90d" },
    { label: "Todo", value: "all" },
];

export const SCORE_RANGES = [
    { key: "bajo",     label: "Bajo",     range: "0–25",   color: "#EF4444" },
    { key: "medio",    label: "Medio",    range: "26–50",  color: "#F97316" },
    { key: "moderado", label: "Moderado", range: "51–75",  color: "#F59E0B" },
    { key: "alto",     label: "Alto",     range: "76–90",  color: "#22C55E" },
    { key: "listo",    label: "Listo",    range: "91–100", color: "#16A34A" },
] as const;
export type ScoreRangeKey = typeof SCORE_RANGES[number]["key"];

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
    initialView,
    cuentas,
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
    initialView?: "registros" | "analiticas" | "kanban" | "reportes" | "llamadas";
    cuentas: CuentasDelCrm;
}) => {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<"registros" | "analiticas" | "kanban" | "reportes" | "llamadas">(initialView ?? "analiticas");
    const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
    const [selectedScoreRanges, setSelectedScoreRanges] = useState<Set<ScoreRangeKey>>(new Set());
    /*
     * Los tres mandos de Llamadas viven AQUÍ, no dentro de la pantalla: son de
     * la misma familia que las pestañas —acotan lo que se está mirando— y en su
     * sitio de antes le quitaban una fila entera a la tabla. `diasDeLlamadas`
     * es el rango; `refrescoDeLlamadas` sube en cada pulsación de «Actualizar»
     * y con eso la pantalla vuelve a pedir su vuelta; `cargandoLlamadas` es
     * solo para que el icono gire.
     *
     * Ojo: NO es el `period` de al lado. Aquel es `AnalyticsPeriod` ("7d"…) y
     * decide los filtros de Registros; este es un número de días y va a
     * `getCallsCrmData`. Juntarlos sería un filtro que promete lo que la
     * pantalla de al lado no hace.
     */
    const [diasDeLlamadas, setDiasDeLlamadas] = useState(DIAS_POR_DEFECTO);
    const [refrescoDeLlamadas, setRefrescoDeLlamadas] = useState(0);
    const [cargandoLlamadas, setCargandoLlamadas] = useState(false);
    const [scoreCounts, setScoreCounts] = useState<Record<string, number>>({});

    const toggleScoreRange = (key: ScoreRangeKey) => {
        setSelectedScoreRanges(new Set([key]));
    };

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

    /*
     * Con una sola cuenta elegida —el caso de siempre, y el unico que ve una
     * cuenta hija— las cinco vistas se tienen que ver EXACTAMENTE como antes de
     * que esto existiera: ni columna «Cuenta», ni insignias, ni filas de solo
     * lectura. De ahi cuelga todo lo que cambia al unificar.
     */
    const unificado = elCrmVaUnificado(cuentas.elegidas);
    const nombresDeCuenta = useMemo(
        () => nombresDeLasCuentas(cuentas.disponibles),
        [cuentas.disponibles],
    );

    const totalRegistros = stats?.totalRegistros ?? registros.length;

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
            <div className="flex h-full min-h-0 min-w-0 w-full flex-col gap-2 overflow-hidden">
                {/*
                 * Aquí abría la pantalla una fila de cuatro `MetricCard`, una
                 * tanda distinta por cada vista. Se fue entera, y conviene
                 * saber por qué cada tanda, porque no es el mismo motivo:
                 *
                 * - **Llamadas**: eran las mismas cuatro cifras que la propia
                 *   pantalla de Llamadas ya pinta como pastillas al lado de su
                 *   filtro. Allí filtran; aquí, arriba del todo y lejos de la
                 *   tabla, no hacían nada. Ahora esas pastillas salen también
                 *   embebidas, así que no se ha perdido ninguna.
                 * - **Registros**: «Total registros» es lo que ya dice la
                 *   pestaña «Todos (N)», que además filtra. Y las dos de
                 *   follow-ups contaban SEGUIMIENTOS por estado, no registros:
                 *   pulsando el filtro equivalente la lista nunca habría dado
                 *   ese número — un filtro que ofrece una cifra a la que no se
                 *   puede llegar.
                 * - **Kanban**: Frío, Tibio, Caliente y Finalizado son las
                 *   columnas del propio tablero, contadas dos veces.
                 * - **Analíticas** y **Reportes**: debajo no hay lista que
                 *   filtrar, son gráficas y los doce últimos reportes.
                 *
                 * Y con ellas se fue la consulta que las alimentaba
                 * (`getAnalyticsDataByUserId`), que corría en cada cambio de
                 * vista y de periodo para pintar cuatro números: la pestaña de
                 * Analíticas trae los suyos por su cuenta.
                 */}

                {/* View toggle + period selector + actions */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-nowrap gap-1 overflow-x-auto max-w-full rounded-lg border border-border/60 bg-muted/30 p-1 [&>button]:shrink-0">
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
                        <button
                            type="button"
                            onClick={() => setViewMode("llamadas")}
                            className={[
                                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                viewMode === "llamadas"
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                        >
                            <PhoneCall className="h-3.5 w-3.5" />
                            Llamadas
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("kanban")}
                            className={[
                                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                viewMode === "kanban"
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                        >
                            <Kanban className="h-3.5 w-3.5" />
                            Kanban
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("reportes")}
                            className={[
                                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                viewMode === "reportes"
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                        >
                            <FileText className="h-3.5 w-3.5" />
                            Reportes
                        </button>
                    </div>

                    {viewMode !== "kanban" && viewMode !== "reportes" && viewMode !== "llamadas" && (
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
                    )}


                    {/*
                      * El filtro por cuenta acota la lista de abajo, asi que va
                      * con los demas filtros y no en una fila propia — una fila
                      * suelta son 40 px que se le quitan a la tabla en las cinco
                      * vistas. Se pinta solo si el servidor dijo que se puede
                      * elegir: quien no es la cuenta madre de su familia recibe
                      * la lista vacia y aqui no sale nada.
                      */}
                    {cuentas.puedeElegir && (
                        <SelectorDeCuentas
                            disponibles={cuentas.disponibles}
                            elegidas={cuentas.elegidas}
                            porDefecto="todas"
                            conMoneda={false}
                        />
                    )}

                    {/* Llamadas: su rango y su «Actualizar», a la derecha de
                        esta misma fila. `ml-auto` los pega al borde, igual que
                        las acciones de Registros de más abajo. */}
                    {viewMode === "llamadas" && (
                        <div className="ml-auto flex items-center gap-2">
                            <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
                                {RANGOS_DE_DIAS.map((r) => (
                                    <button
                                        key={r.value}
                                        type="button"
                                        onClick={() => setDiasDeLlamadas(r.value)}
                                        className={[
                                            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                            diasDeLlamadas === r.value
                                                ? "bg-background shadow-sm text-foreground"
                                                : "text-muted-foreground hover:text-foreground",
                                        ].join(" ")}
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10"
                                title="Actualizar"
                                aria-label="Actualizar"
                                onClick={() => setRefrescoDeLlamadas((n) => n + 1)}
                            >
                                <RefreshCw className={cn("h-4 w-4", cargandoLlamadas && "animate-spin")} />
                            </Button>
                        </div>
                    )}

                    {viewMode === "kanban" && (
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-1">
                                {SCORE_RANGES.map((range) => {
                                    const active = selectedScoreRanges.has(range.key);
                                    const count = scoreCounts[range.key] ?? 0;
                                    return (
                                        <button
                                            key={range.key}
                                            type="button"
                                            title={`Score ${range.range}`}
                                            onClick={() => toggleScoreRange(range.key)}
                                            className="rounded-md px-3 py-1.5 text-sm font-medium transition-all flex items-center gap-1 whitespace-nowrap"
                                            style={{
                                                color: active ? range.color : undefined,
                                                backgroundColor: active ? range.color + "18" : undefined,
                                                boxShadow: active ? `inset 0 0 0 1px ${range.color}60` : undefined,
                                            }}
                                        >
                                            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: range.color }} />
                                            {range.label}
                                            {count > 0 && (
                                                <span
                                                    className="ml-1 text-[10px] font-bold px-1 py-0 rounded-full text-white"
                                                    style={{ backgroundColor: range.color }}
                                                >
                                                    {count}
                                                </span>
                                            )}
                                            {active && <X className="h-2.5 w-2.5 ml-0.5 opacity-60" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {viewMode === "registros" && (
                        <div className="ml-auto flex items-center gap-2">
                            <Button onClick={() => router.push("/crm/rules")}>
                                <Settings2 className="h-4 w-4" />
                                Reglas IA CRM
                            </Button>
                            <CrmGlobalActionsMenu
                                userId={userId}
                                stats={stats}
                                onDataChanged={onRecordsChanged}
                            />
                        </div>
                    )}
                </div>

                {/* Content */}
                {viewMode === "reportes" ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <WeeklyReportsView
                            cuentas={cuentas.elegidas}
                            cuentaPropia={cuentas.propia}
                            unificado={unificado}
                            nombresDeCuenta={nombresDeCuenta}
                        />
                        {/* Lo que la IA no supo responder. Va en Informes y no en
                            Analiticas a proposito: no es una metrica que se mire de
                            reojo, es una lista de cosas concretas que hay que anadirle
                            al entrenamiento. */}
                        <div className="mt-6 border-t pt-6">
                            <LoQueLaIaNoSupoView
                                userId={userId}
                                cuentas={cuentas.elegidas}
                                unificado={unificado}
                                nombresDeCuenta={nombresDeCuenta}
                            />
                        </div>
                    </div>
                ) : viewMode === "kanban" ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <KanbanBoard
                            userId={userId}
                            cuentas={cuentas.elegidas}
                            unificado={unificado}
                            nombresDeCuenta={nombresDeCuenta}
                            selectedScoreRanges={selectedScoreRanges}
                            onToggleScoreRange={(key) => toggleScoreRange(key as ScoreRangeKey)}
                            onScoreCountsChange={setScoreCounts}
                        />
                    </div>
                ) : viewMode === "registros" ? (
                    <div className="flex-1 min-h-0 flex flex-col">
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
                        unificado={unificado}
                        nombresDeCuenta={nombresDeCuenta}
                        hideDateBadge={period !== "all"}
                    />
                    </div>
                ) : viewMode === "llamadas" ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <CallsCrmClient
                            embedded
                            cuentas={cuentas.elegidas}
                            cuentaPropia={cuentas.propia}
                            unificado={unificado}
                            nombresDeCuenta={nombresDeCuenta}
                            dias={diasDeLlamadas}
                            refresco={refrescoDeLlamadas}
                            alCargar={setCargandoLlamadas}
                        />
                    </div>
                ) : (
                    <AnalyticsView
                        userId={userId}
                        stats={stats}
                        period={period}
                        cuentas={cuentas.elegidas}
                    />
                )}
            </div>
        </TooltipProvider>
    );
};
