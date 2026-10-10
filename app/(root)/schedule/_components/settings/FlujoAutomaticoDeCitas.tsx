"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Bot, PhoneCall, Workflow } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { guardarCicloDeLaCitaAction, leerCicloDeLaCitaAction } from "@/actions/ciclo-de-la-cita-actions";

/**
 * Agenda › Ajustes › Flujo automático de la cita. Un interruptor por cuenta; el
 * detalle de lo que hace vive en `lib/ciclo-de-la-cita.ts`. Se guarda al
 * pulsar, y un fallo se dice y deja el interruptor como estaba.
 */
export const FlujoAutomaticoDeCitas = ({ userId }: { userId: string }) => {
    const [activo, setActivo] = useState(false);
    const [cargado, setCargado] = useState(false);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        let vivo = true;
        leerCicloDeLaCitaAction(userId)
            .then((res) => {
                if (!vivo) return;
                if (res.success) setActivo(res.activo);
                else toast.error(res.message);
                setCargado(true);
            })
            .catch((error) => {
                console.warn("[ciclo-de-la-cita] no se pudo leer el interruptor", error);
                if (vivo) setCargado(true);
            });
        return () => {
            vivo = false;
        };
    }, [userId]);

    const cambiar = async (siguiente: boolean) => {
        setGuardando(true);
        try {
            const res = await guardarCicloDeLaCitaAction(userId, siguiente);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setActivo(res.activo);
            toast.success(res.activo ? "Flujo automático encendido" : "Flujo automático apagado");
        } catch (error) {
            console.warn("[ciclo-de-la-cita] no se pudo guardar el interruptor", error);
            toast.error("No se pudo guardar el flujo automático de la cita.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="flex h-full flex-col space-y-4" data-flujo-automatico-de-citas>
            <div className="flex items-center gap-3 pb-3 border-b">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Workflow className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-semibold">Flujo automático de la cita</p>
                    <p className="text-xs text-muted-foreground">Recordatorios, llamada de espera y estados que se ponen solos</p>
                </div>
                <Switch
                    checked={activo}
                    disabled={!cargado || guardando}
                    onCheckedChange={(v) => void cambiar(v)}
                    aria-label="Flujo automático de la cita"
                />
            </div>

            <ul className="space-y-3 text-xs text-muted-foreground">
                <li className="flex gap-2">
                    <Bell className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        Recordatorios por WhatsApp: <b>3 horas</b> antes, <b>1 hora</b> antes con botones «Sí» / «No», <b>30 minutos</b> antes y
                        el enlace de la reunión <b>a la hora exacta</b>. Sustituyen a los recordatorios de la agenda.
                    </span>
                </li>
                <li className="flex gap-2">
                    <PhoneCall className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        Si el prospecto no entra, a los <b>5 minutos</b> le llama la IA de voz; si pide más tiempo, se le espera. A los{" "}
                        <b>10 minutos</b> sin entrar la cita pasa a <b>No asistida</b> y te avisamos.
                    </span>
                </li>
                <li className="flex gap-2">
                    <Bot className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                        Pasa sola a <b>Atendida</b> cuando el prospecto entra, y a <b>Descartado</b> solo si escribe literalmente que no le
                        interesa. <b>Confirmada</b>, <b>Cancelada</b> y <b>Finalizado</b> siguen siendo tuyas.
                    </span>
                </li>
                <li className="rounded-md border border-dashed px-3 py-2">
                    La llamada de espera, Atendida y No asistida necesitan el modo <b>Videollamada con IA</b> (en Configuración de Reunión):
                    con un enlace fijo la plataforma no puede saber si el prospecto entró.
                </li>
            </ul>
        </div>
    );
};
