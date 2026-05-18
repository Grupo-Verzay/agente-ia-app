'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function AvailabilityEditor({
    memberId,
    initial,
    onSaved,
}: {
    memberId: string;
    initial: { dayOfWeek: number; startTime: string; endTime: string }[];
    onSaved: (slots: AvailabilitySlot[]) => void;
}) {
    const [saving, setSaving] = useState(false);
    const [slots, setSlots] = useState<AvailabilitySlot[]>(
        initial.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))
    );

    const hasDay = (day: number) => slots.some((s) => s.dayOfWeek === day);

    const toggleDay = (day: number) => {
        if (hasDay(day)) {
            setSlots((prev) => prev.filter((s) => s.dayOfWeek !== day));
        } else {
            setSlots((prev) => [...prev, { dayOfWeek: day, startTime: '09:00', endTime: '17:00' }]);
        }
    };

    const updateSlot = (day: number, field: 'startTime' | 'endTime', value: string) => {
        setSlots((prev) =>
            prev.map((s) => (s.dayOfWeek === day ? { ...s, [field]: value } : s))
        );
    };

    const handleSave = async () => {
        setSaving(true);
        const res = await setMemberAvailability(memberId, slots);
        if (res.success) {
            onSaved(slots);
            toast.success('Disponibilidad guardada');
        } else {
            toast.error(res.message);
        }
        setSaving(false);
    };

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium">Disponibilidad semanal</p>
            <div className="space-y-2">
                {Array.from({ length: 7 }, (_, day) => {
                    const active = hasDay(day);
                    const slot = slots.find((s) => s.dayOfWeek === day);
                    return (
                        <div key={day} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => toggleDay(day)}
                                className={[
                                    'w-10 text-xs font-medium rounded py-1 transition-colors shrink-0',
                                    active
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                ].join(' ')}
                            >
                                {DAY_LABELS[day]}
                            </button>
                            {active && slot && (
                                <>
                                    <Select value={slot.startTime} onValueChange={(v) => updateSlot(day, 'startTime', v)}>
                                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {HOURS.map((h) => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <span className="text-xs text-muted-foreground">–</span>
                                    <Select value={slot.endTime} onValueChange={(v) => updateSlot(day, 'endTime', v)}>
                                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {HOURS.map((h) => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </>
                            )}
                            {!active && <span className="text-xs text-muted-foreground">No disponible</span>}
                        </div>
                    );
                })}
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Guardar disponibilidad
            </Button>
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
                const member: Member = {
                    ...(initial ?? { id: (res.data as any).id, isActive: true, services: [] }),
                    ...(res.data as any),
                    availability: initial?.availability ?? [],
                };
                onSaved(member);
                toast.success(mode === 'create' ? 'Especialista creado' : 'Especialista actualizado');
                setOpen(false);
            } else {
                toast.error((res as any).message);
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
            <Card className="border-border">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
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
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                }
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setConfirmDelete(true)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setExpanded((p) => !p)}
                            >
                                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                        </div>
                    </div>

                    {expanded && (
                        <div className="border-t pt-3 space-y-5">
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
            setAllServices((servicesRes.data as any[]).map((s) => ({ id: s.id, name: s.name, duration: s.duration })));
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
