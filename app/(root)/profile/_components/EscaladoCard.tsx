'use client';

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BotOff, Loader2, Timer } from "lucide-react";
import {
    getAjustesDeEscalado,
    guardarApagarLaIaAlEscalar,
    guardarMinutosParaSoltar,
} from "@/actions/escalado-actions";
import { ESCALADO_POR_DEFECTO, type AjustesDeEscalado } from "@/lib/escalado-ajustes";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/**
 * Qué hace la cuenta cuando una conversación se escala a un asesor.
 *
 * Los dos mandos van JUNTOS y en este orden porque el segundo depende del
 * primero: el reloj de soltado castiga un abandono —el cliente esperando a una
 * persona que no viene, con nadie contestando—, y con la IA encendida no hay
 * abandono que castigar. Así que cuando el de arriba está apagado, el de abajo
 * no corre, y aquí se dice en vez de dejarlo puesto mintiendo.
 *
 * Esto vivía en Equipo, donde no lo veía media plataforma: los planes sin
 * equipo no tienen esa pantalla y también escalan.
 *
 * Pide sus datos por su cuenta al montarse, como el gestor de operarios de esta
 * misma pestaña, para no arrastrar props por toda la página de Perfil.
 */

interface Props {
    /** Los agentes ven el Perfil, pero no configuran la cuenta. */
    readOnly?: boolean;
}

export function EscaladoCard({ readOnly }: Props) {
    const [ajustes, setAjustes] = useState<AjustesDeEscalado>(ESCALADO_POR_DEFECTO);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState<null | "apagar" | "minutos">(null);

    const traer = useCallback(async () => {
        setCargando(true);
        try {
            setAjustes(await getAjustesDeEscalado());
        } catch (error) {
            // Un fallo mudo aquí se ve como un interruptor que siempre sale
            // apagado, que es de lo más difícil de diagnosticar desde fuera.
            console.warn("[escalado] no se pudieron traer los ajustes", String(error));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void traer();
    }, [traer]);

    // Toda llamada va por aquí: una acción no solo devuelve `success: false`,
    // puede reventar, y entonces el `await` se rompe y la línea que apaga el
    // «Guardando…» no llega a ejecutarse. El síntoma no sería un error: sería
    // un interruptor congelado.
    const pedir = async (
        cual: "apagar" | "minutos",
        hacer: () => Promise<{ success: boolean; message?: string }>,
        deshacer: () => void,
    ) => {
        setGuardando(cual);
        try {
            const res = await hacer();
            if (!res.success) {
                deshacer();
                toast.error(res.message || "No se pudo guardar.");
            } else if (res.message) {
                toast.success(res.message);
            }
        } catch (error) {
            deshacer();
            toast.error("No se pudo guardar.");
            console.warn("[escalado] fallo al guardar", String(error));
        } finally {
            setGuardando(null);
        }
    };

    const cambiarApagar = (apagar: boolean) => {
        const antes = ajustes.apagarLaIaAlEscalar;
        setAjustes((p) => ({ ...p, apagarLaIaAlEscalar: apagar }));
        void pedir(
            "apagar",
            () => guardarApagarLaIaAlEscalar(apagar),
            () => setAjustes((p) => ({ ...p, apagarLaIaAlEscalar: antes })),
        );
    };

    const guardarMinutos = (minutos: number) => {
        const antes = ajustes.minutosParaSoltar;
        if (minutos === antes) return;
        setAjustes((p) => ({ ...p, minutosParaSoltar: minutos }));
        void pedir(
            "minutos",
            () => guardarMinutosParaSoltar(minutos),
            () => setAjustes((p) => ({ ...p, minutosParaSoltar: antes })),
        );
    };

    const soltarEncendido = ajustes.minutosParaSoltar > 0;
    // Con la IA encendida el reloj no corre: lo dice el barrido del backend, y
    // la pantalla tiene que decir lo mismo.
    const soltarAplica = ajustes.apagarLaIaAlEscalar;
    const bloqueado = !!readOnly || cargando;

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BotOff className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Apagar la IA al escalar</p>
                    <p className="text-xs text-muted-foreground">
                        {ajustes.apagarLaIaAlEscalar
                            ? "Cuando se pasa una conversación a un asesor, la IA deja de responder en ese chat."
                            : "La IA sigue respondiendo aunque haya un asesor asignado. Se calla igual en cuanto el asesor escribe."}
                    </p>
                </div>
                {guardando === "apagar" && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mt-1" />
                )}
                <Switch
                    checked={ajustes.apagarLaIaAlEscalar}
                    disabled={bloqueado || guardando === "apagar"}
                    onCheckedChange={cambiarApagar}
                    className="data-[state=checked]:bg-green-600"
                />
            </div>

            <div className="border-t border-border/60" />

            <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Timer className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Soltar si nadie responde</p>
                    <p className="text-xs text-muted-foreground">
                        {!soltarAplica
                            ? "No se aplica mientras la IA siga respondiendo: no hay nadie esperando sin respuesta."
                            : soltarEncendido
                                ? "Pasado ese tiempo la conversación vuelve al reparto, saltando a quien no contestó."
                                : "Las conversaciones escaladas se quedan con su asesor hasta que alguien las mueva."}
                    </p>
                </div>
                {guardando === "minutos" && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mt-1" />
                )}
                {soltarEncendido && soltarAplica && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                            type="number"
                            min={1}
                            max={240}
                            className="h-8 w-16 text-sm"
                            value={ajustes.minutosParaSoltar}
                            disabled={bloqueado}
                            onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                if (!isNaN(n)) setAjustes((p) => ({ ...p, minutosParaSoltar: n }));
                            }}
                            onBlur={() => guardarMinutos(ajustes.minutosParaSoltar)}
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                    </div>
                )}
                <Switch
                    checked={soltarEncendido}
                    disabled={bloqueado || !soltarAplica || guardando === "minutos"}
                    onCheckedChange={(v) => guardarMinutos(v ? 10 : 0)}
                    className="data-[state=checked]:bg-green-600"
                />
            </div>
        </div>
    );
}
