import { useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface Slot {
    startTime: string;
    endTime: string;
    label: string;
}

interface Props {
    slots: Slot[];
    loadingSlots: boolean;
    selectedDate: Date | undefined;
    selectedSlot: string | null;
    setSelectedSlot: (slot: string | null) => void;
    setStep: (step: number) => void;
    nextStep?: number;
    timezone: string;
}

export function SlotStep({ slots, loadingSlots, selectedDate, selectedSlot, setSelectedSlot, setStep, nextStep = 4, timezone }: Props) {
    const grouped = useMemo(() => {
        const toMin = (iso: string) => {
            const d = toZonedTime(new Date(iso), timezone);
            return d.getHours() * 60 + d.getMinutes();
        };
        const sorted = [...slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        return {
            morning:   sorted.filter((s) => toMin(s.startTime) < 12 * 60),
            afternoon: sorted.filter((s) => toMin(s.startTime) >= 12 * 60 && toMin(s.startTime) < 18 * 60),
            evening:   sorted.filter((s) => toMin(s.startTime) >= 18 * 60),
        };
    }, [slots, timezone]);

    const dateLabel = selectedDate
        ? format(selectedDate, "d 'de' MMMM", { locale: es })
        : '';

    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">Elige un horario</CardTitle>
                    {dateLabel && <span className="text-sm text-muted-foreground">{dateLabel}</span>}
                </div>
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
                            {(['morning', 'afternoon', 'evening'] as const).map((period) => {
                                const group = grouped[period];
                                if (!group.length) return null;
                                const labels = { morning: 'Mañana', afternoon: 'Tarde', evening: 'Noche' };
                                return (
                                    <div key={period}>
                                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                                            {labels[period]}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {group.map((s) => (
                                                <Button
                                                    key={s.startTime}
                                                    variant={selectedSlot?.startsWith(s.startTime) ? 'default' : 'outline'}
                                                    className="rounded-xl text-xs px-1"
                                                    onClick={() => setSelectedSlot(`${s.startTime}|${s.endTime}`)}
                                                >
                                                    {s.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {slots.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    No hay horarios disponibles para este día.
                                </p>
                            )}
                        </>
                    )}
                </div>
                <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={() => setStep(2)}>← Atrás</Button>
                    <Button disabled={!selectedSlot} onClick={() => setStep(nextStep)}>Continuar</Button>
                </div>
            </CardContent>
        </Card>
    );
}
