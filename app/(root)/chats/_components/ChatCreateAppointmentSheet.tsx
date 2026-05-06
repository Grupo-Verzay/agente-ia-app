'use client';

import { useState } from 'react';
import { CalendarPlus, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getUserScheduleConfig, createAppointment } from '@/actions/appointments-actions';
import { getAvailableSlots } from '@/actions/getAvailableSlots-actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  sessionId: number;
  pushName?: string | null;
  remoteJid: string;
  instanceId?: string | null;
  onCreated: () => void;
}

type Config = { timezone: string; meetingDuration: number; services: { id: string; name: string }[] };
type Slot = { startTime: string; endTime: string };

export function ChatCreateAppointmentSheet({
  open,
  onOpenChange,
  userId,
  sessionId,
  pushName,
  remoteJid,
  instanceId,
  onCreated,
}: Props) {
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [dateYmd, setDateYmd] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);

  const handleOpen = async (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setServiceId('');
      setDateYmd('');
      setSlots([]);
      setSelectedSlot(null);
      return;
    }
    if (config) return;
    setLoadingConfig(true);
    try {
      const res = await getUserScheduleConfig(userId);
      if (res.success && res.data) setConfig(res.data);
      else toast.error(res.message ?? 'Error al cargar servicios');
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleDateChange = async (date: string) => {
    setDateYmd(date);
    setSlots([]);
    setSelectedSlot(null);
    if (!config || !date) return;
    setLoadingSlots(true);
    try {
      const res = await getAvailableSlots(userId, date, config.meetingDuration, config.timezone);
      if (res.success && res.data) setSlots(res.data);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSubmit = async () => {
    if (!serviceId || !selectedSlot || !config) return;
    const phone = remoteJid.replace(/@.*$/, '');
    setSaving(true);
    try {
      const res = await createAppointment({
        userId,
        sessionId,
        pushName: pushName ?? phone,
        phone,
        instanceName: instanceId ?? '',
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        timezone: config.timezone,
        serviceId,
      });
      if (res.success) {
        toast.success('Cita agendada correctamente');
        onCreated();
        onOpenChange(false);
      } else {
        toast.error(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const todayYmd = new Date().toISOString().split('T')[0];

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" />
            Agendar cita
            {pushName && <span className="text-muted-foreground font-normal text-sm">· {pushName}</span>}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-5 pr-1">
          {loadingConfig && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingConfig && config && config.services.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay servicios configurados. Crea uno en Agenda → Servicios.
            </p>
          )}

          {!loadingConfig && config && config.services.length > 0 && (
            <>
              <div className="space-y-1.5">
                <Label>Servicio</Label>
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un servicio" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <input
                  type="date"
                  value={dateYmd}
                  min={todayYmd}
                  onChange={(e) => void handleDateChange(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {dateYmd && (
                <div className="space-y-1.5">
                  <Label>Horario disponible</Label>

                  {loadingSlots && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Cargando horarios...
                    </div>
                  )}

                  {!loadingSlots && slots.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin horarios disponibles para este día.</p>
                  )}

                  {!loadingSlots && slots.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5">
                      {slots.map((slot) => {
                        const label = format(new Date(slot.startTime), 'HH:mm', { locale: es });
                        const active = selectedSlot?.startTime === slot.startTime;
                        return (
                          <button
                            key={slot.startTime}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors ${
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-accent border-input'
                            }`}
                          >
                            <Clock className="h-2.5 w-2.5 opacity-70 shrink-0" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!loadingConfig && config && config.services.length > 0 && (
          <div className="pt-4 border-t mt-4">
            <Button
              className="w-full"
              disabled={!serviceId || !selectedSlot || saving}
              onClick={handleSubmit}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar cita
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
