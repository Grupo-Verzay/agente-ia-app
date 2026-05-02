'use client'

import { Suspense, useEffect, useMemo, useState } from 'react';
import Header from '@/components/shared/header';
import { ReminderListClient, ReminderSkeleton, ReminderModal } from './';
import { SortableReminderList } from './SortableReminderList';
import { Button } from '@/components/ui/button';
import { ArrowDownUp, PlusIcon, Search } from 'lucide-react';
import { MainReminderInterface } from '@/schema/reminder';
import { Input } from '@/components/ui/input';
import { closeDialog, openCreateDialog, useReminderDialogStore } from '@/stores';
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog';
import { deleteReminder } from '@/actions/reminders-actions';
import { toast } from 'sonner';
import { themeClass } from '@/types/generic';
import { convertToSeconds } from '../../workflow/[workflowId]/helpers';

export const MainReminders = ({ isCampaignPage, user, apiKey, reminders, leads, workflows, instancia, isScheduleView, isSchedule }: MainReminderInterface) => {
  const { openDialog, selectedReminderId, setCampaignPage } = useReminderDialogStore();

  useEffect(() => {
    setCampaignPage(isCampaignPage);
  }, [isCampaignPage, setCampaignPage]);

  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  // Schedule view: sorted by DB order (drag-and-drop), filtered by search
  const scheduleReminders = useMemo(() => {
    return reminders
      .filter((r) => r.isSchedule === true)
      .filter((r) => {
        if (!search) return true;
        const text = `${r.title} ${r.description ?? ""} ${r.pushName ?? ""} ${r.remoteJid ?? ""}`.toLowerCase();
        return text.includes(search.toLowerCase());
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
      return sortAsc ? bSec - aSec : aSec - bSec;
    });

    return sorted.filter((r) => {
      const fullText = `${r.title} ${r.description ?? ""} ${r.pushName} ${r.remoteJid}`.toLowerCase();
      return fullText.includes(search.toLowerCase());
    });
  }, [reminders, search, sortAsc]);


  const handleCreateReminder = () => {
    const countScheduleReminders = reminders.filter(r => r.isSchedule === true);

    if (isScheduleView && countScheduleReminders.length >= 10) return toast.info('No se pueden crear más de 10 recordatorios en el módulo de agendamiento.')
    openCreateDialog()
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header fijo */}
      <div className={`sticky -top-4 z-1 mb-2 ${themeClass}`}>
        <div className="flex flex-col overflow-hidden justify-between flex-1 gap-4">
          {!isScheduleView && (
            <div className="flex justify-between items-center">
              <Header title={isCampaignPage ? 'Campañas' : 'Recordatorios'} />
              <Button size="sm" onClick={handleCreateReminder}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Nuevo
              </Button>
            </div>
          )}

          <div className="flex flex-row gap-2 items-center">
            <div className="relative w-64 shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, número o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8"
              />
            </div>

            {!isScheduleView && (
              <Button
                variant="ghost"
                onClick={() => setSortAsc(!sortAsc)}
                title={sortAsc ? "Ordenar descendente" : "Ordenar ascendente"}
                className="flex items-center gap-2"
              >
                <ArrowDownUp className="h-4 w-4" />
              </Button>
            )}

            {isScheduleView && (
              <Button size="sm" onClick={handleCreateReminder} className="ml-auto">
                <PlusIcon className="h-4 w-4 mr-2" />
                Nuevo
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scroll interno para el content */}
      <div className="flex-1 overflow-y-auto">
        {isScheduleView ? (
          <SortableReminderList
            reminders={scheduleReminders}
            workflows={workflows as any}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-2 xl:grid-cols-3">
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
    </div>
  );
};
