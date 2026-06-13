'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateTeam } from '@/actions/bookings-actions';

type NoticeUnit = 'minutes' | 'hours' | 'days';
const noticeToMinutes: Record<NoticeUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function fromMinutes(total: number): { value: number; unit: NoticeUnit } {
    if (total > 0 && total % 1440 === 0) return { value: total / 1440, unit: 'days' };
    if (total > 0 && total % 60 === 0)   return { value: total / 60,   unit: 'hours' };
    return { value: total, unit: 'minutes' };
}

interface Team {
    id: string;
    minNoticeMinutes: number;
}

export function BookingTeamSettings({ userId, team }: { userId: string; team: Team }) {
    const router = useRouter();

    const publicUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/bookings/${userId}`
        : `/bookings/${userId}`;

    const { value: initVal, unit: initUnit } = fromMinutes(team.minNoticeMinutes);
    const [noticeValue, setNoticeValue] = useState<number>(initVal);
    const [noticeUnit,  setNoticeUnit]  = useState<NoticeUnit>(initUnit);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const { value, unit } = fromMinutes(team.minNoticeMinutes);
        setNoticeValue(value);
        setNoticeUnit(unit);
    }, [team.minNoticeMinutes]);

    const copyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        toast.success('Enlace copiado al portapapeles');
    };

    const handleCancel = () => {
        const { value, unit } = fromMinutes(team.minNoticeMinutes);
        setNoticeValue(value);
        setNoticeUnit(unit);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const minNoticeMinutes = noticeValue * noticeToMinutes[noticeUnit];
        const res = await updateTeam(team.id, { minNoticeMinutes });
        if (res.success) {
            toast.success('Ajustes guardados');
            router.refresh();
        } else {
            toast.error(res.message);
        }
        setSaving(false);
    };

    return (
        <div className="max-w-lg mx-auto space-y-6 py-4">
            {/* Enlace público */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Enlace público de reservas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Comparte este enlace con tus clientes para que agenden citas directamente.
                    </p>
                    <div className="flex items-center gap-2">
                        <Input value={publicUrl} readOnly className="text-xs" />
                        <Button variant="outline" size="icon" onClick={copyLink}>
                            <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" asChild>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Configuración avanzada */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Configuración avanzada</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                                Tiempo mínimo de anticipación
                            </label>
                            <div className="flex items-center gap-3 w-full">
                                <Select value={noticeUnit} onValueChange={(v) => setNoticeUnit(v as NoticeUnit)}>
                                    <SelectTrigger className="w-32 shrink-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="minutes">Minutos</SelectItem>
                                        <SelectItem value="hours">Horas</SelectItem>
                                        <SelectItem value="days">Días</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="flex-1 text-xs text-muted-foreground text-center">0 = sin restricción</p>
                                <Input
                                    type="number"
                                    value={noticeValue}
                                    onChange={(e) => setNoticeValue(Math.max(0, parseInt(e.target.value) || 0))}
                                    min="0"
                                    className="w-28 text-center text-lg font-bold shrink-0"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Default global del equipo. Cada especialista puede sobrescribir este valor.
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
                                Cancelar
                            </Button>
                            <Button type="submit" variant="save" disabled={saving}>
                                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
