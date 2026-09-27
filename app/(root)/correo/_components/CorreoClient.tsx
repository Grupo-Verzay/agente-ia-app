"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    Check,
    CheckSquare,
    ChevronDown,
    Filter,
    Loader2,
    MailOpen,
    MoreHorizontal,
    Download,
    Paperclip,
    Pin,
    RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { BuscadorDeLaColumna } from "@/components/shared/BuscadorDeLaColumna";
import {
    FLECHA_APAGADA,
    FLECHA_DE_LA_FILA,
    FLECHA_ENCENDIDA,
    PastillaDeFiltro,
    TONO_ARCHIVADOS,
    TONO_DESTACADOS,
    TONO_SIN_LEER,
    TONO_TODOS,
    type TonoDePastilla,
} from "@/components/shared/PastillaDeFiltro";
import { SelectorDeCanal } from "@/components/shared/SelectorDeCanal";
import { MedidaDeChats } from "@/components/chats/MedidaDeChats";
import { BulkActionBar } from "@/app/(root)/chats/_components/BulkActionBar";
import { MARCA_DE_LA_CABECERA_DE_LA_COLUMNA, MARCA_DE_LA_COLUMNA, usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";
import { LISTA_DE_CHATS } from "@/lib/lista-de-chats";
import {
    ALTO_DE_LA_CABECERA_DE_LA_COLUMNA,
    ALTO_MINIMO_DE_LA_CABECERA_DE_LA_COLUMNA,
    BOTON_DE_LA_COLUMNA,
    BOTON_DE_LA_COLUMNA_INACTIVO,
    CABECERA_DE_LA_COLUMNA,
    CABECERA_ESCRITORIO,
    CABECERA_ESCRITORIO_MINIMA,
    CLASE_FILA_1,
    CLASE_FILA_2,
    FILA_1_DE_LA_COLUMNA,
    FILA_2_DE_LA_COLUMNA,
    FILTRO_DE_LA_COLUMNA,
    FILTRO_DE_LA_COLUMNA_ACTIVO,
    FILTRO_DE_LA_COLUMNA_INACTIVO,
    GLIFO_DE_CONTROL,
    GRUPO_DEL_BUSCADOR,
    PASTILLAS_DE_LA_COLUMNA,
    TITULO_DE_LA_COLUMNA,
} from "@/lib/cabeceras-de-chats";
import { cn } from "@/lib/utils";
import {
    BANDEJA_UNIFICADA,
    CAMPOS_DE_BUSQUEDA,
    CARPETAS_DE_CORREO,
    FILTROS_EN_LA_FLECHA,
    FILTROS_EN_PASTILLA,
    NOMBRE_DEL_CAMPO,
    NOMBRE_DEL_FILTRO,
    TEXTO_DEL_BUSCADOR,
    alternarEnLaSeleccion,
    conDestacado,
    conElAnclado,
    conElLote,
    conLeido,
    conLosAncladosArriba,
    devolverElCorreo,
    devolverLosDelLote,
    esFiltroDeLaFlecha,
    laAdvertenciaDeEliminar,
    laBandejaUnificada,
    laCarpetaDelFiltro,
    laLlaveDelCorreo,
    laPalabraDelBuzon,
    laSeleccionVisible,
    losNumerosDeLasBandejas,
    losNumerosDelFiltro,
    pasaElFiltroDeCorreo,
    pasaLaBusqueda,
    sinElCorreo,
    type AccionEnLote,
    type CampoDeBusqueda,
    type CarpetaDeCorreo,
    type CorreoAnclado,
    type CorreoDeLaBandeja,
    type FiltroDeCorreo,
    type LoCargadoDeUnBuzon,
    type ProveedorConBoton,
} from "@/lib/correo";
import type { BuzonVisible } from "@/lib/correo-db";
import {
    anclarCorreoAction,
    archivarCorreoAction,
    bandejaAction,
    bandejaUnificadaAction,
    correosEnLoteAction,
    desanclarCorreoAction,
    desconectarCorreoAction,
    destacarCorreoAction,
    eliminarCorreoAction,
    marcarNoLeidoAction,
    misBuzonesAction,
    totalesDeLosBuzonesAction,
    type TotalDeUnBuzon,
} from "@/actions/correo-actions";
import { FilaDeCorreo, type AccionesDeLaFila } from "./FilaDeCorreo";
import { AVISO_DEL_CORREO, ConectarCorreo } from "./ConectarCorreo";
import { LecturaDelCorreo } from "./LecturaDelCorreo";
import { useExportarCorreos } from "@/hooks/useExportarCorreos";

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
 * El color de cada pastilla. «Todos» y «Sin leer» son LOS de Chats —el mismo
 * azul, el mismo naranja—: el mismo filtro no puede cambiar de color al pasar
 * de un canal a otro. «Destacados» va en el ámbar de la estrella y
 * «Archivados» en pizarra, que en Chats no existen.
 */
const TONO_DEL_FILTRO: Record<(typeof FILTROS_EN_PASTILLA)[number], TonoDePastilla> = {
    destacados: TONO_DESTACADOS,
    todos: TONO_TODOS,
    sinLeer: TONO_SIN_LEER,
    archivados: TONO_ARCHIVADOS,
};

/** El icono de cada filtro de la flecha «⌄». */
const ICONO_DEL_FILTRO: Record<(typeof FILTROS_EN_LA_FLECHA)[number], typeof MailOpen> = {
    leidos: MailOpen,
    conAdjuntos: Paperclip,
    anclados: Pin,
};

export function CorreoClient({ conectado, error }: { conectado: string | null; error: string | null }) {
    const [cargando, setCargando] = useState(true);
    const [buzones, setBuzones] = useState<BuzonVisible[]>([]);
    // Los anclados de la persona: viajan con los buzones y se tocan en local.
    const [anclados, setAnclados] = useState<CorreoAnclado[]>([]);
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
            setAnclados(r.anclados ?? []);
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
                anclados={anclados}
                alCambiarAnclados={setAnclados}
                alCambiarFirma={(buzonId, firma, firmaActiva) =>
                    setBuzones((l) => l.map((b) => (b.id === buzonId ? { ...b, firma, firmaActiva } : b)))
                }
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

type LoCargado = Record<string, LoCargadoDeUnBuzon>;

function Bandeja({
    vista,
    buzones,
    anclados,
    alCambiarAnclados,
    alCambiarFirma,
    alElegir,
    alConectarOtro,
    alDesconectar,
}: {
    /** El id de un buzón, o `BANDEJA_UNIFICADA`. */
    vista: string;
    buzones: BuzonVisible[];
    anclados: CorreoAnclado[];
    alCambiarAnclados: React.Dispatch<React.SetStateAction<CorreoAnclado[]>>;
    alCambiarFirma: (buzonId: string, firma: string | null, activa: boolean) => void;
    alElegir: (id: string) => void;
    alConectarOtro: () => void;
    alDesconectar: (buzonId: string) => Promise<void>;
}) {
    const unificada = vista === BANDEJA_UNIFICADA;
    // Los buzones que se miran: todos en la unificada, uno en la de un buzón.
    // Las dos vistas son LA MISMA pantalla con otra lista dentro: la misma
    // fila, el mismo filtro, la misma lectura y la misma confirmación.
    const deLaVista = useMemo(() => (unificada ? buzones : buzones.filter((b) => b.id === vista)), [unificada, buzones, vista]);
    const porId = useMemo(() => new Map(buzones.map((b) => [b.id, b])), [buzones]);
    const direcciones = useMemo(() => buzones.map((b) => b.direccion), [buzones]);

    const [filtro, setFiltro] = useState<FiltroDeCorreo>("todos");
    // «Archivados» no filtra lo cargado: es OTRA carpeta del proveedor.
    const carpeta = laCarpetaDelFiltro(filtro);

    // Lo cargado, POR CARPETA y POR BUZÓN: la lista que se ve sale de mezclar
    // lo de un buzón con lo de los demás (`laBandejaUnificada`), y con eso
    // cargar más no desordena lo que hay. Cada carpeta guarda lo suyo: volver
    // de «Archivados» a «Todos» no vuelve a pedir la bandeja.
    const [porCarpeta, setPorCarpeta] = useState<Record<CarpetaDeCorreo, LoCargado>>({ entrada: {}, archivo: {} });
    const [cargadas, setCargadas] = useState<Record<CarpetaDeCorreo, boolean>>({ entrada: false, archivo: false });
    const porBuzon = porCarpeta[carpeta];
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
    const [campo, setCampo] = useState<CampoDeBusqueda>("todo");
    // Los menús de la fila de arriba nacen como los de Chats: colgados de su
    // botón y justo debajo de la raya de la cabecera de la columna.
    const panelDelCampo = usePanelFlotante("columnaAncha", "menu");
    const panelDeAcciones = usePanelFlotante("columnaAncha", "menu");
    const panelDeMasFiltros = usePanelFlotante("columnaAncha", "menu");
    const [abierto, setAbierto] = useState<{ llave: string; buzonId: string; id: string } | null>(null);
    // Si estaba sin leer AL ABRIRLO: se pinta leído al momento, y la acción
    // solo pide marcar cuando hace falta.
    const [abiertoSinLeer, setAbiertoSinLeer] = useState(false);
    const [aEliminar, setAEliminar] = useState<CorreoDeLaBandeja | null>(null);
    const [eliminarLote, setEliminarLote] = useState(false);
    // La selección múltiple, por LLAVE (con el buzón delante): dos buzones
    // pueden tener el mismo id.
    const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
    const vuelta = useRef(0);
    // «Nuevo» se mide contra una hora: la de este pintado, y se refresca cada minuto.
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const t = window.setInterval(() => setAhora(Date.now()), 60_000);
        return () => window.clearInterval(t);
    }, []);

    // El total de CADA buzón, para el número del selector de bandejas (el
    // mismo sitio donde Chats pinta el de cada canal). Sale del PROVEEDOR, no
    // del largo de lo cargado; `null` mientras no llega, y un buzón que no
    // contesta va sin número. Solo se pide cuando hay selector (varios buzones).
    const [totales, setTotales] = useState<TotalDeUnBuzon[] | null>(null);
    const idsDeLosBuzones = buzones.map((b) => b.id).join("|");
    const traerTotales = useCallback(async () => {
        if (buzones.length < 2) return;
        try {
            const r = await totalesDeLosBuzonesAction();
            if (r.success) setTotales(r.totales);
            else console.warn("[correo] no se pudieron contar las bandejas", r.message);
        } catch (error) {
            console.warn("[correo] no se pudieron contar las bandejas", error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsDeLosBuzones]);
    useEffect(() => {
        void traerTotales();
    }, [traerTotales]);

    /** Restar de los totales del selector lo que salió de la bandeja de entrada. */
    const restarDeLosTotales = useCallback((cuantosPorBuzon: Record<string, number>) => {
        setTotales((t) =>
            t?.map((x) =>
                cuantosPorBuzon[x.buzonId] && x.total !== null ? { ...x, total: Math.max(0, x.total - cuantosPorBuzon[x.buzonId]) } : x,
            ) ?? t,
        );
    }, []);

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

    /**
     * Cambiar la lista de UN buzón en UNA carpeta: la fila vive en el cubo de
     * su buzón. `carpeta` por defecto son LAS DOS: marcar leído o destacar se
     * aplica por llave, y un correo no está a la vez en la entrada y en el
     * archivo, así que en la otra carpeta no toca nada.
     */
    const cambiarEn = useCallback(
        (buzonId: string, cambio: (correos: CorreoDeLaBandeja[]) => CorreoDeLaBandeja[], soloEn?: CarpetaDeCorreo) => {
            setPorCarpeta((antes) => {
                const nuevo = { ...antes };
                for (const k of CARPETAS_DE_CORREO) {
                    if (soloEn && k !== soloEn) continue;
                    const cargado = antes[k][buzonId];
                    if (!cargado) continue;
                    nuevo[k] = { ...antes[k], [buzonId]: { ...cargado, correos: cambio(cargado.correos) } };
                }
                return nuevo;
            });
        },
        [],
    );

    /** Lo archivado cambió: el archivo se vuelve a pedir la próxima vez que se abra. */
    const olvidarElArchivo = useCallback(() => {
        setPorCarpeta((p) => ({ ...p, archivo: {} }));
        setCargadas((c) => ({ ...c, archivo: false }));
    }, []);

    const abrir = useCallback(
        (c: CorreoDeLaBandeja) => {
            const llave = laLlaveDelCorreo(c);
            setAbiertoSinLeer(c.sinLeer);
            setAbierto({ llave, buzonId: c.buzonId, id: c.id });
            // Se pinta leído YA; si el proveedor dice que no, `alMarcar` lo devuelve.
            if (c.sinLeer) cambiarEn(c.buzonId, (l) => conLeido(l, llave));
        },
        [cambiarEn],
    );

    const alMarcar = useCallback(
        (buzonId: string, id: string, r: { leido: boolean; motivo: string | null; reconectar: boolean }) => {
            if (r.leido) return;
            cambiarEn(buzonId, (l) => conLeido(l, laLlaveDelCorreo({ id, buzonId }), true));
            if (r.motivo) ponerAviso(buzonId, { texto: r.motivo, reconectar: r.reconectar });
        },
        [cambiarEn, ponerAviso],
    );

    /**
     * Sacar un correo de la lista —eliminar y archivar son eso para la
     * bandeja—: la fila se quita y la lectura se cierra ANTES de preguntar al
     * proveedor, como al eliminar un chat, y si dice que no, el correo vuelve
     * a SU sitio con su motivo. Un anclado sale también de arriba, y vuelve con
     * él. Un solo camino para los dos, y siempre en el buzón DEL correo.
     */
    async function sacarDeLaLista(
        c: CorreoDeLaBandeja,
        pedir: () => Promise<{ success: boolean; message?: string; reconectar?: boolean }>,
        exito: (r: any) => string,
        sinRed: string,
    ) {
        const llave = laLlaveDelCorreo(c);
        const deDonde = carpeta;
        const quitado = sinElCorreo(porCarpeta[deDonde][c.buzonId]?.correos ?? [], llave);
        const suAnclado = anclados.find((a) => laLlaveDelCorreo(a) === llave) ?? null;
        cambiarEn(c.buzonId, (l) => sinElCorreo(l, llave).lista, deDonde);
        if (suAnclado) alCambiarAnclados((l) => conElAnclado(l, null, llave));
        if (abierto?.llave === llave) setAbierto(null);
        const devolver = () => {
            // Solo vuelve a la lista lo que estaba en ella: un anclado que no
            // estaba cargado vuelve arriba, no se cuela en la página.
            if (quitado.quitado) cambiarEn(c.buzonId, (l) => devolverElCorreo(l, quitado.quitado!, Math.max(0, quitado.posicion)), deDonde);
            if (suAnclado) alCambiarAnclados((l) => conElAnclado(l, suAnclado, llave));
        };
        try {
            const r = await pedir();
            if (!r.success) {
                devolver();
                toast.error(r.message);
                if (r.reconectar) ponerAviso(c.buzonId, { texto: r.message ?? "", reconectar: true });
                return false;
            }
            toast.success(exito(r));
            // Salió de la bandeja de entrada del proveedor: su número baja uno.
            if (deDonde === "entrada") restarDeLosTotales({ [c.buzonId]: 1 });
            return true;
        } catch {
            devolver();
            toast.error(sinRed);
            return false;
        }
    }

    function eliminar(c: CorreoDeLaBandeja) {
        return sacarDeLaLista(
            c,
            () => eliminarCorreoAction(c.buzonId, c.id),
            (r) => (r.aLaPapelera ? "Correo movido a la papelera." : "Correo eliminado (tu servidor no tiene papelera)."),
            "No se pudo eliminar. Revisa la conexión.",
        );
    }

    async function archivar(c: CorreoDeLaBandeja) {
        const salio = await sacarDeLaLista(
            c,
            () => archivarCorreoAction(c.buzonId, c.id),
            (r) => `Correo archivado en «${r.carpeta}».`,
            "No se pudo archivar. Revisa la conexión.",
        );
        if (salio) olvidarElArchivo();
    }

    /**
     * Marcar como NO leído: el punto vuelve al momento y, si el correo estaba
     * abierto, se cierra —abierto se volvería a marcar como leído—. Si el
     * proveedor dice que no, el punto se va otra vez.
     */
    async function marcarNoLeido(c: CorreoDeLaBandeja) {
        const llave = laLlaveDelCorreo(c);
        cambiarEn(c.buzonId, (l) => conLeido(l, llave, true));
        if (abierto?.llave === llave) setAbierto(null);
        try {
            const r = await marcarNoLeidoAction(c.buzonId, c.id);
            if (!r.success) {
                cambiarEn(c.buzonId, (l) => conLeido(l, llave, false));
                toast.error(r.message);
                if (r.reconectar) ponerAviso(c.buzonId, { texto: r.message, reconectar: true });
            }
        } catch {
            cambiarEn(c.buzonId, (l) => conLeido(l, llave, false));
            toast.error("No se pudo marcar como no leído. Revisa la conexión.");
        }
    }

    /** Destacar: la estrella se pinta al momento y se deshace si el proveedor dice que no. */
    async function destacar(c: CorreoDeLaBandeja, valor: boolean) {
        const llave = laLlaveDelCorreo(c);
        cambiarEn(c.buzonId, (l) => conDestacado(l, llave, valor));
        try {
            const r = await destacarCorreoAction(c.buzonId, c.id, valor);
            if (!r.success) {
                cambiarEn(c.buzonId, (l) => conDestacado(l, llave, !valor));
                toast.error(r.message);
                if (r.reconectar) ponerAviso(c.buzonId, { texto: r.message, reconectar: true });
            }
        } catch {
            cambiarEn(c.buzonId, (l) => conDestacado(l, llave, !valor));
            toast.error("No se pudo destacar. Revisa la conexión.");
        }
    }

    /**
     * Anclar o desanclar: sube (o baja) al momento con lo que ya se sabe de la
     * fila, y al volver del servidor se queda con SU foto —la del proveedor—.
     * Si dice que no, vuelve a como estaba.
     */
    async function anclar(c: CorreoDeLaBandeja, valor: boolean) {
        const llave = laLlaveDelCorreo(c);
        const antes = anclados.find((a) => laLlaveDelCorreo(a) === llave) ?? null;
        const provisional: CorreoAnclado = { ...c, buzonId: c.buzonId, ancladoEn: Date.now() };
        alCambiarAnclados((l) => conElAnclado(l, valor ? provisional : null, llave));
        const deshacer = () => alCambiarAnclados((l) => conElAnclado(l, antes, llave));
        try {
            if (valor) {
                const r = await anclarCorreoAction(c.buzonId, c.id);
                if (!r.success) {
                    deshacer();
                    toast.error(r.message);
                    return;
                }
                alCambiarAnclados((l) => conElAnclado(l, r.anclado, llave));
            } else {
                const r = await desanclarCorreoAction(c.buzonId, c.id);
                if (!r.success) {
                    deshacer();
                    toast.error(r.message);
                }
            }
        } catch {
            deshacer();
            toast.error("No se pudo anclar. Revisa la conexión.");
        }
    }

    /**
     * Traer: la primera página (`mas: false`) o la siguiente de cada buzón que
     * la tenga, de la carpeta pedida. En la de un buzón va por `bandejaAction`;
     * en la unificada, por `bandejaUnificadaAction`, que pide todos a la vez y
     * dice de cada uno si llegó o por qué no — un buzón que falla no deja vacía
     * la bandeja.
     */
    const traer = useCallback(
        async (mas: boolean, cargadoAhora: LoCargado, deDonde: CarpetaDeCorreo) => {
            const esta = ++vuelta.current;
            if (mas) setMasCargando(true);
            else setCargando(true);
            const aplicar = (buzonId: string, correos: CorreoDeLaBandeja[], siguiente: string | null) =>
                setPorCarpeta((antes) => {
                    const previos = mas ? antes[deDonde][buzonId]?.correos ?? [] : [];
                    const vistos = new Set(previos.map(laLlaveDelCorreo));
                    return {
                        ...antes,
                        [deDonde]: {
                            ...antes[deDonde],
                            [buzonId]: { correos: [...previos, ...correos.filter((c) => !vistos.has(laLlaveDelCorreo(c)))], siguiente },
                        },
                    };
                });
            try {
                if (!unificada) {
                    const id = deLaVista[0]?.id;
                    if (!id) return;
                    const cursor = mas ? cargadoAhora[id]?.siguiente ?? null : null;
                    const r = await bandejaAction(id, cursor, deDonde);
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
                const r = await bandejaUnificadaAction(cursores, deDonde);
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
                        else
                            setPorCarpeta((antes) => ({
                                ...antes,
                                [deDonde]: {
                                    ...antes[deDonde],
                                    [b.buzonId]: { ...(antes[deDonde][b.buzonId] ?? { correos: [] }), siguiente: null },
                                },
                            }));
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
                    if (!mas) setCargadas((c) => ({ ...c, [deDonde]: true }));
                }
            }
        },
        [unificada, deLaVista, ponerAviso],
    );

    // Se pide la carpeta que se mira si todavía no se ha traído: al abrir la
    // vista, al pasar a «Archivados» la primera vez, y cuando archivar deja el
    // archivo por volver a pedir.
    useEffect(() => {
        if (!cargadas[carpeta]) void traer(false, {}, carpeta);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vista, carpeta, cargadas[carpeta]]);

    const entrada = useMemo(() => laBandejaUnificada(porCarpeta.entrada), [porCarpeta.entrada]);
    const archivo = useMemo(() => laBandejaUnificada(porCarpeta.archivo), [porCarpeta.archivo]);
    const { visibles: correos, hayMas } = carpeta === "archivo" ? archivo : entrada;
    const ancladosDeLaVista = useMemo(
        () => anclados.filter((a) => unificada || a.buzonId === vista),
        [anclados, unificada, vista],
    );
    // Los anclados ARRIBA, como en Chats, y solo en la bandeja de entrada: lo
    // archivado no está en ella. El filtro y el buscador valen para todos,
    // anclados incluidos: un filtro que deja fuera todo menos lo anclado se
    // leería como que el filtro no funciona.
    const { visibles, todas, ancladas } = useMemo(() => {
        const { arriba, resto } = conLosAncladosArriba(correos, carpeta === "entrada" ? ancladosDeLaVista : [], null);
        const ancladas = new Set(arriba.map(laLlaveDelCorreo));
        const pasa = (c: CorreoDeLaBandeja) =>
            pasaElFiltroDeCorreo(c, filtro, ancladas.has(laLlaveDelCorreo(c))) && pasaLaBusqueda(c, busqueda, campo);
        return {
            visibles: [...arriba.filter(pasa), ...resto.filter(pasa)],
            todas: [...arriba, ...resto],
            ancladas,
        };
    }, [correos, ancladosDeLaVista, carpeta, busqueda, campo, filtro]);
    // Exportar: el MISMO camino desde la fila, desde el correo abierto y desde
    // la barra (los de la lista). La lista es la que se VE —con su filtro y su
    // búsqueda—: exportar lo escondido sería la peor sorpresa posible.
    const { exportando, exportar: exportarCorreos } = useExportarCorreos();
    const exportarLaLista = () =>
        void exportarCorreos(visibles.map((c) => ({ buzonId: c.buzonId, correoId: c.id })));
    const correoAbierto = abierto ? todas.find((x) => laLlaveDelCorreo(x) === abierto.llave) ?? null : null;
    const buzonDeLaVista = unificada ? null : deLaVista[0] ?? null;
    const avisosVisibles = deLaVista.filter((b) => avisos[b.id]).map((b) => ({ buzon: b, aviso: avisos[b.id] }));
    const buzonAEliminar = aEliminar ? porId.get(aEliminar.buzonId) ?? null : null;

    // La selección cuenta solo lo que SE VE (`laSeleccionVisible`).
    const seleccionados = useMemo(() => laSeleccionVisible(seleccion, visibles), [seleccion, visibles]);
    const haySeleccion = seleccionados.size > 0;

    /**
     * Hacer lo mismo a varios correos a la vez: la barra de la selección, que
     * es la de Chats. Se pinta AL MOMENTO (`conElLote`) y, cuando el proveedor
     * contesta, lo que falló vuelve a como estaba (`devolverLosDelLote`) y se
     * dice cuántos. Una acción de servidor con la lista entera, no N llamadas.
     */
    async function enLote(accion: AccionEnLote) {
        const lote = visibles.filter((c) => seleccionados.has(laLlaveDelCorreo(c)));
        if (!lote.length) return;
        const deDonde = carpeta;
        const llaves = new Set(lote.map(laLlaveDelCorreo));
        const porBuzonAntes = porCarpeta[deDonde];
        const ancladosAntes = anclados;
        const sale = accion === "archivar" || accion === "eliminar";
        for (const b of new Set(lote.map((c) => c.buzonId))) cambiarEn(b, (l) => conElLote(l, llaves, accion), deDonde);
        if (sale) alCambiarAnclados((l) => l.filter((a) => !llaves.has(laLlaveDelCorreo(a))));
        if (abierto && llaves.has(abierto.llave) && (sale || accion === "noLeido")) setAbierto(null);
        setSeleccion(new Set());

        const devolver = (fallidas: Set<string>) => {
            for (const [buzonId, cargado] of Object.entries(porBuzonAntes)) {
                cambiarEn(buzonId, (l) => devolverLosDelLote(l, cargado.correos, fallidas), deDonde);
            }
            if (sale) {
                const vuelven = ancladosAntes.filter((a) => fallidas.has(laLlaveDelCorreo(a)));
                if (vuelven.length) alCambiarAnclados((l) => [...vuelven, ...l.filter((a) => !fallidas.has(laLlaveDelCorreo(a)))]);
            }
        };
        const nombre = lote.length === 1 ? "correo" : "correos";
        try {
            const r = await correosEnLoteAction(
                accion,
                lote.map((c) => ({ buzonId: c.buzonId, id: c.id })),
            );
            if (!r.success) {
                devolver(llaves);
                toast.error(r.message);
                return;
            }
            const fallidas = new Set(r.fallidos.map(laLlaveDelCorreo));
            if (fallidas.size) {
                devolver(fallidas);
                toast.error(`${r.hechos.length} de ${lote.length} listos. ${r.fallidos.length} no se pudieron: ${r.fallidos[0].motivo}`);
            } else {
                toast.success(`${lote.length} ${nombre}: ${QUE_HIZO_EL_LOTE[accion]}.`);
            }
            if (sale && r.hechos.length) {
                if (deDonde === "entrada") {
                    const cuantos: Record<string, number> = {};
                    for (const h of r.hechos) cuantos[h.buzonId] = (cuantos[h.buzonId] ?? 0) + 1;
                    restarDeLosTotales(cuantos);
                }
                if (accion === "archivar") olvidarElArchivo();
            }
        } catch {
            devolver(llaves);
            toast.error("No se pudo completar. Revisa la conexión.");
        }
    }

    const alternarSeleccion = useCallback((c: CorreoDeLaBandeja) => {
        setSeleccion((s) => alternarEnLaSeleccion(s, laLlaveDelCorreo(c)));
    }, []);
    const seleccionarTodos = () =>
        setSeleccion(seleccionados.size === visibles.length ? new Set() : new Set(visibles.map(laLlaveDelCorreo)));

    // Las acciones de la fila viajan por REFERENCIA: la fila está memoizada y
    // estas funciones se rehacen en cada pintado. Con ellas en las props, toda
    // la lista se repintaría cada vez que llega algo.
    const accionesRef = useRef<AccionesDeLaFila>(null as unknown as AccionesDeLaFila);
    accionesRef.current = {
        alAbrir: abrir,
        alAlternarSeleccion: alternarSeleccion,
        alArchivar: (c) => void archivar(c),
        alEliminar: (c) => setAEliminar(c),
        alAnclar: (c, v) => void anclar(c, v),
        alDestacar: (c, v) => void destacar(c, v),
        alMarcarNoLeido: (c) => void marcarNoLeido(c),
        alExportar: (c) => void exportarCorreos([{ buzonId: c.buzonId, correoId: c.id }]),
    };
    const acciones = useMemo<AccionesDeLaFila>(
        () => ({
            alAbrir: (c) => accionesRef.current.alAbrir(c),
            alAlternarSeleccion: (c) => accionesRef.current.alAlternarSeleccion(c),
            alArchivar: (c) => accionesRef.current.alArchivar(c),
            alEliminar: (c) => accionesRef.current.alEliminar(c),
            alAnclar: (c, v) => accionesRef.current.alAnclar(c, v),
            alDestacar: (c, v) => accionesRef.current.alDestacar(c, v),
            alMarcarNoLeido: (c) => accionesRef.current.alMarcarNoLeido(c),
            alExportar: (c) => accionesRef.current.alExportar(c),
        }),
        [],
    );

    // El buzón y el filtro, con las MISMAS piezas que Chats: el selector de
    // canales («Todos ▾» → aquí «Todas ▾») y sus pastillas con contador. No
    // parecidas: los mismos componentes, que viven en `components/shared/`.
    const numeros = losNumerosDelFiltro(
        { correos: entrada.visibles, hayMas: entrada.hayMas },
        cargadas.archivo ? { correos: archivo.visibles, hayMas: archivo.hayMas } : null,
        ancladosDeLaVista.length,
    );
    const deLasBandejas = losNumerosDeLasBandejas(buzones, totales);
    const selector =
        buzones.length > 1 ? (
            <SelectorDeCanal
                titulo="Bandejas"
                ariaLabel="Buzón"
                // El número de cada bandeja, como el de cada canal en Chats:
                // el total de su bandeja de entrada según el PROVEEDOR. Sin
                // segunda línea con el proveedor: la dirección ya lo dice por
                // su dominio.
                todos={{ etiqueta: "Todas", cuenta: deLasBandejas.todas }}
                opciones={buzones.map((b) => ({ valor: b.id, etiqueta: b.direccion, cuenta: deLasBandejas.porBuzon[b.id] }))}
                valor={unificada ? null : vista}
                alCambiar={(v) => alElegir(v ?? BANDEJA_UNIFICADA)}
            />
        ) : (
            // Con un solo buzón no hay nada que elegir: el título de la
            // columna, como «Chats» con una sola línea. La dirección se lee al
            // posarse, y en el «⋯».
            <span className={TITULO_DE_LA_COLUMNA} title={buzonDeLaVista?.direccion}>
                Correo
            </span>
        );

    // Las cuatro pastillas —Destacados, Todos, Sin leer, Archivados— y la
    // flecha «⌄» al final con lo que se usa menos. La MISMA fila que la de
    // Chats: `PASTILLAS_DE_LA_COLUMNA` con `justify-between`, la misma
    // pastilla y la misma flecha (`FLECHA_DE_LA_FILA`).
    const pastillas = (
        <div data-pastillas-de-correo className={PASTILLAS_DE_LA_COLUMNA}>
            {FILTROS_EN_PASTILLA.map((f) => (
                <PastillaDeFiltro
                    key={f}
                    valor={f}
                    rotulo={NOMBRE_DEL_FILTRO[f]}
                    activa={filtro === f}
                    alPulsar={() => setFiltro(filtro === f && f !== "todos" ? "todos" : f)}
                    tono={TONO_DEL_FILTRO[f]}
                    cuenta={numeros[f]}
                    tabular
                />
            ))}
            <DropdownMenu onOpenChange={panelDeMasFiltros.alAbrir}>
                <DropdownMenuTrigger asChild ref={panelDeMasFiltros.disparador}>
                    <button
                        type="button"
                        aria-label="Más filtros"
                        title="Más filtros"
                        data-flecha-de-la-fila
                        className={cn(FLECHA_DE_LA_FILA, esFiltroDeLaFlecha(filtro) ? FLECHA_ENCENDIDA : FLECHA_APAGADA)}
                    >
                        <ChevronDown className="h-3 w-3" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent {...panelDeMasFiltros.props} className={cn(RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
                    {FILTROS_EN_LA_FLECHA.map((f) => {
                        const Icono = ICONO_DEL_FILTRO[f];
                        return (
                            <DropdownMenuItem
                                key={f}
                                data-filtro-de-la-flecha={f}
                                onSelect={() => setFiltro(filtro === f ? "todos" : f)}
                                className="flex cursor-pointer items-center justify-between gap-2 py-1 text-xs"
                            >
                                <span className="flex items-center gap-1.5 text-xs">
                                    <Icono className={cn("h-3 w-3 shrink-0", filtro === f ? "text-primary" : "text-muted-foreground")} />
                                    {NOMBRE_DEL_FILTRO[f]}
                                </span>
                                <span className="flex items-center gap-1">
                                    {numeros[f] ? <span className="text-[10px] text-muted-foreground">{numeros[f]}</span> : null}
                                    {filtro === f && <Check className="h-3 w-3 text-primary" />}
                                </span>
                            </DropdownMenuItem>
                        );
                    })}
                    <div className="my-1 border-t border-border/50" />
                    <DropdownMenuItem
                        data-seleccionar-todos
                        onSelect={seleccionarTodos}
                        disabled={!visibles.length}
                        className="flex cursor-pointer items-center gap-1.5 py-1 text-xs"
                    >
                        <CheckSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {haySeleccion && seleccionados.size === visibles.length ? "Quitar la selección" : "Seleccionar todos"}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );

    return (
        <div
            data-correo
            data-full-bleed
            data-vista={unificada ? "unificada" : "buzon"}
            data-carpeta={carpeta}
            className="flex h-full min-h-0 w-full flex-col gap-2"
        >
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

            {/* La bandeja es la de Chats: `data-chat-view`, sin borde propio
                —el borde es el de la caja del módulo, como en Chats—, y con un
                panel lateral abierto (notas, copiloto, chat del equipo) se le
                reserva la franja por la derecha: la columna del correo se
                corre a la izquierda en vez de quedar tapada. `MedidaDeChats`
                la mide para que el panel caiga EXACTAMENTE en esa franja, con
                su cabecera y su barra a la altura de las de aquí. */}
            <div data-chat-view data-bandeja-de-correo className="flex min-h-0 w-full flex-1 overflow-hidden">
                <MedidaDeChats />
                {/* La columna de la lista lleva su cabecera DENTRO, como la de
                    Chats: mide el ancho de la columna —así el buscador sale
                    angosto—, y su raya cae a la altura de la cabecera del correo
                    abierto. `MARCA_DE_LA_COLUMNA` y la de su cabecera son las
                    que mide el panel del selector (`columnaAncha`). */}
                <div
                    data-lista-de-correos
                    {...{ [MARCA_DE_LA_COLUMNA]: "" }}
                    className={cn(
                        "flex min-h-0 w-full flex-col border-border md:w-[var(--ancho-lateral)] md:shrink-0 md:border-r",
                        abierto && "hidden md:flex",
                    )}
                >
                    <div
                        {...{ [MARCA_DE_LA_CABECERA_DE_LA_COLUMNA]: "" }}
                        data-cabecera-de-la-bandeja
                        className={cn(
                            CABECERA_DE_LA_COLUMNA,
                            // Con la barra de la selección debajo la cabecera
                            // crece: la altura pasa a ser un mínimo, como en Chats.
                            haySeleccion ? ALTO_MINIMO_DE_LA_CABECERA_DE_LA_COLUMNA : ALTO_DE_LA_CABECERA_DE_LA_COLUMNA,
                            haySeleccion ? CABECERA_ESCRITORIO_MINIMA : CABECERA_ESCRITORIO,
                        )}
                    >
                        {/* Arriba, lo de Chats pieza por pieza: el selector, el
                            buscador angosto y los iconos de 28 px. */}
                        <div data-fila-del-buscador className={cn(FILA_1_DE_LA_COLUMNA, CLASE_FILA_1)}>
                            <div className={GRUPO_DEL_BUSCADOR}>
                                {selector}
                                <BuscadorDeLaColumna
                                    value={busqueda}
                                    onChange={setBusqueda}
                                    onClear={() => setBusqueda("")}
                                    // Dónde se busca se LEE en el placeholder: un
                                    // campo elegido que no se ve es un buscador
                                    // que «a veces no encuentra».
                                    placeholder={TEXTO_DEL_BUSCADOR[campo]}
                                    ariaLabel="Buscar correo"
                                />
                            </div>
                            {/* El filtro: dónde se busca. Redondo y del tamaño
                                de los demás, fuera del buscador, como el embudo
                                de Chats. */}
                            <DropdownMenu onOpenChange={panelDelCampo.alAbrir}>
                                <DropdownMenuTrigger asChild ref={panelDelCampo.disparador}>
                                    <button
                                        type="button"
                                        aria-label={`Buscar en: ${NOMBRE_DEL_CAMPO[campo]}`}
                                        title={`Buscar en: ${NOMBRE_DEL_CAMPO[campo]}`}
                                        data-campo-de-busqueda={campo}
                                        className={cn(
                                            FILTRO_DE_LA_COLUMNA,
                                            campo !== "todo" ? FILTRO_DE_LA_COLUMNA_ACTIVO : FILTRO_DE_LA_COLUMNA_INACTIVO,
                                        )}
                                    >
                                        <Filter className={GLIFO_DE_CONTROL} />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent {...panelDelCampo.props} className={cn(RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
                                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Buscar en</p>
                                    {CAMPOS_DE_BUSQUEDA.map((c) => (
                                        // Cambiar de campo CONSERVA lo escrito: casi
                                        // siempre es «esto que ya tecleé, búscalo por lo otro».
                                        <DropdownMenuItem
                                            key={c}
                                            data-campo={c}
                                            onSelect={() => setCampo(c)}
                                            className="flex cursor-pointer items-center justify-between gap-2"
                                        >
                                            <span className="text-sm">{NOMBRE_DEL_CAMPO[c]}</span>
                                            {campo === c && <Check className="h-3.5 w-3.5 text-primary" />}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <button
                                type="button"
                                aria-label="Actualizar"
                                title="Actualizar"
                                className={cn(BOTON_DE_LA_COLUMNA, BOTON_DE_LA_COLUMNA_INACTIVO, "disabled:opacity-50")}
                                onClick={() => {
                                    void traer(false, {}, carpeta);
                                    void traerTotales();
                                }}
                                disabled={cargando}
                            >
                                <RefreshCw className={cn(GLIFO_DE_CONTROL, "shrink-0", cargando && "animate-spin")} />
                            </button>
                            <DropdownMenu onOpenChange={panelDeAcciones.alAbrir}>
                                <DropdownMenuTrigger asChild ref={panelDeAcciones.disparador}>
                                    <button
                                        type="button"
                                        aria-label="Más acciones"
                                        title="Más acciones"
                                        className={cn(BOTON_DE_LA_COLUMNA, BOTON_DE_LA_COLUMNA_INACTIVO)}
                                    >
                                        <MoreHorizontal className={cn(GLIFO_DE_CONTROL, "shrink-0")} />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent {...panelDeAcciones.props} className={cn(RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
                                    <DropdownMenuItem disabled={exportando || visibles.length === 0} onSelect={exportarLaLista}>
                                        {exportando ? "Exportando…" : `Exportar los de la lista (${visibles.length})`}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={alConectarOtro}>Conectar otro correo</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {deLaVista.map((b) => (
                                        <DropdownMenuItem key={b.id} className="text-destructive" onSelect={() => void alDesconectar(b.id)}>
                                            Desconectar {b.direccion}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Abajo, las pastillas en SU fila, repartidas como las
                            de Chats. Se pintan UNA vez: dos copias serían dos filtros. */}
                        <div data-fila-de-filtros className={cn(FILA_2_DE_LA_COLUMNA, CLASE_FILA_2)}>
                            {pastillas}
                        </div>

                        {/* La barra de la selección: LA de Chats, con sus
                            botones de correo (leído, destacar, archivar, eliminar). */}
                        {haySeleccion ? (
                            <div data-barra-de-la-seleccion>
                                <BulkActionBar
                                    count={seleccionados.size}
                                    totalCount={visibles.length}
                                    onClear={() => setSeleccion(new Set())}
                                    onSelectAll={seleccionarTodos}
                                    onMarkRead={(leido) => void enLote(leido ? "leido" : "noLeido")}
                                    onStar={(v) => void enLote(v ? "destacar" : "quitarDestacado")}
                                    onArchivar={carpeta === "entrada" ? () => void enLote("archivar") : undefined}
                                    onDelete={() => setEliminarLote(true)}
                                    onExport={() => {
                                        const lote = visibles.filter((c) => seleccionados.has(laLlaveDelCorreo(c)));
                                        void exportarCorreos(lote.map((c) => ({ buzonId: c.buzonId, correoId: c.id }))).then((ok) => {
                                            if (ok) setSeleccion(new Set());
                                        });
                                    }}
                                    exporting={exportando}
                                    sustantivo={{ uno: "correo", varios: "correos" }}
                                />
                            </div>
                        ) : null}
                    </div>
                    <div role="list" className={LISTA_DE_CHATS}>
                        {cargando ? (
                            <div className="flex justify-center p-6 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        ) : visibles.length === 0 ? (
                            <p className="p-6 text-center text-sm text-muted-foreground">
                                {correos.length || (carpeta === "entrada" && ancladosDeLaVista.length)
                                    ? "Ningún correo coincide."
                                    : carpeta === "archivo"
                                      ? "No hay correos archivados."
                                      : "La bandeja está vacía."}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {visibles.map((c) => {
                                    const llave = laLlaveDelCorreo(c);
                                    const suBuzon = unificada ? porId.get(c.buzonId) : null;
                                    return (
                                        <FilaDeCorreo
                                            key={llave}
                                            correo={c}
                                            llave={llave}
                                            abierto={abierto?.llave === llave}
                                            anclado={ancladas.has(llave)}
                                            seleccionado={seleccionados.has(llave)}
                                            modoSeleccion={haySeleccion}
                                            enArchivo={carpeta === "archivo"}
                                            // De qué buzón llegó: la MISMA marca con que Chats dice
                                            // de qué línea es una fila. Solo en la unificada.
                                            buzon={
                                                suBuzon
                                                    ? {
                                                          clave: suBuzon.direccion,
                                                          nombre: suBuzon.direccion,
                                                          palabra: laPalabraDelBuzon(suBuzon.direccion, direcciones),
                                                      }
                                                    : null
                                            }
                                            ahora={ahora}
                                            acciones={acciones}
                                        />
                                    );
                                })}
                            </div>
                        )}
                        {hayMas && !cargando ? (
                            <div className="p-3">
                                <Button variant="outline" className="w-full" disabled={masCargando} onClick={() => void traer(true, porBuzon, carpeta)}>
                                    {masCargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Cargar más
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className={cn("min-h-0 min-w-0 flex-1", !abierto && "hidden md:flex")}>
                    {abierto && porId.get(abierto.buzonId) ? (
                        <LecturaDelCorreo
                            key={abierto.llave}
                            buzon={porId.get(abierto.buzonId)!}
                            correoId={abierto.id}
                            estabaSinLeer={abiertoSinLeer}
                            destacado={Boolean(correoAbierto?.destacado)}
                            anclado={ancladas.has(abierto.llave)}
                            enArchivo={carpeta === "archivo"}
                            alVolver={() => setAbierto(null)}
                            alMarcar={(id, r) => alMarcar(abierto.buzonId, id, r)}
                            alEliminar={() => {
                                if (correoAbierto) setAEliminar(correoAbierto);
                            }}
                            alArchivar={() => {
                                if (correoAbierto) void archivar(correoAbierto);
                            }}
                            alMarcarNoLeido={() => {
                                if (correoAbierto) void marcarNoLeido(correoAbierto);
                            }}
                            alDestacar={(v) => {
                                if (correoAbierto) void destacar(correoAbierto, v);
                            }}
                            alAnclar={(v) => {
                                if (correoAbierto) void anclar(correoAbierto, v);
                            }}
                            alCambiarFirma={(firma, activa) => alCambiarFirma(abierto.buzonId, firma, activa)}
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

            <AlertDialog open={eliminarLote} onOpenChange={setEliminarLote}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            ¿Eliminar {seleccionados.size} {seleccionados.size === 1 ? "correo" : "correos"}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Van a la papelera de cada buzón y se recuperan desde ahí. Un servidor de dominio propio sin papelera los borra del
                            todo.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            data-confirmar-eliminar-lote
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                setEliminarLote(false);
                                void enLote("eliminar");
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

/** Lo que dice el aviso cuando el lote sale entero. */
const QUE_HIZO_EL_LOTE: Record<AccionEnLote, string> = {
    leido: "marcados como leídos",
    noLeido: "marcados como no leídos",
    destacar: "destacados",
    quitarDestacado: "sin destacar",
    archivar: "archivados",
    eliminar: "movidos a la papelera",
};
