"use client";

import * as React from "react";
import type { CSSProperties } from "react";
import type { Table } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ClientRow } from "@/types/billing";
import { daysLeftService } from "../helpers";
import { Database, CircleCheck, CircleX, UserX } from "lucide-react";

type Props = {
    table: Table<ClientRow>;
    data: ClientRow[];
    className?: string;
    soonDays: number;
};

function StatCard({
    title,
    value,
    icon,
    active,
    onClick,
    color,
}: {
    title: string;
    value: number;
    icon: React.ReactNode;
    active?: boolean;
    onClick?: () => void;
    color: string;
}) {
    const w = (alpha: string) => `${color}${alpha}`;

    const cardStyle: CSSProperties = {
        borderColor: active ? w("99") : w("52"),
        backgroundColor: active ? w("22") : w("12"),
    };

    return (
        <Card
            onClick={onClick}
            className="border-2 bg-background/60 shadow-sm cursor-pointer select-none transition-opacity hover:opacity-90"
            style={cardStyle}
        >
            <CardContent className="flex items-center gap-2 px-3 py-3">
                <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
                    style={{ color, borderColor: w("5C"), backgroundColor: w("16") }}
                >
                    {icon}
                </div>
                <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: w("CC") }}>
                    {title}
                </span>
                <div className="shrink-0 text-lg font-bold leading-none" style={{ color }}>
                    {value}
                </div>
            </CardContent>
        </Card>
    );
}

export const BillingCrmFiltersCards = ({ table, data, className, soonDays }: Props) => {
    const paidFilter = table.getColumn("paid")?.getFilterValue() as string | undefined;
    const dueFilter = table.getColumn("due")?.getFilterValue() as string | undefined;

    const total = table.getPreFilteredRowModel().rows.length;

    const paidCount = React.useMemo(
        () => data.filter((u) => (u.billing?.billingStatus ?? "UNPAID") === "PAID").length,
        [data]
    );

    const unpaidCount = React.useMemo(
        () => data.filter((u) => (u.billing?.billingStatus ?? "UNPAID") === "UNPAID").length,
        [data]
    );

    const dueSoonCount = React.useMemo(() => {
        return data.filter((u) => {
            const due = u.billing?.dueDate ?? null;
            const left = parseInt(daysLeftService(due));
            return Number.isFinite(left) && left >= 0 && left <= soonDays;
        }).length;
    }, [data, soonDays]);

    function clearAllQuickFilters() {
        table.resetColumnFilters();
    }

    function setExclusiveFilter(colId: "paid" | "due", value: string) {
        const col = table.getColumn(colId);
        if (!col) return;

        const curr = col.getFilterValue() as string | undefined;

        // Si ya está activo, se apaga y queda "Total"
        if (curr === value) {
            table.resetColumnFilters();
            return;
        }

        // Limpia TODOS los filtros de columna y aplica solo este
        table.resetColumnFilters();
        col.setFilterValue(value);
    }

    const anyQuickFilterActive = !!paidFilter || !!dueFilter;

    return (
        <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)}>
            <StatCard
                title="Total"
                value={total}
                icon={<Database className="h-4 w-4" />}
                active={!anyQuickFilterActive}
                onClick={clearAllQuickFilters}
                color="#3B82F6"
            />

            <StatCard
                title="Pagaron"
                value={paidCount}
                icon={<CircleCheck className="h-4 w-4" />}
                active={paidFilter === "PAID"}
                onClick={() => setExclusiveFilter("paid", "PAID")}
                color="#22C55E"
            />

            <StatCard
                title="No pagaron"
                value={unpaidCount}
                icon={<CircleX className="h-4 w-4" />}
                active={paidFilter === "UNPAID"}
                onClick={() => setExclusiveFilter("paid", "UNPAID")}
                color="#EF4444"
            />

            <StatCard
                title={`Vence pronto (≤ ${soonDays}d)`}
                value={dueSoonCount}
                icon={<UserX className="h-4 w-4" />}
                active={dueFilter === "SOON"}
                onClick={() => setExclusiveFilter("due", "SOON")}
                color="#EAB308"
            />
        </div>
    );
}