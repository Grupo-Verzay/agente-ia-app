"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { getTimezoneFromPhone } from "@/lib/timezones";
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
import { confirmarLaCitaPublicaAction } from "@/actions/cita-publica-actions";
import { getAvailableSlots } from "@/actions/getAvailableSlots-actions";
import { registerSession } from "@/actions/session-action";
import { ScheduleInterface, UserConServicios } from "@/schema/schema";
import {
    formatDateLabel,
    normalizeToE164,
    toRemoteJid,
} from "../helpers";
import { CalendarIcon, ClipboardList, Clock, List, ScrollText } from "lucide-react";
import { DateComponent, HourComponent, ScheduleForm, ServiceComponent } from "./steps";
import { QualificationStep } from "./steps/QualificationStep";
import { SummaryItem } from "./";
import type { BookingQuestionItem } from "@/actions/booking-questions-actions";
import { saveBookingFormResponse, type FormAnswer } from "@/actions/booking-form-actions";

function splitPhonePrefix(fullPhone: string, countries?: ScheduleInterface['countries']) {
    if (!fullPhone || !countries?.length) return { areaCode: '', localPhone: fullPhone };
    const digits = fullPhone.replace(/\D/g, '');
    const allCodes = countries.flatMap((c) =>
        (c.codes?.length ? c.codes : c.code ? [c.code] : []).map((code) => code.replace('+', ''))
    );
    allCodes.sort((a, b) => b.length - a.length);
    for (const code of allCodes) {
        if (digits.startsWith(code)) {
            return { areaCode: `+${code}`, localPhone: digits.slice(code.length) };
        }
    }
    return { areaCode: '', localPhone: digits };
}

interface SchedulePageClientProps extends Omit<ScheduleInterface, 'user'> {
    // La pagina publica hace su propia consulta y si trae los servicios.
    user: UserConServicios;
    questions?: BookingQuestionItem[];
}

const FALLBACK_LOGO = "/assets/image/logo_app.png";

export const SchedulePageClient = ({ user, countries, prefillName = '', prefillPhone = '', questions = [], availableWeekdays = [] }: SchedulePageClientProps) => {
    const [step, setStep] = useState(0);
    // Logo del asesor con respaldo: cubre tanto string vacío ("") como fallos de
    // carga (404 / dominio no permitido), para que nunca se vea roto el alt.
    const [logoSrc, setLogoSrc] = useState(user.image || FALLBACK_LOGO);
    const hasForm = questions.length > 0;
    const FORM_STEP = hasForm ? 3 : -1;
    const DATA_STEP = hasForm ? 4 : 3;

    const stepLabel = [
        { label: "Servicio", icon: <List className="h-4 w-4" /> },
        { label: "Fecha", icon: <CalendarIcon className="h-4 w-4" /> },
        { label: "Hora", icon: <Clock className="h-4 w-4" /> },
        ...(hasForm ? [{ label: "Formulario", icon: <ClipboardList className="h-4 w-4" /> }] : []),
        { label: "Tus datos", icon: <ScrollText className="h-4 w-4" /> },
    ];

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const ownerTimezone = user.timezone ?? 'America/Bogota';
    const slotDuration = !user.meetingDuration ? 60 : user.meetingDuration;
    // El NOMBRE de la línea, nunca su token: lo que necesita la clave lo hace el
    // servidor (`confirmarLaCitaPublicaAction`).
    const instanceName = user.lineaDeLaAgenda ?? "";

    const [selectedService, setSelectedService] = useState("");
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
    const [selectedDateYmd, setSelectedDateYmd] = useState<string>("");
    const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [formAnswers, setFormAnswers] = useState<FormAnswer[]>([]);

    const initialSplit = splitPhonePrefix(prefillPhone, countries);
    const [nameClient, setNameClient] = useState(prefillName);
    const [areaCode, setAreaCode] = useState(initialSplit.areaCode);
    const [phone, setPhone] = useState(initialSplit.localPhone);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const canContinueStep3 = Boolean(nameClient.trim() && phone.trim() && areaCode && selectedService);

    // Quita el indicativo del número si el usuario lo repite (evita doble código).
    const stripDial = (digits: string, code: string) => {
        const dc = (code || '').replace(/\D/g, '');
        return dc && digits.startsWith(dc) ? digits.slice(dc.length) : digits;
    };

    const handleAreaCodeChange = (code: string) => {
        setAreaCode(code);
        setPhone((prev) => stripDial(prev.replace(/\D/g, ''), code));
    };

    const handlePhoneChange = (value: string) => {
        setPhone(stripDial(value.replace(/\D/g, ''), areaCode));
    };

    const handlePhoneBlur = () => {
        if (!areaCode || !phone) return;
        setPhone(stripDial(phone.replace(/\D/g, ''), areaCode));
    };

    useEffect(() => {
        if (!user.id || !selectedDateYmd) return;
        setLoadingSlots(true);
        (async () => {
            const res = await getAvailableSlots(user.id as string, selectedDateYmd, slotDuration, ownerTimezone);
            if (res.success) setSlots(res.data || []);
            else toast.error(res.message);
            setLoadingSlots(false);
        })();
    }, [user.id, selectedDateYmd, slotDuration]);

    const handleConfirmAppointment = async () => {
        const normalizedClientName = nameClient.trim();

        if (!normalizedClientName || !phone || !selectedSlot || !selectedDate || !selectedService || !areaCode) {
            toast.error("Todos los campos son obligatorios.");
            return false;
        }

        if (!user.id || !instanceName) {
            toast.error("No se pudo identificar la sesión para esta cita.");
            return false;
        }

        const [startTime, endTime] = selectedSlot.split("|");
        const e164 = normalizeToE164(areaCode, phone);
        if (!e164) {
            toast.error("Número de WhatsApp inválido. Verifica el país y el número.");
            return false;
        }

        // El horario pudo dejar de estar disponible mientras el cliente llenaba el
        // formulario (lo tomó otra persona, o entró en el mínimo de anticipación).
        // Revalidamos antes de crear para no dejarlo en un error sin salida.
        const revalidacion = await getAvailableSlots(user.id as string, selectedDateYmd, slotDuration, ownerTimezone);
        if (revalidacion.success) {
            const vigentes = revalidacion.data || [];
            const sigueLibre = vigentes.some((s) => s.startTime === startTime && s.endTime === endTime);
            if (!sigueLibre) {
                setSlots(vigentes);
                setSelectedSlot(null);
                setStep(2);
                toast.error(
                    vigentes.length
                        ? "Ese horario ya no está disponible. Elige otro, por favor."
                        : "Ya no quedan horarios disponibles ese día. Elige otra fecha."
                );
                return false;
            }
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
                toast.error(sessionRes.message || "No se pudo sincronizar la sesión.");
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
                timezone: ownerTimezone,
                serviceId: selectedService,
            });

            if (!res.success) {
                toast.error(res.message);
                return false;
            }

            // Guardar respuestas del formulario de precalificación (si existen)
            const apptId = res.data && !Array.isArray(res.data) ? res.data.id : undefined;
            if (hasForm && formAnswers.length > 0 && apptId) {
                saveBookingFormResponse({
                    userId: user.id,
                    answers: formAnswers,
                    appointmentId: apptId,
                    clientName: normalizedClientName,
                    clientPhone: e164,
                    startTime,
                    timezone: ownerTimezone,
                }).catch(() => {});
            }

            // Lo que sale después de agendar —los recordatorios de la agenda,
            // el aviso al dueño y la confirmación al cliente— lo manda el
            // SERVIDOR a partir del id de la cita. Antes lo hacía esta pantalla
            // con la clave del servidor que se le entregaba a cualquiera.
            const aviso = await confirmarLaCitaPublicaAction({
                appointmentId: apptId ?? "",
                diaElegido: selectedDateYmd,
                zonaDelCliente: getTimezoneFromPhone(areaCode, timezone),
            });
            if (!aviso.success) {
                toast.info("La cita quedó agendada, pero no se envió la notificación.");
                console.error(`Error SchedulePageClient: ${aviso.message}`);
            } else if (aviso.confirmacionEnviada) {
                toast.success(aviso.message);
            }

            toast.success("Cita agendada correctamente.");
            resetForm();
            return true;
        } catch (err) {
            console.error("Error en agendamiento:", err);
            toast.error("Ocurrió un error al intentar agendar la cita.");
            return false;
        } finally {
            setLoading(false);
        }
    };

    const scheduleAndNotify = async () => {
        if (!instanceName) return toast.info("No se encontró instancia configurada.");
        if (!selectedService) return toast.info("Debes seleccionar un servicio");

        const e164 = normalizeToE164(areaCode, phone);
        if (!e164) {
            toast.error("Número de WhatsApp inválido. Verifica el país y el número.");
            return;
        }

        try {
            await handleConfirmAppointment();
        } catch (error) {
            console.error("Error en notificación:", error);
            toast.error("Ocurrió un error al intentar agendar la cita.");
        }
    };

    const resetForm = () => {
        setStep(0);
        setSelectedService("");
        setSelectedDate(undefined);
        setSelectedDateYmd("");
        setSlots([]);
        setSelectedSlot(null);
        setFormAnswers([]);
        setNameClient("");
        setAreaCode("");
        setPhone("");
        setLoading(false);
        setOpenDialog(false);
    };

    return (
        <>
            <div className="flex h-screen flex-col">
                <div className="shrink-0 px-3 sm:px-10 pt-3 sm:pt-6 pb-2">
                    <div className="mx-auto w-full max-w-lg">
                        <Card className="border-muted/50">
                            <CardContent className="p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Image
                                        src={logoSrc}
                                        alt={user.company ? `Logo de ${user.company}` : "Logo"}
                                        width={32}
                                        height={32}
                                        className="h-8 w-8 rounded-md object-contain shrink-0"
                                        onError={() => setLogoSrc(FALLBACK_LOGO)}
                                    />
                                    <span className="text-xs text-muted-foreground leading-none">
                                        Agendar con <span className="font-semibold text-foreground">{user.company || "nuestro asesor"}</span>
                                        <span className="ml-1">· {slotDuration} min</span>
                                    </span>
                                </div>
                                <div className="h-px bg-border" />
                                <div className="flex items-center gap-1">
                                    {stepLabel.map((s, i) => (
                                        <div key={i} className="contents">
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <div
                                                    className={`h-7 w-7 shrink-0 rounded-full grid place-items-center shadow ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                                                >
                                                    {s.icon}
                                                </div>
                                                <span className={`hidden sm:block text-xs whitespace-nowrap ${i === step ? "font-semibold" : "text-muted-foreground"}`}>
                                                    {s.label}
                                                </span>
                                            </div>
                                            {i < stepLabel.length - 1 && (
                                                <div className="flex-1 h-px bg-border mx-1 min-w-[6px]" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 sm:px-10 pb-4">
                <div className="mx-auto w-full max-w-lg space-y-3 pt-2">
                    {step === 0 && (
                        <ServiceComponent
                            selectedService={selectedService}
                            setStep={setStep}
                            setSelectedService={setSelectedService}
                            user={user}
                        />
                    )}

                    {step === 1 && (
                        <DateComponent
                            selectedDate={selectedDate}
                            setSelectedDate={setSelectedDate}
                            setSelectedDateYmd={setSelectedDateYmd}
                            setSelectedSlot={setSelectedSlot}
                            setStep={setStep}
                            minNoticeMinutes={user.minNoticeMinutes ?? 0}
                            availableWeekdays={availableWeekdays}
                        />
                    )}

                    {step === 2 && (
                        <HourComponent
                            slots={slots}
                            loadingSlots={loadingSlots}
                            selectedDate={selectedDate}
                            selectedSlot={selectedSlot}
                            setSelectedSlot={setSelectedSlot}
                            setStep={setStep}
                            timezone={ownerTimezone}
                        />
                    )}

                    {hasForm && step === FORM_STEP && (
                        <Card className="border-muted/50">
                            <CardContent className="p-4">
                                <QualificationStep
                                    questions={questions}
                                    answers={formAnswers}
                                    onAnswersChange={setFormAnswers}
                                    onBack={() => setStep(2)}
                                    onNext={() => setStep(DATA_STEP)}
                                />
                            </CardContent>
                        </Card>
                    )}

                    {step === DATA_STEP && (
                        <ScheduleForm
                            nameClient={nameClient}
                            countries={countries}
                            areaCode={areaCode}
                            phone={phone}
                            canContinueStep2={canContinueStep3}
                            loading={loading}
                            setNameClient={setNameClient}
                            setAreaCode={handleAreaCodeChange}
                            setPhone={handlePhoneChange}
                            setStep={setStep}
                            onContinue={scheduleAndNotify}
                            onPhoneBlur={handlePhoneBlur}
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
                                Estás a punto de agendar una cita con los siguientes datos:
                                <Card className="border-none mt-2 ">
                                    <CardContent className="space-y-4 p-0 m-0">
                                        <SummaryItem label="Servicio" value={user.services.find((s) => s.id === selectedService)?.name ?? "-"} />
                                        <SummaryItem label="Duración" value={`${slotDuration} min`} />
                                        <SummaryItem label="Fecha" value={formatDateLabel(selectedDate)} />
                                        <SummaryItem label="Contacto" value={`${areaCode} ${phone}`} />
                                        <SummaryItem
                                            label="Hora"
                                            value={
                                                selectedSlot
                                                    ? format(toZonedTime(new Date(selectedSlot.split("|")[0]), ownerTimezone), "hh:mm a")
                                                    : "-"
                                            }
                                        />
                                        <SummaryItem label="Zona horaria" value={ownerTimezone} />
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