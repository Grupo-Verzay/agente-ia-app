"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { TipoRegistro, Registro } from "@prisma/client";

import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { createRegistro, updateRegistro } from "@/actions/registro-action";
import { toast } from "sonner";
import { getEstadoOptions } from "../dashboard/helpers";

type Mode = "create" | "edit";

function toDatetimeLocalValue(d?: Date | null) {
    if (!d) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function RegistroUpsertDialog({
    open,
    onOpenChange,
    mode,
    sessionId,
    sessionPushName,
    initialTipo,
    registro,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    mode: Mode;
    sessionId: number;
    sessionPushName?: string | null;
    initialTipo?: TipoRegistro;
    registro?: Registro | null;
    onSuccess: () => void; // aquí llamas mutateSessions()
}) {
    const [saving, setSaving] = React.useState(false);

    const [tipo, setTipo] = React.useState<TipoRegistro>(initialTipo ?? "REPORTE");
    const [fecha, setFecha] = React.useState<string>("");
    const [estado, setEstado] = React.useState<string>("");

    // REPORTE
    const [nombre, setNombre] = React.useState<string>("");
    const [resumen, setResumen] = React.useState<string>("");
    const [lead, setLead] = React.useState<boolean>(false);

    // Otros
    const [detalles, setDetalles] = React.useState<string>("");

    React.useEffect(() => {
        if (!open) return;

        if (mode === "edit" && registro) {
            setTipo(registro.tipo);
            setFecha(toDatetimeLocalValue(registro.fecha));
            setEstado(registro.estado ?? "");

            setNombre(registro.nombre ?? sessionPushName ?? "");
            setResumen(registro.resumen ?? "");
            setLead(Boolean(registro.lead));

            setDetalles(registro.detalles ?? "");
            return;
        }

        // create
        setTipo(initialTipo ?? "REPORTE");
        setFecha(toDatetimeLocalValue(new Date()));
        setEstado("");

        setNombre(sessionPushName ?? "");
        setResumen("");
        setLead(false);
        setDetalles("");
    }, [open, mode, registro, initialTipo, sessionPushName]);

    React.useEffect(() => {
        const options = getEstadoOptions(tipo);
        if (!options.length) return;

        // si no hay estado o el estado no pertenece a las opciones del tipo actual
        if (!estado || !options.includes(estado)) {
            setEstado(options[0]);
        }
    }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps


    const isReporte = tipo === "REPORTE";

    async function onSubmit() {
        // Validaciones mínimas (requeridas)
        if (!estado.trim()) {
            toast.error("El estado es obligatorio.");
            return;
        }

        if (isReporte) {
            if (!nombre.trim()) {
                toast.error("El nombre es obligatorio.");
                return;
            }
            if (!resumen.trim()) {
                toast.error("El resumen es obligatorio.");
                return;
            }
        } else {
            if (!detalles.trim()) {
                toast.error("Los detalles son obligatorios.");
                return;
            }
        }

        setSaving(true);

        const tId = toast.loading(
            mode === "create" ? "Creando registro..." : "Actualizando registro..."
        );

        try {
            if (mode === "create") {
                const res = await createRegistro({
                    sessionId,
                    tipo,
                    fecha: fecha || undefined,
                    estado,
                    nombre,
                    resumen: isReporte ? resumen : undefined,
                    lead: isReporte ? lead : undefined,
                    detalles: !isReporte ? detalles : undefined,
                });

                if (!res.success) {
                    toast.error(res.message || "No se pudo crear el registro.", { id: tId });
                    return;
                }

                toast.success("Registro creado correctamente.", { id: tId });
            } else {
                if (!registro) {
                    toast.error("No se encontró el registro a editar.", { id: tId });
                    return;
                }

                const res = await updateRegistro({
                    id: registro.id,
                    sessionId,
                    tipo,
                    fecha: fecha || undefined,
                    estado,
                    nombre,
                    resumen: isReporte ? resumen : undefined,
                    lead: isReporte ? lead : undefined,
                    detalles: !isReporte ? detalles : undefined,
                });

                if (!res.success) {
                    toast.error(res.message || "No se pudo actualizar el registro.", { id: tId });
                    return;
                }

                toast.success("Registro actualizado correctamente.", { id: tId });
            }

            onOpenChange(false);
            onSuccess();
        } catch (e: any) {
            toast.error(e?.message || "Ocurrió un error inesperado.", { id: tId });
        } finally {
            setSaving(false);
        }
    }


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {mode === "create" ? "Nuevo registro" : "Editar registro"}
                    </DialogTitle>
                    <DialogDescription>
                        Selecciona el tipo y completa los campos obligatorios.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
                    <div className="grid gap-2">
                        <Label>Tipo</Label>
                        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoRegistro)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona un tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="REPORTE">Reporte</SelectItem>
                                <SelectItem value="SOLICITUD">Solicitud</SelectItem>
                                <SelectItem value="PEDIDO">Pedido</SelectItem>
                                <SelectItem value="RECLAMO">Reclamo</SelectItem>
                                <SelectItem value="PAGO">Pago</SelectItem>
                                <SelectItem value="RESERVA">Reserva</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label>Fecha</Label>
                        <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </div>

                    <div className="grid gap-2">
                        <Label>{isReporte ? "Nombre *" : "Nombre del lead"}</Label>
                        <Input
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Nombre visible del lead para esta instancia"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>Estado *</Label>

                        <Select
                            value={estado ?? getEstadoOptions(tipo)?.[0] ?? ""}
                            onValueChange={(value) => {
                                if (value === estado) return;
                                setEstado(value);
                            }}
                        >
                            <SelectTrigger className="h-9 justify-between">
                                <SelectValue placeholder="Seleccionar estado" />
                            </SelectTrigger>

                            <SelectContent>
                                {getEstadoOptions(tipo).map((e) => (
                                    <SelectItem key={e} value={e}>
                                        {e}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {isReporte ? (
                        <>
                            <div className="grid gap-2">
                                <Label>Resumen *</Label>
                                <Textarea value={resumen} onChange={(e) => setResumen(e.target.value)} />
                            </div>
{/* 
                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div className="flex flex-col">
                                    <span className="font-medium">Lead</span>
                                    <span className="text-xs text-muted-foreground">
                                        Marcar si este reporte califica como lead.
                                    </span>
                                </div>
                                <Switch checked={lead} onCheckedChange={setLead} />
                            </div> */}
                        </>
                    ) : (
                        <div className="grid gap-2">
                            <Label>Detalles *</Label>
                            <Textarea value={detalles} onChange={(e) => setDetalles(e.target.value)} />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={onSubmit} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
