"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Copy,
    GripVertical,
    Hand,
    LayoutGrid,
    Loader2,
    Maximize2,
    MessageSquare,
    Mic,
    MicOff,
    Minimize2,
    MonitorUp,
    PhoneOff,
    ScreenShare,
    Sparkles,
    UserCheck,
    UserX,
    Users,
    Video,
    VideoOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
    DISTRIBUCION_POR_DEFECTO,
    LLAVE_DE_LA_DISTRIBUCION,
    TOPE_DE_LA_SALA,
    esUnaDistribucion,
    hayQueObedecerElSilencio,
    laDistribucionQueSeVe,
    type Distribucion,
} from "@/lib/sala-de-video";
import {
    LLAVE_DEL_FONDO,
    esUnModoDeFondo,
    type ModoDeFondo,
} from "@/lib/fondo-de-video";
import {
    VENTANA_POR_DEFECTO,
    alAmpliar,
    alReducir,
    alSalirDePantallaCompleta,
    quiereLaPantallaCompleta,
    type EstadoDeLaVentana,
} from "@/lib/ventana-de-reunion";
// El mismo formato de duración que la llamada de voz. Con una copia, el día
// que se afine el de una el otro se queda diciendo otra cosa.
import { comoSeLeeLaDuracion } from "@/lib/llamada-de-voz";
import { useMediosDeLlamada } from "@/hooks/useMediosDeLlamada";
import { useMallaDeVideo } from "@/hooks/useMallaDeVideo";
import { useVozActiva } from "@/hooks/useVozActiva";
import { RecuadrosDeLaSala, type LoQueSePinta } from "@/components/video/RecuadrosDeLaSala";
import { PanelDeLaReunion, type QuienEnElPanel } from "@/components/video/PanelDeLaReunion";
import {
    dejarPasarAction,
    levantarLaManoAction,
    salirDeLaSalaAction,
    sacarDeLaSalaAction,
    type QuienEstaEnLaSala,
} from "@/actions/salas-de-video-actions";

/**
 * La sala de video: hasta cuatro personas, navegador contra navegador.
 *
 * **La misma pantalla la usan los dos lados**: quien entra desde el chat del
 * equipo y quien entra de fuera con un enlace. Lo único que cambia es cómo se
 * identifica —la sesión o un token— y qué tamaños de ventana se le ofrecen, y
 * las dos cosas viajan en props. Con dos pantallas, el día que se afine el
 * botón de compartir se afina en una y la otra se queda atrás, que es lo que
 * este repositorio ya ha pagado varias veces.
 *
 * # La pantalla completa la pide ESTA pantalla, no quien la monta
 *
 * Porque es quien tiene el elemento: `requestFullscreen` se le pide a un nodo,
 * y el nodo es esta caja. Y se sincroniza en los **dos** sentidos — Escape y
 * F11 sacan del modo sin avisarle a nadie, así que sin escuchar
 * `fullscreenchange` la reunión se quedaría dibujada como completa dentro de
 * una página que ya no lo está.
 */
export function SalaDeVideo({
    codigo,
    token,
    enlace,
    alSalir,
    ventana,
    onVentana,
    estadosQueOfrece,
    asa,
    alVolverAEntrar,
}: {
    codigo: string;
    /** El token de quien entró por el enlace. Vacío para quien tiene cuenta. */
    token?: string | null;
    /** La dirección para copiar y pasarle a alguien. */
    enlace?: string | null;
    alSalir?: () => void;
    /** Cómo se ve ahora. Lo decide quien la monta: es quien sostiene la caja. */
    ventana: EstadoDeLaVentana;
    onVentana: (v: EstadoDeLaVentana) => void;
    /**
     * Qué tamaños se ofrecen aquí.
     *
     * En la plataforma, los cuatro. En la pestaña pública solo `maximizada` y
     * `completa`: ahí la reunión **es** la pestaña, así que plegarla a una
     * pastilla dejaría una página en blanco con una pastilla encima, y un
     * «panel flotante» no tendría nada debajo sobre lo que flotar.
     */
    estadosQueOfrece: readonly EstadoDeLaVentana[];
    /** Los manejadores del arrastre, para el trozo que hace de asa. */
    asa?: { className?: string } & Record<string, unknown>;
    /**
     * Volver a entrar, cuando el servidor ya te ha sacado.
     *
     * Hace falta porque quedarse fuera **no siempre es una decisión**: el
     * latido saca a quien deja de dar señales, así que una pestaña dormida unos
     * minutos vuelve encontrándose el cartel.
     */
    alVolverAEntrar?: () => Promise<void> | void;
}) {
    const medios = useMediosDeLlamada({ alFallar: (m) => toast.error(m) });
    const [arrancando, setArrancando] = useState(true);
    const [saliendo, setSaliendo] = useState(false);
    const [reentrando, setReentrando] = useState(false);
    const malla = useMallaDeVideo({ codigo, token, medios, activo: !arrancando });

    const raizRef = useRef<HTMLDivElement | null>(null);
    const minimizada = ventana === "pastilla";

    // ── Lo que se recuerda entre reuniones ──────────────────────────────────
    //
    // En `localStorage` y no en la base, como el tamaño de la ventana: son
    // preferencias de este navegador y una escritura por cada vez que alguien
    // cambia de vista sería una petición por gesto para devolver algo que no
    // importa si se pierde. Todo en `try`: en una ventana privada leerlo puede
    // lanzar, y sin eso la sala entera se cae justo donde más se mira la
    // privacidad.
    const [distribucion, setDistribucion] = useState<Distribucion>(DISTRIBUCION_POR_DEFECTO);
    const [panel, setPanel] = useState<"chat" | "gente" | null>(null);
    const [pestanaDelPanel, setPestanaDelPanel] = useState<"chat" | "gente">("chat");

    useEffect(() => {
        try {
            const d = window.localStorage.getItem(LLAVE_DE_LA_DISTRIBUCION);
            if (esUnaDistribucion(d)) setDistribucion(d);
        } catch {
            // Sin `localStorage` se usa lo de por defecto, que es lo correcto.
        }
    }, []);

    const cambiarDistribucion = useCallback((d: Distribucion) => {
        setDistribucion(d);
        try {
            window.localStorage.setItem(LLAVE_DE_LA_DISTRIBUCION, d);
        } catch {
            // Que no se recuerde no puede impedir que se cambie ahora.
        }
    }, []);

    /**
     * El fondo elegido se restaura **cuando la cámara ya está encendida**.
     *
     * Antes no tendría a qué aplicarse: `cambiarElFondo` sin cámara solo guarda
     * la elección. Y se hace una sola vez por reunión —con un guardián— porque
     * si no, cada vez que alguien apagara el fondo a mano se le volvería a
     * poner en el repintado siguiente.
     */
    const fondoRestaurado = useRef(false);
    useEffect(() => {
        if (fondoRestaurado.current || !medios.camaraEncendida) return;
        fondoRestaurado.current = true;
        try {
            const f = window.localStorage.getItem(LLAVE_DEL_FONDO);
            if (esUnModoDeFondo(f) && f !== "ninguno") void medios.cambiarElFondo(f);
        } catch {
            // Igual que arriba.
        }
        // `medios` cambia de identidad en cada repintado; lo que dispara esto
        // es que la cámara pase a estar encendida.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [medios.camaraEncendida]);

    const cambiarFondo = useCallback(
        async (f: ModoDeFondo) => {
            await medios.cambiarElFondo(f);
            try {
                window.localStorage.setItem(LLAVE_DEL_FONDO, f);
            } catch {
                // Igual que arriba.
            }
        },
        [medios],
    );

    // ── Pantalla completa ───────────────────────────────────────────────────
    //
    // **Se pide DENTRO del clic, nunca desde un efecto.** Esto estaba en un
    // `useEffect` que miraba `ventana`, o sea una tarea después del gesto: el
    // navegador solo concede pantalla completa desde un manejador de un evento
    // de la persona, y un efecto ya no lo es —depende de que la activación
    // transitoria sobreviva al salto—. Chromium la conserva unos segundos y
    // por eso allí «funcionaba»; donde no, la promesa se rechaza, el `catch`
    // caía a `alSalirDePantallaCompleta()` y la reunión se quedaba
    // **maximizada** — que es exactamente el síntoma reportado: «no entra en
    // pantalla completa, deja visibles la barra superior y la lateral».
    //
    // Y el estado se mueve **solo si el navegador dijo que sí**: pintarse como
    // completa dentro de una página que no lo está es peor que no entrar, y es
    // lo que hacía el orden anterior (primero el estado, después la petición).
    const irA = useCallback(
        (siguiente: EstadoDeLaVentana) => {
            if (siguiente === ventana) return;
            if (quiereLaPantallaCompleta(siguiente)) {
                const nodo = raizRef.current;
                if (!nodo?.requestFullscreen) {
                    // No se finge: sin el método no pasa nada y nadie se
                    // entera. `?.()` aquí devolvía `undefined` en silencio.
                    toast.error("Este navegador no tiene pantalla completa.");
                    return;
                }
                void nodo.requestFullscreen().then(
                    () => onVentana(siguiente),
                    (error: unknown) => {
                        console.warn("[sala] no se pudo poner a pantalla completa", error);
                        toast.error(
                            "Tu navegador no dejó poner la reunión a pantalla completa.",
                        );
                    },
                );
                return;
            }
            if (typeof document !== "undefined" && document.fullscreenElement) {
                void document.exitFullscreen?.().catch(() => {
                    // Salir de un modo en el que ya no se está no es un error.
                });
            }
            onVentana(siguiente);
        },
        [onVentana, ventana],
    );

    /**
     * Si este navegador la tiene, para no ofrecer un botón que da error.
     *
     * `fullscreenEnabled` contesta las dos cosas que la apagan: que el
     * navegador no la implemente —iOS Safari no tiene `requestFullscreen` en
     * un elemento cualquiera— y que estemos dentro de un iframe sin permiso.
     * Arranca en `true` y se corrige al montar: leer `document` al pintar
     * daría una salida en el servidor y otra en el navegador, o sea una
     * hidratación rota.
     */
    const [hayPantallaCompleta, setHayPantallaCompleta] = useState(true);
    useEffect(() => {
        setHayPantallaCompleta(
            typeof document !== "undefined" &&
                document.fullscreenEnabled === true &&
                typeof Element.prototype.requestFullscreen === "function",
        );
    }, []);

    // La otra mitad, y solo la otra mitad: **salir**. Salir no pide ningún
    // gesto, así que sí puede vivir en un efecto — y hace falta, porque a
    // `completa` se deja de querer por caminos que no pasan por `irA` (el
    // panel se despliega solo cuando te sacan de la reunión).
    useEffect(() => {
        if (typeof document === "undefined") return;
        const nodo = raizRef.current;
        if (quiereLaPantallaCompleta(ventana)) return;
        if (document.fullscreenElement && document.fullscreenElement === nodo) {
            void document.exitFullscreen?.().catch(() => {});
        }
    }, [ventana]);

    // Y al desmontar. Sin esto, cerrar el panel estando a pantalla completa
    // deja el navegador en ese modo con la reunión ya cerrada: una pantalla en
    // negro sin nada que la explique.
    useEffect(() => {
        return () => {
            if (typeof document === "undefined") return;
            if (document.fullscreenElement) {
                void document.exitFullscreen?.().catch(() => {});
            }
        };
    }, []);

    useEffect(() => {
        const alCambiar = () => {
            // Escape y F11 sacan del modo sin decírselo a nadie. Quien los
            // pulsó quería salir de pantalla completa, no encoger la reunión.
            if (!document.fullscreenElement && quiereLaPantallaCompleta(ventana)) {
                onVentana(alSalirDePantallaCompleta());
            }
        };
        document.addEventListener("fullscreenchange", alCambiar);
        return () => document.removeEventListener("fullscreenchange", alCambiar);
    }, [onVentana, ventana]);

    /**
     * Cuánto se lleva dentro.
     *
     * Desde que se ENTRÓ, no desde que se abrió la pestaña: el rato en la sala
     * de espera no es reunión, igual que el rato sonando no es llamada.
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
            onVentana(VENTANA_POR_DEFECTO);
        }
    }, [minimizada, malla.estado, onVentana]);

    /**
     * Obedecer la petición de silencio.
     *
     * **El servidor no apaga ningún micro**: deja una marca y es esta pestaña
     * la que se calla. Por eso se recuerda cuál se obedeció — sin eso, cada
     * vuelta del reloj traería la misma orden y quien decidiera volver a hablar
     * se callaría solo una y otra vez, sin entender por qué.
     */
    const silencioObedecido = useRef<string | null>(null);
    useEffect(() => {
        const orden = malla.yo?.silenciadoEn ?? null;
        if (!hayQueObedecerElSilencio(orden, silencioObedecido.current)) return;
        silencioObedecido.current = orden;
        if (medios.micEncendido) {
            medios.alternarMic();
            // Se dice. Un micrófono que se apaga solo, sin explicación, se lee
            // como que la App se rompió.
            toast.info("Te han pedido que silencies tu micrófono.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [malla.yo?.silenciadoEn]);

    /**
     * Pedir los medios ANTES de empezar a conectar.
     *
     * Con la cámara ya encendida cuando sale la primera oferta, la otra punta
     * ve imagen desde el primer fotograma. Se entra **aunque falle**: sin micro
     * ni cámara se sigue viendo y oyendo a los demás, que es más que quedarse
     * fuera.
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
        // Y se sale de pantalla completa: sin esto, el navegador se queda en
        // ese modo con la reunión ya cerrada, o sea una página negra a pantalla
        // completa sin nada que la explique.
        if (document.fullscreenElement) {
            void document.exitFullscreen?.().catch(() => {});
        }
        try {
            await salirDeLaSalaAction({ codigo, token });
        } catch (error) {
            // El latido la sacaría igual en unos segundos; esto solo hace que
            // el recuadro desaparezca ya.
            console.warn("[sala] no se pudo salir limpiamente", error);
        }
        alSalir?.();
    }, [alSalir, codigo, medios, saliendo, token]);

    const volverAEntrar = useCallback(async () => {
        if (reentrando) return;
        setReentrando(true);
        try {
            await medios.arrancar(true);
            await alVolverAEntrar?.();
        } catch (error) {
            console.warn("[sala] no se pudo volver a entrar", error);
            toast.error("No se pudo volver a entrar. Inténtalo otra vez.");
        } finally {
            setReentrando(false);
        }
    }, [alVolverAEntrar, medios, reentrando]);

    const alternarLaMano = useCallback(async () => {
        const levantada = !malla.yo?.manoLevantada;
        try {
            const res = await levantarLaManoAction({ codigo, token, levantada });
            if (!res.success) toast.error(res.message);
        } catch (error) {
            console.warn("[sala] no se pudo levantar la mano", error);
            toast.error("No se pudo. Inténtalo otra vez.");
        }
    }, [codigo, malla.yo?.manoLevantada, token]);

    /**
     * Quedarse fuera apaga la cámara y el micrófono.
     *
     * Sin ello, a quien el servidor saca le queda el **piloto de la cámara
     * encendido** mirando un cartel que dice que ya no está en la reunión.
     */
    useEffect(() => {
        if (malla.estado === "fuera") medios.soltarTodo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [malla.estado]);

    useEffect(() => {
        const alCerrar = () => medios.soltarTodo();
        window.addEventListener("pagehide", alCerrar);
        return () => window.removeEventListener("pagehide", alCerrar);
    }, [medios]);

    // ── Lo que se pinta ─────────────────────────────────────────────────────

    const miId = malla.yo?.participanteId ?? null;

    /**
     * Las fuentes de audio que se miden, **yo incluido**.
     *
     * Sin el propio, quien habla nunca se vería a sí mismo en grande y la vista
     * de orador se sentiría rota justo para quien la prueba solo.
     */
    const fuentes = useMemo(
        () => [
            { id: miId ?? "yo", stream: medios.local, micEncendido: medios.micEncendido },
            ...malla.remotos.map((r) => ({
                id: r.id,
                stream: r.stream,
                micEncendido: r.micEncendido,
            })),
        ],
        [malla.remotos, medios.local, medios.micEncendido, miId],
    );
    const quienHabla = useVozActiva({ fuentes, activo: dentro });

    const gente: LoQueSePinta[] = useMemo(
        () => [
            {
                id: miId ?? "yo",
                stream: medios.local,
                nombre: `${malla.yo?.nombre ?? "Tú"} (tú)`,
                hayVideo: Boolean(medios.local),
                micEncendido: medios.micEncendido,
                compartiendo: medios.compartiendo,
                manoLevantada: Boolean(malla.yo?.manoLevantada),
                propio: true,
            },
            ...malla.remotos.map((r) => ({
                id: r.id,
                stream: r.stream,
                nombre: r.nombre + (r.esInvitado ? " · invitado" : ""),
                hayVideo: r.hayVideo,
                micEncendido: r.micEncendido,
                compartiendo: r.compartiendo,
                manoLevantada: r.manoLevantada,
                conectando:
                    r.estado !== "connected" && r.estado !== "closed" && !r.stream,
                fallo: r.estado === "failed",
            })),
        ],
        [
            malla.remotos,
            malla.yo?.manoLevantada,
            malla.yo?.nombre,
            medios.compartiendo,
            medios.local,
            medios.micEncendido,
            miId,
        ],
    );

    const enElPanel: QuienEnElPanel[] = useMemo(
        () => [
            {
                id: miId ?? "yo",
                nombre: malla.yo?.nombre ?? "Tú",
                esInvitado: false,
                esElAnfitrion: false,
                micEncendido: medios.micEncendido,
                manoLevantada: Boolean(malla.yo?.manoLevantada),
                soyYo: true,
            },
            ...malla.remotos.map((r) => ({
                id: r.id,
                nombre: r.nombre,
                esInvitado: r.esInvitado,
                esElAnfitrion: r.esElAnfitrion,
                micEncendido: r.micEncendido,
                manoLevantada: r.manoLevantada,
                soyYo: false,
            })),
        ],
        [malla.remotos, malla.yo?.manoLevantada, malla.yo?.nombre, medios.micEncendido, miId],
    );

    const cuantos = gente.length;
    const nombre = malla.sala?.titulo || "Reunión";
    // Quien se está compartiendo la pantalla gana el recuadro grande sobre
    // quien habla: se comparte para que se MIRE, y quien comparte suele estar
    // explicando lo que enseña — o sea que ganaría igual, pero un segundo tarde.
    const compartiendo = gente.find((g) => g.compartiendo);
    const enGrande = compartiendo?.id ?? quienHabla;

    const laRejillaDeAhora = (
        <RecuadrosDeLaSala
            gente={gente}
            distribucion={laDistribucionQueSeVe(distribucion, cuantos)}
            enGrande={enGrande}
        />
    );

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
                <p className="text-base font-medium">
                    {malla.motivo ?? "Ya no estás en la reunión."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {alVolverAEntrar ? (
                        <Button size="sm" onClick={() => void volverAEntrar()} disabled={reentrando}>
                            {reentrando ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Entrando…
                                </>
                            ) : (
                                "Volver a entrar"
                            )}
                        </Button>
                    ) : null}
                    {/* «Cierra la pestaña» solo donde eso es cierto: dentro de
                        la plataforma lo que hay que cerrar es el panel, y sin
                        botón no hay forma. */}
                    {asa || estadosQueOfrece.includes("pastilla") ? (
                        <Button variant="outline" size="sm" onClick={() => alSalir?.()}>
                            Cerrar
                        </Button>
                    ) : (
                        <p className="max-w-sm text-sm text-muted-foreground">
                            Puedes cerrar esta pestaña.
                        </p>
                    )}
                </div>
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

    // PLEGADA: la pastilla. Los recuadros se quedan montados debajo, escondidos
    // con `display:none` y **no desmontados**: desmontarlos se llevaría por
    // delante los `<video>` y con ellos el audio de los demás. Plegar una
    // reunión tiene que dejarte seguir oyéndola — si no, plegarla es salirse.
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
                        onClick={() => irA(alAmpliar(ventana))}
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
                <div className="hidden">{laRejillaDeAhora}</div>
            </>
        );
    }

    // Aquí `ventana` ya no puede ser `pastilla` —esa rama salió arriba— así
    // que basta con preguntar si el escalón de al lado se ofrece en este sitio.
    //
    // Y los extremos se quedan quietos (`alAmpliar("completa")` devuelve
    // `completa`), así que sin el `!==` el botón saldría en el último escalón
    // sin hacer nada al pulsarlo.
    const masPequena = alReducir(ventana);
    const masGrande = alAmpliar(ventana);
    const puedeReducir = masPequena !== ventana && estadosQueOfrece.includes(masPequena);
    const puedeAmpliar =
        masGrande !== ventana &&
        estadosQueOfrece.includes(masGrande) &&
        // Un botón que al pulsarlo da error es peor que no tenerlo.
        (!quiereLaPantallaCompleta(masGrande) || hayPantallaCompleta);

    return (
        <div
            ref={raizRef}
            data-sala-de-video
            className="flex h-full min-h-0 w-full flex-col bg-zinc-950 text-zinc-100"
        >
            {/* La cabecera: qué reunión es, cuántos hay y los mandos de vista. */}
            <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-2 sm:gap-2 sm:px-3">
                {/* El asa se lleva SOLO el nombre, no la cabecera entera.
                    Puesta en el contenedor, captura el puntero al agarrarla y
                    los eventos de después se le redirigen: el `click` de los
                    botones no llegaría a salir nunca. Es la misma regla que ya
                    costó una vuelta en la tarjeta de llamada. */}
                <div
                    {...asa}
                    className={cn(
                        "min-w-0 flex-1 truncate rounded px-1 py-0.5 text-sm font-medium",
                        asa?.className ?? "",
                    )}
                >
                    {nombre}
                </div>
                <span className="hidden shrink-0 items-center gap-1.5 text-xs text-zinc-400 sm:flex">
                    <Users className="h-3.5 w-3.5" />
                    <span className="tabular-nums">
                        {cuantos} de {TOPE_DE_LA_SALA}
                    </span>
                </span>

                <MandoDeCabecera
                    activo={laDistribucionQueSeVe(distribucion, cuantos) === "cuadricula"}
                    onClick={() =>
                        cambiarDistribucion(distribucion === "orador" ? "cuadricula" : "orador")
                    }
                    rotulo={
                        distribucion === "orador"
                            ? "Ver a todos en cuadrícula"
                            : "Ver en grande a quien habla"
                    }
                    Icono={LayoutGrid}
                    // Con una sola persona no hay nada que repartir, así que el
                    // botón no promete un cambio que no va a pasar.
                    apagado={cuantos <= 1}
                />
                <MandoDeCabecera
                    activo={panel === "chat" || panel === "gente"}
                    onClick={() => setPanel((p) => (p ? null : pestanaDelPanel))}
                    rotulo={panel ? "Cerrar el panel" : "Abrir el chat y la gente"}
                    Icono={MessageSquare}
                />
                {enlace ? (
                    <MandoDeCabecera
                        activo={false}
                        onClick={() => void copiar(enlace)}
                        rotulo="Copiar el enlace de la reunión"
                        Icono={Copy}
                    />
                ) : null}
                {puedeReducir ? (
                    <MandoDeCabecera
                        activo={false}
                        onClick={() => irA(masPequena)}
                        rotulo={
                            masPequena === "pastilla"
                                ? "Plegar a una pastilla"
                                : "Salir de pantalla completa"
                        }
                        Icono={Minimize2}
                    />
                ) : null}
                {puedeAmpliar ? (
                    <MandoDeCabecera
                        activo={false}
                        onClick={() => irA(masGrande)}
                        rotulo={
                            masGrande === "completa" ? "Pantalla completa" : "Ampliar"
                        }
                        Icono={Maximize2}
                    />
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

            {/* Los recuadros y el panel, lado a lado. El panel se SUPERPONE por
                debajo de `sm`: en un móvil, con la lista al lado no quedaría
                nada para los recuadros. */}
            <div className="relative flex min-h-0 flex-1">
                {laRejillaDeAhora}
                {panel ? (
                    <div className="absolute inset-0 z-10 sm:static sm:z-auto sm:w-64 sm:shrink-0 md:w-72">
                        <PanelDeLaReunion
                            codigo={codigo}
                            token={token}
                            mensajes={malla.mensajes}
                            gente={enElPanel}
                            moderas={Boolean(malla.yo?.moderas)}
                            miId={miId}
                            alCerrar={() => setPanel(null)}
                            pestana={pestanaDelPanel}
                            onPestana={(p) => {
                                setPestanaDelPanel(p);
                                setPanel(p);
                            }}
                        />
                    </div>
                ) : null}
            </div>

            {/* Los mandos. Abajo y grandes: es lo que se busca con prisa cuando
                hay que callarse o colgar. */}
            <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-zinc-800 px-2 py-2.5 sm:gap-3 sm:py-3">
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
                <Mando
                    encendido={Boolean(malla.yo?.manoLevantada)}
                    onClick={() => void alternarLaMano()}
                    rotuloEncendido="Bajar la mano"
                    rotuloApagado="Levantar la mano"
                    Icono={Hand}
                    IconoApagado={Hand}
                    alReves
                    color="ambar"
                />
                <ElFondo
                    modo={medios.fondo}
                    preparando={medios.preparandoElFondo}
                    // Sin cámara no hay fondo que poner, y un menú que no puede
                    // hacer nada se lee como que la App está rota. Se dice por
                    // qué en el `title`.
                    sinCamara={!medios.camaraEncendida}
                    onElegir={(f) => void cambiarFondo(f)}
                />
                <Button
                    size="icon"
                    variant="destructive"
                    className="h-10 w-10 shrink-0 rounded-full sm:h-12 sm:w-12"
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
                    lleno ? `La reunión está llena (${TOPE_DE_LA_SALA} personas)` : "Dejar entrar"
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

/** Un mando pequeño de la cabecera: vista, panel, enlace y tamaño. */
function MandoDeCabecera({
    activo,
    onClick,
    rotulo,
    Icono,
    apagado = false,
}: {
    activo: boolean;
    onClick: () => void;
    rotulo: string;
    Icono: typeof LayoutGrid;
    apagado?: boolean;
}) {
    return (
        <Button
            variant="ghost"
            size="icon"
            className={cn(
                "h-8 w-8 shrink-0",
                activo
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
            )}
            onClick={onClick}
            disabled={apagado}
            aria-pressed={activo}
            aria-label={rotulo}
            title={rotulo}
        >
            <Icono className="h-4 w-4" />
        </Button>
    );
}

/**
 * El menú del fondo.
 *
 * Un menú y no un interruptor porque son **tres** estados y no dos: sin fondo,
 * desenfocado y sustituido. Con dos botones sueltos ocuparían el sitio de dos
 * mandos en una fila que en un móvil ya va justa.
 */
function ElFondo({
    modo,
    preparando,
    sinCamara,
    onElegir,
}: {
    modo: ModoDeFondo;
    preparando: boolean;
    sinCamara: boolean;
    onElegir: (f: ModoDeFondo) => void;
}) {
    const encendido = modo !== "ninguno";
    const rotulo = sinCamara
        ? "Enciende la cámara para cambiar el fondo"
        : encendido
          ? "Quitar el fondo"
          : "Desenfocar o cambiar el fondo";
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                        "h-10 w-10 shrink-0 rounded-full sm:h-12 sm:w-12",
                        encendido
                            ? "bg-sky-600 text-white hover:bg-sky-700"
                            : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
                    )}
                    disabled={preparando}
                    aria-pressed={encendido}
                    aria-label={rotulo}
                    title={rotulo}
                >
                    {preparando ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <Sparkles className="h-5 w-5" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="w-56">
                <DropdownMenuItem onClick={() => onElegir("ninguno")}>
                    Sin fondo
                    {modo === "ninguno" ? <span className="ml-auto text-xs">✓</span> : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onElegir("desenfoque")} disabled={sinCamara}>
                    Desenfocar el fondo
                    {modo === "desenfoque" ? <span className="ml-auto text-xs">✓</span> : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onElegir("fondo")} disabled={sinCamara}>
                    Fondo liso
                    {modo === "fondo" ? <span className="ml-auto text-xs">✓</span> : null}
                </DropdownMenuItem>
                {sinCamara ? (
                    <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                        Enciende la cámara para poder cambiar el fondo.
                    </p>
                ) : (
                    <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                        La primera vez tarda unos segundos: se descarga el modelo que
                        te separa del fondo.
                    </p>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
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
    color = "azul",
}: {
    encendido: boolean;
    onClick: () => void;
    rotuloEncendido: string;
    rotuloApagado: string;
    Icono: typeof Mic;
    IconoApagado: typeof MicOff;
    ocupado?: boolean;
    alReves?: boolean;
    color?: "azul" | "ambar";
}) {
    const rotulo = encendido ? rotuloEncendido : rotuloApagado;
    const Pintar = encendido ? Icono : IconoApagado;
    return (
        <Button
            size="icon"
            variant="ghost"
            className={cn(
                // Más pequeños en un móvil: seis mandos de 48 px no caben en
                // 390 px de ancho, y el que se cae por el borde es el de colgar.
                "h-10 w-10 shrink-0 rounded-full sm:h-12 sm:w-12",
                alReves
                    ? encendido
                        ? color === "ambar"
                            ? "bg-amber-500 text-zinc-900 hover:bg-amber-600"
                            : "bg-sky-600 text-white hover:bg-sky-700"
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
