'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronUp, PlusCircle, Copy, Clock, Link2, Settings2, Timer } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
    createTeamMember, updateTeamMember, deleteTeamMember,
    getTeamMembers, setMemberAvailability, getTeamServices,
    assignServiceToMember, removeServiceFromMember,
    type AvailabilitySlot,
} from '@/actions/bookings-actions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
    id: string;
    name: string;
    bio: string | null;
    photo: string | null;
    color: string | null;
    isActive: boolean;
    defaultDuration: number;
    meetingLink: string | null;
    minNoticeMinutes: number;
    availability: { dayOfWeek: number; startTime: string; endTime: string }[];
    services: { teamServiceId: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function generateHourOptions(): string[] {
    const hours: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            hours.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
    }
    return hours;
}

const HOURS = generateHourOptions();

// ─── Member form schema ───────────────────────────────────────────────────────

const memberSchema = z.object({
    name:  z.string().min(2, 'El nombre es obligatorio'),
    bio:   z.string().optional(),
    color: z.string().optional(),
});
type MemberFormValues = z.infer<typeof memberSchema>;

// ─── Availability editor ──────────────────────────────────────────────────────

type LocalSlot = { uid: string; dayOfWeek: number; startTime: string; endTime: string };

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun → Dom

function uid() { return Math.random().toString(36).slice(2, 9); }

function AvailabilityEditor({
    memberId,
    initial,
    onSaved,
}: {
    memberId: string;
    initial: { dayOfWeek: number; startTime: string; endTime: string }[];
    onSaved: (slots: AvailabilitySlot[]) => void;
}) {
    const [slots, setSlots] = useState<LocalSlot[]>(
        initial.map((s) => ({ uid: uid(), ...s }))
    );
    const [saving, setSaving] = useState(false);

    const persist = async (next: LocalSlot[]) => {
        setSaving(true);
        const payload = next.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
        const res = await setMemberAvailability(memberId, payload);
        if (res.success) {
            onSaved(payload);
        } else {
            toast.error(res.message);
        }
        setSaving(false);
    };

    const addSlot = async (day: number) => {
        const next = [...slots, { uid: uid(), dayOfWeek: day, startTime: '09:00', endTime: '17:00' }];
        setSlots(next);
        await persist(next);
    };

    const duplicateSlot = async (slot: LocalSlot) => {
        const next = [...slots, { ...slot, uid: uid() }];
        setSlots(next);
        await persist(next);
    };

    const deleteSlot = async (id: string) => {
        const next = slots.filter((s) => s.uid !== id);
        setSlots(next);
        await persist(next);
    };

    const updateSlot = async (id: string, field: 'startTime' | 'endTime', value: string) => {
        const next = slots.map((s) => s.uid === id ? { ...s, [field]: value } : s);
        setSlots(next);
        await persist(next);
    };

    const slotsByDay = (day: number) => slots.filter((s) => s.dayOfWeek === day);

    return (
        <div className="space-y-4">
            <p className="text-sm font-medium">Disponibilidad semanal</p>
            {DISPLAY_ORDER.map((day) => {
                const daySlots = slotsByDay(day);
                return (
                    <div key={day} className="flex items-start sm:items-center gap-1 py-1">
                        <div className="shrink-0 flex items-center gap-0.5">
                            <span className="font-medium text-sm sm:text-base">{DAY_LABELS[day]}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => addSlot(day)}
                                title="Añadir franja"
                                disabled={saving}
                            >
                                <PlusCircle className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="flex-1">
                            {daySlots.length === 0 ? (
                                <span className="text-muted-foreground">No disponible</span>
                            ) : (
                                <div className="flex flex-row flex-wrap gap-2">
                                    {daySlots.map((slot) => (
                                        <Card
                                            key={slot.uid}
                                            className="flex-1 min-w-full sm:min-w-[240px] flex items-center justify-between gap-2 border-none shadow-none px-2 py-1"
                                        >
                                            <div className="flex items-center gap-2 flex-1">
                                                <Select
                                                    value={slot.startTime}
                                                    onValueChange={(v) => updateSlot(slot.uid, 'startTime', v)}
                                                    disabled={saving}
                                                >
                                                    <SelectTrigger className="flex-1 min-w-[80px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>

                                                <span className="text-muted-foreground shrink-0">–</span>

                                                <Select
                                                    value={slot.endTime}
                                                    onValueChange={(v) => updateSlot(slot.uid, 'endTime', v)}
                                                    disabled={saving}
                                                >
                                                    <SelectTrigger className="flex-1 min-w-[80px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="secondary"
                                                    size="icon"
                                                    onClick={() => duplicateSlot(slot)}
                                                    disabled={saving}
                                                    title="Duplicar franja"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="icon"
                                                    onClick={() => deleteSlot(slot.uid)}
                                                    disabled={saving}
                                                    title="Eliminar franja"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Member form dialog ───────────────────────────────────────────────────────

function MemberFormDialog({
    teamId,
    mode,
    initial,
    onSaved,
    trigger,
}: {
    teamId: string;
    mode: 'create' | 'edit';
    initial?: Member;
    onSaved: (member: Member) => void;
    trigger: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<MemberFormValues>({
        resolver: zodResolver(memberSchema),
        defaultValues: {
            name:  initial?.name  ?? '',
            bio:   initial?.bio   ?? '',
            color: initial?.color ?? '#3B82F6',
        },
    });

    const onSubmit = async (values: MemberFormValues) => {
        setSubmitting(true);
        try {
            let res;
            if (mode === 'create') {
                res = await createTeamMember(teamId, values);
            } else {
                res = await updateTeamMember(initial!.id, values);
            }
            if (res.success && res.data) {
                const data = res.data as Member;
                const member: Member = {
                    ...(initial ?? { id: data.id, isActive: true, services: [] }),
                    ...data,
                    availability: initial?.availability ?? [],
                };
                onSaved(member);
                toast.success(mode === 'create' ? 'Especialista creado' : 'Especialista actualizado');
                setOpen(false);
            } else {
                toast.error(res.message);
            }
        } catch {
            toast.error('Error al guardar');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <span onClick={() => setOpen(true)}>{trigger}</span>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Nuevo especialista' : 'Editar especialista'}</DialogTitle>
                    <DialogDescription>
                        {mode === 'create'
                            ? 'Agrega un especialista a tu equipo.'
                            : 'Actualiza los datos del especialista.'}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="name" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre</FormLabel>
                                <FormControl><Input placeholder="Ej: Dr. Juan Pérez" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="bio" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Descripción corta (opcional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Especialidad, años de experiencia…" className="min-h-[72px]" {...field} />
                                </FormControl>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="color" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Color de identificación</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-3">
                                        <input type="color" className="h-8 w-12 rounded border cursor-pointer" {...field} />
                                        <span className="text-xs text-muted-foreground">{field.value}</span>
                                    </div>
                                </FormControl>
                            </FormItem>
                        )} />
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
                            <Button variant="save" type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Guardar
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Member card ──────────────────────────────────────────────────────────────

// ─── Service assignment panel ─────────────────────────────────────────────────

function ServiceAssignment({
    memberId,
    assignedIds,
    allServices,
    onToggle,
}: {
    memberId: string;
    assignedIds: string[];
    allServices: { id: string; name: string; duration: number }[];
    onToggle: (serviceId: string, assigned: boolean) => void;
}) {
    const [loading, setLoading] = useState<string | null>(null);

    const handleToggle = async (serviceId: string) => {
        const isAssigned = assignedIds.includes(serviceId);
        setLoading(serviceId);
        const res = isAssigned
            ? await removeServiceFromMember(memberId, serviceId)
            : await assignServiceToMember(memberId, serviceId);
        if (res.success) {
            onToggle(serviceId, !isAssigned);
            toast.success(isAssigned ? 'Servicio removido' : 'Servicio asignado');
        } else {
            toast.error(res.message);
        }
        setLoading(null);
    };

    if (!allServices.length) {
        return <p className="text-xs text-muted-foreground">Crea servicios primero en la pestaña Servicios.</p>;
    }

    return (
        <div className="space-y-2">
            <p className="text-sm font-medium">Servicios que atiende</p>
            <div className="flex flex-wrap gap-2">
                {allServices.map((svc) => {
                    const assigned = assignedIds.includes(svc.id);
                    return (
                        <button
                            key={svc.id}
                            type="button"
                            disabled={loading === svc.id}
                            onClick={() => handleToggle(svc.id)}
                            className={[
                                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                assigned
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/50',
                                loading === svc.id ? 'opacity-50 cursor-wait' : '',
                            ].join(' ')}
                        >
                            {loading === svc.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            {assigned ? '✓ ' : '+ '}{svc.name}
                            <span className="opacity-60">· {svc.duration}min</span>
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-muted-foreground">
                {assignedIds.length === 0
                    ? 'Sin asignación — el especialista aparece en todos los servicios.'
                    : `${assignedIds.length} servicio(s) asignado(s).`}
            </p>
        </div>
    );
}

// ─── Member config editor ─────────────────────────────────────────────────────

type DurUnit = 'minutes' | 'hours';
type NoticeUnit = 'minutes' | 'hours' | 'days';
const durToMinutes: Record<DurUnit, number> = { minutes: 1, hours: 60 };
const noticeToMinutes: Record<NoticeUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function fromMinutesDur(total: number): { value: number; unit: DurUnit } {
    if (total > 0 && total % 60 === 0) return { value: total / 60, unit: 'hours' };
    return { value: total, unit: 'minutes' };
}

function fromMinutesNotice(total: number): { value: number; unit: NoticeUnit } {
    if (total > 0 && total % 1440 === 0) return { value: total / 1440, unit: 'days' };
    if (total > 0 && total % 60 === 0)   return { value: total / 60,   unit: 'hours' };
    return { value: total, unit: 'minutes' };
}

function MemberConfigEditor({
    member,
    onSaved,
}: {
    member: Member;
    onSaved: (updated: Pick<Member, 'defaultDuration' | 'meetingLink' | 'minNoticeMinutes'>) => void;
}) {
    const { value: initDurVal, unit: initDurUnit } = fromMinutesDur(member.defaultDuration);
    const [durValue, setDurValue] = useState<number>(initDurVal);
    const [durUnit, setDurUnit] = useState<DurUnit>(initDurUnit);

    const [url, setUrl] = useState<string>(member.meetingLink ?? '');

    const { value: initNoticeVal, unit: initNoticeUnit } = fromMinutesNotice(member.minNoticeMinutes);
    const [noticeValue, setNoticeValue] = useState<number>(initNoticeVal);
    const [noticeUnit, setNoticeUnit] = useState<NoticeUnit>(initNoticeUnit);

    const [saving, setSaving] = useState(false);

    const handleCancel = () => {
        const { value: dv, unit: du } = fromMinutesDur(member.defaultDuration);
        setDurValue(dv);
        setDurUnit(du);
        setUrl(member.meetingLink ?? '');
        const { value: nv, unit: nu } = fromMinutesNotice(member.minNoticeMinutes);
        setNoticeValue(nv);
        setNoticeUnit(nu);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const durationMinutes = durValue * durToMinutes[durUnit];
        if (durationMinutes < 1 || durationMinutes > 480) {
            toast.error('La duración debe estar entre 1 y 480 minutos.');
            return;
        }

        const trimmedUrl = url.trim();
        if (trimmedUrl) {
            const normalized = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
            try { new URL(normalized); } catch { toast.error('La URL de reunión no es válida.'); return; }
        }

        setSaving(true);
        const minNoticeMinutes = noticeValue * noticeToMinutes[noticeUnit];
        const res = await updateTeamMember(member.id, {
            defaultDuration: durationMinutes,
            meetingLink: trimmedUrl || null,
            minNoticeMinutes,
        });
        setSaving(false);

        if (res.success) {
            toast.success('Configuración actualizada');
            onSaved({ defaultDuration: durationMinutes, meetingLink: trimmedUrl || null, minNoticeMinutes });
        } else {
            toast.error(res.message);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Settings2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                    <p className="text-sm font-semibold">Configuración</p>
                    <p className="text-xs text-muted-foreground">Duración, enlace y anticipación mínima</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Duración */}
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        Duración de la reunión
                    </label>
                    <div className="flex items-center gap-3 w-full">
                        <Select value={durUnit} onValueChange={(v) => setDurUnit(v as DurUnit)}>
                            <SelectTrigger className="w-32 shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="minutes">Minutos</SelectItem>
                                <SelectItem value="hours">Horas</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="flex-1 text-xs text-muted-foreground text-center">Elige entre 1 y 480 min</p>
                        <Input
                            type="number"
                            value={durValue}
                            onChange={(e) => setDurValue(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            className="w-28 text-center text-lg font-bold shrink-0"
                        />
                    </div>
                </div>

                {/* Enlace */}
                <div className="space-y-1.5">
                    <label htmlFor={`meetingUrl-${member.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                        Enlace de reunión virtual
                    </label>
                    <Input
                        id={`meetingUrl-${member.id}`}
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://meet.google.com/xxx-xxxx-xxx"
                    />
                    <p className="text-xs text-muted-foreground">Zoom, Google Meet, Skype u otra plataforma de videoconferencia</p>
                </div>

                {/* Anticipación mínima */}
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
                    <p className="text-xs text-muted-foreground">Ej: 60 = clientes no pueden agendar en menos de 1 hora.</p>
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
        </div>
    );
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({
    teamId,
    member,
    allServices,
    onUpdated,
    onDeleted,
}: {
    teamId: string;
    member: Member;
    allServices: { id: string; name: string; duration: number }[];
    onUpdated: (m: Member) => void;
    onDeleted: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        const res = await deleteTeamMember(member.id);
        if (res.success) {
            onDeleted(member.id);
            toast.success('Especialista eliminado');
        } else {
            toast.error(res.message);
        }
        setDeleting(false);
        setConfirmDelete(false);
    };

    return (
        <>
            <Card className="border-border overflow-hidden">
                <CardContent className="p-0 space-y-0">
                    {/* Header — toda la barra es clickeable */}
                    <button
                        type="button"
                        onClick={() => setExpanded((p) => !p)}
                        className="w-full flex items-center justify-between gap-2 p-4 hover:bg-muted/40 transition-colors text-left"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className="h-8 w-8 rounded-full shrink-0 border"
                                style={{ backgroundColor: member.color ?? '#3B82F6' }}
                            />
                            <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{member.name}</p>
                                {member.bio && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">{member.bio}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                                {member.availability.length} día(s)
                            </Badge>
                            <MemberFormDialog
                                teamId={teamId}
                                mode="edit"
                                initial={member}
                                onSaved={onUpdated}
                                trigger={
                                    <span
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex"
                                    >
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                    </span>
                                }
                            />
                            <span onClick={(e) => e.stopPropagation()}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => setConfirmDelete(true)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </span>
                            {expanded
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            }
                        </div>
                    </button>

                    {expanded && (
                        <div className="border-t px-4 pb-4 pt-3 space-y-5">
                            <ServiceAssignment
                                memberId={member.id}
                                assignedIds={member.services.map((s) => s.teamServiceId)}
                                allServices={allServices}
                                onToggle={(serviceId, assigned) => {
                                    onUpdated({
                                        ...member,
                                        services: assigned
                                            ? [...member.services, { teamServiceId: serviceId }]
                                            : member.services.filter((s) => s.teamServiceId !== serviceId),
                                    });
                                }}
                            />
                            <div className="h-px bg-border" />
                            <AvailabilityEditor
                                memberId={member.id}
                                initial={member.availability}
                                onSaved={(slots) =>
                                    onUpdated({
                                        ...member,
                                        availability: slots.map((s) => ({ ...s, id: '', teamMemberId: member.id })),
                                    })
                                }
                            />
                            <div className="h-px bg-border" />
                            <MemberConfigEditor
                                member={member}
                                onSaved={(cfg) => onUpdated({ ...member, ...cfg })}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar especialista</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Deseas eliminar a {member.name}? Se eliminarán también su disponibilidad y sus citas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                            {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MembersManager({ teamId, teamTimezone }: { teamId: string; teamTimezone: string }) {
    const [members, setMembers] = useState<Member[]>([]);
    const [allServices, setAllServices] = useState<{ id: string; name: string; duration: number }[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const [membersRes, servicesRes] = await Promise.all([
            getTeamMembers(teamId),
            getTeamServices(teamId),
        ]);
        if (membersRes.success && membersRes.data) setMembers(membersRes.data as Member[]);
        else toast.error(membersRes.message);
        if (servicesRes.success && servicesRes.data) {
            setAllServices(servicesRes.data.map((s) => ({ id: s.id, name: s.name, duration: s.duration })));
        }
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const upsert = (m: Member) => {
        setMembers((prev) => {
            const idx = prev.findIndex((x) => x.id === m.id);
            if (idx >= 0) { const copy = [...prev]; copy[idx] = m; return copy; }
            return [...prev, m];
        });
    };

    const remove = (id: string) => setMembers((prev) => prev.filter((m) => m.id !== id));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {members.length} especialista(s) — zona horaria: {teamTimezone}
                </p>
                <MemberFormDialog
                    teamId={teamId}
                    mode="create"
                    onSaved={upsert}
                    trigger={
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Plus className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Nuevo</span>
                        </Button>
                    }
                />
            </div>

            {loading && (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
                    ))}
                </div>
            )}

            {!loading && members.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="py-10 text-center">
                        <p className="text-sm text-muted-foreground">No hay especialistas aún.</p>
                        <MemberFormDialog
                            teamId={teamId}
                            mode="create"
                            onSaved={upsert}
                            trigger={<Button className="mt-3" size="sm">Agregar el primero</Button>}
                        />
                    </CardContent>
                </Card>
            )}

            {!loading && members.length > 0 && (
                <div className="space-y-3">
                    {members.map((m) => (
                        <MemberCard key={m.id} teamId={teamId} member={m} allServices={allServices} onUpdated={upsert} onDeleted={remove} />
                    ))}
                </div>
            )}
        </div>
    );
}
