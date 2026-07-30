"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
    elegirPlanParaPagar,
    getPlanesParaPagar,
    type PlanDisponible,
} from "@/actions/billing/choose-plan-actions";
import { crearEnlacePagoRenovacion } from "@/actions/billing/wompi-checkout-actions";

/**
 * Elegir plan y pagarlo, para la cuenta que todavía no tiene ninguno.
 *
 * Es el caso de quien entra por la prueba gratis: su cuenta nace sin plan
 * comprado, así que no hay precio contra el que generar un enlace de pago. Sin
 * esto, al vencer la prueba se quedaba bloqueada sin forma de pagarse sola.
 *
 * El botón hace las dos cosas seguidas —fija el plan y abre el pago— porque
 * separarlas dejaba al cliente en una pantalla intermedia sin saber que le
 * faltaba un paso.
 */
export default function ChoosePlanToPay({ compact }: { compact?: boolean }) {
    const [planes, setPlanes] = useState<PlanDisponible[]>([]);
    const [cargando, setCargando] = useState(true);
    const [elegido, setElegido] = useState<string | null>(null);
    const [procesando, setProcesando] = useState(false);

    useEffect(() => {
        getPlanesParaPagar()
            .then((r) => {
                setPlanes(r.data);
                const popular = r.data.find((p) => p.isPopular) ?? r.data[0];
                if (popular) setElegido(`${popular.plan}::${popular.assistanceType}`);
            })
            .finally(() => setCargando(false));
    }, []);

    const fmt = (p: PlanDisponible) =>
        new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: p.currency || "COP",
            maximumFractionDigits: 0,
        }).format(p.price);

    if (cargando) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando planes...
            </div>
        );
    }

    if (planes.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Todavía no hay planes con precio publicado. Escríbenos y lo cerramos contigo.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {!compact && <p className="text-sm font-medium">Elige tu plan</p>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {planes.map((p) => {
                    const clave = `${p.plan}::${p.assistanceType}`;
                    const activo = elegido === clave;
                    return (
                        <button
                            key={clave}
                            type="button"
                            onClick={() => setElegido(clave)}
                            className={`rounded-lg border p-3 text-left transition-colors ${activo
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold">{p.label}</span>
                                {activo && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                            </div>
                            <div className="mt-1 text-lg font-bold">{fmt(p)}<span className="text-xs font-normal text-muted-foreground">/mes</span></div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {p.credits.toLocaleString("es-CO")} créditos · Asistencia {p.assistanceType === "IA" ? "IA" : "humana"}
                            </p>
                        </button>
                    );
                })}
            </div>

            <button
                type="button"
                disabled={!elegido || procesando}
                onClick={async () => {
                    if (!elegido) return;
                    const [plan, tipo] = elegido.split("::");
                    setProcesando(true);
                    const sel = await elegirPlanParaPagar(plan, tipo);
                    if (!sel.success) {
                        setProcesando(false);
                        toast.error(sel.message);
                        return;
                    }
                    const pago = await crearEnlacePagoRenovacion();
                    setProcesando(false);
                    if (!pago.success || !pago.url) {
                        toast.error(pago.message);
                        return;
                    }
                    window.open(pago.url, "_blank", "noopener,noreferrer");
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
            >
                {procesando ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Preparando pago...</>
                ) : (
                    <><CreditCard className="h-4 w-4" />Pagar y activar</>
                )}
            </button>
        </div>
    );
}
