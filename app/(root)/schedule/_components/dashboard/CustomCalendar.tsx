"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { toast } from "sonner";
import { startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

import { getAppointmentsByUser, updateAppointmentStatus, deleteAppointment } from "@/actions/appointments-actions";
import { AppointmentStatus, User } from "@prisma/client";
import { AppointmentWithSession, buildStatusOwnerMessage, normalizeAppointmentsToEvents } from "../../helpers";


import esLocale from '@fullcalendar/core/locales/es';

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";

import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import { ScheduleInterface } from "@/schema/schema";
import { XCircleIcon, Phone } from 'lucide-react';
import Link from "next/link";
import { sendMessageWithHistoryAction } from "@/actions/chat-history/send-message-with-history-action";
import { STATUS_LABELS } from "@/types/schedule";
import { fmtPhone } from "@/lib/whatsapp-jid";


const CARD_STATUS_STYLE: Record<AppointmentStatus, string> = {
    PENDIENTE:   'border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
    CONFIRMADA:  'border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950/20',
    ATENDIDA:    'border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
    NO_ASISTIDA: 'border-l-4 border-l-violet-500 bg-violet-50 dark:bg-violet-950/20',
    CANCELADA:   'border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20',
    FINALIZADO:  'border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
    DESCARTADO:  'border-l-4 border-l-zinc-400 bg-zinc-50 dark:bg-zinc-900/20',
};
const APPOINTMENT_STATUS_META: Record<AppointmentStatus, { label: string; color: string }> = {
    PENDIENTE:   { label: 'Pendiente',   color: '#EAB308' },
    CONFIRMADA:  { label: 'Confirmada',  color: '#22C55E' },
    ATENDIDA:    { label: 'Atendida',    color: '#3B82F6' },
    NO_ASISTIDA: { label: 'No asistida', color: '#8B5CF6' },
    CANCELADA:   { label: 'Cancelada',   color: '#EF4444' },
    FINALIZADO:  { label: 'Finalizado',  color: '#059669' },
    DESCARTADO:  { label: 'Descartado',  color: '#52525B' },
};


export const CustomCalendar = ({ user }: ScheduleInterface) => {
    const toastId = "progress-calendar";

    const [appointments, setAppointments] = useState<AppointmentWithSession[]>([]);
    const [currentAppointment, setCurrentAppointment] = useState<AppointmentWithSession>();
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [newStatus, setNewStatus] = useState<AppointmentStatus>("CONFIRMADA");
    const [openCancelAlert, setOpenCancelAlert] = useState(false);
    const [openDeleteAlert, setOpenDeleteAlert] = useState(false);

    const [agendaMode, setAgendaMode] = useState(true);
    const [agendaDate, setAgendaDate] = useState(() => startOfDay(new Date()));
    const [activeView, setActiveView] = useState<'agenda' | 'week' | 'month'>('agenda');
    const calendarRef = useRef<FullCalendar>(null);
    const calendarWrapRef = useRef<HTMLDivElement>(null);
    const ownerTz = user.timezone ?? 'America/Bogota';

    // Oculta/muestra el cuerpo del calendario segÃƒÆ’Ã‚Âºn el modo
    useEffect(() => {
        const el = calendarWrapRef.current?.querySelector('.fc-view-harness') as HTMLElement | null;
        if (el) el.style.display = agendaMode ? 'none' : '';
        if (!agendaMode) {
            requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
        }
    }, [agendaMode]);

    // Resalta el botÃƒÆ’Ã‚Â³n activo en el grupo DÃƒÆ’Ã‚Â­a/Semana/Mes
    useEffect(() => {
        const wrapper = calendarWrapRef.current;
        if (!wrapper) return;
        const diaBtn    = wrapper.querySelector('.fc-agendaToggle-button');
        const semanaBtn = wrapper.querySelector('.fc-semanaBtn-button');
        const mesBtn    = wrapper.querySelector('.fc-mesBtn-button');
        diaBtn?.classList.toggle('fc-button-active', activeView === 'agenda');
        semanaBtn?.classList.toggle('fc-button-active', activeView === 'week');
        mesBtn?.classList.toggle('fc-button-active', activeView === 'month');
    }, [activeView]);

    const loadAppointments = useCallback(async () => {
        const res = await getAppointmentsByUser(user.effectiveId ?? user.id);
        if (res.success) {
            setAppointments((res.data || []) as AppointmentWithSession[]);
            toast.success("Agenda cargada con éxito", { id: toastId });
        } else {
            toast.error(res.message, { id: toastId });
        }
    }, [user.effectiveId ?? user.id, toastId]);

    useEffect(() => {
        toast.loading("Cargando su agenda, un momento por favor...", {
            id: toastId,
        });
        void loadAppointments();
    }, [loadAppointments]);

    const handleStatusChange = async (id: string, status: AppointmentStatus) => {
        toast.loading("Actualizando el estado de la cita...", { id: toastId });

        const res = await updateAppointmentStatus(id, status);
        if (res.success) {
            toast.success("Estado actualizado correctamente", { id: toastId });

            if (status !== 'FINALIZADO' && status !== 'DESCARTADO') await notifyChangeStatus();
            await loadAppointments();
        } else {
            toast.error(res.message, { id: toastId });
        }
    };

    const events = normalizeAppointmentsToEvents(appointments);
    const selectedAppointment = appointments.find((a) => a.id === selectedEventId);

    const dayAppts = useMemo(() =>
        appointments
            .filter(a =>
                formatInTimeZone(new Date(a.startTime), ownerTz, 'yyyy-MM-dd') ===
                formatInTimeZone(agendaDate, ownerTz, 'yyyy-MM-dd')
            )
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
        [appointments, agendaDate, ownerTz]
    );
    const morningAppts = dayAppts.filter(a => toZonedTime(new Date(a.startTime), ownerTz).getHours() < 12);
    const afternoonAppts = dayAppts.filter(a => {
        const hour = toZonedTime(new Date(a.startTime), ownerTz).getHours();
        return hour >= 12 && hour < 18;
    });
    const nightAppts = dayAppts.filter(a => toZonedTime(new Date(a.startTime), ownerTz).getHours() >= 18);
    const agendaColumnClass = nightAppts.length > 0 ? "grid-cols-3" : "grid-cols-2";

    const openApptDialog = (appt: AppointmentWithSession) => {
        setSelectedEventId(appt.id);
        setCurrentAppointment(appt);
        setNewStatus(appt.status);
        setOpenDialog(true);
    };


    const notifyChangeStatus = async () => {
        if (!user.apiKey || !user.instancias || !currentAppointment) return toast.info('Campos incompletos o vacios');

        const urlevo = user.apiKey?.url;
        const apikey = user.apiKey.key;
        const instanceName = user.instancias[0]?.instanceName ?? "";

        const url = `https://${urlevo}/message/sendText/${instanceName}`;
        const text = buildStatusOwnerMessage({
            appointment: currentAppointment,
            newStatus,
            userId: user.effectiveId ?? user.id
        });

        const remoteJid = currentAppointment.session.remoteJid;

        try {
            const result = await sendMessageWithHistoryAction({
                instanceName,
                url,
                apikey,
                remoteJid,
                message: text,
                historyType: 'notification',
                additionalKwargs: {
                    source: 'CustomCalendar',
                    appointmentId: currentAppointment.id,
                    nextStatus: newStatus,
                },
            });

            if (result.success) {
                toast.success(result.message);
            } else {
                toast.info(`No se enviÃƒÆ’Ã‚Â³ el mensaje de notificaciÃƒÆ’Ã‚Â³n`);
                console.error(`Error SchedulePageClient line: 232 ${result.message}`)
            }

        } catch (error) {
            console.error("Error en notificaciÃƒÆ’Ã‚Â³n:", error);
            toast.error("curriÃƒÆ’Ã‚Â³ un error al intentar notificar la cita.");
        }
    };

    const isMobile =
        typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;

    return (
        <>
            {/* FullCalendar - toolbar siempre visible */}
            <div ref={calendarWrapRef}>
                <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="timeGridDay"
                    timeZone="local"
                    events={events}
                    datesSet={(info) => {
                        const next = startOfDay(info.start).getTime();
                        setAgendaDate(prev => prev.getTime() === next ? prev : new Date(next));
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
                            ? { left: "prev,next", center: "title", right: "agendaToggle,semanaBtn,mesBtn" }
                            : { left: "prev,next today", center: "title", right: "agendaToggle,semanaBtn,mesBtn" }
                    }
                    buttonText={{ today: "Hoy" }}
                    editable={true}
                    height={agendaMode ? "auto" : "calc(100vh - 175px)"}
                    fixedWeekCount={false}
                    allDaySlot={false}
                    slotMinTime="07:00:00"
                    slotMaxTime="19:00:00"
                    eventClick={(info) => {
                        const appt = appointments.find((a) => a.id === info.event.id);
                        if (!appt) return;
                        openApptDialog(appt);
                    }}
                    titleFormat={
                        isMobile
                            ? { day: "numeric", month: "short" }
                            : { year: "numeric", month: "long", day: "numeric" }
                    }
                    locale={esLocale}
                />
            </div>

            {/* Panel Agenda: dos columnas Mañana / Tarde */}
            {agendaMode && (
                <div className={`grid ${agendaColumnClass} gap-4 pt-3`} style={{ height: 'calc(100vh - 230px)' }}>
                    {/* Mañana */}
                    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-background/60 overflow-hidden">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2 border-b border-border/70">
                            Mañana
                        </p>
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2">
                            {morningAppts.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center pt-6">Sin citas</p>
                            ) : morningAppts.map((appt) => {
                                const status = APPOINTMENT_STATUS_META[appt.status];
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
                                                    {formatInTimeZone(new Date(appt.startTime), ownerTz, "HH:mm")} – {formatInTimeZone(new Date(appt.endTime), ownerTz, "HH:mm")}
                                                </p>
                                                {appt.service?.name && (
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-tight shrink-0">
                                                        {appt.service.name}
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-sm font-semibold leading-tight truncate">
                                                {appt.clientName || appt.session?.pushName || "Sin nombre"}
                                            </p>

                                            <div className="flex items-end justify-between gap-3">
                                                <Link
                                                    href={`/chats?jid=${encodeURIComponent(appt.session.remoteJid)}`}
                                                    className="flex items-center gap-1 text-xs text-primary hover:underline leading-tight min-w-0"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Phone className="w-3 h-3 shrink-0" />
                                                    {fmtPhone(appt.session.remoteJid)}
                                                </Link>

                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-tight shrink-0"
                                                    style={{
                                                        borderColor: status.color,
                                                        backgroundColor: `${status.color}20`,
                                                        color: status.color,
                                                    }}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                                                    {status.label}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tarde */}
                    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-background/60 overflow-hidden">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2 border-b border-border/70">
                            Tarde
                        </p>
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2">
                            {afternoonAppts.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center pt-6">Sin citas</p>
                            ) : afternoonAppts.map((appt) => {
                                const status = APPOINTMENT_STATUS_META[appt.status];
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
                                                    {formatInTimeZone(new Date(appt.startTime), ownerTz, "HH:mm")} – {formatInTimeZone(new Date(appt.endTime), ownerTz, "HH:mm")}
                                                </p>
                                                {appt.service?.name && (
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-tight shrink-0">
                                                        {appt.service.name}
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-sm font-semibold leading-tight truncate">
                                                {appt.clientName || appt.session?.pushName || "Sin nombre"}
                                            </p>

                                            <div className="flex items-end justify-between gap-3">
                                                <Link
                                                    href={`/chats?jid=${encodeURIComponent(appt.session.remoteJid)}`}
                                                    className="flex items-center gap-1 text-xs text-primary hover:underline leading-tight min-w-0"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Phone className="w-3 h-3 shrink-0" />
                                                    {fmtPhone(appt.session.remoteJid)}
                                                </Link>

                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-tight shrink-0"
                                                    style={{
                                                        borderColor: status.color,
                                                        backgroundColor: `${status.color}20`,
                                                        color: status.color,
                                                    }}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                                                    {status.label}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {nightAppts.length > 0 && (
                        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-background/60 overflow-hidden">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2 border-b border-border/70">
                                Noche
                            </p>
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2">
                                {nightAppts.map((appt) => {
                                    const status = APPOINTMENT_STATUS_META[appt.status];
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
                                                        {formatInTimeZone(new Date(appt.startTime), ownerTz, "HH:mm")} – {formatInTimeZone(new Date(appt.endTime), ownerTz, "HH:mm")}
                                                    </p>
                                                    {appt.service?.name && (
                                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-tight shrink-0">
                                                            {appt.service.name}
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-sm font-semibold leading-tight truncate">
                                                    {appt.clientName || appt.session?.pushName || "Sin nombre"}
                                                </p>

                                                <div className="flex items-end justify-between gap-3">
                                                    <Link
                                                        href={`/chats?jid=${encodeURIComponent(appt.session.remoteJid)}`}
                                                        className="flex items-center gap-1 text-xs text-primary hover:underline leading-tight min-w-0"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Phone className="w-3 h-3 shrink-0" />
                                                        {fmtPhone(appt.session.remoteJid)}
                                                    </Link>

                                                    <span
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-tight shrink-0"
                                                        style={{
                                                            borderColor: status.color,
                                                            backgroundColor: `${status.color}20`,
                                                            color: status.color,
                                                        }}
                                                    >
                                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                                                        {status.label}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <AlertDialog
                open={openDialog}
                onOpenChange={(open) => {
                    setOpenDialog(open);
                    if (!open) {
                        setSelectedEventId(null);
                        setNewStatus("CONFIRMADA");
                    }
                }}
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
                                <Button variant={"ghost"} onClick={() => setOpenDialog(false)}><XCircleIcon /></Button>
                            </div>
                        </div>
                        <TabsContent value="status">
                            <Card className="border-border min-h-[10rem]">
                                <CardHeader>
                                    <CardDescription>
                                        EstÃƒÆ’Ã‚Â¡s por modificar el estado de la cita:
                                        <span className="text-muted-foreground">
                                            {selectedAppointment?.clientName || selectedAppointment?.session?.pushName || "Cliente desconocido"}
                                        </span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Select
                                        value={newStatus}
                                        onValueChange={(val) => setNewStatus(val as AppointmentStatus)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar estado" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                                            <SelectItem value="CONFIRMADA">Confirmada</SelectItem>
                                            <SelectItem value="ATENDIDA">Atendida</SelectItem>
                                            <SelectItem value="NO_ASISTIDA">No asistida</SelectItem>
                                            <SelectItem value="CANCELADA">Cancelada</SelectItem>
                                            <SelectItem value="FINALIZADO">Finalizado</SelectItem>
                                            <SelectItem value="DESCARTADO">Descartado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                            </Card>
                            <div className="flex justify-between pt-4">
                                <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
                                <Button
                                    onClick={() => {
                                        if (!selectedEventId) return;
                                        if (newStatus === "CANCELADA") {
                                            setOpenCancelAlert(true);
                                            return;
                                        }
                                        handleStatusChange(selectedEventId, newStatus);
                                        setOpenDialog(false);
                                    }}
                                >
                                    Actualizar
                                </Button>
                            </div>
                        </TabsContent>
                        {/* Pestaña de Detalles */}
                        <TabsContent value="details">
                            <Card className="border-border">
                                <CardHeader>
                                    <CardTitle className="text-lg font-medium">Detalles de la Cita</CardTitle>
                                </CardHeader>
                                {currentAppointment &&
                                    <CardContent>
                                        {/* Información general de la cita */}
                                        <div className="space-y-3">
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">Cliente:</strong>
                                                {currentAppointment.clientName || currentAppointment.session.pushName || "Cliente desconocido"}
                                            </div>
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">TelÃƒÆ’Ã‚Â©fono:</strong>
                                                {fmtPhone(currentAppointment.session.remoteJid) || "No disponible"}
                                            </div>
                                            <div className="flex text-sm gap-1 flex-row">
                                                {currentAppointment.service && (
                                                    <>
                                                        <strong className="uppercase font-medium">Servicio:</strong>
                                                        {currentAppointment.service.name || "No disponible"}
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">Estado de la cita: </strong>
                                                <span
                                                    className={`font-normal ${currentAppointment.status === "CANCELADA"
                                                        ? "text-red-600"
                                                        : currentAppointment.status === "NO_ASISTIDA"
                                                            ? "text-gray-600"
                                                            : currentAppointment.status === "ATENDIDA"
                                                                ? "text-blue-600"
                                                                : currentAppointment.status === "CONFIRMADA"
                                                                    ? "text-green-600"
                                                                    : "text-yellow-600"
                                                        }`}
                                                >
                                                    {STATUS_LABELS[currentAppointment.status]}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="space-y-3 mt-4">
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">Fecha:</strong>
                                                {formatInTimeZone(new Date(currentAppointment.startTime), ownerTz, "dd/MM/yyyy")}
                                            </div>
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">Hora:</strong>
                                                {formatInTimeZone(new Date(currentAppointment.startTime), ownerTz, "HH:mm")} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ {formatInTimeZone(new Date(currentAppointment.endTime), ownerTz, "HH:mm")}
                                            </div>
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">Zona Horaria:</strong>
                                                {currentAppointment.timezone || "No especificada"}
                                            </div>
                                        </div>
                                    </CardContent>
                                }
                            </Card>
                            <div className="flex justify-between pt-4">
                                <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
                                <Button variant="destructive" onClick={() => setOpenDeleteAlert(true)}>Eliminar</Button>
                            </div>
                        </TabsContent>

                    </Tabs>
                </AlertDialogContent>
            </AlertDialog >

            <AlertDialog open={openDeleteAlert} onOpenChange={setOpenDeleteAlert}>
                <AlertDialogContent className="border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar cita</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ãƒâ€šÃ‚Â¿EstÃƒÆ’Ã‚Â¡s seguro de que quieres eliminar la cita de{" "}
                            <strong>{selectedAppointment?.clientName || selectedAppointment?.session?.pushName || "este cliente"}</strong>?
                            Esta acciÃƒÆ’Ã‚Â³n no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                                if (!selectedEventId) return;
                                toast.loading("Eliminando cita...", { id: toastId });
                                const res = await deleteAppointment(selectedEventId);
                                if (res.success) {
                                    toast.success("Cita eliminada", { id: toastId });
                                    setOpenDeleteAlert(false);
                                    setOpenDialog(false);
                                    await loadAppointments();
                                } else {
                                    toast.error(res.message || "Error al eliminar", { id: toastId });
                                }
                            }}
                        >
                            SÃƒÆ’Ã‚Â­, eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={openCancelAlert} onOpenChange={setOpenCancelAlert}>
                <AlertDialogContent className="border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar cancelaciÃƒÆ’Ã‚Â³n</AlertDialogTitle>
                        <AlertDialogDescription>
                            Al cambiar el estado a <strong>CANCELADA</strong>, se eliminarÃƒÆ’Ã‚Â¡n todos los recordatorios/seguimientos del agendamiento asociados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter className="gap-2 sm:justify-between">
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>

                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (!selectedEventId) return;

                                handleStatusChange(selectedEventId, newStatus);
                                setOpenCancelAlert(false);
                                setOpenDialog(false);
                            }}
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

