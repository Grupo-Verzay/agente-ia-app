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
                    /* credit.used por defecto viene en tokens, se debe convertir a creditos: 1c = 1000t */
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
                toast.success(
                    hasCredits ? 'Créditos actualizados correctamente' : 'Créditos creados correctamente'
                );
                setHasCredits(true); // si era creación, ahora ya tiene créditos
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

    return (
        <Card className="border-border">
            <CardHeader>
                <CardTitle>Gestión de Créditos IA</CardTitle>
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
    );
};
