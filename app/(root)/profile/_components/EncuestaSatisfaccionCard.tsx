'use client';

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, SmilePlus } from "lucide-react";
import {
    getAjustesDeLaEncuesta,
    guardarEncuestaActiva,
} from "@/actions/encuesta-de-satisfaccion-actions";
import { ENCUESTA_POR_DEFECTO } from "@/lib/encuesta-de-satisfaccion";
import { Switch } from "@/components/ui/switch";

/**
 * El interruptor de la ENCUESTA DE SATISFACCIÓN (NPS) de la cuenta.
 *
 * Misma forma que `EscaladoCard`, que es su vecina en esta pestaña: icono,
 * título, una línea que dice lo que HACE en su estado actual y el interruptor
 * a la derecha. Apagada por defecto: nadie recibe una encuesta que la cuenta no
 * pidió.
 *
 * Y dice qué le llega al cliente, con el texto de verdad: un interruptor que
 * manda mensajes a clientes sin enseñar cuál es un interruptor que se enciende
 * a ciegas.
 */

interface Props {
    /** Los agentes ven el Perfil, pero no configuran la cuenta. */
    readOnly?: boolean;
}

export function EncuestaSatisfaccionCard({ readOnly }: Props) {
    const [activa, setActiva] = useState<boolean>(ENCUESTA_POR_DEFECTO.activa);
    const [mensaje, setMensaje] = useState("");
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);

    const traer = useCallback(async () => {
        setCargando(true);
        try {
            const ajustes = await getAjustesDeLaEncuesta();
            setActiva(ajustes.activa);
            setMensaje(ajustes.mensaje);
        } catch (error) {
            console.warn("[encuesta] no se pudieron traer los ajustes", String(error));
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
            const res = await guardarEncuestaActiva(nueva);
            if (!res.success) {
                setActiva(antes);
                toast.error(res.message || "No se pudo guardar.");
            } else if (res.message) {
                toast.success(res.message);
            }
        } catch (error) {
            // Una acción puede reventar: sin esto el interruptor se queda
            // congelado a medio guardar y no dice nada.
            setActiva(antes);
            toast.error("No se pudo guardar.");
            console.warn("[encuesta] fallo al guardar", String(error));
        } finally {
            setGuardando(false);
        }
    };

    const bloqueado = !!readOnly || cargando;

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <SmilePlus className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Encuesta de satisfacción</p>
                    <p className="text-xs text-muted-foreground">
                        {activa
                            ? "Al resolver una conversación, el cliente recibe una pregunta del 1 al 10 sobre qué tan probable es que recomiende tu negocio. La respuesta queda en su ficha y en el NPS de Analíticas del CRM."
                            : "No se envía ninguna encuesta al resolver una conversación."}
                    </p>
                </div>
                {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mt-1" />}
                <Switch
                    checked={activa}
                    disabled={bloqueado || guardando}
                    onCheckedChange={cambiar}
                    className="data-[state=checked]:bg-green-600"
                    aria-label="Encuesta de satisfacción"
                />
            </div>

            {activa && mensaje && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3" data-mensaje-de-la-encuesta>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        Lo que recibe el cliente
                    </p>
                    <p className="text-xs whitespace-pre-line">{mensaje}</p>
                </div>
            )}
        </div>
    );
}
