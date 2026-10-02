'use client';

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { HeartPulse, Loader2 } from "lucide-react";
import { getAjustesDelSentimiento, guardarSentimientoActivo } from "@/actions/sentimiento-ajustes-actions";
import { SENTIMIENTO_POR_DEFECTO } from "@/lib/sentimiento";
import { Switch } from "@/components/ui/switch";

/**
 * El interruptor del ANÁLISIS DE SENTIMIENTO. Solo lo ve el dueño de la cuenta
 * (lo decide la página con `esElDuenoDeLaCuenta`, y la acción lo vuelve a
 * preguntar). Misma forma que la encuesta de al lado. Nace apagado.
 */
export function SentimientoCard() {
    const [activa, setActiva] = useState<boolean>(SENTIMIENTO_POR_DEFECTO.activa);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);

    const traer = useCallback(async () => {
        setCargando(true);
        try {
            const ajustes = await getAjustesDelSentimiento();
            setActiva(ajustes.activa);
        } catch (error) {
            console.warn("[sentimiento] no se pudieron traer los ajustes", String(error));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void traer();
    }, [traer]);

    const cambiar = async (nueva: boolean) => {
        const antes = activa;
        setActiva(nueva);
        setGuardando(true);
        try {
            const res = await guardarSentimientoActivo(nueva);
            if (!res.success) {
                setActiva(antes);
                toast.error(res.message || "No se pudo guardar.");
            } else if (res.message) {
                toast.success(res.message);
            }
        } catch (error) {
            setActiva(antes);
            toast.error("No se pudo guardar.");
            console.warn("[sentimiento] fallo al guardar", String(error));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="flex items-start gap-3" data-ajuste-de-sentimiento>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <HeartPulse className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Análisis de sentimiento</p>
                <p className="text-xs text-muted-foreground">
                    {activa
                        ? "La IA lee los últimos mensajes de cada cliente y colorea su avatar en Chats: verde si está contento, rojo si está molesto. Consume créditos de IA de la cuenta."
                        : "No se analiza el ánimo de los clientes ni se consumen créditos por ello."}
                </p>
            </div>
            {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mt-1" />}
            <Switch
                checked={activa}
                disabled={cargando || guardando}
                onCheckedChange={cambiar}
                className="data-[state=checked]:bg-green-600"
                aria-label="Análisis de sentimiento"
            />
        </div>
    );
}
