"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Copy,
    GripVertical,
    Loader2,
    Maximize2,
    Mic,
    MicOff,
    Minus,
    MonitorUp,
    PhoneOff,
    ScreenShare,
    UserCheck,
    UserX,
    Users,
    Video,
    VideoOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { laRejilla, lasIniciales, TOPE_DE_LA_SALA } from "@/lib/sala-de-video";
// El mismo formato de duración que la llamada de voz. Con una copia, el día
// que se afine el de una el otro se queda diciendo otra cosa.
import { comoSeLeeLaDuracion } from "@/lib/llamada-de-voz";
import { useMediosDeLlamada } from "@/hooks/useMediosDeLlamada";
import { useMallaDeVideo, type RemotoEnLaSala } from "@/hooks/useMallaDeVideo";
import {
    dejarPasarAction,
    salirDeLaSalaAction,
    sacarDeLaSalaAction,
    type QuienEstaEnLaSala,
} from "@/actions/salas-de-video-actions";

/**
 * La sala de video: hasta cuatro personas, navegador contra navegador.
 *
 * **La misma pantalla la usan los dos lados**: quien entra desde el chat del
 * equipo y quien entra de fuera con un enlace. Lo único que cambia es cómo se
 * identifica —la sesión o un token— y eso viaja en una prop. Con dos pantallas,
 * el día que se afine el botón de compartir se afina en una y la otra se queda
 * atrás, que es lo que este repositorio ya ha pagado varias veces.
 */
export function SalaDeVideo({
    codigo,
    token,
    enlace,
    alSalir,
    minimizada = false,
    onMinimizar,
    asa,
}: {
    codigo: string;
    /** El token de quien entró por el enlace. Vacío para quien tiene cuenta. */
    token?: string | null;
    /** La dirección para copiar y pasarle a alguien. */
    enlace?: string | null;
    alSalir?: () => void;
    /**
     * Si ahora mismo se ve como pastilla.
     *
     * Lo decide quien la monta —el panel flotante—, no ella: es quien sostiene
     * la posición y el tamaño. Aquí solo cambia lo que se pinta, igual que en
     * la tarjeta de llamada. **Quien entra por el enlace público no la recibe**
     * y la reunión ocupa su pestaña entera, que es lo que tiene delante.
     */
    minimizada?: boolean;
    onMinimizar?: (v: boolean) => void;
    /** Los manejadores del arrastre, para el trozo que hace de asa. */
    asa?: { className?: string } & Record<string, unknown>;
}) {
    const medios = useMediosDeLlamada({ alFallar: (m) => toast.error(m) });
    const [arrancando, setArrancando] = useState(true);
    const [saliendo, setSaliendo] = useState(false);
    const malla = useMallaDeVideo({ codigo, token, medios, activo: !arrancando });

    /**
     * Cuánto se lleva dentro.
     *
     * Desde que se ENTRÓ, no desde que se abrió la pestaña: el rato en la sala
     * de espera no es reunión, igual que el rato sonando no es llamada. Y es lo
     * que enseña la pastilla, que es donde de verdad hace falta — plegada no se
     * ve nada más.
     */
    const [segundos, setSegundos] = useState(0);
    const dentro = malla.estado === "dentro";
    useEffect(() => {
        if (!dentro) return;
        const id = window.setInterval(() => setSegundos((n) => n + 1), 1000);
        return () => window.clearInterval(id);
    }, [dentro]);

    /**
     * Plegada y ya no dentro: se despliega sola.
     *
     * Si te sacan de la reunión —revocaron el enlace, se cayó la sesión— con la
     * pastilla puesta, lo que hay que ver es **qué pasó**. Dejarla plegada
     * enseñaría una pastilla con el contador parado y sin forma de saber por
     * qué, que es la definición de un fallo mudo.
     */
    useEffect(() => {
        if (minimizada && (malla.estado === "fuera" || malla.estado === "esperando")) {
            onMinimizar?.(false);
        }
    }, [minimizada, malla.estado, onMinimizar]);

    /**
     * Pedir los medios ANTES de empezar a conectar.
     *
     * Con la cámara ya encendida cuando sale la primera oferta, la otra punta
     * ve imagen desde el primer fotograma. Al revés —conectar y encender
     * después— funciona igual, pero los primeros segundos de toda reunión
     * serían recuadros negros, y eso se lee como que no va.
     *
     * Se entra **aunque falle**: sin micro ni cámara se sigue viendo y oyendo a
     * los demás, que es más que quedarse fuera. Lo que no puede es ser mudo, y
     * el hook ya lo dice.
     */
    useEffect(() => {
        let vivo = true;
        void (async () => {
            await medios.arrancar(true);
            if (vivo) setArrancando(false);
        })();
        return () => {
            vivo = false;
        };
        // Una sola vez: `medios` cambia de identidad en cada repintado y con él
        // en las dependencias se pediría la cámara en bucle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Salir: soltar todo y avisar, en ese orden. */
    const salir = useCallback(async () => {
        if (saliendo) return;
        setSaliendo(true);
        // Primero se suelta: el piloto de la cámara tiene que apagarse en el
        // acto, no cuando conteste el servidor.
        medios.soltarTodo();
        try {
            await salirDeLaSalaAction({ codigo, token });
        } catch (error) {
            // El latido la sacaría igual en unos segundos; esto solo hace que
            // el recuadro desaparezca ya.
            console.warn("[sala] no se pudo salir limpiamente", error);
        }
        alSalir?.();
    }, [alSalir, codigo, medios, saliendo, token]);

    /**
     * Y al cerrar la pestaña, que es como se sale de verdad.
     *
     * `sendBeacon` no sirve aquí —esto es una acción de servidor, no un
     * endpoint con un cuerpo suelto— así que lo único que se puede garantizar
     * es soltar los dispositivos. Que la sala se entere es trabajo del latido:
     * a los pocos segundos sin dar señales, el servidor saca solo a quien se
     * fue. Por eso esto no es la red de seguridad, es solo el camino rápido.
     */
    useEffect(() => {
        const alCerrar = () => medios.soltarTodo();
        window.addEventListener("pagehide", alCerrar);
        return () => window.removeEventListener("pagehide", alCerrar);
    }, [medios]);

    if (arrancando) {
        return (
            <Centrada>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Preparando la cámara…</p>
            </Centrada>
        );
    }

    if (malla.estado === "cargando") {
        return (
            <Centrada>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Entrando a la reunión…</p>
            </Centrada>
        );
    }

    if (malla.estado === "fuera") {
        return (
            <Centrada>
                <p className="text-base font-medium">{malla.motivo ?? "Ya no estás en la reunión."}</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                    Puedes cerrar esta pestaña.
                </p>
            </Centrada>
        );
    }

    if (malla.estado === "esperando") {
        return (
            <Centrada>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-base font-medium">Esperando a que te dejen entrar</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                    Ya saben que estás aquí. En cuanto alguien te abra, entras.
                </p>
                <Button variant="outline" size="sm" onClick={() => void salir()}>
                    Cancelar
                </Button>
            </Centrada>
        );
    }

    const cuantos = malla.remotos.length + 1;
    const nombre = malla.sala?.titulo || "Reunión";

    // PLEGADA: la pastilla. La rejilla se queda montada debajo, escondida.
    //
    // Escondida con `display:none` y **no desmontada**, que es la diferencia
    // que importa: desmontarla se llevaría por delante los `<video>` y con
    // ellos el audio de los demás. Plegar una reunión tiene que dejarte
    // seguir oyéndola — si no, plegarla es salirse.
    if (minimizada) {
        return (
            <>
                <div className="flex items-center gap-1 py-1 pl-1 pr-1.5">
                    {/* El asa se lleva el nombre y el rato: es la zona ancha y
                        la que no hace nada al pulsarla, así que puede recibir
                        el gesto sin competir con ningún botón. */}
                    <div
                        {...asa}
                        className={cn(
                            "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5",
                            asa?.className ?? "",
                        )}
                    >
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-sm tabular-nums">
                            {comoSeLeeLaDuracion(segundos)}
                        </span>
                        <span className="max-w-[9rem] truncate text-sm text-muted-foreground">
                            {nombre}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => onMinimizar?.(false)}
                        aria-label="Ampliar la reunión"
                        title="Ampliar"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full"
                        onClick={() => void salir()}
                        disabled={saliendo}
                        aria-label="Salir de la reunión"
                        title="Salir"
                    >
                        <PhoneOff className="h-4 w-4" />
                    </Button>
                </div>
                <div className="hidden">
                    <Rejilla
                        cuantos={cuantos}
                        medios={medios}
                        malla={malla}
                        nombrePropio={malla.yo?.nombre}
                    />
                </div>
            </>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-zinc-950 text-zinc-100">
            {/* La cabecera: qué reunión es, cuántos hay y el enlace. */}
            <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-3 py-2 sm:px-4">
                {/* El asa se lleva SOLO el nombre, no la cabecera entera.
                    Puesta en el contenedor, captura el puntero al agarrarla y
                    los eventos de después se le redirigen: el `click` de
                    «Copiar enlace» y el de plegar no llegarían a salir nunca.
                    Es la misma regla que ya costó una vuelta en la tarjeta de
                    llamada — ningún botón va dentro del asa. */}
                <div
                    {...asa}
                    className={cn(
                        "min-w-0 flex-1 truncate rounded px-1 py-0.5 text-sm font-medium",
                        asa?.className ?? "",
                    )}
                >
                    {nombre}
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
                    <Users className="h-3.5 w-3.5" />
                    <span className="tabular-nums">
                        {cuantos} de {TOPE_DE_LA_SALA}
                    </span>
                </span>
                {enlace ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 sm:px-3"
                        onClick={() => void copiar(enlace)}
                        // El rótulo hace falta en el `title` porque en estrecho
                        // no se enseña: un icono sin nombre no dice qué copia.
                        title="Copiar el enlace de la reunión"
                        aria-label="Copiar el enlace de la reunión"
                    >
                        <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
                        {/* Solo el icono en estrecho. Medido en Chromium: con
                            el rótulo puesto, en un móvil el asa de arrastrar se
                            queda en 75 px — un trozo al que hay que apuntar. */}
                        <span className="hidden sm:inline">Copiar enlace</span>
                    </Button>
                ) : null}
                {/* Plegar solo lo ofrece quien monta el panel: en la pestaña
                    pública no hay nada detrás que seguir mirando, así que una
                    reunión plegada ahí sería una pestaña en blanco. */}
                {onMinimizar ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                        onClick={() => onMinimizar(true)}
                        aria-label="Plegar la reunión"
                        title="Plegar"
                    >
                        <Minus className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>

            {/* La sala de espera, solo para quien puede abrirla. */}
            {malla.yo?.abroLaPuerta && malla.esperando.length ? (
                <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 sm:px-4">
                    <p className="mb-1.5 text-xs font-medium text-amber-200">
                        {malla.esperando.length === 1
                            ? "Alguien está esperando para entrar"
                            : `${malla.esperando.length} personas esperan para entrar`}
                    </p>
                    <div className="flex flex-col gap-1">
                        {malla.esperando.map((q) => (
                            <FilaDeEspera
                                key={q.id}
                                quien={q}
                                codigo={codigo}
                                lleno={cuantos >= TOPE_DE_LA_SALA}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            {/* La rejilla. El número de columnas sale de `laRejilla`, que es
                puro: con cuatro y una sola columna, los dos últimos quedan
                fuera de la pantalla y no hay forma de verlos. */}
            <Rejilla
                cuantos={cuantos}
                medios={medios}
                malla={malla}
                nombrePropio={malla.yo?.nombre}
            />

            {/* Los mandos. Abajo y grandes: es lo que se busca con prisa
                cuando hay que callarse o colgar. */}
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-zinc-800 px-3 py-3 sm:gap-3">
                <Mando
                    encendido={medios.micEncendido}
                    onClick={medios.alternarMic}
                    rotuloEncendido="Silenciar el micrófono"
                    rotuloApagado="Activar el micrófono"
                    Icono={Mic}
                    IconoApagado={MicOff}
                />
                <Mando
                    encendido={medios.camaraEncendida}
                    onClick={() => void medios.alternarCamara()}
                    rotuloEncendido="Apagar la cámara"
                    rotuloApagado="Encender la cámara"
                    Icono={Video}
                    IconoApagado={VideoOff}
                    ocupado={medios.pidiendo}
                />
                <Mando
                    encendido={medios.compartiendo}
                    onClick={() => void medios.alternarPantalla()}
                    rotuloEncendido="Dejar de compartir"
                    rotuloApagado="Compartir la pantalla"
                    Icono={MonitorUp}
                    IconoApagado={ScreenShare}
                    // Al revés que los otros dos: compartiendo es el estado
                    // «encendido» y se pinta en azul, no en gris de apagado.
                    alReves
                />
                <Button
                    size="icon"
                    variant="destructive"
                    className="h-12 w-12 rounded-full"
                    onClick={() => void salir()}
                    disabled={saliendo}
                    aria-label="Salir de la reunión"
                    title="Salir de la reunión"
                >
                    <PhoneOff className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
}

/**
 * La rejilla de recuadros.
 *
 * En su propio componente porque la pintan **dos** sitios: la reunión normal y
 * la plegada, que la esconde pero la mantiene montada para no cortar el audio.
 * Con una copia en cada rama, el día que se afine el reparto se afina en una y
 * plegar la reunión empezaría a sonar distinto.
 */
function Rejilla({
    cuantos,
    medios,
    malla,
    nombrePropio,
}: {
    cuantos: number;
    medios: ReturnType<typeof useMediosDeLlamada>;
    malla: ReturnType<typeof useMallaDeVideo>;
    nombrePropio?: string;
}) {
    return (
        // `overflow-hidden` y no `overflow-y-auto`: la rejilla tiene que CABER,
        // no desplazarse. Una videollamada en la que hay que bajar para ver al
        // cuarto es una videollamada de tres.
        <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
            <div className={cn("grid h-full gap-2", laRejilla(cuantos))}>
                <Recuadro
                    stream={medios.local}
                    nombre={`${nombrePropio ?? "Tú"} (tú)`}
                    hayVideo={Boolean(medios.local)}
                    micEncendido={medios.micEncendido}
                    compartiendo={medios.compartiendo}
                    // El recuadro propio va SIEMPRE en silencio: sin esto, uno
                    // se oye a sí mismo con retardo y se acopla con el micro.
                    // Es lo primero que se nota y lo peor que puede hacer una
                    // videollamada.
                    propio
                />
                {malla.remotos.map((r) => (
                    <RecuadroRemoto key={r.id} remoto={r} />
                ))}
            </div>
        </div>
    );
}

function Centrada({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
            {children}
        </div>
    );
}

async function copiar(texto: string) {
    try {
        await navigator.clipboard.writeText(texto);
        toast.success("Enlace copiado.");
    } catch {
        // `clipboard` no existe fuera de HTTPS, y en un móvil viejo tampoco.
        // Decirlo es mejor que un botón que no hace nada.
        toast.error("No se pudo copiar. Copia la dirección de la barra.");
    }
}

/** Una fila de la sala de espera: quién es, y las dos decisiones. */
function FilaDeEspera({
    quien,
    codigo,
    lleno,
}: {
    quien: QuienEstaEnLaSala;
    codigo: string;
    lleno: boolean;
}) {
    const [ocupado, setOcupado] = useState(false);

    const decidir = async (pasa: boolean) => {
        if (ocupado) return;
        setOcupado(true);
        try {
            const res = pasa
                ? await dejarPasarAction({ codigo, participanteId: quien.id })
                : await sacarDeLaSalaAction({
                      codigo,
                      participanteId: quien.id,
                      motivo: "rechazado",
                  });
            if (!res.success) toast.error(res.message);
        } catch (error) {
            // Un botón que no dice por qué no hizo nada se pulsa cinco veces.
            console.warn("[sala] no se pudo decidir sobre quien espera", error);
            toast.error("No se pudo. Inténtalo otra vez.");
        } finally {
            setOcupado(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{quien.nombre}</span>
            <Button
                size="sm"
                className="h-7 bg-emerald-600 px-2 hover:bg-emerald-700"
                onClick={() => void decidir(true)}
                disabled={ocupado || lleno}
                // Y se dice POR QUÉ está apagado: un botón gris sin explicación
                // se lee como que la App está rota, no como que la sala está
                // llena.
                title={
                    lleno
                        ? `La reunión está llena (${TOPE_DE_LA_SALA} personas)`
                        : "Dejar entrar"
                }
            >
                <UserCheck className="mr-1 h-3.5 w-3.5" />
                Dejar entrar
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-zinc-300 hover:bg-zinc-800"
                onClick={() => void decidir(false)}
                disabled={ocupado}
                title="No dejar entrar"
                aria-label={`No dejar entrar a ${quien.nombre}`}
            >
                <UserX className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

function RecuadroRemoto({ remoto }: { remoto: RemotoEnLaSala }) {
    const conectando =
        remoto.estado !== "connected" && remoto.estado !== "closed" && !remoto.stream;
    return (
        <Recuadro
            stream={remoto.stream}
            nombre={remoto.nombre + (remoto.esInvitado ? " · invitado" : "")}
            hayVideo={remoto.hayVideo}
            micEncendido={remoto.micEncendido}
            compartiendo={remoto.compartiendo}
            conectando={conectando}
            fallo={remoto.estado === "failed"}
        />
    );
}

/**
 * Un recuadro de la rejilla.
 *
 * El `<video>` **no se desmonta** cuando no hay imagen: se esconde y encima se
 * pintan las iniciales. Desmontándolo se perdería el `srcObject`, y al volver
 * la cámara habría que volver a engancharlo — o sea, un recuadro que se queda
 * negro justo después de encender la cámara.
 */
function Recuadro({
    stream,
    nombre,
    hayVideo,
    micEncendido,
    compartiendo,
    propio = false,
    conectando = false,
    fallo = false,
}: {
    stream: MediaStream | null;
    nombre: string;
    hayVideo: boolean;
    micEncendido: boolean;
    compartiendo: boolean;
    propio?: boolean;
    conectando?: boolean;
    fallo?: boolean;
}) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        // Solo si cambió: reasignar el mismo `srcObject` reinicia la
        // reproducción y hace parpadear la imagen en cada repintado.
        if (el.srcObject !== stream) el.srcObject = stream;
    }, [stream]);

    return (
        // `h-full min-h-0` y NO `aspect-video`: la altura la reparte la
        // rejilla, que es quien sabe cuánto sitio hay. Con la altura atada al
        // ancho, dos filas se salen por abajo — ver `laRejilla`.
        <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                // El recuadro propio, SIEMPRE en silencio: sin esto uno se oye
                // a sí mismo con retardo y el micro se acopla.
                muted={propio}
                className={cn(
                    "h-full w-full",
                    // La pantalla compartida se enseña ENTERA (`contain`): con
                    // `cover` se recortan los bordes, que es justo donde está
                    // la barra de herramientas de lo que se está enseñando.
                    compartiendo ? "object-contain" : "object-cover",
                    // El recuadro propio va en espejo, como un espejo de
                    // verdad; el de los demás no, o el texto que enseñen
                    // saldría al revés.
                    propio && !compartiendo ? "-scale-x-100" : "",
                    hayVideo ? "" : "invisible",
                )}
            />

            {!hayVideo ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-medium text-zinc-300">
                        {lasIniciales(nombre)}
                    </span>
                    {conectando ? (
                        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Conectando…
                        </span>
                    ) : fallo ? (
                        // Se dice con sus palabras. «Se cortó» mandaría a
                        // buscar el fallo donde no está: esto es una ruta que
                        // no existe entre las dos redes, o sea que falta TURN.
                        <span className="px-2 text-center text-xs text-red-300">
                            No se pudo conectar con esta persona
                        </span>
                    ) : null}
                </div>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-100">{nombre}</span>
                {compartiendo ? (
                    <MonitorUp className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                ) : null}
                {!micEncendido ? (
                    <MicOff className="h-3.5 w-3.5 shrink-0 text-red-300" />
                ) : null}
            </div>
        </div>
    );
}

/** Un mando de la barra de abajo: encendido, apagado, y lo que dice cada uno. */
function Mando({
    encendido,
    onClick,
    rotuloEncendido,
    rotuloApagado,
    Icono,
    IconoApagado,
    ocupado = false,
    alReves = false,
}: {
    encendido: boolean;
    onClick: () => void;
    rotuloEncendido: string;
    rotuloApagado: string;
    Icono: typeof Mic;
    IconoApagado: typeof MicOff;
    ocupado?: boolean;
    alReves?: boolean;
}) {
    const rotulo = encendido ? rotuloEncendido : rotuloApagado;
    const Pintar = encendido ? Icono : IconoApagado;
    return (
        <Button
            size="icon"
            variant="ghost"
            className={cn(
                "h-12 w-12 rounded-full",
                alReves
                    ? encendido
                        ? "bg-sky-600 text-white hover:bg-sky-700"
                        : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                    : encendido
                      ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                      : "bg-red-600 text-white hover:bg-red-700",
            )}
            onClick={onClick}
            disabled={ocupado}
            aria-pressed={encendido}
            aria-label={rotulo}
            title={rotulo}
        >
            {ocupado ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <Pintar className="h-5 w-5" />
            )}
        </Button>
    );
}
