"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { TIPOS_DE_DOCUMENTO, type TipoDeDocumento } from "@/lib/documentacion";
import { crearDocumentoAction, crearEspacioAction } from "@/actions/documentacion-actions";
import type { DocumentoEnLista } from "@/lib/documentacion-db";

/**
 * Los diálogos de Documentación.
 *
 * Los pies van con `DialogFooter` y los botones como **hijos directos**: el pie
 * de la casa reparte con `justify-between`, así que metiéndolos en un `div`
 * intermedio el pie ve un solo hijo, lo manda a un extremo y salen amontonados.
 * Es el fallo más difícil de ver de romper esa regla, porque el pie parece bien
 * escrito.
 */

/** Ninguna llamada puede dejar el botón en «Guardando…» para siempre. */
async function pedir<T extends { success: boolean; message?: string }>(
    llamada: () => Promise<T>,
): Promise<T | { success: false; message: string }> {
    try {
        return await llamada();
    } catch (error) {
        console.warn("[documentacion] la accion no llego al servidor", error);
        return { success: false, message: "No se pudo completar. Revisa la conexión." };
    }
}

const NOMBRE_DEL_TIPO: Record<TipoDeDocumento, string> = {
    documento: "Documento",
    lista: "Lista",
    plantilla: "Plantilla",
};

/* ───────────────────────────── Nuevo espacio ────────────────────────────── */

export function NuevoEspacioDialog({
    disparador,
    alCrear,
}: {
    disparador: ReactNode;
    alCrear: () => void | Promise<void>;
}) {
    const [abierto, setAbierto] = useState(false);
    const [nombre, setNombre] = useState("");
    const [icono, setIcono] = useState("");
    const [restringido, setRestringido] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const crear = async () => {
        setGuardando(true);
        const res = await pedir(() =>
            crearEspacioAction({
                nombre,
                icono: icono || null,
                visibilidad: restringido ? "restringido" : "cuenta",
            }),
        );
        setGuardando(false);

        if (!res.success) {
            toast.error(res.message ?? "No se pudo crear el espacio.");
            return;
        }
        setAbierto(false);
        setNombre("");
        setIcono("");
        setRestringido(false);
        await alCrear();
        toast.success("Espacio creado.");
    };

    return (
        <Dialog open={abierto} onOpenChange={setAbierto}>
            <DialogTrigger asChild>{disparador}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nuevo espacio</DialogTitle>
                    <DialogDescription>
                        Un espacio agrupa documentos: Procedimientos, Clientes, Onboarding.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="espacio-nombre">Nombre</Label>
                        <Input
                            id="espacio-nombre"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Procedimientos"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="espacio-icono">Icono (opcional)</Label>
                        <Input
                            id="espacio-icono"
                            value={icono}
                            onChange={(e) => setIcono(e.target.value)}
                            placeholder="📘"
                            maxLength={4}
                        />
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={restringido}
                            onChange={(e) => setRestringido(e.target.checked)}
                            className="mt-1"
                        />
                        <span>
                            Restringido
                            <span className="block text-xs text-muted-foreground">
                                Solo entra quien administra la cuenta y quien tenga permiso. Sin
                                marcar, lo lee todo el equipo.
                            </span>
                        </span>
                    </label>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setAbierto(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={() => void crear()} disabled={guardando || !nombre.trim()}>
                        {guardando ? "Creando…" : "Crear espacio"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ──────────────────────────── Nuevo documento ───────────────────────────── */

export function NuevoDocumentoDialog({
    espacioId,
    plantillas,
    disparador,
    alCrear,
}: {
    espacioId: string;
    plantillas: DocumentoEnLista[];
    disparador: ReactNode;
    alCrear: (id: string) => void | Promise<void>;
}) {
    const [abierto, setAbierto] = useState(false);
    const [titulo, setTitulo] = useState("");
    const [tipo, setTipo] = useState<TipoDeDocumento>("documento");
    const [plantilla, setPlantilla] = useState("");
    const [guardando, setGuardando] = useState(false);

    const crear = async () => {
        setGuardando(true);
        const res = await pedir(() =>
            crearDocumentoAction({
                espacioId,
                titulo,
                tipo,
                desdePlantilla: plantilla || undefined,
            }),
        );
        setGuardando(false);

        if (!res.success) {
            toast.error(res.message ?? "No se pudo crear el documento.");
            return;
        }
        setAbierto(false);
        setTitulo("");
        setPlantilla("");
        await alCrear((res as { data: { id: string } }).data.id);
    };

    return (
        <Dialog open={abierto} onOpenChange={setAbierto}>
            <DialogTrigger asChild>{disparador}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nuevo</DialogTitle>
                    <DialogDescription>
                        Un documento es texto; una lista se ve como tabla, tablero o calendario.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="doc-titulo">Título</Label>
                        <Input
                            id="doc-titulo"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="Alta de un cliente nuevo"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label>Tipo</Label>
                        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDeDocumento)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TIPOS_DE_DOCUMENTO.map((t) => (
                                    <SelectItem key={t} value={t}>
                                        {NOMBRE_DEL_TIPO[t]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {plantillas.length > 0 && tipo !== "plantilla" && (
                        <div className="flex flex-col gap-1.5">
                            <Label>Desde una plantilla (opcional)</Label>
                            <Select
                                value={plantilla || "__ninguna__"}
                                onValueChange={(v) => setPlantilla(v === "__ninguna__" ? "" : v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {/* Radix no admite un `SelectItem` vacio, asi
                                        que «ninguna» va con su propio centinela. */}
                                    <SelectItem value="__ninguna__">En blanco</SelectItem>
                                    {plantillas.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.titulo}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setAbierto(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={() => void crear()} disabled={guardando || !titulo.trim()}>
                        {guardando ? "Creando…" : "Crear"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
