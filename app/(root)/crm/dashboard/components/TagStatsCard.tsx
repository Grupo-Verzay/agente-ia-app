// app/(dashboard)/crm/dashboard/components/TagStatsCard.tsx
"use client";

import useSWR from "swr";
import { getSessionTagStatsByUserId } from "@/actions/registro-action";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    FunnelChart,
    RelationBarChart,
    TagDonutChart,
} from "../helpers/TagCharts";

const fetcher = async (_: string, userId: string) => {
    const res = await getSessionTagStatsByUserId(userId);
    if (!res.success) throw new Error(res.message || "Error cargando stats");
    return res.data;
};

export function TagStatsCard({ userId }: { userId: string }) {
    const { data, error, isLoading } = useSWR(
        ["session-tag-stats", userId],
        ([key, uid]) => fetcher(key, uid)
    );

    if (isLoading) {
        return (
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>Embudo por Tags</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">Cargando...</p>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>Embudo por Tags</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-destructive">
                        {(error as Error).message}
                    </p>
                </CardContent>
            </Card>
        );
    }

    const stats = data || [];

    if (!stats.length) {
        return (
            <Card className="h-full">
                <CardHeader>
                    <CardTitle>Embudo por Tags</CardTitle>
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
        <div className="space-y-6">
            {/* Arriba: Funnel + Donut */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="w-full">
                    <RelationBarChart stats={stats} />

                </div>
                <div className="w-full">
                    <FunnelChart stats={stats} />
                </div>
            </div>

            {/* Abajo: barra de relación a todo el ancho */}
            <div className="w-full">
                <TagDonutChart stats={stats} />
            </div>
        </div>
    );
}
