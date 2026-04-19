import { useMemo } from "react";
import { toZonedTime } from "date-fns-tz";
import { format, isBefore, startOfDay } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { formatDateLabel } from "../../helpers";
import { DateHourInterface } from "@/types/schedule";
import { getAvailableSlots } from "@/actions/getAvailableSlots-actions";

export const DateHourComponent = ({
  setSelectedDate,
  setSelectedSlot,
  setSelectedDateYmd,
  setStep,
  selectedService,
  selectedSlot,
  setSlots,
  timezone,
  serverTimeZone,
  slots,
  selectedDate,
  slotDuration,
  user,
  phone,
  areaCode,
  nameClient,
}: DateHourInterface) => {

  const groupedSlots = useMemo(() => {
    const toMin = (iso: string) => {
      const d = toZonedTime(new Date(iso), timezone);
      return d.getHours() * 60 + d.getMinutes();
    };
    const withLabel = slots
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map((s) => {
        const d = toZonedTime(new Date(s.startTime), timezone);
        return { ...s, label: format(d, "hh:mm a"), minutes: toMin(s.startTime) };
      });

    return {
      morning: withLabel.filter((s) => s.minutes < 12 * 60),
      afternoon: withLabel.filter((s) => s.minutes >= 12 * 60 && s.minutes < 18 * 60),
      evening: withLabel.filter((s) => s.minutes >= 18 * 60),
    };
  }, [slots, timezone]);

  const canContinueStep1 = Boolean(selectedDate && selectedSlot);


  return (
    <Card className="border-muted/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Elige fecha y horario</CardTitle>
        <p className="text-sm text-muted-foreground">
          Los horarios se muestran en tu zona horaria: <span className="font-medium">{timezone}</span>.
        </p>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border p-2">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              setSelectedDate(d || undefined);
              setSelectedSlot(null);
              const ymd = d ? format(d, "yyyy-MM-dd") : "";
              setSelectedDateYmd(ymd);
              if (ymd) {
                getAvailableSlots(user.id as string, ymd, slotDuration, serverTimeZone).then((res) => {
                  if (res.success) setSlots(res.data || []);
                  else toast.error(res.message);
                });
              } else {
                setSlots([]);
              }
            }}
            className="rounded-md"
            disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
          />

        </div>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium mb-2 text-muted-foreground">{formatDateLabel(selectedDate)}</div>

            {/* Chips agrupados */}
            <div className="space-y-3">
              {groupedSlots.morning.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Mañana</div>
                  <div className="flex flex-wrap gap-2">
                    {groupedSlots.morning.map((s) => (
                      <Button
                        key={s.startTime}
                        variant={selectedSlot?.startsWith(s.startTime) ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => setSelectedSlot(`${s.startTime}|${s.endTime}`)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {groupedSlots.afternoon.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Tarde</div>
                  <div className="flex flex-wrap gap-2">
                    {groupedSlots.afternoon.map((s) => (
                      <Button
                        key={s.startTime}
                        variant={selectedSlot?.startsWith(s.startTime) ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => setSelectedSlot(`${s.startTime}|${s.endTime}`)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {groupedSlots.evening.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Noche</div>
                  <div className="flex flex-wrap gap-2">
                    {groupedSlots.evening.map((s) => (
                      <Button
                        key={s.startTime}
                        variant={selectedSlot?.startsWith(s.startTime) ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => setSelectedSlot(`${s.startTime}|${s.endTime}`)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {slots.length === 0 && <div className="text-sm text-muted-foreground">Selecciona una fecha para ver horarios.</div>}
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep(0)}>
              Atrás
            </Button>
            <Button disabled={!canContinueStep1} onClick={() => setStep(2)}>
              Continuar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}