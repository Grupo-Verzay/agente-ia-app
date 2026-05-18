'use client';

import { useState } from 'react';
import { Users, Wrench, Settings2, LayoutDashboard } from 'lucide-react';
import { MembersManager } from './members/MembersManager';
import { BookingServicesManager } from './services/BookingServicesManager';
import { BookingTeamSettings } from './settings/BookingTeamSettings';
import { BookingsCalendar } from './dashboard/BookingsCalendar';

type TabValue = 'dashboard' | 'members' | 'services' | 'settings';

const TABS: { value: TabValue; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'dashboard',  label: 'Dashboard',     Icon: LayoutDashboard },
    { value: 'members',   label: 'Especialistas',  Icon: Users },
    { value: 'services',  label: 'Servicios',      Icon: Wrench },
    { value: 'settings',  label: 'Ajustes',        Icon: Settings2 },
];

interface Props {
    user: any;
    team: any;
}

export const MainBookings = ({ user, team }: Props) => {
    const [tab, setTab] = useState<TabValue>('dashboard');
    const userId: string = (user as any).effectiveId ?? user.id;

    return (
        <div className="flex h-full w-full flex-col gap-3">
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
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-4">
                {tab === 'dashboard' && <BookingsCalendar teamId={team.id} />}
                {tab === 'members'   && <MembersManager teamId={team.id} teamTimezone={team.timezone} />}
                {tab === 'services'  && <BookingServicesManager teamId={team.id} />}
                {tab === 'settings'  && <BookingTeamSettings team={team} userId={userId} />}
            </div>
        </div>
    );
};
