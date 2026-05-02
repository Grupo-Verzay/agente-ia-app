"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { updateUserMeetingDuration } from "@/actions/userClientDataActions";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Link2, Settings2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

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
        <div className="max-w-xl mx-auto py-2">
            <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Settings2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-base">Configuración de Reunión</CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                                Ajusta la duración y el enlace de tus reuniones virtuales
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <Separator />

                <CardContent className="pt-5">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label htmlFor="duration" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                Duración de la reunión
                            </label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="duration"
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(parseInt(e.target.value))}
                                    min="1"
                                    max="480"
                                    placeholder="60"
                                    className="max-w-[120px]"
                                />
                                <span className="text-sm text-muted-foreground">minutos</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Entre 1 y 480 minutos por sesión</p>
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

                        <div className="pt-1">
                            <Button type="submit" disabled={loading} size="sm">
                                {loading ? "Guardando..." : "Guardar cambios"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};
