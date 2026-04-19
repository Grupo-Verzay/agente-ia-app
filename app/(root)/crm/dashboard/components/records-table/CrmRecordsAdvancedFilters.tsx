"use client";

import { SlidersHorizontal } from "lucide-react";

import type { RegistrosFilters } from "@/actions/registro-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

import {
    CRM_FOLLOW_UP_FILTER_OPTIONS,
    LEAD_STATUS_FILTER_OPTIONS,
    canUseLeadFilter,
    getEstadoOptionsForTab,
} from "./constants";
import type { CrmDashboardTab } from "./types";

export function CrmRecordsAdvancedFilters({
    activeTab,
    filters,
    filterCount,
    onPatchFilters,
    onResetFilters,
}: {
    activeTab: CrmDashboardTab;
    filters: RegistrosFilters;
    filterCount: number;
    onPatchFilters: (patch: Partial<RegistrosFilters>) => void;
    onResetFilters: () => void;
}) {
    const estadoOptions = getEstadoOptionsForTab(activeTab);
    const leadFilterEnabled = canUseLeadFilter(activeTab);

    return (
        <Popover>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="relative h-9 gap-2 max-sm:w-9 max-sm:px-0"
                        >
                            <SlidersHorizontal className="h-4 w-4 shrink-0" />
                            <span className="hidden sm:inline">Filtros avanzados</span>
                            <span className="sr-only sm:hidden">Filtros avanzados</span>
                            {filterCount > 0 ? (
                                <Badge
                                    variant="secondary"
                                    className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px] sm:static sm:min-w-0 sm:rounded-full sm:px-1.5"
                                >
                                    {filterCount}
                                </Badge>
                            ) : null}
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Filtros avanzados</TooltipContent>
            </Tooltip>

            <PopoverContent align="end" className="w-[min(92vw,360px)] p-0">
                <ScrollArea className="h-[480px]">
                <div className="space-y-4 p-4">
                    <div>
                        <p className="text-sm font-medium">Filtros del CRM</p>
                        <p className="text-xs text-muted-foreground">
                            Se aplican antes de paginar para que la tabla no filtre solo lo ya
                            cargado.
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Estado
                        </label>
                        <Select
                            value={filters.estado ?? "__all__"}
                            onValueChange={(value) =>
                                onPatchFilters({
                                    estado: value === "__all__" ? undefined : value,
                                })
                            }
                        >
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">Todos</SelectItem>
                                {estadoOptions.map((estado) => (
                                    <SelectItem key={estado} value={estado}>
                                        {estado}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Follow-up
                        </label>
                        <Select
                            value={filters.crmFollowUpStatus ?? "__all__"}
                            onValueChange={(value) =>
                                onPatchFilters({
                                    crmFollowUpStatus:
                                        value === "__all__"
                                            ? undefined
                                            : (value as RegistrosFilters["crmFollowUpStatus"]),
                                })
                            }
                        >
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">Todos</SelectItem>
                                {CRM_FOLLOW_UP_FILTER_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Estado del lead
                        </label>
                        <Select
                            value={filters.leadStatus ?? "__all__"}
                            onValueChange={(value) =>
                                onPatchFilters({
                                    leadStatus:
                                        value === "__all__"
                                            ? undefined
                                            : (value as RegistrosFilters["leadStatus"]),
                                })
                            }
                        >
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">Todos</SelectItem>
                                <SelectItem value="none">Sin clasificar</SelectItem>
                                {LEAD_STATUS_FILTER_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <label className="text-xs font-medium text-muted-foreground">
                                Desde
                            </label>
                            <Input
                                type="date"
                                className="h-9"
                                value={filters.fechaDesde ?? ""}
                                onChange={(event) =>
                                    onPatchFilters({
                                        fechaDesde: event.target.value || undefined,
                                    })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <label className="text-xs font-medium text-muted-foreground">
                                Hasta
                            </label>
                            <Input
                                type="date"
                                className="h-9"
                                value={filters.fechaHasta ?? ""}
                                onChange={(event) =>
                                    onPatchFilters({
                                        fechaHasta: event.target.value || undefined,
                                    })
                                }
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border border-border/70 p-3">
                        <div className="flex items-start gap-3">
                            <Checkbox
                                id="crm-lead-only"
                                checked={filters.leadOnly === true}
                                disabled={!leadFilterEnabled}
                                onCheckedChange={(checked) =>
                                    onPatchFilters({
                                        leadOnly: checked === true ? true : undefined,
                                    })
                                }
                            />
                            <div className="space-y-1">
                                <label
                                    htmlFor="crm-lead-only"
                                    className="text-sm font-medium leading-none"
                                >
                                    Solo leads
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    Filtra reportes marcados como lead.
                                    {!leadFilterEnabled
                                        ? " Disponible en las vistas Todos y Reportes."
                                        : ""}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={onResetFilters}>
                            Limpiar filtros
                        </Button>
                    </div>
                </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
