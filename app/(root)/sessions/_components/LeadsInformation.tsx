import { Card, CardContent } from "@/components/ui/card";
import { Session } from "@prisma/client";
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
        <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-border transition-shadow hover:shadow-lg">
                <CardContent className="flex items-center gap-3 px-3 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-muted/30">
                        <Database className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Total de Leads</span>
                    <span className="shrink-0 text-lg font-bold">{total}</span>
                </CardContent>
            </Card>

            <Card className="border-border transition-shadow hover:shadow-lg">
                <CardContent className="flex items-center gap-3 px-3 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-green-50">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Leads Activos</span>
                    <div className="shrink-0 text-right">
                        <span className="text-lg font-bold">{activeCount}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{activePercentage}%</span>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border transition-shadow hover:shadow-lg">
                <CardContent className="flex items-center gap-3 px-3 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-red-50">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Leads Inactivos</span>
                    <div className="shrink-0 text-right">
                        <span className="text-lg font-bold">{inactiveCount}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{100 - activePercentage}%</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}