"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { guardarAjustesDeCotizacionAction } from "@/actions/cotizacion-ia-actions";
import { TOPE_DE_INSTRUCCIONES, type AjustesDeCotizacion } from "@/lib/cotizacion-ia";
import { TYPE_AI_LABELS } from "./ai-section-labels";

type Props = {
    /** La cuenta del entrenamiento (`effectiveId`). La acción la vuelve a comprobar. */
    cuentaId: string;
    inicial: AjustesDeCotizacion;
    registerSaveHandler?: (fn: () => Promise<void>) => void;
};

/**
 * Entrenamiento › Cotizaciones.
 *
 * El interruptor —apagado de serie— y un cuadro de texto libre como el de
 * Perfil, donde la cuenta escribe qué incluye una cotización, cómo tiene que
 * verse y qué condiciones aplica. Ese texto va TAL CUAL al final del PDF y el
 * agente lo lee al cotizar.
 *
 * Es de la CUENTA, no del canal: la misma casilla en todas las pestañas de
 * canal. Los precios no se escriben aquí: salen del catálogo de Productos.
 *
 * Se guarda al tocar el interruptor, al salir del cuadro y con Guardar. No
 * pasa por la versión del prompt porque no es parte del prompt: vive en su
 * propia tabla.
 */
export function CotizacionesBuilder({ cuentaId, inicial, registerSaveHandler }: Props) {
    const [activa, setActiva] = useState(inicial.activa);
    const [instrucciones, setInstrucciones] = useState(inicial.instrucciones);
    const [estado, setEstado] = useState<"idle" | "guardando" | "guardado" | "error">("idle");
    const guardadoRef = useRef<AjustesDeCotizacion>(inicial);
    const actualRef = useRef<AjustesDeCotizacion>(inicial);
    actualRef.current = { activa, instrucciones };

    const guardar = useCallback(async (ajustes: AjustesDeCotizacion) => {
        const antes = guardadoRef.current;
        if (antes.activa === ajustes.activa && antes.instrucciones === ajustes.instrucciones.trim()) return;
        setEstado("guardando");
        try {
            const r = await guardarAjustesDeCotizacionAction(cuentaId, ajustes);
            if (!r.success || !r.data) {
                setEstado("error");
                toast.error(r.message || "No se pudo guardar.");
                return;
            }
            guardadoRef.current = r.data;
            setEstado("guardado");
        } catch (error) {
            // Una acción puede reventar, no solo devolver `success: false`; sin
            // esto el estado se quedaba en «Guardando…» para siempre.
            console.error("[cotizaciones] no se pudo guardar", error);
            setEstado("error");
            toast.error("No se pudo guardar. Revisa la conexión.");
        }
    }, [cuentaId]);

    useEffect(() => {
        registerSaveHandler?.(() => guardar(actualRef.current));
    }, [registerSaveHandler, guardar]);

    const alCambiarElInterruptor = (valor: boolean) => {
        setActiva(valor);
        void guardar({ activa: valor, instrucciones });
    };

    return (
        <Card className="border-muted/60" data-pestana="cotizaciones">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base uppercase">{TYPE_AI_LABELS.quotes}</CardTitle>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : estado === "error" ? "No se guardó" : activa ? "Activada" : "Desactivada"}
                    </span>
                    <Switch
                        checked={activa}
                        onCheckedChange={alCambiarElInterruptor}
                        aria-label="Activar cotizaciones automáticas"
                    />
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    Cuando el cliente pida una cotización o propuesta, la IA le envía por WhatsApp un PDF con tu logo
                    y los datos del negocio, los productos que pidió con sus precios del catálogo de Productos, el
                    total y las condiciones que escribas abajo. Si pide algo que no está en el catálogo o condiciones
                    especiales (como un descuento), no lo inventa: pasa la conversación a un asesor.
                </p>
                <Card className="bg-muted/20 border-muted/60">
                    <CardContent className="py-3 px-4 space-y-2">
                        <Label htmlFor="cotizaciones-instrucciones" className="text-sm font-semibold">
                            Qué debe incluir y qué condiciones aplica
                        </Label>
                        <Textarea
                            id="cotizaciones-instrucciones"
                            className="min-h-[140px]"
                            maxLength={TOPE_DE_INSTRUCCIONES}
                            placeholder={"Ej.: Validez de 15 días. Precios incluyen IVA. Envío gratis en Bogotá.\nForma de pago: 50% anticipo y 50% contra entrega."}
                            value={instrucciones}
                            onChange={(e) => setInstrucciones(e.target.value)}
                            onBlur={() => void guardar({ activa, instrucciones })}
                        />
                        <p className="text-xs text-muted-foreground">
                            Va tal cual al final de la cotización. {instrucciones.length}/{TOPE_DE_INSTRUCCIONES}
                        </p>
                    </CardContent>
                </Card>
            </CardContent>
        </Card>
    );
}
