"use client";

import * as React from "react";
import type { Table } from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ClientRow } from "@/types/billing";
import { daysLeftService } from "../helpers";
import { Database, CircleCheck, CircleX, UserCheck, UserX } from "lucide-react";

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
    activeClassName,
    valueClassName,
    bgClassName,
}: {
    title: string;
    value: number;
    icon: React.ReactNode;
    active?: boolean;
    onClick?: () => void;
    activeClassName?: string;
    valueClassName?: string;
    bgClassName?: string;
}) {
    return (
        <Card
            onClick={onClick}
            className={cn(
                "cursor-pointer select-none backdrop-blur transition-colors hover:opacity-90",
                "rounded-xl px-3 py-3 flex items-center gap-3",
                active ? (activeClassName ?? "ring-2 ring-primary") : (bgClassName ?? "border-border bg-background/40")
            )}
        >
            <div className="text-muted-foreground shrink-0">{icon}</div>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{title}</span>
            <div className={cn("shrink-0 text-lg font-semibold", valueClassName)}>{value}</div>
        </Card>
    );
}

export const BillingCrmFiltersCards = ({ table, data, className, soonDays }: Props) => {
    const paidFilter = table.getColumn("paid")?.getFilterValue() as string | undefined;
    const accessFilter = table.getColumn("access")?.getFilterValue() as string | undefined;
    const dueFilter = table.getColumn("due")?.getFilterValue() as string | undefined;

    const total = table.getPreFilteredRowModel().rows.length;

    const paidCount = React.useMemo(
        () => data.filter((u) => (u.billing?.billingStatus ?? "UNPAID") === "PAID").length,
        [data]
    );

    const unpaidCount = React.useMemo(
        () => data.filter((u) => (u.billing?.billingStatus ?? "UNPAID") !== "PAID").length,
        [data]
    );

    const accessActiveCount = React.useMemo(
        () => data.filter((u) => (u.billing?.accessStatus ?? "ACTIVE") === "ACTIVE").length,
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
        table.getColumn("paid")?.setFilterValue(undefined);
        table.getColumn("access")?.setFilterValue(undefined);
        table.getColumn("due")?.setFilterValue(undefined);
    }

    function setExclusiveFilter(colId: "paid" | "access" | "due", value: string) {
        const col = table.getColumn(colId);
        if (!col) return;

        const curr = col.getFilterValue() as string | undefined;

        // Si ya está activo, se apaga y queda "Total"
        if (curr === value) {
            clearAllQuickFilters();
            return;
        }

        // Si no, limpiamos todo y activamos solo este
        clearAllQuickFilters();
        col.setFilterValue(value);
    }

    const anyQuickFilterActive = !!paidFilter || !!accessFilter || !!dueFilter;

    return (
        <div className={cn("grid grid-cols-1 md:grid-cols-5 gap-3", className)}>
            <StatCard
                title="Total"
                value={total}
                icon={<Database className="h-4 w-4" />}
                active={!anyQuickFilterActive}
                onClick={clearAllQuickFilters}
                bgClassName="bg-blue-50/60 border-blue-200"
                valueClassName="text-blue-600"
            />

            <StatCard
                title="Pagaron"
                value={paidCount}
                icon={<CircleCheck className="h-4 w-4" />}
                active={paidFilter === "PAID"}
                onClick={() => setExclusiveFilter("paid", "PAID")}
                valueClassName="text-emerald-600"
                activeClassName="ring-1 ring-emerald-500/60"
                bgClassName="bg-emerald-50/60 border-emerald-200"
            />

            <StatCard
                title="No pagaron"
                value={unpaidCount}
                icon={<CircleX className="h-4 w-4" />}
                active={paidFilter === "UNPAID"}
                onClick={() => setExclusiveFilter("paid", "UNPAID")}
                valueClassName="text-red-600"
                activeClassName="ring-1 ring-red-500/60"
                bgClassName="bg-red-50/60 border-red-200"
            />

            <StatCard
                title="Servicio activo"
                value={accessActiveCount}
                icon={<UserCheck className="h-4 w-4" />}
                active={accessFilter === "ACTIVE"}
                onClick={() => setExclusiveFilter("access", "ACTIVE")}
                valueClassName="text-emerald-600"
                activeClassName="ring-1 ring-emerald-500/60"
                bgClassName="bg-emerald-50/60 border-emerald-200"
            />

            <StatCard
                title={`Vence pronto (≤ ${soonDays}d)`}
                value={dueSoonCount}
                icon={<UserX className="h-4 w-4" />}
                active={dueFilter === "SOON"}
                onClick={() => setExclusiveFilter("due", "SOON")}
                valueClassName={dueSoonCount > 0 ? "text-yellow-600" : "text-muted-foreground"}
                activeClassName="ring-1 ring-yellow-500/60"
                bgClassName="bg-yellow-50/60 border-yellow-200"
            />
        </div>
    );
}