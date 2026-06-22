'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { toast } from 'sonner';
import { CalendarIcon, ClipboardList, Clock, List, ScrollText, User } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import type { Country } from '@/components/custom/CountryCodeSelect';
import {
    createBookingAppointment,
    getAvailableBookingSlots,
    sendBookingNotifications,
} from '@/actions/bookings-actions';
import type { BookingQuestionItem } from '@/actions/booking-questions-actions';
import { saveBookingFormResponse, type FormAnswer } from '@/actions/booking-form-actions';

import { ServiceStep } from './steps/ServiceStep';
import { MemberStep } from './steps/MemberStep';
import { DateStep } from './steps/DateStep';
import { SlotStep } from './steps/SlotStep';
import { ClientDataStep } from './steps/ClientDataStep';
import { QualificationStep } from '../../../schedule/_components/steps/QualificationStep';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
    id: string;
    name: string;
    bio: string | null;
    photo: string | null;
    color: string | null;
    minNoticeMinutes: number;
}

interface TeamService {
    id: string;
    name: string;
    description: string | null;
    duration: number;
    color: string | null;
    order: number;
    messageText?: string | null;
    members: { teamMember: TeamMember }[];
}

interface Team {
    id: string;
    name: string;
    description: string | null;
    timezone: string;
    minNoticeMinutes: number;
    members: TeamMember[];
    services: TeamService[];
}

interface Props {
    userId: string;
    team: Team;
    countries: Country[];
    prefillName?: string;
    prefillPhone?: string;
    questions?: BookingQuestionItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitPhonePrefix(fullPhone: string, countries?: Country[]) {
    if (!fullPhone || !countries?.length) return { areaCode: '', localPhone: fullPhone };
    const digits = fullPhone.replace(/\D/g, '');
    const allCodes = countries
        .flatMap((c) => (c.codes?.length ? c.codes : c.code ? [c.code] : []).map((code) => code.replace('+', '')))
        .sort((a, b) => b.length - a.length);
    for (const code of allCodes) {
        if (digits.startsWith(code)) return { areaCode: `+${code}`, localPhone: digits.slice(code.length) };
    }
    return { areaCode: '', localPhone: digits };
}

function normalizeToE164(areaCode: string, phone: string): string | null {
    const code = areaCode.replace(/\D/g, '');
    const num  = phone.replace(/\D/g, '');
    if (!code || !num) return null;
    return `${code}${num}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BookingPageClient({ userId, team, countries, prefillName = '', prefillPhone = '', questions = [] }: Props) {
    const [step, setStep] = useState(0);
    const [selectedService, setSelectedService] = useState('');
    const serviceQuestions = questions.filter((q) => q.teamServiceId === selectedService);
    const hasForm = serviceQuestions.length > 0;
    const FORM_STEP = hasForm ? 4 : -1;
    const DATA_STEP = hasForm ? 5 : 4;

    const stepLabels = [
        { label: 'Servicio',     icon: <List className="h-4 w-4" /> },
        { label: 'Especialista', icon: <User className="h-4 w-4" /> },
        { label: 'Fecha',        icon: <CalendarIcon className="h-4 w-4" /> },
        { label: 'Hora',         icon: <Clock className="h-4 w-4" /> },
        ...(hasForm ? [{ label: 'Formulario', icon: <ClipboardList className="h-4 w-4" /> }] : []),
        { label: 'Tus datos',    icon: <ScrollText className="h-4 w-4" /> },
    ];

    // ── Selecciones ──
    const [selectedMember,  setSelectedMember]  = useState('');
    const [selectedDate,    setSelectedDate]    = useState<Date | undefined>();
    const [selectedDateYmd, setSelectedDateYmd] = useState('');
    const [selectedSlot,    setSelectedSlot]    = useState<string | null>(null);
    const [slots,           setSlots]           = useState<{ startTime: string; endTime: string; label: string }[]>([]);
    const [loadingSlots,    setLoadingSlots]    = useState(false);

    // ── Datos del cliente ──
    const initial = splitPhonePrefix(prefillPhone, countries);
    const [nameClient,   setNameClient]   = useState(prefillName);
    const [areaCode,     setAreaCode]     = useState(initial.areaCode);
    const [phone,        setPhone]        = useState(initial.localPhone);
    const [loading,      setLoading]      = useState(false);
    const [formAnswers,  setFormAnswers]  = useState<FormAnswer[]>([]);

    // ── Derivados ──
    const currentService = team.services.find((s) => s.id === selectedService);
    // Si el servicio tiene especialistas asignados los usa; si no, muestra todos los del equipo
    const assignedMembers = currentService?.members.map((m) => m.teamMember) ?? [];
    const membersForService: TeamMember[] = assignedMembers.length > 0 ? assignedMembers : team.members;
    const duration = currentService?.duration ?? 60;
    const timezone = team.timezone;
    const currentMember = membersForService.find((m) => m.id === selectedMember);
    const effectiveNotice = (currentMember?.minNoticeMinutes ?? 0) > 0
        ? currentMember!.minNoticeMinutes
        : team.minNoticeMinutes;

    const canContinue = Boolean(nameClient.trim() && phone.trim() && areaCode && selectedSlot);

    // ── Cargar slots al cambiar fecha o especialista ──
    useEffect(() => {
        if (!selectedMember || !selectedDateYmd) return;
        setLoadingSlots(true);
        setSlots([]);
        setSelectedSlot(null);
        (async () => {
            const res = await getAvailableBookingSlots(selectedMember, selectedDateYmd, duration, timezone, effectiveNotice);
            if (res.success) setSlots(res.data ?? []);
            else toast.error(res.message ?? 'Error al cargar horarios');
            setLoadingSlots(false);
        })();
    }, [selectedMember, selectedDateYmd, duration, timezone, effectiveNotice]);

    const handlePhoneBlur = () => {
        if (!areaCode || !phone) return;
        const codeDigits = areaCode.replace('+', '');
        const digits = phone.replace(/\D/g, '');
        if (digits.startsWith(codeDigits)) setPhone(digits.slice(codeDigits.length));
    };

    const resetForm = () => {
        setStep(0);
        setSelectedService('');
        setSelectedMember('');
        setSelectedDate(undefined);
        setSelectedDateYmd('');
        setSlots([]);
        setSelectedSlot(null);
        setFormAnswers([]);
        setNameClient('');
        setAreaCode('');
        setPhone('');
        setLoading(false);
    };

    const handleConfirm = async () => {
        if (!canContinue || !selectedSlot) return;

        const e164 = normalizeToE164(areaCode, phone);
        if (!e164) {
            toast.error('Número de WhatsApp inválido.');
            return;
        }

        const [startTime, endTime] = selectedSlot.split('|');
        setLoading(true);

        try {
            const res = await createBookingAppointment({
                teamId:        team.id,
                teamMemberId:  selectedMember,
                teamServiceId: selectedService,
                clientName:    nameClient.trim(),
                clientPhone:   e164,
                startTime,
                endTime,
                timezone,
            });

            if (!res.success) {
                toast.error(res.message ?? 'No se pudo agendar la cita.');
                return;
            }

            // Guardar respuestas del formulario de precalificación (si existen)
            if (hasForm && formAnswers.length > 0 && res.data?.id) {
                saveBookingFormResponse({
                    userId,
                    answers: formAnswers,
                    bookingAppointmentId: res.data.id,
                    clientName: nameClient.trim(),
                    clientPhone: e164,
                    startTime,
                    timezone,
                }).catch(() => {});
            }

            // Notificación WhatsApp (fire-and-forget — no bloqueamos la UI)
            const selectedMemberData = membersForService.find((m) => m.id === selectedMember);
            sendBookingNotifications({
                userId,
                bookingId:          res.data?.id ?? '',
                clientName:         nameClient.trim(),
                clientPhone:        e164,
                startTimeIso:       startTime,
                endTimeIso:         endTime,
                timezone,
                serviceName:        currentService?.name ?? '',
                serviceMessageText: currentService?.messageText ?? null,
                memberName:         selectedMemberData?.name ?? '',
                teamName:           team.name,
            }).catch(() => {});

            toast.success('¡Cita agendada exitosamente!');
            resetForm();
        } catch {
            toast.error('Ocurrió un error al agendar la cita.');
        } finally {
            setLoading(false);
        }
    };

    // ── Resumen en el encabezado ──
    const slotLocalLabel = selectedSlot
        ? format(toZonedTime(new Date(selectedSlot.split('|')[0]), timezone), 'h:mm a')
        : null;
    const dateLabel = selectedDate
        ? format(selectedDate, "d 'de' MMMM yyyy", { locale: es })
        : null;

    return (
        <div className="flex h-screen flex-col">
            <div className="shrink-0 px-3 sm:px-10 pt-3 sm:pt-6 pb-2">
                <div className="mx-auto w-full max-w-lg">
                    {/* Encabezado */}
                    <Card className="border-muted/50">
                        <CardContent className="p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 border border-border flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                    {team.name.charAt(0)}
                                </div>
                                <span className="text-xs text-muted-foreground leading-none">
                                    Reservar con <span className="font-semibold text-foreground">{team.name}</span>
                                    {currentService && <span className="ml-1">· {currentService.duration} min</span>}
                                </span>
                            </div>
                            <div className="h-px bg-border" />
                            {/* Step indicators */}
                            <div className="flex items-center gap-1">
                                {stepLabels.map((s, i) => (
                                    <div key={i} className="contents">
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <div className={[
                                                'h-7 w-7 shrink-0 rounded-full grid place-items-center shadow',
                                                i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                                            ].join(' ')}>
                                                {s.icon}
                                            </div>
                                            <span className={`hidden sm:block text-xs whitespace-nowrap ${i === step ? 'font-semibold' : 'text-muted-foreground'}`}>
                                                {s.label}
                                            </span>
                                        </div>
                                        {i < stepLabels.length - 1 && (
                                            <div className="flex-1 h-px bg-border mx-1 min-w-[4px]" />
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
                {/* Steps */}
                {step === 0 && (
                    <ServiceStep
                        services={team.services}
                        selectedService={selectedService}
                        setSelectedService={(id) => {
                            setSelectedService(id);
                            setFormAnswers([]);
                            setSelectedMember('');
                        }}
                        setStep={setStep}
                    />
                )}

                {step === 1 && (
                    <MemberStep
                        members={membersForService}
                        selectedMember={selectedMember}
                        setSelectedMember={setSelectedMember}
                        setStep={setStep}
                    />
                )}

                {step === 2 && (
                    <DateStep
                        selectedDate={selectedDate}
                        setSelectedDate={setSelectedDate}
                        setSelectedDateYmd={setSelectedDateYmd}
                        setSelectedSlot={setSelectedSlot}
                        setStep={setStep}
                        minNoticeMinutes={team.minNoticeMinutes}
                    />
                )}

                {step === 3 && (
                    <SlotStep
                        slots={slots}
                        loadingSlots={loadingSlots}
                        selectedDate={selectedDate}
                        selectedSlot={selectedSlot}
                        setSelectedSlot={setSelectedSlot}
                        setStep={setStep}
                        nextStep={hasForm ? FORM_STEP : DATA_STEP}
                        timezone={timezone}
                    />
                )}

                {hasForm && step === FORM_STEP && (
                    <Card className="border-muted/50">
                        <CardContent className="p-4">
                            <QualificationStep
                                questions={serviceQuestions}
                                answers={formAnswers}
                                onAnswersChange={setFormAnswers}
                                onBack={() => setStep(3)}
                                onNext={() => setStep(DATA_STEP)}
                            />
                        </CardContent>
                    </Card>
                )}

                {step === DATA_STEP && (
                    <ClientDataStep
                        nameClient={nameClient}
                        areaCode={areaCode}
                        phone={phone}
                        countries={countries}
                        canContinue={canContinue}
                        loading={loading}
                        setNameClient={setNameClient}
                        setAreaCode={setAreaCode}
                        setPhone={setPhone}
                        setStep={setStep}
                        backStep={hasForm ? FORM_STEP : 3}
                        onContinue={handleConfirm}
                        onPhoneBlur={handlePhoneBlur}
                    />
                )}

                {/* Mini-resumen cuando el step es > 0 */}
                {step > 0 && (dateLabel || slotLocalLabel || currentService || selectedMember) && (
                    <Card className="border-muted/30 bg-muted/20">
                        <CardContent className="p-3">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {currentService && <span>📋 {currentService.name}</span>}
                                {selectedMember && membersForService.find((m) => m.id === selectedMember) && (
                                    <span>👤 {membersForService.find((m) => m.id === selectedMember)!.name}</span>
                                )}
                                {dateLabel && <span>📅 {dateLabel}</span>}
                                {slotLocalLabel && <span>⏰ {slotLocalLabel}</span>}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
            </div>
        </div>
    );
}
