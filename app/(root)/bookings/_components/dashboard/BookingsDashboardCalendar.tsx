'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { toast } from 'sonner';
import { startOfDay } from 'date-fns';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { Loader2, User, Calendar, Clock, Wrench } from 'lucide-react';
import { AppointmentStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { STATUS_LABELS } from '@/types/schedule';
import {
    getBookingAppointments, updateBookingAppointmentStatus, deleteBookingAppointment,
} from '@/actions/bookings-actions';

const STATUS_COLOR: Record<AppointmentStatus, string> = {
    PENDIENTE:   '#EAB308',
    CONFIRMADA:  '#22C55E',
    ATENDIDA:    '#3B82F6',
    NO_ASISTIDA: '#8B5CF6',
    CANCELADA:   '#EF4444',
    FINALIZADO:  '#059669',
    DESCARTADO:  '#52525B',
};

const ALL_STATUSES: AppointmentStatus[] = ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'NO_ASISTIDA', 'CANCELADA', 'FINALIZADO', 'DESCARTADO'];

interface Appt {
    id: string;
    clientName: string;
    clientPhone: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    status: AppointmentStatus;
    teamMember: { name: string; color?: string | null };
    teamService: { name: string; duration: number };
}

export function BookingsDashboardCalendar({ teamId, timezone }: { teamId: string; timezone: string }) {
    const [appts, setAppts] = useState<Appt[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Appt | null>(null);
    const [newStatus, setNewStatus] = useState<AppointmentStatus>('CONFIRMADA');
    const [changingStatus, setChangingStatus] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [activeView, setActiveView] = useState<'agenda' | 'week' | 'month'>('agenda');
    const [agendaMode, setAgendaMode] = useState(true);
    const calendarRef = useRef<FullCalendar>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getBookingAppointments(teamId);
        if (res.success && res.data) setAppts(res.data as Appt[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const el = wrapRef.current?.querySelector('.fc-view-harness') as HTMLElement | null;
        if (el) el.style.display = agendaMode ? 'none' : '';
        if (!agendaMode) requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
    }, [agendaMode]);

    useEffect(() => {
        const wrapper = wrapRef.current;
        if (!wrapper) return;
        wrapper.querySelector('.fc-agendaToggle-button')?.classList.toggle('fc-button-active', activeView === 'agenda');
        wrapper.querySelector('.fc-semanaBtn-button')?.classList.toggle('fc-button-active', activeView === 'week');
        wrapper.querySelector('.fc-mesBtn-button')?.classList.toggle('fc-button-active', activeView === 'month');
    }, [activeView]);

    const events = appts.map((a) => ({
        id: a.id,
        title: `${a.clientName} · ${a.teamService.name}`,
        start: new Date(a.startTime).toISOString(),
        end: new Date(a.endTime).toISOString(),
        backgroundColor: STATUS_COLOR[a.status],
        borderColor: STATUS_COLOR[a.status],
        extendedProps: { appt: a },
    }));

    const handleStatusChange = async () => {
        if (!selected) return;
        setChangingStatus(true);
        const res = await updateBookingAppointmentStatus(selected.id, newStatus);
        if (res.success) {
            setAppts((prev) => prev.map((a) => a.id === selected.id ? { ...a, status: newStatus } : a));
            setSelected({ ...selected, status: newStatus });
            toast.success('Estado actualizado');
        } else {
            toast.error(res.message);
        }
        setChangingStatus(false);
    };

    const handleDelete = async () => {
        if (!selected) return;
        setDeleting(true);
        const res = await deleteBookingAppointment(selected.id);
        if (res.success) {
            setAppts((prev) => prev.filter((a) => a.id !== selected.id));
            setSelected(null);
            toast.success('Cita eliminada');
        } else {
            toast.error(res.message);
        }
        setDeleting(false);
        setConfirmDelete(false);
    };

    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <>
            <div ref={wrapRef}>
                <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="timeGridDay"
                    locale={esLocale}
                    timeZone={timezone}
                    events={events}
                    datesSet={(info) => {
                        const next = startOfDay(info.start).getTime();
                        setActiveView((v) => v);
                    }}
                    customButtons={{
                        agendaToggle: {
                            text: isMobile ? 'D' : 'Día',
                            click: () => {
                                setAgendaMode(true);
                                setActiveView('agenda');
                                calendarRef.current?.getApi().changeView('timeGridDay');
                            },
                        },
                        semanaBtn: {
                            text: isMobile ? 'S' : 'Semana',
                            click: () => {
                                setAgendaMode(false);
                                setActiveView('week');
                                calendarRef.current?.getApi().changeView('timeGridWeek');
                            },
                        },
                        mesBtn: {
                            text: isMobile ? 'M' : 'Mes',
                            click: () => {
                                setAgendaMode(false);
                                setActiveView('month');
                                calendarRef.current?.getApi().changeView('dayGridMonth');
                            },
                        },
                    }}
                    headerToolbar={
                        isMobile
                            ? { left: 'prev,next', center: 'title', right: 'agendaToggle,semanaBtn,mesBtn' }
                            : { left: 'prev,next today', center: 'title', right: 'agendaToggle,semanaBtn,mesBtn' }
                    }
                    buttonText={{ today: 'Hoy' }}
                    height={agendaMode ? 'auto' : 'calc(100vh - 200px)'}
                    fixedWeekCount={false}
                    allDaySlot={false}
                    slotMinTime="07:00:00"
                    slotMaxTime="20:00:00"
                    eventClick={(info) => {
                        const appt: Appt = info.event.extendedProps.appt;
                        setSelected(appt);
                        setNewStatus(appt.status);
                    }}
                />

                {/* Agenda manual (modo Día) */}
                {agendaMode && (() => {
                    const todayStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
                    const dayAppts = appts
                        .filter((a) => formatInTimeZone(new Date(a.startTime), timezone, 'yyyy-MM-dd') === todayStr)
                        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
                    const morning = dayAppts.filter((a) => toZonedTime(new Date(a.startTime), timezone).getHours() < 12);
                    const afternoon = dayAppts.filter((a) => {
                        const h = toZonedTime(new Date(a.startTime), timezone).getHours();
                        return h >= 12 && h < 18;
                    });
                    const night = dayAppts.filter((a) => toZonedTime(new Date(a.startTime), timezone).getHours() >= 18);

                    return (
                        <div className={`grid gap-4 mt-4 ${night.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            {[{ label: 'MAÑANA', items: morning }, { label: 'TARDE', items: afternoon }, ...(night.length > 0 ? [{ label: 'NOCHE', items: night }] : [])].map(({ label, items }) => (
                                <div key={label}>
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
                                    {items.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">Sin citas</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {items.map((a) => {
                                                const localStart = toZonedTime(new Date(a.startTime), timezone);
                                                return (
                                                    <div
                                                        key={a.id}
                                                        onClick={() => { setSelected(a); setNewStatus(a.status); }}
                                                        className="cursor-pointer rounded-lg border border-border p-3 space-y-1.5 hover:bg-muted/40 transition-colors"
                                                        style={{ borderLeftWidth: 4, borderLeftColor: STATUS_COLOR[a.status] }}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-sm font-medium truncate">{a.clientName}</p>
                                                            <Badge className="text-[10px] shrink-0 ml-1" style={{ backgroundColor: STATUS_COLOR[a.status] + '20', color: STATUS_COLOR[a.status], border: 'none' }}>
                                                                {STATUS_LABELS[a.status]}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                            <Clock className="h-3 w-3" />
                                                            {format(localStart, 'h:mm a', { locale: es })}
                                                            <span className="mx-1">·</span>
                                                            <Wrench className="h-3 w-3" />
                                                            {a.teamService.name}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </div>

            {/* Detail dialog */}
            <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Detalle de cita</DialogTitle>
                    </DialogHeader>
                    {selected && (() => {
                        const localStart = toZonedTime(new Date(selected.startTime), timezone);
                        const localEnd   = toZonedTime(new Date(selected.endTime),   timezone);
                        return (
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">{selected.clientName}</p>
                                        <p className="text-xs text-muted-foreground">{selected.clientPhone}</p>
                                    </div>
                                </div>
                                <div className="space-y-1.5 text-sm">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {format(localStart, "d 'de' MMMM yyyy", { locale: es })}
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5" />
                                        {format(localStart, 'h:mm a')} – {format(localEnd, 'h:mm a')}
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Wrench className="h-3.5 w-3.5" />
                                        {selected.teamService.name} · {selected.teamService.duration} min
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <User className="h-3.5 w-3.5" />
                                        {selected.teamMember.name}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AppointmentStatus)}>
                                        <SelectTrigger className="h-8 text-xs flex-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ALL_STATUSES.map((s) => (
                                                <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button size="sm" className="h-8 text-xs" onClick={handleStatusChange} disabled={changingStatus || newStatus === selected.status}>
                                        {changingStatus && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                        Guardar
                                    </Button>
                                </div>
                                <Button variant="destructive" size="sm" className="w-full h-8 text-xs" onClick={() => setConfirmDelete(true)}>
                                    Eliminar cita
                                </Button>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar cita</AlertDialogTitle>
                        <AlertDialogDescription>¿Deseas eliminar la cita de {selected?.clientName}? Esta acción no se puede deshacer.</AlertDialogDescription>
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
