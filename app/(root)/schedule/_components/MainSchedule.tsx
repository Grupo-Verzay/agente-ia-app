'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    LayoutDashboard,
    CalendarDays,
    Kanban,
    Wrench,
    Bell,
    Settings2,
    Clock,
    Calendar,
    CalendarClock,
    CheckCircle2,
    ClipboardList,
    Inbox,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PastillasDeMetricas } from '@/components/shared/PastillasDeMetricas';
import { MainReminders } from '../../reminders/_components';
import { MainReminderInterface } from '@/schema/reminder';
import ServiceManager from './services/ServiceManager';
import { CustomCalendar } from './dashboard';
import { AgendaKanban } from './dashboard/AgendaKanban';
import { ShareScheduleLinkButton, UserAvailabilityForm } from './availability';
import { UpdateMeetingDuration, GoogleCalendarSettings } from './settings';
import { BookingFormBuilder } from './form/BookingFormBuilder';
import { BookingFormResponsesList, type BookingResponseCounts } from './form/BookingFormResponsesList';
import { getAppointmentStatusCounts } from '@/actions/appointments-actions';
import { AppointmentStatus } from '@prisma/client';
import { SelectorDeCuentas } from '@/components/shared/SelectorDeCuentas';
import { elCrmVaUnificado, nombresDeLasCuentas } from '@/lib/crm-de-la-familia';
import type { CuentasDelCrm } from '@/lib/cuentas-del-crm';

type TabValue = 'dashboard' | 'availability' | 'kanban' | 'services' | 'reminders' | 'form' | 'registros' | 'settings';

const TABS: { value: TabValue; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'dashboard',    label: 'Dashboard',      Icon: LayoutDashboard },
    { value: 'availability', label: 'Disponibilidad', Icon: CalendarDays },
    { value: 'kanban',       label: 'Kanban',         Icon: Kanban },
    { value: 'services',     label: 'Servicios',      Icon: Wrench },
    { value: 'reminders',    label: 'Recordatorios',  Icon: Bell },
    { value: 'form',         label: 'Formulario',     Icon: ClipboardList },
    { value: 'registros',    label: 'Registros',      Icon: Inbox },
    { value: 'settings',     label: 'Ajustes',        Icon: Settings2 },
];

const STATUS_META: Record<AppointmentStatus, { label: string; color: string }> = {
    PENDIENTE:   { label: 'Pendiente',   color: '#EAB308' },
    CONFIRMADA:  { label: 'Confirmada',  color: '#22C55E' },
    ATENDIDA:    { label: 'Atendida',    color: '#3B82F6' },
    NO_ASISTIDA: { label: 'No asistida', color: '#8B5CF6' },
    CANCELADA:   { label: 'Cancelada',   color: '#EF4444' },
    FINALIZADO:  { label: 'Finalizado',  color: '#059669' },
    DESCARTADO:  { label: 'Descartado',  color: '#52525B' },
};

// Siempre mostrar estos 4 estados como referencia fija
const FIXED_METRICS: AppointmentStatus[] = ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'CANCELADA'];

export const MainSchedule = ({
    isCampaignPage,
    user,
    apiKey,
    reminders,
    leads,
    workflows,
    instancia,
    cuentas,
}: MainReminderInterface & {
    /**
     * Las cuentas cuyas CITAS enseña el tablero, resueltas en el servidor con
     * la puerta del CRM. Solo las citas: lo demás es configuración de la
     * cuenta propia y se queda en ella.
     */
    cuentas?: CuentasDelCrm;
}) => {
    const [tab, setTab] = useState<TabValue>('dashboard');
    const [statusCounts, setStatusCounts] = useState<{ status: AppointmentStatus; count: number }[]>([]);
    const [bookingCounts, setBookingCounts] = useState<BookingResponseCounts>({ total: 0, synced: 0, pending: 0, recent: 0 });
    const userId: string = user.effectiveId ?? user.id;

    // Igual que en CRM › Llamadas: con una sola cuenta elegida —el caso de
    // siempre, y el único que ve una cuenta hija— el tablero se ve EXACTAMENTE
    // como antes: ni insignias ni citas de solo mirar.
    const elegidas = cuentas?.elegidas ?? [userId];
    const llaveDeCuentas = elegidas.join(',');
    const unificado = elCrmVaUnificado(elegidas);
    const nombresDeCuenta = useMemo(
        () => nombresDeLasCuentas(cuentas?.disponibles ?? []),
        [cuentas?.disponibles],
    );
    // Solo las pestañas de CITAS respetan el filtro: en Disponibilidad,
    // Servicios o Ajustes sería un filtro que promete lo que la pantalla no
    // hace — el «menú abierto, puerta cerrada» de siempre.
    const pestanaDeCitas = tab === 'dashboard' || tab === 'kanban';

    const handleBookingCounts = useCallback((counts: BookingResponseCounts) => {
        setBookingCounts(counts);
    }, []);

    const loadCounts = useCallback(async () => {
        const res = await getAppointmentStatusCounts(userId, llaveDeCuentas.split(','));
        if (res.success && res.data) setStatusCounts(res.data);
    }, [userId, llaveDeCuentas]);

    useEffect(() => { loadCounts(); }, [loadCounts]);

    // 4 estados fijos con sus conteos actuales
    const countByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));
    const topMetrics = FIXED_METRICS.map((status) => ({
        status,
        count: countByStatus[status] ?? 0,
        ...STATUS_META[status],
    }));

    // Métricas de la pestaña "Registros" (4 cards, mismo patrón que la fila superior).
    const bookingMetrics: { key: string; label: string; value: number; color: string; Icon: React.ComponentType<{ className?: string }>; helper: string }[] = [
        { key: 'total',   label: 'Total registros', value: bookingCounts.total,   color: '#3B82F6', Icon: ClipboardList, helper: 'Respuestas recibidas' },
        { key: 'synced',  label: 'Sincronizados',   value: bookingCounts.synced,  color: '#22C55E', Icon: CheckCircle2,  helper: 'Subidos a Google Sheets' },
        { key: 'pending', label: 'Pendientes',      value: bookingCounts.pending, color: '#EAB308', Icon: Clock,         helper: 'Sin sincronizar a Sheets' },
        { key: 'recent',  label: 'Esta semana',     value: bookingCounts.recent,  color: '#8B5CF6', Icon: CalendarClock, helper: 'Registros de los últimos 7 días' },
    ];

    return (
        <div className="flex h-full w-full flex-col gap-3" data-schedule-view>
            {/* Tab nav — CRM style, izquierda, altura fija. Las cifras que
                antes abrían la pantalla en tarjetas van en esta misma fila,
                como pastillas: aquí no hay filtro por estado de cita, así que
                no se pintan como pulsables. */}
            <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 overflow-x-auto">
                    {TABS.map(({ value, label, Icon }) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setTab(value)}
                            className={[
                                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                                tab === value
                                    ? 'bg-background shadow-sm text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            ].join(' ')}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
                {/* El filtro por cuenta: el MISMO control y las mismas props que
                    en CRM › Llamadas. Lo decide el servidor —quien no tiene
                    cuentas debajo no lo ve— y solo sale donde acota algo. */}
                {cuentas?.puedeElegir && pestanaDeCitas && (
                    <div className="ml-auto shrink-0">
                        <SelectorDeCuentas
                            disponibles={cuentas.disponibles}
                            elegidas={cuentas.elegidas}
                            porDefecto="todas"
                            conMoneda={false}
                        />
                    </div>
                )}
                <PastillasDeMetricas
                    metricas={tab === 'registros'
                        ? bookingMetrics.map((m) => ({
                            clave: m.key,
                            icono: <m.Icon />,
                            etiqueta: m.label,
                            valor: m.value,
                            ayuda: m.helper,
                            color: m.color,
                        }))
                        : topMetrics.map((m) => ({
                            clave: m.status,
                            icono: <Calendar />,
                            etiqueta: m.label,
                            valor: m.count,
                            ayuda: `Citas en estado "${m.label}"`,
                            color: m.color,
                        }))}
                />
            </div>

            {/* Contenido — ocupa el espacio restante */}
            <div className="flex-1 min-h-0">
                {/* Dashboard */}
                {tab === 'dashboard' && (
                    <div className="h-full min-h-0 overflow-hidden pb-4">
                        <Card className="border-none bg-transparent">
                            <CardContent className="p-0">
                                <CustomCalendar
                                    user={user}
                                    cuentas={elegidas}
                                    unificado={unificado}
                                    nombresDeCuenta={nombresDeCuenta}
                                />
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Disponibilidad */}
                {tab === 'availability' && (
                    <div className="h-full overflow-y-auto flex flex-col gap-4 pb-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                <Clock className="w-4 h-4 shrink-0 text-blue-500" />
                                Configura los horarios en que estás disponible para recibir citas.
                            </p>
                            <ShareScheduleLinkButton userId={userId} />
                        </div>
                        <UserAvailabilityForm userId={userId} />
                    </div>
                )}

                {/* Kanban */}
                {tab === 'kanban' && (
                    <div className="h-full flex flex-col">
                        <AgendaKanban
                            userId={userId}
                            cuentas={elegidas}
                            unificado={unificado}
                            nombresDeCuenta={nombresDeCuenta}
                            onStatusCountsChange={setStatusCounts}
                        />
                    </div>
                )}

                {/* Servicios */}
                {tab === 'services' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <Card className="border-none bg-transparent">
                            <CardContent className="flex flex-col gap-2 p-0">
                                <ServiceManager userId={userId} />
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Recordatorios */}
                {tab === 'reminders' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <Card className="border-none bg-transparent">
                            <CardContent className="flex flex-col gap-2 p-0">
                                <MainReminders
                                    isCampaignPage={isCampaignPage}
                                    user={user}
                                    apiKey={apiKey}
                                    reminders={reminders}
                                    leads={leads}
                                    workflows={workflows}
                                    instancia={instancia}
                                    isScheduleView={true}
                                    isSchedule={true}
                                />
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Formulario */}
                {tab === 'form' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <Card className="border-none bg-transparent shadow-none">
                            <CardContent className="flex flex-col gap-2 p-0">
                                <BookingFormBuilder userId={userId} />
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Registros */}
                {tab === 'registros' && (
                    <div className="h-full min-h-0">
                        <BookingFormResponsesList userId={userId} onCountsChange={handleBookingCounts} />
                    </div>
                )}

                {/* Ajustes */}
                {tab === 'settings' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="h-full rounded-xl border bg-card shadow-sm p-6">
                                <UpdateMeetingDuration
                                    userId={userId}
                                    meetingDuration={user.meetingDuration ?? 60}
                                    meetingUrl={user.meetingUrl}
                                    minNoticeMinutes={user.minNoticeMinutes ?? 0}
                                />
                            </div>
                            <div className="h-full rounded-xl border bg-card shadow-sm p-6">
                                <GoogleCalendarSettings userId={userId} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
