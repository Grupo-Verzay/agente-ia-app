import { useMemo } from "react";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { formatDateLabel } from "../../helpers";
import { Slot } from "@/types/schedule";

interface Props {
    slots: Slot[];
    loadingSlots: boolean;
    selectedDate: Date | undefined;
    selectedSlot: string | null;
    setSelectedSlot: (slot: string | null) => void;
    setStep: (step: number) => void;
    timezone: string;
}

export const HourComponent = ({
    slots,
    loadingSlots,
    selectedDate,
    selectedSlot,
    setSelectedSlot,
    setStep,
    timezone,
}: Props) => {
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

    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Elige un horario</CardTitle>
                <p className="text-sm text-muted-foreground">{formatDateLabel(selectedDate)}</p>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4">
                <div className="rounded-2xl border p-3 space-y-3 min-h-[120px]">
                    {loadingSlots ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Cargando horarios...</span>
                        </div>
                    ) : (
                        <>
                            {groupedSlots.morning.length > 0 && (
                                <div>
                                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Mañana</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {groupedSlots.morning.map((s) => (
                                            <Button
                                                key={s.startTime}
                                                variant={selectedSlot?.startsWith(s.startTime) ? "default" : "outline"}
                                                className="rounded-xl text-xs px-1"
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
                                    <div className="grid grid-cols-3 gap-2">
                                        {groupedSlots.afternoon.map((s) => (
                                            <Button
                                                key={s.startTime}
                                                variant={selectedSlot?.startsWith(s.startTime) ? "default" : "outline"}
                                                className="rounded-xl text-xs px-1"
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
                                    <div className="grid grid-cols-3 gap-2">
                                        {groupedSlots.evening.map((s) => (
                                            <Button
                                                key={s.startTime}
                                                variant={selectedSlot?.startsWith(s.startTime) ? "default" : "outline"}
                                                className="rounded-xl text-xs px-1"
                                                onClick={() => setSelectedSlot(`${s.startTime}|${s.endTime}`)}
                                            >
                                                {s.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {slots.length === 0 && (
                                <div className="text-sm text-muted-foreground text-center py-8">
                                    No hay horarios disponibles para este día.
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-between gap-2 pt-2">
                    <Button variant="outline" onClick={() => setStep(1)}>
                        Atrás
                    </Button>
                    <Button disabled={!selectedSlot} onClick={() => setStep(3)}>
                        Continuar
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
