"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { updateUserMeetingDuration } from "@/actions/userClientDataActions";
import { useRouter } from "next/navigation";

// Componente para actualizar la duración y la URL de la reunión
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

            // Importante: si tu server action retorna success:false, lo tratamos como error
            if (!res.success) throw new Error(res.message);

            router.refresh();
            return res;
        },
        onSuccess: (res) => {
            toast.success(res.message || "Configuración de reunión actualizada correctamente");
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
        if (!v) return ""; // si la dejan vacía, no falla (ajústalo si quieres que sea obligatoria)

        // Aceptar URLs sin protocolo agregando https:// para validar
        const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;

        try {
            new URL(normalized);
            return "";
        } catch {
            return "La URL de la reunión no es válida.";
        }
    };

    const handleChangeDuration = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDuration(parseInt(e.target.value));
    };

    const handleChangeUrl = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(e.target.value);
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
        <div className="max-w-md mx-auto p-4">
            <h2 className="text-xl font-semibold text-center">Actualizar Reunión</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                        Duración (minutos)
                    </label>
                    <Input
                        id="duration"
                        type="number"
                        value={duration}
                        onChange={handleChangeDuration}
                        min="1"
                        max="480"
                        placeholder="Ingrese la duración en minutos"
                        className="mt-1"
                    />
                </div>

                <div>
                    <label htmlFor="meetingUrl" className="block text-sm font-medium text-gray-700">
                        URL de la reunión (Zoom / Meet / Skype)
                    </label>
                    <Input
                        id="meetingUrl"
                        type="text"
                        value={url}
                        onChange={handleChangeUrl}
                        placeholder="Ej: https://meet.google.com/xxx-xxxx-xxx"
                        className="mt-1"
                    />
                </div>

                <div className="flex justify-center">
                    <Button type="submit" disabled={loading} className="w-full">
                        {loading ? "Actualizando..." : "Actualizar"}
                    </Button>
                </div>
            </form>
        </div>
    );
};