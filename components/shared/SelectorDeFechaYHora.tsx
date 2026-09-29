'use client';

import { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { getAvailableSlots } from '@/actions/getAvailableSlots-actions';

export type HuecoDeAgenda = { startTime: string; endTime: string };

/**
 * El selector de fecha y hora de una cita: un día y, debajo, los huecos libres
 * de la agenda de la cuenta para ese día.
 *
 * Es UNO y lo usan agendar (`ChatCreateAppointmentSheet`) y reagendar
 * (`DialogoDeReagendar`). Con dos copias, el día que se afine cómo se piden los
 * huecos o cómo se pintan, una pantalla ofrecería horas que la otra no.
 *
 * Los huecos son los de la cuenta DUEÑA de la cita (`cuentaId`), no los de
 * quien mira: desde el tablero de la madre, reagendar una cita de una hija
 * mira la agenda de la hija.
 *
 * `pedirHuecos` cambia DE DÓNDE salen los huecos y nada más: Multiagenda los
 * pide a la agenda del especialista de la reserva. El día, la rejilla y la
 * elección son los mismos.
 */
export function SelectorDeFechaYHora({
  cuentaId,
  zona,
  duracionMinutos,
  valor,
  alCambiar,
  pedirHuecos,
}: {
  cuentaId: string;
  pedirHuecos?: (ymd: string) => Promise<HuecoDeAgenda[]>;
  zona: string;
  duracionMinutos: number;
  valor: HuecoDeAgenda | null;
  alCambiar: (hueco: HuecoDeAgenda | null) => void;
}) {
  const [dateYmd, setDateYmd] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<HuecoDeAgenda[]>([]);

  const handleDateChange = async (date: string) => {
    setDateYmd(date);
    setSlots([]);
    alCambiar(null);
    if (!date) return;
    setLoadingSlots(true);
    try {
      if (pedirHuecos) {
        setSlots(await pedirHuecos(date));
      } else {
        const res = await getAvailableSlots(cuentaId, date, duracionMinutos, zona);
        if (res.success && res.data) setSlots(res.data);
      }
    } catch (error) {
      console.error('[agenda] no se pudieron cargar los horarios', error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const todayYmd = new Date().toISOString().split('T')[0];

  return (
    <>
      <div className="space-y-1.5">
        <Label>Fecha</Label>
        <input
          type="date"
          value={dateYmd}
          min={todayYmd}
          data-selector-fecha=""
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
                const active = valor?.startTime === slot.startTime;
                return (
                  <button
                    key={slot.startTime}
                    type="button"
                    data-hueco={slot.startTime}
                    onClick={() => alCambiar(slot)}
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
  );
}
