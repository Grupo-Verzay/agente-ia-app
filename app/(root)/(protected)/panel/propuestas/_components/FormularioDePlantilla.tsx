"use client";

import { useEffect, useState } from "react";

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
import { MONEDA_POR_DEFECTO, MONEDAS } from "@/lib/propuestas";
import { TOPE_DE_NOMBRE_DEL_PLAN, type PlantillaDePlan } from "@/lib/plantillas-de-planes";

const SELECTOR = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export type BorradorDePlantilla = { nombre: string; precio: string; moneda: string; caracteristicas: string };

export function borradorDePlantilla(p: PlantillaDePlan | null): BorradorDePlantilla {
    if (!p) return { nombre: "", precio: "", moneda: MONEDA_POR_DEFECTO, caracteristicas: "" };
    return { nombre: p.nombre, precio: String(p.precio), moneda: p.moneda, caracteristicas: p.caracteristicas.join("\n") };
}

/**
 * Crear y editar una PLANTILLA DE PLAN: el mismo diálogo para los dos, con la
 * misma forma que el de la propuesta (mismos campos, mismo pie). Lo que se
 * valida aquí se vuelve a validar en el servidor (`comoPlantilla`).
 */
export function FormularioDePlantilla({
    abierto,
    plantilla,
    guardando,
    onCerrar,
    onGuardar,
}: {
    abierto: boolean;
    plantilla: PlantillaDePlan | null;
    guardando: boolean;
    onCerrar: () => void;
    onGuardar: (b: BorradorDePlantilla) => void;
}) {
    const [b, setB] = useState<BorradorDePlantilla>(() => borradorDePlantilla(plantilla));

    useEffect(() => {
        if (abierto) setB(borradorDePlantilla(plantilla));
    }, [abierto, plantilla]);

    return (
        <Dialog open={abierto} onOpenChange={(o) => !o && !guardando && onCerrar()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{plantilla ? "Editar plantilla de plan" : "Nueva plantilla de plan"}</DialogTitle>
                    <DialogDescription>
                        {plantilla
                            ? "Los cambios valen para las propuestas que la carguen de aquí en adelante; las ya hechas no cambian."
                            : "Al crear una propuesta podrás cargarla en la sección de servicios o productos y editarla allí."}
                    </DialogDescription>
                </DialogHeader>

                <form
                    id="formulario-de-plantilla"
                    className="space-y-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onGuardar(b);
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-[1fr_11rem_7rem]">
                        <div className="space-y-1.5">
                            <Label htmlFor="plantilla-nombre">Nombre del plan</Label>
                            <Input
                                id="plantilla-nombre"
                                value={b.nombre}
                                maxLength={TOPE_DE_NOMBRE_DEL_PLAN}
                                onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))}
                                placeholder="Ej: Business"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="plantilla-precio">Precio</Label>
                            <Input
                                id="plantilla-precio"
                                value={b.precio}
                                inputMode="decimal"
                                onChange={(e) => setB((x) => ({ ...x, precio: e.target.value }))}
                                placeholder="Ej: 350.000"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="plantilla-moneda">Moneda</Label>
                            <select
                                id="plantilla-moneda"
                                value={b.moneda}
                                onChange={(e) => setB((x) => ({ ...x, moneda: e.target.value }))}
                                className={SELECTOR}
                            >
                                {MONEDAS.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="plantilla-caracteristicas">Características o alcance</Label>
                        <Textarea
                            id="plantilla-caracteristicas"
                            value={b.caracteristicas}
                            rows={8}
                            onChange={(e) => setB((x) => ({ ...x, caracteristicas: e.target.value }))}
                            placeholder={"Una por línea. Ej:\n1 línea de WhatsApp\nAgente de IA entrenado\nCRM y embudos"}
                        />
                        <p className="text-xs text-muted-foreground">Una característica por línea.</p>
                    </div>
                </form>

                {/* Los botones son hijos DIRECTOS del pie: es `justify-between`. */}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="formulario-de-plantilla" disabled={guardando}>
                        {guardando ? "Guardando…" : plantilla ? "Guardar" : "Crear"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
