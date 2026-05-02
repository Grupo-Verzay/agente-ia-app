import { format, isBefore, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
    selectedDate: Date | undefined;
    setSelectedDate: (d: Date | undefined) => void;
    setSelectedDateYmd: (ymd: string) => void;
    setSelectedSlot: (slot: string | null) => void;
    setStep: (step: number) => void;
}

export const DateComponent = ({
    selectedDate,
    setSelectedDate,
    setSelectedDateYmd,
    setSelectedSlot,
    setStep,
}: Props) => {
    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Elige una fecha</CardTitle>
                <p className="text-sm text-muted-foreground">Selecciona el día para tu cita.</p>
            </CardHeader>
            <CardContent className="p-4 flex flex-col items-center gap-4">
                <div className="rounded-2xl border p-2">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => {
                            setSelectedDate(d || undefined);
                            setSelectedSlot(null);
                            setSelectedDateYmd(d ? format(d, "yyyy-MM-dd") : "");
                            if (d) setStep(2);
                        }}
                        className="rounded-md"
                        disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
                    />
                </div>
                <div className="flex justify-between gap-2 w-full pt-2">
                    <Button variant="outline" onClick={() => setStep(0)}>
                        Atrás
                    </Button>
                    <Button disabled={!selectedDate} onClick={() => setStep(2)}>
                        Continuar
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
