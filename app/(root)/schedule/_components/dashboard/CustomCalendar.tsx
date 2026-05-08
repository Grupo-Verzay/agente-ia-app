"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { toast } from "sonner";
import { isSameDay, startOfDay, format } from "date-fns";
import { es } from "date-fns/locale";

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
import { LeadStatus } from "@prisma/client";

const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; cls: string; dot: string }> = {
    FRIO:       { label: 'Frío',       cls: 'bg-blue-100 text-blue-700 border-blue-300',    dot: 'bg-blue-500' },
    TIBIO:      { label: 'Tibio',      cls: 'bg-yellow-100 text-yellow-700 border-yellow-300', dot: 'bg-yellow-500' },
    CALIENTE:   { label: 'Caliente',   cls: 'bg-red-100 text-red-700 border-red-300',       dot: 'bg-red-500' },
    FINALIZADO: { label: 'Finalizado', cls: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-500' },
    DESCARTADO: { label: 'Descartado', cls: 'bg-gray-100 text-gray-600 border-gray-300',    dot: 'bg-gray-400' },
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

const CARD_STATUS_DOT: Record<AppointmentStatus, string> = {
    PENDIENTE:   'bg-yellow-500',
    CONFIRMADA:  'bg-green-500',
    ATENDIDA:    'bg-blue-500',
    NO_ASISTIDA: 'bg-violet-500',
    CANCELADA:   'bg-red-500',
    FINALIZADO:  'bg-emerald-500',
    DESCARTADO:  'bg-zinc-400',
};

export const CustomCalendar = ({ user }: ScheduleInterface) => {
    const toastId = "progress-calendar";

    const [appointments, setAppointments] = useState<AppointmentWithSession[]>([]);
    const [seguimientosMap, setSeguimientosMap] = useState<Record<string, number>>({});
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

    // Oculta/muestra el cuerpo del calendario según el modo
    useEffect(() => {
        const el = calendarWrapRef.current?.querySelector('.fc-view-harness') as HTMLElement | null;
        if (el) el.style.display = agendaMode ? 'none' : '';
        if (!agendaMode) {
            requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
        }
    }, [agendaMode]);

    // Resalta el botón activo en el grupo Día/Semana/Mes
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
        const res = await getAppointmentsByUser(user.id);
        if (res.success) {
            setAppointments((res.data || []) as AppointmentWithSession[]);
            setSeguimientosMap(res.seguimientosCount ?? {});
            toast.success("Agenda cargada con éxito", { id: toastId });
        } else {
            toast.error(res.message, { id: toastId });
        }
    }, [user.id, toastId]);

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
            .filter(a => isSameDay(new Date(a.startTime), agendaDate))
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
        [appointments, agendaDate]
    );
    const morningAppts = dayAppts.filter(a => new Date(a.startTime).getHours() < 12);
    const afternoonAppts = dayAppts.filter(a => new Date(a.startTime).getHours() >= 12);

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
            userId: user.id
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
                toast.info(`No se envió el mensaje de notificación`);
                console.error(`Error SchedulePageClient line: 232 ${result.message}`)
            }

        } catch (error) {
            console.error("Error en notificación:", error);
            toast.error("currió un error al intentar notificar la cita.");
        }
    };

    const isMobile =
        typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;

    return (
        <>
            {/* ── FullCalendar — toolbar siempre visible ─────────────── */}
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

            {/* ── Panel Agenda: dos columnas Mañana / Tarde ─────────── */}
            {agendaMode && (
                <div className="grid grid-cols-2 gap-4 pt-3 overflow-y-auto" style={{ height: 'calc(100vh - 230px)' }}>
                    {/* Mañana */}
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b border-border">
                            Mañana
                        </p>
                        {morningAppts.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center pt-6">Sin citas</p>
                        ) : morningAppts.map(appt => (
                            <button key={appt.id} type="button" onClick={() => openApptDialog(appt)}
                                className={`w-full text-left rounded-lg px-3 py-2.5 transition-opacity hover:opacity-80 ${CARD_STATUS_STYLE[appt.status]}`}>
                                <div className="flex flex-col gap-1.5">
                                    {/* Fila superior: contacto + servicio */}
                                    <div className="flex flex-row gap-x-2">
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <p className="text-sm font-bold leading-tight text-muted-foreground">
                                                {format(new Date(appt.startTime), "HH:mm")} – {format(new Date(appt.endTime), "HH:mm")}
                                            </p>
                                            <p className="text-sm font-semibold leading-tight mt-0.5 truncate">
                                                {appt.session?.pushName || "Sin nombre"}
                                            </p>
                                            <Link
                                                href={`/chats?jid=${encodeURIComponent(appt.session.remoteJid)}`}
                                                className="flex items-center gap-1 text-xs text-primary hover:underline leading-tight mt-1"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Phone className="w-3 h-3 shrink-0" />
                                                {fmtPhone(appt.session.remoteJid)}
                                            </Link>
                                        </div>
                                        {appt.service?.name && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-tight shrink-0 self-start">
                                                {appt.service.name}
                                            </span>
                                        )}
                                    </div>
                                    {/* Fila inferior: etiquetas/lead + estado cita */}
                                    <div className="flex flex-row items-center justify-between gap-2 pt-1.5 border-t border-black/5">
                                        <div className="flex flex-wrap gap-1">
                                            {appt.session.leadStatus && (() => {
                                                const cfg = LEAD_STATUS_CONFIG[appt.session.leadStatus as LeadStatus];
                                                return cfg ? (
                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold leading-tight ${cfg.cls}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                                                        {cfg.label}
                                                        {appt.session.leadScore != null && (
                                                            <span className="opacity-70">· {appt.session.leadScore}</span>
                                                        )}
                                                    </span>
                                                ) : null;
                                            })()}
                                            {appt.session.sessionTags.map(({ tag }) => (
                                                <span
                                                    key={tag.id}
                                                    className="inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold leading-tight"
                                                    style={{
                                                        backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb',
                                                        borderColor: tag.color ?? '#d1d5db',
                                                        color: tag.color ?? '#374151',
                                                    }}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                            {(seguimientosMap[appt.session.remoteJid] ?? 0) > 0 && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold leading-tight bg-orange-100 border-orange-300 text-orange-800">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                                                    {seguimientosMap[appt.session.remoteJid]}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CARD_STATUS_DOT[appt.status]}`} />
                                            <span className="text-xs font-medium opacity-80">{STATUS_LABELS[appt.status]}</span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Tarde */}
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b border-border">
                            Tarde
                        </p>
                        {afternoonAppts.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center pt-6">Sin citas</p>
                        ) : afternoonAppts.map(appt => (
                            <button key={appt.id} type="button" onClick={() => openApptDialog(appt)}
                                className={`w-full text-left rounded-lg px-3 py-2.5 transition-opacity hover:opacity-80 ${CARD_STATUS_STYLE[appt.status]}`}>
                                <div className="flex flex-col gap-1.5">
                                    {/* Fila superior: contacto + servicio */}
                                    <div className="flex flex-row gap-x-2">
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <p className="text-sm font-bold leading-tight text-muted-foreground">
                                                {format(new Date(appt.startTime), "HH:mm")} – {format(new Date(appt.endTime), "HH:mm")}
                                            </p>
                                            <p className="text-sm font-semibold leading-tight mt-0.5 truncate">
                                                {appt.session?.pushName || "Sin nombre"}
                                            </p>
                                            <Link
                                                href={`/chats?jid=${encodeURIComponent(appt.session.remoteJid)}`}
                                                className="flex items-center gap-1 text-xs text-primary hover:underline leading-tight mt-1"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Phone className="w-3 h-3 shrink-0" />
                                                {fmtPhone(appt.session.remoteJid)}
                                            </Link>
                                        </div>
                                        {appt.service?.name && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-tight shrink-0 self-start">
                                                {appt.service.name}
                                            </span>
                                        )}
                                    </div>
                                    {/* Fila inferior: etiquetas/lead + estado cita */}
                                    <div className="flex flex-row items-center justify-between gap-2 pt-1.5 border-t border-black/5">
                                        <div className="flex flex-wrap gap-1">
                                            {appt.session.leadStatus && (() => {
                                                const cfg = LEAD_STATUS_CONFIG[appt.session.leadStatus as LeadStatus];
                                                return cfg ? (
                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold leading-tight ${cfg.cls}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                                                        {cfg.label}
                                                        {appt.session.leadScore != null && (
                                                            <span className="opacity-70">· {appt.session.leadScore}</span>
                                                        )}
                                                    </span>
                                                ) : null;
                                            })()}
                                            {appt.session.sessionTags.map(({ tag }) => (
                                                <span
                                                    key={tag.id}
                                                    className="inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold leading-tight"
                                                    style={{
                                                        backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb',
                                                        borderColor: tag.color ?? '#d1d5db',
                                                        color: tag.color ?? '#374151',
                                                    }}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                            {(seguimientosMap[appt.session.remoteJid] ?? 0) > 0 && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold leading-tight bg-orange-100 border-orange-300 text-orange-800">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                                                    {seguimientosMap[appt.session.remoteJid]}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CARD_STATUS_DOT[appt.status]}`} />
                                            <span className="text-xs font-medium opacity-80">{STATUS_LABELS[appt.status]}</span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
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
                                        Estás por modificar el estado de la cita:
                                        <span className="text-muted-foreground">
                                            {selectedAppointment?.session?.pushName || "Cliente desconocido"}
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
                                                {currentAppointment.session.pushName || "Cliente desconocido"}
                                            </div>
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">Teléfono:</strong>
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
                                                {new Date(currentAppointment.startTime).toLocaleDateString("es-ES")}
                                            </div>
                                            <div className="flex text-sm gap-1 flex-row">
                                                <strong className="uppercase font-medium">Hora:</strong>
                                                {new Date(currentAppointment.startTime).toLocaleTimeString("es-ES")} -
                                                {new Date(currentAppointment.endTime).toLocaleTimeString("es-ES")}
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
                            ¿Estás seguro de que quieres eliminar la cita de{" "}
                            <strong>{selectedAppointment?.session?.pushName || "este cliente"}</strong>?
                            Esta acción no se puede deshacer.
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
                            Sí, eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={openCancelAlert} onOpenChange={setOpenCancelAlert}>
                <AlertDialogContent className="border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar cancelación</AlertDialogTitle>
                        <AlertDialogDescription>
                            Al cambiar el estado a <strong>CANCELADA</strong>, se eliminarán todos los recordatorios/seguimientos del agendamiento asociados.
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
