"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CrmExportDialog } from "../CrmExportDialog";
import { useRouter } from "next/navigation";

import {
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table";
import {
    CalendarDays,
    FileText,
    Handshake,
    Inbox,
    LayoutGrid,
    TriangleAlert,
    Wallet,
    X,
} from "lucide-react";

import type { RegistrosFilters } from "@/actions/registro-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { getTipoLabel } from "../../../helpers";

import {
    CRM_COLUMN_VISIBILITY_STORAGE_KEY,
    CRM_FOLLOW_UP_FILTER_OPTIONS,
    CRM_DEFAULT_COLUMN_VISIBILITY,
    CRM_TAB_COLORS,
    CRM_TABS,
    LEAD_STATUS_FILTER_OPTIONS,
    isCrmTabValue,
} from "./constants";
import { createCrmRecordColumns } from "./crm-record-columns";
import { CrmRecordsDataTable } from "./CrmRecordsDataTable";
import { CrmRecordsToolbar } from "./CrmRecordsToolbar";
import type { CrmRecordsSectionProps } from "./types";

const CRM_TAB_ICONS = {
    TODOS: LayoutGrid,
    REPORTE: FileText,
    SOLICITUD: Inbox,
    PEDIDO: Handshake,
    RECLAMO: TriangleAlert,
    PAGO: Wallet,
    RESERVA: CalendarDays,
} as const;

function sanitizeFilters(filters: RegistrosFilters) {
    return Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== undefined && value !== "")
    ) as RegistrosFilters;
}

export function CrmRecordsSection({
    activeTab,
    registros,
    totalRegistros,
    countsByTipo,
    filters,
    onActiveTabChange,
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
}: CrmRecordsSectionProps) {
    const router = useRouter();
    const [sorting, setSorting] = useState<SortingState>([
        { id: "fecha", desc: true },
    ]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
        CRM_DEFAULT_COLUMN_VISIBILITY
    );
    const [hasLoadedPersistedColumnVisibility, setHasLoadedPersistedColumnVisibility] =
        useState(false);
    const [searchValue, setSearchValue] = useState(filters.query ?? "");
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

    const handleNavigateToChat = useCallback((remoteJid: string) => {
        router.push(`/chats?jid=${remoteJid}`);
    }, [router]);

    useEffect(() => {
        setSearchValue(filters.query ?? "");
    }, [filters.query]);

    useEffect(() => {
        try {
            const rawColumnVisibility = localStorage.getItem(
                CRM_COLUMN_VISIBILITY_STORAGE_KEY
            );

            if (!rawColumnVisibility) return;

            const parsedColumnVisibility = JSON.parse(rawColumnVisibility);
            if (
                !parsedColumnVisibility ||
                typeof parsedColumnVisibility !== "object" ||
                Array.isArray(parsedColumnVisibility)
            ) {
                return;
            }

            const nextColumnVisibility = Object.entries(
                parsedColumnVisibility as Record<string, unknown>
            ).reduce<VisibilityState>((acc, [key, value]) => {
                if (
                    Object.prototype.hasOwnProperty.call(
                        CRM_DEFAULT_COLUMN_VISIBILITY,
                        key
                    ) &&
                    typeof value === "boolean"
                ) {
                    acc[key] = value;
                }

                return acc;
            }, {});

            setColumnVisibility((current) => ({
                ...current,
                ...nextColumnVisibility,
            }));
        } catch {
            // ignore corrupted localStorage payloads
        } finally {
            setHasLoadedPersistedColumnVisibility(true);
        }
    }, []);

    useEffect(() => {
        if (!hasLoadedPersistedColumnVisibility) return;

        try {
            localStorage.setItem(
                CRM_COLUMN_VISIBILITY_STORAGE_KEY,
                JSON.stringify(columnVisibility)
            );
        } catch {
            // localStorage may be unavailable
        }
    }, [columnVisibility, hasLoadedPersistedColumnVisibility]);

    const patchFilters = useCallback(
        (patch: Partial<RegistrosFilters>) => {
            onFiltersChange(
                sanitizeFilters({
                    ...filters,
                    ...patch,
                })
            );
        },
        [filters, onFiltersChange]
    );

    const resetFilters = useCallback(() => {
        onFiltersChange({});
    }, [onFiltersChange]);

    useEffect(() => {
        const normalizedSearch = searchValue.trim();
        const currentSearch = filters.query ?? "";
        if (normalizedSearch === currentSearch) return;

        const timeoutId = window.setTimeout(() => {
            patchFilters({
                query: normalizedSearch || undefined,
            });
        }, 350);

        return () => window.clearTimeout(timeoutId);
    }, [filters.query, patchFilters, searchValue]);

    const columns = useMemo(
        () =>
            createCrmRecordColumns({
                userId,
                isUpdatingRegistros,
                onChangeEstado,
                onChangeDetalle,
                onFollowUpChanged,
                onRecordsChanged,
                onNavigateToChat: handleNavigateToChat,
            }),
        [
            userId,
            isUpdatingRegistros,
            onChangeEstado,
            onChangeDetalle,
            onFollowUpChanged,
            onRecordsChanged,
            handleNavigateToChat,
        ]
    );

    const table = useReactTable({
        data: registros,
        columns,
        state: {
            sorting,
            columnVisibility,
        },
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.query?.trim()) count += 1;
        if (filters.estado) count += 1;
        if (filters.leadStatus) count += 1;
        if (filters.crmFollowUpStatus) count += 1;
        if (filters.fechaDesde || filters.fechaHasta) count += 1;
        if (filters.leadOnly) count += 1;
        return count;
    }, [
        filters.estado,
        filters.fechaDesde,
        filters.fechaHasta,
        filters.crmFollowUpStatus,
        filters.leadStatus,
        filters.leadOnly,
        filters.query,
    ]);

    const activeFilterBadges = useMemo(() => {
        const badges: Array<{
            key: string;
            label: string;
            onClear: () => void;
        }> = [];

        if (filters.query?.trim()) {
            badges.push({
                key: "query",
                label: `Búsqueda: ${filters.query.trim()}`,
                onClear: () => patchFilters({ query: undefined }),
            });
        }

        if (filters.estado) {
            badges.push({
                key: "estado",
                label: `Estado: ${filters.estado}`,
                onClear: () => patchFilters({ estado: undefined }),
            });
        }

        if (filters.leadStatus) {
            const leadStatusLabel =
                filters.leadStatus === "none"
                    ? "Sin clasificar"
                    : LEAD_STATUS_FILTER_OPTIONS.find(
                        (option) => option.value === filters.leadStatus
                    )?.label ?? filters.leadStatus;

            badges.push({
                key: "lead-status",
                label: `Lead: ${leadStatusLabel}`,
                onClear: () => patchFilters({ leadStatus: undefined }),
            });
        }

        if (filters.crmFollowUpStatus) {
            const crmFollowUpLabel =
                CRM_FOLLOW_UP_FILTER_OPTIONS.find(
                    (option) => option.value === filters.crmFollowUpStatus
                )?.label ?? filters.crmFollowUpStatus;

            badges.push({
                key: "crm-follow-up",
                label: `Follow-up: ${crmFollowUpLabel}`,
                onClear: () => patchFilters({ crmFollowUpStatus: undefined }),
            });
        }

        if (filters.fechaDesde || filters.fechaHasta) {
            badges.push({
                key: "fechas",
                label: `Fecha: ${filters.fechaDesde ?? "Inicio"} - ${filters.fechaHasta ?? "Hoy"}`,
                onClear: () =>
                    patchFilters({
                        fechaDesde: undefined,
                        fechaHasta: undefined,
                    }),
            });
        }

        if (filters.leadOnly) {
            badges.push({
                key: "lead",
                label: "Solo leads",
                onClear: () => patchFilters({ leadOnly: undefined }),
            });
        }

        return badges;
    }, [
        filters.estado,
        filters.fechaDesde,
        filters.fechaHasta,
        filters.crmFollowUpStatus,
        filters.leadStatus,
        filters.leadOnly,
        filters.query,
        patchFilters,
    ]);


    return (
        <>
        <Card className="min-w-0 border-border/70">
            <CardHeader className="space-y-4">
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => {
                        if (isCrmTabValue(value)) {
                            onActiveTabChange(value);
                        }
                    }}
                    className="w-full"
                >
                    <TabsList className="flex h-auto w-full flex-nowrap justify-between gap-1 overflow-x-auto border-border bg-muted/40 p-0">
                        {CRM_TABS.map((tab) => {
                            const label =
                                tab === "TODOS"
                                    ? `Todos (${totalRegistros})`
                                    : `${getTipoLabel(tab)} (${countsByTipo[tab]})`;
                            const Icon = CRM_TAB_ICONS[tab];
                            const tabColor = CRM_TAB_COLORS[tab];

                            return (
                                <Tooltip key={tab}>
                                    <TooltipTrigger asChild>
                                        <TabsTrigger
                                            value={tab}
                                            className="flex-1 gap-2 bg-[color:var(--crm-tab-color)] px-3 text-white hover:opacity-95 data-[state=active]:bg-[color:var(--crm-tab-color)] data-[state=active]:text-white data-[state=active]:shadow-md max-sm:w-10 max-sm:px-0"
                                            style={
                                                {
                                                    "--crm-tab-color": tabColor,
                                                } as CSSProperties
                                            }
                                        >
                                            <Icon className="h-4 w-4 shrink-0 sm:hidden" />
                                            <span className="hidden sm:inline">{label}</span>
                                            <span className="sr-only sm:hidden">{label}</span>
                                        </TabsTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">{label}</TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </TabsList>
                </Tabs>

                <CrmRecordsToolbar
                    table={table}
                    activeTab={activeTab}
                    filters={filters}
                    filterCount={activeFilterCount}
                    searchValue={searchValue}
                    totalRegistros={totalRegistros}
                    loadedCount={registros.length}
                    onSearchChange={setSearchValue}
                    onPatchFilters={patchFilters}
                    onResetFilters={resetFilters}
                    onExportClick={() => setIsExportDialogOpen(true)}
                />

                {activeFilterBadges.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {activeFilterBadges.map((filterBadge) => (
                            <Badge
                                key={filterBadge.key}
                                variant="secondary"
                                className="gap-2 rounded-full px-3 py-1 text-xs"
                            >
                                {filterBadge.label}
                                <button
                                    type="button"
                                    className="text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={filterBadge.onClear}
                                    title={`Quitar filtro ${filterBadge.label}`}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={resetFilters}
                        >
                            Limpiar todo
                        </Button>
                    </div>
                ) : null}
            </CardHeader>

            <CardContent className="pt-0">
                <CrmRecordsDataTable
                    table={table}
                    activeTab={activeTab}
                    dataLength={registros.length}
                    hasMore={hasMore}
                    isLoadingMore={isLoadingMore}
                    sentinelRef={sentinelRef}
                    onScrollRootReady={onScrollRootReady}
                />
            </CardContent>
        </Card>

        <CrmExportDialog
            open={isExportDialogOpen}
            onOpenChange={setIsExportDialogOpen}
            registros={registros}
        />
        </>
    );
}
