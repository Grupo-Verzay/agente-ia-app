"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Building2,
    CalendarClock,
    Copy,
    Link2Off,
    MoreHorizontal,
    RefreshCw,
    Video,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarraDeAcciones, BotonDeCrear } from "@/components/shared/BarraDeAcciones";
import { abrirLaReunionAqui } from "@/components/video/ReunionEnLaPlataforma";
import {
    cambiarLaCaducidadAction,
    crearLaReunionDeLaCuentaAction,
    lasGrabacionesDeLasReunionesAction,
    regenerarLaSalaAction,
    revocarLaSalaAction,
    type GrabacionEnLaFicha,
    type ReunionPasada,
    type SalaParaLaPantalla,
} from "@/actions/salas-de-video-actions";
import { GrabacionesDeLaReunion } from "@/components/reuniones/GrabacionesDeLaReunion";
import {
    DURACION_POR_DEFECTO,
    comoSeLeeLaCaducidad,
    duracionesQuePuedeElegir,
    type Duracion,
} from "@/lib/sala-de-video";
import { cn } from "@/lib/utils";

/**
 * Reuniones de la cuenta: abrir, repartir el enlace y ver las pasadas.
 *
 * # La pantalla no se presenta a sí misma
 *
 * Tenía un `h1` con la palabra «Reuniones» y debajo un párrafo explicando qué
 * es una sala de video. Las dos cosas sobran por el mismo motivo: **quien la
 * abre ya sabe dónde está** —lo pone la pestaña del módulo— y lo que hace una
 * reunión se descubre abriendo una, no leyéndolo cada vez. Ese bloque ocupaba
 * la franja de arriba, que es justo la que le falta a la lista.
 *
 * Lo mismo con el «Se puede cambiar después sin abrir otra sala, y revocarlo
 * antes»: era una nota al pie que describía dos botones que están ahí al lado.
 *
 * # Una lista, no dos bloques apilados
 *
 * «Abiertas» y «Pasadas» eran dos secciones una encima de otra, cada una con su
 * título y su texto de vacío. Con dos reuniones abiertas y veinte pasadas, lo
 * que se viene a ver —las abiertas— quedaba arriba y todo lo demás empujaba.
 * Ahora son **dos pastillas de filtro** sobre una sola lista, como en Cobros,
 * en Tareas y en Clientes: se ve una cosa a la vez y el número de la otra está
 * en su pastilla.
 *
 * # Y la barra es `BarraDeAcciones`, no una fila escrita a mano
 *
 * A la izquierda lo que acota la lista —las dos pastillas—; a la derecha el
 * botón azul de crear, **«+ Nueva»**, como en el resto de pantallas de lista. Y
 * pegado a él, el desplegable con el nombre y la duración del enlace: las
 * duraciones eran una fila de fichas sueltas arriba, que es una fila entera de
 * alto para un ajuste que casi nunca se toca.
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
 * 3. **Qué puede hacer quien mira baja del servidor** —`puedoAbrir`,
 *    `puedoNoCaducar` y el `puedoAdministrar` de cada fila— y no se recalcula
 *    aquí. Con la condición escrita también en la pantalla, el día que se afine
 *    una saldría un botón que al pulsarlo dice «no autorizado»: el «menú
 *    abierto, puerta cerrada» de siempre.
 */
/**
 * Las grabaciones se piden APARTE de la lista, y en una sola vuelta.
 *
 * Aparte porque la mayoría de las cuentas no tienen el módulo: metidas en la
 * carga de la página, todas pagarían dos consultas más para no enseñar nada. Y
 * en una sola vuelta para todas las reuniones —no una por fila— porque esta
 * lista llega a cien filas y eso es «muchas peticiones pequeñas son turno, no
 * trabajo» por dentro.
 */
function useLasGrabaciones(ids: string[]) {
    const [porSala, setPorSala] = useState<Record<string, GrabacionEnLaFicha[]>>({});
    const [cupo, setCupo] = useState<{ parte: number; cerca: boolean; texto: string } | null>(null);
    const [puedeGrabar, setPuedeGrabar] = useState(false);

    // La llave es el TEXTO de los ids y no el arreglo: el padre crea uno nuevo
    // en cada pintado, así que con el arreglo esto pediría las grabaciones en
    // bucle.
    const llave = ids.join(",");
    useEffect(() => {
        if (!llave) return;
        let vivo = true;
        void (async () => {
            try {
                const res = await lasGrabacionesDeLasReunionesAction(llave.split(","));
                if (!vivo || !res.success) return;
                setPorSala(res.porSala);
                setCupo(res.cupo);
                setPuedeGrabar(res.puedeGrabar);
            } catch (error) {
                // Mudo aquí se ve como «mis grabaciones desaparecieron».
                console.warn("[reuniones] no se pudieron leer las grabaciones", error);
            }
        })();
        return () => {
            vivo = false;
        };
    }, [llave]);

    const alTranscribir = useCallback(
        (id: string, texto: string, resumen: string | null) => {
            setPorSala((antes) => {
                const nuevo: Record<string, GrabacionEnLaFicha[]> = {};
                for (const [sala, lista] of Object.entries(antes)) {
                    nuevo[sala] = lista.map((g) =>
                        g.id === id ? { ...g, transcripcion: texto, resumen } : g,
                    );
                }
                return nuevo;
            });
        },
        [],
    );

    return { porSala, cupo, puedeGrabar, alTranscribir };
}

export function ReunionesClient({
    inicial,
    variasCuentas,
    puedoAbrir,
    puedoNoCaducar,
    historial,
    dias,
    fallo,
}: {
    inicial: SalaParaLaPantalla[];
    /** La familia tiene varias cuentas: se pinta a quién pertenece cada sala. */
    variasCuentas: boolean;
    puedoAbrir: boolean;
    puedoNoCaducar: boolean;
    historial: ReunionPasada[];
    dias: number;
    fallo: string | null;
}) {
    const [salas, setSalas] = useState(inicial);
    const [vista, setVista] = useState<"abiertas" | "pasadas">("abiertas");
    const [titulo, setTitulo] = useState("");
    const [duracion, setDuracion] = useState<Duracion>(DURACION_POR_DEFECTO);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
    const [creando, setCreando] = useState(false);

    const idsDeLasSalas = useMemo(
        () => [...salas.map((s) => s.id), ...historial.map((r) => r.id)],
        [historial, salas],
    );
    const grabaciones = useLasGrabaciones(idsDeLasSalas);

    // La lista que se OFRECE es la que el servidor acepta: las dos salen de la
    // misma función y de la misma respuesta (`puedoNoCaducar`). Con una
    // condición propia aquí, el desplegable ofrecería «No caduca» a quien la
    // acción luego rechaza.
    const opciones = useMemo(() => duracionesQuePuedeElegir(puedoNoCaducar), [puedoNoCaducar]);
    const rotuloDeLaDuracion =
        opciones.find((d) => d.valor === duracion)?.rotulo ?? "Caducidad";

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
            // Se vuelve a «Abiertas» pase lo que pase: crear una reunión desde
            // el histórico y que la fila nueva no se vea se lee como que no se
            // creó, y entonces se pulsa otra vez.
            setVista("abiertas");
            setAjustesAbiertos(false);
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
        <div className="flex h-full min-h-0 flex-col gap-2 p-4">
            <BarraDeAcciones
                filtros={
                    <>
                        <PastillaDeFiltro
                            etiqueta="Abiertas"
                            cuantas={salas.length}
                            activa={vista === "abiertas"}
                            alPulsar={() => setVista("abiertas")}
                        />
                        <PastillaDeFiltro
                            etiqueta="Pasadas"
                            cuantas={historial.length}
                            activa={vista === "pasadas"}
                            alPulsar={() => setVista("pasadas")}
                            /* Los días caben en el `title` y no en una línea de
                               texto debajo: es una aclaración que se consulta
                               una vez, no un dato que se mira. */
                            ayuda={`Reuniones terminadas · últimos ${dias} días`}
                        />
                    </>
                }
                crear={
                    puedoAbrir ? (
                        <div className="flex items-center gap-2">
                            {/* `modal` se queda en `false` —el de un `Popover`—
                                a propósito: con los eventos de fuera
                                bloqueados, pulsar «+ Nueva» con el desplegable
                                abierto solo lo cerraría y habría que pulsar dos
                                veces. Es el mismo `onMouseDown`/`onClick` del
                                selector de menciones, por otra puerta. */}
                            <Popover open={ajustesAbiertos} onOpenChange={setAjustesAbiertos}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        /* En el teléfono se queda solo con el
                                           icono, como `BotonDeCrear` con su
                                           «+». Medido a 390: con el rótulo
                                           puesto la pareja de pastillas pedía
                                           29 px más de los que hay y «Pasadas»
                                           se cortaba — y esas dos son la única
                                           forma de llegar al histórico. La
                                           duración elegida se sigue viendo al
                                           abrirlo, que es donde se cambia. */
                                        className="h-10 w-10 shrink-0 gap-1.5 p-0 sm:w-auto sm:px-2.5"
                                        title={`Reunión nueva · el enlace vale ${rotuloDeLaDuracion}`}
                                        aria-label={`Reunión nueva · el enlace vale ${rotuloDeLaDuracion}`}
                                    >
                                        <CalendarClock className="h-4 w-4 shrink-0" />
                                        <span className="hidden max-w-24 truncate text-sm sm:inline">
                                            {rotuloDeLaDuracion}
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-64 space-y-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="reunion-titulo" className="text-xs">
                                            Nombre
                                        </Label>
                                        <Input
                                            id="reunion-titulo"
                                            value={titulo}
                                            onChange={(e) => setTitulo(e.target.value)}
                                            placeholder="Para qué es (opcional)"
                                            maxLength={80}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">El enlace vale</Label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {opciones.map((d) => (
                                                <button
                                                    key={d.valor}
                                                    type="button"
                                                    onClick={() => setDuracion(d.valor)}
                                                    className={cn(
                                                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                                                        duracion === d.valor
                                                            ? "border-primary bg-primary/10 font-medium text-foreground"
                                                            : "border-border text-muted-foreground hover:bg-muted",
                                                    )}
                                                >
                                                    {d.rotulo}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <BotonDeCrear onClick={() => void crear()} disabled={creando}>
                                Nuevo
                            </BotonDeCrear>
                        </div>
                    ) : null
                }
            />

            {fallo ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {fallo}
                </p>
            ) : null}

            {/* El cupo solo se enseña cuando de verdad conviene mirarlo.
                Una barra permanente diciendo «0,4 GB de 20» es un dato que
                nadie va a usar ocupando la fila que le falta a la lista; a
                partir del 80 % sí, porque entonces hay algo que hacer. */}
            {grabaciones.cupo?.cerca ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    Espacio de grabación casi lleno: {grabaciones.cupo.texto}. Al llenarse no se
                    podrá grabar hasta que se borre alguna.
                </p>
            ) : null}

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {vista === "abiertas" ? (
                    salas.length === 0 ? (
                        <Vacio texto="No hay ninguna reunión abierta." />
                    ) : (
                        salas.map((s) => (
                            <FilaViva
                                key={s.id}
                                sala={s}
                                variasCuentas={variasCuentas}
                                opciones={opciones}
                                onFuera={() => setSalas((a) => a.filter((x) => x.id !== s.id))}
                                onCaducidad={(expiraEn) =>
                                    setSalas((a) =>
                                        a.map((x) => (x.id === s.id ? { ...x, expiraEn } : x)),
                                    )
                                }
                                onRegenerada={(nueva) =>
                                    setSalas((a) => a.map((x) => (x.id === s.id ? nueva : x)))
                                }
                                grabaciones={grabaciones.porSala[s.id] ?? []}
                                alTranscribir={grabaciones.alTranscribir}
                            />
                        ))
                    )
                ) : historial.length === 0 ? (
                    <Vacio texto="Todavía no hay reuniones terminadas." />
                ) : (
                    historial.map((r) => (
                        <FilaPasada
                            key={r.id}
                            reunion={r}
                            variasCuentas={variasCuentas}
                            grabaciones={grabaciones.porSala[r.id] ?? []}
                            alTranscribir={grabaciones.alTranscribir}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * Una pastilla de filtro, con su número dentro.
 *
 * La misma forma que las de Cobros, y **visible en todas las anchuras**: las
 * de `PastillasDeMetricas` van `hidden sm:flex` porque ahí son cifras que la
 * lista ya contesta, pero estas dos **son la única forma de cambiar de lista**.
 * Escondidas en un teléfono, el histórico no existiría.
 */
function PastillaDeFiltro({
    etiqueta,
    cuantas,
    activa,
    alPulsar,
    ayuda,
}: {
    etiqueta: string;
    cuantas: number;
    activa: boolean;
    alPulsar: () => void;
    ayuda?: string;
}) {
    return (
        <button
            type="button"
            onClick={alPulsar}
            aria-pressed={activa}
            title={ayuda}
            className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                activa ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
        >
            {etiqueta}
            <span className="ml-1.5 text-xs tabular-nums opacity-70">{cuantas}</span>
        </button>
    );
}

function Vacio({ texto }: { texto: string }) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{texto}</p>;
}

/**
 * A qué cuenta pertenece la sala.
 *
 * Solo se pinta cuando la familia tiene varias cuentas y la sala trae nombre:
 * en una cuenta sola sería repetir su propio nombre en cada fila, que es ruido.
 * Es lo que hace visible que la madre está entrando a la sala de una hija sin
 * haber cambiado de cuenta.
 */
function InsigniaDeCuenta({
    nombre,
    variasCuentas,
}: {
    nombre: string | null;
    variasCuentas: boolean;
}) {
    if (!variasCuentas || !nombre) return null;
    return (
        <span
            className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
            title={nombre}
        >
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{nombre}</span>
        </span>
    );
}

function FilaViva({
    sala,
    variasCuentas,
    opciones,
    onFuera,
    onCaducidad,
    onRegenerada,
    grabaciones,
    alTranscribir,
}: {
    sala: SalaParaLaPantalla;
    variasCuentas: boolean;
    opciones: ReadonlyArray<{ valor: Duracion; rotulo: string }>;
    onFuera: () => void;
    onCaducidad: (expiraEn: string | null) => void;
    onRegenerada: (nueva: SalaParaLaPantalla) => void;
    grabaciones: GrabacionEnLaFicha[];
    alTranscribir: (id: string, texto: string, resumen: string | null) => void;
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

    const regenerar = async () => {
        if (ocupado) return;
        setOcupado(true);
        try {
            const res = await regenerarLaSalaAction(sala.id);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            onRegenerada(res.sala);
            toast.success("Enlace nuevo. El anterior ya no vale.");
        } catch (error) {
            console.warn("[reuniones] no se pudo regenerar", error);
            toast.error("No se pudo regenerar el enlace.");
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
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{sala.titulo || "Reunión"}</p>
                    <InsigniaDeCuenta nombre={sala.cuentaNombre} variasCuentas={variasCuentas} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                    {sala.anfitrionNombre ? `${sala.anfitrionNombre} · ` : ""}
                    {comoSeLeeLaCaducidad(sala.expiraEn)}
                </p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => abrirLaReunionAqui(sala.codigo)}>
                <Video className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Entrar</span>
            </Button>
            <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                onClick={() => void copiar()}
                title="Copiar enlace"
                aria-label="Copiar enlace"
            >
                <Copy className="h-3.5 w-3.5" />
            </Button>
            {/* Lo que toca la sala va dentro del `⋯` y solo para quien puede.
                Suelto eran tres botones más por fila para dos cosas que se
                hacen de uvas a peras; y una opción apagada invita a preguntar
                por qué no se puede, que es una respuesta que no cabe en un
                menú. */}
            {sala.puedoAdministrar ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            disabled={ocupado}
                            title="Más acciones"
                            aria-label="Más acciones"
                        >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-52"
                        style={{
                            maxHeight:
                                "min(70vh, var(--radix-dropdown-menu-content-available-height))",
                        }}
                    >
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="text-xs">
                                <CalendarClock className="mr-2 h-3.5 w-3.5" />
                                Caducidad
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent
                                className="w-44"
                                style={{
                                    maxHeight:
                                        "min(70vh, var(--radix-dropdown-menu-content-available-height))",
                                }}
                            >
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                    Que valga, desde ahora
                                </DropdownMenuLabel>
                                {opciones.map((d) => (
                                    <DropdownMenuItem
                                        key={d.valor}
                                        onSelect={() => void mover(d.valor)}
                                        className="cursor-pointer text-xs"
                                    >
                                        {d.rotulo}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem
                            onSelect={() => void regenerar()}
                            className="cursor-pointer text-xs"
                        >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                            Regenerar enlace
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() => void revocar()}
                            className="cursor-pointer text-xs text-destructive focus:text-destructive"
                        >
                            <Link2Off className="mr-2 h-3.5 w-3.5" />
                            Revocar enlace
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
            <GrabacionesDeLaReunion grabaciones={grabaciones} alTranscribir={alTranscribir} />
        </div>
    );
}

function FilaPasada({
    reunion,
    variasCuentas,
    grabaciones,
    alTranscribir,
}: {
    reunion: ReunionPasada;
    variasCuentas: boolean;
    grabaciones: GrabacionEnLaFicha[];
    alTranscribir: (id: string, texto: string, resumen: string | null) => void;
}) {
    return (
        <div className="rounded-md border border-border px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="min-w-0 flex-1 truncate text-sm">
                    {reunion.titulo || "Reunión"}
                </p>
                <InsigniaDeCuenta nombre={reunion.cuentaNombre} variasCuentas={variasCuentas} />
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
            <GrabacionesDeLaReunion grabaciones={grabaciones} alTranscribir={alTranscribir} />
        </div>
    );
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
