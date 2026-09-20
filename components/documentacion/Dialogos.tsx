"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { LARGO_DEL_NOMBRE } from "@/lib/carpetas-de-documentacion";
import {
    borrarCarpetaAction,
    borrarEspacioAction,
    crearCarpetaAction,
    crearDocumentoAction,
    crearEspacioAction,
    cuantosDocumentosTieneAction,
    editarEspacioAction,
    renombrarCarpetaAction,
} from "@/actions/documentacion-actions";
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

/* ─────────────────────────── Renombrar espacio ──────────────────────────── */

/**
 * Renombrar un espacio, con su icono.
 *
 * **No toca la visibilidad**, que se reparte desde el diálogo de permisos: dos
 * sitios para lo mismo es uno que se afina y otro que se queda atrás. Este es
 * el nombre y nada más, que es lo que se pidió.
 */
export function EditarEspacioDialog({
    espacioId,
    nombreActual,
    iconoActual,
    abierto,
    onAbiertoChange,
    alGuardar,
}: {
    espacioId: string;
    nombreActual: string;
    iconoActual: string | null;
    abierto: boolean;
    onAbiertoChange: (abierto: boolean) => void;
    alGuardar: () => void | Promise<void>;
}) {
    const [nombre, setNombre] = useState(nombreActual);
    const [icono, setIcono] = useState(iconoActual ?? "");
    const [guardando, setGuardando] = useState(false);

    // Al abrirlo se parte de lo que hay guardado: si no, un cambio cancelado
    // seguiría escrito en la caja la próxima vez y se guardaría sin querer.
    useEffect(() => {
        if (abierto) {
            setNombre(nombreActual);
            setIcono(iconoActual ?? "");
        }
    }, [abierto, nombreActual, iconoActual]);

    const guardar = async () => {
        setGuardando(true);
        const res = await pedir(() =>
            editarEspacioAction({ id: espacioId, nombre, icono: icono || null }),
        );
        setGuardando(false);

        if (!res.success) {
            toast.error(res.message ?? "No se pudo guardar el espacio.");
            return;
        }
        onAbiertoChange(false);
        await alGuardar();
        toast.success("Espacio renombrado.");
    };

    return (
        <Dialog open={abierto} onOpenChange={onAbiertoChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Renombrar espacio</DialogTitle>
                    <DialogDescription>
                        Lo de dentro no se toca: los documentos siguen donde están.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="editar-espacio-nombre">Nombre</Label>
                        <Input
                            id="editar-espacio-nombre"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Procedimientos"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="editar-espacio-icono">Icono (opcional)</Label>
                        <Input
                            id="editar-espacio-icono"
                            value={icono}
                            onChange={(e) => setIcono(e.target.value)}
                            placeholder="📘"
                            maxLength={4}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onAbiertoChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={() => void guardar()} disabled={guardando || !nombre.trim()}>
                        {guardando ? "Guardando…" : "Guardar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ──────────────────────────── Borrar espacio ────────────────────────────── */

/**
 * Borrar un espacio, diciendo **cuántos documentos se va a llevar**.
 *
 * El número se pide al servidor al abrir el diálogo y no sale del árbol: el
 * árbol enseña lo que quien mira alcanza —sin los restringidos de otra gente— y
 * el borrado se lleva el espacio entero. Un «se van a borrar 3» que se lleva 11
 * es peor que no decir ninguno.
 *
 * Y mientras no se sabe, **no se inventa un cero**: se dice que se está
 * contando y el botón espera. Un cero mientras carga se lee como «este espacio
 * está vacío», que es justo lo contrario de lo que esta confirmación existe
 * para avisar.
 */
export function BorrarEspacioDialog({
    espacioId,
    nombre,
    abierto,
    onAbiertoChange,
    alBorrar,
}: {
    espacioId: string;
    nombre: string;
    abierto: boolean;
    onAbiertoChange: (abierto: boolean) => void;
    alBorrar: () => void | Promise<void>;
}) {
    const [cuantos, setCuantos] = useState<number | null>(null);
    const [contando, setContando] = useState(false);
    const [borrando, setBorrando] = useState(false);

    useEffect(() => {
        if (!abierto) return;
        let vigente = true;
        setCuantos(null);
        setContando(true);
        void (async () => {
            const res = await pedir(() => cuantosDocumentosTieneAction({ id: espacioId }));
            if (!vigente) return;
            setContando(false);
            if (res.success) setCuantos((res as { data: { cuantos: number } }).data.cuantos);
            // Si no se pudo contar se dice, y el botón sigue: no poder enseñar
            // el número no es motivo para no dejar borrar.
            else toast.error(res.message ?? "No se pudo contar los documentos.");
        })();
        return () => {
            vigente = false;
        };
    }, [abierto, espacioId]);

    const borrar = async () => {
        setBorrando(true);
        const res = await pedir(() => borrarEspacioAction({ id: espacioId }));
        setBorrando(false);

        if (!res.success) {
            toast.error(res.message ?? "No se pudo borrar el espacio.");
            return;
        }
        onAbiertoChange(false);
        await alBorrar();
        toast.success("Espacio eliminado.");
    };

    return (
        <AlertDialog open={abierto} onOpenChange={(v) => !borrando && onAbiertoChange(v)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar «{nombre}»?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm">
                            {contando ? (
                                <p>Contando los documentos que hay dentro…</p>
                            ) : cuantos === null ? (
                                <p>
                                    No se pudo contar cuántos documentos hay dentro. Se eliminarán
                                    todos los del espacio.
                                </p>
                            ) : cuantos === 0 ? (
                                <p>El espacio está vacío.</p>
                            ) : (
                                <p>
                                    Se eliminarán también{" "}
                                    <strong>
                                        {cuantos} {cuantos === 1 ? "documento" : "documentos"}
                                    </strong>{" "}
                                    que hay dentro.
                                </p>
                            )}
                            <p className="text-muted-foreground">
                                El espacio deja de verse en todas partes, pero no se borra nada de
                                la base: se puede recuperar entero.
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(evento) => {
                            // Sin esto Radix cierra al pulsar y el «Eliminando…»
                            // no se llega a ver.
                            evento.preventDefault();
                            void borrar();
                        }}
                        disabled={borrando || contando}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {borrando ? "Eliminando…" : "Eliminar espacio"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/* ───────────────────────────── Las carpetas ─────────────────────────────── */

/**
 * Crear o renombrar una carpeta: **un solo diálogo**, porque son el mismo
 * formulario con un campo.
 *
 * Con dos, el día que se afine el saneado del nombre o el aviso se afina en uno
 * y el otro se queda atrás, que es la regla de esta casa. Lo que cambia entre
 * los dos casos es el título y a qué acción se llama, y eso entra por props.
 */
export function CarpetaDialog({
    carpetaId,
    nombreActual,
    abierto,
    onAbiertoChange,
    alGuardar,
}: {
    /** `null` = crear una nueva. */
    carpetaId: string | null;
    nombreActual?: string;
    abierto: boolean;
    onAbiertoChange: (abierto: boolean) => void;
    alGuardar: () => void | Promise<void>;
}) {
    const [nombre, setNombre] = useState(nombreActual ?? "");
    const [guardando, setGuardando] = useState(false);

    // Al abrirlo se parte de lo que hay guardado: si no, un cambio cancelado
    // seguiría escrito en la caja la próxima vez.
    useEffect(() => {
        if (abierto) setNombre(nombreActual ?? "");
    }, [abierto, nombreActual]);

    const guardar = async () => {
        setGuardando(true);
        // Las dos devuelven `{success, message}` y aquí no se mira el dato, así
        // que se estrecha a lo común: sin esto el tipo de `pedir` se queda con
        // el de la primera rama.
        const res = await pedir<{ success: boolean; message?: string }>(() =>
            carpetaId
                ? renombrarCarpetaAction({ id: carpetaId, nombre })
                : crearCarpetaAction({ nombre }),
        );
        setGuardando(false);

        if (!res.success) {
            toast.error(res.message ?? "No se pudo guardar la carpeta.");
            return;
        }
        onAbiertoChange(false);
        await alGuardar();
        toast.success(carpetaId ? "Carpeta renombrada." : "Carpeta creada.");
    };

    return (
        <Dialog open={abierto} onOpenChange={onAbiertoChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{carpetaId ? "Renombrar carpeta" : "Nueva carpeta"}</DialogTitle>
                    <DialogDescription>
                        Una carpeta agrupa espacios. Lo de dentro no se toca: los espacios y sus
                        documentos siguen donde están.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="carpeta-nombre">Nombre</Label>
                    <Input
                        id="carpeta-nombre"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Operaciones"
                        maxLength={LARGO_DEL_NOMBRE}
                        // Enter guarda: un formulario de un solo campo donde hay
                        // que ir al botón con el ratón se usa la mitad.
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && nombre.trim() && !guardando) {
                                e.preventDefault();
                                void guardar();
                            }
                        }}
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onAbiertoChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={() => void guardar()} disabled={guardando || !nombre.trim()}>
                        {guardando ? "Guardando…" : carpetaId ? "Guardar" : "Crear carpeta"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Borrar una carpeta.
 *
 * **Y lo que dice es lo que hace**: los espacios de dentro no se borran, quedan
 * sueltos. Se dice con esas palabras y con el número delante, porque «¿se van a
 * borrar mis documentos?» es exactamente lo que se pregunta quien pulsa esto —y
 * un diálogo que no lo contesta se cancela.
 *
 * El número sale del árbol que se tiene delante, y no de una consulta: aquí es
 * correcto, a diferencia de borrar un espacio. Lo que se enseña son los
 * espacios que van a quedar sueltos **en esta pantalla**, que es justo lo que
 * quien mira tiene delante; no hay ninguno escondido que contar, porque la
 * carpeta es de su cuenta y lo que no alcanza no está en ella.
 */
export function BorrarCarpetaDialog({
    carpetaId,
    nombre,
    cuantosEspacios,
    abierto,
    onAbiertoChange,
    alBorrar,
}: {
    carpetaId: string;
    nombre: string;
    cuantosEspacios: number;
    abierto: boolean;
    onAbiertoChange: (abierto: boolean) => void;
    alBorrar: () => void | Promise<void>;
}) {
    const [borrando, setBorrando] = useState(false);

    const borrar = async () => {
        setBorrando(true);
        const res = await pedir(() => borrarCarpetaAction({ id: carpetaId }));
        setBorrando(false);

        if (!res.success) {
            toast.error(res.message ?? "No se pudo borrar la carpeta.");
            return;
        }
        onAbiertoChange(false);
        await alBorrar();
        toast.success("Carpeta eliminada.");
    };

    return (
        <AlertDialog open={abierto} onOpenChange={(v) => !borrando && onAbiertoChange(v)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar la carpeta «{nombre}»?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm">
                            {cuantosEspacios === 0 ? (
                                <p>La carpeta está vacía.</p>
                            ) : (
                                <p>
                                    <strong>
                                        No se borra ningún espacio ni ningún documento.
                                    </strong>{" "}
                                    Los{" "}
                                    <strong>
                                        {cuantosEspacios}{" "}
                                        {cuantosEspacios === 1 ? "espacio" : "espacios"}
                                    </strong>{" "}
                                    que hay dentro quedan sueltos, fuera de cualquier carpeta.
                                </p>
                            )}
                            <p className="text-muted-foreground">
                                Lo único que se va es la carpeta.
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(evento) => {
                            evento.preventDefault();
                            void borrar();
                        }}
                        disabled={borrando}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {borrando ? "Eliminando…" : "Eliminar carpeta"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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
