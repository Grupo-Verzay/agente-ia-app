import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Session } from "@prisma/client";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Database } from "lucide-react";

interface propsLeadsInformation {
    data: Session[]
}

export const LeadsInformation = ({ data }: propsLeadsInformation) => {
    const total = data.length;
    const activeCount = data.filter(item => item.status).length;
    const inactiveCount = total - activeCount;
    const activePercentage = total > 0 ? Math.round((activeCount / total) * 100) : 0;

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {/* Tarjeta de Total */}
            <Card className="hover:shadow-lg transition-shadow border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total de Leads
                    </CardTitle>
                    <Database className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{total}</div>
                    <p className="text-xs text-muted-foreground">Leads en total</p>
                </CardContent>
            </Card>

            {/* Tarjeta de Activos */}
            <Card className="hover:shadow-lg transition-shadow border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Leads Activos
                    </CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{activeCount}</div>
                    <p className="text-xs text-muted-foreground">
                        {activePercentage}% del total
                    </p>
                    <Progress value={activePercentage} className="h-2 mt-2" />
                </CardContent>
            </Card>

            {/* Tarjeta de Inactivos */}
            <Card className="hover:shadow-lg transition-shadow border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Leads Inactivos
                    </CardTitle>
                    <XCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{inactiveCount}</div>
                    <p className="text-xs text-muted-foreground">
                        {100 - activePercentage}% del total
                    </p>
                    <Progress value={100 - activePercentage} className="h-2 mt-2" />
                </CardContent>
            </Card>
        </div>
    );
}