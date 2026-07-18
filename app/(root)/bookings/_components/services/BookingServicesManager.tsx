'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import {
    createTeamService, updateTeamService, deleteTeamService,
    getTeamServices, getTeamMembers,
    assignServiceToMember, removeServiceFromMember,
} from '@/actions/bookings-actions';

interface ServiceReminder {
    timeMinutes: number;
    message: string;
}

interface TeamService {
    id: string;
    name: string;
    description: string | null;
    duration: number;
    messageText: string | null;
    remindersConfig: ServiceReminder[] | null;
    color: string | null;
    isActive: boolean;
    order: number;
    members: { teamMemberId: string }[];
}

interface TeamMemberBasic {
    id: string;
    name: string;
    color: string | null;
}

const serviceSchema = z.object({
    name:        z.string().min(2, 'El nombre es obligatorio'),
    description: z.string().optional(),
    duration:    z.coerce.number().min(5, 'Mínimo 5 minutos').max(480, 'Máximo 8 horas'),
    messageText: z.string().optional(),
    color:       z.string().optional(),
});
type ServiceFormValues = z.infer<typeof serviceSchema>;

const DEFAULT_MSG = `👋 Hola @client_name, tu *RESERVA* de *@service_name* fue agendada con éxito.

📝 Detalles de la Reserva:

⏳ *Inicia*: 👇
@appointment_datetime

⌛ *Duración*: @appointment_duration`;

// ─── Specialist assignment ─────────────────────────────────────────────────────

function SpecialistAssignment({
    serviceId, assignedMemberIds, allMembers, onToggle,
}: {
    serviceId: string;
    assignedMemberIds: string[];
    allMembers: TeamMemberBasic[];
    onToggle: (memberId: string, assigned: boolean) => void;
}) {
    const [loading, setLoading] = useState<string | null>(null);

    const handleToggle = async (memberId: string) => {
        const isAssigned = assignedMemberIds.includes(memberId);
        setLoading(memberId);
        const res = isAssigned
            ? await removeServiceFromMember(memberId, serviceId)
            : await assignServiceToMember(memberId, serviceId);
        if (res.success) {
            onToggle(memberId, !isAssigned);
            toast.success(isAssigned ? 'Especialista removido' : 'Especialista asignado');
        } else {
            toast.error(res.message);
        }
        setLoading(null);
    };

    if (!allMembers.length) {
        return <p className="text-xs text-muted-foreground">Crea especialistas primero en la pestaña Especialistas.</p>;
    }

    return (
        <div className="space-y-2">
            <p className="text-sm font-medium">Especialistas que lo atienden</p>
            <div className="flex flex-wrap gap-2">
                {allMembers.map((m) => {
                    const assigned = assignedMemberIds.includes(m.id);
                    return (
                        <button
                            key={m.id}
                            type="button"
                            disabled={loading === m.id}
                            onClick={() => handleToggle(m.id)}
                            className={[
                                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                assigned
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/50',
                                loading === m.id ? 'opacity-50 cursor-wait' : '',
                            ].join(' ')}
                        >
                            {loading === m.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color ?? '#3B82F6' }} />
                            {assigned ? '✓ ' : '+ '}{m.name}
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-muted-foreground">
                {assignedMemberIds.length === 0
                    ? 'Sin asignación — todos los especialistas aparecen para este servicio.'
                    : `${assignedMemberIds.length} especialista(s) asignado(s).`}
            </p>
        </div>
    );
}

// ─── Service form dialog ───────────────────────────────────────────────────────

function ServiceFormDialog({
    teamId, mode, initial, onSaved, trigger,
}: {
    teamId: string;
    mode: 'create' | 'edit';
    initial?: TeamService;
    onSaved: (service: TeamService) => void;
    trigger: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<ServiceFormValues>({
        resolver: zodResolver(serviceSchema),
        defaultValues: {
            name:        initial?.name        ?? '',
            description: initial?.description ?? '',
            duration:    initial?.duration    ?? 60,
            messageText: initial?.messageText ?? DEFAULT_MSG,
            color:       initial?.color       ?? '#3B82F6',
        },
    });

    const onSubmit = async (values: ServiceFormValues) => {
        setSubmitting(true);
        try {
            let res;
            if (mode === 'create') {
                res = await createTeamService(teamId, values);
            } else {
                res = await updateTeamService(initial!.id, values);
            }
            if (res.success && res.data) {
                const data = res.data as TeamService;
                const svc: TeamService = {
                    ...(initial ?? { id: data.id, isActive: true, order: 0, members: [], remindersConfig: null }),
                    ...data,
                };
                onSaved(svc);
                toast.success(mode === 'create' ? 'Servicio creado' : 'Servicio actualizado');
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
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Nuevo servicio' : 'Editar servicio'}</DialogTitle>
                    <DialogDescription>Define el servicio que ofrecerán los especialistas de tu equipo.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="overflow-auto max-h-[30rem] pr-2 space-y-4 py-2">
                            <FormField control={form.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nombre del servicio</FormLabel>
                                    <FormControl><Input placeholder="Ej: Consulta médica" {...field} className="uppercase" onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="duration" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Duración (min)</FormLabel>
                                        <FormControl><Input type="number" min={5} max={480} {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="color" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Color</FormLabel>
                                        <FormControl>
                                            <div className="flex items-center gap-2">
                                                <input type="color" className="h-9 w-14 rounded border cursor-pointer" {...field} />
                                                <span className="text-xs text-muted-foreground">{field.value}</span>
                                            </div>
                                        </FormControl>
                                    </FormItem>
                                )} />
                            </div>
                            <FormField control={form.control} name="description" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descripción (opcional)</FormLabel>
                                    <FormControl><Input placeholder="Breve descripción para el cliente" {...field} /></FormControl>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="messageText" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Mensaje WhatsApp de confirmación</FormLabel>
                                    <FormControl>
                                        <Textarea className="min-h-[160px] max-h-[360px] resize-y text-xs" {...field} />
                                    </FormControl>
                                    <FormDescription className="text-xs">
                                        Variables: @client_name, @service_name, @appointment_datetime, @appointment_duration
                                    </FormDescription>
                                </FormItem>
                            )} />
                        </div>
                        <DialogFooter className="pt-2">
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

// ─── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({
    teamId, service, allMembers, onUpdated, onDeleted,
}: {
    teamId: string;
    service: TeamService;
    allMembers: TeamMemberBasic[];
    onUpdated: (s: TeamService) => void;
    onDeleted: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        const res = await deleteTeamService(service.id);
        if (res.success) {
            onDeleted(service.id);
            toast.success('Servicio eliminado');
        } else {
            toast.error(res.message);
        }
        setDeleting(false);
        setConfirmDelete(false);
    };

    const reminders: ServiceReminder[] = Array.isArray(service.remindersConfig) ? service.remindersConfig : [];

    return (
        <>
            <Card className="border-border">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-1.5 rounded-full shrink-0" style={{ backgroundColor: service.color ?? '#3B82F6' }} />
                            <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{service.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-xs">{service.duration} min</Badge>
                                    <Badge variant="outline" className="text-xs">
                                        {service.members.length === 0 ? 'Todos los especialistas' : `${service.members.length} especialista(s)`}
                                    </Badge>
                                    {reminders.length > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                            <Bell className="h-2.5 w-2.5 mr-1" />
                                            {reminders.length} recordatorio(s)
                                        </Badge>
                                    )}
                                    {service.description && (
                                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">{service.description}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <ServiceFormDialog
                                teamId={teamId}
                                mode="edit"
                                initial={service}
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded((p) => !p)}>
                                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                        </div>
                    </div>

                    {expanded && (
                        <div className="border-t pt-3">
                            <SpecialistAssignment
                                serviceId={service.id}
                                assignedMemberIds={service.members.map((m) => m.teamMemberId)}
                                allMembers={allMembers}
                                onToggle={(memberId, assigned) => {
                                    onUpdated({
                                        ...service,
                                        members: assigned
                                            ? [...service.members, { teamMemberId: memberId }]
                                            : service.members.filter((m) => m.teamMemberId !== memberId),
                                    });
                                }}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar servicio</AlertDialogTitle>
                        <AlertDialogDescription>¿Deseas eliminar "{service.name}"? Esta acción no se puede deshacer.</AlertDialogDescription>
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

// ─── Main component ────────────────────────────────────────────────────────────

export function BookingServicesManager({ teamId }: { teamId: string }) {
    const [services, setServices] = useState<TeamService[]>([]);
    const [allMembers, setAllMembers] = useState<TeamMemberBasic[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const [servicesRes, membersRes] = await Promise.all([
            getTeamServices(teamId),
            getTeamMembers(teamId),
        ]);
        if (servicesRes.success && servicesRes.data) setServices(servicesRes.data as TeamService[]);
        else toast.error(servicesRes.message);
        if (membersRes.success && membersRes.data) {
            setAllMembers(membersRes.data.map((m) => ({ id: m.id, name: m.name, color: m.color })));
        }
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const upsert = (s: TeamService) => {
        setServices((prev) => {
            const idx = prev.findIndex((x) => x.id === s.id);
            if (idx >= 0) { const copy = [...prev]; copy[idx] = s; return copy; }
            return [...prev, s];
        });
    };

    const remove = (id: string) => setServices((prev) => prev.filter((s) => s.id !== id));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{services.length} servicio(s)</p>
                <ServiceFormDialog
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

            {!loading && services.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="py-10 text-center">
                        <p className="text-sm text-muted-foreground">No hay servicios aún.</p>
                        <ServiceFormDialog
                            teamId={teamId}
                            mode="create"
                            onSaved={upsert}
                            trigger={<Button className="mt-3" size="sm">Crear el primero</Button>}
                        />
                    </CardContent>
                </Card>
            )}

            {!loading && services.length > 0 && (
                <div className="space-y-3">
                    {services.map((s) => (
                        <ServiceCard
                            key={s.id}
                            teamId={teamId}
                            service={s}
                            allMembers={allMembers}
                            onUpdated={upsert}
                            onDeleted={remove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
