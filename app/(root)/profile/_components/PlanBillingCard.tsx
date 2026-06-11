'use client';

import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, AlertCircle, Loader2, ArrowUpCircle, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getOwnBillingAction } from '@/actions/billing/billing-actions';
import { PLAN_LABELS } from '@/types/plans';
import type { Plan } from '@prisma/client';

interface Props {
    userPlan: Plan;
}

function fmt(date: string | null | undefined) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtPrice(price: string | number | null | undefined, currency: string | null | undefined) {
    if (!price || Number(price) === 0) return '—';
    return new Intl.NumberFormat('es', { style: 'currency', currency: currency || 'COP', maximumFractionDigits: 0 }).format(Number(price));
}

export function PlanBillingCard({ userPlan }: Props) {
    const [billing, setBilling] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getOwnBillingAction()
            .then(r => { if (r.success) setBilling(r.data); })
            .finally(() => setLoading(false));
    }, []);

    const planLabel = PLAN_LABELS[userPlan] ?? userPlan;
    const isPaid = billing?.billingStatus === 'PAID';
    const isActive = billing?.accessStatus === 'ACTIVE';

    return (
        <>
            {/* Card: Plan actual */}
            <Card className="border-border h-full flex flex-col">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <CreditCard className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                            <CardTitle className="text-sm font-semibold">Plan actual</CardTitle>
                            <CardDescription className="text-xs">Tu suscripción y estado del servicio</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 justify-between space-y-3">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xl font-bold">{planLabel}</span>
                                {billing && (
                                    <Badge variant="outline" className={isActive
                                        ? 'text-green-600 bg-green-500/10 border-green-500/30'
                                        : 'text-destructive bg-destructive/10 border-destructive/30'}>
                                        {isActive ? 'Activo' : 'Suspendido'}
                                    </Badge>
                                )}
                                {billing && (
                                    <Badge variant="outline" className={isPaid
                                        ? 'text-green-600 bg-green-500/10 border-green-500/30'
                                        : 'text-amber-600 bg-amber-500/10 border-amber-500/30'}>
                                        {isPaid
                                            ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" />Al día</>
                                            : <><AlertCircle className="h-3 w-3 mr-1 inline" />Pendiente</>}
                                    </Badge>
                                )}
                            </div>
                            <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Monto</span>
                                    <span className="font-medium">{fmtPrice(billing?.price, billing?.currencyCode)}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-muted-foreground">Medio de pago</span>
                                    {billing?.paymentNotes ? (
                                        <pre className="text-sm font-medium whitespace-pre-wrap break-words font-sans">
                                            {billing.paymentNotes}
                                        </pre>
                                    ) : (
                                        <span className="font-medium">{billing?.paymentMethodLabel || '—'}</span>
                                    )}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Vencimiento</span>
                                    <span className="font-medium">{fmt(billing?.dueDate)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

        </>
    );
}
