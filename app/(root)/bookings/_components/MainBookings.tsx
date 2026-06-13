'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    LayoutDashboard, Kanban, Users, Wrench, Bell, Settings2, Building2, Calendar,
} from 'lucide-react';
import { AppointmentStatus } from '@prisma/client';
import { MetricCard } from '@/components/custom/MetricCard';
import { BookingsDashboardCalendar } from './dashboard/BookingsDashboardCalendar';
import { BookingsKanban } from './dashboard/BookingsKanban';
import { BookingTeamConfig } from './team/BookingTeamConfig';
import { MembersManager } from './members/MembersManager';
import { BookingServicesManager } from './services/BookingServicesManager';
import { BookingsRemindersManager } from './reminders/BookingsRemindersManager';
import { BookingTeamSettings } from './settings/BookingTeamSettings';
import { getBookingStatusCounts } from '@/actions/bookings-actions';

type TabValue = 'dashboard' | 'kanban' | 'team' | 'members' | 'services' | 'reminders' | 'settings';

const TABS: { value: TabValue; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'dashboard', label: 'Dashboard',    Icon: LayoutDashboard },
    { value: 'kanban',    label: 'Kanban',       Icon: Kanban },
    { value: 'team',      label: 'Equipo',       Icon: Building2 },
    { value: 'members',   label: 'Especialistas', Icon: Users },
    { value: 'services',  label: 'Servicios',    Icon: Wrench },
    { value: 'reminders', label: 'Recordatorios', Icon: Bell },
    { value: 'settings',  label: 'Ajustes',      Icon: Settings2 },
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

const FIXED_METRICS: AppointmentStatus[] = ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'CANCELADA'];

interface Props {
    user: any;
    team: any;
}

export const MainBookings = ({ user, team }: Props) => {
    const [tab, setTab] = useState<TabValue>('dashboard');
    const [statusCounts, setStatusCounts] = useState<{ status: AppointmentStatus; count: number }[]>([]);
    const userId: string = user.effectiveId ?? user.id;

    const loadCounts = useCallback(async () => {
        const res = await getBookingStatusCounts(team.id);
        if (res.success && res.data) setStatusCounts(res.data);
    }, [team.id]);

    useEffect(() => { loadCounts(); }, [loadCounts]);

    const countByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));
    const topMetrics = FIXED_METRICS.map((status) => ({
        status,
        count: countByStatus[status] ?? 0,
        ...STATUS_META[status],
    }));

    return (
        <div className="flex h-full w-full flex-col gap-3">
            {/* Metric cards */}
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

            {/* Tab nav */}
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

            {/* Contenido */}
            <div className="flex-1 min-h-0">
                {tab === 'dashboard' && (
                    <div className="h-full min-h-0 overflow-hidden pb-4">
                        <BookingsDashboardCalendar teamId={team.id} timezone={team.timezone} />
                    </div>
                )}

                {tab === 'kanban' && (
                    <div className="h-full flex flex-col">
                        <BookingsKanban teamId={team.id} userId={userId} onStatusCountsChange={setStatusCounts} />
                    </div>
                )}

                {tab === 'team' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <BookingTeamConfig team={team} />
                    </div>
                )}

                {tab === 'members' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <MembersManager teamId={team.id} teamTimezone={team.timezone} />
                    </div>
                )}

                {tab === 'services' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <BookingServicesManager teamId={team.id} />
                    </div>
                )}

                {tab === 'reminders' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <BookingsRemindersManager teamId={team.id} />
                    </div>
                )}

                {tab === 'settings' && (
                    <div className="h-full overflow-y-auto pb-4">
                        <BookingTeamSettings userId={userId} team={team} />
                    </div>
                )}
            </div>
        </div>
    );
};
