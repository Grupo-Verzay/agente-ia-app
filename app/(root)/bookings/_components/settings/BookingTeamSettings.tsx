'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2, Timer, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { guardarCapacidadDeMultiagendaAction, leerCapacidadDeMultiagendaAction, updateTeam } from '@/actions/bookings-actions';
import { GoogleCalendarSettings, UpdateMeetingDuration } from '@/app/(root)/schedule/_components/settings';
import { CAPACIDADES } from '@/lib/capacidad-de-multiagenda';
import { elEnlaceDeReservaDelEquipo } from '@/lib/pantalla-de-multiagenda';
import { elSlugDeLaAgendaAction } from '@/actions/enlace-de-agenda-actions';

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

interface Reunion {
    meetingDuration?: number | null;
    meetingUrl?: string | null;
}

/**
 * Cuántas videollamadas con IA puede tener cada especialista a la vez en el
 * mismo turno. Solo cuenta con la Videollamada con IA de Verzay: con un enlace
 * fijo, una cita por turno.
 */
function CapacidadSimultanea({ teamId }: { teamId: string }) {
    const [capacidad, setCapacidad] = useState<number>(1);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        let vivo = true;
        leerCapacidadDeMultiagendaAction(teamId)
            .then((res) => { if (vivo && res.success && res.data) setCapacidad(res.data.capacidad); })
            .catch((error) => console.warn('[multiagenda] no se pudo leer la capacidad', error));
        return () => { vivo = false; };
    }, [teamId]);

    const cambiar = async (valor: string) => {
        const antes = capacidad;
        const nueva = Number(valor);
        setCapacidad(nueva);
        setGuardando(true);
        try {
            const res = await guardarCapacidadDeMultiagendaAction(teamId, nueva);
            if (res.success && res.data) {
                setCapacidad(res.data.capacidad);
                toast.success('Capacidad guardada');
            } else {
                setCapacidad(antes);
                toast.error(res.message);
            }
        } catch {
            setCapacidad(antes);
            toast.error('No se pudo guardar la capacidad.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="space-y-1.5" data-capacidad-simultanea="">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                Videollamadas a la vez por turno
            </label>
            <div className="flex items-center gap-3 w-full">
                <p className="flex-1 text-xs text-muted-foreground">
                    Cada cita recibe su propio enlace y su propia sala. Solo aplica con la Videollamada con IA de Verzay.
                </p>
                <Select value={String(capacidad)} onValueChange={cambiar} disabled={guardando}>
                    <SelectTrigger className="w-28 shrink-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CAPACIDADES.map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

export function BookingTeamSettings({ userId, team, user }: { userId: string; team: Team; user: Reunion }) {
    const router = useRouter();

    // El dominio de la página abierta, leído DESPUÉS de montar: leerlo al
    // pintar daría una dirección en el servidor y otra en el navegador.
    const [origen, setOrigen] = useState('');
    useEffect(() => { setOrigen(window.location.origin); }, []);
    // El nombre legible (`/bookings/<nombre>/agenda`); mientras llega, el id.
    const [slug, setSlug] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        elSlugDeLaAgendaAction(userId, 'bookings')
            .then((s) => { if (vivo) setSlug(s); })
            .catch((error) => console.warn('[multiagenda] no se pudo leer el enlace legible', error));
        return () => { vivo = false; };
    }, [userId]);
    const publicUrl = elEnlaceDeReservaDelEquipo(origen, userId, slug);

    const { value: initVal, unit: initUnit } = fromMinutes(team.minNoticeMinutes);
    const [noticeValue, setNoticeValue] = useState<number>(initVal);
    const [noticeUnit,  setNoticeUnit]  = useState<NoticeUnit>(initUnit);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const { value, unit } = fromMinutes(team.minNoticeMinutes);
        setNoticeValue(value);
        setNoticeUnit(unit);
    }, [team.minNoticeMinutes]);

    const copyLink = async () => {
        // Sin HTTPS el portapapeles lanza: se dice qué hacer en vez de fallar callado.
        try {
            await navigator.clipboard.writeText(publicUrl);
            toast.success('Enlace copiado al portapapeles');
        } catch {
            toast.error('No se pudo copiar. Selecciona el enlace y cópialo con Ctrl+C.');
        }
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
        <div className="space-y-4 pb-4">
            {/* Las mismas dos tarjetas que Agenda › Ajustes, con las mismas piezas. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="h-full rounded-xl border bg-card shadow-sm p-6" data-ajuste-de-agenda="reunion">
                    <UpdateMeetingDuration
                        userId={userId}
                        meetingDuration={user.meetingDuration ?? 60}
                        meetingUrl={user.meetingUrl}
                        conAnticipacion={false}
                    />
                </div>
                <div className="h-full rounded-xl border bg-card shadow-sm p-6" data-ajuste-de-agenda="google-calendar">
                    <GoogleCalendarSettings userId={userId} />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Enlace público */}
            <Card data-tarjeta-de-ajustes="enlace">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Enlace público de reservas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Comparte este enlace con tus clientes para que agenden citas directamente.
                    </p>
                    <div className="flex items-center gap-2">
                        <Input value={publicUrl} readOnly className="text-xs" data-enlace-publico="" />
                        <Button variant="outline" size="icon" onClick={copyLink} title="Copiar enlace" aria-label="Copiar enlace" data-copiar-enlace="">
                            <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" asChild>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer" title="Abrir la página de reservas" aria-label="Abrir la página de reservas" data-abrir-enlace="">
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Configuración avanzada */}
            <Card data-tarjeta-de-ajustes="anticipacion">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Configuración avanzada</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <CapacidadSimultanea teamId={team.id} />
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
                                Vale para todo el equipo. Cada especialista puede tener el suyo en su configuración.
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
        </div>
    );
}
