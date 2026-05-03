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
            <CardContent className="p-4 flex flex-col gap-4">
                <div className="rounded-2xl border p-3 w-full">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => {
                            setSelectedDate(d || undefined);
                            setSelectedSlot(null);
                            setSelectedDateYmd(d ? format(d, "yyyy-MM-dd") : "");
                            if (d) setStep(2);
                        }}
                        className="w-full"
                        classNames={{
                            months: "w-full",
                            month: "w-full space-y-3",
                            head_row: "flex w-full",
                            head_cell: "text-muted-foreground flex-1 font-normal text-[0.8rem] text-center",
                            row: "flex w-full mt-2",
                            cell: "flex-1 h-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
                            day: "h-9 w-full p-0 font-normal aria-selected:opacity-100 inline-flex items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                            day_today: "bg-accent text-accent-foreground",
                            day_outside: "text-muted-foreground opacity-50",
                            day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
                        }}
                        disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
                    />
                </div>
                <div className="flex justify-between gap-2 w-full">
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
