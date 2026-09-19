"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    cambiarEnlaceDeTicketsAction,
    elEnlaceDeTicketsAction,
} from "@/actions/tickets-actions";

/**
 * El enlace permanente que la cuenta le reparte a sus clientes.
 *
 * # Se pide al ABRIR, no al pintar el tablero
 *
 * Tickets es de las pantallas que más se abren, y el enlace no cambia nunca:
 * pedirlo en cada carga sería una consulta más en la entrada para un botón que
 * casi siempre no se pulsa. Es el mismo trato que los canales del diálogo de
 * compartir un chat.
 *
 * # La dirección llega del SERVIDOR
 *
 * `elEnlaceDeTicketsAction` la devuelve ya armada con el origen de la petición
 * (`laDireccionDeLaFicha`). Componerla aquí con `window.location.origin` sería
 * una segunda forma de escribir la misma ruta, y el día que cambie una de las
 * dos manda a una página que no existe — justo la que los clientes ya tienen
 * pegada en su WhatsApp.
 *
 * # Apagarlo no lo cambia
 *
 * El interruptor apaga y enciende; el código se queda. Regenerarlo al volver a
 * encender rompería de golpe todos los mensajes ya repartidos.
 */
export function EnlacePublicoDeTickets() {
    const [abierto, setAbierto] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [enlace, setEnlace] = useState<string | null>(null);
    const [activo, setActivo] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    /** Para no volver a pedirlo cada vez que se abre el popover. */
    const pedido = useRef(false);

    useEffect(() => {
        if (!abierto || pedido.current) return;
        pedido.current = true;
        setCargando(true);
        void (async () => {
            try {
                const res = await elEnlaceDeTicketsAction();
                if (!res.success || !res.data) {
                    toast.error(res.message || "No se pudo leer el enlace.");
                    // Se olvida el intento: si no, el fallo de una vez dejaría el
                    // panel vacío para el resto de la sesión sin forma de
                    // reintentarlo.
                    pedido.current = false;
                    return;
                }
                setEnlace(res.data.enlace);
                setActivo(res.data.activo);
            } catch (error) {
                // Una acción no solo devuelve `success: false`: puede reventar, y
                // sin esto el panel se queda cargando para siempre.
                console.warn("[tickets] no se pudo leer el enlace público", error);
                toast.error("No se pudo leer el enlace.");
                pedido.current = false;
            } finally {
                setCargando(false);
            }
        })();
    }, [abierto]);

    const copiar = async () => {
        if (!enlace) return;
        try {
            await navigator.clipboard.writeText(enlace);
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 1600);
        } catch {
            // Sin permiso de portapapeles —o en http— no se puede copiar. El
            // campo es de solo lectura y seleccionable a propósito: ese es el
            // camino que queda, y decirlo es mejor que un botón mudo.
            toast.error("Copia el enlace a mano: tu navegador no lo permitió.");
        }
    };

    const cambiar = async (v: boolean) => {
        // Se pinta al momento y se devuelve si el servidor dice que no: un
        // interruptor que espera a la respuesta se pulsa dos veces.
        const antes = activo;
        setActivo(v);
        setGuardando(true);
        try {
            const res = await cambiarEnlaceDeTicketsAction(v);
            if (!res.success) {
                setActivo(antes);
                toast.error(res.message);
                return;
            }
            toast.success(res.message);
        } catch (error) {
            setActivo(antes);
            console.warn("[tickets] no se pudo cambiar el enlace público", error);
            toast.error("No se pudo cambiar el enlace.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 px-0"
                    title="Enlace para tus clientes"
                >
                    <Link2 className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-3">
                <div className="space-y-1">
                    <p className="text-sm font-semibold">Enlace para tus clientes</p>
                    <p className="text-xs text-muted-foreground">
                        Quien lo abra puede mandarte una solicitud sin tener cuenta. Cada envío
                        entra aquí como un ticket nuevo.
                    </p>
                </div>

                {cargando ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                ) : enlace ? (
                    <>
                        <div className="flex items-center gap-2">
                            <Input
                                readOnly
                                value={enlace}
                                className="h-9 flex-1 text-xs"
                                onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 w-9 shrink-0 px-0"
                                onClick={() => void copiar()}
                                title="Copiar"
                            >
                                {copiado ? (
                                    <Check className="h-4 w-4 text-emerald-600" />
                                ) : (
                                    <Copy className="h-4 w-4" />
                                )}
                            </Button>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                            <div className="min-w-0">
                                <Label htmlFor="enlace-tickets-activo" className="text-sm">
                                    Enlace activo
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    {activo
                                        ? "Tus clientes pueden enviarte solicitudes."
                                        : "Nadie puede enviar por este enlace."}
                                </p>
                            </div>
                            <Switch
                                id="enlace-tickets-activo"
                                checked={activo}
                                disabled={guardando}
                                onCheckedChange={(v) => void cambiar(v)}
                            />
                        </div>
                    </>
                ) : (
                    <p className="py-2 text-xs text-muted-foreground">
                        No se pudo leer el enlace. Vuelve a abrir este panel.
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}
