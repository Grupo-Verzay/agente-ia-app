"use client";

import { useEffect, useRef } from "react";
import { Hand, Loader2, MicOff, MonitorUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { laRejilla, lasIniciales } from "@/lib/sala-de-video";
import { laTiraDeMiniaturas } from "@/lib/voz-activa";

/**
 * Los recuadros de una reunión, en sus dos repartos.
 *
 * En su propio fichero porque los pinta **más de un sitio**: la reunión
 * desplegada y la plegada, que los esconde pero los mantiene montados para no
 * cortar el audio. Con una copia en cada rama, el día que se afine el reparto
 * plegar la reunión empezaría a sonar distinto — y eso no se ve mirando el
 * código.
 *
 * # Los dos repartos, y por qué el de orador es el de por defecto
 *
 * Con cuatro personas en cuadrícula todo el mundo sale del tamaño de un sello,
 * y lo que se mira en una reunión es **a quien habla**. La cuadrícula se queda
 * para cuando lo que importa es ver a todos a la vez, y se elige a mano.
 *
 * # El `<video>` no se desmonta NUNCA
 *
 * Ni al pasar de orador a cuadrícula, ni al plegar, ni cuando alguien apaga la
 * cámara. Desmontarlo pierde el `srcObject`, y con él **el audio de esa
 * persona**: se quedaría la reunión con la imagen bien y sin oír a nadie, que
 * es de los fallos más difíciles de mirar porque todo lo demás dice que va
 * bien. Lo que cambia entre repartos es dónde se coloca cada recuadro, no si
 * existe.
 */

export type LoQueSePinta = {
    id: string;
    stream: MediaStream | null;
    nombre: string;
    hayVideo: boolean;
    micEncendido: boolean;
    compartiendo: boolean;
    manoLevantada: boolean;
    /** El recuadro propio: va en silencio y en espejo. */
    propio?: boolean;
    conectando?: boolean;
    fallo?: boolean;
    /**
     * Si la conexión con esta persona se cayó y se está rehaciendo.
     *
     * **No es lo mismo que `fallo`** y por eso es otra bandera: `fallo` es una
     * ruta que no existe entre las dos redes —falta TURN, y no va a arreglarse
     * solo—, y esto es un corte que se está resolviendo ahora mismo. Con una
     * sola bandera, un bache de red diría «no se pudo conectar con esta
     * persona» y quien lo lea colgaría en vez de esperar tres segundos.
     */
    reconectando?: boolean;
};

export function RecuadrosDeLaSala({
    gente,
    distribucion,
    enGrande,
    className,
}: {
    gente: LoQueSePinta[];
    distribucion: "orador" | "cuadricula";
    /** A quién se pone en grande. Solo lo mira el reparto de orador. */
    enGrande: string | null;
    className?: string;
}) {
    if (distribucion === "cuadricula" || gente.length <= 1) {
        return (
            // `overflow-hidden` y no `overflow-y-auto`: la rejilla tiene que
            // CABER. Una videollamada en la que hay que bajar para ver al
            // cuarto es una videollamada de tres.
            <div className={cn("min-h-0 flex-1 overflow-hidden p-2 sm:p-3", className)}>
                <div className={cn("grid h-full gap-2", laRejilla(gente.length))}>
                    {gente.map((g) => (
                        <Recuadro key={g.id} {...g} />
                    ))}
                </div>
            </div>
        );
    }

    // Quien va en grande, y los demás en la tira. Si el elegido ya no está
    // —se fue entre dos vueltas— se cae al primero en vez de dejar el hueco
    // grande vacío: un recuadro grande en negro se lee como una conexión rota.
    const grande = gente.find((g) => g.id === enGrande) ?? gente[0];
    const resto = gente.filter((g) => g.id !== grande.id);
    const { contenedor, tira } = laTiraDeMiniaturas(resto.length);

    return (
        <div
            className={cn(
                "flex min-h-0 flex-1 gap-2 overflow-hidden p-2 sm:p-3",
                contenedor,
                className,
            )}
        >
            {/* `min-w-0 min-h-0` en el grande: sin ellos, un flex se niega a
                encoger a su hijo por debajo de su contenido y el recuadro
                grande empuja la tira fuera de la caja. */}
            <div className="min-h-0 min-w-0 flex-1">
                <Recuadro {...grande} grande />
            </div>
            <div
                className={cn(
                    // La tira SÍ se desplaza, al revés que la rejilla: son
                    // miniaturas, y con cuatro personas caben las tres; el
                    // desplazamiento es la red de seguridad para una pantalla
                    // muy estrecha, donde lo que no puede perderse es el
                    // orador.
                    "flex gap-2 overflow-auto",
                    tira,
                )}
            >
                {resto.map((g) => (
                    <div
                        key={g.id}
                        // Alto completo y ancho fijo en la tira de abajo; al
                        // revés cuando la tira va al lado. Sin el tamaño fijo,
                        // tres miniaturas en una tira de 80 px de alto se
                        // reparten el ancho y salen como rendijas.
                        className="h-full w-28 shrink-0 sm:h-24 sm:w-full"
                    >
                        <Recuadro {...g} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Un recuadro.
 *
 * El `<video>` **no se desmonta** cuando no hay imagen: se esconde y encima se
 * pintan las iniciales. Desmontándolo se perdería el `srcObject`, y al volver
 * la cámara habría que volver a engancharlo — o sea, un recuadro que se queda
 * negro justo después de encender la cámara.
 */
export function Recuadro({
    stream,
    nombre,
    hayVideo,
    micEncendido,
    compartiendo,
    manoLevantada,
    propio = false,
    conectando = false,
    fallo = false,
    reconectando = false,
    grande = false,
}: LoQueSePinta & { grande?: boolean }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        // Solo si cambió: reasignar el mismo `srcObject` reinicia la
        // reproducción y hace parpadear la imagen en cada repintado.
        if (el.srcObject !== stream) el.srcObject = stream;
    }, [stream]);

    return (
        // `h-full min-h-0` y NO `aspect-video`: la altura la reparte quien
        // coloca, que es el único que sabe cuánto sitio hay. Con la altura
        // atada al ancho, dos filas se salen por abajo.
        <div
            className={cn(
                "relative h-full min-h-0 overflow-hidden rounded-lg border bg-zinc-900",
                // El anillo ámbar es la mano levantada, y va en el BORDE y no
                // solo en el icono: en la tira de miniaturas el icono mide diez
                // píxeles y no lo ve nadie.
                manoLevantada ? "border-amber-400 ring-2 ring-amber-400/60" : "border-zinc-800",
            )}
        >
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
                    <span
                        className={cn(
                            "flex items-center justify-center rounded-full bg-zinc-800 font-medium text-zinc-300",
                            grande ? "h-20 w-20 text-2xl" : "h-10 w-10 text-sm sm:h-14 sm:w-14 sm:text-lg",
                        )}
                    >
                        {lasIniciales(nombre)}
                    </span>
                    {reconectando ? (
                        // Antes que `fallo` a propósito: mientras se está
                        // rehaciendo la conexión, lo cierto es que se está
                        // rehaciendo — aunque por debajo esté en `failed`, que
                        // es justo el estado desde el que se rehace.
                        <span className="flex items-center gap-1.5 text-xs text-amber-300">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Reconectando…
                        </span>
                    ) : conectando ? (
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

            {/* La mano, arriba a la izquierda y fuera del pie: el pie ya lleva
                el nombre y los dos iconos de estado, y en una miniatura no cabe
                un tercero sin comerse el nombre. */}
            {manoLevantada ? (
                <span
                    className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-zinc-900"
                    title={`${nombre} ha levantado la mano`}
                    aria-label={`${nombre} ha levantado la mano`}
                >
                    <Hand className="h-3.5 w-3.5" />
                </span>
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
