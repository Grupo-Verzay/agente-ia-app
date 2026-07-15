"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { updateUserMeetingDuration } from "@/actions/userClientDataActions";
import { useRouter } from "next/navigation";
import { Clock, Link2, Settings2, Timer } from "lucide-react";

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

    const mutation = useMutation({
        mutationFn: async (payload: { duration: number; url: string; minNotice: number }) => {
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
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const durationMinutes = durationValue * toMinutes[durationUnit];
        const durationError = validateDuration(durationMinutes.toString());
        if (durationError) return toast.error(durationError);

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
