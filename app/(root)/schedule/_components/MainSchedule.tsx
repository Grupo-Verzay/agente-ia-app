'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    LayoutDashboard,
    CalendarDays,
    Kanban,
    Wrench,
    Bell,
    Settings2,
    Clock,
    Calendar,
    ClipboardList,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { MetricCard } from '@/components/custom/MetricCard';
import { MainReminders } from '../../reminders/_components';
import { MainReminderInterface } from '@/schema/reminder';
import ServiceManager from './services/ServiceManager';
import { CustomCalendar } from './dashboard';
import { AgendaKanban } from './dashboard/AgendaKanban';
import { ShareScheduleLinkButton, UserAvailabilityForm } from './availability';
import { UpdateMeetingDuration } from './settings';
import { BookingFormBuilder } from './form/BookingFormBuilder';
import { getAppointmentStatusCounts } from '@/actions/appointments-actions';
import { AppointmentStatus } from '@prisma/client';

type TabValue = 'dashboard' | 'availability' | 'kanban' | 'services' | 'reminders' | 'form' | 'settings';

const TABS: { value: TabValue; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'dashboard',    label: 'Dashboard',      Icon: LayoutDashboard },
    { value: 'availability', label: 'Disponibilidad', Icon: CalendarDays },
    { value: 'kanban',       label: 'Kanban',         Icon: Kanban },
    { value: 'services',     label: 'Servicios',      Icon: Wrench },
    { value: 'reminders',    label: 'Recordatorios',  Icon: Bell },
    { value: 'form',         label: 'Formulario',     Icon: ClipboardList },
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
}: MainReminderInterface) => {
    const [tab, setTab] = useState<TabValue>('dashboard');
    const [statusCounts, setStatusCounts] = useState<{ status: AppointmentStatus; count: number }[]>([]);
    const userId: string = user.effectiveId ?? user.id;

    const loadCounts = useCallback(async () => {
        const res = await getAppointmentStatusCounts(userId);
        if (res.success && res.data) setStatusCounts(res.data);
    }, [userId]);

    useEffect(() => { loadCounts(); }, [loadCounts]);

    // 4 estados fijos con sus conteos actuales
    const countByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));
    const topMetrics = FIXED_METRICS.map((status) => ({
        status,
        count: countByStatus[status] ?? 0,
        ...STATUS_META[status],
    }));

    return (
        <div className="flex h-full w-full flex-col gap-3" data-schedule-view>
            {/* Metric cards — siempre visibles, altura fija */}
            <div className="grid grid-cols-2 gap-2 shrink-0 sm:flex sm:flex-wrap sm:gap-3">
                {topMetrics.map((m) => (
                    <div key={m.status} className="min-w-0 sm:flex-1">
                        <MetricCard
                            icon={<Calendar className="h-4 w-4" />}
                            label={m.label}
                            value={m.count}
                            helper={`Citas en estado "${m.label}"`}
                            color={m.color}
                        />
                    </div>
                ))}
            </div>

            {/* Tab nav — CRM style, izquierda, altura fija */}
            <div className="flex shrink-0">
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
            </div>

            {/* Contenido — ocupa el espacio restante */}
            <div className="flex-1 min-h-0">
                {/* Dashboard */}
                {tab === 'dashboard' && (
                    <div className="h-full min-h-0 overflow-hidden pb-4">
                        <Card className="border-none bg-transparent">
                            <CardContent className="p-0">
                                <CustomCalendar user={user} />
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
                        <AgendaKanban userId={userId} onStatusCountsChange={setStatusCounts} />
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
                        <div className="flex justify-center py-4 px-4">
                            <div className="w-full max-w-lg rounded-xl border bg-card shadow-sm p-6">
                                <BookingFormBuilder userId={userId} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Ajustes */}
                {tab === 'settings' && (
                    <div className="h-full overflow-y-auto">
                        <div className="flex justify-center py-8 px-4">
                            <div className="w-full max-w-lg rounded-xl border bg-card shadow-sm p-6">
                                <UpdateMeetingDuration
                                    userId={userId}
                                    meetingDuration={user.meetingDuration ?? 60}
                                    meetingUrl={user.meetingUrl}
                                    minNoticeMinutes={user.minNoticeMinutes ?? 0}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
