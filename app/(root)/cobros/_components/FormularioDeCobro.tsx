"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    BloqueDeAdjuntos,
    borrarDelBucket,
    type AdjuntoEnElAire,
} from "@/app/(root)/proyectos/_components/BloqueDeAdjuntos";
import {
    DIAS_DE_GRACIA_POR_DEFECTO,
    DIAS_DE_LICENCIA_POR_DEFECTO,
    TOPE_DE_LA_NOTA,
    type CobroConAdjuntos,
} from "@/lib/cobros";
import type { AdjuntoDeTarea } from "@/lib/adjuntos-de-tarea-tipos";

/**
 * Crear o editar una deuda.
 *
 * Los adjuntos —la cuenta de cobro en imagen o archivo— usan **el componente de
 * Proyectos**, no una copia: `BloqueDeAdjuntos` con `taskId={null}`, que es el
 * camino «en el aire» que ya estrenaron los tickets. De ahí vienen gratis el
 * pegado con Ctrl+V, el arrastrar y soltar y el tope. Con una copia, el día que
 * se afine el tope se afina en una y la otra se queda atrás, y eso no se ve como
 * un error sino como «a veces funciona».
 *
 * Al editar **no se tocan los adjuntos ya guardados**: se gestionan desde el
 * detalle de la deuda, que es donde se ven.
 */
export function FormularioDeCobro({
    abierto,
    cobro,
    userId,
    onCerrar,
    onGuardar,
}: {
    abierto: boolean;
    /** `null` = una deuda nueva. */
    cobro: CobroConAdjuntos | null;
    userId: string;
    onCerrar: () => void;
    onGuardar: (datos: DatosDelFormulario, enElAire: AdjuntoEnElAire[]) => Promise<boolean>;
}) {
    const [nombre, setNombre] = useState("");
    const [telefono, setTelefono] = useState("");
    const [concepto, setConcepto] = useState("");
    const [monto, setMonto] = useState("");
    const [moneda, setMoneda] = useState("COP");
    const [vence, setVence] = useState("");
    const [licencia, setLicencia] = useState(String(DIAS_DE_LICENCIA_POR_DEFECTO));
    const [gracia, setGracia] = useState(String(DIAS_DE_GRACIA_POR_DEFECTO));
    const [nota, setNota] = useState("");
    const [enElAire, setEnElAire] = useState<AdjuntoEnElAire[]>([]);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!abierto) return;
        setNombre(cobro?.contactoNombre ?? "");
        setTelefono(cobro?.contactoTelefono ?? "");
        setConcepto(cobro?.concepto ?? "");
        setMonto(cobro?.monto === null || cobro?.monto === undefined ? "" : String(cobro.monto));
        setMoneda(cobro?.moneda ?? "COP");
        setVence(cobro?.vence ? cobro.vence.slice(0, 10) : "");
        setLicencia(String(cobro?.diasDeLicencia ?? DIAS_DE_LICENCIA_POR_DEFECTO));
        setGracia(String(cobro?.diasDeGracia ?? DIAS_DE_GRACIA_POR_DEFECTO));
        setNota(cobro?.notaDePago ?? "");
        setEnElAire([]);
    }, [abierto, cobro]);

    /**
     * El cierre va por **un solo camino**.
     *
     * La X, el clic fuera y «Cancelar» llaman aquí, y aquí es donde se borran
     * del bucket los archivos que quedaron en el aire. Con tres salidas basta
     * con olvidarse de una para que esa deje basura cada vez, y eso no se nota
     * hasta que alguien mira cuánto ocupa el bucket.
     */
    const cerrar = () => {
        for (const archivo of enElAire) void borrarDelBucket(archivo.url);
        setEnElAire([]);
        onCerrar();
    };

    const enviar = async () => {
        if (!nombre.trim()) {
            toast.error("Falta el nombre del cliente.");
            return;
        }
        if (!telefono.replace(/[^\d]/g, "")) {
            toast.error("Falta el número de WhatsApp.");
            return;
        }

        const montoLimpio = monto.trim() ? Number(monto.replace(/[^\d.,-]/g, "").replace(",", ".")) : null;
        if (montoLimpio !== null && !Number.isFinite(montoLimpio)) {
            toast.error("El monto no es un número.");
            return;
        }

        setGuardando(true);
        try {
            const ok = await onGuardar(
                {
                    contactoNombre: nombre.trim(),
                    contactoTelefono: telefono.trim(),
                    contactoJid: cobro?.contactoJid ?? null,
                    concepto: concepto.trim(),
                    monto: montoLimpio,
                    moneda: moneda.trim() || "COP",
                    vence: vence || null,
                    notaDePago: nota.trim() || null,
                    diasDeLicencia: Number(licencia) || DIAS_DE_LICENCIA_POR_DEFECTO,
                    diasDeGracia: Number(gracia) || 0,
                },
                enElAire,
            );
            // Si se guardó, los del aire ya cuelgan de la deuda: se vacía la
            // lista ANTES de cerrar, o el `cerrar()` de después los borraría del
            // bucket.
            if (ok) {
                setEnElAire([]);
                onCerrar();
            }
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog
            open={abierto}
            onOpenChange={(v) => {
                if (!v) cerrar();
            }}
        >
            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{cobro ? "Editar cobro" : "Nuevo cobro"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="cobro-nombre">Cliente</Label>
                            <Input
                                id="cobro-nombre"
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                placeholder="Ej.: Marta Restrepo"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cobro-telefono">WhatsApp</Label>
                            <Input
                                id="cobro-telefono"
                                value={telefono}
                                onChange={(e) => setTelefono(e.target.value)}
                                placeholder="Ej.: 573001234567"
                                inputMode="tel"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="cobro-concepto">¿Qué le cobras?</Label>
                        <Input
                            id="cobro-concepto"
                            value={concepto}
                            onChange={(e) => setConcepto(e.target.value)}
                            placeholder="Ej.: Plan internet 100 megas"
                        />
                        <p className="text-xs text-muted-foreground">
                            Esto es lo que sale en el mensaje como <code>{"{concepto}"}</code>.
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5 col-span-2">
                            <Label htmlFor="cobro-monto">Monto</Label>
                            <Input
                                id="cobro-monto"
                                value={monto}
                                onChange={(e) => setMonto(e.target.value)}
                                placeholder="Ej.: 80000"
                                inputMode="decimal"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cobro-moneda">Moneda</Label>
                            <Input
                                id="cobro-moneda"
                                value={moneda}
                                onChange={(e) => setMoneda(e.target.value.toUpperCase())}
                                maxLength={10}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="cobro-vence">Vence</Label>
                            <Input
                                id="cobro-vence"
                                type="date"
                                value={vence}
                                onChange={(e) => setVence(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cobro-licencia">Días de licencia</Label>
                            <Input
                                id="cobro-licencia"
                                type="number"
                                min={1}
                                max={365}
                                value={licencia}
                                onChange={(e) => setLicencia(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cobro-gracia">Días de gracia</Label>
                            <Input
                                id="cobro-gracia"
                                type="number"
                                min={0}
                                max={365}
                                value={gracia}
                                onChange={(e) => setGracia(e.target.value)}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Al confirmar un pago, el vencimiento salta solo esos días de licencia y la
                        deuda vuelve a pendiente. No hay que volver a crearla cada mes.
                    </p>

                    {!cobro && (
                        <div className="space-y-1.5">
                            <Label>Cuenta de cobro</Label>
                            <BloqueDeAdjuntos
                                taskId={null}
                                userId={userId}
                                adjuntos={[] as AdjuntoDeTarea[]}
                                onCambio={() => {
                                    /* Sin deuda todavía: todo cae en el aire. */
                                }}
                                enElAire={enElAire}
                                onCambioEnElAire={setEnElAire}
                                carpeta="cobros"
                                queEs="cobro"
                            />
                        </div>
                    )}

                    {/*
                        Debajo de los adjuntos, y **en los dos casos**: crear y
                        editar. Los adjuntos de una deuda que ya existe se
                        gestionan desde su detalle, pero esto se cambia cada mes
                        —otra cuenta, otro enlace— así que tiene que poder
                        editarse aquí. Con el campo solo al crear, cambiar el
                        número de cuenta obligaría a borrar la deuda y rehacerla,
                        y con ella se iría el historial de ciclos.
                    */}
                    <div className="space-y-1.5">
                        <Label htmlFor="cobro-nota">Datos de pago de este cobro (opcional)</Label>
                        <Textarea
                            id="cobro-nota"
                            value={nota}
                            onChange={(e) => setNota(e.target.value)}
                            maxLength={TOPE_DE_LA_NOTA}
                            rows={3}
                            placeholder={
                                "Ej.: Bancolombia ahorros 123-456789-00, a nombre de Marta Restrepo\n" +
                                "o un enlace de pago"
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            Se manda al final del mensaje, después de la plantilla. Es de este cobro
                            y no de la cuenta: cada contacto puede tener el suyo.
                        </p>
                    </div>
                </div>

                {/*
                    `DialogFooter` y no un `flex justify-end` a mano: ese es el
                    pie de toda la App —lleva `justify-between`, así que
                    «Cancelar» queda a la izquierda y la acción a la derecha—.
                    Escribiéndolo a mano los dos botones acababan pegados a la
                    derecha, y este diálogo se leía distinto de los otros ciento
                    y pico que ya usan el componente.
                */}
                <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={cerrar} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={() => void enviar()} disabled={guardando}>
                        {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {guardando ? "Guardando…" : cobro ? "Guardar" : "Crear"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export type DatosDelFormulario = {
    contactoNombre: string;
    contactoTelefono: string;
    contactoJid: string | null;
    concepto: string;
    monto: number | null;
    moneda: string;
    vence: string | null;
    notaDePago: string | null;
    diasDeLicencia: number;
    diasDeGracia: number;
};
