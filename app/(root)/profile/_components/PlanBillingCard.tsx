'use client';

import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, AlertCircle, Loader2, ArrowUpCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getOwnBillingAction } from '@/actions/billing/billing-actions';
import { crearEnlacePagoRenovacion } from '@/actions/billing/wompi-checkout-actions';
import { estaEnPrueba, diasQueQuedan, seOfrecePagar } from '@/lib/plan-del-perfil';
import { PLAN_LABELS } from '@/types/plans';
import type { Plan } from '@prisma/client';
import { elMontoAlMes } from '@/lib/pantalla-de-perfil';

interface Props {
    userPlan: Plan;
}

function fmt(date: string | null | undefined) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
}


export function PlanBillingCard({ userPlan }: Props) {
    const [billing, setBilling] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [pagando, setPagando] = useState(false);

    useEffect(() => {
        getOwnBillingAction()
            .then(r => { if (r.success) setBilling(r.data); })
            .finally(() => setLoading(false));
    }, []);

    // El nombre que le pone SU marca a este nivel. La tabla fija de nombres solo
    // queda de respaldo: es genérica y no coincide con la de nadie —a un nivel 6
    // le decía "Agencias" cuando Verzay lo vende como "Enterprise"—.
    const planLabel = billing?.planLabel?.trim() || PLAN_LABELS[userPlan] || userPlan;
    const isPaid = billing?.billingStatus === 'PAID';
    const isActive = billing?.accessStatus === 'ACTIVE';

    // Hay nombre de plan pero puede no haber cobro configurado: en ese caso lo
    // único que llega es la etiqueta de la marca, y los estados (Activo, Al día,
    // Prueba) no tienen de dónde salir.
    const tieneFacturacion = !!billing && !billing.sinFacturacion;

    // En prueba con la MISMA regla que el panel de administración: la cuenta es
    // de prueba y no se ha cobrado. Un plan puesto a mano por el administrador
    // ya no sale como «Prueba».
    const enPrueba = tieneFacturacion && estaEnPrueba(billing);
    const diasDePrueba = enPrueba && isActive ? diasQueQuedan(billing?.dueDate) : null;

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
                <CardContent className="flex flex-col flex-1 space-y-3">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xl font-bold">{planLabel}</span>
                                {tieneFacturacion && (
                                    <Badge variant="outline" className={isActive
                                        ? 'text-green-600 bg-green-500/10 border-green-500/30'
                                        : 'text-destructive bg-destructive/10 border-destructive/30'}>
                                        {isActive ? 'Activo' : 'Suspendido'}
                                    </Badge>
                                )}
                                {/* En prueba no está "al día": está probando. Decírselo
                                    así es más honesto y de paso le recuerda que tiene
                                    fecha de fin. */}
                                {tieneFacturacion && diasDePrueba !== null ? (
                                    <Badge variant="outline" className="text-amber-600 bg-amber-500/10 border-amber-500/30">
                                        <AlertCircle className="h-3 w-3 mr-1 inline" />
                                        Prueba · {diasDePrueba} {diasDePrueba === 1 ? 'día' : 'días'}
                                    </Badge>
                                ) : tieneFacturacion && (
                                    <Badge variant="outline" className={isPaid
                                        ? 'text-green-600 bg-green-500/10 border-green-500/30'
                                        : 'text-amber-600 bg-amber-500/10 border-amber-500/30'}>
                                        {isPaid
                                            ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" />Al día</>
                                            : <><AlertCircle className="h-3 w-3 mr-1 inline" />Pendiente</>}
                                    </Badge>
                                )}
                            </div>
                            <div className="space-y-1.5 text-sm mt-auto">
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">Monto</span>
                                    {/* Solo lo que se cobra. El equivalente en dólares
                                        que iba encima salía de dividir los pesos por la
                                        tasa, así que cambiaba solo y acababa diciendo un
                                        precio distinto al que el cliente contrató. */}
                                    <span className="text-right font-medium tabular-nums">
                                        {/* El formato con moneda ya escribe «COP»:
                                            añadirlo otra vez salía «250.000 COP COP/mes». */}
                                        {elMontoAlMes(billing?.price, billing?.currencyCode)}
                                    </span>
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

                                {/* Pagar y renovar sin intermediarios. El enlace se genera en
                                    el momento porque lleva dentro esta cuenta: es lo que
                                    permite que la renovacion se aplique sola al confirmarse el
                                    pago, sin que nadie tenga que tocar nada.

                                    Solo aparece si hay un precio asignado; sin el, el boton
                                    llevaria a un cobro de importe cero. */}
                                {/* Cambiar de plan va por el botón «Cambiar plan» del
                                    Perfil: las tarjetas de los planes ya no se pintan aquí. */}
                                {tieneFacturacion && seOfrecePagar(billing) && (
                                    <Button
                                        className="mt-2 w-full"
                                        disabled={pagando}
                                        onClick={async () => {
                                            setPagando(true);
                                            const res = await crearEnlacePagoRenovacion();
                                            setPagando(false);
                                            if (!res.success || !res.url) {
                                                toast.error(res.message);
                                                return;
                                            }
                                            window.open(res.url, '_blank', 'noopener,noreferrer');
                                        }}
                                    >
                                        {pagando ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparando pago...</>
                                        ) : (
                                            <><CreditCard className="mr-2 h-4 w-4" />Pagar y renovar</>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

        </>
    );
}
