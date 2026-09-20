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
    PanelRightClose,
    PanelRightOpen,
    PhoneOff,
    Circle,
    Square,
    WifiOff,
    ScreenShare,
    Sparkles,
    TriangleAlert,
    Upload,
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
    LLAVE_DE_LA_TIRA,
    LLAVE_DEL_PANEL,
    TOPE_DE_LA_SALA,
    comoSeGuardaElPanel,
    comoSeGuardaLaTira,
    elPanelDeEntrada,
    esUnaDistribucion,
    hayQueObedecerElSilencio,
    laDistribucionQueSeVe,
    laTiraDeEntrada,
    type Distribucion,
    type PestanaDelPanel,
} from "@/lib/sala-de-video";
import {
    FONDOS_POR_DEFECTO,
    LLAVE_DEL_FONDO,
    LLAVE_DEL_FONDO_ID,
    cargarImagenDeFondo,
    esUnModoDeFondo,
    fondoPresetPorId,
    swatchDeFondo,
    type FondoElegido,
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
import { useMandosQueSeEsconden } from "@/hooks/useMandosQueSeEsconden";
import { useGrabacionDeLaReunion } from "@/hooks/useGrabacionDeLaReunion";
import { bytesPorHora, comoSeLeenLosBytes } from "@/lib/grabacion-de-reunion";
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
    /**
     * Un fallo de la reunión se enseña DENTRO del overlay, no solo en un toast.
     *
     * El `toast` de `sonner` se monta en el layout, a nivel de `body`. En
     * pantalla completa el navegador solo pinta el nodo a pantalla completa y
     * sus descendientes, así que ese toast **no se ve** — que es justo por lo
     * que un fallo del fondo se leía como «el botón no hace nada, sin error».
     * La franja de avisos sí es descendiente del nodo a pantalla completa, así
     * que un aviso puesto ahí se ve siempre. Se mantiene el toast además, que
     * fuera de pantalla completa está bien.
     */
    const [avisoDeError, setAvisoDeError] = useState<string | null>(null);
    const relojDelAviso = useRef<number | null>(null);
    const avisar = useCallback((m: string) => {
        setAvisoDeError(m);
        toast.error(m);
        if (relojDelAviso.current !== null) window.clearTimeout(relojDelAviso.current);
        // Un error es transitorio —al revés que el de grabación o el de
        // reconexión, que duran—: se puede quitar solo pasados unos segundos, y
        // también a mano.
        relojDelAviso.current = window.setTimeout(() => setAvisoDeError(null), 8000);
    }, []);
    const medios = useMediosDeLlamada({ alFallar: avisar });
    const [arrancando, setArrancando] = useState(true);
    const [saliendo, setSaliendo] = useState(false);
    const [reentrando, setReentrando] = useState(false);
    /**
     * El id de la grabación en curso, para que el reloj lo lea al preguntar.
     *
     * Una referencia y no el estado, porque la malla se monta antes que la
     * grabación —la grabación necesita los streams que la malla produce— y un
     * valor llegaría siempre un render tarde.
     */
    const grabacionIdRef = useRef<string | null>(null);

    const malla = useMallaDeVideo({
        codigo,
        token,
        medios,
        activo: !arrancando,
        // El id viaja en el latido que ya existe: es lo que refresca la marca
        // de «se está grabando» y, con ella, el aviso de todos los demás.
        grabando: grabacionIdRef,
    });

    const raizRef = useRef<HTMLDivElement | null>(null);
    const minimizada = ventana === "pastilla";

    /**
     * La cabecera y los mandos **flotan encima del video y se apartan solos**.
     *
     * El video ocupa toda la caja: ninguna de las dos barras tiene franja
     * propia, así que esconderlas no deja hueco ni mueve nada —lo que hay
     * debajo ya estaba pintado—. Vuelven con cualquier señal de la persona:
     * mover el ratón, tocar la pantalla, una tecla.
     *
     * Plegada a una pastilla no hay mandos que esconder, así que ahí ni se
     * engancha ningún oyente ni corre ningún temporizador.
     */
    const mandos = useMandosQueSeEsconden({ activo: !minimizada });

    // ── Lo que se recuerda entre reuniones ──────────────────────────────────
    //
    // En `localStorage` y no en la base, como el tamaño de la ventana: son
    // preferencias de este navegador y una escritura por cada vez que alguien
    // cambia de vista sería una petición por gesto para devolver algo que no
    // importa si se pierde. Todo en `try`: en una ventana privada leerlo puede
    // lanzar, y sin eso la sala entera se cae justo donde más se mira la
    // privacidad.
    const [distribucion, setDistribucion] = useState<Distribucion>(DISTRIBUCION_POR_DEFECTO);
    const [panel, setPanel] = useState<PestanaDelPanel | null>(null);
    const [pestanaDelPanel, setPestanaDelPanel] = useState<PestanaDelPanel>("chat");
    // La tira de miniaturas de la vista de orador, plegada o no. Por defecto
    // NO —esconder las caras de la gente por defecto sería empezar la reunión
    // ocultando a todos—, y se recuerda como el panel (#837).
    const [tiraPlegada, setTiraPlegada] = useState(false);

    useEffect(() => {
        try {
            const d = window.localStorage.getItem(LLAVE_DE_LA_DISTRIBUCION);
            if (esUnaDistribucion(d)) setDistribucion(d);
        } catch {
            // Sin `localStorage` se usa lo de por defecto, que es lo correcto.
        }
        try {
            setTiraPlegada(laTiraDeEntrada(window.localStorage.getItem(LLAVE_DE_LA_TIRA)));
        } catch {
            // Sin recuerdo, abierta: no se esconde a nadie por defecto.
        }
        try {
            // Si quedó plegado, se abre plegado. Es lo que se pidió: el panel
            // le quita al video un cuarto del ancho, así que quien lo plegó lo
            // plegó por algo y no tiene por qué volver a hacerlo cada vez.
            const p = elPanelDeEntrada(window.localStorage.getItem(LLAVE_DEL_PANEL));
            if (p) {
                setPanel(p);
                setPestanaDelPanel(p);
            }
        } catch {
            // Igual: sin recuerdo, plegado, que es lo de por defecto.
        }
    }, []);

    /**
     * Abrir, plegar y cambiar de pestaña, **por un solo sitio**.
     *
     * Con la escritura en cada manejador, al tercero se le olvida y entonces el
     * panel se recuerda unas veces sí y otras no — que no se lee como un fallo,
     * se lee como que la App decide sola.
     */
    const cambiarElPanel = useCallback((p: PestanaDelPanel | null) => {
        setPanel(p);
        if (p) setPestanaDelPanel(p);
        try {
            window.localStorage.setItem(LLAVE_DEL_PANEL, comoSeGuardaElPanel(p));
        } catch {
            // Que no se recuerde no puede impedir que se pliegue ahora.
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

    /** Plegar o desplegar la tira, por un solo sitio, como el panel. */
    const cambiarLaTira = useCallback((plegada: boolean) => {
        setTiraPlegada(plegada);
        try {
            window.localStorage.setItem(LLAVE_DE_LA_TIRA, comoSeGuardaLaTira(plegada));
        } catch {
            // Que no se recuerde no puede impedir que se pliegue ahora.
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
            if (!esUnModoDeFondo(f) || f === "ninguno") return;
            if (f === "desenfoque") {
                void medios.cambiarElFondo("desenfoque");
                return;
            }
            // Un fondo de serie se restaura por su id. Una imagen subida no se
            // guarda —no cabe en `localStorage`—, así que si lo último fue una
            // imagen el id sale vacío y se cae al primer preset: la sesión es
            // otra y su imagen ya no está.
            const id = window.localStorage.getItem(LLAVE_DEL_FONDO_ID) || undefined;
            void medios.cambiarElFondo("fondo", { tipo: "preset", id: fondoPresetPorId(id).id });
        } catch {
            // Igual que arriba.
        }
        // `medios` cambia de identidad en cada repintado; lo que dispara esto
        // es que la cámara pase a estar encendida.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [medios.camaraEncendida]);

    /** Recordar entre reuniones qué fondo estaba puesto (los presets; ver arriba). */
    const recordarFondo = useCallback((modo: ModoDeFondo, id?: string) => {
        try {
            window.localStorage.setItem(LLAVE_DEL_FONDO, modo);
            if (modo === "fondo") window.localStorage.setItem(LLAVE_DEL_FONDO_ID, id ?? "");
        } catch {
            // Que no se recuerde no impide ponerlo ahora.
        }
    }, []);

    /** Sin fondo o desenfoque. */
    const elegirModoDeFondo = useCallback(
        async (modo: ModoDeFondo) => {
            await medios.cambiarElFondo(modo);
            recordarFondo(modo);
        },
        [medios, recordarFondo],
    );

    /** Un fondo de serie. */
    const elegirFondoPreset = useCallback(
        async (id: string) => {
            await medios.cambiarElFondo("fondo", { tipo: "preset", id });
            recordarFondo("fondo", id);
        },
        [medios, recordarFondo],
    );

    /**
     * Subir una imagen propia de fondo.
     *
     * Si el archivo no vale, `cargarImagenDeFondo` lanza con un motivo legible
     * y se enseña en el aviso de dentro del overlay — un `<input file>` que no
     * hace nada al elegir un PDF se lee como que la App está rota.
     */
    const subirFondo = useCallback(
        async (file: File) => {
            try {
                const imagen = await cargarImagenDeFondo(file);
                await medios.cambiarElFondo("fondo", {
                    tipo: "imagen",
                    imagen,
                    nombre: file.name,
                });
                // La imagen no se persiste; el modo sí, con el id vacío.
                recordarFondo("fondo", "");
            } catch (error) {
                avisar(error instanceof Error ? error.message : "No se pudo usar la imagen.");
            }
        },
        [medios, recordarFondo, avisar],
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

    /**
     * La grabación.
     *
     * Le llegan **las mismas fuentes** que al detector de voz activa, que es lo
     * que garantiza que lo que se graba sea lo que se está oyendo: con dos
     * listas, alguien podría salir en la sala y no en el fichero, y eso no se
     * ve hasta que alguien escucha la grabación una semana después.
     */
    const grabacion = useGrabacionDeLaReunion({
        codigo,
        fuentes,
        // Aparte de `fuentes` porque el recuadro propio va SIN audio: ver la
        // nota de `miAudio` en `useMediosDeLlamada`.
        miAudio: medios.miAudio,
    });
    grabacionIdRef.current = grabacion.grabacionId;

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
                // **Reconectando es haber estado conectado y haberlo perdido**,
                // y por eso mira el stream: sin él nunca llegó nada y lo que
                // toca decir es «conectando». Con él, esta persona ya se veía y
                // ahora no — que es lo que hay que contar.
                reconectando:
                    Boolean(r.stream) &&
                    (r.estado === "disconnected" || r.estado === "failed"),
                fallo: r.estado === "failed" && !r.stream,
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

    const vistaDeAhora = laDistribucionQueSeVe(distribucion, cuantos);
    const laRejillaDeAhora = (
        <RecuadrosDeLaSala
            gente={gente}
            distribucion={vistaDeAhora}
            enGrande={enGrande}
            tiraPlegada={tiraPlegada}
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
                        {/* Plegada, la pastilla es lo ÚNICO que se ve de la
                            reunión: si se está grabando, o si se está
                            reconectando, tiene que decirlo aquí también. Sin
                            esto, alguien puede plegar la reunión y no enterarse
                            de que le siguen grabando. */}
                        {malla.grabando ? (
                            <span
                                className="relative flex h-2.5 w-2.5 shrink-0"
                                title={`Se está grabando · lo hace ${malla.grabando.por}`}
                                aria-label="Se está grabando esta reunión"
                            >
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                            </span>
                        ) : null}
                        {malla.reconectando ? (
                            <WifiOff
                                className="h-3.5 w-3.5 shrink-0 text-amber-400"
                                aria-label={malla.reconectando.mensaje}
                            />
                        ) : null}
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
            // El foco también devuelve los mandos. `keydown` ya lo cubre —Tab
            // dispara su tecla antes de mover el foco— pero un foco que llega
            // por otro camino (un `focus()` del navegador al volver a la
            // pestaña) no dispararía ninguna tecla, y entonces el foco estaría
            // en un botón que no se ve.
            onFocusCapture={mandos.mostrar}
            className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100"
        >
            {/* ── Los avisos ─────────────────────────────────────────────────
                Estos NO flotan y NO se esconden, y es la mitad que importa de
                esta pantalla. El de grabación ocupa una franja entera en rojo a
                propósito —grabar la voz y la cara de los demás sin que se note
                no es una función, es otra cosa— y uno que se aparta a los tres
                segundos es uno que no se ve. Lo mismo con el de reconexión, que
                es un estado que dura, y con la sala de espera, que lleva
                botones que hay que poder pulsar.

                Un aviso no es una barra de mandos: es raro, dura poco y lo que
                cuesta es 30 px de video mientras pasa algo que hay que mirar. */}

            {/* Un fallo de la reunión —fondo, micro, cámara, pantalla—. Va aquí
                y no solo en un toast porque el toast no se ve a pantalla
                completa (vive fuera del nodo a pantalla completa). Se puede
                cerrar a mano, y se va solo a los ocho segundos. */}
            {avisoDeError ? (
                <button
                    type="button"
                    onClick={() => setAvisoDeError(null)}
                    className="flex w-full shrink-0 items-center gap-2 border-b border-red-500/40 bg-red-500/15 px-3 py-2 text-left text-xs text-red-100 sm:px-4"
                >
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{avisoDeError}</span>
                    <span className="shrink-0 text-red-300/80">Cerrar</span>
                </button>
            ) : null}

            {/* **El aviso de que se está grabando, para TODOS.**

                Lo pinta la pantalla de cada participante a partir de lo que
                dice el servidor — no lo que diga la pestaña de quien graba. */}
            {malla.grabando ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-200 sm:px-4">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                    <span className="min-w-0 truncate font-medium">
                        Se está grabando esta reunión
                    </span>
                    <span className="hidden min-w-0 truncate text-red-300/80 sm:inline">
                        · lo hace {malla.grabando.por}
                    </span>
                </div>
            ) : null}

            {/* Y el de reconexión. Va aquí y no en un `toast` porque no es un
                aviso que se despacha: es un estado que dura, y mientras dura
                hay que poder mirarlo. */}
            {malla.reconectando ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-100 sm:px-4">
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate font-medium">
                        {malla.reconectando.mensaje}
                    </span>
                    <span className="hidden min-w-0 truncate text-amber-200/80 sm:inline">
                        · no cuelgues, se está volviendo sola
                    </span>
                </div>
            ) : null}

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

            {/* ── La caja del video: TODO lo que queda ───────────────────────
                Los recuadros la llenan entera y las dos barras flotan encima,
                así que esconderlas no deja hueco ni mueve la imagen: lo que hay
                debajo ya estaba pintado. El panel es hermano de los recuadros y
                les quita ancho **solo desde `sm`**; en un móvil se superpone,
                porque con la lista al lado no quedaría nada para el video. */}
            <div data-caja-del-video className="relative flex min-h-0 flex-1">
                {laRejillaDeAhora}

                {/* La cabecera: qué reunión es, cuántos hay y los mandos de
                    vista. Flotando, con degradado para que el nombre se lea
                    sobre cualquier imagen. */}
                <div
                    data-cabecera-de-la-sala
                    className={cn(
                        "pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/80 via-black/35 to-transparent px-2 pb-10 pt-2 transition-opacity duration-200 sm:px-3",
                        // Con el panel abierto la cabecera se queda en el
                        // ancho del video: encima del panel taparía sus
                        // pestañas, que están justo ahí arriba.
                        panel ? "hidden sm:flex sm:right-64 md:right-72" : "",
                        mandos.seVen ? "opacity-100" : "opacity-0",
                    )}
                >
                    {/* El asa se lleva SOLO el nombre, no la cabecera entera.
                        Puesta en el contenedor, captura el puntero al agarrarla
                        y los eventos de después se le redirigen: el `click` de
                        los botones no llegaría a salir nunca. Es la misma regla
                        que ya costó una vuelta en la tarjeta de llamada. */}
                    <div
                        {...asa}
                        className={cn(
                            "min-w-0 flex-1 truncate rounded px-1 py-1.5 text-sm font-medium drop-shadow-md",
                            asa?.className ?? "",
                        )}
                    >
                        {nombre}
                    </div>

                    {/* Los botones van en su propio bloque con fondo: sobre un
                        video claro, un icono blanco a pelo no se ve. Y el
                        `pointer-events` va AQUÍ y no en el degradado: el
                        degradado ocupa 50 px de alto de punta a punta, y con él
                        capturando el puntero no se podría pulsar nada de lo que
                        hay debajo en esa franja. */}
                    <div
                        className={cn(
                            "flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900/70 p-0.5 backdrop-blur",
                            mandos.seVen ? "pointer-events-auto" : "pointer-events-none",
                        )}
                        onMouseEnter={() => mandos.fijar("encima", true)}
                        onMouseLeave={() => mandos.fijar("encima", false)}
                    >
                        <span className="hidden shrink-0 items-center gap-1.5 px-1.5 text-xs text-zinc-300 sm:flex">
                            <Users className="h-3.5 w-3.5" />
                            <span className="tabular-nums">
                                {cuantos} de {TOPE_DE_LA_SALA}
                            </span>
                        </span>

                        <MandoDeCabecera
                            activo={
                                laDistribucionQueSeVe(distribucion, cuantos) === "cuadricula"
                            }
                            onClick={() =>
                                cambiarDistribucion(
                                    distribucion === "orador" ? "cuadricula" : "orador",
                                )
                            }
                            rotulo={
                                distribucion === "orador"
                                    ? "Ver a todos en cuadrícula"
                                    : "Ver en grande a quien habla"
                            }
                            Icono={LayoutGrid}
                            // Con una sola persona no hay nada que repartir, así
                            // que el botón no promete un cambio que no va a
                            // pasar.
                            apagado={cuantos <= 1}
                        />
                        {/* Plegar la tira de miniaturas. Solo en la vista de
                            orador, que es la única con tira; en cuadrícula no
                            hay franja que esconder. Al plegarla el orador ocupa
                            todo el ancho, y el estado se recuerda como el
                            panel. */}
                        {vistaDeAhora === "orador" ? (
                            <MandoDeCabecera
                                activo={tiraPlegada}
                                onClick={() => cambiarLaTira(!tiraPlegada)}
                                rotulo={
                                    tiraPlegada
                                        ? "Mostrar a los demás participantes"
                                        : "Ocultar la franja de participantes"
                                }
                                Icono={tiraPlegada ? PanelRightOpen : PanelRightClose}
                            />
                        ) : null}
                        <MandoDeCabecera
                            activo={Boolean(panel)}
                            onClick={() => cambiarElPanel(panel ? null : pestanaDelPanel)}
                            rotulo={panel ? "Plegar el panel" : "Abrir el chat y la gente"}
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

                        {/* Grabar. **Solo sale si el servidor dice que sí**, que
                            son dos cosas a la vez —administrar la sala y que la
                            CUENTA tenga el módulo— y la segunda el navegador no
                            la sabe. Enseñarlo y que la acción conteste que no es
                            el «menú abierto, puerta cerrada» que este
                            repositorio ya pagó. */}
                        {malla.puedoGrabar ? (
                            grabacion.grabando ? (
                                <MandoDeCabecera
                                    activo
                                    onClick={() => void grabacion.terminar()}
                                    rotulo={`Parar la grabación (${comoSeLeeLaDuracion(grabacion.segundos)})`}
                                    Icono={Square}
                                    apagado={grabacion.ocupado}
                                />
                            ) : (
                                // Un menú abierto FIJA los mandos. Sin esto la
                                // barra se aparta a los tres segundos y el menú
                                // se queda flotando solo sobre el video,
                                // anclado a un botón que ya no se ve.
                                <DropdownMenu
                                    onOpenChange={(abierto) => mandos.fijar("menu", abierto)}
                                >
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            disabled={
                                                grabacion.ocupado || Boolean(malla.grabando)
                                            }
                                            title={
                                                malla.grabando
                                                    ? "Ya se está grabando"
                                                    : "Grabar la reunión"
                                            }
                                            aria-label="Grabar la reunión"
                                            className={cn(
                                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-300 transition",
                                                "hover:bg-zinc-800 hover:text-zinc-100",
                                                "disabled:pointer-events-none disabled:opacity-40",
                                            )}
                                        >
                                            {grabacion.ocupado ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Circle className="h-4 w-4" />
                                            )}
                                        </button>
                                    </DropdownMenuTrigger>
                                    {/* Dos opciones y **el peso al lado de cada
                                        una**: una hora de video es casi un giga
                                        del cupo de la cuenta y una de audio son
                                        catorce megas. Elegir sin ese número es
                                        elegir a ciegas algo que se paga en
                                        espacio. */}
                                    <DropdownMenuContent align="end" className="w-64">
                                        <DropdownMenuItem
                                            onSelect={() => void grabacion.empezar("video")}
                                        >
                                            <Video className="mr-2 h-4 w-4" />
                                            <span className="flex-1">Grabar video y audio</span>
                                            <span className="text-xs text-muted-foreground">
                                                ~{comoSeLeenLosBytes(bytesPorHora("video"))}/h
                                            </span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onSelect={() => void grabacion.empezar("audio")}
                                        >
                                            <Mic className="mr-2 h-4 w-4" />
                                            <span className="flex-1">Grabar solo el audio</span>
                                            <span className="text-xs text-muted-foreground">
                                                ~{comoSeLeenLosBytes(bytesPorHora("audio"))}/h
                                            </span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )
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
                </div>

                {/* Los mandos: una pastilla centrada abajo, flotando sobre el
                    video. Centrada y no de punta a punta a propósito: mide unos
                    364 px medidos, así que con una persona —y con la vista de
                    orador, donde el grande ocupa casi todo— el pie del recuadro
                    se sigue leyendo entero. En cuadrícula de cuatro sí tapa el
                    nombre de los de abajo, y eso es justo lo que arregla que se
                    aparten solos: a los tres segundos y medio vuelve a leerse
                    sin que nadie haga nada. */}
                <div
                    data-mandos-de-la-sala
                    className={cn(
                        "pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex justify-center px-2 pb-3 pt-10 sm:pb-4",
                        // En un móvil con el panel abierto el panel ocupa la
                        // pantalla entera: unos mandos encima taparían la caja
                        // de escribir del chat.
                        panel ? "hidden sm:flex sm:right-64 md:right-72" : "",
                    )}
                >
                    <div
                        className={cn(
                            "flex max-w-full items-center gap-1.5 rounded-full border border-zinc-800/80 bg-zinc-900/85 px-2 py-2 shadow-xl backdrop-blur transition-opacity duration-200 sm:gap-2.5 sm:px-3",
                            // Escondidos **no se pueden pulsar**: unos mandos
                            // invisibles que siguen respondiendo al clic son un
                            // botón de colgar que se pulsa sin verlo.
                            mandos.seVen
                                ? "pointer-events-auto opacity-100"
                                : "pointer-events-none opacity-0",
                        )}
                        onMouseEnter={() => mandos.fijar("encima", true)}
                        onMouseLeave={() => mandos.fijar("encima", false)}
                    >
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
                            // Al revés que los otros dos: compartiendo es el
                            // estado «encendido» y se pinta en azul, no en gris
                            // de apagado.
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
                            fondoId={medios.fondoId}
                            preparando={medios.preparandoElFondo}
                            // Sin cámara no hay fondo que poner, y un menú que
                            // no puede hacer nada se lee como que la App está
                            // rota. Se dice por qué en el `title`.
                            sinCamara={!medios.camaraEncendida}
                            onModo={(m) => void elegirModoDeFondo(m)}
                            onPreset={(id) => void elegirFondoPreset(id)}
                            onSubir={(file) => void subirFondo(file)}
                            onMenu={(abierto) => mandos.fijar("menu", abierto)}
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

                {/* El panel va el ÚLTIMO para que en un móvil, donde se
                    superpone, quede por encima de las dos barras: su caja de
                    escribir está justo donde flotan los mandos. */}
                {panel ? (
                    <div
                        data-panel-de-la-sala
                        className="absolute inset-0 z-30 sm:static sm:z-auto sm:w-64 sm:shrink-0 md:w-72"
                    >
                        <PanelDeLaReunion
                            codigo={codigo}
                            token={token}
                            mensajes={malla.mensajes}
                            gente={enElPanel}
                            moderas={Boolean(malla.yo?.moderas)}
                            miId={miId}
                            alCerrar={() => cambiarElPanel(null)}
                            pestana={pestanaDelPanel}
                            onPestana={(p) => cambiarElPanel(p)}
                        />
                    </div>
                ) : null}
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
 * El menú del fondo: sin fondo, desenfoque, los fondos de serie y subir uno.
 *
 * Un menú y no un interruptor porque son varios estados, no dos. Los fondos de
 * serie van como una rejilla de pastillas —cada una con su degradado, del mismo
 * par de colores que se pinta en el lienzo— para elegir de un vistazo, y debajo
 * «Subir imagen». Con dos botones sueltos ocuparían el sitio de dos mandos en
 * una fila que en un móvil ya va justa.
 */
function ElFondo({
    modo,
    fondoId,
    preparando,
    sinCamara,
    onModo,
    onPreset,
    onSubir,
    onMenu,
}: {
    modo: ModoDeFondo;
    /** El preset activo, `"subida"` o `null`, para marcar el elegido. */
    fondoId: string | null;
    preparando: boolean;
    sinCamara: boolean;
    onModo: (f: ModoDeFondo) => void;
    onPreset: (id: string) => void;
    onSubir: (file: File) => void;
    /**
     * Que hay un menú abierto.
     *
     * Los mandos se apartan solos a los pocos segundos; con el menú abierto,
     * apartar la barra dejaría el menú flotando solo sobre el video, anclado a
     * un botón que ya no se ve.
     */
    onMenu?: (abierto: boolean) => void;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const encendido = modo !== "ninguno";
    const rotulo = sinCamara
        ? "Enciende la cámara para cambiar el fondo"
        : encendido
          ? "Quitar el fondo"
          : "Desenfocar o cambiar el fondo";
    return (
        <DropdownMenu onOpenChange={onMenu}>
            {/* El `<input file>` va FUERA del contenido del menú: Radix lo
                desmonta al cerrarse, y si se fuera mientras el diálogo nativo
                del sistema está abierto, su `change` no llegaría. Aquí sigue
                montado pase lo que pase con el menú. */}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Se limpia el valor para poder volver a elegir el MISMO
                    // archivo otra vez si se quiere.
                    e.target.value = "";
                    if (file) onSubir(file);
                }}
            />
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
            <DropdownMenuContent align="center" side="top" className="w-64">
                <DropdownMenuItem onClick={() => onModo("ninguno")}>
                    Sin fondo
                    {modo === "ninguno" ? <span className="ml-auto text-xs">✓</span> : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onModo("desenfoque")} disabled={sinCamara}>
                    Desenfocar el fondo
                    {modo === "desenfoque" ? <span className="ml-auto text-xs">✓</span> : null}
                </DropdownMenuItem>

                {sinCamara ? (
                    <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                        Enciende la cámara para poder cambiar el fondo.
                    </p>
                ) : (
                    <>
                        <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
                            Fondos
                        </p>
                        {/* Las pastillas NO son `DropdownMenuItem`: elegir un
                            fondo no cierra el menú, para poder probar varios
                            seguidos sin volver a abrirlo. */}
                        <div className="grid grid-cols-3 gap-1.5 px-2 pb-1">
                            {FONDOS_POR_DEFECTO.map((p) => {
                                const activo = modo === "fondo" && fondoId === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => onPreset(p.id)}
                                        title={p.nombre}
                                        aria-label={`Fondo ${p.nombre}`}
                                        aria-pressed={activo}
                                        className={cn(
                                            "h-10 rounded-md ring-offset-1 ring-offset-popover transition",
                                            activo
                                                ? "ring-2 ring-sky-500"
                                                : "ring-1 ring-border hover:ring-sky-400",
                                        )}
                                        style={{ backgroundImage: swatchDeFondo(p) }}
                                    />
                                );
                            })}
                        </div>
                        <DropdownMenuItem
                            onSelect={(e) => {
                                // Que el menú no se cierre por el clic: se abre
                                // el selector de archivo, y cerrar el menú lo
                                // cancelaría en algunos navegadores.
                                e.preventDefault();
                                inputRef.current?.click();
                            }}
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            Subir imagen…
                            {modo === "fondo" && fondoId === "subida" ? (
                                <span className="ml-auto text-xs">✓</span>
                            ) : null}
                        </DropdownMenuItem>
                        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                            La primera vez tarda unos segundos: se descarga el modelo que
                            te separa del fondo.
                        </p>
                    </>
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
