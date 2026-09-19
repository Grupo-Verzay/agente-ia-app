"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Search, Trash2, User } from "lucide-react";

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
import { cn } from "@/lib/utils";
import {
    loQueSeOfreceParaCompartir,
    type Compartible,
    type CompartibleOfrecido,
} from "@/lib/documentacion";
import {
    leerLosPermisosAction,
    loQueSePuedeCompartirAction,
    ponerPermisoAction,
    quitarPermisoAction,
    restringirDocumentoAction,
    type PermisoConNombre,
} from "@/actions/documentacion-actions";

/**
 * Con quién se comparte un espacio o un documento.
 *
 * **Compartir con una PERSONA y compartir con una CUENTA son dos cosas**: con
 * una cuenta entra su equipo entero, que es lo que hace falta para dárselo a un
 * cliente —quien comparte no administra ese equipo y no puede acordarse de
 * añadir a cada persona que entre después—.
 *
 * ## Se busca por nombre; el tipo lo trae lo elegido
 *
 * Antes había que **pegar el id a mano** y elegir el tipo en un desplegable, y
 * eso pedía dos cosas que nadie tiene delante: el id de la fila y saber si esa
 * fila es una persona o una cuenta. Un id mal pegado se guardaba como un
 * permiso que no abría nada, y equivocarse de tipo dejaba fuera al equipo de
 * una cuenta sin decirlo.
 *
 * Ahora **manda la lista, no el texto**: se teclea un nombre, se elige, y el
 * tipo viaja dentro de lo elegido. Es la misma regla que el selector de
 * menciones, y por eso comparte con él la función de filtrar
 * (`loQueOfreceElSelector`, sin acentos y sin mayúsculas: quien teclea
 * «atencion» tiene que encontrar «Verzay | Atención»).
 *
 * Y la lista que se ofrece es **la misma que valida el servidor**. Con dos
 * criterios, el selector ofrece a alguien que al guardar se cae sin decir por
 * qué.
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
    const [candidatos, setCandidatos] = useState<Compartible[] | null>(null);
    const [elegido, setElegido] = useState<CompartibleOfrecido | null>(null);
    const [busqueda, setBusqueda] = useState("");
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

    // La lista se pide UNA vez al abrir y se filtra en el navegador. Una
    // consulta por letra tecleada sería decenas de peticiones para recorrer una
    // lista que cabe entera —es lo que ya hace el diálogo de compartir de
    // Proyectos y Diagramas—.
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const res = await loQueSePuedeCompartirAction({ objetoTipo, objetoId });
                if (!vivo) return;
                if (res.success) setCandidatos(res.data);
                else {
                    setCandidatos([]);
                    toast.error(res.message);
                }
            } catch (error) {
                console.warn("[documentacion] no se pudo leer con quién compartir", error);
                // La lista deja de decir «Cargando…» aunque no llegue nada: un
                // «Cargando…» para siempre no se lee como un fallo, se lee como
                // que la App se quedó pensando.
                if (vivo) setCandidatos([]);
                toast.error("No se pudo leer la lista de cuentas y personas.");
            }
        })();
        return () => {
            vivo = false;
        };
    }, [objetoTipo, objetoId]);

    const ofrecidos = loQueSeOfreceParaCompartir(
        candidatos ?? [],
        (filas ?? []).map((f) => ({
            sujetoTipo: f.sujetoTipo,
            sujetoId: f.sujetoId,
            permiso: f.permiso,
        })),
        busqueda,
    );

    const anadir = async () => {
        if (!elegido) return;
        setGuardando(true);
        try {
            const res = await ponerPermisoAction({
                objetoTipo,
                objetoId,
                sujetoTipo: elegido.sujetoTipo,
                sujetoId: elegido.sujetoId,
                permiso,
            });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setElegido(null);
            setBusqueda("");
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

                {/* `min-w-0` en los dos bloques, y NO es decoración: los hijos
                    de `DialogContent` son celdas de un `grid`, y una celda se
                    mide por su contenido mínimo. El nombre de una cuenta va con
                    `truncate` —o sea sin cortes de línea—, así que su mínimo es
                    el nombre ENTERO: medido en Chromium a 390 px, el bloque
                    salía de 565 dentro de un diálogo de 390. `min-w-0` en el
                    hijo del flex no basta; hace falta aquí. */}
                <div className="max-h-[40vh] min-w-0 overflow-y-auto">
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

                <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
                    <Label htmlFor="permiso-buscar">Añadir</Label>

                    {elegido ? (
                        <div className="flex items-center gap-2 rounded border bg-muted/40 p-2 text-sm">
                            {elegido.sujetoTipo === "cuenta" ? (
                                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                                <User className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1 truncate">{elegido.etiqueta}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="shrink-0"
                                onClick={() => setElegido(null)}
                            >
                                Cambiar
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="permiso-buscar"
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                    placeholder="Busca una cuenta o una persona por su nombre"
                                    className="pl-8"
                                    autoComplete="off"
                                />
                            </div>

                            {/* La lista no se esconde al perder el foco: sin
                                popover no hay carrera entre el `blur` y el
                                `click`, que es lo que obliga al selector de
                                menciones a usar `onMouseDown`. */}
                            <ul className="max-h-48 overflow-y-auto rounded border">
                                {ofrecidos.length === 0 ? (
                                    <li className="px-3 py-3 text-center text-sm text-muted-foreground">
                                        {candidatos === null
                                            ? "Cargando…"
                                            : candidatos.length === 0
                                              ? "No hay ninguna cuenta ni persona que ofrecer."
                                              : "Nadie con ese nombre."}
                                    </li>
                                ) : (
                                    ofrecidos.map((c) => (
                                        <li key={`${c.sujetoTipo}-${c.sujetoId}`}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setElegido(c);
                                                    // Se arranca en lo que ya
                                                    // tiene: así elegir a alguien
                                                    // de la lista y guardar sin
                                                    // mirar no le BAJA el permiso
                                                    // sin querer.
                                                    setPermiso(c.yaTiene ?? "lectura");
                                                }}
                                                className={cn(
                                                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                                                    "hover:bg-muted/60",
                                                )}
                                            >
                                                {c.sujetoTipo === "cuenta" ? (
                                                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                                                ) : (
                                                    <User className="size-4 shrink-0 text-muted-foreground" />
                                                )}
                                                <span className="min-w-0 flex-1 truncate">
                                                    {c.etiqueta}
                                                    {c.detalle && (
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {c.detalle}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="shrink-0 text-xs text-muted-foreground">
                                                    {c.yaTiene
                                                        ? "Ya tiene acceso"
                                                        : c.sujetoTipo === "cuenta"
                                                          ? "Cuenta"
                                                          : "Persona"}
                                                </span>
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </>
                    )}

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

                <DialogFooter>
                    <Button variant="outline" onClick={alCerrar}>
                        Cerrar
                    </Button>
                    <Button onClick={() => void anadir()} disabled={guardando || !elegido}>
                        {guardando ? "Guardando…" : elegido?.yaTiene ? "Cambiar permiso" : "Añadir"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
