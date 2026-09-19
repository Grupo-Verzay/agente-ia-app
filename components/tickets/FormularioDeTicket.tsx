"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, LifeBuoy } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    borrarDelBucket,
    type AdjuntoEnElAire,
} from "@/app/(root)/proyectos/_components/BloqueDeAdjuntos";
import { abrirTicketAction } from "@/actions/tickets-actions";
import { CamposDelTicket } from "@/components/tickets/CamposDelTicket";
import { SelectorDeCuenta, type CuentaElegible } from "@/components/tickets/SelectorDeCuenta";
import type { AdvisorInfo } from "@/actions/team-actions";
import { queLeFaltaAlTicket } from "@/lib/tickets";

/**
 * El formulario con el que un cliente abre un ticket.
 *
 * ## Los adjuntos son los MISMOS de Proyectos
 *
 * `BloqueDeAdjuntos` tal cual, con `taskId={null}`: el ticket no existe todavía
 * cuando se sube el archivo, así que todo cae «en el aire» —subido al bucket,
 * sin colgar de nada— y se engancha al guardar. Es exactamente el camino que ya
 * existía para una tarea que aún no se ha creado, y por eso el pegado con
 * Ctrl+V, el arrastrar y el tope vienen puestos sin escribir una línea.
 *
 * ## Y el cierre va por UN solo camino
 *
 * La X, el clic fuera y «Cancelar» llaman a `cerrar()`, que borra del bucket lo
 * que quedó en el aire. Con tres salidas distintas basta con olvidarse de una
 * para que esa deje basura, y eso no se nota hasta que alguien mira cuánto
 * ocupa el bucket.
 */
export function FormularioDeTicket({
    abierto,
    onAbierto,
    userId,
    whatsappPorDefecto,
    cuentas = [],
    equipo = [],
    onCreado,
}: {
    abierto: boolean;
    onAbierto: (v: boolean) => void;
    userId: string;
    /** El número de la cuenta, para no hacer teclearlo cada vez. */
    whatsappPorDefecto?: string | null;
    /**
     * A nombre de qué otras cuentas se puede abrir. **Vacío es el caso normal**
     * —un cliente abre los suyos— y entonces el selector no se pinta y el
     * formulario queda exactamente como estaba.
     */
    cuentas?: CuentaElegible[];
    /** El equipo que atiende, para elegir responsable. Vacío, no se pinta. */
    equipo?: AdvisorInfo[];
    onCreado?: () => void;
}) {
    const [titulo, setTitulo] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [whatsapp, setWhatsapp] = useState(whatsappPorDefecto ?? "");
    const [enElAire, setEnElAire] = useState<AdjuntoEnElAire[]>([]);
    const [guardando, setGuardando] = useState(false);
    /** A nombre de qué cuenta. Nulo = a nombre de la propia. */
    const [aNombreDe, setANombreDe] = useState<string | null>(null);
    const [responsableId, setResponsableId] = useState<string>("");

    // Lo que hay en el aire, por referencia: el cierre corre desde un manejador
    // montado una vez y con el estado en las dependencias se volvería a montar
    // en cada subida.
    const aire = useRef(enElAire);
    aire.current = enElAire;

    useEffect(() => {
        if (abierto) setWhatsapp((v) => v || (whatsappPorDefecto ?? ""));
    }, [abierto, whatsappPorDefecto]);

    /** El único camino de salida. Lo que subió y no se usó se borra del bucket. */
    const cerrar = () => {
        if (guardando) return;
        const sobrantes = aire.current;
        setEnElAire([]);
        onAbierto(false);
        // Best-effort a propósito: nunca lanza y no bloquea el cierre.
        for (const a of sobrantes) void borrarDelBucket(a.url);
    };

    const enviar = async () => {
        const falta = queLeFaltaAlTicket({ titulo, descripcion, whatsapp });
        if (falta) {
            toast.error(falta);
            return;
        }

        setGuardando(true);
        try {
            const res = await abrirTicketAction({
                titulo: titulo.trim(),
                descripcion: descripcion.trim(),
                whatsapp: whatsapp.trim(),
                clienteId: aNombreDe ?? undefined,
                responsableId: responsableId || undefined,
                adjuntos: enElAire.map((a) => ({
                    url: a.url,
                    nombre: a.nombre,
                    tipo: a.tipo,
                    mimeType: a.mimeType,
                    tamanoBytes: a.tamanoBytes,
                })),
            });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            toast.success(res.message);
            // Se vacía ANTES de cerrar: si no, `cerrar()` borraría del bucket
            // unos archivos que ya cuelgan del ticket recién creado.
            setEnElAire([]);
            aire.current = [];
            setTitulo("");
            setDescripcion("");
            setANombreDe(null);
            setResponsableId("");
            onAbierto(false);
            onCreado?.();
        } catch (error) {
            // Una acción no solo devuelve `success: false`: puede reventar, y sin
            // esto el botón se queda en «Enviando…» para siempre.
            console.warn("[tickets] no se pudo abrir el ticket", error);
            toast.error("No se pudo enviar tu solicitud. Inténtalo de nuevo.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open={abierto} onOpenChange={(v) => (v ? onAbierto(true) : cerrar())}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <LifeBuoy className="h-5 w-5 text-primary" />
                        Pedir soporte
                    </DialogTitle>
                    <DialogDescription>
                        Cuéntanos qué pasa y te avisamos por WhatsApp cuando esté resuelto.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Va lo PRIMERO: de quién es el ticket cambia a quién se le
                        avisa al resolverlo, así que no puede quedar debajo del
                        todo, donde se rellena sin mirar. */}
                    {cuentas.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>¿De qué cuenta es?</Label>
                            <SelectorDeCuenta
                                cuentas={cuentas}
                                elegida={aNombreDe}
                                onElegir={setANombreDe}
                                etiquetaVacia="A nombre de mi cuenta"
                            />
                            <p className="text-xs text-muted-foreground">
                                El ticket nace como si lo hubiera abierto esa cuenta: le sale en «Mis
                                tickets» y recibe el WhatsApp al resolverse.
                            </p>
                        </div>
                    )}

                    {/* Título, texto y archivos son **los mismos** que pide la
                        ficha pública, y por eso salen de un solo componente. */}
                    <CamposDelTicket
                        titulo={titulo}
                        onTitulo={setTitulo}
                        descripcion={descripcion}
                        onDescripcion={setDescripcion}
                        userId={userId}
                        enElAire={enElAire}
                        onEnElAire={setEnElAire}
                    />

                    {equipo.length > 0 && (
                        <div className="space-y-1.5">
                            <Label htmlFor="ticket-responsable">Responsable</Label>
                            <select
                                id="ticket-responsable"
                                value={responsableId}
                                onChange={(e) => setResponsableId(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Sin asignar</option>
                                {equipo.map((persona) => (
                                    <option key={persona.id} value={persona.id}>
                                        {persona.name?.trim() || persona.email || persona.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="ticket-whatsapp">WhatsApp para avisarte</Label>
                        <Input
                            id="ticket-whatsapp"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            placeholder="Ej.: 573001234567"
                            inputMode="tel"
                        />
                        <p className="text-xs text-muted-foreground">
                            Solo te escribimos cuando el ticket quede resuelto.
                        </p>
                    </div>
                </div>

                {/*
                  `DialogFooter`, no un `flex justify-end` a mano: el de la App
                  ya reparte «Cancelar» a la izquierda y la acción a la derecha
                  (`justify-between`), que es como salen los demás diálogos
                  —«Editar pagos» de Instancias, Compartir, Carpetas—. Con los
                  dos pegados a la derecha, cancelar queda justo al lado de
                  enviar.
                */}
                <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={cerrar} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={() => void enviar()} disabled={guardando}>
                        {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {guardando ? "Enviando…" : "Enviar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
