'use client'

import { Suspense, useEffect, useMemo, useState } from 'react';
import Header from '@/components/shared/header';
import { ReminderListClient, ReminderSkeleton, ReminderModal } from './';
import { Button } from '@/components/ui/button';
import { ArrowDownUp, PlusIcon, Search, X } from 'lucide-react';
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

      // sortAsc = true => mayor a menor (más “lejos” primero: days > hours > minutes)
      // sortAsc = false => menor a mayor
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
          <div className="flex justify-between items-center">
            <Header
              title={isCampaignPage ? 'Campañas' : 'Recordatorios'}
            />
            <Button onClick={handleCreateReminder}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Crear
            </Button>
          </div>

          <div className="flex flex-row gap-2 items-center justify-start">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, número o nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:max-w-sm pl-8"
              />
            </div>

            <Button
              variant="ghost"
              onClick={() => setSortAsc(!sortAsc)}
              title={sortAsc ? "Ordenar descendente" : "Ordenar ascendente"}
              className="flex items-center gap-2"
            >
              <ArrowDownUp className="h-4 w-4" />
              {/* <span className="hidden md:inline">
                {sortAsc ? "Más recientes primero" : "Más antiguos primero"}
              </span> */}
            </Button>
          </div>
        </div>
      </div>

      {/* Scroll interno para el content */}
      <div className="flex-1 overflow-y-auto">

        <div className={isScheduleView ? 'flex gap-2 flex-col' : 'grid grid-cols-1 gap-2 p-2 md:grid-cols-2 xl:grid-cols-3'}>
          <Suspense fallback={<ReminderSkeleton />}>
            <ReminderListClient
              filteredReminders={filteredReminders}
              workflows={workflows}
              isScheduleView={isSchedule}
            />
          </Suspense>
        </div>
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
