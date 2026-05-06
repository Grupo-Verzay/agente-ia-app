'use client';

import { useState, useCallback } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AppointmentStatus } from '@prisma/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getLatestAppointmentBySession,
  updateAppointmentStatus,
  sendAppointmentStatusNotification,
  type SessionAppointmentCard,
} from '@/actions/appointments-actions';
import { STATUS_LABELS } from '@/types/schedule';
import { cn } from '@/lib/utils';
import { ChatCreateAppointmentSheet } from './ChatCreateAppointmentSheet';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  PENDIENTE:   'bg-yellow-500',
  CONFIRMADA:  'bg-green-500',
  ATENDIDA:    'bg-blue-500',
  NO_ASISTIDA: 'bg-violet-500',
  CANCELADA:   'bg-red-500',
  FINALIZADO:  'bg-emerald-600',
  DESCARTADO:  'bg-zinc-500',
};

interface ChatAppointmentStatusButtonProps {
  sessionId: number;
  userId: string;
  pushName?: string | null;
  remoteJid: string;
  instanceId?: string | null;
}

export function ChatAppointmentStatusButton({
  sessionId,
  userId,
  pushName,
  remoteJid,
  instanceId,
}: ChatAppointmentStatusButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appointment, setAppointment] = useState<SessionAppointmentCard | null | undefined>(undefined);
  const [pendingCancelConfirm, setPendingCancelConfirm] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadAppointment = useCallback(async () => {
    if (appointment !== undefined) return;
    setLoading(true);
    try {
      const res = await getLatestAppointmentBySession(sessionId);
      setAppointment(res.success ? res.data ?? null : null);
    } finally {
      setLoading(false);
    }
  }, [sessionId, appointment]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) void loadAppointment();
  };

  const applyStatusChange = async (newStatus: AppointmentStatus) => {
    if (!appointment) return;
    setSaving(true);
    try {
      const res = await updateAppointmentStatus(appointment.id, newStatus);
      if (res.success) {
        setAppointment({ ...appointment, status: newStatus });
        toast.success('Estado de cita actualizado');
        if (newStatus !== 'FINALIZADO' && newStatus !== 'DESCARTADO') {
          void sendAppointmentStatusNotification(appointment.id, newStatus);
        }
      } else {
        toast.error(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (newStatus: AppointmentStatus) => {
    if (newStatus === 'CANCELADA') {
      setPendingCancelConfirm(true);
      return;
    }
    void applyStatusChange(newStatus);
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Estado de cita"
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200 focus:outline-none transition-colors"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {appointment && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white',
                  STATUS_COLORS[appointment.status]
                )}
              />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-64 p-3 space-y-3" align="end">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cita agendada</p>

          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && appointment === null && (
            <div className="text-center space-y-2 py-1">
              <p className="text-sm text-muted-foreground">Sin citas registradas</p>
              <button
                type="button"
                onClick={() => { setOpen(false); setSheetOpen(true); }}
                className="text-xs text-primary hover:underline font-medium"
              >
                + Agendar cita
              </button>
            </div>
          )}

          {!loading && appointment && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground space-y-0.5">
                {appointment.serviceName && (
                  <p className="font-medium text-foreground">{appointment.serviceName}</p>
                )}
                <p>{format(new Date(appointment.startTime), "dd MMM yyyy · HH:mm", { locale: es })}</p>
                <p className="text-[11px]">
                  hasta {format(new Date(appointment.endTime), "HH:mm", { locale: es })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_COLORS[appointment.status])} />
                <span className="text-xs font-medium">{STATUS_LABELS[appointment.status]}</span>
              </div>

              <Select
                value={appointment.status}
                onValueChange={(v) => handleStatusChange(v as AppointmentStatus)}
                disabled={saving}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Cambiar estado" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ChatCreateAppointmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        userId={userId}
        sessionId={sessionId}
        pushName={pushName}
        remoteJid={remoteJid}
        instanceId={instanceId}
        onCreated={() => setAppointment(undefined)}
      />

      <AlertDialog open={pendingCancelConfirm} onOpenChange={setPendingCancelConfirm}>
        <AlertDialogContent className="border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cancelación</AlertDialogTitle>
            <AlertDialogDescription>
              Al cambiar el estado a <strong>CANCELADA</strong>, se eliminarán todos los
              recordatorios/seguimientos del agendamiento asociados a este cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingCancelConfirm(false);
                void applyStatusChange('CANCELADA');
              }}
            >
              Sí, cancelar y eliminar recordatorios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
