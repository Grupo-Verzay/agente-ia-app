'use client';

import { useState } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
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
import { SelectorDeFechaYHora, type HuecoDeAgenda } from '@/components/shared/SelectorDeFechaYHora';

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
type Slot = HuecoDeAgenda;

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
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);

  const handleOpen = async (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setServiceId('');
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

              <SelectorDeFechaYHora
                cuentaId={userId}
                zona={config.timezone}
                duracionMinutos={config.meetingDuration}
                valor={selectedSlot}
                alCambiar={setSelectedSlot}
              />
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
