'use client'

import { Suspense, useEffect, useMemo, useState } from 'react';
import { ReminderListClient, ReminderSkeleton, ReminderModal } from './';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Clock3, Kanban, List, Repeat2, Search, Settings2, Trash2 } from 'lucide-react';
import { MainReminderInterface } from '@/schema/reminder';
import { Input } from '@/components/ui/input';
import { closeDialog, openCreateDialog, useReminderDialogStore } from '@/stores';
import { GenericDeleteDialog } from '@/components/shared/GenericDeleteDialog';
import { deleteAllReminders, deleteReminder } from '@/actions/reminders-actions';
import { toast } from 'sonner';
import { themeClass } from '@/types/generic';
import { convertToSeconds } from '../../workflow/[workflowId]/helpers';
import { PastillasDeMetricas } from '@/components/shared/PastillasDeMetricas';
import { ReminderList } from './ReminderList';
import { Badge } from '@/components/ui/badge';
import type { Reminders } from '@prisma/client';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ReminderGroupAutomationsPanel } from '@/app/(root)/crm/rules/components/ReminderGroupAutomationsPanel';
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { elGrupoDelRecordatorio, seVeEnLaListaDeRecordatorios, type GrupoDelRecordatorio } from '@/lib/pendientes-del-menu';

// La regla de los grupos vive en `lib/pendientes-del-menu`: el numerito de
// «Recordatorios» en el menú lateral sale de la MISMA función, así que dice lo
// mismo que la pastilla «Pendientes» de esta pantalla.
type ReminderGroup = GrupoDelRecordatorio;
const getReminderGroup = (reminder: Reminders, now: number, tomorrow: number, dayAfterTomorrow: number): ReminderGroup =>
  elGrupoDelRecordatorio(reminder, now, tomorrow, dayAfterTomorrow);

export const MainReminders = ({ isCampaignPage, user, apiKey, reminders, deliverySummaries, leads, workflows, instancia, isScheduleView, isSchedule }: MainReminderInterface) => {
  const { openDialog, selectedReminderId, setCampaignPage } = useReminderDialogStore();

  useEffect(() => {
    setCampaignPage(isCampaignPage);
  }, [isCampaignPage, setCampaignPage]);

  const [search, setSearch] = useState("");
  const [automationsOpen, setAutomationsOpen] = useState<string | null>(null);
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
      sent: 0,
      expired: 0,
    };

    // Las pastillas cuentan lo que la LISTA enseña —sin las plantillas de la
    // Agenda—, con la misma regla que el número del menú.
    reminders.filter(seVeEnLaListaDeRecordatorios).forEach((reminder) => {
      const group = getReminderGroup(reminder, now, startOfTomorrow.getTime(), startOfDayAfterTomorrow.getTime());
      counts[group]++;
    });

    return counts;
  }, [reminders]);

  // Schedule view: sorted by time DESC (mayor tiempo primero, automático)
  const scheduleReminders = useMemo(() => {
    const timeToSeconds = (time: string | null): number => {
      if (!time) return 0;
      const m = time.match(/^(hours|minutes|days)-(\d+)$/);
      if (!m) return 0;
      const n = Number(m[2]);
      if (m[1] === 'hours') return n * 3600;
      if (m[1] === 'days') return n * 86400;
      return n * 60;
    };

    return reminders
      .filter((r) => r.isSchedule === true)
      .filter((r) => {
        if (!search) return true;
        const text = `${r.title} ${r.description ?? ""} ${r.pushName ?? ""} ${r.remoteJid ?? ""}`.toLowerCase();
        return text.includes(search.toLowerCase());
      })
      .sort((a, b) => timeToSeconds(b.time) - timeToSeconds(a.time));
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
      if (!seVeEnLaListaDeRecordatorios(r)) return false;
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
      sent: [],
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
      { key: 'sent', label: 'Enviados', color: '#10B981', items: groups.sent },
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
          {/* El selector de vista va en su propia fila para que el buscador y las
              acciones ("+ Crear") queden SIEMPRE en la misma línea, alineados.
              Las cifras que antes abrían la pantalla en tarjetas van en esa
              misma fila: aquí no hay filtro por estado, así que no son
              pulsables. */}
          <div className="flex shrink-0 flex-col gap-2">
            {!isScheduleView && (
              <div className="flex items-center justify-between gap-2">
              <div className="flex w-fit gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 overflow-x-auto" data-zona="vista">
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
              <div data-zona="cifras">
              <PastillasDeMetricas
                metricas={[
                  { clave: 'pending', icono: <Bell />, etiqueta: 'Pendientes', valor: reminderMetrics.pending, color: '#F59E0B', ayuda: isCampaignPage ? 'Campañas pendientes por enviar' : 'Recordatorios pendientes por enviar' },
                  { clave: 'today', icono: <Clock3 />, etiqueta: 'Para hoy', valor: reminderMetrics.today, color: '#3B82F6', ayuda: isCampaignPage ? 'Campañas programadas para hoy' : 'Recordatorios programados para hoy' },
                  { clave: 'sent', icono: <CheckCircle2 />, etiqueta: 'Enviados', valor: reminderMetrics.sent, color: '#10B981', ayuda: isCampaignPage ? 'Campañas ya enviadas' : 'Recordatorios ya enviados' },
                  { clave: 'expired', icono: <AlertTriangle />, etiqueta: 'Vencidos', valor: reminderMetrics.expired, color: '#EF4444', ayuda: isCampaignPage ? 'Campañas vencidas sin enviar' : 'Recordatorios vencidos sin enviar' },
                ]}
              />
              </div>
              </div>
            )}

            <ModuleToolbar
              buscador={
                <div className="relative w-56 sm:w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por título, número o nombre..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8"
                  />
                </div>
              }
              right={<BotonDeCrear onClick={handleCreateReminder}>Nuevo</BotonDeCrear>}
              acciones={
                /* «Eliminar todos» ya era una acción sobre VARIOS: su sitio es
                   el `⋯` de la esquina, no un botón rojo suelto en la fila. */
                !isScheduleView ? (
                  <AccionesMasivas
                    seleccionados={[]}
                    queSon={isCampaignPage ? "campañas" : "recordatorios"}
                    extras={
                      reminders.length > 0
                        ? [{
                            clave: "todos",
                            etiqueta: "Eliminar todos",
                            icono: <Trash2 className="h-4 w-4" />,
                            destructiva: true,
                            sinSeleccion: true,
                            onSelect: () => setShowDeleteAll(true),
                          }]
                        : []
                    }
                  />
                ) : null
              }
            />
          </div>
        </div>
      </div>

      {/* Scroll interno para el content */}
      <div className="flex-1 overflow-y-auto">
        {isScheduleView ? (
          scheduleReminders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-8">
              No se encontraron recordatorios.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {scheduleReminders.map((reminder) => (
                <ReminderList
                  key={reminder.id}
                  reminder={reminder}
                  workflow={workflows.find((w) => w.id === reminder.workflowId)}
                />
              ))}
            </div>
          )
        ) : view === 'kanban' ? (
          <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-3" data-zona="kanban">
            {kanbanColumns.map((column) => (
              <div
                key={column.key}
                data-columna={column.key}
                className="flex h-full w-[260px] min-w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border-2 shadow-sm"
                style={{ borderColor: `${column.color}52`, backgroundColor: `${column.color}0A` }}
              >
                <div className="flex shrink-0 items-center justify-between px-3 py-2" style={{ backgroundColor: column.color }}>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-white/80" />
                    <span className="text-sm font-semibold text-white uppercase">{column.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className="border-0 bg-white/20 text-xs font-medium text-white">{column.items.length}</Badge>
                    <button
                      type="button"
                      className="text-white/70 hover:text-white transition-colors"
                      onClick={() => setAutomationsOpen(column.key)}
                      title="Configurar automatizaciones"
                      aria-label={`Configurar automatizaciones de ${column.label}`}
                      data-boton="automatizaciones"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Sheet open={automationsOpen === column.key} onOpenChange={(v) => !v && setAutomationsOpen(null)}>
                  <SheetContent side="right" className="w-[420px] sm:w-[480px] overflow-y-auto" data-automatizaciones-del-grupo={column.key}>
                    <SheetHeader>
                      <SheetTitle>Automatizaciones · {column.label}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4">
                      <ReminderGroupAutomationsPanel userId={user.id} reminderGroup={column.key} groupLabel={column.label} />
                    </div>
                  </SheetContent>
                </Sheet>
                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-2">
                  {column.items.map((reminder) => (
                    <ReminderList
                      key={reminder.id}
                      reminder={reminder}
                      workflow={workflows.find((workflow) => workflow.id === reminder.workflowId)}
                      deliverySummary={deliverySummaries?.[reminder.id]}
                      compact
                    />
                  ))}
                  {column.items.length === 0 && (
                    <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/40">
                      {isCampaignPage ? "Sin campañas" : "Sin recordatorios"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 p-2" data-zona="lista">
            <Suspense fallback={<ReminderSkeleton />}>
              <ReminderListClient
                filteredReminders={filteredReminders}
                workflows={workflows}
                deliverySummaries={deliverySummaries}
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
          entityLabel={`${isCampaignPage ? 'campaña' : 'recordatorio'}`}
          queSeElimina={isCampaignPage ? 'ESTA CAMPAÑA' : undefined}
        />
      }

      <GenericDeleteDialog
        open={showDeleteAll}
        setOpen={setShowDeleteAll}
        itemName="Si"
        itemId="all"
        mutationFn={() => deleteAllReminders(user.id, isCampaignPage)}
        entityLabel={isCampaignPage ? 'campañas' : 'todos los recordatorios'}
        queSeElimina={isCampaignPage ? 'TODAS TUS CAMPAÑAS' : undefined}
      />
    </div>
  );
};
