'use client'

import { Suspense, useEffect, useMemo, useState } from 'react';
import Header from '@/components/shared/header';
import { ReminderListClient, ReminderSkeleton, ReminderModal } from './';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Bell, CalendarDays, Clock3, Kanban, List, Repeat2, Search } from 'lucide-react';
import { MainReminderInterface } from '@/schema/reminder';
import { Input } from '@/components/ui/input';
import { closeDialog, openCreateDialog, useReminderDialogStore } from '@/stores';
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog';
import { deleteAllReminders, deleteReminder } from '@/actions/reminders-actions';
import { toast } from 'sonner';
import { themeClass } from '@/types/generic';
import { convertToSeconds } from '../../workflow/[workflowId]/helpers';
import { MetricCard } from '@/components/custom/MetricCard';
import { ReminderList } from './ReminderList';
import { SortableReminderList } from './SortableReminderList';
import { Badge } from '@/components/ui/badge';
import type { Reminders } from '@prisma/client';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';

const parseReminderTime = (time: string | null) => {
  if (!time) return null;
  const direct = new Date(time);
  if (!Number.isNaN(direct.getTime())) return direct.getTime();

  const match = time.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hours, minutes] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)).getTime();
};

type ReminderGroup = 'pending' | 'today' | 'tomorrow' | 'recurring' | 'expired';

const getReminderGroup = (reminder: Reminders, now: number, tomorrow: number, dayAfterTomorrow: number): ReminderGroup => {
  if (reminder.repeatType && reminder.repeatType !== 'NONE') return 'recurring';

  const timestamp = parseReminderTime(reminder.time);
  if (timestamp === null || timestamp >= dayAfterTomorrow) return 'pending';
  if (timestamp < now) return 'expired';
  if (timestamp < tomorrow) return 'today';
  return 'tomorrow';
};

export const MainReminders = ({ isCampaignPage, user, apiKey, reminders, leads, workflows, instancia, isScheduleView, isSchedule }: MainReminderInterface) => {
  const { openDialog, selectedReminderId, setCampaignPage } = useReminderDialogStore();

  useEffect(() => {
    setCampaignPage(isCampaignPage);
  }, [isCampaignPage, setCampaignPage]);

  const [search, setSearch] = useState("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [view, setView] = useState<'list' | 'kanban'>('list');

  const reminderMetrics = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const startOfDayAfterTomorrow = new Date(startOfTomorrow);
    startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);

    const counts: Record<ReminderGroup, number> = {
      pending: 0,
      today: 0,
      tomorrow: 0,
      recurring: 0,
      expired: 0,
    };

    reminders.forEach((reminder) => {
      const group = getReminderGroup(reminder, now, startOfTomorrow.getTime(), startOfDayAfterTomorrow.getTime());
      counts[group]++;
    });

    return counts;
  }, [reminders]);

  // Schedule view: sorted by order ASC, then by time seconds DESC (mayor tiempo primero)
  const scheduleReminders = useMemo(() => {
    const timeToSeconds = (time: string | null): number => {
      if (!time) return 0;
      const m = time.match(/^(hours|minutes)-(\d+)$/);
      if (!m) return 0;
      const n = Number(m[2]);
      return m[1] === 'hours' ? n * 3600 : n * 60;
    };

    return reminders
      .filter((r) => r.isSchedule === true)
      .filter((r) => {
        if (!search) return true;
        const text = `${r.title} ${r.description ?? ""} ${r.pushName ?? ""} ${r.remoteJid ?? ""}`.toLowerCase();
        return text.includes(search.toLowerCase());
      })
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return timeToSeconds(b.time) - timeToSeconds(a.time);
      });
  }, [reminders, search]);

  const filteredReminders = useMemo(() => {
    const getSeconds = (time: string | null) => {
      if (!time) return 0;
      try {
        const [, secondsStr] = convertToSeconds(time).split("-");
        return Number(secondsStr) || 0;
      } catch {
        return 0;
      }
    };

    const sorted = [...reminders].sort((a, b) => {
      const aSec = getSeconds(a.time);
      const bSec = getSeconds(b.time);
      return bSec - aSec;
    });

    return sorted.filter((r) => {
      if (r.isSchedule) return false;
      const fullText = `${r.title} ${r.description ?? ""} ${r.pushName} ${r.remoteJid}`.toLowerCase();
      return fullText.includes(search.toLowerCase());
    });
  }, [reminders, search]);

  const kanbanColumns = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const startOfDayAfterTomorrow = new Date(startOfTomorrow);
    startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);
    const tomorrow = startOfTomorrow.getTime();
    const dayAfterTomorrow = startOfDayAfterTomorrow.getTime();

    const groups: Record<ReminderGroup, Reminders[]> = {
      pending: [],
      today: [],
      tomorrow: [],
      recurring: [],
      expired: [],
    };

    filteredReminders.forEach((reminder) => {
      const group = getReminderGroup(reminder, now, tomorrow, dayAfterTomorrow);
      groups[group].push(reminder);
    });

    return [
      { key: 'pending', label: 'Pendientes', color: '#F59E0B', items: groups.pending },
      { key: 'today', label: 'Para hoy', color: '#3B82F6', items: groups.today },
      { key: 'tomorrow', label: 'Mañana', color: '#22C55E', items: groups.tomorrow },
      { key: 'recurring', label: 'Recurrentes', color: '#8B5CF6', items: groups.recurring },
      { key: 'expired', label: 'Vencidos', color: '#EF4444', items: groups.expired },
    ];
  }, [filteredReminders]);


  const handleCreateReminder = () => {
    const countScheduleReminders = reminders.filter(r => r.isSchedule === true);

    if (isScheduleView && countScheduleReminders.length >= 10) return toast.info('No se pueden crear más de 10 recordatorios en el módulo de agendamiento.')
    openCreateDialog()
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header fijo */}
      <div className={`sticky top-0 z-1 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-2">
          {!isScheduleView && (
            <>
              {isCampaignPage ? (
                <Header title="Campañas" />
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                  <div className="min-w-0">
                    <MetricCard icon={<Bell className="h-4 w-4" />} label="Pendientes" value={reminderMetrics.pending} helper="Recordatorios pendientes por enviar" color="#F59E0B" />
                  </div>
                  <div className="min-w-0">
                    <MetricCard icon={<Clock3 className="h-4 w-4" />} label="Para hoy" value={reminderMetrics.today} helper="Recordatorios programados para hoy" color="#3B82F6" />
                  </div>
                  <div className="min-w-0">
                    <MetricCard icon={<Repeat2 className="h-4 w-4" />} label="Recurrentes" value={reminderMetrics.recurring} helper="Recordatorios configurados para repetirse" color="#8B5CF6" />
                  </div>
                  <div className="min-w-0">
                    <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Vencidos" value={reminderMetrics.expired} helper="Recordatorios con fecha anterior al momento actual" color="#EF4444" />
                  </div>
                </div>
              )}
            </>
          )}

          <ModuleToolbar className="shrink-0">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {!isScheduleView && !isCampaignPage && (
                <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <List className="h-3.5 w-3.5" /> Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('kanban')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Kanban className="h-3.5 w-3.5" /> Kanban
                  </button>
                </div>
              )}

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título, número o nombre..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8"
                />
              </div>
            </div>

            {!isScheduleView && (
              <div className="flex items-center gap-2">
                {reminders.length > 0 && (
                  <Button size="sm" variant="destructive" onClick={() => setShowDeleteAll(true)}>
                    Eliminar todos
                  </Button>
                )}
                <Button size="sm" onClick={handleCreateReminder} className="bg-blue-600 hover:bg-blue-700 text-white">
                  + Crear
                </Button>
              </div>
            )}

            {isScheduleView && (
              <Button size="sm" onClick={handleCreateReminder} className="bg-blue-600 hover:bg-blue-700 text-white">
                + Crear
              </Button>
            )}
          </ModuleToolbar>
        </div>
      </div>

      {/* Scroll interno para el content */}
      <div className="flex-1 overflow-y-auto">
        {isScheduleView ? (
          <SortableReminderList
            reminders={scheduleReminders}
            workflows={workflows}
          />
        ) : !isCampaignPage && view === 'kanban' ? (
          <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-3">
            {kanbanColumns.map((column) => (
              <div
                key={column.key}
                className="flex h-full w-[260px] min-w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border-2 shadow-sm"
                style={{ borderColor: `${column.color}52`, backgroundColor: `${column.color}0A` }}
              >
                <div className="flex shrink-0 items-center justify-between px-3 py-2" style={{ backgroundColor: column.color }}>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-white/80" />
                    <span className="text-sm font-semibold text-white">{column.label}</span>
                  </div>
                  <Badge className="border-0 bg-white/20 text-xs font-medium text-white">{column.items.length}</Badge>
                </div>
                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-2">
                  {column.items.map((reminder) => (
                    <ReminderList
                      key={reminder.id}
                      reminder={reminder}
                      workflow={workflows.find((workflow) => workflow.id === reminder.workflowId)}
                      compact
                    />
                  ))}
                  {column.items.length === 0 && (
                    <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/40">
                      Sin recordatorios
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 p-2">
            <Suspense fallback={<ReminderSkeleton />}>
              <ReminderListClient
                filteredReminders={filteredReminders}
                workflows={workflows}
                isScheduleView={isSchedule}
              />
            </Suspense>
          </div>
        )}
      </div>

      <ReminderModal
        instancia={instancia}
        user={user}
        apiKey={apiKey}
        leads={leads}
        workflows={workflows}
        isSchedule={isSchedule}
      />

      {openDialog && selectedReminderId &&
        <GenericDeleteDialog
          open={openDialog === 'delete'}
          setOpen={(val) => {
            if (!val) closeDialog(); // cerrar si el usuario cancela o se cierra el modal
          }}
          itemName="Si"
          itemId={selectedReminderId}
          mutationFn={() => deleteReminder(selectedReminderId)}
          entityLabel={`${isCampaignPage ? 'la campaña' : 'recordatorio'}`}
        />
      }

      <GenericDeleteDialog
        open={showDeleteAll}
        setOpen={setShowDeleteAll}
        itemName="Si"
        itemId="all"
        mutationFn={() => deleteAllReminders(user.id, isCampaignPage)}
        entityLabel={`todos los ${isCampaignPage ? 'campañas' : 'recordatorios'}`}
      />
    </div>
  );
};
