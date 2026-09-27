"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Archive,
    ArrowLeft,
    AudioLines,
    Check,
    Download,
    Forward,
    Loader2,
    Mail,
    MoreHorizontal,
    PenLine,
    Pin,
    PinOff,
    Reply,
    SendIcon,
    Sparkles,
    Star,
    Trash2,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SuggestedReplyBar } from "@/components/shared/SuggestedReplyBar";
import {
    BotonesDeLaDerecha,
    ZonaDeHerramientas,
    rellenoParaLosBotones,
    useAltoDeLaCaja,
    useBarraCompacta,
} from "@/components/shared/BarraDeEscribir";
// El clip es EL de Chats: el mismo menú de imagen, vídeo, documento y audio.
import { AttachmentMenu, type ComposeMedia } from "@/app/(root)/chats/_components/attachment-menu";
import { useSpeechDictation } from "@/hooks/useSpeechDictation";
import { cn } from "@/lib/utils";
import { suelto, PANEL_QUE_SE_DESPLAZA } from "@/lib/paneles-flotantes";
import {
    BOTON_DE_ENVIAR,
    BOTON_DE_HERRAMIENTA,
    BOTON_REDONDO_GRABANDO,
    FILA_DE_LA_BARRA,
    MARCO_DE_LA_BARRA,
    archivosDelPortapapeles,
} from "@/lib/barra-de-escribir";
import {
    CABECERA_DEL_PANEL,
    CLASE_HUECO_ENTRE_CONTROLES,
    CONTROL_DE_ICONO,
    FILA_1_DEL_PANEL,
    FILA_2_DEL_PANEL,
    GLIFO_DE_CONTROL,
    LINEA_DEL_ESTADO,
    LINEA_DEL_NOMBRE,
} from "@/lib/cabeceras-de-chats";
import { RECORTE_A_LO_ANCHO, TIPOGRAFIA_DEL_NOMBRE } from "@/lib/nombre-del-contacto";
import {
    TOPE_DE_ADJUNTOS,
    TOPE_DE_BYTES_DEL_ENVIO,
    comoFirma,
    elDocumentoDelCorreo,
    elTamanoLegible,
    losBytesDeUnBase64,
    type CorreoCompleto,
} from "@/lib/correo";
import type { BuzonVisible } from "@/lib/correo-db";
import {
    guardarFirmaAction,
    leerCorreoAction,
    reenviarCorreoAction,
    responderCorreoAction,
    sugerirRespuestaDeCorreoAction,
} from "@/actions/correo-actions";

/**
 * Un correo ABIERTO: su cabecera, su cuerpo y la barra de escribir.
 *
 * # La cabecera es la de un panel de Chats
 *
 * `CABECERA_DEL_PANEL`: 78 px, dos filas (32 y 28), 6 de margen y 2 de borde.
 * Arriba quién lo manda —con la misma tipografía con que Chats pinta el nombre
 * de un contacto— y sus mandos; abajo el asunto y la fecha. Los mandos son
 * cajas de `CONTROL_DE_ICONO` con glifo de `GLIFO_DE_CONTROL` y el hueco de
 * `CLASE_HUECO_ENTRE_CONTROLES`: los mismos números que la cabecera de una
 * conversación, para que al pasar de un canal a otro nada cambie de tamaño.
 *
 * Los que se usan en cada correo van a la vista —responder, reenviar, marcar
 * como no leído, destacar y eliminar— y los que no, en el «⋯»: anclar y
 * archivar. Es la regla del menú de Acciones de Chats: *lo que se hace a
 * diario se ve sin desplegar nada*.
 *
 * # La barra de escribir es LA de Chats
 *
 * `ZonaDeHerramientas` y `BotonesDeLaDerecha`, de `components/shared/`, con los
 * huecos que tienen sentido en un correo: el clip, la firma y la sugerencia de
 * la IA a la izquierda, y el dictado a la derecha. Lo que es de WhatsApp —el
 * interruptor de la IA, las respuestas rápidas, las plantillas de Meta, la
 * nota interna y la nota de voz— no entra: aquí no significaría nada.
 */

type Accion = () => void;

export function LecturaDelCorreo({
    buzon,
    correoId,
    estabaSinLeer,
    destacado,
    anclado,
    alVolver,
    alMarcar,
    alEliminar,
    alArchivar,
    alMarcarNoLeido,
    alDestacar,
    alAnclar,
    alCambiarFirma,
}: {
    buzon: BuzonVisible;
    correoId: string;
    estabaSinLeer: boolean;
    destacado: boolean;
    anclado: boolean;
    alVolver: Accion;
    alMarcar: (id: string, r: { leido: boolean; motivo: string | null; reconectar: boolean }) => void;
    alEliminar: Accion;
    alArchivar: Accion;
    alMarcarNoLeido: Accion;
    alDestacar: (valor: boolean) => void;
    alAnclar: (valor: boolean) => void;
    alCambiarFirma: (firma: string | null, activa: boolean) => void;
}) {
    const buzonId = buzon.id;
    const [correo, setCorreo] = useState<CorreoCompleto | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    // Qué hace la barra: responder al remitente o reenviar a quien se escriba.
    const [modo, setModo] = useState<"responder" | "reenviar">("responder");
    const caja = useRef<HTMLTextAreaElement>(null);

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

    const irA = (m: "responder" | "reenviar") => {
        setModo(m);
        // El foco va a la caja: pulsar «Responder» y tener que buscar dónde se
        // escribe es un clic de más.
        setTimeout(() => caja.current?.focus(), 0);
    };

    return (
        <div data-lectura-de-correo className="flex h-full min-h-0 w-full flex-col">
            <CabeceraDelCorreo
                correo={correo}
                fallo={fallo}
                destacado={destacado}
                anclado={anclado}
                alVolver={alVolver}
                alResponder={() => irA("responder")}
                alReenviar={() => irA("reenviar")}
                alMarcarNoLeido={alMarcarNoLeido}
                alDestacar={() => alDestacar(!destacado)}
                alAnclar={() => alAnclar(!anclado)}
                alArchivar={alArchivar}
                alEliminar={alEliminar}
            />
            {correo && (correo.para || correo.cc) ? (
                <div data-destinatarios className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
                    {correo.para ? <p className="truncate" title={correo.para}>Para: {correo.para}</p> : null}
                    {correo.cc ? <p className="truncate" title={correo.cc}>Cc: {correo.cc}</p> : null}
                </div>
            ) : null}
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
                <BarraDeResponder
                    key={correoId}
                    buzon={buzon}
                    correoId={correoId}
                    correo={correo}
                    modo={modo}
                    alCambiarModo={setModo}
                    caja={caja}
                    alCambiarFirma={alCambiarFirma}
                />
            ) : null}
        </div>
    );
}

/* ─────────────────────────────── la cabecera ─────────────────────────────── */

/** Las iniciales del remitente, para su círculo: como el avatar de un contacto sin foto en Chats. */
function lasIniciales(nombre: string): string {
    const partes = nombre.replace(/[<>"@].*$/, "").trim().split(/\s+/).filter(Boolean);
    const letras = (partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? "?").slice(0, 2)) || "?";
    return letras.toUpperCase();
}

/** La caja de un mando de la cabecera: la de Chats (borde, fondo y hover), con su lado de 28 px. */
const MANDO = cn(
    CONTROL_DE_ICONO,
    "w-7 shrink-0 rounded-md border border-input bg-background p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
);

function CabeceraDelCorreo({
    correo,
    fallo,
    destacado,
    anclado,
    alVolver,
    alResponder,
    alReenviar,
    alMarcarNoLeido,
    alDestacar,
    alAnclar,
    alArchivar,
    alEliminar,
}: {
    correo: CorreoCompleto | null;
    fallo: string | null;
    destacado: boolean;
    anclado: boolean;
    alVolver: Accion;
    alResponder: Accion;
    alReenviar: Accion;
    alMarcarNoLeido: Accion;
    alDestacar: Accion;
    alAnclar: Accion;
    alArchivar: Accion;
    alEliminar: Accion;
}) {
    const remitente = correo ? correo.de || correo.deDireccion || "(sin remitente)" : fallo ?? "Abriendo…";
    const mando = (etiqueta: string, icono: React.ReactNode, alPulsar: Accion, extra?: string, marcado?: boolean) => (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={etiqueta}
            aria-pressed={marcado}
            title={etiqueta}
            onClick={alPulsar}
            disabled={!correo}
            className={cn(MANDO, extra)}
        >
            {icono}
        </Button>
    );
    return (
        <div data-cabecera-del-correo className={CABECERA_DEL_PANEL}>
            <div className={FILA_1_DEL_PANEL}>
                <Button variant="ghost" size="icon" className={cn(MANDO, "md:hidden")} aria-label="Volver" onClick={alVolver}>
                    <ArrowLeft className={GLIFO_DE_CONTROL} />
                </Button>
                <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                    {correo ? lasIniciales(correo.de || correo.deDireccion) : <Mail className={GLIFO_DE_CONTROL} />}
                </span>
                <div data-remitente-del-correo className="flex min-w-0 flex-1 flex-col justify-center">
                    <span className={cn(TIPOGRAFIA_DEL_NOMBRE, RECORTE_A_LO_ANCHO, LINEA_DEL_NOMBRE, "!normal-case text-sm")} title={remitente}>
                        {remitente}
                    </span>
                    {correo?.deDireccion && correo.deDireccion !== correo.de ? (
                        <span className={cn(RECORTE_A_LO_ANCHO, LINEA_DEL_ESTADO, "text-muted-foreground")} title={correo.deDireccion}>
                            {correo.deDireccion}
                        </span>
                    ) : null}
                </div>
                <div data-mandos-del-correo className={cn("flex shrink-0 items-center", CLASE_HUECO_ENTRE_CONTROLES)}>
                    {mando("Responder", <Reply className={GLIFO_DE_CONTROL} />, alResponder)}
                    {mando("Reenviar", <Forward className={GLIFO_DE_CONTROL} />, alReenviar)}
                    {mando("Marcar como no leído", <Mail className={GLIFO_DE_CONTROL} />, alMarcarNoLeido)}
                    {mando(
                        destacado ? "Quitar destacado" : "Destacar",
                        <Star className={cn(GLIFO_DE_CONTROL, destacado && "fill-amber-400 text-amber-500")} />,
                        alDestacar,
                        undefined,
                        destacado,
                    )}
                    {mando("Eliminar este correo", <Trash2 className={GLIFO_DE_CONTROL} />, alEliminar, "hover:text-destructive")}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" aria-label="Más acciones del correo" title="Más" disabled={!correo} className={MANDO}>
                                <MoreHorizontal className={GLIFO_DE_CONTROL} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={alAnclar}>
                                {anclado ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                                {anclado ? "Desanclar" : "Anclar arriba"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={alArchivar}>
                                <Archive className="mr-2 h-4 w-4" />
                                Archivar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <div className={FILA_2_DEL_PANEL}>
                <h2 data-asunto-del-correo className="min-w-0 flex-1 truncate text-sm font-semibold" title={correo?.asunto}>
                    {correo ? correo.asunto || "(sin asunto)" : ""}
                </h2>
                {correo?.fecha ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(correo.fecha).toLocaleString("es")}</span>
                ) : null}
            </div>
        </div>
    );
}

/* ────────────────────────────── la barra de escribir ────────────────────── */

function BarraDeResponder({
    buzon,
    correoId,
    correo,
    modo,
    alCambiarModo,
    caja,
    alCambiarFirma,
}: {
    buzon: BuzonVisible;
    correoId: string;
    correo: CorreoCompleto;
    modo: "responder" | "reenviar";
    alCambiarModo: (m: "responder" | "reenviar") => void;
    caja: React.RefObject<HTMLTextAreaElement>;
    alCambiarFirma: (firma: string | null, activa: boolean) => void;
}) {
    const buzonId = buzon.id;
    const [texto, setTexto] = useState("");
    const [para, setPara] = useState("");
    const [adjuntos, setAdjuntos] = useState<ComposeMedia[]>([]);
    const [enviando, setEnviando] = useState(false);
    const [herramientas, setHerramientas] = useState(false);
    const [sugerencia, setSugerencia] = useState("");
    const [sugiriendo, setSugiriendo] = useState(false);
    const [motivoSinSugerencia, setMotivoSinSugerencia] = useState<string | null>(null);
    const { compacta, medir } = useBarraCompacta();
    const dictado = useSpeechDictation();

    // La caja crece con el texto hasta su tope EN LÍNEAS, con el mismo gancho
    // que Chats y el chat de equipo: es la misma barra de escribir.
    useAltoDeLaCaja({ ref: caja, texto, reiniciarCon: correoId });

    useEffect(() => {
        if (!compacta) setHerramientas(false);
    }, [compacta]);

    const bytesAdjuntos = adjuntos.reduce((n, a) => n + losBytesDeUnBase64(a.dataUrl.replace(/^data:[^,]*,/, "")), 0);

    const adjuntar = useCallback(
        (m: ComposeMedia | null) => {
            if (!m) return;
            if (adjuntos.length >= TOPE_DE_ADJUNTOS) {
                toast.error(`Como mucho ${TOPE_DE_ADJUNTOS} archivos por correo.`);
                return;
            }
            const bytes = losBytesDeUnBase64(m.dataUrl.replace(/^data:[^,]*,/, ""));
            // Se dice ANTES de subir nada: el servidor lo volvería a rechazar,
            // pero después de un rato de barra sin decir por qué.
            if (bytesAdjuntos + bytes > TOPE_DE_BYTES_DEL_ENVIO) {
                toast.error("Los adjuntos pasan de 25 MB: es el tope de un correo.");
                return;
            }
            setAdjuntos((a) => [...a, m]);
            setHerramientas(false);
        },
        [adjuntos.length, bytesAdjuntos],
    );

    /** Pegar una captura la ADJUNTA, como en Chats. Solo si el portapapeles trae archivos: el texto se pega como siempre. */
    const pegar = useCallback(
        async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
            const [fichero] = archivosDelPortapapeles(e.clipboardData?.items);
            if (!fichero) return;
            e.preventDefault();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result));
                fr.onerror = reject;
                fr.readAsDataURL(fichero);
            });
            // Una captura pegada se llama siempre «image.png»: con la hora se distinguen.
            const nombre = fichero.name && fichero.name !== "image.png" ? fichero.name : `captura-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.png`;
            adjuntar({
                mediatype: fichero.type.startsWith("image/") ? "image" : "document",
                dataUrl,
                mimeType: fichero.type || "application/octet-stream",
                fileName: nombre,
            });
        },
        [adjuntar],
    );

    const hayAlgoQueEnviar = modo === "reenviar" ? para.trim().length > 0 : texto.trim().length > 0;

    async function enviar() {
        if (!hayAlgoQueEnviar || enviando) return;
        if (dictado.listening) dictado.stop();
        setEnviando(true);
        const archivos = adjuntos.map((a) => ({ nombre: a.fileName, tipo: a.mimeType, base64: a.dataUrl }));
        try {
            const r =
                modo === "reenviar"
                    ? await reenviarCorreoAction(buzonId, correoId, para, texto, archivos)
                    : await responderCorreoAction(buzonId, correoId, texto, archivos);
            if (!r.success) {
                toast.error(r.message);
                return;
            }
            toast.success(modo === "reenviar" ? "Correo reenviado." : "Respuesta enviada.");
            setTexto("");
            setPara("");
            setAdjuntos([]);
            setSugerencia("");
            alCambiarModo("responder");
        } catch {
            toast.error("No se pudo enviar. Revisa la conexión.");
        } finally {
            setEnviando(false);
        }
    }

    async function sugerir() {
        setHerramientas(false);
        setSugerencia("");
        setMotivoSinSugerencia(null);
        setSugiriendo(true);
        try {
            const r = await sugerirRespuestaDeCorreoAction(buzonId, correoId, texto);
            if (r.success) setSugerencia(r.sugerencia);
            else setMotivoSinSugerencia(r.message);
        } catch {
            setMotivoSinSugerencia("No se pudo pedir la sugerencia. Revisa la conexión.");
        } finally {
            setSugiriendo(false);
        }
    }

    const estadoDeLaDerecha = {
        compacta,
        conVoz: true,
        conNota: false,
        hayDictado: dictado.supported,
        dictando: dictado.listening,
        grabando: false,
        hayAlgoQueEnviar,
    };

    // La firma se pinta en dos sitios —en fila con sitio, dentro del «+» sin
    // él—, como en Chats, y por eso el `Popover` va SIN `open` controlado.
    const firma = (
        <ControlDeLaFirma key="firma" buzon={buzon} alCambiarFirma={alCambiarFirma} />
    );

    const destinatario = correo.de || correo.deDireccion;

    return (
        <>
            <SuggestedReplyBar
                suggestion={sugerencia}
                isLoading={sugiriendo}
                hasError={Boolean(motivoSinSugerencia)}
                motivo={motivoSinSugerencia}
                onUse={(t) => {
                    setTexto(t);
                    setSugerencia("");
                    setTimeout(() => caja.current?.focus(), 0);
                }}
                onRegenerate={() => void sugerir()}
                onDismiss={() => {
                    setSugerencia("");
                    setMotivoSinSugerencia(null);
                }}
            />
            <div ref={medir} data-barra="escribir" data-barra-del-correo className={cn(MARCO_DE_LA_BARRA, "bg-gray-50 dark:bg-gray-900")}>
                {modo === "reenviar" ? (
                    // Como la cita de Chats: una franja encima de la caja que dice a
                    // quién va y se cancela con su X.
                    <div data-reenviar-a className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-blue-500 bg-blue-50 px-2.5 py-1.5 dark:bg-blue-950/50">
                        <Forward className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">Reenviar a</span>
                        <Input
                            value={para}
                            onChange={(e) => setPara(e.target.value)}
                            placeholder="correo@ejemplo.com, otro@ejemplo.com"
                            aria-label="Reenviar a"
                            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                            autoFocus
                        />
                        <button
                            type="button"
                            aria-label="Cancelar el reenvío"
                            onClick={() => alCambiarModo("responder")}
                            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : null}
                {adjuntos.length ? (
                    <div data-adjuntos-para-enviar className="mb-2 flex flex-wrap gap-1.5">
                        {adjuntos.map((a, i) => (
                            <div key={`${a.fileName}-${i}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
                                <span className="max-w-[12rem] truncate font-medium" title={a.fileName}>{a.fileName}</span>
                                <span className="shrink-0 text-muted-foreground">{elTamanoLegible(losBytesDeUnBase64(a.dataUrl.replace(/^data:[^,]*,/, "")))}</span>
                                <button
                                    type="button"
                                    aria-label={`Quitar ${a.fileName}`}
                                    onClick={() => setAdjuntos((l) => l.filter((_, j) => j !== i))}
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : null}
                <div className={FILA_DE_LA_BARRA}>
                    <ZonaDeHerramientas compacta={compacta} abierta={herramientas} alAlternar={() => setHerramientas((v) => !v)} fijo={firma}>
                        <div className={cn(compacta ? "block" : "sm:hidden")}>
                            <ControlDeLaFirma buzon={buzon} alCambiarFirma={alCambiarFirma} />
                        </div>
                        <AttachmentMenu onComposeMediaChange={adjuntar} maxBase64MB={25} />
                        <Button
                            onClick={() => void sugerir()}
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 rounded-full text-violet-500 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950"
                            aria-label="Sugerir respuesta con IA"
                            title="Sugerir respuesta con IA"
                            type="button"
                            disabled={sugiriendo}
                        >
                            <Sparkles className="h-4 w-4" />
                        </Button>
                    </ZonaDeHerramientas>
                    <Textarea
                        ref={caja}
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        onPaste={(e) => void pegar(e)}
                        placeholder={modo === "reenviar" ? "Añade un mensaje (opcional)" : `Responder a ${destinatario}`}
                        aria-label="Respuesta"
                        className={cn(
                            "min-h-10 w-full resize-none overflow-y-auto rounded-xl border border-gray-200 bg-white py-2 pl-4 text-base leading-relaxed shadow-sm transition-[height] duration-100 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:text-sm",
                            rellenoParaLosBotones(estadoDeLaDerecha),
                        )}
                        rows={1}
                        disabled={enviando}
                        onKeyDown={(e) => {
                            // En un correo Enter es un salto de línea: se manda con Ctrl+Enter.
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                void enviar();
                            }
                        }}
                    />
                    <BotonesDeLaDerecha
                        {...estadoDeLaDerecha}
                        menuAbierto={false}
                        alAlternarMenu={() => {}}
                        dictado={
                            dictado.supported
                                ? {
                                      alPulsar: () => dictado.toggle(texto, setTexto),
                                      deshabilitado: enviando,
                                      marcado: dictado.listening,
                                      etiqueta: dictado.listening ? "Detener dictado" : "Dictar por voz",
                                      titulo: dictado.listening ? "Detener dictado" : "Dictar por voz (escribe lo que hablas)",
                                      clase: dictado.listening ? `${BOTON_REDONDO_GRABANDO} animate-pulse` : undefined,
                                      icono: <AudioLines className={cn("h-3.5 w-3.5", dictado.listening ? "text-white" : "text-black dark:text-white")} />,
                                  }
                                : null
                        }
                        enviar={{
                            alPulsar: () => void enviar(),
                            deshabilitado: !hayAlgoQueEnviar || enviando,
                            etiqueta: modo === "reenviar" ? "Reenviar correo" : "Enviar respuesta",
                            titulo: modo === "reenviar" ? "Reenviar (Ctrl+Enter)" : "Enviar respuesta (Ctrl+Enter)",
                            clase: BOTON_DE_ENVIAR,
                            icono: enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : <SendIcon className="h-3.5 w-3.5 text-white" />,
                        }}
                    />
                </div>
            </div>
        </>
    );
}

/**
 * La firma del BUZÓN: el mismo botón de pluma que la firma del asesor en
 * Chats, azul cuando está activa. La que se usa la pone el servidor al enviar
 * (`conLaFirma`); aquí solo se escribe y se enciende.
 */
function ControlDeLaFirma({
    buzon,
    alCambiarFirma,
}: {
    buzon: BuzonVisible;
    alCambiarFirma: (firma: string | null, activa: boolean) => void;
}) {
    const [texto, setTexto] = useState(buzon.firma ?? "");
    const [guardando, setGuardando] = useState(false);
    const activa = buzon.firmaActiva;

    async function guardar(firma: string, encendida: boolean) {
        setGuardando(true);
        try {
            const r = await guardarFirmaAction(buzon.id, firma, encendida);
            if (!r.success) {
                toast.error(r.message);
                return;
            }
            alCambiarFirma(r.firma, r.firmaActiva);
            if (encendida && !r.firmaActiva) toast.error("Escribe una firma antes de activarla.");
        } catch {
            toast.error("No se pudo guardar la firma. Revisa la conexión.");
        } finally {
            setGuardando(false);
        }
    }

    return (
        <Popover onOpenChange={(abierto) => abierto && setTexto(buzon.firma ?? "")}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    aria-label="Firma del correo"
                    title={activa ? "Firma activa" : "Configurar la firma"}
                    className={cn(
                        BOTON_DE_HERRAMIENTA,
                        activa
                            ? "bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                >
                    <PenLine className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent {...suelto("popover", "top", "start")} className={cn("w-72 space-y-3 p-3", PANEL_QUE_SE_DESPLAZA)}>
                <p className="text-xs font-semibold text-foreground">Firma de {buzon.direccion}</p>
                <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={"Ana Pérez\nVentas · Verzay"}
                    aria-label="Texto de la firma"
                    rows={3}
                    disabled={guardando}
                    className="resize-none text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={activa}
                            onCheckedChange={(v) => void guardar(texto, v)}
                            disabled={guardando || (!comoFirma(texto) && !activa)}
                            aria-label="Añadir la firma a mis correos"
                        />
                        <span className="text-xs text-muted-foreground">Añadir a mis correos</span>
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        className="h-8 w-8 shrink-0 text-green-600 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950"
                        onClick={() => void guardar(texto, activa)}
                        disabled={guardando}
                        aria-label="Guardar firma"
                        title="Guardar firma"
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
