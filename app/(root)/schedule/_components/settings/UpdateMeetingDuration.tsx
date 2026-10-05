"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { updateUserMeetingDuration } from "@/actions/userClientDataActions";
import { useRouter } from "next/navigation";
import { Bot, Clock, Link2, Settings2, Timer } from "lucide-react";
import { guardarAjustesDeVideollamadaAction, leerAjustesDeVideollamadaAction } from "@/actions/videollamada-ia-actions";
import { MODOS_DE_REUNION, NOMBRE_DEL_MODO, type ModoDeReunion } from "@/lib/videollamada-ia";

type NoticeUnit = "minutes" | "hours" | "days";
const toMinutes: Record<NoticeUnit, number> = { minutes: 1, hours: 60, days: 1440 };

function fromMinutes(total: number): { value: number; unit: NoticeUnit } {
    if (total > 0 && total % 1440 === 0) return { value: total / 1440, unit: "days" };
    if (total > 0 && total % 60 === 0)   return { value: total / 60,   unit: "hours" };
    return { value: total, unit: "minutes" };
}

export const UpdateMeetingDuration = ({
    userId,
    meetingDuration,
    meetingUrl,
    minNoticeMinutes: initialMinNotice = 0,
}: {
    userId: string;
    meetingDuration: number;
    meetingUrl?: string | null;
    minNoticeMinutes?: number;
}) => {
    const router = useRouter();
    const { value: initDurVal, unit: initDurUnit } = fromMinutes(meetingDuration);
    const [durationValue, setDurationValue] = useState<number>(initDurVal);
    const [durationUnit, setDurationUnit] = useState<NoticeUnit>(initDurUnit);
    const [url, setUrl] = useState<string>(meetingUrl ?? "");
    const { value: initVal, unit: initUnit } = fromMinutes(initialMinNotice);
    const [noticeValue, setNoticeValue] = useState<number>(initVal);
    const [noticeUnit, setNoticeUnit] = useState<NoticeUnit>(initUnit);
    const [loading, setLoading] = useState(false);

    // El modo de reunión: el enlace fijo de siempre o la videollamada con IA.
    // El avatar es uno, el de la plataforma (Verzy): aquí solo se elige el modo.
    const [modo, setModo] = useState<ModoDeReunion>("enlace");
    const [disponible, setDisponible] = useState(true);
    const [guardado, setGuardado] = useState<ModoDeReunion>("enlace");

    useEffect(() => {
        let vivo = true;
        leerAjustesDeVideollamadaAction(userId)
            .then((res) => {
                if (!vivo || !res.success) return;
                setModo(res.data.modo);
                setDisponible(res.data.disponible);
                setGuardado(res.data.modo);
            })
            .catch((error) => console.warn("[videollamada] no se pudieron leer los ajustes", error));
        return () => {
            vivo = false;
        };
    }, [userId]);

    const mutation = useMutation({
        mutationFn: async (payload: { duration: number; url: string; minNotice: number }) => {
            // Primero el modo: con él guardado, el recordatorio de la cita se
            // escribe con el enlace que toca (la variable o el fijo).
            const video = await guardarAjustesDeVideollamadaAction(userId, { modo });
            if (!video.success) throw new Error(video.message);
            setDisponible(video.data.disponible);
            setGuardado(video.data.modo);
            const res = await updateUserMeetingDuration(userId, payload.duration, payload.url, payload.minNotice);
            if (!res.success) throw new Error(res.message);
            router.refresh();
            return res;
        },
        onSuccess: (res) => {
            toast.success(res.message || "Configuración actualizada correctamente");
            setLoading(false);
        },
        onError: (error: any) => {
            toast.error(error?.message || "Error al actualizar la configuración");
            setLoading(false);
        },
    });

    const validateDuration = (value: string) => {
        const parsedValue = parseInt(value);
        if (parsedValue < 1 || parsedValue > 480 || isNaN(parsedValue)) {
            return "La duración debe ser un número entre 1 y 480 minutos.";
        }
        return "";
    };

    const validateMeetingUrl = (value: string) => {
        const v = value.trim();
        if (!v) return "";
        const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
        try {
            new URL(normalized);
            return "";
        } catch {
            return "La URL de la reunión no es válida.";
        }
    };

    const handleCancel = () => {
        const { value: dv, unit: du } = fromMinutes(meetingDuration);
        setDurationValue(dv);
        setDurationUnit(du);
        setUrl(meetingUrl ?? "");
        const { value, unit } = fromMinutes(initialMinNotice);
        setNoticeValue(value);
        setNoticeUnit(unit);
        setModo(guardado);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const durationMinutes = durationValue * toMinutes[durationUnit];
        const durationError = validateDuration(durationMinutes.toString());
        if (durationError) return toast.error(durationError);

        if (modo === "tavus" && !disponible) return toast.error("La videollamada con IA no está disponible en este momento.");
        const urlError = validateMeetingUrl(url);
        if (urlError) return toast.error(urlError);

        setLoading(true);
        const minNotice = noticeValue * toMinutes[noticeUnit];
        mutation.mutate({ duration: durationMinutes, url: url.trim(), minNotice });
    };

    return (
        <div className="flex h-full flex-col space-y-4">
            {/* Header — mismo patrón de toolbar que Servicios */}
            <div className="flex items-center gap-3 pb-3 border-b">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Settings2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                    <p className="text-sm font-semibold">Configuración de Reunión</p>
                    <p className="text-xs text-muted-foreground">
                        Ajusta la duración y el enlace de tus reuniones virtuales
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
                <div className="space-y-5">
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        Duración de la reunión
                    </label>
                    <div className="flex items-center gap-3 w-full">
                        <Select value={durationUnit} onValueChange={(v) => setDurationUnit(v as NoticeUnit)}>
                            <SelectTrigger className="w-32 shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="minutes">Minutos</SelectItem>
                                <SelectItem value="hours">Horas</SelectItem>
                                <SelectItem value="days">Días</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="flex-1 text-xs text-muted-foreground text-center">Elige entre 1 y 480 min</p>
                        <Input
                            type="number"
                            value={durationValue}
                            onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            className="w-28 text-center text-lg font-bold shrink-0"
                        />
                    </div>
                </div>

                <div className="space-y-1.5" data-modo-de-reunion>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                        Cómo te reúnes con tus clientes
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
                        {MODOS_DE_REUNION.map((m) => (
                            <button
                                key={m}
                                type="button"
                                role="radio"
                                aria-checked={modo === m}
                                data-modo={m}
                                onClick={() => setModo(m)}
                                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                                    modo === m ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"
                                }`}
                            >
                                {m === "tavus" ? <Bot className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
                                {NOMBRE_DEL_MODO[m]}
                            </button>
                        ))}
                    </div>
                </div>

                {modo === "enlace" ? (
                <div className="space-y-1.5">
                        <label htmlFor="meetingUrl" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                            Enlace de reunión virtual
                        </label>
                        <Input
                            id="meetingUrl"
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://meet.google.com/xxx-xxxx-xxx"
                        />
                        <p className="text-xs text-muted-foreground">Zoom, Google Meet, Skype u otra plataforma de videoconferencia</p>
                    </div>
                ) : (
                    <div className="space-y-1.5" data-ajustes-de-tavus>
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                            Te atiende Verzy, el asistente con video de la plataforma
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {disponible
                                ? "Cada cita recibe su propio enlace. La sala se crea cuando el cliente lo abre, desde 15 minutos antes."
                                : "La videollamada con IA no está disponible en este momento."}
                        </p>
                    </div>
                )}

                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                        Tiempo mínimo de anticipación
                    </label>
                    <div className="flex items-center gap-3 w-full">
                        <Select value={noticeUnit} onValueChange={(v) => setNoticeUnit(v as NoticeUnit)}>
                            <SelectTrigger className="w-32 shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="minutes">Minutos</SelectItem>
                                <SelectItem value="hours">Horas</SelectItem>
                                <SelectItem value="days">Días</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="flex-1 text-xs text-muted-foreground text-center">0 = sin restricción</p>
                        <Input
                            type="number"
                            value={noticeValue}
                            onChange={(e) => setNoticeValue(Math.max(0, parseInt(e.target.value) || 0))}
                            min="0"
                            className="w-28 text-center text-lg font-bold shrink-0"
                        />
                    </div>
                </div>

                </div>

                <div className="flex items-center justify-between gap-2 pt-4 mt-auto">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleCancel}
                        disabled={loading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        variant="save"
                        disabled={loading}
                    >
                        {loading ? "Guardando..." : "Guardar"}
                    </Button>
                </div>
            </form>
        </div>
    );
};
