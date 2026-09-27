"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, Forward, Image as ImageIcon, Loader2, Mic, Search, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelLateral } from "@/components/shared/PanelLateral";
import { InsigniaDeLinea } from "@/components/shared/InsigniaDeLinea";
import { PANEL_DE_REENVIAR } from "@/lib/panel-lateral";
import { cn } from "@/lib/utils";
import {
    TOPE_DE_DESTINOS,
    llaveDelDestino,
    pasaLaBusqueda,
    type DestinoDelReenvio,
    type Reenvio,
} from "@/lib/reenviar-mensaje";

/** Cuántas filas se pintan como mucho: la lista es la bandeja entera y puede tener miles. */
const FILAS_A_LA_VISTA = 200;

/**
 * El panel de «Reenviar»: la lista de conversaciones con buscador, elegir una o
 * varias y confirmar. Es un `PanelLateral` como «Enviar al equipo», así que sale
 * por el mismo sitio y entra en la misma exclusión.
 *
 * No envía nada por su cuenta: devuelve lo elegido a la bandeja, que es quien
 * sabe por qué línea sale cada conversación (ver `lib/reenviar-mensaje`).
 */
export function ReenviarMensaje({
    abierto,
    onCerrar,
    reenvio,
    destinos,
    onReenviar,
}: {
    abierto: boolean;
    onCerrar: () => void;
    /** Lo que se reenvía, para enseñarlo arriba. */
    reenvio: Reenvio | null;
    /** Las conversaciones que se pueden elegir (sin la de origen). */
    destinos: DestinoDelReenvio[];
    /** Manda a los elegidos. Resuelve cuando ha terminado con todos. */
    onReenviar: (elegidos: DestinoDelReenvio[]) => Promise<void>;
}) {
    const [busqueda, setBusqueda] = useState("");
    const [elegidos, setElegidos] = useState<DestinoDelReenvio[]>([]);
    const [enviando, setEnviando] = useState(false);
    const buscador = useRef<HTMLInputElement>(null);

    // Cada vez que se abre, de cero: lo elegido para otro mensaje no vale aquí.
    useEffect(() => {
        if (!abierto) return;
        setBusqueda("");
        setElegidos([]);
        const t = window.setTimeout(() => buscador.current?.focus(), 50);
        return () => window.clearTimeout(t);
    }, [abierto, reenvio]);

    const cerrar = useCallback(() => {
        if (enviando) return;
        onCerrar();
    }, [enviando, onCerrar]);

    const llavesElegidas = useMemo(() => new Set(elegidos.map(llaveDelDestino)), [elegidos]);
    const variasLineas = useMemo(() => new Set(destinos.map((d) => d.linea)).size > 1, [destinos]);

    const aLaVista = useMemo(
        () => destinos.filter((d) => pasaLaBusqueda(d, busqueda)).slice(0, FILAS_A_LA_VISTA),
        [destinos, busqueda],
    );

    const lleno = elegidos.length >= TOPE_DE_DESTINOS;

    const alternar = (destino: DestinoDelReenvio) => {
        const llave = llaveDelDestino(destino);
        setElegidos((antes) => {
            if (antes.some((d) => llaveDelDestino(d) === llave)) {
                return antes.filter((d) => llaveDelDestino(d) !== llave);
            }
            // El tope se dice en el contador y apagando las filas; aquí solo se
            // impide pasarlo.
            if (antes.length >= TOPE_DE_DESTINOS) return antes;
            return [...antes, destino];
        });
    };

    const reenviar = async () => {
        if (enviando || elegidos.length === 0) return;
        setEnviando(true);
        try {
            await onReenviar(elegidos);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <PanelLateral
            id={PANEL_DE_REENVIAR}
            abierto={abierto}
            onCerrar={cerrar}
            titulo="Reenviar mensaje"
            subtitulo={`Elige hasta ${TOPE_DE_DESTINOS} conversaciones`}
            icono={<Forward className="h-4 w-4" />}
            pie={
                <>
                    <Button variant="ghost" onClick={cerrar} disabled={enviando}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={() => void reenviar()}
                        disabled={enviando || elegidos.length === 0}
                        data-confirmar-reenvio=""
                    >
                        {enviando ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Reenviando…
                            </>
                        ) : (
                            <>
                                <Forward className="mr-2 h-4 w-4" />
                                {elegidos.length > 0 ? `Reenviar (${elegidos.length})` : "Reenviar"}
                            </>
                        )}
                    </Button>
                </>
            }
        >
            <div className="flex min-h-0 flex-col gap-3 px-4 py-4" data-panel-reenviar="">
                <VistaDelMensaje reenvio={reenvio} />

                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        ref={buscador}
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por nombre o número"
                        aria-label="Buscar conversación"
                        className="pl-8"
                        disabled={enviando}
                        data-buscar-reenvio=""
                    />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Conversaciones</span>
                    <span className={cn("tabular-nums", lleno && "font-medium text-foreground")} data-contador-reenvio="">
                        {elegidos.length}/{TOPE_DE_DESTINOS}
                    </span>
                </div>

                {aLaVista.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        {destinos.length === 0 ? "No hay otras conversaciones." : "Ninguna conversación coincide."}
                    </p>
                ) : (
                    <ul className="space-y-0.5" role="listbox" aria-multiselectable="true" aria-label="Conversaciones">
                        {aLaVista.map((d) => {
                            const llave = llaveDelDestino(d);
                            const marcado = llavesElegidas.has(llave);
                            const apagado = !marcado && lleno;
                            return (
                                <li key={llave}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={marcado}
                                        disabled={enviando || apagado}
                                        onClick={() => alternar(d)}
                                        data-destino-reenvio={llave}
                                        className={cn(
                                            "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                                            marcado ? "bg-primary/10" : "hover:bg-muted/60",
                                            apagado && "cursor-not-allowed opacity-50",
                                        )}
                                    >
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                marcado ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                                            )}
                                        >
                                            {marcado && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className="truncate text-sm font-medium" title={d.nombre}>
                                                    {d.nombre}
                                                </span>
                                                {variasLineas && <InsigniaDeLinea clave={d.linea} nombre={d.linea} />}
                                            </span>
                                            {d.numero && d.numero !== d.nombre && (
                                                <span className="block truncate text-xs text-muted-foreground">{d.numero}</span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </PanelLateral>
    );
}

/** Lo que se va a reenviar, en una línea: el texto o el tipo de archivo con su pie. */
function VistaDelMensaje({ reenvio }: { reenvio: Reenvio | null }) {
    if (!reenvio) return null;
    const Icono =
        reenvio.kind === "text"
            ? null
            : reenvio.mediatype === "image"
              ? ImageIcon
              : reenvio.mediatype === "video"
                ? Video
                : reenvio.mediatype === "audio"
                  ? Mic
                  : FileText;
    const rotulo =
        reenvio.kind === "text"
            ? reenvio.text
            : reenvio.caption ||
              reenvio.fileName ||
              ({ image: "Imagen", video: "Vídeo", audio: reenvio.ptt ? "Nota de voz" : "Audio", document: "Documento" } as const)[
                  reenvio.mediatype
              ];
    return (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2" data-vista-reenvio="">
            {Icono && <Icono className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <p className="line-clamp-3 min-w-0 whitespace-pre-wrap break-words text-sm">{rotulo}</p>
        </div>
    );
}
