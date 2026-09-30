"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { guardarIntroduccionDeLaGuiaAction, introduccionDeLaGuiaAction } from "@/actions/guia-introduccion-actions";
import { TOPES, type Introduccion } from "@/lib/introduccion-de-la-guia";

/**
 * Editar la introducción de la GUÍA PÚBLICA de un módulo (`/guia/<modulo>`).
 * Solo se pinta para la casa; la puerta de verdad está en la acción.
 *
 * Un campo vacío vuelve al texto original de la guía, así que el marcador de
 * cada campo ES ese texto: se ve qué saldría sin escribir nada.
 */
export function EditarIntroduccionDeLaGuia({
    modulo,
    nombre,
    conAsa = false,
}: {
    modulo: string;
    nombre: string;
    /** Va dentro de una lista que se reordena: le deja sitio al asa a la izquierda. */
    conAsa?: boolean;
}) {
    const [abierto, setAbierto] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [valor, setValor] = useState<Introduccion>({ titulo: "", subtitulo: "", descripcion: "" });
    const [porDefecto, setPorDefecto] = useState<Introduccion | null>(null);

    const abrir = async () => {
        setAbierto(true);
        setCargando(true);
        try {
            const r = await introduccionDeLaGuiaAction(modulo);
            if (!r.success) {
                toast.error(r.message ?? "No se pudo cargar la introducción.");
                setAbierto(false);
                return;
            }
            setPorDefecto(r.porDefecto ?? null);
            setValor(r.guardada ?? { titulo: "", subtitulo: "", descripcion: "" });
        } catch {
            toast.error("No se pudo cargar la introducción.");
            setAbierto(false);
        } finally {
            setCargando(false);
        }
    };

    const guardar = async (v: Introduccion) => {
        setGuardando(true);
        try {
            const r = await guardarIntroduccionDeLaGuiaAction(modulo, v);
            if (!r.success) {
                toast.error(r.message ?? "No se pudo guardar.");
                return;
            }
            toast.success("Introducción guardada. Ya se ve en la guía pública.");
            setAbierto(false);
        } catch {
            toast.error("No se pudo guardar la introducción.");
        } finally {
            setGuardando(false);
        }
    };

    const campo = (k: keyof Introduccion) => ({
        value: valor[k],
        placeholder: porDefecto?.[k] ?? "",
        maxLength: TOPES[k],
        disabled: cargando || guardando,
        onChange: (e: { target: { value: string } }) => setValor((v) => ({ ...v, [k]: e.target.value })),
    });

    return (
        <>
            <div
                data-guia-publica={modulo}
                className={`flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3${conAsa ? " pl-11" : ""}`}
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                    <BookOpen className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Guía pública de {nombre}</p>
                    <p className="text-xs text-muted-foreground">El texto de introducción que se lee debajo del vídeo.</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <a href={`/guia/${modulo}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        Ver
                    </a>
                </Button>
                <Button size="sm" onClick={abrir} data-editar-introduccion>
                    <Pencil className="h-4 w-4" aria-hidden />
                    Editar introducción
                </Button>
            </div>

            <Dialog open={abierto} onOpenChange={(o) => !guardando && setAbierto(o)}>
                <DialogContent className="border-border sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Introducción de la guía de {nombre}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-xs text-muted-foreground">
                            Un campo vacío usa el texto original. Deja una línea en blanco para separar párrafos.
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="guia-titulo">Título</Label>
                            <Input id="guia-titulo" {...campo("titulo")} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="guia-subtitulo">Subtítulo</Label>
                            <Input id="guia-subtitulo" {...campo("subtitulo")} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="guia-descripcion">Descripción</Label>
                            <Textarea id="guia-descripcion" rows={6} {...campo("descripcion")} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={cargando || guardando}
                            onClick={() => guardar({ titulo: "", subtitulo: "", descripcion: "" })}
                        >
                            Restaurar original
                        </Button>
                        <Button disabled={cargando || guardando} onClick={() => guardar(valor)} data-guardar-introduccion>
                            {guardando ? "Guardando…" : "Guardar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
