'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Loader2, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getTeamServices, updateTeamService } from '@/actions/bookings-actions';
import TooltipWrapper from '@/components/TooltipWrapper';

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

function reminderTitle(mins: number): string {
    if (mins < 60) return `RECORDATORIO ${mins} MIN ANTES`;
    if (mins < 1440) return `RECORDATORIO ${mins / 60}H ANTES`;
    return `RECORDATORIO ${mins / 1440}D ANTES`;
}

const DEFAULT_MSG = 'Hola @client_name, te recordamos tu cita: @appointment_datetime';

interface ReminderFormState {
    timeMinutes: string;
    message: string;
}

function ReminderFormDialog({
    open,
    initial,
    onClose,
    onSave,
    saving,
}: {
    open: boolean;
    initial?: ServiceReminder;
    onClose: () => void;
    onSave: (r: ServiceReminder) => void;
    saving: boolean;
}) {
    const [form, setForm] = useState<ReminderFormState>({
        timeMinutes: initial ? String(initial.timeMinutes) : '60',
        message: initial?.message ?? DEFAULT_MSG,
    });

    useEffect(() => {
        if (open) {
            setForm({
                timeMinutes: initial ? String(initial.timeMinutes) : '60',
                message: initial?.message ?? DEFAULT_MSG,
            });
        }
    }, [open, initial]);

    const handleSave = () => {
        const mins = parseInt(form.timeMinutes, 10);
        if (!mins || mins <= 0) { toast.error('Ingresa un tiempo válido'); return; }
        if (!form.message.trim()) { toast.error('El mensaje no puede estar vacío'); return; }
        onSave({ timeMinutes: mins, message: form.message.trim() });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{initial ? 'Editar recordatorio' : 'Agregar recordatorio'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="flex items-center gap-2">
                        <div className="space-y-1 flex-1">
                            <Label className="text-xs">Tiempo (minutos antes)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={form.timeMinutes}
                                onChange={(e) => setForm((p) => ({ ...p, timeMinutes: e.target.value }))}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div className="pt-5 text-xs text-muted-foreground whitespace-nowrap">
                            = {form.timeMinutes ? fmtTime(parseInt(form.timeMinutes) || 0) : '—'}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Mensaje</Label>
                        <Textarea
                            value={form.message}
                            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                            className="min-h-[80px] text-sm"
                            placeholder="Mensaje del recordatorio..."
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Variables: @client_name · @appointment_datetime · @appointment_duration
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ServiceSection({
    service,
    search,
    onUpdated,
}: {
    service: TeamService;
    search: string;
    onUpdated: (id: string, reminders: ServiceReminder[]) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editIdx, setEditIdx] = useState<number | null>(null);

    const reminders: ServiceReminder[] = Array.isArray(service.remindersConfig)
        ? service.remindersConfig
        : [];

    const filteredReminders = search
        ? reminders.filter((r) =>
            reminderTitle(r.timeMinutes).toLowerCase().includes(search.toLowerCase()) ||
            fmtTime(r.timeMinutes).toLowerCase().includes(search.toLowerCase()) ||
            r.message.toLowerCase().includes(search.toLowerCase())
        )
        : reminders;

    const persist = async (updated: ServiceReminder[]) => {
        setSaving(true);
        const res = await updateTeamService(service.id, { remindersConfig: updated });
        if (res.success) {
            onUpdated(service.id, updated);
            toast.success('Recordatorio guardado');
        } else {
            toast.error(res.message);
        }
        setSaving(false);
    };

    const handleSave = (r: ServiceReminder) => {
        if (editIdx !== null) {
            const updated = reminders.map((rem, i) => (i === editIdx ? r : rem));
            persist(updated);
        } else {
            persist([...reminders, r]);
        }
        setDialogOpen(false);
        setEditIdx(null);
    };

    const handleDelete = (idx: number) => {
        persist(reminders.filter((_, i) => i !== idx));
    };

    const openAdd = () => { setEditIdx(null); setDialogOpen(true); };
    const openEdit = (idx: number) => { setEditIdx(idx); setDialogOpen(true); };

    if (search && filteredReminders.length === 0) return null;

    return (
        <div className="space-y-2">
            {/* Service header */}
            <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: service.color ?? '#3B82F6' }} />
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    {service.name}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">{service.duration} min</Badge>
                {reminders.length > 0 && (
                    <Badge className="h-4 px-1.5 text-[10px] bg-blue-100 text-blue-700 border-0 shrink-0">
                        <BellRing className="h-2.5 w-2.5 mr-0.5" />
                        {reminders.length}
                    </Badge>
                )}
                <div className="flex-1" />
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={openAdd}
                    disabled={saving}
                >
                    <Plus className="h-3 w-3 mr-0.5" />
                    Agregar
                </Button>
            </div>

            {/* Reminder list */}
            {filteredReminders.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-4">
                    Sin recordatorios — se usarán los globales del módulo Recordatorios.
                </p>
            ) : (
                <div className="space-y-1.5 pl-4">
                    {filteredReminders.map((rem, idx) => {
                        const realIdx = reminders.indexOf(rem);
                        return (
                            <Card
                                key={realIdx}
                                className="group w-full rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md"
                            >
                                <CardContent className="flex items-center gap-3 px-3 py-2.5">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                                        <BellRing className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="app-item-title truncate text-foreground">
                                            {reminderTitle(rem.timeMinutes)}
                                        </h3>
                                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                                            {rem.message}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Badge className="h-5 px-1.5 py-0 text-[10px] font-medium border-0 bg-blue-100 text-blue-700">
                                            {fmtTime(rem.timeMinutes)}
                                        </Badge>
                                        <div className="h-5 w-0.5 shrink-0 rounded-full bg-border" />
                                        <div className="flex items-center gap-0.5">
                                            <TooltipWrapper content="Editar">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                                                    onClick={() => openEdit(realIdx)}
                                                    disabled={saving}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                            </TooltipWrapper>
                                            <TooltipWrapper content="Eliminar">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
                                                    onClick={() => handleDelete(realIdx)}
                                                    disabled={saving}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </TooltipWrapper>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <ReminderFormDialog
                open={dialogOpen}
                initial={editIdx !== null ? reminders[editIdx] : undefined}
                onClose={() => { setDialogOpen(false); setEditIdx(null); }}
                onSave={handleSave}
                saving={saving}
            />
        </div>
    );
}

export function BookingsRemindersManager({ teamId }: { teamId: string }) {
    const [services, setServices] = useState<TeamService[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getTeamServices(teamId);
        if (res.success && res.data) setServices(res.data as TeamService[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const handleUpdated = (serviceId: string, reminders: ServiceReminder[]) => {
        setServices((prev) =>
            prev.map((s) => (s.id === serviceId ? { ...s, remindersConfig: reminders } : s))
        );
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-72" />
                {[1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ))}
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
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar recordatorios..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>

            {/* Per-service sections */}
            {services.map((s) => (
                <ServiceSection
                    key={s.id}
                    service={s}
                    search={search}
                    onUpdated={handleUpdated}
                />
            ))}
        </div>
    );
}
