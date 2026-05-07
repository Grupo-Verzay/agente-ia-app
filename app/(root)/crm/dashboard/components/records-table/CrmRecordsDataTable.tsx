"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

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
import { cn } from "@/lib/utils";
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

    const STICKY_COLS: Record<string, { right: number; width: number }> = {
        actions:     { right: 0,   width: 48  },
        estado:      { right: 48,  width: 116 },
        crmFollowUp: { right: 164, width: 40  },
        leadStatus:  { right: 204, width: 120 },
    };

    const getStickyStyle = (id: string, zIndex: number): CSSProperties | undefined => {
        const col = STICKY_COLS[id];
        if (!col) return undefined;
        return {
            position: "sticky",
            right: col.right,
            width: col.width,
            minWidth: col.width,
            boxSizing: "border-box",
            zIndex,
        };
    };

    useEffect(() => {
        onScrollRootReady(scrollContainerRef.current);

        return () => {
            onScrollRootReady(null);
        };
    }, [activeTab, dataLength, onScrollRootReady]);

    const visibleColumnCount = table.getVisibleFlatColumns().length;

    return (
        <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-auto bg-background"
        >
                        <div className="min-w-max">
                            <table className="w-full border-separate border-spacing-0 text-sm">
                                <TableHeader>
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <TableRow
                                            key={headerGroup.id}
                                            className="border-border/70 bg-background hover:bg-background"
                                        >
                                            {headerGroup.headers.map((header) => (
                                                <TableHead
                                                    key={header.id}
                                                    style={getStickyStyle(header.id, 30)}
                                                    className={cn(
                                                        "sticky top-0 z-20 h-9 whitespace-nowrap border-b border-border/70 bg-background/95 shadow-[0_1px_0_0_hsl(var(--border)/0.7)] backdrop-blur supports-[backdrop-filter]:bg-background/85",
                                                        ["whatsapp", "fecha", "crmFollowUp"].includes(header.id)
                                                            ? "px-1"
                                                            : "px-2",
                                                    )}
                                                >
                                                    <div className="flex items-center justify-center">
                                                        {header.isPlaceholder
                                                            ? null
                                                            : flexRender(
                                                                  header.column.columnDef.header,
                                                                  header.getContext()
                                                              )}
                                                    </div>
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
                                                        style={getStickyStyle(cell.column.id, 10)}
                                                        className={cn(
                                                            "align-middle py-2 bg-background border-b border-border/60",
                                                            ["whatsapp", "fecha", "crmFollowUp"].includes(cell.column.id)
                                                                ? "px-1"
                                                                : "px-2",
                                                        )}
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
                                className="flex h-12 w-full items-center justify-center bg-background px-4"
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
    );
}
