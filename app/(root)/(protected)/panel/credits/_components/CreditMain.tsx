'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
    createIaCreditForUser,
    getIaCreditByUser,
    rechargeIaCredit,
} from '@/actions/actions-ia-credits';
import { onCreditsToTokens, onTokensToCredits } from '@/utils/onTokensToCredits';
import { MetricCard } from '@/components/custom/MetricCard';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Coins, TrendingDown, Wallet } from 'lucide-react';

interface Props {
    userId: string;
}

export const CreditMain = ({ userId }: Props) => {
    const [total, setTotal] = useState<number>(0);
    const [used, setUsed] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasCredits, setHasCredits] = useState<boolean>(false);

    useEffect(() => {
        const fetchCredits = async () => {
            try {
                setLoading(true);
                const res = await getIaCreditByUser(userId);

                if (res.success && res.data?.length) {
                    const credit = res.data[0];
                    const creditUsed = onTokensToCredits(credit.used);
                    setTotal(credit.total);
                    setUsed(creditUsed);
                    setHasCredits(true);
                } else {
                    setHasCredits(false);
                    toast.error(res.message || 'No se encontraron créditos configurados.');
                }
            } catch (err) {
                toast.error('Error al obtener los créditos.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchCredits();
    }, [userId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const renewalDate = new Date();
            const tokensUsed = onCreditsToTokens(used);

            const res = hasCredits
                ? await rechargeIaCredit(userId, total, renewalDate, tokensUsed)
                : await createIaCreditForUser(userId, total, renewalDate, tokensUsed);

            if (res.success) {
                toast.success(hasCredits ? 'Créditos actualizados correctamente' : 'Créditos creados correctamente');
                setHasCredits(true);
            } else {
                toast.error(res.message || 'Error al guardar créditos');
            }
        } catch (err) {
            toast.error('Error inesperado al guardar créditos');
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const available = Math.max(0, total - used);
    const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;

    return (
        <TooltipProvider delayDuration={120}>
        <div className="flex h-full min-w-0 flex-col gap-2">
            {/* MetricCards */}
            {!loading && (
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1">
                        <MetricCard
                            icon={<Coins className="h-4 w-4" />}
                            label="Total créditos"
                            value={total.toLocaleString()}
                            helper="Créditos asignados en total"
                            color="#3B82F6"
                        />
                    </div>
                    <div className="flex-1">
                        <MetricCard
                            icon={<TrendingDown className="h-4 w-4" />}
                            label="Consumidos"
                            value={used.toLocaleString()}
                            helper={`${usagePercent}% del total utilizado`}
                            color="#EF4444"
                        />
                    </div>
                    <div className="flex-1">
                        <MetricCard
                            icon={<Wallet className="h-4 w-4" />}
                            label="Disponibles"
                            value={available.toLocaleString()}
                            helper="Créditos restantes para usar"
                            color="#22C55E"
                        />
                    </div>
                </div>
            )}

            {/* Formulario */}
            <Card className="border-border shadow-sm max-w-md">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Configurar créditos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Cargando créditos...</p>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Créditos totales</label>
                                <Input
                                    type="number"
                                    value={total}
                                    onChange={(e) => setTotal(parseInt(e.target.value))}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Créditos consumidos</label>
                                <Input
                                    type="number"
                                    value={used}
                                    onChange={(e) => setUsed(parseInt(e.target.value))}
                                />
                            </div>
                            <div className="pt-2">
                                <Button disabled={saving} onClick={handleSave}>
                                    {saving ? 'Guardando...' : hasCredits ? 'Actualizar créditos' : 'Crear créditos'}
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
        </TooltipProvider>
    );
};
