'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatInTimeZone } from 'date-fns-tz';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { datosParaReagendarAction, reagendarCitaAction } from '@/actions/appointments-actions';
import { SelectorDeFechaYHora, type HuecoDeAgenda } from '@/components/shared/SelectorDeFechaYHora';
import { ROTULO_REAGENDAR } from '@/lib/reagendar-cita';

type Datos = NonNullable<Awaited<ReturnType<typeof datosParaReagendarAction>>['data']>;

/**
 * El diálogo de «Reagendar», el MISMO en los cuatro sitios donde se cambia el
 * estado de una cita: el calendario de Agenda, su tablero, la cabecera del
 * chat y la ficha del CRM. Dentro va el selector de fecha y hora de agendar
 * (`SelectorDeFechaYHora`), con los huecos libres de la cuenta dueña y la
 * duración de la cita.
 *
 * Guardar es `reagendarCitaAction`: la misma cita, con la nueva hora y sus
 * recordatorios rehechos. Lo que dice el servidor —cuántos recordatorios se
 * programaron, o por qué ninguno— se enseña tal cual.
 */
export function DialogoDeReagendar({
  citaId,
  open,
  onOpenChange,
  alReagendar,
}: {
  citaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La cita ya movida: quien abrió el diálogo recarga lo suyo. */
  alReagendar?: (cita: { id: string; startTime: string; endTime: string; status: string }) => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [hueco, setHueco] = useState<HuecoDeAgenda | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open || !citaId) return;
    let vivo = true;
    setDatos(null);
    setHueco(null);
    setCargando(true);
    datosParaReagendarAction(citaId)
      .then((res) => {
        if (!vivo) return;
        if (res.success && res.data) setDatos(res.data);
        else {
          toast.error(res.message ?? 'No se pudo abrir la cita.');
          onOpenChange(false);
        }
      })
      .catch((error) => {
        console.error('[reagendar] no se pudo abrir la cita', error);
        if (vivo) toast.error('No se pudo abrir la cita.');
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // `onOpenChange` no decide qué se carga: solo la cita y si está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, citaId]);

  const guardar = async () => {
    if (!citaId || !hueco) return;
    setGuardando(true);
    try {
      const res = await reagendarCitaAction(citaId, hueco.startTime, hueco.endTime);
      if (res.success && res.data) {
        toast.success(res.message);
        onOpenChange(false);
        alReagendar?.({
          id: citaId,
          startTime: new Date(res.data.startTime).toISOString(),
          endTime: new Date(res.data.endTime).toISOString(),
          status: res.data.status,
        });
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      console.error('[reagendar] no se pudo reagendar', error);
      toast.error('No se pudo reagendar la cita.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-dialogo-reagendar="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            {ROTULO_REAGENDAR} cita
          </DialogTitle>
          <DialogDescription>
            {datos
              ? `${datos.cliente || 'Cliente'} · ahora el ${formatInTimeZone(new Date(datos.inicio), datos.zona, 'dd/MM/yyyy')} a las ${formatInTimeZone(new Date(datos.inicio), datos.zona, 'HH:mm')}. Se guarda en la misma cita y sus recordatorios se rehacen desde la nueva hora.`
              : 'Elige la nueva fecha y hora.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {cargando && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!cargando && datos && (
            <SelectorDeFechaYHora
              cuentaId={datos.cuentaId}
              zona={datos.zona}
              duracionMinutos={datos.duracionMinutos}
              valor={hueco}
              alCambiar={setHueco}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!hueco || guardando} data-confirmar-reagendar="">
            {guardando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {ROTULO_REAGENDAR}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
