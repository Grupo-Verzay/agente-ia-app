"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Inbox, Loader2, Plus, RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TarjetaDeTicket } from "@/components/tickets/TarjetaDeTicket";
import { DetalleDelTicket } from "@/components/tickets/DetalleDelTicket";
import { FormularioDeTicket } from "@/components/tickets/FormularioDeTicket";
import type { CuentaElegible } from "@/components/tickets/SelectorDeCuenta";
import type { AdvisorInfo } from "@/actions/team-actions";
import { CabeceraDeTickets } from "./CabeceraDeTickets";
import { TableroDeTickets } from "./TableroDeTickets";
import { MenuDeEstado } from "./MenuDeEstado";
import {
    ESTADOS_DE_TICKET,
    ETIQUETAS_DE_ESTADO,
    exigeMotivo,
    TOPE_DEL_MOTIVO,
    type EstadoDeTicket,
} from "@/lib/tickets";
import {
    asignarResponsableAction,
    moverTicketAction,
    ticketsDeSoporteAction,
    type TicketConAdjuntos,
} from "@/actions/tickets-actions";

type Vista = "tablero" | "lista";

/** Cada cuánto se recalcula «esperando hace…». Un minuto es su resolución. */
const CADA_CUANTO_SE_REFRESCA_EL_RELOJ = 60_000;

/**
 * Los tickets que le caen a la cuenta de destino, en dos vistas.
 *
 * **El tablero es la de por defecto**, y es el mismo patrón de Etiquetas: dos
 * botones en la barra, kanban primero y una segunda vista de lista para
 * gestionar. En el tablero se arrastra para cambiar de estado; en la lista se
 * usa el menú de cada fila.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El tablero los pide TODOS**, sin filtro de estado: si no, cuatro columnas
 *    saldrían vacías. Los chips de estado son de la lista y solo se pintan ahí.
 * 2. **Descartar pide el motivo antes de mover la tarjeta**, venga del arrastre
 *    o del menú. Pintarla en la columna y devolverla si se cancela el diálogo la
 *    haría saltar a la vista, y el motivo lo lee el cliente: no es opcional.
 * 3. **Resolver no pregunta nada**, porque el aviso de WhatsApp ya está
 *    protegido donde tiene que estarlo: `avisaAlCliente` solo dispara al PASAR a
 *    resuelto y el `UPDATE` va condicionado al estado anterior, así que dos
 *    administradores resolviendo a la vez mandan un aviso, no dos. Arrastrar
 *    entra por la MISMA acción que el menú — no hay un segundo camino que
 *    pudiera saltarse esa garantía.
 */
export function TicketsDeSoporteClient({
    userId,
    equipo = [],
    cuentas = [],
}: {
    /** Quien sube los archivos del formulario. Lo pide `/api/upload`. */
    userId: string;
    /** El equipo que atiende: para elegir responsable. */
    equipo?: AdvisorInfo[];
    /** A nombre de qué cuentas se puede abrir un ticket desde aquí. */
    cuentas?: CuentaElegible[];
}) {
    const [vista, setVista] = useState<Vista>("tablero");
    const [tickets, setTickets] = useState<TicketConAdjuntos[]>([]);
    const [porEstado, setPorEstado] = useState<Record<string, number>>({});
    const [filtro, setFiltro] = useState<EstadoDeTicket | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [moviendo, setMoviendo] = useState<string | null>(null);
    const [abierto, setAbierto] = useState<TicketConAdjuntos | null>(null);
    /** El ticket que se está descartando, mientras se escribe el motivo. */
    const [descartando, setDescartando] = useState<TicketConAdjuntos | null>(null);
    const [motivo, setMotivo] = useState("");
    const [creando, setCreando] = useState(false);
    /** Filtro por responsable, solo en la lista. `null` = todos. */
    const [responsable, setResponsable] = useState<string | null>(null);

    // La hora se calcula UNA vez por repintado y se reparte: leyendo `Date.now()`
    // dentro de cada tarjeta, dos tarjetas del mismo repintado pueden caer a
    // distinto lado de un minuto y decir cosas distintas del mismo momento.
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setAhora(Date.now()), CADA_CUANTO_SE_REFRESCA_EL_RELOJ);
        return () => clearInterval(id);
    }, []);

    // El tablero necesita los cinco estados; la lista respeta su filtro.
    const elFiltro = vista === "lista" ? filtro : null;

    const cargar = useCallback(
        async (silencioso = false) => {
            if (!silencioso) setCargando(true);
            setError(null);
            try {
                const res = await ticketsDeSoporteAction(elFiltro);
                if (!res.success) {
                    setError(res.message);
                    setTickets([]);
                } else {
                    setTickets(res.data?.tickets ?? []);
                    setPorEstado(res.data?.porEstado ?? {});
                }
            } catch (e) {
                // Sin esto el «Cargando…» se queda puesto para siempre.
                console.warn("[tickets] no se pudo cargar el tablero", e);
                setError("No se pudieron cargar los tickets.");
                setTickets([]);
            } finally {
                if (!silencioso) setCargando(false);
            }
        },
        [elFiltro],
    );

    useEffect(() => {
        void cargar();
    }, [cargar]);

    /** Que dos arrastres seguidos no se pisen mientras uno está en el aire. */
    const enVuelo = useRef(false);

    const mover = async (
        ticket: TicketConAdjuntos,
        estado: EstadoDeTicket,
        motivoEscrito?: string,
    ) => {
        if (enVuelo.current) return false;
        enVuelo.current = true;
        setMoviendo(ticket.id);

        const antes = ticket.estado;
        const previos = tickets;
        const contadoresPrevios = porEstado;

        // Se pinta al momento —la misma regla que borrar un chat— y si el
        // servidor dice que no, se devuelve todo tal cual estaba.
        setTickets((prev) =>
            prev.map((t) =>
                t.id === ticket.id
                    ? {
                          ...t,
                          estado,
                          motivoDescarte: exigeMotivo(estado) ? (motivoEscrito ?? "").trim() : null,
                      }
                    : t,
            ),
        );
        setPorEstado((prev) => ({
            ...prev,
            [antes]: Math.max(0, (prev[antes] ?? 0) - 1),
            [estado]: (prev[estado] ?? 0) + 1,
        }));

        try {
            const res = await moverTicketAction({ id: ticket.id, estado, motivo: motivoEscrito });
            if (!res.success) {
                setTickets(previos);
                setPorEstado(contadoresPrevios);
                toast.error(res.message);
                return false;
            }
            // El aviso se dice: así se distingue «resuelto y avisado» de
            // «resuelto y el WhatsApp no salió», que desde fuera son lo mismo.
            toast.success(res.data?.avisado ? "Resuelto. Ya le avisamos por WhatsApp." : res.message);
            // En silencio: recargar con el spinner vaciaría el tablero entero
            // por un cambio que ya está pintado.
            await cargar(true);
            return true;
        } catch (e) {
            console.warn("[tickets] no se pudo mover el ticket", e);
            setTickets(previos);
            setPorEstado(contadoresPrevios);
            toast.error("No se pudo cambiar el estado.");
            return false;
        } finally {
            enVuelo.current = false;
            setMoviendo(null);
        }
    };

    /**
     * El único camino para cambiar de estado, venga del arrastre o del menú.
     *
     * Con dos caminos bastaría con arrastrar para saltarse el motivo del
     * descarte, y un ticket descartado sin motivo no se recupera: nadie vuelve a
     * abrirlo para escribirlo.
     */
    const pedirElCambio = (ticket: TicketConAdjuntos, estado: EstadoDeTicket) => {
        if (estado === ticket.estado) return;
        if (exigeMotivo(estado)) {
            setMotivo("");
            setDescartando(ticket);
            return;
        }
        void mover(ticket, estado);
    };

    const total = Object.values(porEstado).reduce((n, v) => n + v, 0);

    /** Asignar a quién lo atiende. Se pinta al momento, como todo lo demás. */
    const asignar = async (ticket: TicketConAdjuntos, personaId: string | null) => {
        const previos = tickets;
        const nombre = equipo.find((p) => p.id === personaId);
        setTickets((prev) =>
            prev.map((t) =>
                t.id === ticket.id
                    ? {
                          ...t,
                          responsableId: personaId,
                          responsableNombre: personaId
                              ? nombre?.name?.trim() || nombre?.email || personaId
                              : null,
                      }
                    : t,
            ),
        );
        try {
            const res = await asignarResponsableAction(ticket.id, personaId);
            if (!res.success) {
                setTickets(previos);
                toast.error(res.message);
                return;
            }
            toast.success(res.message);
        } catch (e) {
            console.warn("[tickets] no se pudo asignar el responsable", e);
            setTickets(previos);
            toast.error("No se pudo asignar el responsable.");
        }
    };

    // El filtro por responsable es de la LISTA, y se aplica aquí: el servidor ya
    // trae los de esta cuenta y filtrar allí sería otra vuelta de red por un
    // desplegable que se cambia a cada rato.
    const visibles =
        vista === "lista" && responsable !== null
            ? tickets.filter((t) =>
                  responsable === "" ? !t.responsableId : t.responsableId === responsable,
              )
            : tickets;

    const nombreDelFiltro =
        responsable === null
            ? "Responsable"
            : responsable === ""
              ? "Sin asignar"
              : equipo.find((p) => p.id === responsable)?.name?.trim() ||
                equipo.find((p) => p.id === responsable)?.email ||
                "Responsable";

    return (
        // El MISMO contenedor de Etiquetas, clase por clase: sin `py-4` propio y
        // con `gap-2`. Ese padding y la fila de título eran la franja que el
        // tablero se estaba perdiendo.
        <div data-full-bleed className="flex h-full min-w-0 w-full flex-col gap-2">
            <CabeceraDeTickets
                vista={vista}
                onVista={setVista}
                filtros={
                    vista === "lista" ? (
                        <>
                            {/* Los chips son de la lista: en el tablero cada estado
                                ya tiene su columna, y filtrar por uno dejaría las
                                otras cuatro vacías sin decir por qué. Los contadores
                                salen de un `COUNT` del servidor, no del `length` de
                                lo cargado. */}
                            <div className="flex flex-wrap gap-1.5">
                                <Chip activo={filtro === null} onClick={() => setFiltro(null)} n={total}>
                                    Todos
                                </Chip>
                                {ESTADOS_DE_TICKET.map((e) => (
                                    <Chip
                                        key={e}
                                        activo={filtro === e}
                                        onClick={() => setFiltro(e)}
                                        n={porEstado[e] ?? 0}
                                    >
                                        {ETIQUETAS_DE_ESTADO[e]}
                                    </Chip>
                                ))}
                            </div>

                            {equipo.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={cn(
                                                "h-8 gap-1.5 px-2.5 text-xs",
                                                responsable !== null && "border-primary text-primary",
                                            )}
                                        >
                                            <UserRound className="h-3.5 w-3.5" />
                                            {nombreDelFiltro}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    {/* La lista crece con el equipo, así que va con
                                        su tope sobre el hueco real, no sobre la
                                        ventana. */}
                                    <DropdownMenuContent
                                        align="start"
                                        className="w-52 overflow-y-auto"
                                        style={{
                                            maxHeight:
                                                "min(70vh, var(--radix-dropdown-menu-content-available-height))",
                                        }}
                                    >
                                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                            Filtrar por responsable
                                        </DropdownMenuLabel>
                                        <DropdownMenuItem onSelect={() => setResponsable(null)}>
                                            Todos
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => setResponsable("")}>
                                            Sin asignar
                                        </DropdownMenuItem>
                                        {equipo.map((p) => (
                                            <DropdownMenuItem key={p.id} onSelect={() => setResponsable(p.id)}>
                                                {p.name?.trim() || p.email || p.id}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </>
                    ) : null
                }
                acciones={
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                            {cargando ? "Cargando…" : `${total} en total`}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void cargar()}
                            disabled={cargando}
                            className="h-9 w-9 px-0"
                            title="Actualizar"
                        >
                            <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
                        </Button>
                        {/* Registrar el ticket de alguien que escribió por
                            WhatsApp. Solo sale si hay cuentas a nombre de las que
                            se pueda abrir: un botón que al pulsarlo no tiene a
                            quién asignarle el ticket es peor que no tenerlo. */}
                        {cuentas.length > 0 && (
                            <Button size="sm" className="h-9 gap-1.5" onClick={() => setCreando(true)}>
                                <Plus className="h-4 w-4" /> Nuevo
                            </Button>
                        )}
                    </div>
                }
            />

            {cargando ? (
                <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => void cargar()}>
                        Reintentar
                    </Button>
                </div>
            ) : vista === "tablero" ? (
                <TableroDeTickets
                    tickets={tickets}
                    porEstado={porEstado}
                    moviendo={moviendo}
                    ahora={ahora}
                    onSoltar={pedirElCambio}
                    onAbrir={setAbierto}
                />
            ) : visibles.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center">
                    <Inbox className="h-7 w-7 text-muted-foreground/40" />
                    <p className="text-sm font-medium">
                        {filtro || responsable !== null ? "Ninguno con ese filtro" : "Sin tickets"}
                    </p>
                </div>
            ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {visibles.map((t) => (
                        <TarjetaDeTicket
                            key={t.id}
                            ticket={t}
                            deQuien={t.clienteNombre ?? t.clienteId}
                            ahora={ahora}
                            onAbrir={() => setAbierto(t)}
                            acciones={
                                <MenuDeEstado
                                    estado={t.estado}
                                    moviendo={moviendo === t.id}
                                    onElegir={(e) => pedirElCambio(t, e)}
                                />
                            }
                        />
                    ))}
                </div>
            )}

            <DetalleDelTicket
                ticket={abierto}
                deQuien={abierto ? (abierto.clienteNombre ?? abierto.clienteId) : null}
                ahora={ahora}
                onCerrar={() => setAbierto(null)}
                acciones={
                    abierto && (
                        <div className="space-y-2">
                            {/* Asignable también AL ABRIR, no solo al crearlo: casi
                                siempre se decide quién lo coge después de leerlo. */}
                            {equipo.length > 0 && (
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">Responsable</span>
                                    <select
                                        value={abierto.responsableId ?? ""}
                                        onChange={(e) => {
                                            const suyo = abierto;
                                            const elegido = e.target.value || null;
                                            setAbierto({
                                                ...suyo,
                                                responsableId: elegido,
                                            });
                                            void asignar(suyo, elegido);
                                        }}
                                        className="h-8 max-w-[14rem] rounded-md border border-input bg-background px-2 text-xs"
                                    >
                                        <option value="">Sin asignar</option>
                                        {equipo.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name?.trim() || p.email || p.id}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Cambiar el estado</span>
                            <MenuDeEstado
                                estado={abierto.estado}
                                moviendo={moviendo === abierto.id}
                                onElegir={(e) => {
                                    // Se cierra antes de mover: el diálogo pinta
                                    // una copia del ticket y se quedaría con el
                                    // estado viejo a la vista.
                                    const suyo = abierto;
                                    setAbierto(null);
                                    pedirElCambio(suyo, e);
                                }}
                            />
                        </div>
                        </div>
                    )
                }
            />

            {/* El mismo formulario que usa el cliente, con dos campos más: a
                nombre de qué cuenta y quién lo atiende. Uno solo, no una copia:
                los adjuntos, el tope y el cierre que limpia el bucket vienen
                puestos. */}
            <FormularioDeTicket
                abierto={creando}
                onAbierto={setCreando}
                userId={userId}
                cuentas={cuentas}
                equipo={equipo}
                onCreado={() => void cargar()}
            />

            <Dialog
                open={!!descartando}
                onOpenChange={(v) => {
                    if (!v) setDescartando(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Descartar el ticket</DialogTitle>
                        <DialogDescription>
                            Escribe por qué: el cliente lo va a leer en «Mis tickets».
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="motivo-descarte">Motivo</Label>
                        <Textarea
                            id="motivo-descarte"
                            value={motivo}
                            maxLength={TOPE_DEL_MOTIVO}
                            onChange={(e) => setMotivo(e.target.value)}
                            rows={4}
                            placeholder="Ej.: ya está resuelto en otro ticket; o no depende de la plataforma."
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDescartando(null)}>
                            Cancelar
                        </Button>
                        <Button
                            disabled={!motivo.trim() || moviendo === descartando?.id}
                            onClick={async () => {
                                if (!descartando) return;
                                const ok = await mover(descartando, "descartado", motivo.trim());
                                if (ok) setDescartando(null);
                            }}
                        >
                            {moviendo === descartando?.id && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Descartar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Chip({
    activo,
    onClick,
    n,
    children,
}: {
    activo: boolean;
    onClick: () => void;
    n: number;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                activo ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-accent",
            )}
        >
            {children}
            <span className="tabular-nums text-muted-foreground">{n}</span>
        </button>
    );
}
