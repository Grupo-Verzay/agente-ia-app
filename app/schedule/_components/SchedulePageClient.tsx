"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { createAppointment } from "@/actions/appointments-actions";
import { sendMessageWithHistoryAction } from "@/actions/chat-history/send-message-with-history-action";
import { getAvailableSlots } from "@/actions/getAvailableSlots-actions";
import { getNotificationContacts } from "@/actions/notification-contacts-actions";
import { createSeguimiento } from "@/actions/seguimientos-actions";
import { registerSession } from "@/actions/session-action";
import { ScheduleInterface } from "@/schema/schema";
import { SeguimientoInput } from "@/schema/seguimientos";
import { SERVER_TIME_ZONE } from "@/lib/utils";
import {
    formatDateLabel,
    formatServiceMessage,
    normalizeTimeToSeconds,
    normalizeToE164,
    subtractSecondsFromTime,
    toRemoteJid,
} from "../helpers";
import { CalendarIcon, CheckCircle2, Clock, ScrollText } from "lucide-react";
import { es } from "date-fns/locale";
import { DateHourComponent, ScheduleForm, ServiceComponent, SummaryComponent } from "./steps";
import { SummaryItem } from "./";

export const SchedulePageClient = ({ user, reminders, countries }: ScheduleInterface) => {
    const [step, setStep] = useState(0);
    const stepLabel = [
        { label: "Servicio", icon: <Clock className="h-4 w-4" /> },
        { label: "Fecha y hora", icon: <CalendarIcon className="h-4 w-4" /> },
        { label: "Tus datos", icon: <ScrollText className="h-4 w-4" /> },
        { label: "Revisi\u00f3n", icon: <CheckCircle2 className="h-4 w-4" /> },
    ];

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const slotDuration = !user.meetingDuration ? 60 : user.meetingDuration;
    const primaryInstance = user.instancias?.[0];
    const instanceName = primaryInstance?.instanceName ?? "";

    const [selectedService, setSelectedService] = useState("");
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
    const [selectedDateYmd, setSelectedDateYmd] = useState<string>("");
    const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    const [nameClient, setNameClient] = useState("");
    const [areaCode, setAreaCode] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const canContinueStep2 = Boolean(nameClient.trim() && phone.trim() && areaCode && selectedService);

    const mutationSeguimiento = useMutation({
        mutationFn: async (data: SeguimientoInput) => await createSeguimiento(data),
        onSuccess: (res) => {
            if (!res.success) toast.error(res.message);
        },
        onError: () => {
            toast.error("Error inesperado al crear seguimiento");
        },
    });

    useEffect(() => {
        if (!user.id || !selectedDateYmd) return;

        (async () => {
            const res = await getAvailableSlots(user.id as string, selectedDateYmd, slotDuration, SERVER_TIME_ZONE);
            if (res.success) setSlots(res.data || []);
            else toast.error(res.message);
        })();
    }, [user.id, selectedDateYmd, slotDuration]);

    const handleConfirmAppointment = async () => {
        const normalizedClientName = nameClient.trim();

        if (!normalizedClientName || !phone || !selectedSlot || !selectedDate || !selectedService || !areaCode) {
            toast.error("Todos los campos son obligatorios.");
            return false;
        }

        if (!reminders) {
            toast.error("Faltan recordatorios configurados.");
            return false;
        }

        if (!user.id || !instanceName || !primaryInstance) {
            toast.error("No se pudo identificar la sesi\u00f3n para esta cita.");
            return false;
        }

        const [startTime, endTime] = selectedSlot.split("|");
        const e164 = normalizeToE164(areaCode, phone);
        if (!e164) {
            toast.error("N\u00famero de WhatsApp inv\u00e1lido. Verifica el pa\u00eds y el n\u00famero.");
            return false;
        }

        const remoteJid = toRemoteJid(e164);

        setLoading(true);

        try {
            const sessionRes = await registerSession({
                userId: user.id,
                remoteJid,
                pushName: normalizedClientName,
                instanceId: instanceName,
            });

            if (!sessionRes.success || !sessionRes.data?.id) {
                toast.error(sessionRes.message || "No se pudo sincronizar la sesi\u00f3n.");
                return false;
            }

            const res = await createAppointment({
                userId: user.id,
                sessionId: sessionRes.data.id,
                pushName: normalizedClientName,
                phone: remoteJid,
                instanceName,
                startTime,
                endTime,
                timezone,
                serviceId: selectedService,
            });

            if (!res.success) {
                toast.error(res.message);
                return false;
            }

            const secondsReminders = reminders.map((rem) => ({
                ...rem,
                normalizedSeconds: isNaN(normalizeTimeToSeconds(rem?.time ?? "")) ? 0 : normalizeTimeToSeconds(rem?.time ?? ""),
            }));

            secondsReminders.forEach((rem) => {
                if (!rem.normalizedSeconds) return;

                const startLocal = toZonedTime(new Date(startTime), SERVER_TIME_ZONE);
                const seguimientoTime = subtractSecondsFromTime(startLocal, rem.normalizedSeconds);
                const dataSeguimiento: SeguimientoInput = {
                    idNodo: "",
                    serverurl: `https://${user.apiKey?.url}`,
                    instancia: primaryInstance.instanceName,
                    apikey: primaryInstance.instanceId,
                    remoteJid,
                    mensaje: formatServiceMessage(rem.description ?? "", {
                        nameClient: normalizedClientName,
                        selectedDate,
                        selectedSlot,
                        timezone,
                        slotDuration,
                    }),
                    tipo: "text",
                    time: seguimientoTime,
                    name_file: undefined,
                    consecutivo: undefined,
                    media: undefined,
                };
                mutationSeguimiento.mutate(dataSeguimiento);
            });

            if (user.apiKey && primaryInstance) {
                const urlevo = user.apiKey.url;
                const apikey = primaryInstance.instanceId;
                const url = `https://${urlevo}/message/sendText/${instanceName}`;

                // Collect all notification numbers (primary + additional contacts)
                const allPhones: string[] = [];
                if (user.notificationNumber) allPhones.push(user.notificationNumber);
                try {
                    const contactsResult = await getNotificationContacts(user.id);
                    if (contactsResult.success) {
                        for (const c of contactsResult.data ?? []) {
                            if (!allPhones.includes(c.phone)) allPhones.push(c.phone);
                        }
                    }
                } catch { /* non-critical, proceed with primary only */ }

                if (allPhones.length > 0) {
                    const startLocal = toZonedTime(new Date(startTime), SERVER_TIME_ZONE);
                    const dateLabel = format(selectedDate!, "d 'de' MMMM 'de' yyyy", { locale: es });
                    const hourLabel = format(startLocal, "hh:mm a");
                    const serviceName = user.services.find((s) => s.id === selectedService)?.name ?? "Asesor\u00eda";

                    const ownerText = `📅 *Tienes Nueva Cita*:

👤 *Nombre:* ${normalizedClientName}
📝 *Descripci\u00f3n ${serviceName}:* Para el d\u00eda ${dateLabel} a las ${hourLabel}.

📱 *WhatsApp del usuario:*

👉 ${e164}`;

                    await Promise.allSettled(
                        allPhones.map(async (phone) => {
                            const ownerJid = phone.includes("@s.whatsapp.net")
                                ? phone
                                : `${phone}@s.whatsapp.net`;
                            try {
                                const ownerRes = await sendMessageWithHistoryAction({
                                    instanceName,
                                    url,
                                    apikey,
                                    remoteJid: ownerJid,
                                    message: ownerText,
                                    historyType: "notification",
                                    additionalKwargs: {
                                        source: "SchedulePageClient",
                                        recipient: "owner",
                                        appointmentUserId: user.id,
                                    },
                                });
                                if (!ownerRes.success) {
                                    toast.warning(`No se pudo notificar a ${phone}: ${ownerRes.message}`);
                                }
                            } catch (e) {
                                console.error(`Error notificando a ${phone}:`, e);
                            }
                        }),
                    );
                }
            }

            toast.success("Cita agendada correctamente.");
            resetForm();
            return true;
        } catch (err) {
            console.error("Error en agendamiento:", err);
            toast.error("Ocurri\u00f3 un error al intentar agendar la cita.");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const scheduleAndNotify = async () => {
        if (!user.apiKey || !primaryInstance) return toast.info("Campos incompletos o vac\u00edos");
        if (!selectedService) return toast.info("Debes seleccionar un servicio");

        const normalizedClientName = nameClient.trim();
        const urlevo = user.apiKey.url;
        const apikey = primaryInstance.instanceId;
        const url = `https://${urlevo}/message/sendText/${instanceName}`;
        const currentService = user.services.find((s) => s.id === selectedService);
        const text = formatServiceMessage(currentService?.messageText, {
            nameClient: normalizedClientName,
            selectedDate,
            selectedSlot,
            timezone,
            slotDuration,
        });

        const e164 = normalizeToE164(areaCode, phone);
        if (!e164) {
            toast.error("N\u00famero de WhatsApp inv\u00e1lido. Verifica el pa\u00eds y el n\u00famero.");
            return;
        }

        const remoteJid = toRemoteJid(e164);

        try {
            const appointmentCreated = await handleConfirmAppointment();
            if (!appointmentCreated) {
                return;
            }

            const result = await sendMessageWithHistoryAction({
                instanceName,
                url,
                apikey,
                remoteJid,
                message: text,
                historyType: "notification",
                additionalKwargs: {
                    source: "SchedulePageClient",
                    recipient: "client",
                    serviceId: selectedService,
                },
            });

            if (result.success) toast.success(result.message);
            else {
                toast.info("No se envi\u00f3 el mensaje de notificaci\u00f3n");
                console.error(`Error SchedulePageClient line: 232 ${result.message}`);
            }
        } catch (error) {
            console.error("Error en notificaci\u00f3n:", error);
            toast.error("Ocurri\u00f3 un error al intentar notificar la cita.");
        }
    };

    const resetForm = () => {
        setStep(0);
        setSelectedService("");
        setSelectedDate(undefined);
        setSelectedDateYmd("");
        setSlots([]);
        setSelectedSlot(null);
        setNameClient("");
        setAreaCode("");
        setPhone("");
        setLoading(false);
        setOpenDialog(false);
    };

    return (
        <>
            <div className="w-full min-h-[100vh] p-4 overflow-auto">
                <div className="flex justify-center max-h-[86vh] w-full overflow-auto">
                    <div className="space-y-2 w-full md:max-w-[700px]">
                        <Card className="border-muted/50">
                            <CardContent className="p-4 sm:p-6">
                                <div className="flex flex-wrap justify-between gap-2">
                                    {stepLabel.map((s, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div
                                                className={`h-8 w-8 rounded-full grid place-items-center text-sm shadow ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                                            >
                                                {s.icon}
                                            </div>
                                            <span className={`hidden sm:block text-sm ${i === step ? "font-semibold" : "text-muted-foreground"}`}>
                                                {s.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-muted/50">
                            <CardContent className="flex items-center gap-3 p-4">
                                <Image
                                    src={user.image ?? "/assets/image/logo_app.png"}
                                    alt="IA Agent Logo"
                                    width={56}
                                    height={56}
                                    className="rounded-full border border-border shadow object-cover"
                                />
                                <div className="flex-1">
                                    <div className="text-sm text-muted-foreground">
                                        Agendar con <span className="font-semibold">{user.company || "nuestro asesor"}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">Duraci\u00f3n: {slotDuration} min</div>
                                </div>
                            </CardContent>
                        </Card>

                        {step === 0 && (
                            <ServiceComponent
                                selectedService={selectedService}
                                setStep={setStep}
                                setSelectedService={setSelectedService}
                                user={user}
                            />
                        )}

                        {step === 1 && (
                            <DateHourComponent
                                setSelectedDate={setSelectedDate}
                                setSelectedSlot={setSelectedSlot}
                                setSelectedDateYmd={setSelectedDateYmd}
                                setStep={setStep}
                                selectedService={selectedService}
                                selectedSlot={selectedSlot}
                                setSlots={setSlots}
                                timezone={timezone}
                                serverTimeZone={SERVER_TIME_ZONE}
                                slots={slots}
                                selectedDate={selectedDate}
                                slotDuration={slotDuration}
                                user={user}
                                phone={phone}
                                areaCode={areaCode}
                                nameClient={nameClient}
                            />
                        )}

                        {step === 2 && (
                            <ScheduleForm
                                nameClient={nameClient}
                                countries={countries}
                                areaCode={areaCode}
                                phone={phone}
                                canContinueStep2={canContinueStep2}
                                setNameClient={setNameClient}
                                setAreaCode={setAreaCode}
                                setPhone={setPhone}
                                setStep={setStep}
                            />
                        )}

                        {step === 3 && (
                            <SummaryComponent
                                user={user}
                                timezone={timezone}
                                nameClient={nameClient}
                                areaCode={areaCode}
                                phone={phone}
                                loading={loading}
                                selectedService={selectedService}
                                selectedSlot={selectedSlot}
                                selectedDate={selectedDate}
                                setStep={setStep}
                                setOpenDialog={setOpenDialog}
                            />
                        )}
                    </div>
                </div>
            </div>

            {selectedDate && (
                <AlertDialog open={openDialog} onOpenChange={setOpenDialog}>
                    <AlertDialogContent className="border-border">
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar cita</AlertDialogTitle>
                            <AlertDialogDescription>
                                Est\u00e1s a punto de agendar una cita con los siguientes datos:
                                <Card className="border-none mt-2 ">
                                    <CardContent className="space-y-4 p-0 m-0">
                                        <SummaryItem label="Servicio" value={user.services.find((s) => s.id === selectedService)?.name ?? "-"} />
                                        <SummaryItem label="Duraci\u00f3n" value={`${slotDuration} min`} />
                                        <SummaryItem label="Fecha" value={formatDateLabel(selectedDate)} />
                                        <SummaryItem label="Contacto" value={`${areaCode} ${phone}`} />
                                        <SummaryItem
                                            label="Hora"
                                            value={
                                                selectedSlot
                                                    ? format(toZonedTime(new Date(selectedSlot.split("|")[0]), timezone), "hh:mm a")
                                                    : "-"
                                            }
                                        />
                                        <SummaryItem label="Zona horaria" value={timezone} />
                                    </CardContent>
                                </Card>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={scheduleAndNotify} disabled={loading}>
                                {loading ? "Agendando..." : "Confirmar"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
};
