"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowUp,
    Download,
    Loader2,
    MoreHorizontal,
    Paperclip,
    RefreshCw,
    Search,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarraDeAcciones } from "@/components/shared/BarraDeAcciones";
import { useAltoDeLaCaja } from "@/components/shared/BarraDeEscribir";
import { cn } from "@/lib/utils";
import {
    conLeido,
    devolverElCorreo,
    elDocumentoDelCorreo,
    elTamanoLegible,
    laAdvertenciaDeEliminar,
    sinElCorreo,
    NOMBRE_DEL_PROVEEDOR,
    type CorreoCompleto,
    type ProveedorConBoton,
    type ResumenDeCorreo,
} from "@/lib/correo";
import type { BuzonVisible } from "@/lib/correo-db";
import {
    MARCO_DE_LA_BARRA,
    FILA_DE_LA_BARRA,
    BOTON_REDONDO,
    BOTON_DE_ENVIAR,
    rellenoDeLaCaja,
} from "@/lib/barra-de-escribir";
import {
    bandejaAction,
    desconectarCorreoAction,
    eliminarCorreoAction,
    leerCorreoAction,
    misBuzonesAction,
    responderCorreoAction,
} from "@/actions/correo-actions";
import { AVISO_DEL_CORREO, ConectarCorreo } from "./ConectarCorreo";

/** El último buzón abierto, en ESTE navegador. Cada acceso va en su `try`. */
const LLAVE_DEL_ULTIMO = "correo:ultimo-buzon";
function leerUltimo(): string | null {
    try {
        return window.localStorage.getItem(LLAVE_DEL_ULTIMO);
    } catch {
        return null;
    }
}
function guardarUltimo(id: string) {
    try {
        window.localStorage.setItem(LLAVE_DEL_ULTIMO, id);
    } catch {
        /* ventana privada: se abre el primero, y ya. */
    }
}

function laFechaCorta(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const hoy = new Date();
    return d.toDateString() === hoy.toDateString()
        ? d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function CorreoClient({ conectado, error }: { conectado: string | null; error: string | null }) {
    const [cargando, setCargando] = useState(true);
    const [buzones, setBuzones] = useState<BuzonVisible[]>([]);
    const [conBoton, setConBoton] = useState<Record<ProveedorConBoton, boolean>>({ gmail: false, outlook: false });
    const [buzonId, setBuzonId] = useState<string | null>(null);
    const [conectarAbierto, setConectarAbierto] = useState(false);
    const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);

    // Por qué NO se conectó, cuando la vuelta de Google o Microsoft trae un
    // error. Se queda PUESTO encima de los botones de conectar hasta que se
    // cierra o se vuelve a intentar: un aviso que se va solo en unos segundos
    // es un aviso que no se lee, y entonces la vuelta parece no haber hecho
    // nada — que es justo como se reportó.
    const [aviso, setAviso] = useState<string | null>(error);

    // El aviso de la vuelta, una vez, y se limpia la URL para que recargar no
    // lo repita (el de error sigue en `aviso`, que no depende de la URL).
    useEffect(() => {
        if (conectado) toast.success(`Correo conectado: ${conectado}`);
        if (conectado || error) window.history.replaceState(null, "", "/correo");
    }, [conectado, error]);

    const cargarBuzones = useCallback(async (preferido?: string | null) => {
        try {
            const r = await misBuzonesAction();
            if (!r.success) {
                setFalloDeCarga(r.message);
                return;
            }
            setFalloDeCarga(null);
            setBuzones(r.buzones);
            setConBoton(r.conBoton);
            const quiero = preferido ?? leerUltimo();
            const elegido = r.buzones.find((b) => b.id === quiero) ?? r.buzones[0] ?? null;
            setBuzonId(elegido?.id ?? null);
            // Con otro buzón ya conectado, el aviso sale en el diálogo de
            // «Conectar otro correo», que es donde están los mismos botones.
            if (elegido && error) setConectarAbierto(true);
        } catch {
            setFalloDeCarga("No se pudo cargar el correo. Revisa la conexión.");
        } finally {
            setCargando(false);
        }
    }, [error]);

    useEffect(() => {
        void cargarBuzones();
    }, [cargarBuzones]);

    const buzon = buzones.find((b) => b.id === buzonId) ?? null;

    if (cargando) {
        return (
            <div className="flex h-full items-center justify-center p-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    if (falloDeCarga) {
        return <div className="p-6 text-sm text-destructive">{falloDeCarga}</div>;
    }

    if (!buzon) {
        return (
            <div data-correo-vacio className="flex h-full flex-col items-center justify-center gap-4 p-6">
                <div className="text-center">
                    <h2 className="text-lg font-semibold">Conecta tu correo</h2>
                    <p className="text-sm text-muted-foreground">Lee y responde tu bandeja de entrada sin salir de la plataforma.</p>
                </div>
                <ConectarCorreo
                    conBoton={conBoton}
                    aviso={aviso}
                    alCerrarAviso={() => setAviso(null)}
                    alConectar={(b) => {
                        setAviso(null);
                        guardarUltimo(b.id);
                        void cargarBuzones(b.id);
                    }}
                />
            </div>
        );
    }

    return (
        <>
            <Bandeja
                key={buzon.id}
                buzon={buzon}
                buzones={buzones}
                alElegir={(id) => {
                    guardarUltimo(id);
                    setBuzonId(id);
                }}
                alConectarOtro={() => setConectarAbierto(true)}
                alDesconectar={async () => {
                    const r = await desconectarCorreoAction(buzon.id);
                    if (!r.success) {
                        toast.error(r.message);
                        return;
                    }
                    toast.success("Correo desconectado.");
                    await cargarBuzones(null);
                }}
            />
            <Dialog open={conectarAbierto} onOpenChange={setConectarAbierto}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Conectar otro correo</DialogTitle>
                        <DialogDescription>Solo tú verás los correos que conectes aquí.</DialogDescription>
                    </DialogHeader>
                    <ConectarCorreo
                        conBoton={conBoton}
                        aviso={aviso}
                        alCerrarAviso={() => setAviso(null)}
                        alConectar={(b) => {
                            setAviso(null);
                            setConectarAbierto(false);
                            guardarUltimo(b.id);
                            void cargarBuzones(b.id);
                        }}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}

function Bandeja({
    buzon,
    buzones,
    alElegir,
    alConectarOtro,
    alDesconectar,
}: {
    buzon: BuzonVisible;
    buzones: BuzonVisible[];
    alElegir: (id: string) => void;
    alConectarOtro: () => void;
    alDesconectar: () => Promise<void>;
}) {
    const [correos, setCorreos] = useState<ResumenDeCorreo[]>([]);
    const [siguiente, setSiguiente] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [masCargando, setMasCargando] = useState(false);
    const [aviso, setAviso] = useState<{ texto: string; reconectar: boolean } | null>(
        buzon.estado === "reconectar" ? { texto: buzon.ultimoError || "Vuelve a conectar este correo.", reconectar: true } : null,
    );
    const [busqueda, setBusqueda] = useState("");
    const [soloSinLeer, setSoloSinLeer] = useState(false);
    const [abierto, setAbierto] = useState<string | null>(null);
    // Si estaba sin leer AL ABRIRLO: se pinta leído al momento, y la acción
    // solo pide marcar cuando hace falta.
    const [abiertoSinLeer, setAbiertoSinLeer] = useState(false);
    const [aEliminar, setAEliminar] = useState<ResumenDeCorreo | null>(null);
    const vuelta = useRef(0);

    function abrir(c: ResumenDeCorreo) {
        setAbiertoSinLeer(c.sinLeer);
        setAbierto(c.id);
        // Se pinta leído YA; si el proveedor dice que no, `alMarcar` lo devuelve.
        if (c.sinLeer) setCorreos((antes) => conLeido(antes, c.id));
    }

    const alMarcar = useCallback(
        (id: string, r: { leido: boolean; motivo: string | null; reconectar: boolean }) => {
            if (r.leido) return;
            setCorreos((antes) => conLeido(antes, id, true));
            if (r.motivo) setAviso({ texto: r.motivo, reconectar: r.reconectar });
        },
        [],
    );

    /**
     * Eliminar: la fila se quita y la lectura se cierra ANTES de preguntar al
     * proveedor —como al eliminar un chat—, y si dice que no, el correo vuelve
     * a SU sitio con su motivo. Un solo camino para la fila y para la lectura.
     */
    async function eliminar(c: ResumenDeCorreo) {
        const quitado = sinElCorreo(correos, c.id);
        setCorreos(quitado.lista);
        if (abierto === c.id) setAbierto(null);
        const devolver = () =>
            setCorreos((antes) => devolverElCorreo(antes, quitado.quitado ?? c, Math.max(0, quitado.posicion)));
        try {
            const r = await eliminarCorreoAction(buzon.id, c.id);
            if (!r.success) {
                devolver();
                toast.error(r.message);
                if (r.reconectar) setAviso({ texto: r.message, reconectar: true });
                return;
            }
            toast.success(r.aLaPapelera ? "Correo movido a la papelera." : "Correo eliminado (tu servidor no tiene papelera).");
        } catch {
            devolver();
            toast.error("No se pudo eliminar. Revisa la conexión.");
        }
    }

    const traer = useCallback(
        async (cursor: string | null) => {
            const esta = ++vuelta.current;
            if (cursor) setMasCargando(true);
            else setCargando(true);
            try {
                const r = await bandejaAction(buzon.id, cursor);
                // Una respuesta vieja no pinta encima de la de ahora.
                if (esta !== vuelta.current) return;
                if (!r.success) {
                    setAviso({ texto: r.message, reconectar: Boolean(r.reconectar) });
                    return;
                }
                setAviso(null);
                setCorreos((antes) => (cursor ? [...antes, ...r.correos.filter((c) => !antes.some((a) => a.id === c.id))] : r.correos));
                setSiguiente(r.siguiente);
            } catch {
                if (esta === vuelta.current) setAviso({ texto: "No se pudo leer la bandeja. Revisa la conexión.", reconectar: false });
            } finally {
                if (esta === vuelta.current) {
                    setCargando(false);
                    setMasCargando(false);
                }
            }
        },
        [buzon.id],
    );

    useEffect(() => {
        void traer(null);
    }, [traer]);

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return correos.filter(
            (c) =>
                (!soloSinLeer || c.sinLeer) &&
                (!q || `${c.de} ${c.deDireccion} ${c.asunto} ${c.fragmento}`.toLowerCase().includes(q)),
        );
    }, [correos, busqueda, soloSinLeer]);
    const sinLeer = correos.filter((c) => c.sinLeer).length;

    return (
        <div data-correo className="flex h-full min-h-0 flex-col gap-2">
            <BarraDeAcciones
                buscador={
                    <div className="relative w-56 sm:w-72">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar en lo cargado"
                            className="pl-8"
                            aria-label="Buscar correo"
                        />
                    </div>
                }
                filtros={
                    <>
                        {buzones.length > 1 ? (
                            <select
                                aria-label="Buzón"
                                value={buzon.id}
                                onChange={(e) => alElegir(e.target.value)}
                                className="h-9 max-w-[16rem] truncate rounded-md border border-input bg-background px-2 text-sm"
                            >
                                {buzones.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.direccion} · {NOMBRE_DEL_PROVEEDOR[b.proveedor]}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <span className="truncate text-sm text-muted-foreground" title={buzon.direccion}>
                                {buzon.direccion} · {NOMBRE_DEL_PROVEEDOR[buzon.proveedor]}
                            </span>
                        )}
                        <Button
                            size="sm"
                            variant={soloSinLeer ? "default" : "outline"}
                            className="h-8 rounded-full"
                            onClick={() => setSoloSinLeer((v) => !v)}
                        >
                            Sin leer {sinLeer ? `(${sinLeer})` : ""}
                        </Button>
                    </>
                }
                secundarias={
                    <Button variant="outline" size="icon" aria-label="Actualizar" title="Actualizar" onClick={() => void traer(null)} disabled={cargando}>
                        <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
                    </Button>
                }
                acciones={
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Más acciones">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={alConectarOtro}>Conectar otro correo</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onSelect={() => void alDesconectar()}>
                                Desconectar {buzon.direccion}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
            />

            {aviso ? (
                <div data-aviso-correo className={AVISO_DEL_CORREO}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">{aviso.texto}</div>
                    {aviso.reconectar && buzon.proveedor !== "imap" ? (
                        <Button size="sm" variant="outline" onClick={() => (window.location.href = `/api/correo/conectar/${buzon.proveedor}`)}>
                            Volver a conectar
                        </Button>
                    ) : aviso.reconectar ? (
                        <Button size="sm" variant="outline" onClick={alConectarOtro}>
                            Volver a conectar
                        </Button>
                    ) : null}
                </div>
            ) : null}

            <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border">
                <div
                    data-lista-de-correos
                    className={cn(
                        "flex min-h-0 w-full flex-col border-border md:w-[var(--ancho-lateral)] md:shrink-0 md:border-r",
                        abierto && "hidden md:flex",
                    )}
                >
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {cargando ? (
                            <div className="flex justify-center p-6 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        ) : visibles.length === 0 ? (
                            <p className="p-6 text-center text-sm text-muted-foreground">
                                {correos.length ? "Ningún correo coincide." : "La bandeja está vacía."}
                            </p>
                        ) : (
                            visibles.map((c) => (
                                // La fila es un grupo: abrir y eliminar son dos
                                // botones HERMANOS (un botón no va dentro de otro).
                                <div key={c.id} data-correo-fila={c.id} className="group relative border-b border-border">
                                    <button
                                        type="button"
                                        onClick={() => abrir(c)}
                                        className={cn(
                                            "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted",
                                            abierto === c.id && "bg-muted",
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            {c.sinLeer ? <span data-sin-leer className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" /> : null}
                                            <span className={cn("min-w-0 flex-1 truncate text-sm", c.sinLeer && "font-semibold")} title={c.deDireccion}>
                                                {c.de || c.deDireccion || "(sin remitente)"}
                                            </span>
                                            {c.conAdjuntos ? <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Con adjuntos" /> : null}
                                            <span className="shrink-0 text-xs text-muted-foreground">{laFechaCorta(c.fecha)}</span>
                                        </div>
                                        <span className={cn("truncate text-sm", c.sinLeer ? "text-foreground" : "text-muted-foreground")}>
                                            {c.asunto || "(sin asunto)"}
                                        </span>
                                        {c.fragmento ? <span className="truncate text-xs text-muted-foreground">{c.fragmento}</span> : null}
                                    </button>
                                    {/* Sale al pasar el ratón o con el foco; en un teléfono se elimina desde la lectura. */}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Eliminar correo"
                                        title="Eliminar"
                                        onClick={() => setAEliminar(c)}
                                        className="absolute right-2 top-1.5 h-7 w-7 bg-muted opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                        {siguiente && !cargando ? (
                            <div className="p-3">
                                <Button variant="outline" className="w-full" disabled={masCargando} onClick={() => void traer(siguiente)}>
                                    {masCargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Cargar más
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className={cn("min-h-0 min-w-0 flex-1", !abierto && "hidden md:flex")}>
                    {abierto ? (
                        <Lectura
                            key={abierto}
                            buzonId={buzon.id}
                            correoId={abierto}
                            estabaSinLeer={abiertoSinLeer}
                            alVolver={() => setAbierto(null)}
                            alMarcar={alMarcar}
                            alEliminar={() => {
                                const c = correos.find((x) => x.id === abierto);
                                if (c) setAEliminar(c);
                            }}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
                            Elige un correo para leerlo.
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog open={Boolean(aEliminar)} onOpenChange={(v) => !v && setAEliminar(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar este correo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {aEliminar?.asunto ? `«${aEliminar.asunto}». ` : ""}
                            {laAdvertenciaDeEliminar(buzon.proveedor)}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            data-confirmar-eliminar
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                const c = aEliminar;
                                setAEliminar(null);
                                if (c) void eliminar(c);
                            }}
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function Lectura({
    buzonId,
    correoId,
    estabaSinLeer,
    alVolver,
    alMarcar,
    alEliminar,
}: {
    buzonId: string;
    correoId: string;
    estabaSinLeer: boolean;
    alVolver: () => void;
    alMarcar: (id: string, r: { leido: boolean; motivo: string | null; reconectar: boolean }) => void;
    alEliminar: () => void;
}) {
    const [correo, setCorreo] = useState<CorreoCompleto | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    // La caja crece con el texto hasta su tope EN LÍNEAS, con el mismo gancho
    // que Chats y el chat de equipo: es la misma barra de escribir.
    const caja = useRef<HTMLTextAreaElement>(null);
    useAltoDeLaCaja({ ref: caja, texto, reiniciarCon: correoId });

    useEffect(() => {
        let vivo = true;
        // La marca sale del estado de la fila AL ABRIRLA, no de cada repintado:
        // se lee una vez, con el valor de ese momento.
        leerCorreoAction(buzonId, correoId, estabaSinLeer)
            .then((r) => {
                if (r.success) {
                    // La marca de leído se aplica aunque ya se haya cambiado de
                    // correo: es del buzón, no de esta lectura.
                    alMarcar(correoId, { leido: r.leido, motivo: r.motivoSinMarcar, reconectar: r.reconectar });
                    if (vivo) setCorreo(r.correo);
                } else {
                    if (estabaSinLeer) alMarcar(correoId, { leido: false, motivo: null, reconectar: false });
                    if (vivo) setFallo(r.message);
                }
            })
            .catch(() => {
                if (estabaSinLeer) alMarcar(correoId, { leido: false, motivo: null, reconectar: false });
                if (vivo) setFallo("No se pudo abrir el correo. Revisa la conexión.");
            });
        return () => {
            vivo = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buzonId, correoId]);

    const documento = useMemo(() => (correo ? elDocumentoDelCorreo(correo) : ""), [correo]);

    async function responder() {
        if (!texto.trim() || enviando) return;
        setEnviando(true);
        try {
            const r = await responderCorreoAction(buzonId, correoId, texto);
            if (!r.success) {
                toast.error(r.message);
                return;
            }
            toast.success("Respuesta enviada.");
            setTexto("");
        } catch {
            toast.error("No se pudo enviar. Revisa la conexión.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div data-lectura-de-correo className="flex h-full min-h-0 w-full flex-col">
            <div className="flex shrink-0 items-start gap-2 border-b border-border p-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 md:hidden" aria-label="Volver" onClick={alVolver}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                {correo ? (
                    <div className="min-w-0 flex-1">
                        <h2 className="break-words text-base font-semibold">{correo.asunto || "(sin asunto)"}</h2>
                        <p className="truncate text-sm" title={correo.deDireccion}>
                            {correo.de} {correo.deDireccion && correo.deDireccion !== correo.de ? <span className="text-muted-foreground">&lt;{correo.deDireccion}&gt;</span> : null}
                        </p>
                        {correo.para ? <p className="truncate text-xs text-muted-foreground">Para: {correo.para}</p> : null}
                        {correo.cc ? <p className="truncate text-xs text-muted-foreground">Cc: {correo.cc}</p> : null}
                        {correo.fecha ? <p className="text-xs text-muted-foreground">{new Date(correo.fecha).toLocaleString("es")}</p> : null}
                    </div>
                ) : (
                    <div className="flex-1 text-sm text-muted-foreground">{fallo ?? "Abriendo…"}</div>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 hover:text-destructive"
                    aria-label="Eliminar este correo"
                    title="Eliminar"
                    onClick={alEliminar}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            {correo?.adjuntos.length ? (
                <div data-adjuntos-del-correo className="flex shrink-0 flex-wrap gap-2 border-b border-border p-3">
                    {correo.adjuntos.map((a) => (
                        <a
                            key={a.id}
                            href={`/api/correo/adjunto?buzon=${encodeURIComponent(buzonId)}&correo=${encodeURIComponent(correoId)}&adjunto=${encodeURIComponent(a.id)}`}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                            title={a.nombre}
                        >
                            <Download className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[14rem] truncate">{a.nombre}</span>
                            {a.tamano ? <span className="shrink-0 text-muted-foreground">{elTamanoLegible(a.tamano)}</span> : null}
                        </a>
                    ))}
                </div>
            ) : null}
            <div className="min-h-0 flex-1">
                {correo ? (
                    // Dos cerrojos: el `sandbox` sin `allow-scripts` y la CSP de
                    // dentro del documento. Un correo no ejecuta nada aquí.
                    <iframe
                        data-cuerpo-del-correo
                        title="Contenido del correo"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        srcDoc={documento}
                        className="h-full w-full border-0 bg-white"
                    />
                ) : fallo ? null : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                )}
            </div>
            {correo ? (
                <div className={MARCO_DE_LA_BARRA}>
                    <div className={FILA_DE_LA_BARRA}>
                        <Textarea
                            ref={caja}
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            placeholder={`Responder a ${correo.de || correo.deDireccion}`}
                            aria-label="Respuesta"
                            className={cn("min-h-10 w-full resize-none overflow-y-auto", rellenoDeLaCaja(1))}
                            rows={1}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    void responder();
                                }
                            }}
                        />
                        <Button
                            type="button"
                            size="icon"
                            aria-label="Enviar respuesta"
                            title="Enviar respuesta (Ctrl+Enter)"
                            disabled={!texto.trim() || enviando}
                            onClick={() => void responder()}
                            className={cn(BOTON_REDONDO, BOTON_DE_ENVIAR, "absolute bottom-1.5 right-1.5 text-white")}
                        >
                            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
