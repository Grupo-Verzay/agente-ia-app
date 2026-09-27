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
import { PastillaDeFiltro, TONO_LEIDOS, TONO_SIN_LEER, TONO_TODOS, type TonoDePastilla } from "@/components/shared/PastillaDeFiltro";
import { SelectorDeCanal } from "@/components/shared/SelectorDeCanal";
import { MARCA_DE_LA_CABECERA_DE_LA_COLUMNA, MARCA_DE_LA_COLUMNA } from "@/hooks/usePanelFlotante";
import { InsigniaDeLinea } from "@/components/shared/InsigniaDeLinea";
import { useAltoDeLaCaja } from "@/components/shared/BarraDeEscribir";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
    BANDEJA_UNIFICADA,
    FILTROS_DE_LEIDO,
    NOMBRE_DEL_FILTRO,
    conLeido,
    devolverElCorreo,
    laBandejaUnificada,
    laLlaveDelCorreo,
    laPalabraDelBuzon,
    losNumerosDelFiltro,
    pasaElFiltroDeLeido,
    type CorreoDeLaBandeja,
    type FiltroDeLeido,
    type LoCargadoDeUnBuzon,
    elDocumentoDelCorreo,
    elTamanoLegible,
    laAdvertenciaDeEliminar,
    sinElCorreo,
    NOMBRE_DEL_PROVEEDOR,
    type CorreoCompleto,
    type ProveedorConBoton,
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
    bandejaUnificadaAction,
    desconectarCorreoAction,
    eliminarCorreoAction,
    leerCorreoAction,
    misBuzonesAction,
    responderCorreoAction,
} from "@/actions/correo-actions";
import { AVISO_DEL_CORREO, ConectarCorreo } from "./ConectarCorreo";

/**
 * Lo último que se miró en ESTE navegador: el id de un buzón o
 * `BANDEJA_UNIFICADA`. Llave nueva a propósito (la vieja guardaba solo un
 * buzón): con ella, quien ya tenía varios correos conectados abre la bandeja
 * unificada la primera vez en vez de quedarse en el último buzón suelto.
 * Cada acceso va en su `try`.
 */
const LLAVE_DE_LA_VISTA = "correo:vista";
function leerVista(): string | null {
    try {
        return window.localStorage.getItem(LLAVE_DE_LA_VISTA);
    } catch {
        return null;
    }
}
function guardarVista(id: string) {
    try {
        window.localStorage.setItem(LLAVE_DE_LA_VISTA, id);
    } catch {
        /* ventana privada: se abre la de por defecto, y ya. */
    }
}

/**
 * Qué se abre: lo pedido si existe; si no, lo recordado; y si no, con varios
 * buzones la bandeja UNIFICADA —que es para lo que existe— y con uno, ese.
 * Con un solo buzón la unificada no se ofrece: sería el mismo buzón dos veces.
 */
function laVistaDeEntrada(buzones: BuzonVisible[], quiero: string | null): string | null {
    if (!buzones.length) return null;
    const hayVarios = buzones.length > 1;
    if (quiero === BANDEJA_UNIFICADA) return hayVarios ? BANDEJA_UNIFICADA : buzones[0].id;
    if (quiero && buzones.some((b) => b.id === quiero)) return quiero;
    return hayVarios ? BANDEJA_UNIFICADA : buzones[0].id;
}

/**
 * El color de cada pastilla del filtro. «Todos» y «Sin leer» son LOS de Chats
 * —el mismo azul, el mismo naranja—: el mismo filtro no puede cambiar de color
 * al pasar de un canal a otro. «Leídos» no existe en Chats y va en verde.
 */
const TONO_DEL_FILTRO: Record<FiltroDeLeido, TonoDePastilla> = {
    todos: TONO_TODOS,
    sinLeer: TONO_SIN_LEER,
    leidos: TONO_LEIDOS,
};

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
    const [vista, setVista] = useState<string | null>(null);
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
            const elegida = laVistaDeEntrada(r.buzones, preferido ?? leerVista());
            setVista(elegida);
            // Con otro buzón ya conectado, el aviso sale en el diálogo de
            // «Conectar otro correo», que es donde están los mismos botones.
            if (elegida && error) setConectarAbierto(true);
        } catch {
            setFalloDeCarga("No se pudo cargar el correo. Revisa la conexión.");
        } finally {
            setCargando(false);
        }
    }, [error]);

    useEffect(() => {
        void cargarBuzones();
    }, [cargarBuzones]);

    const hayVista = vista !== null && (vista === BANDEJA_UNIFICADA || buzones.some((b) => b.id === vista));

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

    if (!hayVista) {
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
                        guardarVista(b.id);
                        void cargarBuzones(b.id);
                    }}
                />
            </div>
        );
    }

    return (
        <>
            <Bandeja
                key={vista!}
                vista={vista!}
                buzones={buzones}
                alElegir={(id) => {
                    guardarVista(id);
                    setVista(id);
                }}
                alConectarOtro={() => setConectarAbierto(true)}
                alDesconectar={async (id) => {
                    const r = await desconectarCorreoAction(id);
                    if (!r.success) {
                        toast.error(r.message);
                        return;
                    }
                    toast.success("Correo desconectado.");
                    await cargarBuzones(vista === id ? null : vista);
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
                            guardarVista(b.id);
                            void cargarBuzones(b.id);
                        }}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}

type AvisoDelBuzon = { texto: string; reconectar: boolean };

function Bandeja({
    vista,
    buzones,
    alElegir,
    alConectarOtro,
    alDesconectar,
}: {
    /** El id de un buzón, o `BANDEJA_UNIFICADA`. */
    vista: string;
    buzones: BuzonVisible[];
    alElegir: (id: string) => void;
    alConectarOtro: () => void;
    alDesconectar: (buzonId: string) => Promise<void>;
}) {
    const unificada = vista === BANDEJA_UNIFICADA;
    const enElTelefono = useIsMobile();
    // Los buzones que se miran: todos en la unificada, uno en la de un buzón.
    // Las dos vistas son LA MISMA pantalla con otra lista dentro: la misma
    // fila, el mismo filtro, la misma lectura y la misma confirmación.
    const deLaVista = useMemo(() => (unificada ? buzones : buzones.filter((b) => b.id === vista)), [unificada, buzones, vista]);
    const porId = useMemo(() => new Map(buzones.map((b) => [b.id, b])), [buzones]);
    const direcciones = useMemo(() => buzones.map((b) => b.direccion), [buzones]);

    // Lo cargado, POR BUZÓN: la lista que se ve sale de mezclarlo
    // (`laBandejaUnificada`), y con eso cargar más no desordena lo que hay.
    const [porBuzon, setPorBuzon] = useState<Record<string, LoCargadoDeUnBuzon>>({});
    const [cargando, setCargando] = useState(true);
    const [masCargando, setMasCargando] = useState(false);
    const [avisos, setAvisos] = useState<Record<string, AvisoDelBuzon>>(() =>
        Object.fromEntries(
            deLaVista
                .filter((b) => b.estado === "reconectar")
                .map((b) => [b.id, { texto: b.ultimoError || "Vuelve a conectar este correo.", reconectar: true }]),
        ),
    );
    const [busqueda, setBusqueda] = useState("");
    const [filtro, setFiltro] = useState<FiltroDeLeido>("todos");
    const [abierto, setAbierto] = useState<{ llave: string; buzonId: string; id: string } | null>(null);
    // Si estaba sin leer AL ABRIRLO: se pinta leído al momento, y la acción
    // solo pide marcar cuando hace falta.
    const [abiertoSinLeer, setAbiertoSinLeer] = useState(false);
    const [aEliminar, setAEliminar] = useState<CorreoDeLaBandeja | null>(null);
    const vuelta = useRef(0);

    const ponerAviso = useCallback((buzonId: string, aviso: AvisoDelBuzon | null) => {
        setAvisos((antes) => {
            if (!aviso) {
                if (!(buzonId in antes)) return antes;
                const { [buzonId]: _quitado, ...resto } = antes;
                return resto;
            }
            return { ...antes, [buzonId]: aviso };
        });
    }, []);

    /** Cambiar la lista de UN buzón: la fila vive en el cubo de su buzón. */
    const cambiarEn = useCallback((buzonId: string, cambio: (correos: CorreoDeLaBandeja[]) => CorreoDeLaBandeja[]) => {
        setPorBuzon((antes) => {
            const cargado = antes[buzonId] ?? { correos: [], siguiente: null };
            return { ...antes, [buzonId]: { ...cargado, correos: cambio(cargado.correos) } };
        });
    }, []);

    function abrir(c: CorreoDeLaBandeja) {
        const llave = laLlaveDelCorreo(c);
        setAbiertoSinLeer(c.sinLeer);
        setAbierto({ llave, buzonId: c.buzonId, id: c.id });
        // Se pinta leído YA; si el proveedor dice que no, `alMarcar` lo devuelve.
        if (c.sinLeer) cambiarEn(c.buzonId, (l) => conLeido(l, llave));
    }

    const alMarcar = useCallback(
        (buzonId: string, id: string, r: { leido: boolean; motivo: string | null; reconectar: boolean }) => {
            if (r.leido) return;
            cambiarEn(buzonId, (l) => conLeido(l, laLlaveDelCorreo({ id, buzonId }), true));
            if (r.motivo) ponerAviso(buzonId, { texto: r.motivo, reconectar: r.reconectar });
        },
        [cambiarEn, ponerAviso],
    );

    /**
     * Eliminar: la fila se quita y la lectura se cierra ANTES de preguntar al
     * proveedor —como al eliminar un chat—, y si dice que no, el correo vuelve
     * a SU sitio con su motivo. Un solo camino para la fila y para la lectura,
     * y siempre en el buzón DEL correo, no en el que se esté mirando.
     */
    async function eliminar(c: CorreoDeLaBandeja) {
        const llave = laLlaveDelCorreo(c);
        const quitado = sinElCorreo(porBuzon[c.buzonId]?.correos ?? [], llave);
        cambiarEn(c.buzonId, (l) => sinElCorreo(l, llave).lista);
        if (abierto?.llave === llave) setAbierto(null);
        const devolver = () =>
            cambiarEn(c.buzonId, (l) => devolverElCorreo(l, quitado.quitado ?? c, Math.max(0, quitado.posicion)));
        try {
            const r = await eliminarCorreoAction(c.buzonId, c.id);
            if (!r.success) {
                devolver();
                toast.error(r.message);
                if (r.reconectar) ponerAviso(c.buzonId, { texto: r.message, reconectar: true });
                return;
            }
            toast.success(r.aLaPapelera ? "Correo movido a la papelera." : "Correo eliminado (tu servidor no tiene papelera).");
        } catch {
            devolver();
            toast.error("No se pudo eliminar. Revisa la conexión.");
        }
    }

    /**
     * Traer: la primera página (`mas: false`) o la siguiente de cada buzón que
     * la tenga. En la de un buzón va por `bandejaAction`; en la unificada, por
     * `bandejaUnificadaAction`, que pide todos a la vez y dice de cada uno si
     * llegó o por qué no — un buzón que falla no deja vacía la bandeja.
     */
    const traer = useCallback(
        async (mas: boolean, cargadoAhora: Record<string, LoCargadoDeUnBuzon>) => {
            const esta = ++vuelta.current;
            if (mas) setMasCargando(true);
            else setCargando(true);
            const aplicar = (buzonId: string, correos: CorreoDeLaBandeja[], siguiente: string | null) =>
                setPorBuzon((antes) => {
                    const previos = mas ? antes[buzonId]?.correos ?? [] : [];
                    const vistos = new Set(previos.map(laLlaveDelCorreo));
                    return {
                        ...antes,
                        [buzonId]: { correos: [...previos, ...correos.filter((c) => !vistos.has(laLlaveDelCorreo(c)))], siguiente },
                    };
                });
            try {
                if (!unificada) {
                    const id = deLaVista[0]?.id;
                    if (!id) return;
                    const cursor = mas ? cargadoAhora[id]?.siguiente ?? null : null;
                    const r = await bandejaAction(id, cursor);
                    // Una respuesta vieja no pinta encima de la de ahora.
                    if (esta !== vuelta.current) return;
                    if (!r.success) {
                        ponerAviso(id, { texto: r.message, reconectar: Boolean(r.reconectar) });
                        return;
                    }
                    ponerAviso(id, null);
                    aplicar(id, r.correos.map((c) => ({ ...c, buzonId: id })), r.siguiente);
                    return;
                }
                const cursores = mas
                    ? Object.fromEntries(
                          Object.entries(cargadoAhora)
                              .filter(([, c]) => c.siguiente)
                              .map(([id, c]) => [id, c.siguiente as string]),
                      )
                    : undefined;
                const r = await bandejaUnificadaAction(cursores);
                if (esta !== vuelta.current) return;
                if (!r.success) {
                    for (const b of deLaVista) ponerAviso(b.id, { texto: r.message, reconectar: Boolean(r.reconectar) });
                    return;
                }
                for (const b of r.porBuzon) {
                    if (b.ok) {
                        ponerAviso(b.buzonId, null);
                        aplicar(b.buzonId, b.correos, b.siguiente);
                    } else {
                        ponerAviso(b.buzonId, { texto: b.message, reconectar: b.reconectar });
                        // Sin página siguiente: un buzón que falló no puede
                        // dejar la lista esperándolo en el horizonte.
                        if (!mas) aplicar(b.buzonId, [], null);
                        else setPorBuzon((antes) => ({ ...antes, [b.buzonId]: { ...(antes[b.buzonId] ?? { correos: [] }), siguiente: null } }));
                    }
                }
            } catch {
                if (esta === vuelta.current) {
                    for (const b of deLaVista) ponerAviso(b.id, { texto: "No se pudo leer la bandeja. Revisa la conexión.", reconectar: false });
                }
            } finally {
                if (esta === vuelta.current) {
                    setCargando(false);
                    setMasCargando(false);
                }
            }
        },
        [unificada, deLaVista, ponerAviso],
    );

    useEffect(() => {
        void traer(false, {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vista]);

    const { visibles: correos, hayMas } = useMemo(() => laBandejaUnificada(porBuzon), [porBuzon]);
    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return correos.filter(
            (c) =>
                pasaElFiltroDeLeido(c, filtro) &&
                (!q || `${c.de} ${c.deDireccion} ${c.asunto} ${c.fragmento}`.toLowerCase().includes(q)),
        );
    }, [correos, busqueda, filtro]);
    const buzonDeLaVista = unificada ? null : deLaVista[0] ?? null;
    const avisosVisibles = deLaVista.filter((b) => avisos[b.id]).map((b) => ({ buzon: b, aviso: avisos[b.id] }));
    const buzonAEliminar = aEliminar ? porId.get(aEliminar.buzonId) ?? null : null;

    // El buzón y el filtro, con las MISMAS piezas que Chats: el selector de
    // canales («Todos ▾» → aquí «Todas ▾») y sus pastillas con contador. No
    // parecidas: los mismos componentes, que viven en `components/shared/`.
    //
    // El selector va delante del buscador, como en Chats. Las pastillas, en
    // computador, en el carril de la barra; en el teléfono ese carril se queda
    // en unos 46 px —el buscador, actualizar y el «⋯» se comen el resto—, así
    // que bajan a una segunda fila, como el marcador de Llamadas. Se pintan
    // UNA vez, en un sitio o en otro: dos copias serían dos filtros.
    const numeros = losNumerosDelFiltro(correos, hayMas);
    const selector =
        buzones.length > 1 ? (
            <SelectorDeCanal
                titulo="Bandejas"
                ariaLabel="Buzón"
                // Sin número en ninguna fila: el proveedor no dice cuántos
                // correos hay, y un largo de lo cargado no es un total.
                todos={{ etiqueta: "Todas" }}
                opciones={buzones.map((b) => ({ valor: b.id, etiqueta: b.direccion, detalle: NOMBRE_DEL_PROVEEDOR[b.proveedor] }))}
                valor={unificada ? null : vista}
                alCambiar={(v) => alElegir(v ?? BANDEJA_UNIFICADA)}
            />
        ) : buzonDeLaVista ? (
            <span className="max-w-[10rem] shrink truncate text-sm text-muted-foreground" title={buzonDeLaVista.direccion}>
                {buzonDeLaVista.direccion} · {NOMBRE_DEL_PROVEEDOR[buzonDeLaVista.proveedor]}
            </span>
        ) : null;
    const pastillas = (
        <div data-pastillas-de-correo className="flex items-center gap-1">
            {FILTROS_DE_LEIDO.map((f) => (
                <PastillaDeFiltro
                    key={f}
                    valor={f}
                    rotulo={NOMBRE_DEL_FILTRO[f]}
                    activa={filtro === f}
                    alPulsar={() => setFiltro(f)}
                    tono={TONO_DEL_FILTRO[f]}
                    cuenta={numeros[f]}
                    tabular
                />
            ))}
        </div>
    );

    return (
        // `MARCA_DE_LA_COLUMNA` y la de su cabecera: son las que mide el panel
        // del selector (`columnaAncha`) para nacer justo debajo de la barra y
        // colgado de su botón, igual que el de canales en Chats.
        <div
            data-correo
            data-vista={unificada ? "unificada" : "buzon"}
            {...{ [MARCA_DE_LA_COLUMNA]: "" }}
            className="flex h-full min-h-0 flex-col gap-2"
        >
            <div {...{ [MARCA_DE_LA_CABECERA_DE_LA_COLUMNA]: "" }} className="flex shrink-0 flex-col gap-2">
            <BarraDeAcciones
                buscador={
                    <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                    {selector}
                    <div className="relative w-56 min-w-[36px] shrink sm:w-72">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar en lo cargado"
                            className="pl-8"
                            aria-label="Buscar correo"
                        />
                    </div>
                    </div>
                }
                filtros={enElTelefono ? undefined : pastillas}
                secundarias={
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Actualizar"
                        title="Actualizar"
                        onClick={() => void traer(false, {})}
                        disabled={cargando}
                    >
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
                            {deLaVista.map((b) => (
                                <DropdownMenuItem key={b.id} className="text-destructive" onSelect={() => void alDesconectar(b.id)}>
                                    Desconectar {b.direccion}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                }
            />

            {enElTelefono ? (
                <div data-fila-de-filtros className="-mt-1 flex shrink-0 items-center gap-2 overflow-x-auto">
                    {pastillas}
                </div>
            ) : null}
            </div>

            {avisosVisibles.map(({ buzon: b, aviso }) => (
                <div key={b.id} data-aviso-correo={b.id} className={AVISO_DEL_CORREO}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                        {/* En la unificada hay varios buzones: el aviso dice de cuál es. */}
                        {unificada ? <span className="font-medium">{b.direccion}: </span> : null}
                        {aviso.texto}
                    </div>
                    {aviso.reconectar && b.proveedor !== "imap" ? (
                        <Button size="sm" variant="outline" onClick={() => (window.location.href = `/api/correo/conectar/${b.proveedor}`)}>
                            Volver a conectar
                        </Button>
                    ) : aviso.reconectar ? (
                        <Button size="sm" variant="outline" onClick={alConectarOtro}>
                            Volver a conectar
                        </Button>
                    ) : null}
                </div>
            ))}

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
                            visibles.map((c) => {
                                const llave = laLlaveDelCorreo(c);
                                const suBuzon = porId.get(c.buzonId);
                                return (
                                    // La fila es un grupo: abrir y eliminar son dos
                                    // botones HERMANOS (un botón no va dentro de otro).
                                    <div key={llave} data-correo-fila={c.id} data-buzon={c.buzonId} className="group relative border-b border-border">
                                        <button
                                            type="button"
                                            onClick={() => abrir(c)}
                                            className={cn(
                                                "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted",
                                                abierto?.llave === llave && "bg-muted",
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                {c.sinLeer ? <span data-sin-leer className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" /> : null}
                                                <span className={cn("min-w-0 flex-1 truncate text-sm", c.sinLeer && "font-semibold")} title={c.deDireccion}>
                                                    {c.de || c.deDireccion || "(sin remitente)"}
                                                </span>
                                                {/* De qué buzón llegó: la MISMA marca con que Chats dice
                                                    de qué línea es una fila. Solo en la unificada: con un
                                                    buzón a la vista sería repetir su nombre en cada fila. */}
                                                {unificada && suBuzon ? (
                                                    <InsigniaDeLinea
                                                        clave={suBuzon.direccion}
                                                        nombre={`${suBuzon.direccion} · ${NOMBRE_DEL_PROVEEDOR[suBuzon.proveedor]}`}
                                                        palabra={laPalabraDelBuzon(suBuzon.direccion, direcciones)}
                                                    />
                                                ) : null}
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
                                );
                            })
                        )}
                        {hayMas && !cargando ? (
                            <div className="p-3">
                                <Button variant="outline" className="w-full" disabled={masCargando} onClick={() => void traer(true, porBuzon)}>
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
                            key={abierto.llave}
                            buzonId={abierto.buzonId}
                            correoId={abierto.id}
                            estabaSinLeer={abiertoSinLeer}
                            alVolver={() => setAbierto(null)}
                            alMarcar={(id, r) => alMarcar(abierto.buzonId, id, r)}
                            alEliminar={() => {
                                const c = correos.find((x) => laLlaveDelCorreo(x) === abierto.llave);
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
                            {buzonAEliminar ? laAdvertenciaDeEliminar(buzonAEliminar.proveedor) : null}
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
