"use client";

import type { Table } from "@tanstack/react-table";
import { Columns3, Download, Search, X } from "lucide-react";

import type { RegistrosFilters } from "@/actions/registro-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RegistroWithSession } from "@/types/session";

import { CRM_TABLE_COLUMN_LABELS } from "./constants";
import { CrmRecordsAdvancedFilters } from "./CrmRecordsAdvancedFilters";
import type { CrmDashboardTab, CrmTableColumnId } from "./types";

export function CrmRecordsToolbar({
    table,
    activeTab,
    filters,
    filterCount,
    searchValue,
    totalRegistros,
    loadedCount,
    onSearchChange,
    onPatchFilters,
    onResetFilters,
    onExportClick,
}: {
    table: Table<RegistroWithSession>;
    activeTab: CrmDashboardTab;
    filters: RegistrosFilters;
    filterCount: number;
    searchValue: string;
    totalRegistros: number;
    loadedCount: number;
    onSearchChange: (value: string) => void;
    onPatchFilters: (patch: Partial<RegistrosFilters>) => void;
    onResetFilters: () => void;
    onExportClick: () => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder="Buscar en el CRM..."
                            className="h-9 pl-9 pr-9"
                        />
                        {searchValue ? (
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                onClick={() => onSearchChange("")}
                                title="Limpiar búsqueda"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>

                    <CrmRecordsAdvancedFilters
                        activeTab={activeTab}
                        filters={filters}
                        filterCount={filterCount}
                        onPatchFilters={onPatchFilters}
                        onResetFilters={onResetFilters}
                    />

                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 gap-2 max-sm:w-9 max-sm:px-0"
                                    >
                                        <Columns3 className="h-4 w-4 shrink-0" />
                                        <span className="hidden sm:inline">Columnas</span>
                                        <span className="sr-only sm:hidden">Columnas</span>
                                    </Button>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Columnas</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                            {table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => {
                                    const label =
                                        CRM_TABLE_COLUMN_LABELS[
                                            column.id as CrmTableColumnId
                                        ] ?? column.id;

                                    return (
                                        <DropdownMenuCheckboxItem
                                            key={column.id}
                                            className="capitalize"
                                            checked={column.getIsVisible()}
                                            onCheckedChange={(value) =>
                                                column.toggleVisibility(Boolean(value))
                                            }
                                        >
                                            {label}
                                        </DropdownMenuCheckboxItem>
                                    );
                                })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 gap-2 max-sm:w-9 max-sm:px-0"
                                onClick={onExportClick}
                            >
                                <Download className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">Exportar</span>
                                <span className="sr-only sm:hidden">Exportar</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Exportar a Excel</TooltipContent>
                    </Tooltip>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-9 rounded-md px-3 text-xs border-border">
                        <span className="sm:hidden">{loadedCount} filas</span>
                        <span className="hidden sm:inline">
                            {filterCount > 0
                                ? `${loadedCount} cargados en la consulta`
                                : `${loadedCount} cargados de ${totalRegistros} globales`}
                        </span>
                    </Badge>
                </div>
            </div>
        </div>
    );
}
