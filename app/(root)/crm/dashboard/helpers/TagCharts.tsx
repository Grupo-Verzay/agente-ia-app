
// app/(dashboard)/crm/dashboard/components/TagCharts.tsx
"use client";

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
} from "@/components/ui/card";

export type TagStat = {
    tagId: number;
    name: string;
    slug: string;
    color?: string | null;
    count: number;
};

const FUNNEL_ORDER = [
    "Contactado",
    "Interesado",
    "Calificado",
    "Propuesta enviada",
    "En negociación",
    "Cierre ganado",
    "Cierre perdido",
    "Descartado",
];

const RELATION_ORDER = ["Lead", "Prospecto", "Cliente"];

// Paleta simple para el donut (puedes cambiarla)
const DEFAULT_COLORS = [
    "#0f766e",
    "#2563eb",
    "#7c3aed",
    "#db2777",
    "#f97316",
    "#22c55e",
    "#eab308",
    "#ef4444",
    "#14b8a6",
    "#4b5563",
];

// 1) Data para el funnel
function buildFunnelData(stats: TagStat[]) {
    return FUNNEL_ORDER.map((stage) => {
        const item = stats.find((t) => t.name === stage);
        return {
            stage,
            count: item?.count ?? 0,
        };
    }).filter((d) => d.count > 0);
}

// 2) Data para Lead / Prospecto / Cliente
function buildRelationData(stats: TagStat[]) {
    return RELATION_ORDER.map((segment) => {
        const item = stats.find((t) => t.name === segment);
        return {
            segment,
            count: item?.count ?? 0,
        };
    }).filter((d) => d.count > 0);
}

// 3) Data para el donut (simplemente todos los tags con count > 0)
function buildDonutData(stats: TagStat[]) {
    return stats.filter((t) => t.count > 0);
}


type FunnelChartProps = {
    stats: TagStat[];
};

export function FunnelChart({ stats }: FunnelChartProps) {
    const data = buildFunnelData(stats);

    if (!data.length) {
        return (
            <Card className="border-border">
                <CardHeader>
                    <CardTitle>Embudo de ventas</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">
                        Aún no hay datos de etapas del funnel.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        // <Card className="border-border">
        //     <CardHeader>
        //         <CardTitle>Embudo de ventas</CardTitle>
        //     </CardHeader>
        //     <CardContent className="h-64">
        //         <ResponsiveContainer width="100%" height="100%">
        //             <BarChart
        //                 data={data}
        //                 layout="vertical"
        //                 margin={{ top: 8, right: 16, bottom: 8, left: 80 }}
        //             >
        //                 <XAxis type="number" allowDecimals={false} />
        //                 <YAxis
        //                     type="category"
        //                     dataKey="stage"
        //                     tick={{ fontSize: 11 }}
        //                     width={120}
        //                 />
        //                 <Tooltip
        //                     formatter={(value) => [`${value} contactos`, "Cantidad"]}
        //                 />
        //                 <Bar
        //                     dataKey="count"
        //                     radius={[0, 8, 8, 0]}
        //                     fill="hsl(var(--primary))"
        //                 />
        //             </BarChart>
        //         </ResponsiveContainer>
        //     </CardContent>
        // </Card>
        <></>
    );
}


type TagDonutChartProps = {
    stats: TagStat[];
};

export function TagDonutChart({ stats }: TagDonutChartProps) {
    const data = buildDonutData(stats);

    if (!data.length) {
        return (
            <Card className="border-border">

                <CardHeader>
                    <CardTitle>Distribución por etiquetas</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">
                        Aún no hay sesiones etiquetadas.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border">
            <CardHeader>
                <CardTitle>Distribución por etiquetas</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                        // label={(entry) =>
                        //     `${entry.name} (${entry.count})`
                        // }
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${entry.tagId}`}
                                    fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value, _name, props) => {
                                const p = props as any;
                                return [`${value} contactos`, p.payload?.name || "Etiqueta"];
                            }}
                        />
                        <Legend
                            layout="horizontal"
                            verticalAlign="bottom"
                            align="center"
                            wrapperStyle={{ fontSize: 11 }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}


type RelationBarChartProps = {
    stats: TagStat[];
};

export function RelationBarChart({ stats }: RelationBarChartProps) {
    const data = buildRelationData(stats);

    if (!data.length) {
        return (
            // <Card className="border-border">
            //     <CardHeader>
            //         <CardTitle>Madurez de contactos</CardTitle>
            //     </CardHeader>
            //     <CardContent>
            //         <p className="text-xs text-muted-foreground">
            //             No hay datos de Lead / Prospecto / Cliente.
            //         </p>
            //     </CardContent>
            // </Card>
            <></>
        );
    }

    return (
        <Card className="border-border">
            <CardHeader>
                <CardTitle>Madurez de contactos</CardTitle>
            </CardHeader>
            <CardContent className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 8, right: 16, bottom: 16, left: 0 }}
                    >
                        <XAxis
                            dataKey="segment"
                            tick={{ fontSize: 11 }}
                        />
                        <YAxis allowDecimals={false} />
                        <Tooltip
                            formatter={(value) => [`${value} contactos`, "Cantidad"]}
                        />
                        <Bar
                            dataKey="count"
                            radius={[4, 4, 0, 0]}
                            fill="hsl(var(--primary))"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
