"use client";

import { useMemo, useState } from "react";
import { Copy, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarraDeAcciones, BotonDeCrear } from "@/components/shared/BarraDeAcciones";
import {
    borrarPropuestaAction,
    crearPropuestaAction,
    editarPropuestaAction,
} from "@/actions/propuestas-actions";
import {
    comoSeLeeElImporte,
    comoSeLeeLaFecha,
    elEnlaceDeWhatsapp,
    elEnlacePublico,
    elMensajeDeWhatsapp,
    elTotal,
    type Propuesta,
} from "@/lib/propuestas";
import { FormularioDePropuesta, type BorradorDePropuesta } from "./FormularioDePropuesta";
import { copiarAlPortapapeles } from "./copiar-enlace";

/** Lo que se busca: el cliente, sin acentos ni mayúsculas. */
function normalizar(s: string): string {
    return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Una acción de servidor puede REVENTAR, no solo decir que no: nunca un botón colgado. */
async function pedir<T>(hacer: () => Promise<{ success: true; data: T } | { success: false; message: string }>) {
    try {
        return await hacer();
    } catch (error) {
        console.error("[propuestas] la acción no llegó al servidor", error);
        return { success: false as const, message: "No se pudo completar. Revisa la conexión." };
    }
}

export function PropuestasClient({ inicial, origen }: { inicial: Propuesta[]; origen: string }) {
    const [propuestas, setPropuestas] = useState<Propuesta[]>(inicial);
    const [busqueda, setBusqueda] = useState("");
    const [formAbierto, setFormAbierto] = useState(false);
    const [enEdicion, setEnEdicion] = useState<Propuesta | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [aBorrar, setABorrar] = useState<Propuesta | null>(null);

    // El origen de la PETICIÓN; si no llega, el de la pestaña.
    const base = origen || (typeof window !== "undefined" ? window.location.origin : "");

    const visibles = useMemo(() => {
        const q = normalizar(busqueda.trim());
        return q ? propuestas.filter((p) => normalizar(p.cliente).includes(q)) : propuestas;
    }, [propuestas, busqueda]);

    const abrirNueva = () => {
        setEnEdicion(null);
        setFormAbierto(true);
    };

    const guardar = async (b: BorradorDePropuesta) => {
        setGuardando(true);
        const r = await pedir(() => (enEdicion ? editarPropuestaAction(enEdicion.id, b) : crearPropuestaAction(b)));
        setGuardando(false);
        if (!r.success) {
            toast.error(r.message);
            return;
        }
        const p = r.data;
        setPropuestas((lista) => (enEdicion ? lista.map((x) => (x.id === p.id ? p : x)) : [p, ...lista]));
        setFormAbierto(false);
        if (enEdicion) {
            toast.success("Propuesta guardada. El enlace sigue siendo el mismo.");
        } else {
            // Al crearla, lo siguiente que se hace es mandarla: el enlace va copiado ya.
            const ok = await copiarAlPortapapeles(elEnlacePublico(base, p.token));
            toast.success(ok ? "Propuesta creada. Enlace copiado: pégalo en WhatsApp." : "Propuesta creada.");
        }
    };

    const copiar = async (p: Propuesta) => {
        const ok = await copiarAlPortapapeles(elEnlacePublico(base, p.token));
        if (ok) toast.success("Enlace copiado. Pégalo en WhatsApp.");
        else toast.error("No se pudo copiar. Abre la propuesta y copia la dirección desde el navegador.");
    };

    const borrar = async () => {
        const p = aBorrar;
        if (!p) return;
        setABorrar(null);
        // Se quita al momento y vuelve si el servidor dice que no.
        setPropuestas((l) => l.filter((x) => x.id !== p.id));
        const r = await pedir(() => borrarPropuestaAction(p.id));
        if (!r.success) {
            setPropuestas((l) => [p, ...l].sort((a, z) => z.creadaEn.localeCompare(a.creadaEn)));
            toast.error(r.message);
            return;
        }
        toast.success("Propuesta eliminada. Su enlace ya no abre nada.");
    };

    return (
        <div data-full-bleed className="flex h-full min-w-0 w-full flex-col gap-2">
            <BarraDeAcciones
                buscador={
                    <Input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar cliente…"
                        className="h-10 w-56 sm:w-72"
                    />
                }
                crear={<BotonDeCrear onClick={abrirNueva}>Nuevo</BotonDeCrear>}
            />

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-right">Inversión</TableHead>
                            <TableHead className="text-right">Mantenimiento</TableHead>
                            <TableHead className="text-center">Visitas</TableHead>
                            <TableHead className="text-right">Enlace</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibles.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                    {propuestas.length === 0
                                        ? "Todavía no has creado ninguna propuesta."
                                        : "Ninguna propuesta coincide con la búsqueda."}
                                </TableCell>
                            </TableRow>
                        )}
                        {visibles.map((p) => {
                            const enlace = elEnlacePublico(base, p.token);
                            return (
                                <TableRow key={p.id} data-propuesta-fila={p.id}>
                                    <TableCell className="max-w-[16rem]">
                                        <button
                                            type="button"
                                            className="line-clamp-1 text-left font-medium hover:underline"
                                            title={p.cliente}
                                            onClick={() => {
                                                setEnEdicion(p);
                                                setFormAbierto(true);
                                            }}
                                        >
                                            {p.cliente}
                                        </button>
                                        <div className="text-xs text-muted-foreground">
                                            {p.servicios.length} {p.servicios.length === 1 ? "servicio" : "servicios"}
                                        </div>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">{comoSeLeeLaFecha(p.fecha)}</TableCell>
                                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                                        {comoSeLeeElImporte(elTotal(p.servicios), p.moneda)}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                                        {p.mantenimientoMensual === null
                                            ? "—"
                                            : `${comoSeLeeElImporte(p.mantenimientoMensual, p.moneda)}/mes`}
                                    </TableCell>
                                    <TableCell
                                        className="text-center tabular-nums"
                                        title={
                                            p.ultimaVezAbierta
                                                ? `Última vez: ${new Date(p.ultimaVezAbierta).toLocaleString("es-CO")}`
                                                : "Nadie la ha abierto todavía"
                                        }
                                    >
                                        {p.vecesAbierta}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5"
                                                data-copiar-enlace
                                                onClick={() => void copiar(p)}
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">Copiar enlace</span>
                                            </Button>
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                                className="h-8 border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                                            >
                                                <a
                                                    href={elEnlaceDeWhatsapp(elMensajeDeWhatsapp(p.cliente, enlace))}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Enviar por WhatsApp"
                                                    aria-label="Enviar por WhatsApp"
                                                >
                                                    WhatsApp
                                                </a>
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        aria-label="Más acciones"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem asChild>
                                                        <a href={enlace} target="_blank" rel="noopener noreferrer">
                                                            <ExternalLink className="mr-2 h-4 w-4" /> Ver página pública
                                                        </a>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onSelect={() => {
                                                            setEnEdicion(p);
                                                            setFormAbierto(true);
                                                        }}
                                                    >
                                                        <Pencil className="mr-2 h-4 w-4" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:text-destructive"
                                                        onSelect={() => setABorrar(p)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <FormularioDePropuesta
                abierto={formAbierto}
                propuesta={enEdicion}
                guardando={guardando}
                onCerrar={() => setFormAbierto(false)}
                onGuardar={(b) => void guardar(b)}
            />

            <AlertDialog open={Boolean(aBorrar)} onOpenChange={(o) => !o && setABorrar(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar la propuesta?</AlertDialogTitle>
                        <AlertDialogDescription>
                            La propuesta de «{aBorrar?.cliente}» se borra y su enlace deja de abrir: quien lo tenga
                            verá que ya no está disponible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void borrar()}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
