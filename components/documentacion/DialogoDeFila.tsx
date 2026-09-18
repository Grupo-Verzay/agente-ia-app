"use client";

import { useState } from "react";
import { toast } from "sonner";

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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { FilaDeLista } from "@/lib/documentacion";

/**
 * Una fila de una lista: la misma para crear y para editar.
 *
 * La **fecha** es lo que hace que la vista de calendario funcione, y por eso se
 * pide aquí y no en una pantalla aparte: el calendario se apoya en el dato de
 * la propia fila, no en una tabla de eventos al lado que haya que mantener a la
 * par.
 *
 * Y se dice que es opcional. Una fila sin fecha es legítima —no todo tiene
 * día—; lo que no puede pasar es que desaparezca del calendario sin avisar, y
 * de eso se encarga la propia vista.
 */
export function DialogoDeFila({
    documentoId,
    estados,
    fila,
    estadoInicial,
    puedeEditar,
    alCerrar,
    alGuardar,
    crear,
    editar,
}: {
    documentoId: string;
    estados: string[];
    fila: FilaDeLista | null;
    estadoInicial: string;
    puedeEditar: boolean;
    alCerrar: () => void;
    alGuardar: () => void | Promise<void>;
    crear: (input: {
        documentoId: string;
        titulo: string;
        estado: string;
        fecha: string | null;
        notas: string | null;
    }) => Promise<{ success: boolean; message?: string }>;
    editar: (input: {
        id: string;
        titulo: string;
        estado: string;
        fecha: string | null;
        notas: string | null;
    }) => Promise<{ success: boolean; message?: string }>;
}) {
    const [titulo, setTitulo] = useState(fila?.titulo ?? "");
    const [estado, setEstado] = useState(fila?.estado ?? estadoInicial ?? estados[0]);
    const [fecha, setFecha] = useState(paraElCampo(fila?.fecha ?? null));
    const [notas, setNotas] = useState(fila?.notas ?? "");
    const [guardando, setGuardando] = useState(false);

    const guardar = async () => {
        setGuardando(true);
        try {
            const res = fila
                ? await editar({
                      id: fila.id,
                      titulo,
                      estado,
                      fecha: fecha || null,
                      notas: notas || null,
                  })
                : await crear({
                      documentoId,
                      titulo,
                      estado,
                      fecha: fecha || null,
                      notas: notas || null,
                  });

            if (!res.success) {
                toast.error(res.message ?? "No se pudo guardar la fila.");
                return;
            }
            await alGuardar();
        } catch (error) {
            // Una accion puede reventar, y entonces el «Guardando…» se queda
            // puesto para siempre: el sintoma no es un error, es un dialogo
            // congelado.
            console.warn("[documentacion] no se pudo guardar la fila", error);
            toast.error("No se pudo guardar. Revisa la conexión.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{fila ? "Editar fila" : "Nueva fila"}</DialogTitle>
                    <DialogDescription>
                        La fecha es lo que sitúa la fila en el calendario. Sin ella sale en la tabla
                        y en el tablero igual.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="fila-titulo">Título</Label>
                        <Input
                            id="fila-titulo"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            disabled={!puedeEditar}
                        />
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
                            <Label>Estado</Label>
                            <Select value={estado} onValueChange={setEstado} disabled={!puedeEditar}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {estados.map((e) => (
                                        <SelectItem key={e} value={e}>
                                            {e}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
                            <Label htmlFor="fila-fecha">Fecha (opcional)</Label>
                            <Input
                                id="fila-fecha"
                                type="date"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                disabled={!puedeEditar}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="fila-notas">Notas</Label>
                        <Textarea
                            id="fila-notas"
                            value={notas}
                            onChange={(e) => setNotas(e.target.value)}
                            disabled={!puedeEditar}
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={alCerrar}>
                        Cancelar
                    </Button>
                    {puedeEditar && (
                        <Button onClick={() => void guardar()} disabled={guardando || !titulo.trim()}>
                            {guardando ? "Guardando…" : "Guardar"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** `<input type="date">` quiere `YYYY-MM-DD` y nada más. */
function paraElCampo(fecha: Date | null): string {
    if (!fecha) return "";
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
    ).padStart(2, "0")}`;
}
