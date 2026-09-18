"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    leerLosPermisosAction,
    ponerPermisoAction,
    quitarPermisoAction,
    restringirDocumentoAction,
    type PermisoConNombre,
} from "@/actions/documentacion-actions";

/**
 * Con quién se comparte un espacio o un documento.
 *
 * **Compartir con una PERSONA y compartir con una CUENTA son dos cosas**, y por
 * eso el desplegable las separa en vez de pedir un id a secas: con una cuenta
 * entra su equipo entero, que es lo que hace falta para dárselo a un cliente —
 * quien comparte no administra ese equipo y no puede acordarse de añadir a cada
 * persona que entre después.
 */

export function PermisosDelObjeto({
    objetoTipo,
    objetoId,
    nombre,
    restringido,
    alCerrar,
    alCambiarRestringido,
}: {
    objetoTipo: "espacio" | "documento";
    objetoId: string;
    nombre: string;
    restringido?: boolean;
    alCerrar: () => void;
    alCambiarRestringido?: (valor: boolean) => void;
}) {
    const [filas, setFilas] = useState<PermisoConNombre[] | null>(null);
    const [sujetoId, setSujetoId] = useState("");
    const [sujetoTipo, setSujetoTipo] = useState<"persona" | "cuenta">("cuenta");
    const [permiso, setPermiso] = useState<"lectura" | "edicion">("lectura");
    const [guardando, setGuardando] = useState(false);

    const recargar = async () => {
        try {
            const res = await leerLosPermisosAction({ objetoTipo, objetoId });
            if (res.success) setFilas(res.data);
            else toast.error(res.message);
        } catch (error) {
            console.warn("[documentacion] no se pudieron leer los permisos", error);
            toast.error("No se pudieron leer los permisos.");
        }
    };

    useEffect(() => {
        void recargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objetoTipo, objetoId]);

    const anadir = async () => {
        setGuardando(true);
        try {
            const res = await ponerPermisoAction({
                objetoTipo,
                objetoId,
                sujetoTipo,
                sujetoId: sujetoId.trim(),
                permiso,
            });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setSujetoId("");
            await recargar();
        } catch (error) {
            console.warn("[documentacion] no se pudo guardar el permiso", error);
            toast.error("No se pudo guardar el permiso.");
        } finally {
            setGuardando(false);
        }
    };

    const quitar = async (fila: PermisoConNombre) => {
        try {
            const res = await quitarPermisoAction({
                objetoTipo,
                objetoId,
                sujetoTipo: fila.sujetoTipo,
                sujetoId: fila.sujetoId,
            });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            await recargar();
        } catch (error) {
            console.warn("[documentacion] no se pudo quitar el permiso", error);
            toast.error("No se pudo quitar el permiso.");
        }
    };

    const cambiarRestringido = async (valor: boolean) => {
        try {
            const res = await restringirDocumentoAction({ id: objetoId, restringido: valor });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            alCambiarRestringido?.(valor);
        } catch (error) {
            console.warn("[documentacion] no se pudo cambiar el acceso", error);
            toast.error("No se pudo cambiar el acceso.");
        }
    };

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Permisos de «{nombre}»</DialogTitle>
                    <DialogDescription>
                        Con una cuenta entra su equipo entero; con una persona, solo ella.
                    </DialogDescription>
                </DialogHeader>

                {objetoTipo === "documento" && (
                    <label className="flex items-start gap-2 rounded border p-2 text-sm">
                        <input
                            type="checkbox"
                            checked={Boolean(restringido)}
                            onChange={(e) => void cambiarRestringido(e.target.checked)}
                            className="mt-1"
                        />
                        <span>
                            Restringido dentro de su espacio
                            <span className="block text-xs text-muted-foreground">
                                Deja de verse para quien llegaba por el espacio —también en el
                                árbol, no solo al abrirlo— y solo entran quien lo escribió, quien
                                administra la cuenta y quien esté en la lista de abajo.
                            </span>
                        </span>
                    </label>
                )}

                <div className="max-h-[40vh] overflow-y-auto">
                    {filas === null ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
                    ) : filas.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            Nadie de fuera todavía.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {filas.map((f) => (
                                <li
                                    key={`${f.sujetoTipo}-${f.sujetoId}`}
                                    className="flex items-center gap-2 rounded border p-2 text-sm"
                                >
                                    <span className="min-w-0 flex-1 truncate">
                                        {f.sujetoNombre ?? f.sujetoId}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {f.sujetoTipo === "cuenta" ? "Cuenta" : "Persona"} ·{" "}
                                        {f.permiso === "edicion" ? "Puede editar" : "Solo lectura"}
                                    </span>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="shrink-0"
                                        onClick={() => void quitar(f)}
                                        title="Quitar"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex flex-col gap-2 border-t pt-3">
                    <Label htmlFor="permiso-sujeto">Añadir</Label>
                    <div className="flex flex-wrap gap-2">
                        <Input
                            id="permiso-sujeto"
                            value={sujetoId}
                            onChange={(e) => setSujetoId(e.target.value)}
                            placeholder="id de la cuenta o de la persona"
                            className="min-w-[12rem] flex-1"
                        />
                        <Select
                            value={sujetoTipo}
                            onValueChange={(v) => setSujetoTipo(v as "persona" | "cuenta")}
                        >
                            <SelectTrigger className="w-[8rem]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cuenta">Cuenta</SelectItem>
                                <SelectItem value="persona">Persona</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={permiso}
                            onValueChange={(v) => setPermiso(v as "lectura" | "edicion")}
                        >
                            <SelectTrigger className="w-[10rem]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="lectura">Solo lectura</SelectItem>
                                <SelectItem value="edicion">Puede editar</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={alCerrar}>
                        Cerrar
                    </Button>
                    <Button onClick={() => void anadir()} disabled={guardando || !sujetoId.trim()}>
                        {guardando ? "Guardando…" : "Añadir"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
