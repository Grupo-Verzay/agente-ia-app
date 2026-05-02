"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { updateUserMeetingDuration } from "@/actions/userClientDataActions";
import { useRouter } from "next/navigation";
import { Clock, Link2, Settings2 } from "lucide-react";

export const UpdateMeetingDuration = ({
    userId,
    meetingDuration,
    meetingUrl,
}: {
    userId: string;
    meetingDuration: number;
    meetingUrl?: string | null;
}) => {
    const router = useRouter();
    const [duration, setDuration] = useState<number>(meetingDuration);
    const [url, setUrl] = useState<string>(meetingUrl ?? "");
    const [loading, setLoading] = useState(false);

    const mutation = useMutation({
        mutationFn: async (payload: { duration: number; url: string }) => {
            const res = await updateUserMeetingDuration(userId, payload.duration, payload.url);
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
        setDuration(meetingDuration);
        setUrl(meetingUrl ?? "");
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const durationError = validateDuration(duration.toString());
        if (durationError) return toast.error(durationError);

        const urlError = validateMeetingUrl(url);
        if (urlError) return toast.error(urlError);

        setLoading(true);
        mutation.mutate({ duration: Number(duration), url: url.trim() });
    };

    return (
        <div className="space-y-4">
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

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                    <label htmlFor="duration" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        Duración de la reunión
                    </label>
                    <div className="flex items-center gap-3 w-full">
                        <Input
                            id="duration"
                            type="number"
                            value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value))}
                            min="1"
                            max="480"
                            placeholder="60"
                            className="w-24 text-center text-lg font-bold shrink-0"
                        />
                        <p className="flex-1 text-xs text-muted-foreground text-center">Elige entre 1 y 480</p>
                        <span className="inline-flex items-end h-10 px-3 pb-2 rounded-md border border-input bg-background text-sm font-bold text-muted-foreground shrink-0">
                            minutos
                        </span>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="meetingUrl" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
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

                <div className="flex items-center justify-between pt-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancel}
                        disabled={loading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        size="sm"
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {loading ? "Guardando..." : "Guardar cambios"}
                    </Button>
                </div>
            </form>
        </div>
    );
};
