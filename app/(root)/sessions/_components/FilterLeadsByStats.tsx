import { CheckCircle2, Database, XCircle, Bot } from "lucide-react";
import { PastillasDeMetricas, type Metrica } from "@/components/shared/PastillasDeMetricas";

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

/**
 * Las cifras de Leads, en la barra y no en tarjetas arriba.
 *
 * Este componente ya era el único sitio donde se pintaban —lo comparten
 * `/sessions` y el CRM—, así que lo que cambia es la forma: cuatro `MetricCard`
 * a todo lo ancho pasan a cuatro pastillas.
 *
 * Y las cuatro **filtran**, que es lo que ya hacían: el `div` de cada tarjeta
 * llevaba un `onClick` suelto. Eso era un `div` pulsable sin rol ni teclado;
 * ahora son `<button>` de verdad, con su estado puesto cuando el filtro está
 * activo — que antes no se veía por ninguna parte.
 */
export const FilterLeadsByStats = ({
    stats,
    filter,
    onChangeFilter,
}: FilterLeadsByStatsProps) => {
    const metricas: Metrica[] = [
        {
            clave: "all",
            icono: <Database />,
            etiqueta: "Total",
            valor: stats?.total ?? 0,
            color: "#3B82F6",
        },
        {
            clave: "activeSession",
            icono: <CheckCircle2 />,
            etiqueta: "Clientes activos",
            valor: stats?.activeSession ?? 0,
            color: "#22C55E",
        },
        {
            clave: "inactiveSession",
            icono: <XCircle />,
            etiqueta: "Clientes inactivos",
            valor: stats?.inactiveSession ?? 0,
            color: "#EF4444",
        },
        {
            clave: "activeAgent",
            icono: <Bot />,
            etiqueta: "Agente activo",
            valor: stats?.activeAgent ?? 0,
            color: "#22C55E",
        },
    ].map((m) => ({
        ...m,
        // Volver a pulsar el filtro puesto lo quita, y «Total» es quitarlo:
        // un filtro que solo se pone obliga a buscar dónde se apaga.
        alPulsar: () =>
            onChangeFilter(
                m.clave === "all" || filter === m.clave ? "all" : (m.clave as FilterSessionTypes),
            ),
        activa: m.clave === "all" ? filter === "all" : filter === m.clave,
    }));

    return <PastillasDeMetricas metricas={metricas} />;
};
