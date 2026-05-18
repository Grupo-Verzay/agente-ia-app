'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { toast } from 'sonner';
import { Calendar, Clock, User, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AppointmentStatus } from '@prisma/client';
import { getBookingAppointments, updateBookingAppointmentStatus, deleteBookingAppointment } from '@/actions/bookings-actions';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { STATUS_LABELS } from '@/types/schedule';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
    PENDIENTE:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    CONFIRMADA:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    ATENDIDA:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    NO_ASISTIDA: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    CANCELADA:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    FINALIZADO:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    DESCARTADO:  'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

const ACTIVE_STATUSES: AppointmentStatus[] = ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'NO_ASISTIDA', 'CANCELADA', 'FINALIZADO', 'DESCARTADO'];

interface Appt {
    id: string;
    clientName: string;
    clientPhone: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    status: AppointmentStatus;
    notes?: string | null;
    teamMember: { id: string; name: string; color?: string | null };
    teamService: { id: string; name: string; duration: number };
}

function AppointmentCard({ appt, onStatusChange, onDelete }: {
    appt: Appt;
    onStatusChange: (id: string, status: AppointmentStatus) => void;
    onDelete: (id: string) => void;
}) {
    const [changing, setChanging] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const localStart = toZonedTime(new Date(appt.startTime), appt.timezone);
    const localEnd   = toZonedTime(new Date(appt.endTime),   appt.timezone);

    const handleStatus = async (status: AppointmentStatus) => {
        setChanging(true);
        const res = await updateBookingAppointmentStatus(appt.id, status);
        if (res.success) {
            onStatusChange(appt.id, status);
            toast.success('Estado actualizado');
        } else {
            toast.error(res.message);
        }
        setChanging(false);
    };

    const handleDelete = async () => {
        setDeleting(true);
        const res = await deleteBookingAppointment(appt.id);
        if (res.success) {
            onDelete(appt.id);
            toast.success('Cita eliminada');
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
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-semibold text-sm">{appt.clientName}</p>
                            <p className="text-xs text-muted-foreground">{appt.clientPhone}</p>
                        </div>
                        <Badge className={`text-xs shrink-0 ${STATUS_COLORS[appt.status]}`}>
                            {STATUS_LABELS[appt.status]}
                        </Badge>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(localStart, "d 'de' MMM yyyy", { locale: es })}
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(localStart, 'h:mm a')} – {format(localEnd, 'h:mm a')}
                        </span>
                        <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {appt.teamMember.name}
                        </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground truncate">
                            {appt.teamService.name} · {appt.teamService.duration} min
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                            <Select
                                value={appt.status}
                                onValueChange={(v) => handleStatus(v as AppointmentStatus)}
                                disabled={changing}
                            >
                                <SelectTrigger className="h-7 text-xs w-36">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ACTIVE_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s} className="text-xs">
                                            {STATUS_LABELS[s]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setConfirmDelete(true)}
                            >
                                ×
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar cita</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Deseas eliminar la cita de {appt.clientName}? Esta acción no se puede deshacer.
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

export function BookingsCalendar({ teamId }: { teamId: string }) {
    const [appts, setAppts] = useState<Appt[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<AppointmentStatus | 'ALL'>('ALL');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getBookingAppointments(teamId);
        if (res.success && res.data) setAppts(res.data as Appt[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const handleStatusChange = (id: string, status: AppointmentStatus) => {
        setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    };

    const handleDelete = (id: string) => {
        setAppts((prev) => prev.filter((a) => a.id !== id));
    };

    const filtered = filterStatus === 'ALL' ? appts : appts.filter((a) => a.status === filterStatus);

    const counts: Partial<Record<AppointmentStatus, number>> = {};
    for (const a of appts) counts[a.status] = (counts[a.status] ?? 0) + 1;

    return (
        <div className="space-y-4">
            {/* Métricas rápidas */}
            <div className="flex flex-wrap gap-2">
                {(['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'CANCELADA'] as AppointmentStatus[]).map((s) => (
                    <div key={s} className="flex-1 min-w-[120px]">
                        <Card className="border-border">
                            <CardContent className="p-3 text-center">
                                <p className="text-xl font-bold">{counts[s] ?? 0}</p>
                                <p className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</p>
                            </CardContent>
                        </Card>
                    </div>
                ))}
            </div>

            {/* Filtro */}
            <div className="flex items-center gap-2">
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                    <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue placeholder="Filtrar estado" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL" className="text-xs">Todos ({appts.length})</SelectItem>
                        {ACTIVE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                                {STATUS_LABELS[s]} ({counts[s] ?? 0})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Lista */}
            {loading && (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
                    ))}
                </div>
            )}

            {!loading && filtered.length === 0 && (
                <Card className="border-dashed">
                    <CardContent className="py-10 text-center">
                        <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No hay citas para mostrar.</p>
                    </CardContent>
                </Card>
            )}

            {!loading && filtered.length > 0 && (
                <div className="space-y-3">
                    {filtered
                        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                        .map((appt) => (
                            <AppointmentCard
                                key={appt.id}
                                appt={appt}
                                onStatusChange={handleStatusChange}
                                onDelete={handleDelete}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}
