import { CheckCircle2, Database, XCircle, Bot } from "lucide-react";
import { MetricCard } from "@/components/custom/MetricCard";

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

    return (
        <>
            <div onClick={() => onChangeFilter("all")} className="flex-1 cursor-pointer">
                <MetricCard
                    icon={<Database className="h-4 w-4" />}
                    label="Total"
                    value={total}
                    color="#3b82f6"
                />
            </div>
            <div onClick={() => onChangeFilter("activeSession")} className="flex-1 cursor-pointer">
                <MetricCard
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Clientes Activos"
                    value={activeSession}
                    color="#22c55e"
                />
            </div>
            <div onClick={() => onChangeFilter("inactiveSession")} className="flex-1 cursor-pointer">
                <MetricCard
                    icon={<XCircle className="h-4 w-4" />}
                    label="Clientes Inactivos"
                    value={inactiveSession}
                    color="#ef4444"
                />
            </div>
            <div onClick={() => onChangeFilter("activeAgent")} className="flex-1 cursor-pointer">
                <MetricCard
                    icon={<Bot className="h-4 w-4" />}
                    label="Agente Activo"
                    value={activeAgent}
                    color="#22c55e"
                />
            </div>
        </>
    );
};
