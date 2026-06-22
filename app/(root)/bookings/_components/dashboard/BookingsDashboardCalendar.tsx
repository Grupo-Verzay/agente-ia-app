'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { toast } from 'sonner';
import { startOfDay } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { Loader2, User, Calendar, Clock, Wrench, XCircleIcon } from 'lucide-react';
import { AppointmentStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STATUS_LABELS } from '@/types/schedule';
import {
    getBookingAppointments, updateBookingAppointmentStatus, deleteBookingAppointment,
} from '@/actions/bookings-actions';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<AppointmentStatus, string> = {
    PENDIENTE:   '#EAB308',
    CONFIRMADA:  '#22C55E',
    ATENDIDA:    '#3B82F6',
    NO_ASISTIDA: '#8B5CF6',
    CANCELADA:   '#EF4444',
    FINALIZADO:  '#059669',
    DESCARTADO:  '#52525B',
};

const CARD_STATUS_STYLE: Record<AppointmentStatus, string> = {
    PENDIENTE:   'border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
    CONFIRMADA:  'border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950/20',
    ATENDIDA:    'border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
    NO_ASISTIDA: 'border-l-4 border-l-violet-500 bg-violet-50 dark:bg-violet-950/20',
    CANCELADA:   'border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20',
    FINALIZADO:  'border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
    DESCARTADO:  'border-l-4 border-l-zinc-400 bg-zinc-50 dark:bg-zinc-900/20',
};

const ALL_STATUSES: AppointmentStatus[] = ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'NO_ASISTIDA', 'CANCELADA', 'FINALIZADO', 'DESCARTADO'];

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingsDashboardCalendar({ teamId, timezone }: { teamId: string; timezone: string }) {
    const [appts, setAppts] = useState<Appt[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Appt | null>(null);
    const [newStatus, setNewStatus] = useState<AppointmentStatus>('CONFIRMADA');
    const [changingStatus, setChangingStatus] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [agendaMode, setAgendaMode] = useState(true);
    const [agendaDate, setAgendaDate] = useState(() => startOfDay(new Date()));
    const [activeView, setActiveView] = useState<'agenda' | 'week' | 'month'>('agenda');
    const calendarRef = useRef<FullCalendar>(null);
    const calendarWrapRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getBookingAppointments(teamId);
        if (res.success && res.data) setAppts(res.data as Appt[]);
        else toast.error(res.message);
        setLoading(false);
    }, [teamId]);

    useEffect(() => { load(); }, [load]);

    const hideViewHarness = useCallback(() => {
        const el = calendarWrapRef.current?.querySelector('.fc-view-harness') as HTMLElement | null;
        if (el) el.style.display = agendaMode ? 'none' : '';
        if (!agendaMode) requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
    }, [agendaMode]);

    // Oculta/muestra el cuerpo al cambiar de modo
    useEffect(() => { hideViewHarness(); }, [hideViewHarness]);

    // Resalta el botón activo en el grupo Día/Semana/Mes
    useEffect(() => {
        const wrapper = calendarWrapRef.current;
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

    const openApptDialog = (appt: Appt) => {
        setSelected(appt);
        setNewStatus(appt.status);
    };

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

    // Agenda panels
    const dayAppts = useMemo(() =>
        appts
            .filter((a) =>
                formatInTimeZone(new Date(a.startTime), timezone, 'yyyy-MM-dd') ===
                formatInTimeZone(agendaDate, timezone, 'yyyy-MM-dd')
            )
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
        [appts, agendaDate, timezone]
    );
    const morningAppts   = dayAppts.filter((a) => toZonedTime(new Date(a.startTime), timezone).getHours() < 12);
    const afternoonAppts = dayAppts.filter((a) => { const h = toZonedTime(new Date(a.startTime), timezone).getHours(); return h >= 12 && h < 18; });
    const nightAppts     = dayAppts.filter((a) => toZonedTime(new Date(a.startTime), timezone).getHours() >= 18);
    const agendaColumnClass = nightAppts.length > 0 ? 'grid-cols-3' : 'grid-cols-2';

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
            {/* FullCalendar — toolbar siempre visible, cuerpo oculto en modo agenda */}
            <div
                ref={calendarWrapRef}
                className={agendaMode ? '[&_.fc-view-harness]:hidden' : undefined}
            >
                <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="timeGridDay"
                    locale={esLocale}
                    timeZone={timezone}
                    events={events}
                    datesSet={(info) => {
                        const next = startOfDay(info.start).getTime();
                        setAgendaDate((prev) => prev.getTime() === next ? prev : new Date(next));
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
                    height={agendaMode ? 'auto' : 'calc(100vh - 175px)'}
                    fixedWeekCount={false}
                    allDaySlot={false}
                    slotMinTime="07:00:00"
                    slotMaxTime="20:00:00"
                    titleFormat={
                        isMobile
                            ? { day: 'numeric', month: 'short' }
                            : { year: 'numeric', month: 'long', day: 'numeric' }
                    }
                    viewDidMount={() => hideViewHarness()}
                    eventClick={(info) => {
                        const appt = appts.find((a) => a.id === info.event.id);
                        if (!appt) return;
                        openApptDialog(appt);
                    }}
                />
            </div>

            {/* Panel Agenda: columnas Mañana / Tarde / Noche */}
            {agendaMode && (
                <div className={`grid ${agendaColumnClass} gap-4 pt-3`} style={{ height: 'calc(100vh - 230px)' }}>
                    {[
                        { label: 'Mañana', items: morningAppts },
                        { label: 'Tarde',  items: afternoonAppts },
                        ...(nightAppts.length > 0 ? [{ label: 'Noche', items: nightAppts }] : []),
                    ].map(({ label, items }) => (
                        <div key={label} className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-background/60 overflow-hidden">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2 border-b border-border/70">
                                {label}
                            </p>
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2">
                                {items.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center pt-6">Sin citas</p>
                                ) : items.map((appt) => {
                                    const color = STATUS_COLOR[appt.status];
                                    return (
                                        <button
                                            key={appt.id}
                                            type="button"
                                            onClick={() => openApptDialog(appt)}
                                            className={`w-full text-left rounded-lg px-3 py-2.5 transition-opacity hover:opacity-80 ${CARD_STATUS_STYLE[appt.status]}`}
                                        >
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <p className="text-sm font-bold leading-tight text-muted-foreground">
                                                        {formatInTimeZone(new Date(appt.startTime), timezone, 'HH:mm')} – {formatInTimeZone(new Date(appt.endTime), timezone, 'HH:mm')}
                                                    </p>
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-tight shrink-0">
                                                        {appt.teamService.name}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-semibold leading-tight truncate">
                                                    {appt.clientName || 'Sin nombre'}
                                                </p>
                                                <div className="flex items-end justify-between gap-3">
                                                    <span className="text-xs text-muted-foreground truncate">
                                                        {appt.teamMember.name}
                                                    </span>
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-tight shrink-0"
                                                        style={{ borderColor: color, backgroundColor: `${color}20`, color }}
                                                    >
                                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                        {STATUS_LABELS[appt.status]}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail dialog */}
            <AlertDialog
                open={!!selected}
                onOpenChange={(open) => { if (!open) { setSelected(null); setNewStatus('CONFIRMADA'); } }}
            >
                <AlertDialogContent className="border-border">
                    <Tabs defaultValue="details">
                        <div className="flex justify-between flex-row w-full items-center">
                            <TabsList>
                                <TabsTrigger value="details">Detalles</TabsTrigger>
                            </TabsList>
                            <div className="flex items-center gap-1">
                                <TabsList>
                                    <TabsTrigger value="status">Estado</TabsTrigger>
                                </TabsList>
                                <Button variant="ghost" onClick={() => setSelected(null)}>
                                    <XCircleIcon />
                                </Button>
                            </div>
                        </div>

                        {/* Estado */}
                        <TabsContent value="status">
                            <Card className="border-border min-h-[10rem]">
                                <CardHeader>
                                    <p className="text-sm text-muted-foreground">
                                        Estás por modificar el estado de la cita de{' '}
                                        <span className="font-medium">{selected?.clientName || 'este cliente'}</span>
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AppointmentStatus)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ALL_STATUSES.map((s) => (
                                                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>
                            <div className="flex justify-between pt-4">
                                <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
                                <Button
                                    onClick={async () => {
                                        await handleStatusChange();
                                        setSelected(null);
                                    }}
                                    disabled={changingStatus || newStatus === selected?.status}
                                >
                                    {changingStatus && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Actualizar
                                </Button>
                            </div>
                        </TabsContent>

                        {/* Detalles */}
                        <TabsContent value="details">
                            <Card className="border-border">
                                <CardHeader>
                                    <CardTitle className="text-lg font-medium">Detalles de la cita</CardTitle>
                                </CardHeader>
                                {selected && (
                                    <CardContent className="space-y-3 text-sm">
                                        <div className="flex gap-1">
                                            <strong className="uppercase font-medium">Cliente:</strong>
                                            {selected.clientName || 'Sin nombre'}
                                        </div>
                                        <div className="flex gap-1">
                                            <strong className="uppercase font-medium">Teléfono:</strong>
                                            {selected.clientPhone || 'No disponible'}
                                        </div>
                                        <div className="flex gap-1">
                                            <strong className="uppercase font-medium">Servicio:</strong>
                                            {selected.teamService.name}
                                        </div>
                                        <div className="flex gap-1">
                                            <strong className="uppercase font-medium">Especialista:</strong>
                                            {selected.teamMember.name}
                                        </div>
                                        <div className="flex gap-1">
                                            <strong className="uppercase font-medium">Estado:</strong>
                                            <span style={{ color: STATUS_COLOR[selected.status] }}>
                                                {STATUS_LABELS[selected.status]}
                                            </span>
                                        </div>
                                        <div className="flex gap-1">
                                            <strong className="uppercase font-medium">Fecha:</strong>
                                            {formatInTimeZone(new Date(selected.startTime), timezone, 'dd/MM/yyyy')}
                                        </div>
                                        <div className="flex gap-1">
                                            <strong className="uppercase font-medium">Hora:</strong>
                                            {formatInTimeZone(new Date(selected.startTime), timezone, 'HH:mm')} – {formatInTimeZone(new Date(selected.endTime), timezone, 'HH:mm')}
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                            <div className="flex justify-between pt-4">
                                <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
                                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Eliminar</Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent className="border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar cita</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Estás seguro de que quieres eliminar la cita de{' '}
                            <strong>{selected?.clientName || 'este cliente'}</strong>? Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleDelete}
                            disabled={deleting}
                        >
                            {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            Sí, eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
