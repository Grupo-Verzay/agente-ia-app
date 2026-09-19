"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, LogIn, Loader2, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { DURACIONES, DURACION_POR_DEFECTO, type Duracion } from "@/lib/sala-de-video";
import { abrirLaReunionAqui } from "@/components/video/ReunionEnLaPlataforma";
import {
    crearLaSalaAction,
    lasSalasDelCanalAction,
    revocarLaSalaAction,
    type SalaParaLaPantalla,
} from "@/actions/salas-de-video-actions";

/**
 * Abrir una reunión desde un canal, y repartir su enlace.
 *
 * # Las reuniones se piden al ABRIR el diálogo
 *
 * No en cada carga del chat. El hilo del equipo corre un reloj de cinco
 * segundos y se pinta en dos sitios; una consulta más en cada vuelta, para un
 * diálogo que casi nunca se abre, es «esperar turno en vez de trabajar». Es la
 * misma decisión que el diálogo de compartir un chat.
 */
export function AbrirReunion({
    canalId,
    nombreDelCanal,
    abierto,
    onAbierto,
}: {
    canalId: string;
    nombreDelCanal: string;
    abierto: boolean;
    onAbierto: (v: boolean) => void;
}) {
    const [salas, setSalas] = useState<SalaParaLaPantalla[] | null>(null);
    const [titulo, setTitulo] = useState("");
    const [duracion, setDuracion] = useState<Duracion>(DURACION_POR_DEFECTO);
    const [creando, setCreando] = useState(false);

    const traer = useCallback(async () => {
        try {
            const res = await lasSalasDelCanalAction(canalId);
            if (!res.success) {
                toast.error(res.message);
                setSalas([]);
                return;
            }
            setSalas(res.salas);
        } catch (error) {
            // Un diálogo que se queda en «cargando» para siempre no se ve como
            // un error, se ve como que la App se colgó.
            console.warn("[reunion] no se pudieron leer las reuniones", error);
            toast.error("No se pudieron leer las reuniones.");
            setSalas([]);
        }
    }, [canalId]);

    useEffect(() => {
        if (!abierto) return;
        setSalas(null);
        void traer();
    }, [abierto, traer]);

    const crear = useCallback(async () => {
        if (creando) return;
        setCreando(true);
        try {
            const res = await crearLaSalaAction(canalId, duracion, titulo);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setTitulo("");
            setSalas((antes) => [res.sala, ...(antes ?? [])]);
            // Se abre DENTRO de la plataforma, no en otra pestaña: quien está
            // aquí tiene sesión y no hay por qué sacarle del chat desde el que
            // acaba de abrir la reunión. La pestaña aparte se queda para quien
            // entra por el enlace sin cuenta.
            onAbierto(false);
            abrirLaReunionAqui(res.sala.codigo);
        } catch (error) {
            console.warn("[reunion] no se pudo abrir", error);
            toast.error("No se pudo abrir la reunión.");
        } finally {
            setCreando(false);
        }
    }, [canalId, creando, duracion, onAbierto, titulo]);

    return (
        <Dialog open={abierto} onOpenChange={onAbierto}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Reunión de video</DialogTitle>
                    <DialogDescription>
                        Hasta cuatro personas, en un panel aquí mismo. El enlace sirve
                        también para alguien de fuera: entrará por una sala de espera y le
                        dejas pasar tú.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {salas === null ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Buscando reuniones abiertas…
                        </div>
                    ) : salas.length ? (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                                Abiertas en {nombreDelCanal}
                            </p>
                            {salas.map((s) => (
                                <FilaDeSala
                                    key={s.id}
                                    sala={s}
                                    onEntrar={() => onAbierto(false)}
                                    onRevocada={() =>
                                        setSalas((a) => (a ?? []).filter((x) => x.id !== s.id))
                                    }
                                />
                            ))}
                        </div>
                    ) : null}

                    <div className="space-y-2 border-t border-border pt-3">
                        <Input
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="Para qué es (opcional)"
                            maxLength={80}
                        />
                        <div className="flex flex-wrap gap-1.5">
                            {/* El enlace CADUCA siempre, y se elige de una lista
                                cerrada. Un desplegable libre acabaría con un
                                enlace de un año pegado en un correo. */}
                            {DURACIONES.map((d) => (
                                <button
                                    key={d.valor}
                                    type="button"
                                    onClick={() => setDuracion(d.valor)}
                                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                                        duracion === d.valor
                                            ? "border-primary bg-primary/10 font-medium text-foreground"
                                            : "border-border text-muted-foreground hover:bg-muted"
                                    }`}
                                >
                                    {d.rotulo}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            El enlace deja de valer pasado ese rato, y puedes revocarlo
                            antes.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onAbierto(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={() => void crear()} disabled={creando}>
                        {creando ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Abriendo…
                            </>
                        ) : (
                            <>
                                <Video className="mr-2 h-4 w-4" />
                                Abrir reunión
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function FilaDeSala({
    sala,
    onRevocada,
    onEntrar,
}: {
    sala: SalaParaLaPantalla;
    onRevocada: () => void;
    /** Cerrar el diálogo antes de abrir el panel: si no, se tapan. */
    onEntrar?: () => void;
}) {
    const [ocupado, setOcupado] = useState(false);

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(sala.enlace);
            toast.success("Enlace copiado.");
        } catch {
            toast.error("No se pudo copiar el enlace.");
        }
    };

    const revocar = async () => {
        if (ocupado) return;
        setOcupado(true);
        try {
            const res = await revocarLaSalaAction(sala.id);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            // Se quita al momento, antes de volver a preguntar: la misma regla
            // que borrar un chat en la bandeja.
            onRevocada();
            toast.success("Enlace revocado.");
        } catch (error) {
            console.warn("[reunion] no se pudo revocar", error);
            toast.error("No se pudo revocar el enlace.");
        } finally {
            setOcupado(false);
        }
    };

    return (
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{sala.titulo || "Reunión"}</span>
                <span className="block text-[11px] text-muted-foreground">
                    Caduca {cuandoSeLee(sala.expiraEn)}
                </span>
            </span>
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => void copiar()}
                aria-label="Copiar el enlace"
                title="Copiar el enlace"
            >
                <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                    onEntrar?.();
                    abrirLaReunionAqui(sala.codigo);
                }}
                aria-label="Entrar a la reunión"
                title="Entrar"
            >
                <LogIn className="h-3.5 w-3.5" />
            </Button>
            {/* Revocar solo lo ve quien la abrió: es quien decide, y además es
                lo único que la acción va a aceptar. Un botón que al pulsarlo da
                error es peor que no tenerlo. */}
            {sala.soyElAnfitrion ? (
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void revocar()}
                    disabled={ocupado}
                    aria-label="Revocar el enlace"
                    title="Revocar el enlace"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            ) : null}
        </div>
    );
}

/** «en 3 h», «en 2 días». Una fecha exacta aquí no dice nada de un vistazo. */
function cuandoSeLee(iso: string): string {
    const falta = Date.parse(iso) - Date.now();
    if (!Number.isFinite(falta) || falta <= 0) return "ya";
    const horas = Math.round(falta / (60 * 60 * 1000));
    if (horas < 1) return "en menos de 1 h";
    if (horas < 24) return `en ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? "mañana" : `en ${dias} días`;
}
