import { addMinutes, format, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
    selectedDate: Date | undefined;
    setSelectedDate: (d: Date | undefined) => void;
    setSelectedDateYmd: (ymd: string) => void;
    setSelectedSlot: (slot: string | null) => void;
    setStep: (step: number) => void;
    minNoticeMinutes?: number;
    /** Días con disponibilidad configurada (0=domingo … 6=sábado). */
    availableWeekdays?: number[];
}

export const DateComponent = ({
    selectedDate,
    setSelectedDate,
    setSelectedDateYmd,
    setSelectedSlot,
    setStep,
    minNoticeMinutes = 0,
    availableWeekdays,
}: Props) => {
    const minDate = startOfDay(addMinutes(new Date(), minNoticeMinutes));

    // Si el asesor configuró días concretos, apagamos el resto. Antes se podía
    // elegir p.ej. un sábado y solo al llegar al paso de Hora aparecía "No hay
    // horarios disponibles", sin decir por qué ni a dónde ir.
    const sinDisponibilidad = (date: Date) =>
        Array.isArray(availableWeekdays) &&
        availableWeekdays.length > 0 &&
        !availableWeekdays.includes(date.getDay());

    // Aviso de la anticipación mínima. Sin él, el cliente solo ve los primeros
    // días apagados, no entiende por qué y escribe al asesor preguntando
    // ("no me permite avanzar", "indica hora incorrecta").
    const avisoAnticipacion = (() => {
        if (minNoticeMinutes <= 0) return null;
        if (minNoticeMinutes % 1440 === 0) {
            const d = minNoticeMinutes / 1440;
            return `Las reuniones se agendan con al menos ${d} ${d === 1 ? 'día' : 'días'} de anticipación.`;
        }
        if (minNoticeMinutes % 60 === 0) {
            const h = minNoticeMinutes / 60;
            return `Las reuniones se agendan con al menos ${h} ${h === 1 ? 'hora' : 'horas'} de anticipación.`;
        }
        return `Las reuniones se agendan con al menos ${minNoticeMinutes} minutos de anticipación.`;
    })();

    return (
        <Card className="border-muted/50">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg">Elige una fecha</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-col gap-4">
                {avisoAnticipacion && (
                    <p className="text-sm text-muted-foreground">{avisoAnticipacion}</p>
                )}
                <div className="rounded-2xl border p-3 w-full">
                    <Calendar
                        mode="single"
                        // El resto de la página está en español; sin esto el
                        // calendario salía en inglés (July, Su/Mo/Tu...).
                        locale={es}
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
                        disabled={(date) =>
                            isBefore(startOfDay(date), minDate) || sinDisponibilidad(date)
                        }
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
