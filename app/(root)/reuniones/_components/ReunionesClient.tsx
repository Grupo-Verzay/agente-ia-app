"use client";

import { useCallback, useState } from "react";
import { CalendarClock, Copy, History, Link2Off, Loader2, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abrirLaReunionAqui } from "@/components/video/ReunionEnLaPlataforma";
import {
    cambiarLaCaducidadAction,
    crearLaReunionDeLaCuentaAction,
    revocarLaSalaAction,
    type ReunionPasada,
    type SalaParaLaPantalla,
} from "@/actions/salas-de-video-actions";
import {
    DURACIONES,
    DURACION_POR_DEFECTO,
    TOPE_DE_LA_SALA,
    type Duracion,
} from "@/lib/sala-de-video";

/**
 * Reuniones de la cuenta: abrir, repartir el enlace y ver las pasadas.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Entrar no navega a ninguna parte.** `abrirLaReunionAqui` le habla al
 *    panel flotante que cuelga del layout, así que se puede seguir trabajando
 *    con la reunión abierta. Con un `window.open` o un `router.push` se saldría
 *    de la plataforma o se desmontaría el panel al cambiar de pantalla.
 * 2. **Lo que se toca se pinta al momento**, antes de volver a preguntarle al
 *    servidor: revocar quita la fila, cambiar la caducidad mueve su fecha. Y si
 *    el servidor dice que no, se devuelve tal cual estaba — la misma regla que
 *    borrar un chat en la bandeja.
 * 3. **Quién puede administrar cada sala baja del servidor** (`puedoAdministrar`)
 *    y no se recalcula aquí. Con la condición escrita también en la pantalla,
 *    el día que se afine una saldría un botón que al pulsarlo dice «no
 *    autorizado»: el «menú abierto, puerta cerrada» de siempre.
 */
export function ReunionesClient({
    inicial,
    puedoAbrir,
    historial,
    dias,
    fallo,
}: {
    inicial: SalaParaLaPantalla[];
    puedoAbrir: boolean;
    historial: ReunionPasada[];
    dias: number;
    fallo: string | null;
}) {
    const [salas, setSalas] = useState(inicial);
    const [titulo, setTitulo] = useState("");
    const [duracion, setDuracion] = useState<Duracion>(DURACION_POR_DEFECTO);
    const [creando, setCreando] = useState(false);

    const crear = useCallback(async () => {
        if (creando) return;
        setCreando(true);
        try {
            const res = await crearLaReunionDeLaCuentaAction(duracion, titulo);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setSalas((a) => [res.sala, ...a]);
            setTitulo("");
            abrirLaReunionAqui(res.sala.codigo);
        } catch (error) {
            // Una acción no solo devuelve `success: false`: puede reventar, y
            // entonces el `finally` es lo único que apaga el «Abriendo…».
            console.warn("[reuniones] no se pudo abrir la reunión", error);
            toast.error("No se pudo abrir la reunión.");
        } finally {
            setCreando(false);
        }
    }, [creando, duracion, titulo]);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 p-4">
            <header className="space-y-1">
                <h1 className="text-lg font-semibold">Reuniones</h1>
                <p className="text-sm text-muted-foreground">
                    Video de hasta {TOPE_DE_LA_SALA} personas, en un panel aquí mismo. El
                    enlace sirve también para alguien de fuera: entra por una sala de
                    espera y le dejas pasar tú.
                </p>
            </header>

            {fallo ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {fallo}
                </p>
            ) : null}

            {puedoAbrir ? (
                <section className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="Para qué es (opcional)"
                            maxLength={80}
                            className="min-w-0 flex-1"
                        />
                        <Button onClick={() => void crear()} disabled={creando}>
                            {creando ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Video className="mr-2 h-4 w-4" />
                            )}
                            {creando ? "Abriendo…" : "Abrir reunión"}
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">El enlace vale</span>
                        {/* Lista cerrada, nunca texto libre: es lo que decide
                            cuánto tiempo puede entrar alguien de fuera. Y no hay
                            «no caduca». */}
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
                        Se puede cambiar después sin abrir otra sala, y revocarlo antes.
                    </p>
                </section>
            ) : null}

            <section className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                <div className="space-y-1.5">
                    <h2 className="text-sm font-medium">Abiertas</h2>
                    {salas.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No hay ninguna reunión abierta.
                        </p>
                    ) : (
                        salas.map((s) => (
                            <FilaViva
                                key={s.id}
                                sala={s}
                                onFuera={() => setSalas((a) => a.filter((x) => x.id !== s.id))}
                                onCaducidad={(expiraEn) =>
                                    setSalas((a) =>
                                        a.map((x) => (x.id === s.id ? { ...x, expiraEn } : x)),
                                    )
                                }
                            />
                        ))
                    )}
                </div>

                <div className="space-y-1.5">
                    <h2 className="flex items-center gap-1.5 text-sm font-medium">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        Pasadas
                        <span className="font-normal text-muted-foreground">
                            · últimos {dias} días
                        </span>
                    </h2>
                    {historial.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Todavía no hay reuniones terminadas.
                        </p>
                    ) : (
                        historial.map((r) => <FilaPasada key={r.id} reunion={r} />)
                    )}
                </div>
            </section>
        </div>
    );
}

function FilaViva({
    sala,
    onFuera,
    onCaducidad,
}: {
    sala: SalaParaLaPantalla;
    onFuera: () => void;
    onCaducidad: (expiraEn: string) => void;
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
            onFuera();
            toast.success("Enlace revocado.");
        } catch (error) {
            console.warn("[reuniones] no se pudo revocar", error);
            toast.error("No se pudo revocar el enlace.");
        } finally {
            setOcupado(false);
        }
    };

    const mover = async (valor: Duracion) => {
        if (ocupado) return;
        setOcupado(true);
        try {
            const res = await cambiarLaCaducidadAction(sala.id, valor);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            onCaducidad(res.expiraEn);
            toast.success("Caducidad actualizada.");
        } catch (error) {
            console.warn("[reuniones] no se pudo cambiar la caducidad", error);
            toast.error("No se pudo cambiar la caducidad.");
        } finally {
            setOcupado(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{sala.titulo || "Reunión"}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {sala.anfitrionNombre ? `${sala.anfitrionNombre} · ` : ""}
                    Caduca {cuandoSeLee(sala.expiraEn)}
                </p>
            </div>
            <Button size="sm" onClick={() => abrirLaReunionAqui(sala.codigo)}>
                <Video className="mr-1.5 h-3.5 w-3.5" />
                Entrar
            </Button>
            <Button size="sm" variant="outline" onClick={() => void copiar()}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copiar enlace
            </Button>
            {/* Los dos mandos que tocan la sala salen solo para quien puede.
                Una opción apagada invita a preguntar por qué no se puede, y esa
                respuesta no cabe en un menú. */}
            {sala.puedoAdministrar ? (
                <>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" disabled={ocupado}>
                                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                                Caducidad
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                Que valga, desde ahora
                            </DropdownMenuLabel>
                            {DURACIONES.map((d) => (
                                <DropdownMenuItem
                                    key={d.valor}
                                    onSelect={() => void mover(d.valor)}
                                    className="cursor-pointer text-xs"
                                >
                                    {d.rotulo}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void revocar()}
                        disabled={ocupado}
                        className="text-destructive hover:text-destructive"
                    >
                        <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                        Revocar
                    </Button>
                </>
            ) : null}
        </div>
    );
}

function FilaPasada({ reunion }: { reunion: ReunionPasada }) {
    return (
        <div className="rounded-md border border-border px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="min-w-0 flex-1 truncate text-sm">
                    {reunion.titulo || "Reunión"}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                    {reunion.empezo ? cuandoFue(reunion.empezo) : "no se usó"}
                </span>
                <span className="text-xs font-medium tabular-nums">{reunion.duracion}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {reunion.asistentes.length === 0
                    ? /* Cero asistentes NO es un hueco: es el dato. Dice que se
                         abrió un enlace y no entró nadie, y explica de dónde
                         salen las salas que se acumulan sin usar. */
                      `Nadie entró · enlace ${reunion.final}`
                    : reunion.asistentes
                          .map((a) => (a.esInvitado ? `${a.nombre} (invitado)` : a.nombre))
                          .join(", ")}
            </p>
        </div>
    );
}

/** «en 3 h», «mañana», «en 6 días». Lo mismo que el diálogo del chat de equipo. */
function cuandoSeLee(iso: string): string {
    const falta = Date.parse(iso) - Date.now();
    if (!Number.isFinite(falta) || falta <= 0) return "ya";
    const horas = Math.round(falta / (60 * 60 * 1000));
    if (horas < 1) return "en menos de 1 h";
    if (horas < 24) return `en ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? "mañana" : `en ${dias} días`;
}

/** La fecha de una reunión pasada, corta y con su hora. */
function cuandoFue(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}
