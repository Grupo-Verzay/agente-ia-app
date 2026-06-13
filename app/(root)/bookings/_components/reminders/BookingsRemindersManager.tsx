'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, Plus, X, Loader2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { getTeamServices, updateTeamService } from '@/actions/bookings-actions';

interface ServiceReminder {
    timeMinutes: number;
    message: string;
}

interface TeamService {
    id: string;
    name: string;
    color: string | null;
    duration: number;
    remindersConfig: ServiceReminder[] | null;
}

function fmtTime(mins: number) {
    if (mins < 60) return `${mins} min antes`;
    if (mins < 1440) return `${mins / 60}h antes`;
    return `${mins / 1440}d antes`;
}

function ServiceReminderCard({ service, onUpdated }: {
    service: TeamService;
    onUpdated: (id: string, reminders: ServiceReminder[]) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [newMinutes, setNewMinutes] = useState('60');
    const [newMsg, setNewMsg] = useState('Hola @client_name, te recordamos tu cita: @appointment_datetime');

    const reminders: ServiceReminder[] = Array.isArray(service.remindersConfig) ? service.remindersConfig : [];

    const save = async (updated: ServiceReminder[]) => {
        setSaving(true);
        const res = await updateTeamService(service.id, { remindersConfig: updated });
        if (res.success) {
            onUpdated(service.id, updated);
            toast.success('Recordatorios guardados');
        } else {
            toast.error(res.message);
        }
        setSaving(false);
    };

    const addReminder = async () => {
        const mins = parseInt(newMinutes, 10);
        if (!mins || mins <= 0) { toast.error('Ingresa un tiempo válido'); return; }
        if (!newMsg.trim()) { toast.error('El mensaje no puede estar vacío'); return; }
        await save([...reminders, { timeMinutes: mins, message: newMsg.trim() }]);
        setNewMinutes('60');
        setNewMsg('Hola @client_name, te recordamos tu cita: @appointment_datetime');
    };

    const removeReminder = (idx: number) => {
        save(reminders.filter((_, i) => i !== idx));
    };

    return (
        <Card className="border-border">
            <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center gap-3">
                    <div className="h-7 w-1.5 rounded-full shrink-0" style={{ backgroundColor: service.color ?? '#3B82F6' }} />
                    <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{service.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px] shrink-0">{service.duration} min</Badge>
                        {reminders.length > 0 && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                                <Bell className="h-2.5 w-2.5 mr-1" />{reminders.length}
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
                {reminders.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                        Sin recordatorios — se usarán los globales del módulo Recordatorios.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {reminders.map((rem, idx) => (
                            <div key={idx} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2">
                                <div className="flex-1 min-w-0">
                                    <Badge variant="outline" className="text-[10px] mb-1">{fmtTime(rem.timeMinutes)}</Badge>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{rem.message}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeReminder(idx)}
                                    disabled={saving}
                                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Agregar */}
                <div className="rounded-md border border-dashed border-border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Agregar recordatorio</p>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            min={1}
                            value={newMinutes}
                            onChange={(e) => setNewMinutes(e.target.value)}
                            className="w-20 h-7 text-xs"
                            placeholder="60"
                        />
                        <span className="text-xs text-muted-foreground">min antes</span>
                    </div>
                    <Textarea
                        value={newMsg}
                        onChange={(e) => setNewMsg(e.target.value)}
                        className="min-h-[60px] text-xs"
                        placeholder="Mensaje del recordatorio..."
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Variables: @client_name · @appointment_datetime · @appointment_duration
                    </p>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs"
                        onClick={addReminder}
                        disabled={saving}
                    >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                        Agregar
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export function BookingsRemindersManager({ teamId }: { teamId: string }) {
    const [services, setServices] = useState<TeamService[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getTeamServices(teamId);
        if (res.success && res.data) setServices(res.data as TeamService[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const handleUpdated = (serviceId: string, reminders: ServiceReminder[]) => {
        setServices((prev) => prev.map((s) => s.id === serviceId ? { ...s, remindersConfig: reminders } : s));
    };

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2].map((i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
            </div>
        );
    }

    if (services.length === 0) {
        return (
            <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                    <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Crea servicios primero en la pestaña Servicios.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Configura los recordatorios que se enviarán automáticamente a los clientes antes de cada tipo de cita.
                Si un servicio no tiene recordatorios propios, se usan los globales del módulo Recordatorios.
            </p>
            {services.map((s) => (
                <ServiceReminderCard key={s.id} service={s} onUpdated={handleUpdated} />
            ))}
        </div>
    );
}
