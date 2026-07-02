'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import { saveFollowUpWindow, type FollowUpWindow } from '@/actions/follow-up-window-actions';

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const END_HOURS = Array.from({ length: 24 }, (_, i) => i + 1); // 1..24
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export const FollowUpWindowCard = ({
  initial,
  timezone,
  readOnly = false,
}: {
  initial: FollowUpWindow;
  timezone?: string | null;
  readOnly?: boolean;
}) => {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [startHour, setStartHour] = useState(initial.startHour);
  const [endHour, setEndHour] = useState(initial.endHour);
  const [days, setDays] = useState<number[]>(initial.days);
  const [loading, setLoading] = useState(false);

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const handleSave = async () => {
    if (endHour <= startHour) {
      toast.error('La hora de fin debe ser mayor que la de inicio.');
      return;
    }
    if (enabled && days.length === 0) {
      toast.error('Selecciona al menos un día.');
      return;
    }
    setLoading(true);
    const id = 'save-followup-window';
    toast.loading('Guardando horario...', { id });
    try {
      const res = await saveFollowUpWindow({ enabled, startHour, endHour, days });
      if (res.success) {
        toast.success(res.message, { id });
        if (res.data) {
          setStartHour(res.data.startHour);
          setEndHour(res.data.endHour);
          setDays(res.data.days);
        }
      } else {
        toast.error(res.message, { id });
      }
    } catch {
      toast.error('Error al guardar el horario.', { id });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarClock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Horario de seguimientos</CardTitle>
            <CardDescription className="text-xs">
              Los seguimientos de tus flujos solo se envían dentro de esta franja
              {timezone ? ` (zona horaria: ${timezone})` : ''}.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <Label className="text-sm font-medium">Restringir horario de envío</Label>
            <p className="text-xs text-muted-foreground">
              Si lo apagas, los seguimientos se envían a cualquier hora y día.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={readOnly || loading} />
        </div>

        <div className={enabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Desde</Label>
              <select
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                disabled={readOnly || loading}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hh(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Hasta</Label>
              <select
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                disabled={readOnly || loading}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {END_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hh(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Días permitidos</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const active = days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    disabled={readOnly || loading}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!readOnly && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
