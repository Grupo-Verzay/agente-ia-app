"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    comoImporte,
    comoSeLeeElImporte,
    elTotal,
    hoyComoFecha,
    MONEDA_POR_DEFECTO,
    MONEDAS,
    TOPE_DE_SERVICIOS,
    type Propuesta,
} from "@/lib/propuestas";

type ServicioEnEdicion = { nombre: string; alcance: string; inversion: string };

export type BorradorDePropuesta = {
    cliente: string;
    fecha: string;
    moneda: string;
    servicios: ServicioEnEdicion[];
    mantenimientoMensual: string;
    mantenimientoDescripcion: string;
    condiciones: string;
};

const SERVICIO_VACIO: ServicioEnEdicion = { nombre: "", alcance: "", inversion: "" };

export function borradorDe(p: Propuesta | null): BorradorDePropuesta {
    if (!p) {
        return {
            cliente: "",
            fecha: hoyComoFecha(),
            moneda: MONEDA_POR_DEFECTO,
            servicios: [{ ...SERVICIO_VACIO }],
            mantenimientoMensual: "",
            mantenimientoDescripcion: "",
            condiciones: "",
        };
    }
    return {
        cliente: p.cliente,
        fecha: p.fecha,
        moneda: p.moneda,
        servicios: p.servicios.length
            ? p.servicios.map((s) => ({ nombre: s.nombre, alcance: s.alcance, inversion: String(s.inversion) }))
            : [{ ...SERVICIO_VACIO }],
        mantenimientoMensual: p.mantenimientoMensual === null ? "" : String(p.mantenimientoMensual),
        mantenimientoDescripcion: p.mantenimientoDescripcion,
        condiciones: p.condiciones,
    };
}

/**
 * El formulario de crear y de editar una propuesta: el MISMO para los dos, con
 * la propuesta delante o sin ella. Lo que se valida aquí se vuelve a validar en
 * el servidor (`comoPropuesta`): esto solo evita un viaje para decir lo obvio.
 */
export function FormularioDePropuesta({
    abierto,
    propuesta,
    guardando,
    onCerrar,
    onGuardar,
}: {
    abierto: boolean;
    propuesta: Propuesta | null;
    guardando: boolean;
    onCerrar: () => void;
    onGuardar: (b: BorradorDePropuesta) => void;
}) {
    const [b, setB] = useState<BorradorDePropuesta>(() => borradorDe(propuesta));

    // Cada apertura empieza de la propuesta que se abre, no del borrador de la anterior.
    useEffect(() => {
        if (abierto) setB(borradorDe(propuesta));
    }, [abierto, propuesta]);

    const total = useMemo(
        () => elTotal(b.servicios.map((s) => ({ inversion: comoImporte(s.inversion) ?? 0 }))),
        [b.servicios],
    );

    const cambiarServicio = (i: number, campo: keyof ServicioEnEdicion, valor: string) =>
        setB((x) => ({ ...x, servicios: x.servicios.map((s, j) => (j === i ? { ...s, [campo]: valor } : s)) }));

    return (
        <Dialog open={abierto} onOpenChange={(o) => !o && !guardando && onCerrar()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{propuesta ? "Editar propuesta" : "Nueva propuesta"}</DialogTitle>
                    <DialogDescription>
                        {propuesta
                            ? "El enlace público no cambia: quien ya lo tiene verá la versión nueva."
                            : "Al crearla se genera su página pública con un enlace propio."}
                    </DialogDescription>
                </DialogHeader>

                <form
                    id="formulario-de-propuesta"
                    className="space-y-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onGuardar(b);
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-[1fr_10rem_7rem]">
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-cliente">Cliente</Label>
                            <Input
                                id="propuesta-cliente"
                                value={b.cliente}
                                maxLength={120}
                                onChange={(e) => setB((x) => ({ ...x, cliente: e.target.value }))}
                                placeholder="Nombre o empresa"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-fecha">Fecha</Label>
                            <Input
                                id="propuesta-fecha"
                                type="date"
                                value={b.fecha}
                                onChange={(e) => setB((x) => ({ ...x, fecha: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-moneda">Moneda</Label>
                            <select
                                id="propuesta-moneda"
                                value={b.moneda}
                                onChange={(e) => setB((x) => ({ ...x, moneda: e.target.value }))}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {MONEDAS.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <Label>Servicios</Label>
                            <span className="text-xs text-muted-foreground">
                                Total: <span data-total-del-formulario className="font-medium text-foreground">{comoSeLeeElImporte(total, b.moneda)}</span>
                            </span>
                        </div>
                        {b.servicios.map((s, i) => (
                            <div key={i} data-servicio-del-formulario className="space-y-2 rounded-lg border p-3">
                                <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
                                    <Input
                                        aria-label={`Servicio ${i + 1}`}
                                        value={s.nombre}
                                        maxLength={150}
                                        onChange={(e) => cambiarServicio(i, "nombre", e.target.value)}
                                        placeholder={`Servicio ${i + 1}`}
                                    />
                                    <Input
                                        aria-label={`Inversión del servicio ${i + 1}`}
                                        value={s.inversion}
                                        inputMode="decimal"
                                        onChange={(e) => cambiarServicio(i, "inversion", e.target.value)}
                                        placeholder="Inversión"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-10 w-10 text-muted-foreground hover:text-destructive"
                                        disabled={b.servicios.length === 1}
                                        onClick={() =>
                                            setB((x) => ({ ...x, servicios: x.servicios.filter((_, j) => j !== i) }))
                                        }
                                        aria-label={`Quitar el servicio ${i + 1}`}
                                        title="Quitar servicio"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Textarea
                                    aria-label={`Alcance del servicio ${i + 1}`}
                                    value={s.alcance}
                                    maxLength={3000}
                                    rows={3}
                                    onChange={(e) => cambiarServicio(i, "alcance", e.target.value)}
                                    placeholder="Alcance: qué incluye este servicio"
                                />
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={b.servicios.length >= TOPE_DE_SERVICIOS}
                            onClick={() => setB((x) => ({ ...x, servicios: [...x.servicios, { ...SERVICIO_VACIO }] }))}
                        >
                            <Plus className="mr-1 h-4 w-4" /> Añadir servicio
                        </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-mantenimiento">Mantenimiento mensual</Label>
                            <Input
                                id="propuesta-mantenimiento"
                                value={b.mantenimientoMensual}
                                inputMode="decimal"
                                onChange={(e) => setB((x) => ({ ...x, mantenimientoMensual: e.target.value }))}
                                placeholder="Vacío = sin mantenimiento"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="propuesta-mantenimiento-desc">Qué incluye el mantenimiento</Label>
                            <Textarea
                                id="propuesta-mantenimiento-desc"
                                value={b.mantenimientoDescripcion}
                                maxLength={1000}
                                rows={2}
                                onChange={(e) => setB((x) => ({ ...x, mantenimientoDescripcion: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="propuesta-condiciones">Condiciones</Label>
                        <Textarea
                            id="propuesta-condiciones"
                            value={b.condiciones}
                            maxLength={8000}
                            rows={4}
                            onChange={(e) => setB((x) => ({ ...x, condiciones: e.target.value }))}
                            placeholder="Forma de pago, tiempos de entrega, vigencia de la propuesta…"
                        />
                    </div>
                </form>

                {/* Los botones son hijos DIRECTOS del pie: es `justify-between`. */}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="formulario-de-propuesta" disabled={guardando}>
                        {guardando ? "Guardando…" : propuesta ? "Guardar" : "Crear"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
