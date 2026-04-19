"use client";

import { useCallback, useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { toast } from "sonner";

import { getAppointmentsByUser, updateAppointmentStatus } from "@/actions/appointments-actions";
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
import { XCircleIcon } from 'lucide-react';
import { sendMessageWithHistoryAction } from "@/actions/chat-history/send-message-with-history-action";
import { STATUS_LABELS } from "@/types/schedule";

export const CustomCalendar = ({ user }: ScheduleInterface) => {
    const toastId = "progress-calendar";

    const [appointments, setAppointments] = useState<AppointmentWithSession[]>([]);
    const [currentAppointment, setCurrentAppointment] = useState<AppointmentWithSession>();
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [newStatus, setNewStatus] = useState<AppointmentStatus>("CONFIRMADA");
    const [openCancelAlert, setOpenCancelAlert] = useState(false);

    const loadAppointments = useCallback(async () => {
        const res = await getAppointmentsByUser(user.id);
        if (res.success) {
            setAppointments((res.data || []) as AppointmentWithSession[]);
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

            await notifyChangeStatus();
            await loadAppointments();
        } else {
            toast.error(res.message, { id: toastId });
        }
    };

    const events = normalizeAppointmentsToEvents(appointments);
    const selectedAppointment = appointments.find((a) => a.id === selectedEventId);


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
            <FullCalendar plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridDay"
                events={events}
                headerToolbar={
                    isMobile
                        ? { left: "prev,next", center: "title", right: "timeGridDay,timeGridWeek,dayGridMonth" }
                        : { left: "prev,next today", center: "title", right: "timeGridDay,timeGridWeek,dayGridMonth" }
                }
                buttonText={
                    isMobile
                        ? { today: "Hoy", timeGridDay: "D", timeGridWeek: "S", dayGridMonth: "M" }
                        : { today: "Hoy", timeGridDay: "Día", timeGridWeek: "Semana", dayGridMonth: "Mes" }
                }
                editable={true}
                height="auto"
                allDaySlot={false}
                slotMinTime="07:00:00"
                slotMaxTime="19:00:00"
                eventClick={(info) => {
                    setSelectedEventId(info.event.id);
                    const currentStatus = appointments.find((a) => a.id === info.event.id)?.status;
                    setCurrentAppointment(appointments.find((a) => a.id === info.event.id))
                    setNewStatus(currentStatus || "PENDIENTE");
                    setOpenDialog(true);
                }}
                titleFormat={
                    isMobile
                        ? { day: "numeric", month: "short" } // 23 feb
                        : { year: "numeric", month: "long", day: "numeric" } // 23 febrero 2026

                }
                locale={esLocale}
            />


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
                        <div className="flex justify-between flex-row w-full">
                            <TabsList>
                                <TabsTrigger value="details">Detalles</TabsTrigger>
                                <TabsTrigger value="status">Estado</TabsTrigger>
                            </TabsList>
                            <Button variant={"ghost"} onClick={() => setOpenDialog(false)}><XCircleIcon /></Button>
                        </div>
                        <TabsContent value="status">
                            <Card className="border-border">
                                <CardHeader>
                                    {/* <CardTitle>Estado</CardTitle> */}
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
                                        </SelectContent>
                                    </Select>
                                </CardContent>
                                <CardFooter className="flex gap-2 flex-row">
                                    <Button variant={'outline'}>Cancelar</Button>

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
                                </CardFooter>
                            </Card>
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
                                                {currentAppointment.session.remoteJid.split('@')[0] || "No disponible"}
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
                        </TabsContent>

                    </Tabs>
                </AlertDialogContent>
            </AlertDialog >

            <AlertDialog open={openCancelAlert} onOpenChange={setOpenCancelAlert}>
                <AlertDialogContent className="border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar cancelación</AlertDialogTitle>
                        <AlertDialogDescription>
                            Al cambiar el estado a <strong>CANCELADA</strong>, se eliminarán todos los recordatorios/seguimientos
                            del agendamiento asociados a este cliente:
                            <span className="block mt-2 text-muted-foreground">
                                {selectedAppointment?.session?.pushName || "Cliente desconocido"}
                            </span>
                            <span className="block text-muted-foreground">
                                {selectedAppointment?.session?.remoteJid?.split("@")[0] || ""}
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel>Volver</AlertDialogCancel>

                        <AlertDialogAction
                            onClick={() => {
                                if (!selectedEventId) return;

                                handleStatusChange(selectedEventId, newStatus); // aquí newStatus es CANCELADA
                                setOpenCancelAlert(false);
                                setOpenDialog(false);
                            }}
                        >
                            Sí, cancelar y eliminar recordatorios
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
