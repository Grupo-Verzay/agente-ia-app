import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Database, XCircle, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SessionStatsInterface {
    total: number;
    activeSession: number;
    inactiveSession: number;
    activeAgent: number;
    inactiveAgent: number;
}

export type FilterSessionTypes =
    | "all"
    | "activeSession"
    | "inactiveSession"
    | "activeAgent"
    | "inactiveAgent";

export interface FilterLeadsByStatsProps {
    stats: SessionStatsInterface | null;
    filter: FilterSessionTypes;
    onChangeFilter: (value: FilterSessionTypes) => void;
}

export const FilterLeadsByStats = ({
    stats,
    filter,
    onChangeFilter,
}: FilterLeadsByStatsProps) => {
    const total = stats?.total ?? 0;
    const activeSession = stats?.activeSession ?? 0;
    const inactiveSession = stats?.inactiveSession ?? 0;
    const activeAgent = stats?.activeAgent ?? 0;
    const inactiveAgent = stats?.inactiveAgent ?? 0;

    const cardStats = [
        {
            key: "all" as const,
            title: "Total",
            icon: <Database className="h-4 w-4 text-blue-500" />,
            value: total,
            color: "text-blue-600",
            bg: "bg-blue-50/60 border-blue-200",
            clickable: true,
            onClick: () => onChangeFilter("all"),
            isActive: filter === "all",
        },
        {
            key: "activeSession" as const,
            title: "Clientes Activos",
            icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
            value: activeSession,
            color: "text-green-600",
            bg: "bg-green-50/60 border-green-200",
            clickable: true,
            onClick: () => onChangeFilter("activeSession"),
            isActive: filter === "activeSession",
        },
        {
            key: "inactiveSession" as const,
            title: "Clientes Inactivos",
            icon: <XCircle className="h-4 w-4 text-red-500" />,
            value: inactiveSession,
            color: "text-red-600",
            bg: "bg-red-50/60 border-red-200",
            clickable: true,
            onClick: () => onChangeFilter("inactiveSession"),
            isActive: filter === "inactiveSession",
        },
        {
            key: "activeAgent" as const,
            title: "Agente Activo",
            icon: <Bot className="h-4 w-4 text-green-500" />,
            value: activeAgent,
            color: "text-green-600",
            bg: "bg-green-50/60 border-green-200",
            clickable: true,
            onClick: () => onChangeFilter("activeAgent"),
            isActive: filter === "activeAgent",
        },
        {
            key: "inactiveAgent" as const,
            title: "Agente Inactivo",
            icon: <Bot className="h-4 w-4 text-red-500" />,
            value: inactiveAgent,
            color: "text-red-600",
            bg: "bg-red-50/60 border-red-200",
            clickable: true,
            onClick: () => onChangeFilter("inactiveAgent"),
            isActive: filter === "inactiveAgent",
        },
    ] as const;

    return (
        <>
            {cardStats.map((card, idx) => {
                const isActive = card.isActive;
                const isClickable = card.clickable;

                return (
                    <Card
                        key={idx}
                        onClick={isClickable ? card.onClick : undefined}
                        className={cn(
                            "flex-1 transition-all duration-300 ease-in-out border rounded-xl hover:shadow-md hover:-translate-y-[2px]",
                            isClickable ? "cursor-pointer" : "cursor-default opacity-95",
                            isActive ? "ring-2 ring-primary" : card.bg
                        )}
                    >
                        <CardContent className="flex items-center gap-2 px-3 py-3">
                            <div className="hidden sm:block shrink-0">{card.icon}</div>
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                                {card.title}
                            </span>
                            <div className={cn("shrink-0 text-lg font-bold", card.color)}>
                                {card.value}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </>
    );
};