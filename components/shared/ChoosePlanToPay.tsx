"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import {
    elegirPlanParaPagar,
    getPlanesParaPagar,
    type PlanDisponible,
} from "@/actions/billing/choose-plan-actions";
import { crearEnlacePagoRenovacion } from "@/actions/billing/wompi-checkout-actions";

/**
 * Elegir plan y pagarlo.
 *
 * Lo ve quien todavía no ha pagado nunca: el que entró por la prueba gratis y
 * el que compró pero no completó el pago. Mientras no haya pagado tiene que
 * poder ver los tres planes y bajarse al que le sirva — antes, con un precio ya
 * asignado, solo veía un botón por el importe más alto y no sabía que existía
 * uno más barato.
 *
 * El botón hace las dos cosas seguidas —fija el plan y abre el pago— porque
 * separarlas dejaba al cliente en una pantalla intermedia sin saber que le
 * faltaba un paso.
 */
export default function ChoosePlanToPay({
    compact,
    whatsapp,
}: {
    compact?: boolean;
    /** WhatsApp de la marca. Sin él no se pinta el botón. */
    whatsapp?: string | null;
}) {
    const [planes, setPlanes] = useState<PlanDisponible[]>([]);
    const [cargando, setCargando] = useState(true);
    const [elegido, setElegido] = useState<string | null>(null);
    const [procesando, setProcesando] = useState(false);

    useEffect(() => {
        getPlanesParaPagar()
            .then((r) => {
                setPlanes(r.data);
                // Preseleccionado el que ya tiene; si no tiene ninguno, el popular.
                const actual = r.data.find((p) => p.isCurrent);
                const popular = actual ?? r.data.find((p) => p.isPopular) ?? r.data[0];
                if (popular) setElegido(`${popular.plan}::${popular.assistanceType}`);
            })
            .finally(() => setCargando(false));
    }, []);

    const fmt = (valor: number, moneda: string) =>
        new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: moneda,
            maximumFractionDigits: 0,
        }).format(valor);

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
                            {/* Dólares arriba y pesos debajo: el de arriba es el que vio
                                en la landing y con el que compara; el de abajo, el que le
                                va a aparecer en la pasarela. Se quitaron los créditos y el
                                tipo de asistencia — en el momento de pagar solo estorban,
                                y si no coinciden con lo que le vendieron abren una
                                discusión justo antes de cobrarle. */}
                            {p.priceUsd ? (
                                <>
                                    <div className="mt-1 text-lg font-bold tabular-nums">
                                        {fmt(p.priceUsd, "USD")}
                                        <span className="text-xs font-normal text-muted-foreground"> USD/mes</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground tabular-nums">
                                        {fmt(p.price, p.currency)} {p.currency}
                                    </div>
                                </>
                            ) : (
                                <div className="mt-1 text-lg font-bold tabular-nums">
                                    {fmt(p.price, p.currency)}
                                    <span className="text-xs font-normal text-muted-foreground">/mes</span>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Pagar a la derecha, que es donde termina la lectura. WhatsApp a la
                izquierda y en tono suave: es la salida para quien tiene una duda,
                no una alternativa a pagar. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                {whatsapp ? (
                    <a
                        href={`https://wa.me/${whatsapp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-600/15 dark:text-emerald-400"
                    >
                        <MessageCircle className="h-4 w-4" />
                        Hablar por WhatsApp
                    </a>
                ) : (
                    <span />
                )}

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
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                    {procesando ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Preparando pago...</>
                    ) : (
                        <><CreditCard className="h-4 w-4" />Pagar y activar</>
                    )}
                </button>
            </div>

            <p className="text-xs text-muted-foreground">El cobro se hace en pesos colombianos.</p>
        </div>
    );
}
