'use client';

import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
    createIaCreditForUser,
    getAllPlanConfigs,
    getIaCreditByUser,
    rechargeIaCredit,
    updatePlanConfigAction,
    type PlanConfigItem,
} from '@/actions/actions-ia-credits';
import { onCreditsToTokens, onTokensToCredits } from '@/utils/onTokensToCredits';
import { MetricCard } from '@/components/custom/MetricCard';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Coins, TrendingDown, Wallet, Gauge, Settings } from 'lucide-react';
import { PLAN_LABELS } from '@/types/plans';
import { Plan } from '@prisma/client';

interface Props {
    userId?: string;
}

export const CreditMain = ({ userId }: Props) => {
    // ── Plan Config State ────────────────────────────────────────────
    const [planConfigs, setPlanConfigs] = useState<PlanConfigItem[]>([]);
    const [planConfigLoading, setPlanConfigLoading] = useState(true);
    const [savingPlan, setSavingPlan] = useState<Plan | null>(null);
    const [editValues, setEditValues] = useState<Record<Plan, number>>({} as Record<Plan, number>);

    // ── Per-user State ───────────────────────────────────────────────
    const [total, setTotal] = useState<number>(0);
    const [used, setUsed] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [hasCredits, setHasCredits] = useState<boolean>(false);

    // ── Load Plan Configs ────────────────────────────────────────────
    const fetchPlanConfigs = useCallback(async () => {
        setPlanConfigLoading(true);
        const res = await getAllPlanConfigs();
        if (res.success && res.data) {
            setPlanConfigs(res.data);
            const vals = {} as Record<Plan, number>;
            res.data.forEach(({ plan, credits }) => { vals[plan] = credits; });
            setEditValues(vals);
        }
        setPlanConfigLoading(false);
    }, []);

    useEffect(() => { void fetchPlanConfigs(); }, [fetchPlanConfigs]);

    // ── Load User Credits ────────────────────────────────────────────
    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        getIaCreditByUser(userId).then(res => {
            if (res.success && res.data?.length) {
                const credit = res.data[0];
                setTotal(credit.total);
                setUsed(onTokensToCredits(credit.used));
                setHasCredits(true);
            } else {
                setHasCredits(false);
            }
            setLoading(false);
        });
    }, [userId]);

    // ── Handlers ─────────────────────────────────────────────────────
    const handleSavePlanConfig = async (plan: Plan) => {
        setSavingPlan(plan);
        const res = await updatePlanConfigAction(plan, editValues[plan] ?? 0);
        if (res.success) {
            toast.success(res.message);
            void fetchPlanConfigs();
        } else {
            toast.error(res.message);
        }
        setSavingPlan(null);
    };

    const handleSaveUserCredits = async () => {
        if (!userId) return;
        setSaving(true);
        const renewalDate = new Date();
        const tokensUsed = onCreditsToTokens(used);

        const res = hasCredits
            ? await rechargeIaCredit(userId, total, renewalDate, tokensUsed)
            : await createIaCreditForUser(userId, total, renewalDate, tokensUsed);

        if (res.success) {
            toast.success(hasCredits ? 'Créditos actualizados' : 'Créditos creados');
            setHasCredits(true);
        } else {
            toast.error(res.message || 'Error al guardar créditos');
        }
        setSaving(false);
    };

    const available = Math.max(0, total - used);
    const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;

    return (
        <TooltipProvider delayDuration={120}>
        <div className="flex h-full min-w-0 w-full flex-col gap-4">

            {/* ── Tabla de planes ────────────────────────────────── */}
            <Card className="border-border shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-base">Créditos por plan</CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Estos son los créditos que se asignan automáticamente al cambiar el plan de un usuario.
                        El plan <strong>Personalizado</strong> no se auto-sincroniza (asignación manual).
                    </p>
                </CardHeader>
                <CardContent>
                    {planConfigLoading ? (
                        <p className="text-sm text-muted-foreground">Cargando planes...</p>
                    ) : (
                        <div className="space-y-2">
                            {planConfigs.map(({ plan }) => (
                                <div key={plan} className="flex items-center gap-3">
                                    <span className="w-32 text-sm font-medium shrink-0">
                                        {PLAN_LABELS[plan as Plan]}
                                    </span>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={editValues[plan as Plan] ?? 0}
                                        onChange={(e) =>
                                            setEditValues(prev => ({
                                                ...prev,
                                                [plan]: parseInt(e.target.value) || 0,
                                            }))
                                        }
                                        className="w-32"
                                        disabled={savingPlan === plan}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={savingPlan === plan}
                                        onClick={() => handleSavePlanConfig(plan as Plan)}
                                    >
                                        {savingPlan === plan ? 'Guardando...' : 'Guardar'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Override por usuario ────────────────────────────── */}
            {userId && (
                <>
                    {!loading && (
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                            <div className="min-w-0 sm:flex-1">
                                <MetricCard
                                    icon={<Coins className="h-4 w-4" />}
                                    label="Total créditos"
                                    value={total.toLocaleString()}
                                    helper="Créditos asignados en total"
                                    color="#3B82F6"
                                />
                            </div>
                            <div className="min-w-0 sm:flex-1">
                                <MetricCard
                                    icon={<TrendingDown className="h-4 w-4" />}
                                    label="Consumidos"
                                    value={used.toLocaleString()}
                                    helper={`${usagePercent}% del total utilizado`}
                                    color="#EF4444"
                                />
                            </div>
                            <div className="min-w-0 sm:flex-1">
                                <MetricCard
                                    icon={<Wallet className="h-4 w-4" />}
                                    label="Disponibles"
                                    value={available.toLocaleString()}
                                    helper="Créditos restantes para usar"
                                    color="#22C55E"
                                />
                            </div>
                            <div className="min-w-0 sm:flex-1">
                                <MetricCard
                                    icon={<Gauge className="h-4 w-4" />}
                                    label="% Uso"
                                    value={`${usagePercent}%`}
                                    helper="Porcentaje del total consumido"
                                    color="#F59E0B"
                                />
                            </div>
                        </div>
                    )}

                    <Card className="border-border shadow-sm max-w-md">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Override de créditos (usuario)</CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Ajusta manualmente los créditos de este usuario. Usa esto para planes
                                Personalizados o acuerdos especiales.
                            </p>
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
                                            onChange={(e) => setTotal(parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium">Créditos consumidos</label>
                                        <Input
                                            type="number"
                                            value={used}
                                            onChange={(e) => setUsed(parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="pt-2">
                                        <Button disabled={saving} onClick={handleSaveUserCredits}>
                                            {saving ? 'Guardando...' : hasCredits ? 'Actualizar créditos' : 'Crear créditos'}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
        </TooltipProvider>
    );
};
