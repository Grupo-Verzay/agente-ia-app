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
 * # El AUDIO no viaja en el `<video>`: va en un pool aparte que NO se remonta
 *
 * Esta es la regla de la que cuelga que la reunión se oiga, y costó una vuelta
 * entera de «se apaga la cámara y ya no se escucha a nadie». El motivo:
 *
 * En la vista de orador, el recuadro grande y las miniaturas son **nodos
 * distintos del árbol** —uno es hijo directo del hueco `flex-1`, las otras van
 * en envoltorios con `key`—. Y quién va en grande lo decide `elQueHabla`, que
 * **cambia constantemente** según quién habla: cada vez que el orador cambia,
 * la persona que se mueve de grande a la tira (o al revés) **se remonta**. Si
 * su audio viajara en ese `<video>`, el remonte le quita el `srcObject` y con
 * él el sonido —y en un elemento recién montado a mitad de reunión el navegador
 * a menudo ni deja que el audio vuelva a arrancar solo—. Apagar la cámara
 * dispara justo ese baile: cambia quién habla, y de paso remonta al otro.
 *
 * Así que el sonido de cada persona vive en un **`<audio>` propio, oculto y
 * estable** (`PoolDeAudioDeLaSala`), montado UNA vez y con `key` por id, que
 * **nunca** entra en el reparto que se reordena. El `<video>` puede remontarse
 * todo lo que quiera —es solo imagen, y va `muted`— sin cortar a nadie. El
 * permiso de reproducción se da una vez, al entrar, y no se vuelve a pedir
 * porque el elemento no se vuelve a crear.
 *
 * # El `<video>` sigue sin desmontarse a propósito donde se puede
 *
 * El pool arregla el audio; el `<video>` estable evita el parpadeo de la
 * imagen. Lo que cambia entre repartos es dónde se coloca cada recuadro, no si
 * existe — pero si algún día un refactor lo remonta, **el audio ya no depende
 * de eso**.
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
    tiraPlegada = false,
    className,
}: {
    gente: LoQueSePinta[];
    distribucion: "orador" | "cuadricula";
    /** A quién se pone en grande. Solo lo mira el reparto de orador. */
    enGrande: string | null;
    /**
     * Si la tira de miniaturas va escondida.
     *
     * Escondida y **no desmontada** (`display:none`): quitar los `<video>` de
     * la tira se llevaría el audio de esa gente, igual que al plegar la reunión
     * entera. Con la tira fuera del reparto, el recuadro grande —que es
     * `flex-1`— crece y ocupa su ancho. Solo lo mira el reparto de orador.
     */
    tiraPlegada?: boolean;
    className?: string;
}) {
    // El sonido va SIEMPRE por el pool, monte donde monte el reparto de abajo su
    // `<video>`. Es lo primero que se pinta y con `key` estable, así que ningún
    // cambio de vista, de orador o de cámara lo remonta. Ver la cabecera.
    return (
        <>
            <PoolDeAudioDeLaSala gente={gente} />
            {distribucion === "cuadricula" || gente.length <= 1
                ? repartoEnCuadricula(gente, className)
                : repartoDeOrador(gente, enGrande, tiraPlegada, className)}
        </>
    );
}

function repartoEnCuadricula(gente: LoQueSePinta[], className?: string) {
    return (
        // `overflow-hidden` y no `overflow-y-auto`: la rejilla tiene que
        // CABER. Una videollamada en la que hay que bajar para ver al
        // cuarto es una videollamada de tres.
        //
        // Y **sin relleno exterior**: el video ocupa toda la caja, que es
        // lo que la cabecera y los mandos dejaron libre al pasar a flotar
        // encima. Lo único que separa un recuadro de otro es el `gap`.
        <div data-rejilla-de-la-sala className={cn("min-h-0 flex-1 overflow-hidden", className)}>
            <div className={cn("grid h-full gap-1.5", laRejilla(gente.length))}>
                {gente.map((g) => (
                    // Con una sola persona el recuadro ES la caja, así que
                    // ni borde ni esquinas: un marco redondeado a sangre
                    // deja cuatro muescas del fondo en las esquinas y se
                    // lee como que el video no llega al borde.
                    <Recuadro key={g.id} {...g} sinMarco={gente.length <= 1} />
                ))}
            </div>
        </div>
    );
}

function repartoDeOrador(
    gente: LoQueSePinta[],
    enGrande: string | null,
    tiraPlegada: boolean,
    className?: string,
) {
    // Quien va en grande, y los demás en la tira. Si el elegido ya no está
    // —se fue entre dos vueltas— se cae al primero en vez de dejar el hueco
    // grande vacío: un recuadro grande en negro se lee como una conexión rota.
    const grande = gente.find((g) => g.id === enGrande) ?? gente[0];
    const resto = gente.filter((g) => g.id !== grande.id);
    const { contenedor, tira } = laTiraDeMiniaturas(resto.length);

    return (
        <div
            data-rejilla-de-la-sala
            className={cn(
                "flex min-h-0 flex-1 gap-1.5 overflow-hidden",
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
                    "flex gap-1.5 overflow-auto",
                    tira,
                    // Plegada: fuera del reparto —el orador (`flex-1`) crece y
                    // ocupa este ancho— pero los `<video>` de dentro siguen
                    // MONTADOS. El audio de esta gente va por el pool igual, así
                    // que ni plegar ni el remonte del orador lo cortan.
                    tiraPlegada ? "hidden" : "",
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
 * El sonido de la sala, en `<audio>` ocultos y estables, uno por persona.
 *
 * Es lo que hace que apagar la cámara —o que cambie quién habla, que pasa cada
 * pocos segundos— no corte a nadie: estos elementos **nunca** entran en el
 * reparto que se reordena, así que no se remontan, así que el `srcObject` no se
 * suelta y el navegador no tiene que volver a dar permiso de reproducción.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Solo los demás.** El propio NO suena: uno se oiría a sí mismo con
 *    retardo, que es lo más desagradable que puede hacer una videollamada. Por
 *    eso los `<video>` van TODOS `muted` y el sonido sale solo de aquí, y aquí
 *    se filtra `propio`.
 * 2. **`key` por id.** Reordenar la lista mueve el nodo sin remontarlo; quitar
 *    la `key` lo remontaría al reordenar, que es justo lo que se evita.
 * 3. **Oculto pero MONTADO.** `display:none` no para el audio —un `<audio>` no
 *    tiene nada que pintar—, así que esconderlo no lo calla. Desmontarlo sí.
 */
function PoolDeAudioDeLaSala({ gente }: { gente: LoQueSePinta[] }) {
    return (
        <div className="hidden" aria-hidden data-pool-de-audio>
            {gente
                .filter((g) => !g.propio)
                .map((g) => (
                    <AudioDeParticipante key={g.id} id={g.id} stream={g.stream} />
                ))}
        </div>
    );
}

/** Un `<audio>` que sigue a una persona toda la reunión. Ver el pool. */
function AudioDeParticipante({ id, stream }: { id: string; stream: MediaStream | null }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        // Solo si cambió: reasignar el mismo `srcObject` reinicia la
        // reproducción y puede meter un salto en el audio.
        if (el.srcObject !== stream) el.srcObject = stream;
        // Y se pide reproducir: el elemento se crea UNA vez, dentro del gesto de
        // entrar, así que el permiso está dado. `play()` puede rechazar si el
        // stream aún no trae audio; la vuelta siguiente, con pista, lo consigue.
        el.play().catch(() => {
            // Sin permiso o sin pista todavía. No es un error que nadie tenga
            // que ver, y reintentarlo en bucle no ayudaría.
        });
    }, [stream]);

    return <audio ref={audioRef} data-audio-remoto={id} autoPlay playsInline />;
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
    sinMarco = false,
}: LoQueSePinta & { grande?: boolean; sinMarco?: boolean }) {
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
            data-recuadro
            className={cn(
                "relative h-full min-h-0 overflow-hidden border bg-zinc-900",
                sinMarco ? "rounded-none" : "rounded-lg",
                // El anillo ámbar es la mano levantada, y va en el BORDE: el
                // icono, en el pie (ver abajo). El borde se ve por los lados y
                // por abajo aunque la cabecera flotante tape el filo de arriba,
                // así que sigue siendo señal. Se pinta **aunque el recuadro vaya
                // sin marco**: es lo único que dice que alguien pidió la
                // palabra, y con una sola persona en la sala esa persona es la
                // que la pidió.
                manoLevantada
                    ? "border-amber-400 ring-2 ring-amber-400/60"
                    : sinMarco
                      ? "border-transparent"
                      : "border-zinc-800",
            )}
        >
            <video
                ref={videoRef}
                autoPlay
                playsInline
                // SIEMPRE en silencio, también los de los demás: el sonido sale
                // del pool de `<audio>` estable (ver la cabecera), no de aquí.
                // Así este `<video>` puede remontarse al cambiar de vista o de
                // orador sin cortarle el audio a nadie. Sin este `muted` en los
                // remotos, además, se oiría a cada uno DOS veces —el pool y el
                // `<video>`—.
                muted
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

            {/* El pie va a la IZQUIERDA y la barra de mandos flota centrada,
                así que no se pisan aunque el recuadro llegue al borde de abajo.
                Medido: la barra son ~290 px centrados y el nombre se queda en
                su mitad.

                La mano va AQUÍ, al principio del pie, y NO arriba a la
                izquierda. Ahí la tapaba el título flotante «Reunión» de la
                cabecera —misma esquina, `absolute top-0 z-20` a todo lo ancho—,
                así que en el recuadro grande y en el de arriba la señal quedaba
                escondida detrás de «Reunión». El pie nunca queda debajo de la
                cabecera, así que se ve siempre; el anillo ámbar del borde la
                acompaña. Es `shrink-0` y solo aparece cuando la mano está
                levantada —raro—, así que como mucho recorta un poco el nombre en
                una miniatura, que es lo que antes se evitaba sacándola del pie. */}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                {manoLevantada ? (
                    <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-zinc-900"
                        title={`${nombre} ha levantado la mano`}
                        aria-label={`${nombre} ha levantado la mano`}
                    >
                        <Hand className="h-3 w-3" />
                    </span>
                ) : null}
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
