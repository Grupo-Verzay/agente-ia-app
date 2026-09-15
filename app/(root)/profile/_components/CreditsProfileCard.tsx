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
        // Puede faltar: hay cuentas sin ficha de facturacion y sin fecha
        // guardada. Antes que un hueco sin explicar, se pinta un guion.
        renewalDate: Date | null;
        // Con llave propia de la cuenta no hay tope: el consumo lo paga ella.
        // Se decide en cada lectura comparando su key con las registradas de
        // Verzay; no hay ninguna marca guardada.
        ilimitados: boolean;
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getOwnIaCredits()
            .then(r => { if (r.success && r.data) setData(r.data); })
            .finally(() => setLoading(false));
    }, []);

    const usedPercent = data && data.total > 0 ? Math.min(100, Math.round((data.used / data.total) * 100)) : 0;
    // La fecha sale del PLAN, no de la columna de los creditos: los creditos
    // renuevan cuando renueva el plan, y tener dos columnas para lo mismo es lo
    // que hacia que esta tarjeta dijera una fecha y la de al lado otra.
    // Ver `lib/fecha-de-renovacion.ts`.
    const renewalLabel = data?.renewalDate
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
            <CardContent className="flex flex-col flex-1">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                    </div>
                ) : !data ? (
                    <p className="text-sm text-muted-foreground">Sin créditos configurados.</p>
                ) : data.ilimitados ? (
                    // Sin tope: la cuenta usa su propia llave de OpenAI y paga
                    // su consumo. Enseñar aqui un total y una barra al 0% seria
                    // enseñar un limite que no existe.
                    <div className="flex flex-col flex-1">
                        <p className="text-2xl font-semibold text-green-600">Ilimitados</p>
                        <p className="pt-1 text-xs text-muted-foreground">
                            Esta cuenta usa su propia API key de OpenAI, asi que su consumo de IA
                            no descuenta creditos.
                        </p>
                    </div>
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
                        </div>
                        <div className="flex items-center gap-2 pt-3">
                            <Progress value={usedPercent} className={`h-2 rounded flex-1 ${barColor}`} />
                            <p className="text-xs text-muted-foreground whitespace-nowrap">{usedPercent}% consumido</p>
                        </div>
                        <div className="flex justify-between text-sm mt-auto pt-3">
                            <span className="text-muted-foreground">Renovación</span>
                            <span className="font-medium">{renewalLabel}</span>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
