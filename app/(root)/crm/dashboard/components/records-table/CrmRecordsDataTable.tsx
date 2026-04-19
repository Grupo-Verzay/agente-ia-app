"use client";

import { useEffect, useRef, type RefObject } from "react";

import { flexRender } from "@tanstack/react-table";
import type { Table as TanStackTable } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";

import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { RegistroWithSession } from "@/types/session";

import type { CrmDashboardTab } from "./types";

export function CrmRecordsDataTable({
    table,
    activeTab,
    dataLength,
    hasMore,
    isLoadingMore,
    sentinelRef,
    onScrollRootReady,
}: {
    table: TanStackTable<RegistroWithSession>;
    activeTab: CrmDashboardTab;
    dataLength: number;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    sentinelRef: RefObject<HTMLDivElement>;
    onScrollRootReady: (el: HTMLDivElement | null) => void;
}) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        onScrollRootReady(scrollContainerRef.current);

        return () => {
            onScrollRootReady(null);
        };
    }, [activeTab, dataLength, onScrollRootReady]);

    const visibleColumnCount = table.getVisibleFlatColumns().length;

    return (
        <div className="flex h-full min-w-0 flex-col gap-2">
            <div className="flex-1 min-w-0 overflow-hidden">
                <div className="grid grid-cols-1 gap-4">
                    <div
                        ref={scrollContainerRef}
                        className="h-[420px] min-w-0 overflow-auto rounded-xl border border-border/70 bg-background lg:h-[540px]"
                    >
                        <div className="min-w-max">
                            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                                <TableHeader>
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <TableRow
                                            key={headerGroup.id}
                                            className="border-border/70 bg-background hover:bg-background"
                                        >
                                            {headerGroup.headers.map((header) => (
                                                <TableHead
                                                    key={header.id}
                                                    className="sticky top-0 z-20 whitespace-nowrap border-b border-border/70 bg-background/95 shadow-[0_1px_0_0_hsl(var(--border)/0.7)] backdrop-blur supports-[backdrop-filter]:bg-background/85"
                                                >
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                              header.column.columnDef.header,
                                                              header.getContext()
                                                          )}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableHeader>

                                <TableBody>
                                    {table.getRowModel().rows.length > 0 ? (
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow
                                                key={row.id}
                                                className="hover:bg-accent/30"
                                            >
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell
                                                        key={cell.id}
                                                        className="align-top py-3"
                                                    >
                                                        {flexRender(
                                                            cell.column.columnDef.cell,
                                                            cell.getContext()
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={visibleColumnCount}
                                                className="h-28 text-center text-muted-foreground"
                                            >
                                                No hay registros para los filtros actuales.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </table>

                            <div
                                ref={sentinelRef}
                                className="flex h-12 w-full items-center justify-center border-t border-border/70 bg-background px-4"
                            >
                                {isLoadingMore ? (
                                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando mas registros...
                                    </span>
                                ) : hasMore ? (
                                    <span className="text-xs text-muted-foreground">
                                        Desplaza para cargar mas resultados.
                                    </span>
                                ) : dataLength > 0 ? (
                                    <span className="text-xs text-muted-foreground">
                                        Ya no hay mas registros por cargar.
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
