'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import CustomDialogHeader from '@/components/shared/CustomDialogHeader';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import {
  getFollowUpWindow,
  saveFollowUpWindow,
} from '@/actions/follow-up-window-actions';

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

export default function FollowUpWindowDialog() {
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [timezone, setTimezone] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFetching(true);
    getFollowUpWindow()
      .then((res) => {
        if (!alive || !res.data) return;
        setEnabled(res.data.enabled);
        setStartHour(res.data.startHour);
        setEndHour(res.data.endHour);
        setDays(res.data.days);
        setTimezone(res.data.timezone);
        setCanEdit(res.data.canEdit);
      })
      .finally(() => alive && setFetching(false));
    return () => {
      alive = false;
    };
  }, [open]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const handleSave = async () => {
    if (endHour <= startHour) {
      toast.error('La hora de fin debe ser mayor que la de inicio.');
      return;
    }
    if (enabled && days.length === 0) {
      toast.error('Selecciona al menos un día.');
      return;
    }
    setSaving(true);
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
        setOpen(false);
      } else {
        toast.error(res.message, { id });
      }
    } catch {
      toast.error('Error al guardar el horario.', { id });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || saving || fetching;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          title="Horario de envío de seguimientos"
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="px-0">
        <CustomDialogHeader icon={CalendarClock} title="HORARIO DE SEGUIMIENTOS" />
        <div className="px-6 pt-4 pb-2">
          {fetching ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Los seguimientos de tus flujos solo se envían dentro de esta franja
                {timezone ? ` (zona horaria: ${timezone})` : ''}. Los recordatorios y
                campañas con hora exacta no se ven afectados.
              </p>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Restringir horario de envío</Label>
                  <p className="text-xs text-muted-foreground">
                    Si lo apagas, se envían a cualquier hora y día.
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled} />
              </div>

              <div className={enabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Desde</Label>
                    <select
                      value={startHour}
                      onChange={(e) => setStartHour(Number(e.target.value))}
                      disabled={disabled}
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
                      disabled={disabled}
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
                          disabled={disabled}
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

              {canEdit && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
