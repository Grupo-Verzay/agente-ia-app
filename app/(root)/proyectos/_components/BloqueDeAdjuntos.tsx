"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    FileAudio, FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    adjuntarArchivoATareaAction, quitarAdjuntoDeTareaAction,
} from "@/actions/adjuntos-de-tarea-actions";
import {
    TOPE_DE_ADJUNTOS_POR_TAREA,
    type AdjuntoDeTarea, type TipoDeAdjunto,
} from "@/lib/adjuntos-de-tarea-tipos";

/** Los cuatro de siempre, los mismos que el modal de recordatorios. */
const OPCIONES_DE_ARCHIVO = [
    { tipo: "image", label: "Imagen", accept: "image/*", Icon: ImageIcon, color: "text-sky-600" },
    { tipo: "video", label: "Video", accept: "video/*", Icon: Video, color: "text-rose-600" },
    { tipo: "audio", label: "Audio", accept: "audio/*", Icon: FileAudio, color: "text-emerald-600" },
    { tipo: "document", label: "Doc.", accept: ".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf", Icon: FileText, color: "text-amber-600" },
] as const;

function pesoLegible(bytes: number | null) {
    if (!bytes) return null;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function iconoDe(tipo: TipoDeAdjunto) {
    const opcion = OPCIONES_DE_ARCHIVO.find((o) => o.tipo === tipo) ?? OPCIONES_DE_ARCHIVO[3];
    return opcion.Icon;
}

function tipoDe(mime: string): TipoDeAdjunto {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
}

/**
 * Una captura pegada **no trae nombre**: el portapapeles da un `File` llamado
 * «image.png» o directamente vacío, y con eso la lista sale con tres archivos
 * que se llaman igual y no hay forma de distinguirlos.
 *
 * Se le pone la hora, que es lo único que de verdad los separa.
 */
function nombreParaLoPegado(archivo: File): string {
    const suyo = archivo.name?.trim();
    if (suyo && suyo.toLowerCase() !== "image.png" && suyo.toLowerCase() !== "blob") return suyo;

    const ahora = new Date();
    const sello = ahora.toLocaleString("sv-SE").replace(/[: ]/g, "-");
    const extension = (archivo.type.split("/")[1] || "png").split("+")[0];
    return `captura-${sello}.${extension}`;
}

/** Un archivo ya subido al bucket que todavía no cuelga de ninguna tarea. */
type AdjuntoEnElAire = {
    /** Local, solo para la lista: la fila todavía no existe en la base. */
    id: string;
    url: string;
    nombre: string;
    tipo: TipoDeAdjunto;
    mimeType?: string;
    tamanoBytes: number;
};

/**
 * Adjuntar archivos a una tarea, por las tres vías: botón, arrastrar y pegar.
 *
 * El archivo sube por `/api/upload` —la misma ruta que usa el recordatorio— y
 * lo que se guarda es su dirección.
 *
 * ## Se puede adjuntar ANTES de que la tarea exista
 *
 * Antes no: los botones salían apagados con un «podrás adjuntar cuando la tarea
 * esté creada», y eso obliga a crear la tarea, reabrirla y volver a buscar la
 * captura — justo cuando la tienes recién recortada en el portapapeles.
 *
 * Ahora el archivo **sube igual** y se queda «en el aire»: en el bucket, con su
 * dirección, pero sin colgar de ninguna tarea. Al guardar, quien crea la tarea
 * los engancha con el id recién nacido (`engancharLosDelAire`). Y si se cancela
 * el diálogo, se borran del bucket (`/api/upload/borrar`).
 *
 * Esa limpieza es la contrapartida de subir antes de tiempo, y es la razón por
 * la que antes no se hacía. Es **best-effort a propósito**: si el navegador se
 * cierra a media faena el archivo se queda, y eso ya pasaba —quitar un adjunto
 * de una tarea guardada nunca ha borrado el fichero, solo la fila—. Lo que no
 * puede pasar es que cancelar un diálogo deje basura **cada vez**.
 *
 * ## Y las tres formas son la misma función
 *
 * `subirArchivos` es el único camino: el botón, el `drop` y el `paste` le pasan
 * una lista de `File` y ya. Con tres caminos separados, el día que se afine algo
 * —el tope, el aviso, el tipo— se afina en uno y los otros dos se quedan atrás,
 * y eso no se ve como un error sino como «a veces funciona».
 */
export function BloqueDeAdjuntos({
    taskId,
    userId,
    adjuntos,
    onCambio,
    enElAire,
    onCambioEnElAire,
}: {
    /** `null` mientras la tarea no existe. Ya no apaga nada. */
    taskId: number | null;
    userId: string;
    adjuntos: AdjuntoDeTarea[];
    onCambio: (siguientes: AdjuntoDeTarea[]) => void;
    /** Los que subieron antes de que la tarea existiera. */
    enElAire: AdjuntoEnElAire[];
    onCambioEnElAire: (siguientes: AdjuntoEnElAire[]) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const zonaRef = useRef<HTMLDivElement>(null);
    const [accept, setAccept] = useState("image/*");
    const [subiendo, setSubiendo] = useState(false);
    const [quitando, setQuitando] = useState<string | null>(null);
    const [encima, setEncima] = useState(false);

    const cuantos = adjuntos.length + enElAire.length;
    const lleno = cuantos >= TOPE_DE_ADJUNTOS_POR_TAREA;

    // Lo que hay ahora mismo, leído por referencia: los manejadores de `paste`
    // y `drop` se montan una vez y si dependieran del estado se volverían a
    // montar en cada subida.
    const estado = useRef({ taskId, adjuntos, enElAire, subiendo, lleno });
    estado.current = { taskId, adjuntos, enElAire, subiendo, lleno };

    const elegir = (opcion: (typeof OPCIONES_DE_ARCHIVO)[number]) => {
        setAccept(opcion.accept);
        requestAnimationFrame(() => inputRef.current?.click());
    };

    /**
     * El único camino de subida. Lo usan las tres formas.
     *
     * Sube **de una en una** y no en paralelo: son archivos grandes contra la
     * misma ruta, y soltar cinco a la vez se come el ancho de banda y llegan
     * todas peor. Además así el tope se respeta archivo a archivo en vez de
     * colarse cinco de golpe cuando solo cabían dos.
     */
    const subirArchivos = useCallback(async (archivos: File[]) => {
        if (!archivos.length || estado.current.subiendo) return;

        const hueco = TOPE_DE_ADJUNTOS_POR_TAREA
            - estado.current.adjuntos.length - estado.current.enElAire.length;
        if (hueco <= 0) {
            toast.error(`Máximo ${TOPE_DE_ADJUNTOS_POR_TAREA} archivos por tarea.`);
            return;
        }
        // Se dice lo que NO va a entrar. Sin esto, soltar seis archivos con
        // hueco para dos sube dos y se callan cuatro, y parece que fallaron.
        if (archivos.length > hueco) {
            toast.error(
                `Solo caben ${hueco} ${hueco === 1 ? "archivo más" : "archivos más"}; ` +
                "el resto no se subió.",
            );
        }

        setSubiendo(true);
        const nuevosGuardados: AdjuntoDeTarea[] = [];
        const nuevosEnElAire: AdjuntoEnElAire[] = [];

        try {
            for (const archivo of archivos.slice(0, hueco)) {
                const nombre = nombreParaLoPegado(archivo);
                const tipo = tipoDe(archivo.type);

                const formData = new FormData();
                formData.append("file", archivo);
                formData.append("userID", userId);
                formData.append("workflowID", "tareas");

                const respuesta = await fetch("/api/upload", { method: "POST", body: formData });
                const datos = await respuesta.json().catch(() => null);
                if (!respuesta.ok || !datos?.url) {
                    throw new Error(datos?.error || "No se pudo subir el archivo.");
                }
                const url = datos.url as string;

                // Con tarea, se engancha ya. Sin ella, queda en el aire.
                if (estado.current.taskId) {
                    const res = await adjuntarArchivoATareaAction({
                        taskId: estado.current.taskId,
                        url,
                        nombre,
                        tipo,
                        mimeType: archivo.type || undefined,
                        tamanoBytes: archivo.size,
                    });
                    if (!res.success || !res.data) throw new Error(res.message);
                    nuevosGuardados.push(res.data);
                } else {
                    nuevosEnElAire.push({
                        id: `aire-${Date.now()}-${nuevosEnElAire.length}`,
                        url,
                        nombre,
                        tipo,
                        mimeType: archivo.type || undefined,
                        tamanoBytes: archivo.size,
                    });
                }
            }

            // Se aplica al final y de una: subiendo uno a uno, tocar el estado
            // en cada vuelta repinta la lista N veces para nada.
            if (nuevosGuardados.length) onCambio([...estado.current.adjuntos, ...nuevosGuardados]);
            if (nuevosEnElAire.length) onCambioEnElAire([...estado.current.enElAire, ...nuevosEnElAire]);
            toast.success(
                nuevosGuardados.length + nuevosEnElAire.length === 1
                    ? "Archivo adjuntado."
                    : "Archivos adjuntados.",
            );
        } catch (error) {
            // Lo que YA subió antes del fallo se conserva: tirarlo sería perder
            // trabajo hecho por un archivo que falló.
            if (nuevosGuardados.length) onCambio([...estado.current.adjuntos, ...nuevosGuardados]);
            if (nuevosEnElAire.length) onCambioEnElAire([...estado.current.enElAire, ...nuevosEnElAire]);
            // Un fallo aquí no puede ser mudo: sin aviso se ve como un botón que
            // no hace nada, que es de lo más difícil de contar por teléfono.
            toast.error(error instanceof Error ? error.message : "No se pudo subir el archivo.");
        } finally {
            setSubiendo(false);
        }
    }, [userId, onCambio, onCambioEnElAire]);

    const alElegirArchivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
        const archivos = Array.from(evento.target.files ?? []);
        // El valor se limpia SIEMPRE: si no, elegir dos veces el mismo archivo
        // no dispara el evento la segunda vez y parece que el botón no hace nada.
        if (inputRef.current) inputRef.current.value = "";
        void subirArchivos(archivos);
    };

    /**
     * Pegar con Ctrl+V, que es lo que uno hace de verdad: recortar una captura
     * y pegarla.
     *
     * Va colgado del **diálogo entero**, no de este recuadro: quien acaba de
     * recortar tiene el cursor donde sea, y obligarle a pinchar primero en el
     * bloque es pedirle que adivine.
     *
     * Y por eso mismo la condición importa: **solo si el portapapeles trae
     * archivos**. Pegar texto en el título no puede acabar adjuntando nada.
     */
    useEffect(() => {
        const dialogo = zonaRef.current?.closest("[role='dialog']");
        if (!dialogo) return;

        const alPegar = (evento: Event) => {
            const portapapeles = (evento as ClipboardEvent).clipboardData;
            const archivos = Array.from(portapapeles?.files ?? []);
            if (!archivos.length) return;
            // Solo cuando SÍ hay archivos: así un pegado de texto en cualquier
            // campo sigue comportándose como siempre.
            evento.preventDefault();
            void subirArchivos(archivos);
        };

        dialogo.addEventListener("paste", alPegar);
        return () => dialogo.removeEventListener("paste", alPegar);
    }, [subirArchivos]);

    const quitarGuardado = async (adjunto: AdjuntoDeTarea) => {
        if (!taskId) return;
        setQuitando(adjunto.id);
        const res = await quitarAdjuntoDeTareaAction({ taskId, adjuntoId: adjunto.id });
        setQuitando(null);
        if (!res.success) { toast.error(res.message); return; }
        onCambio(adjuntos.filter((a) => a.id !== adjunto.id));
    };

    /** Quitar uno que todavía está en el aire: se borra del bucket, que es suyo. */
    const quitarDelAire = async (adjunto: AdjuntoEnElAire) => {
        setQuitando(adjunto.id);
        onCambioEnElAire(enElAire.filter((a) => a.id !== adjunto.id));
        await borrarDelBucket(adjunto.url);
        setQuitando(null);
    };

    return (
        <div
            ref={zonaRef}
            // Arrastrar y soltar. `dragover` necesita su `preventDefault` o el
            // navegador abre el archivo en una pestaña en vez de soltarlo aquí.
            onDragOver={(e) => { e.preventDefault(); if (!lleno && !subiendo) setEncima(true); }}
            onDragLeave={(e) => {
                // Solo cuando se sale del bloque de verdad: pasar por encima de
                // un hijo dispara `dragleave` del padre y el resaltado parpadea.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false);
            }}
            onDrop={(e) => {
                e.preventDefault();
                setEncima(false);
                void subirArchivos(Array.from(e.dataTransfer.files ?? []));
            }}
            className={cn(
                "space-y-2.5 rounded-lg border border-dashed bg-muted/30 p-3 transition-colors",
                encima && "border-blue-400 bg-blue-50/70 dark:bg-blue-950/30",
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={alElegirArchivo}
            />

            <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-blue-600 shadow-sm">
                    <Paperclip className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-semibold leading-none">Archivos</p>
                    {/* Las tres formas se dicen aquí. Arrastrar y pegar no se
                        ven por ningún lado si no se cuentan, y pegar es la que
                        más se usa. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                        Opcional. Elige, arrastra aquí o pega con Ctrl+V.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {OPCIONES_DE_ARCHIVO.map((opcion) => {
                    const Icon = opcion.Icon;
                    return (
                        <Button
                            key={opcion.tipo}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={subiendo || lleno}
                            className="h-9 gap-1.5 px-2 text-sm font-medium bg-background hover:border-blue-200 hover:bg-blue-50/60"
                            onClick={() => elegir(opcion)}
                        >
                            <Icon className={`h-4 w-4 ${opcion.color}`} />
                            <span className="truncate">{opcion.label}</span>
                        </Button>
                    );
                })}
            </div>

            {subiendo && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…
                </p>
            )}

            {cuantos > 0 ? (
                <ul className="space-y-1.5">
                    {adjuntos.map((adjunto) => (
                        <Fila
                            key={adjunto.id}
                            adjunto={adjunto}
                            quitando={quitando === adjunto.id}
                            onQuitar={() => void quitarGuardado(adjunto)}
                        />
                    ))}
                    {enElAire.map((adjunto) => (
                        <Fila
                            key={adjunto.id}
                            adjunto={adjunto}
                            quitando={quitando === adjunto.id}
                            onQuitar={() => void quitarDelAire(adjunto)}
                        />
                    ))}
                </ul>
            ) : (
                !subiendo && (
                    <p className="text-xs text-muted-foreground">
                        Imagen, video, audio o documento.
                    </p>
                )
            )}

            {lleno && (
                <p className="text-xs text-amber-600">
                    Máximo {TOPE_DE_ADJUNTOS_POR_TAREA} archivos por tarea.
                </p>
            )}
        </div>
    );
}

function Fila({
    adjunto,
    quitando,
    onQuitar,
}: {
    adjunto: { id: string; url: string; nombre: string; tipo: TipoDeAdjunto; tamanoBytes: number | null };
    quitando: boolean;
    onQuitar: () => void;
}) {
    const Icon = iconoDe(adjunto.tipo);
    const peso = pesoLegible(adjunto.tamanoBytes);
    return (
        <li className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
            </span>
            <a
                href={adjunto.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 hover:underline"
                title={adjunto.nombre}
            >
                <p className="truncate text-xs font-medium">{adjunto.nombre}</p>
                {peso && <p className="text-xs text-muted-foreground">{peso}</p>}
            </a>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={quitando}
                onClick={onQuitar}
            >
                {quitando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
        </li>
    );
}

/**
 * Borrar del bucket algo que se subió y no se usó.
 *
 * Nunca lanza: quien la llama está cancelando un diálogo o quitando una fila, y
 * eso tiene que suceder igual. Pero no es muda.
 */
export async function borrarDelBucket(url: string): Promise<void> {
    try {
        await fetch("/api/upload/borrar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });
    } catch (error) {
        console.warn("[adjuntos] no se pudo borrar del bucket un archivo sin usar", {
            url,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Engancha a una tarea recién creada los archivos que subieron antes que ella.
 *
 * Devuelve los que sí quedaron enganchados. **No lanza**: la tarea ya está
 * creada y un adjunto que falle no puede deshacerla; se dice y se sigue.
 */
export async function engancharLosDelAire(
    taskId: number,
    enElAire: AdjuntoEnElAire[],
): Promise<number> {
    let enganchados = 0;
    for (const a of enElAire) {
        try {
            const res = await adjuntarArchivoATareaAction({
                taskId,
                url: a.url,
                nombre: a.nombre,
                tipo: a.tipo,
                mimeType: a.mimeType,
                tamanoBytes: a.tamanoBytes,
            });
            if (res.success) enganchados += 1;
            else throw new Error(res.message);
        } catch (error) {
            console.warn("[adjuntos] no se pudo enganchar un archivo a la tarea nueva", {
                taskId,
                nombre: a.nombre,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    if (enganchados < enElAire.length) {
        toast.error(
            enElAire.length - enganchados === 1
                ? "Un archivo no se pudo adjuntar a la tarea."
                : `${enElAire.length - enganchados} archivos no se pudieron adjuntar a la tarea.`,
        );
    }
    return enganchados;
}

export type { AdjuntoEnElAire };
