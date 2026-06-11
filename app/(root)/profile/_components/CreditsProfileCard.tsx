'use client';

import { useEffect, useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getOwnIaCredits } from '@/actions/actions-ia-credits';

export function CreditsProfileCard() {
    const [data, setData] = useState<{
        total: number;
        used: number;
        available: number;
        renewalDate: Date;
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getOwnIaCredits()
            .then(r => { if (r.success && r.data) setData(r.data); })
            .finally(() => setLoading(false));
    }, []);

    const usedPercent = data && data.total > 0 ? Math.min(100, Math.round((data.used / data.total) * 100)) : 0;
    const renewalLabel = data
        ? new Date(data.renewalDate).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    const barColor =
        usedPercent >= 90 ? 'bg-red-500' :
        usedPercent >= 70 ? 'bg-orange-500' :
        usedPercent >= 40 ? 'bg-yellow-500' :
        'bg-green-500';

    return (
        <Card className="border-border h-full flex flex-col">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                        <CardTitle className="text-sm font-semibold">Créditos IA</CardTitle>
                        <CardDescription className="text-xs">Consumo y renovación de créditos</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 justify-between">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                    </div>
                ) : !data ? (
                    <p className="text-sm text-muted-foreground">Sin créditos configurados.</p>
                ) : (
                    <>
                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Totales</span>
                                <span className="font-medium text-primary">{data.total.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Consumidos</span>
                                <span className="font-medium text-orange-500">{data.used.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Disponibles</span>
                                <span className={`font-medium ${data.available > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {data.available.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Renovación</span>
                                <span className="font-medium">{renewalLabel}</span>
                            </div>
                        </div>
                        <div className="space-y-1 mt-auto pt-3">
                            <Progress value={usedPercent} className={`h-2 rounded ${barColor}`} />
                            <p className="text-xs text-muted-foreground text-right">{usedPercent}% consumido</p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
