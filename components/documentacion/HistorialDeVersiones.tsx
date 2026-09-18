"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    leerElHistorialAction,
    volverALaVersionAction,
} from "@/actions/documentacion-actions";

/**
 * Quién cambió qué, y volver atrás.
 *
 * El autor y la fecha vienen COPIADOS dentro de cada versión, así que el
 * historial sigue diciendo quién escribió aunque esa persona salga del equipo —
 * el mismo criterio que `autorNombre` en el chat de equipo.
 *
 * Y **volver atrás es un cambio más, no un borrado**: se guarda como una
 * versión nueva con el contenido de la vieja, así que el historial conserva que
 * se volvió y desde dónde. Reescribiendo la fila y tirando lo de en medio,
 * deshacer una vuelta atrás sería imposible, que es justo lo que hace falta
 * cuando alguien se equivoca al restaurar.
 */

type Fila = {
    id: string;
    version: number;
    titulo: string;
    autorId: string;
    autorNombre: string | null;
    creadoEn: Date | string;
};

export function HistorialDeVersiones({
    documentoId,
    puedeEditar,
    alCerrar,
    alVolver,
}: {
    documentoId: string;
    puedeEditar: boolean;
    alCerrar: () => void;
    alVolver: () => void;
}) {
    const [versiones, setVersiones] = useState<Fila[] | null>(null);
    const [volviendo, setVolviendo] = useState<number | null>(null);

    useEffect(() => {
        let vivo = true;
        void (async () => {
            try {
                const res = await leerElHistorialAction({ id: documentoId });
                if (!vivo) return;
                if (res.success) setVersiones(res.data as unknown as Fila[]);
                else toast.error(res.message);
            } catch (error) {
                console.warn("[documentacion] no se pudo leer el historial", error);
                if (vivo) toast.error("No se pudo leer el historial.");
            }
        })();
        return () => {
            vivo = false;
        };
    }, [documentoId]);

    const volver = async (version: number) => {
        setVolviendo(version);
        try {
            const res = await volverALaVersionAction({ id: documentoId, version });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            toast.success(`Se volvió a la versión ${version}.`);
            alVolver();
        } catch (error) {
            console.warn("[documentacion] no se pudo volver a la version", error);
            toast.error("No se pudo volver a esa versión.");
        } finally {
            setVolviendo(null);
        }
    };

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Historial de versiones</DialogTitle>
                    <DialogDescription>
                        Se guardan los últimos 100 cambios. Volver a una versión anterior queda
                        también en el historial.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[60vh] overflow-y-auto">
                    {versiones === null ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
                    ) : versiones.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Todavía no hay versiones.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {versiones.map((v, i) => (
                                <li
                                    key={v.id}
                                    className="flex items-center gap-3 rounded border p-2 text-sm"
                                >
                                    <span className="w-12 shrink-0 text-muted-foreground">
                                        v{v.version}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate" title={v.titulo}>
                                        {v.titulo}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {v.autorNombre ?? "Alguien"} ·{" "}
                                        {new Date(v.creadoEn).toLocaleString("es-CO", {
                                            day: "2-digit",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                    {puedeEditar && i > 0 && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="shrink-0"
                                            disabled={volviendo !== null}
                                            onClick={() => void volver(v.version)}
                                        >
                                            <RotateCcw className="mr-1 size-3.5" />
                                            {volviendo === v.version ? "Volviendo…" : "Volver aquí"}
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={alCerrar}>
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
