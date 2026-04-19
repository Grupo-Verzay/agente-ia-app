'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Zap, CalendarCheck2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { toggleWebhook } from '@/actions/webhook-actions';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { getIaCreditByUser } from '@/actions/actions-ia-credits';
import { onTokensToCredits } from '@/utils/onTokensToCredits';

interface CreditsWidgetProps {
    userId: string;
    webhookUrl: string;
}

export const CreditsWidget = ({ userId, webhookUrl }: CreditsWidgetProps) => {
    const pathname = usePathname();
    const router = useRouter();

    const [credits, setCredits] = useState<{
        total: number;
        remaining: number;
        creditUsed: number;
        renewalDate?: string;
    } | null>(null);

    const [loading, setLoading] = useState(true);
    const [usedPercent, setUsedPercent] = useState(0);


    useEffect(() => {
        const fetchCredits = async () => {
            setLoading(true);
            const res = await getIaCreditByUser(userId);
            if (res.success && res.data && res.data.length > 0) {
                const credit = res.data[0];
                /* credit.used por defecto viene en tokens, se debe convertir a creditos: 1c = 1000t */
                const creditUsed = onTokensToCredits(credit.used)
                const remaining = credit.total - creditUsed;

                setCredits({
                    total: credit.total,
                    remaining,
                    creditUsed,
                    renewalDate: new Date(credit.renewalDate).toISOString(),
                });

                /* Calcular el porcentaje de uso */
                const percent = Math.min(100, Math.round((creditUsed / credit.total) * 100));
                setUsedPercent(percent);

            } else {
                setCredits(null);
            }
            setLoading(false);
        };

        if (userId) fetchCredits();
    }, [userId]);

    useEffect(() => {
        const lockendAndDisabled = async () => {
            toast.error("Webhook desactivado por falta de créditos");
        };

        if (!credits) return;

        if (!loading && credits?.remaining <= 0 && pathname !== "/credits") {
            lockendAndDisabled();
        }
    }, [credits, loading, pathname]);

    const onRedirectPlan = () => {
        router.push('/credits');
    };

    return (
        <Card
            className="bg-muted border-border p-2 w-full cursor-pointer hover:bg-muted/80 transition"
            title="Haz clic para ver más información"
            onClick={credits?.remaining === 0 ? onRedirectPlan : undefined}
        >
            <CardContent className="flex items-center gap-3 p-0 min-h-[30px]">
                <div className="bg-blue-500/10 p-2 rounded-full cursor-help">
                    <Zap className="h-5 w-5 text-blue-500" />
                </div>


                <div className="flex-1">
                    {loading ? (
                        <span className="text-xs text-muted-foreground">Cargando créditos...</span>
                    ) : credits ? (
                        <>
                            <div className="flex justify-between text-xs font-medium text-muted-foreground">
                                <span>{credits.total} / {credits.creditUsed}</span>
                            </div>
                            <Progress
                                value={usedPercent}
                                className={cn(
                                    'h-2 rounded transition-all duration-300',
                                    usedPercent >= 75
                                        ? 'bg-red-500 animate-pulse duration-1000'
                                        : usedPercent >= 50
                                            ? 'bg-orange-500'
                                            : usedPercent >= 25
                                                ? 'bg-yellow-500'
                                                : 'bg-green-500'
                                )}
                            />
                            {/* <span className="text-[10px] text-muted-foreground">
                                {usedPercent}% Consumido
                            </span> */}

                            {credits.remaining <= 0 && (
                                <div className="flex gap-1 justify-start items-center text-[10px] text-red-500">
                                    <TriangleAlert size={12} />
                                    <p>
                                        Sin créditos.
                                    </p>
                                </div>
                            )}

                        </>
                    ) : (
                        <span className="text-xs text-muted-foreground">Sin créditos</span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
