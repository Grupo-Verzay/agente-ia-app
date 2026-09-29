"use client";

import { useCallback, useState } from "react";
import { Check, PenLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ComposeMedia } from "@/app/(root)/chats/_components/attachment-menu";
import { cn } from "@/lib/utils";
import { suelto, PANEL_QUE_SE_DESPLAZA } from "@/lib/paneles-flotantes";
import { BOTON_DE_HERRAMIENTA, archivosDelPortapapeles } from "@/lib/barra-de-escribir";
import { TOPE_DE_ADJUNTOS, TOPE_DE_BYTES_DEL_ENVIO, comoFirma, elTamanoLegible, losBytesDeUnBase64 } from "@/lib/correo";
import type { BuzonVisible } from "@/lib/correo-db";
import { guardarFirmaAction } from "@/actions/correo-actions";

/**
 * Las piezas que comparten las DOS formas de escribir un correo: la barra de
 * responder/reenviar de un correo abierto y el panel de redactar uno nuevo.
 * Los archivos (tope, pegar una captura, la lista con su «quitar») y la firma
 * del buzón viven aquí y en ningún otro sitio: con una copia en cada panel, el
 * día que se afine una la otra se queda atrás, y eso se ve como que «en correo
 * nuevo a veces no deja adjuntar».
 */

const sinCabecera = (dataUrl: string) => dataUrl.replace(/^data:[^,]*,/, "");

export function useAdjuntosParaEnviar(alAdjuntar?: () => void) {
    const [adjuntos, setAdjuntos] = useState<ComposeMedia[]>([]);
    const bytesAdjuntos = adjuntos.reduce((n, a) => n + losBytesDeUnBase64(sinCabecera(a.dataUrl)), 0);

    const adjuntar = useCallback(
        (m: ComposeMedia | null) => {
            if (!m) return;
            if (adjuntos.length >= TOPE_DE_ADJUNTOS) {
                toast.error(`Como mucho ${TOPE_DE_ADJUNTOS} archivos por correo.`);
                return;
            }
            const bytes = losBytesDeUnBase64(sinCabecera(m.dataUrl));
            // Se dice ANTES de subir nada: el servidor lo volvería a rechazar,
            // pero después de un rato de barra sin decir por qué.
            if (bytesAdjuntos + bytes > TOPE_DE_BYTES_DEL_ENVIO) {
                toast.error("Los adjuntos pasan de 25 MB: es el tope de un correo.");
                return;
            }
            setAdjuntos((a) => [...a, m]);
            alAdjuntar?.();
        },
        [adjuntos.length, bytesAdjuntos, alAdjuntar],
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

    const quitar = useCallback((i: number) => setAdjuntos((l) => l.filter((_, j) => j !== i)), []);
    const vaciar = useCallback(() => setAdjuntos([]), []);
    /** Lo que viaja a la acción: el `dataUrl` entero, que el servidor limpia. */
    const paraEnviar = () => adjuntos.map((a) => ({ nombre: a.fileName, tipo: a.mimeType, base64: a.dataUrl }));

    return { adjuntos, adjuntar, pegar, quitar, vaciar, paraEnviar };
}

/** La lista de archivos que van a salir, cada uno con su tamaño y su «quitar». */
export function AdjuntosParaEnviar({ adjuntos, alQuitar }: { adjuntos: ComposeMedia[]; alQuitar: (i: number) => void }) {
    if (!adjuntos.length) return null;
    return (
        <div data-adjuntos-para-enviar className="mb-2 flex flex-wrap gap-1.5">
            {adjuntos.map((a, i) => (
                <div key={`${a.fileName}-${i}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
                    <span className="max-w-[12rem] truncate font-medium" title={a.fileName}>{a.fileName}</span>
                    <span className="shrink-0 text-muted-foreground">{elTamanoLegible(losBytesDeUnBase64(sinCabecera(a.dataUrl)))}</span>
                    <button
                        type="button"
                        aria-label={`Quitar ${a.fileName}`}
                        onClick={() => alQuitar(i)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
        </div>
    );
}

/**
 * La firma del BUZÓN: el mismo botón de pluma que la firma del asesor en
 * Chats, azul cuando está activa. La que se usa la pone el servidor al enviar
 * (`conLaFirma`); aquí solo se escribe y se enciende.
 */
export function ControlDeLaFirma({
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
