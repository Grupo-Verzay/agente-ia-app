import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
            icon: <Database className="h-4 w-4 text-gray-500" />,
            value: total,
            description: "Leads en total",
            color: "",
            progress: null as number | null,
            clickable: true,
            onClick: () => onChangeFilter("all"),
            isActive: filter === "all",
        },
        {
            key: "activeSession" as const,
            title: "Clientes Activos",
            icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
            value: activeSession,
            description: total
                ? `${Math.round((activeSession / total) * 100)}% del total`
                : "0% del total",
            color: "text-green-600",
            progress: total ? (activeSession / total) * 100 : 0,
            clickable: true,
            onClick: () => onChangeFilter("activeSession"),
            isActive: filter === "activeSession",
        },
        {
            key: "inactiveSession" as const,
            title: "Clientes Inactivos",
            icon: <XCircle className="h-4 w-4 text-red-500" />,
            value: inactiveSession,
            description: total
                ? `${Math.round((inactiveSession / total) * 100)}% del total`
                : "0% del total",
            color: "text-red-600",
            progress: total ? (inactiveSession / total) * 100 : 0,
            clickable: true,
            onClick: () => onChangeFilter("inactiveSession"),
            isActive: filter === "inactiveSession",
        },
        {
            key: "activeAgent" as const,
            title: "Agente Activo",
            icon: <Bot className="h-4 w-4 text-green-500" />,
            value: activeAgent,
            description: total
                ? `${Math.round((activeAgent / total) * 100)}% del total`
                : "0% del total",
            color: "text-green-600",
            progress: total ? (activeAgent / total) * 100 : 0,
            clickable: true,
            onClick: () => onChangeFilter("activeAgent"),
            isActive: filter === "activeAgent",
        },
        {
            key: "inactiveAgent" as const,
            title: "Agente Inactivo",
            icon: <Bot className="h-4 w-4 text-red-500" />,
            value: inactiveAgent,
            description: total
                ? `${Math.round((inactiveAgent / total) * 100)}% del total`
                : "0% del total",
            color: "text-red-600",
            progress: total ? (inactiveAgent / total) * 100 : 0,
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
                            "flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out border rounded-xl hover:shadow-md hover:-translate-y-[2px]",
                            isClickable ? "cursor-pointer" : "cursor-default opacity-95",
                            isActive
                                ? "border-primary ring-primary bg-muted/20"
                                : "border-border"
                        )}
                    >
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-xs flex-row sm:text-sm font-medium text-muted-foreground">
                                <div className={cn("text-lg font-bold", card.color)}>
                                    {card.value}
                                </div>
                                {card.title}
                            </CardTitle>
                            <div className="hidden sm:block">{card.icon}</div>
                        </CardHeader>
                    </Card>
                );
            })}
        </>
    );
};