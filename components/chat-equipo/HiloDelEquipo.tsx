"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Building2,
    ExternalLink,
    Hash,
    Loader2,
    Lock,
    MessagesSquare,
    Mic,
    MicOff,
    Pencil,
    Phone,
    PhoneOff,
    Plus,
    Search,
    Send,
    Square,
    Trash2,
    Type,
    X,
    Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    CADA_CUANTO_MS,
    TOPE_DEL_MENSAJE,
    aQuienSeOfrece,
    comoSeLlama,
    laArrobaQueSeEscribe,
    ponerLaMencion,
    type ArrobaEnCurso,
    type MensajeDeEquipo,
    type PersonaMencionable,
} from "@/lib/chat-de-equipo";
import {
    CANAL_GENERAL,
    TOPE_DEL_NOMBRE,
    type CanalDeEquipo,
} from "@/lib/canales-de-equipo";
import {
    aDondeLlevaElChat,
    elNumeroQueSeEnsena,
    type ChatCompartido,
} from "@/lib/chat-compartido";
import {
    MINIMO_PARA_BUSCAR,
    type ResultadoDeBusqueda,
} from "@/lib/busqueda-del-equipo";
import {
    abrirDirectoAction,
    buscarEnElEquipoAction,
    crearCanalAction,
    enviarAlEquipoAction,
    hiloDelEquipoAction,
    ponerMiembrosAction,
    renombrarCanalAction,
    transcribirNotaDelEquipoAction,
    type HiloAbierto,
} from "@/actions/chat-de-equipo-actions";
// Las DOS funciones de voz salen de donde ya estaban en Chats, no de una copia:
// el dictado es `useSpeechDictation` y la grabación `useAudioRecording`, que se
// mudó a `hooks/` justo por esto. Con una copia aquí, el día que se afine el
// formato o el temporizador se afina en una pantalla y la otra se queda atrás.
import { useAudioRecording } from "@/hooks/useAudioRecording";
import { useSpeechDictation } from "@/hooks/useSpeechDictation";
import {
    comoArchivoDeAudio,
    type RecordedAudioData,
} from "@/lib/audio-del-navegador";
import {
    comoSeLeeElCosto,
    comoSeLeeLaDuracion,
} from "@/lib/nota-de-voz-del-equipo";
import { TOPE_DE_SEGUNDOS, costoDeLaNota } from "@/lib/transcripcion-de-voz";
import { avisarDeQueSeLeyo, avisarDelCanalAbierto } from "@/hooks/useSinLeerDelEquipo";

/**
 * El chat del equipo: los canales y el hilo abierto.
 *
 * Lo pintan **los dos sitios**: el panel lateral —que es por donde se usa— y
 * la ruta `/chat-equipo`, para quien la quiera montar como módulo. Con dos
 * copias, el día que se afine algo se afina en una y la otra se queda atrás, y
 * eso no se ve como un error sino como «a veces funciona».
 *
 * # Y aquí se carga TODO
 *
 * El panel no precarga nada y le pasa datos: carga esto, cuando `activo` se
 * pone en `true`. Con la carga en los dos lados habría dos formas de llegar al
 * mismo estado y una acabaría desincronizada al cambiar de canal.
 *
 * # El reloj responde
 *
 * Un `setInterval` montado **una sola vez** que lee todo por referencia. No se
 * vuelve a una cadena de `setTimeout`: si una vuelta no llega a programar la
 * siguiente, el ciclo muere en silencio y el hilo se congela hasta recargar —
 * es la primera regla de Chats de este proyecto, y aquí no hay tiempo real que
 * lo tape.
 *
 * Con la pestaña de fondo no se pregunta —nadie está mirando— y al volver a
 * ella se pregunta de inmediato. Y el `catch` **escribe**: un refresco que
 * falla en silencio no se nota como un error, se nota como un chat que no trae
 * los mensajes de los demás.
 */
export function HiloDelEquipo({
    activo = true,
    canalInicial,
    mensajeInicial,
}: {
    /**
     * Si el reloj tiene que correr y si hay que cargar.
     *
     * En la ruta siempre; en el panel, solo con el panel abierto. Esto cuelga
     * del layout, o sea de TODAS las pantallas: un sondeo corriendo con el
     * panel cerrado sería una consulta cada cinco segundos por pestaña para
     * algo que nadie está mirando.
     */
    activo?: boolean;
    /** El canal con el que abrir, si se llega desde un aviso de mención. */
    canalInicial?: string;
    /**
     * El mensaje al que ir, si se llega desde un aviso de mención.
     *
     * En un canal con tráfico, aterrizar al final del hilo no es encontrar la
     * mención: hay que ponerla delante.
     */
    mensajeInicial?: string;
}) {
    const [datos, setDatos] = useState<HiloAbierto | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [canalId, setCanalId] = useState<string>(canalInicial || CANAL_GENERAL);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [listaAbierta, setListaAbierta] = useState(false);
    // La arroba que se está escribiendo ahora mismo, si es que hay una.
    const [arroba, setArroba] = useState<ArrobaEnCurso | null>(null);
    const [elegido, setElegido] = useState(0);
    // Dónde se pulsó Escape. Cerrar el selector no puede ser una marca suelta:
    // la arroba sigue ahí y el siguiente carácter volvería a abrirlo. Se guarda
    // la POSICIÓN de la que uno se quiso deshacer, y solo esa queda callada.
    const [cerradaEn, setCerradaEn] = useState<number | null>(null);
    // El mensaje que se está citando, mientras se escribe la respuesta. Vive
    // en el FORMULARIO y no dentro del hilo: es parte de lo que se va a enviar,
    // igual que el texto, así que se manda con él y se limpia al enviar.
    const [citando, setCitando] = useState<MensajeDeEquipo | null>(null);

    // Las DOS funciones de voz, tal cual salen de Chats. El dictado escribe en
    // la misma caja; la grabación deja la nota lista para enviar.
    const dictado = useSpeechDictation();
    const {
        isRecording: grabando,
        recordSecs: segundosGrabados,
        recordedAudio: grabada,
        startRecording: empezarAGrabar,
        stopRecordingAndPreview: terminarDeGrabar,
        cancelRecording: cancelarGrabacion,
        clearRecordedAudio: limpiarGrabacion,
    } = useAudioRecording(enviando);
    const [busqueda, setBusqueda] = useState("");
    const [soloEsteCanal, setSoloEsteCanal] = useState(true);
    const [resultados, setResultados] = useState<ResultadoDeBusqueda[] | null>(null);
    const [buscando, setBuscando] = useState(false);
    // A qué mensaje hay que llegar. Arranca con el del aviso, si lo hay, y
    // cambia al pulsar un resultado o una cita.
    const [aPorEste, setAPorEste] = useState<string | null>(mensajeInicial ?? null);

    const cajaDeEscribir = useRef<HTMLTextAreaElement | null>(null);
    const abajoDelTodo = useRef<HTMLDivElement | null>(null);
    // El último mensaje que ya se dio por leído. Sirve para no avisar al
    // contador en cada vuelta del reloj: solo cuando de verdad se marcó algo
    // nuevo. Sin esto, el contador —que va a 15 s— pasaría a preguntar cada 5.
    const yaMarcado = useRef<string | null>(null);
    // El ciclo lee el canal por referencia: si entrara en las dependencias,
    // cambiar de canal remontaría el `setInterval` y perdería su cadencia.
    const canalRef = useRef(canalId);
    canalRef.current = canalId;

    // Qué canal se tiene DELANTE, para que no suene con él.
    //
    // Solo con el hilo activo: con el panel cerrado no hay ningún canal
    // delante, y dejar el último puesto silenciaría justo ese para siempre.
    // Y al desmontar se limpia, o pasa lo mismo.
    //
    // La otra mitad de «delante» —si la pestaña está a la vista— la pone quien
    // pregunta: aquí no se sabe, y con la pestaña de fondo el canal sigue
    // abierto en la pantalla sin que lo mire nadie.
    useEffect(() => {
        avisarDelCanalAbierto(activo ? canalId : null);
        return () => avisarDelCanalAbierto(null);
    }, [activo, canalId]);

    // A qué mensaje ir, por referencia: el ciclo se monta una vez y esto
    // cambia al pulsar un resultado.
    const aPorEsteRef = useRef<string | null>(mensajeInicial ?? null);
    aPorEsteRef.current = aPorEste;

    const traer = useCallback(async (cual?: string, mensaje?: string | null) => {
        const pedido = cual ?? canalRef.current;
        // El mensaje solo se pide cuando se viene A POR ÉL. En las vueltas del
        // reloj no: el hilo se traería centrado en un mensaje viejo para
        // siempre y no se vería entrar nada nuevo.
        const res = await hiloDelEquipoAction(pedido, mensaje ?? undefined);
        if (!res.success) return res.message;
        // Una vuelta del reloj que salió con el canal anterior NO puede pintar
        // encima del que se acaba de abrir: llega tarde, con los mensajes de
        // otra conversación, y desde fuera se ve como un canal que se cambia
        // solo a los pocos segundos.
        if (pedido !== canalRef.current) return null;
        setDatos(res.data);

        // El servidor acaba de marcar este canal como leído hasta su último
        // mensaje. El contador del botón vive en otro sitio y con otro reloj,
        // así que se le avisa — si no, el número se quedaría puesto hasta
        // quince segundos después de haberlo leído, que se ve como roto.
        const ultimo = res.data.mensajes[res.data.mensajes.length - 1];
        const marca = `${res.data.canalId}::${ultimo?.id ?? ""}`;
        if (yaMarcado.current !== marca) {
            yaMarcado.current = marca;
            avisarDeQueSeLeyo();
        }
        // El servidor manda: si el canal pedido no existe para esta persona,
        // devuelve el general y la pantalla se pone donde de verdad está.
        setCanalId(res.data.canalId);
        canalRef.current = res.data.canalId;
        return null;
    }, []);

    // ── La primera carga ────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo || datos) return;
        let vivo = true;
        void (async () => {
            try {
                const malo = await traer(canalInicial || CANAL_GENERAL, aPorEsteRef.current);
                if (vivo && malo) setFallo(malo);
            } catch (error) {
                // Un panel que se abre vacío y no dice por qué se lee como que
                // el chat no funciona.
                console.warn("[chat-equipo] no se pudo abrir el panel", error);
                if (vivo) setFallo("No se pudo cargar el chat del equipo.");
            }
        })();
        return () => {
            vivo = false;
        };
    }, [activo, datos, traer, canalInicial]);

    /**
     * Ir a un mensaje: el de un resultado de búsqueda o el de una cita.
     *
     * Si ya está en pantalla se salta y ya —no hace falta ir al servidor—. Si
     * no, se pide el hilo **alrededor** de él: un mensaje de hace tres meses no
     * está entre los últimos que se traen, y sin esto pulsarlo aterrizaba al
     * final del hilo sin decir nada.
     */
    const irAlMensaje = useCallback(
        async (id: string, canalDelMensaje?: string) => {
            setResultados(null);
            setAPorEste(id);
            aPorEsteRef.current = id;
            buscado.current = false;

            const nodo = document.getElementById(`mensaje-${id}`);
            const mismoCanal = !canalDelMensaje || canalDelMensaje === canalRef.current;
            if (nodo && mismoCanal) {
                nodo.scrollIntoView({ block: "center" });
                buscado.current = true;
                return;
            }
            try {
                const malo = await traer(canalDelMensaje ?? canalRef.current, id);
                if (malo) toast.error(malo);
            } catch (error) {
                // Un resultado que se pulsa y no hace nada se lee como que la
                // búsqueda está rota.
                console.warn("[chat-equipo] no se pudo ir al mensaje", error);
                toast.error("No se pudo abrir ese mensaje.");
            }
        },
        [traer],
    );

    /**
     * Buscar.
     *
     * Se dispara **al enviar el formulario**, no en cada tecla: una consulta por
     * carácter son diez consultas para escribir «facturas», y aquí no hay nada
     * que se gane con ver resultados a medio escribir. El servidor decide qué
     * se puede leer, así que la lista nunca trae lo que la persona no vería.
     */
    const buscar = useCallback(async () => {
        const loQueSeBusca = busqueda.trim();
        if (loQueSeBusca.length < MINIMO_PARA_BUSCAR) {
            setResultados(null);
            return;
        }
        setBuscando(true);
        try {
            const res = await buscarEnElEquipoAction(
                loQueSeBusca,
                soloEsteCanal ? canalRef.current : null,
            );
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setResultados(res.data.resultados);
        } catch (error) {
            // Un buscador que falla en silencio se lee como «no hay
            // resultados», que es peor: parece que el mensaje no existe.
            console.warn("[chat-equipo] no se pudo buscar", error);
            toast.error("No se pudo buscar. Inténtalo de nuevo.");
        } finally {
            setBuscando(false);
        }
    }, [busqueda, soloEsteCanal]);

    // ── El reloj ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo) return;
        let vivo = true;

        const vuelta = async () => {
            if (document.visibilityState === "hidden") return;
            try {
                const malo = await traer();
                if (vivo && malo) {
                    console.warn("[chat-equipo] el refresco no trajo nada", malo);
                }
            } catch (error) {
                console.warn("[chat-equipo] falló una vuelta del refresco", error);
            }
        };

        const id = setInterval(vuelta, CADA_CUANTO_MS);
        const alVolver = () => {
            if (document.visibilityState === "visible") void vuelta();
        };
        document.addEventListener("visibilitychange", alVolver);

        return () => {
            vivo = false;
            clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [activo, traer]);

    // Pegado abajo: un chat se lee por el final.
    //
    // Salvo cuando se llega desde un aviso de mención: entonces manda el
    // mensaje, y solo la PRIMERA vez —`buscado`—. Si no, cada vuelta del reloj
    // devolvería la vista a la mención y no se podría seguir leyendo.
    const buscado = useRef(false);
    useEffect(() => {
        if (aPorEste && !buscado.current && datos?.mensajes.length) {
            const nodo = document.getElementById(`mensaje-${aPorEste}`);
            if (nodo) {
                buscado.current = true;
                nodo.scrollIntoView({ block: "center" });
                return;
            }
            // Si no está —quedó fuera de los últimos que se traen— se sigue
            // como siempre: al final. Mejor el hilo que una pantalla quieta.
        }
        abajoDelTodo.current?.scrollIntoView({ block: "end" });
    }, [datos?.mensajes.length, canalId, aPorEste]);

    const canal = useMemo(
        () => datos?.canales.find((c) => c.id === canalId) ?? datos?.canales[0] ?? null,
        [datos, canalId],
    );

    const cambiarDeCanal = useCallback(
        async (cual: string) => {
            setListaAbierta(false);
            setCanalId(cual);
            // La referencia se mueve YA, no en el render siguiente: es contra
            // ella contra la que el reloj comprueba si su vuelta sigue valiendo.
            canalRef.current = cual;
            setTexto("");
            try {
                const malo = await traer(cual);
                if (malo) toast.error(malo);
            } catch (error) {
                console.warn("[chat-equipo] no se pudo cambiar de canal", error);
                toast.error("No se pudo abrir ese canal.");
            }
        },
        [traer],
    );

    /**
     * Enviar: texto, una nota de voz, o las dos cosas.
     *
     * La nota **se sube antes** y lo que viaja en la acción es su dirección.
     * Mandarla en base64 dentro del mensaje la metería en la fila, y esa fila
     * la trae el reloj con la página entera **cada cinco segundos**: un opus de
     * un minuto son ~60 kB que viajarían una y otra vez para no volver a
     * mirarse nunca.
     */
    const enviar = useCallback(async (grabada?: RecordedAudioData | null) => {
        const limpio = texto.trim();
        // Una nota de voz ES el mensaje: con ella, el texto sobra.
        if ((!limpio && !grabada) || enviando) return;
        setEnviando(true);
        try {
            let audio: { url: string; segundos: number; mime: string } | undefined;
            if (grabada) {
                const subida = await subirLaNota(grabada, datos?.yo ?? null);
                if (!subida) {
                    // Sin dirección no hay nota, y publicar el mensaje sin ella
                    // se leería como que el botón no hizo nada.
                    toast.error("No se pudo subir la nota de voz.");
                    return;
                }
                audio = {
                    url: subida,
                    segundos: grabada.durationSecs,
                    mime: grabada.mimetype,
                };
            }
            const res = await enviarAlEquipoAction(
                limpio,
                canalId,
                undefined,
                citando?.id ?? null,
                audio,
            );
            if (!res.success) {
                // Un botón que no dice por qué no hizo nada es un botón que se
                // pulsa cinco veces.
                toast.error(res.message);
                return;
            }
            setTexto("");
            setArroba(null);
            // La cita se limpia al enviar, como el texto: es parte de lo que se
            // acaba de mandar. Dejándola puesta, la respuesta siguiente saldría
            // citando lo mismo sin que nadie lo pidiera.
            setCitando(null);
            limpiarGrabacion();
            // Se pinta al momento y el reloj lo confirma en su vuelta: el
            // servidor manda, pero escribir no puede sentirse lento.
            setDatos((antes) =>
                !antes || res.data.canalId !== antes.canalId
                    ? antes
                    : antes.mensajes.some((m) => m.id === res.data.mensaje.id)
                      ? antes
                      : { ...antes, mensajes: [...antes.mensajes, res.data.mensaje] },
            );
        } catch (error) {
            console.error("[chat-equipo] el envío reventó", error);
            toast.error("No se pudo enviar. Inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    }, [texto, enviando, canalId, citando, datos?.yo, limpiarGrabacion]);

    /**
     * Pintar la transcripción recién pagada, sin esperar al reloj.
     *
     * El reloj la traería en su vuelta —ya está guardada en la fila—, pero eso
     * son hasta cinco segundos de un botón que se pulsó y no cambió nada. Y
     * pintarla aquí no puede desincronizar nada: es exactamente lo que el
     * servidor acaba de guardar.
     */
    const pintarLaTranscripcion = useCallback((id: string, texto: string) => {
        setDatos((antes) =>
            !antes
                ? antes
                : {
                      ...antes,
                      mensajes: antes.mensajes.map((m) =>
                          m.id === id ? { ...m, transcripcion: texto } : m,
                      ),
                  },
        );
    }, []);

    /**
     * A quién se le está ofreciendo ahora mismo.
     *
     * Sale de `datos.equipo` —la gente de ESTE canal—, no de la de la cuenta:
     * en un canal de tres, ofrecer a alguien de fuera es ofrecer una mención
     * que el servidor luego no reconoce. Es la misma lista con la que
     * `extraerMenciones` decide al leer.
     */
    const ofrecidos = useMemo(() => {
        if (!arroba || arroba.desde === cerradaEn) return [];
        return aQuienSeOfrece(datos?.equipo ?? [], arroba.buscado);
    }, [arroba, cerradaEn, datos?.equipo]);

    /**
     * Mirar si se está escribiendo una arroba, en cada tecleo y en cada
     * movimiento del cursor.
     *
     * También al mover el cursor y no solo al escribir: quien vuelve con las
     * flechas al `@` de arriba está editando esa mención, y la lista tiene que
     * estar ahí igual que si acabara de teclearla.
     */
    const mirarLaArroba = useCallback((valor: string, cursor: number) => {
        const cual = laArrobaQueSeEscribe(valor, cursor);
        setArroba(cual);
        setElegido(0);
    }, []);

    /**
     * Poner la mención elegida y devolver el cursor a su sitio.
     *
     * El cursor se mueve **después** del pintado, con el valor ya puesto: en un
     * `<textarea>` controlado, colocarlo antes lo deja donde estaba y lo
     * siguiente que se teclee sale en mitad del nombre.
     */
    const meterLaMencion = useCallback(
        (persona: PersonaMencionable) => {
            const caja = cajaDeEscribir.current;
            if (!arroba || !caja) return;
            const puesto = ponerLaMencion(texto, arroba, persona, caja.selectionStart ?? texto.length);
            setTexto(puesto.texto.slice(0, TOPE_DEL_MENSAJE));
            setArroba(null);
            setCerradaEn(null);
            requestAnimationFrame(() => {
                const c = cajaDeEscribir.current;
                if (!c) return;
                c.focus();
                c.setSelectionRange(puesto.cursor, puesto.cursor);
            });
        },
        [arroba, texto],
    );

    /**
     * Las teclas de la caja de escribir.
     *
     * Con el selector abierto **manda el selector**: las flechas mueven, Enter
     * y Tab meten el nombre y Escape lo cierra. Sin él, Enter envía y
     * Mayús+Enter hace salto de línea, como siempre.
     *
     * El orden importa: si Enter enviara primero, elegir a alguien de la lista
     * mandaría el mensaje a medio escribir.
     */
    const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (ofrecidos.length) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setElegido((i) => (i + 1) % ofrecidos.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setElegido((i) => (i - 1 + ofrecidos.length) % ofrecidos.length);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                meterLaMencion(ofrecidos[elegido] ?? ofrecidos[0]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setCerradaEn(arroba?.desde ?? null);
                return;
            }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            // Con una nota grabada pendiente, Enter la manda TAMBIÉN. Sin
            // pasarla aquí se enviaba solo el texto y la grabación se perdía
            // sin decir nada, que es el peor sitio donde perder trabajo.
            void enviar(grabada);
        }
    };

    /**
     * Cómo se llama cada id.
     *
     * Del mapa del servidor, que trae **también las cuentas**: `gente` son solo
     * personas —una cuenta no es alguien con quien conversar— pero una cuenta
     * sí puede firmar un mensaje viejo o ser la otra parte de un directo que ya
     * existía, y sin ella esa burbuja saldría como «Alguien».
     */
    const nombrePorId = useMemo(() => {
        const m = new Map<string, string>();
        for (const [id, nombre] of Object.entries(datos?.nombres ?? {})) m.set(id, nombre);
        for (const p of datos?.gente ?? []) m.set(p.id, comoSeLlama(p));
        return m;
    }, [datos?.gente, datos?.nombres]);

    if (fallo) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {fallo}
            </div>
        );
    }

    if (!datos || !canal) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Cargando…
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <BarraDeCanales
                abierta={listaAbierta}
                onAlternar={() => setListaAbierta((v) => !v)}
                canal={canal}
                datos={datos}
                onElegir={(id) => void cambiarDeCanal(id)}
                onRefrescar={() => void traer()}
            />

            <BarraDeBusqueda
                texto={busqueda}
                onTexto={setBusqueda}
                soloEsteCanal={soloEsteCanal}
                onAlcance={setSoloEsteCanal}
                buscando={buscando}
                resultados={resultados}
                nombreDelCanal={canal.nombre}
                onBuscar={buscar}
                onCerrar={() => {
                    setResultados(null);
                    setBusqueda("");
                }}
                onAbrirResultado={(r) => void irAlMensaje(r.id, r.canalId)}
            />

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 sm:px-6">
                {datos.mensajes.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                        <MessagesSquare className="h-8 w-8 opacity-40" />
                        <p>
                            {canal.tipo === "directo"
                                ? "Aquí habláis los dos."
                                : "Aquí habla la gente de este canal."}
                        </p>
                        <p className="text-xs">
                            Escribe <span className="font-medium">@</span> y el nombre de
                            alguien para avisarle.
                        </p>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-3xl flex-col gap-3">
                        {datos.mensajes.map((m) =>
                            m.llamada ? (
                                <MarcaDeLlamada
                                    key={m.id}
                                    mensaje={m}
                                    mio={m.autorId === datos.yo}
                                />
                            ) : (
                            <Burbuja
                                key={m.id}
                                mensaje={m}
                                mio={m.autorId === datos.yo}
                                meMencionan={m.mencionados.includes(datos.yo)}
                                buscado={m.id === aPorEste}
                                nombrePorId={nombrePorId}
                                onCitar={datos.puedoEscribir ? setCitando : undefined}
                                onSaltar={(id) => void irAlMensaje(id)}
                                // PERTENECER, no poder leer. Un administrador
                                // lee los directos de su cuenta y eso no le
                                // deja gastar créditos en ellos.
                                puedoTranscribir={canal.pertenezco}
                                onTranscrita={pintarLaTranscripcion}
                            />
                            ),
                        )}
                        <div ref={abajoDelTodo} />
                    </div>
                )}
            </div>

            <div className="shrink-0 border-t border-border bg-background px-3 py-3 sm:px-6">
                {/* Lo que se está citando, ENCIMA de la caja y no dentro: es
                    contexto de lo que se va a escribir, y dentro se confundiría
                    con el texto propio. Con su X, porque citar por error y no
                    poder deshacerlo obliga a enviar y corregir después. */}
                {citando ? (
                    <div className="mx-auto mb-2 flex max-w-3xl items-start gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                        <div className="min-w-0 flex-1 border-l-2 border-primary/50 pl-2 text-xs">
                            <div className="font-medium text-foreground/80">
                                {citando.autorNombre?.trim() ||
                                    nombrePorId.get(citando.autorId) ||
                                    "Alguien"}
                            </div>
                            <div className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">
                                {citando.texto}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setCitando(null)}
                            aria-label="Quitar la cita"
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : null}
                {/* La nota ya grabada, ENCIMA de la caja: se escucha antes de
                    mandarla y se puede tirar. Una nota que sale sin haberla
                    podido oír es una que hay que mandar otra vez. */}
                {grabada ? (
                    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                        <audio
                            src={grabada.dataUrlWithPrefix}
                            controls
                            className="h-9 min-w-0 flex-1"
                        />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {comoSeLeeLaDuracion(grabada.durationSecs)}
                        </span>
                        <button
                            type="button"
                            onClick={() => limpiarGrabacion()}
                            disabled={enviando}
                            aria-label="Descartar la nota de voz"
                            title="Descartar"
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : null}
                {/* Mientras se graba, que se vea que se está grabando: un botón
                    que no cambia hasta que vuelve la respuesta es un botón que
                    se pulsa cinco veces. */}
                {grabando ? (
                    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs">
                        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
                        <span className="font-medium tabular-nums">
                            Grabando {comoSeLeeLaDuracion(segundosGrabados)}
                        </span>
                        <button
                            type="button"
                            onClick={() => cancelarGrabacion()}
                            className="ml-auto shrink-0 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Cancelar
                        </button>
                    </div>
                ) : null}
                <div className="relative mx-auto flex max-w-3xl items-end gap-2">
                    {/* La lista va POR ENCIMA de la caja, no debajo: debajo está
                        el borde de la ventana y en un panel lateral no hay sitio
                        para desplegar nada hacia abajo. */}
                    <ListaDeMenciones
                        gente={ofrecidos}
                        elegido={elegido}
                        onElegir={meterLaMencion}
                        onSenalar={setElegido}
                    />
                    <Textarea
                        ref={cajaDeEscribir}
                        value={texto}
                        onChange={(e) => {
                            const valor = e.target.value.slice(0, TOPE_DEL_MENSAJE);
                            setTexto(valor);
                            mirarLaArroba(valor, e.target.selectionStart ?? valor.length);
                        }}
                        onKeyUp={(e) => {
                            // Solo al MOVERSE. Sin esta condición, cada tecla
                            // pasaría dos veces por aquí —una en `onChange` y
                            // otra aquí— y volvería a abrir lo que Escape
                            // acababa de cerrar.
                            if (!e.key.startsWith("Arrow") && e.key !== "Home" && e.key !== "End")
                                return;
                            const c = e.currentTarget;
                            mirarLaArroba(c.value, c.selectionStart ?? c.value.length);
                        }}
                        onClick={(e) => {
                            const c = e.currentTarget;
                            mirarLaArroba(c.value, c.selectionStart ?? c.value.length);
                        }}
                        onBlur={() => setArroba(null)}
                        onKeyDown={alTeclear}
                        rows={1}
                        placeholder="@ para mencionar"
                        className="max-h-40 min-h-[40px] flex-1 resize-y"
                        disabled={enviando || !canal.puedoEscribir}
                    />
                    {/* El DICTADO escribe en esta misma caja. Solo se pinta
                        donde el navegador lo tiene: un botón que al pulsarlo
                        dice «tu navegador no puede» es peor que no tenerlo. */}
                    {dictado.supported && !grabada ? (
                        <Button
                            type="button"
                            variant={dictado.listening ? "default" : "outline"}
                            size="icon"
                            onClick={() => dictado.toggle(texto, setTexto)}
                            disabled={enviando || grabando || !canal.puedoEscribir}
                            aria-pressed={dictado.listening}
                            aria-label={dictado.listening ? "Dejar de dictar" : "Dictar"}
                            title={
                                dictado.listening
                                    ? "Dictando… pulsa para parar"
                                    : "Dictar: lo que digas se escribe aquí"
                            }
                            className="shrink-0"
                        >
                            <Type className="h-4 w-4" />
                        </Button>
                    ) : null}
                    {/* Y la NOTA DE VOZ, que es un mensaje, no texto. */}
                    {!grabada ? (
                        <Button
                            type="button"
                            variant={grabando ? "destructive" : "outline"}
                            size="icon"
                            onClick={() =>
                                grabando ? terminarDeGrabar() : void empezarAGrabar()
                            }
                            disabled={enviando || dictado.listening || !canal.puedoEscribir}
                            aria-pressed={grabando}
                            aria-label={grabando ? "Terminar la nota de voz" : "Grabar una nota de voz"}
                            title={
                                grabando
                                    ? `Grabando ${comoSeLeeLaDuracion(segundosGrabados)} — pulsa para terminar`
                                    : "Grabar una nota de voz"
                            }
                            className="shrink-0"
                        >
                            {grabando ? (
                                <Square className="h-4 w-4" />
                            ) : (
                                <Mic className="h-4 w-4" />
                            )}
                        </Button>
                    ) : null}
                    <Button
                        onClick={() => void enviar(grabada)}
                        disabled={
                            enviando ||
                            grabando ||
                            (!texto.trim() && !grabada) ||
                            !canal.puedoEscribir
                        }
                        className="shrink-0"
                    >
                        {enviando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        <span className="ml-2 hidden sm:inline">Enviar</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * La barra de canales: el que está abierto, y la lista al desplegarla.
 *
 * Es un desplegable y no una columna al lado: el panel mide lo que mide la
 * lista de Chats —288 px en una pantalla normal— y una columna de canales ahí
 * dentro dejaría la conversación en la mitad.
 */
function BarraDeCanales({
    abierta,
    onAlternar,
    canal,
    datos,
    onElegir,
    onRefrescar,
}: {
    abierta: boolean;
    onAlternar: () => void;
    canal: CanalDeEquipo;
    datos: HiloAbierto;
    onElegir: (id: string) => void;
    onRefrescar: () => void;
}) {
    const [creando, setCreando] = useState(false);

    const areas = datos.canales.filter((c) => c.tipo !== "directo");
    const directos = datos.canales.filter((c) => c.tipo === "directo");
    // Con quién se puede abrir un directo: el equipo menos uno mismo y menos
    // aquellos con los que ya hay uno abierto, que ya salen en la lista.
    const yaHablo = new Set(directos.map((d) => d.conQuienId).filter(Boolean));
    const porAbrir = datos.gente.filter((p) => p.id !== datos.yo && !yaHablo.has(p.id));

    return (
        <div className="shrink-0 border-b border-border bg-background">
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={onAlternar}
                    aria-expanded={abierta}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60 sm:px-6"
                >
                    <IconoDeCanal canal={canal} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {canal.nombre}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                        {abierta ? "Cerrar" : "Cambiar"}
                    </span>
                </button>
                {/* Llamar: SOLO en un directo.
                  *
                  * Un canal de varias personas no tiene «el otro», y una
                  * llamada de uno a uno no sabria a quien sonarle. La puerta de
                  * verdad esta en la accion —comprueba que sea un directo y que
                  * quien llama pertenezca—; esto es la fachada. */}
                {canal.tipo === "directo" && (
                    <button
                        type="button"
                        onClick={() =>
                            window.dispatchEvent(
                                new CustomEvent("llamada:salir", {
                                    detail: { canalId: canal.id, conQuien: canal.nombre },
                                }),
                            )
                        }
                        aria-label={`Llamar a ${canal.nombre}`}
                        title={`Llamar a ${canal.nombre}`}
                        className="mr-2 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40"
                    >
                        <Phone className="h-4 w-4" />
                    </button>
                )}
            </div>

            {abierta && (
                <div className="max-h-[min(50vh,320px)] overflow-y-auto border-t border-border px-2 py-2">
                    <Grupo titulo="Canales">
                        {areas.map((c) => (
                            <FilaDeCanal
                                key={c.id}
                                canal={c}
                                activo={c.id === canal.id}
                                mando={datos.mando}
                                gente={datos.gente}
                                cuentasDeLaFamilia={datos.cuentasDeLaFamilia}
                                onElegir={onElegir}
                                onRefrescar={onRefrescar}
                            />
                        ))}
                        {datos.mando &&
                            (creando ? (
                                <FormularioDeCanal
                                    cuentasDeLaFamilia={datos.cuentasDeLaFamilia}
                                    onListo={(id) => {
                                        setCreando(false);
                                        onRefrescar();
                                        if (id) onElegir(id);
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setCreando(true)}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                >
                                    <Plus className="h-3.5 w-3.5 shrink-0" />
                                    <span>Crear canal</span>
                                </button>
                            ))}
                    </Grupo>

                    <Grupo titulo="Directos">
                        {directos.map((c) => (
                            <FilaDeCanal
                                key={c.id}
                                canal={c}
                                activo={c.id === canal.id}
                                mando={datos.mando}
                                gente={datos.gente}
                                cuentasDeLaFamilia={datos.cuentasDeLaFamilia}
                                onElegir={onElegir}
                                onRefrescar={onRefrescar}
                            />
                        ))}
                        {porAbrir.map((p) => (
                            <AbrirDirecto
                                key={p.id}
                                persona={p}
                                onAbierto={(id) => {
                                    onRefrescar();
                                    onElegir(id);
                                }}
                            />
                        ))}
                        {!directos.length && !porAbrir.length && (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                No hay nadie más en esta cuenta.
                            </p>
                        )}
                    </Grupo>
                </div>
            )}
        </div>
    );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="mb-2 last:mb-0">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {titulo}
            </p>
            <div className="flex flex-col">{children}</div>
        </div>
    );
}

function IconoDeCanal({ canal }: { canal: Pick<CanalDeEquipo, "tipo" | "cuentas"> }) {
    // Un canal que cruza cuentas se ve distinto de uno de la casa: quien
    // escribe ahí está hablándole a gente de otra cuenta, y eso conviene
    // saberlo ANTES de escribir, no después.
    const Icono =
        canal.tipo === "directo" ? Users : canal.cuentas.length ? Building2 : Hash;
    return <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function FilaDeCanal({
    canal,
    activo,
    mando,
    gente,
    cuentasDeLaFamilia,
    onElegir,
    onRefrescar,
}: {
    canal: CanalDeEquipo;
    activo: boolean;
    mando: boolean;
    gente: PersonaMencionable[];
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    onElegir: (id: string) => void;
    onRefrescar: () => void;
}) {
    const [editando, setEditando] = useState(false);
    // Solo los canales de área se retocan: el general no es una fila y un
    // directo se llama con la otra persona, no con lo que alguien escriba.
    //
    // Y un canal que CRUZA solo lo retoca su dueña — la lista de cuentas
    // llega vacía para todas las demás, así que el lápiz no se pinta y la
    // acción tampoco lo dejaría pasar.
    const seRetoca =
        mando && canal.tipo === "area" && (!canal.cuentas.length || cuentasDeLaFamilia.length > 0);

    if (editando) {
        return (
            <AjustesDeCanal
                canal={canal}
                gente={gente}
                cuentasDeLaFamilia={cuentasDeLaFamilia}
                onListo={() => {
                    setEditando(false);
                    onRefrescar();
                }}
            />
        );
    }

    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => onElegir(canal.id)}
                className={[
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    activo ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                ].join(" ")}
            >
                <IconoDeCanal canal={canal} />
                <span className="min-w-0 flex-1 truncate">{canal.nombre}</span>
                {/* Un canal que se lee sin pertenecer —lo que ve quien
                    administra— se marca: por qué sale ahí no es evidente. */}
                {!canal.pertenezco && (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
            </button>
            {seRetoca && (
                <button
                    type="button"
                    onClick={() => setEditando(true)}
                    aria-label={`Ajustes de ${canal.nombre}`}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}

function FormularioDeCanal({
    cuentasDeLaFamilia,
    onListo,
}: {
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    onListo: (id: string | null) => void;
}) {
    const [nombre, setNombre] = useState("");
    const [cuentas, setCuentas] = useState<Set<string>>(new Set());
    const [guardando, setGuardando] = useState(false);

    const crear = async () => {
        if (guardando) return;
        setGuardando(true);
        try {
            const res = await crearCanalAction(nombre, [], Array.from(cuentas));
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            onListo(res.data.canalId);
        } catch (error) {
            // Una acción puede REVENTAR, no solo devolver `success: false`, y
            // entonces el «Guardando…» no se apagaría nunca.
            console.warn("[chat-equipo] no se pudo crear el canal", error);
            toast.error("No se pudo crear el canal.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="my-1 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center gap-1">
                <input
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value.slice(0, TOPE_DEL_NOMBRE))}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void crear();
                        if (e.key === "Escape") onListo(null);
                    }}
                    placeholder="ventas, marketing…"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Button size="sm" disabled={guardando || !nombre.trim()} onClick={() => void crear()}>
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Crear"}
                </Button>
            </div>
            <CuentasDelCanal
                cuentasDeLaFamilia={cuentasDeLaFamilia}
                marcadas={cuentas}
                onCambiar={setCuentas}
            />
        </div>
    );
}

/**
 * Qué cuentas vinculadas entran en el canal.
 *
 * **No se pinta si no hay ninguna que ofrecer**: la lista llega vacía para
 * todas las cuentas que no son la madre, así que quien no reparte canales
 * entre cuentas no ve un bloque que no puede usar.
 *
 * Y lo que dice el pie es lo que hace falta saber antes de marcar una casilla:
 * entra la CUENTA entera, no una persona.
 */
function CuentasDelCanal({
    cuentasDeLaFamilia,
    marcadas,
    onCambiar,
}: {
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    marcadas: Set<string>;
    onCambiar: (v: Set<string>) => void;
}) {
    if (!cuentasDeLaFamilia.length) return null;

    return (
        <div className="mt-2 border-t border-border pt-2">
            <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Cuentas vinculadas
            </p>
            <div className="max-h-32 overflow-y-auto">
                {cuentasDeLaFamilia.map((c) => (
                    <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                    >
                        <input
                            type="checkbox"
                            checked={marcadas.has(c.id)}
                            onChange={(e) => {
                                const copia = new Set(marcadas);
                                if (e.target.checked) copia.add(c.id);
                                else copia.delete(c.id);
                                onCambiar(copia);
                            }}
                        />
                        <span className="min-w-0 truncate">{c.nombre}</span>
                    </label>
                ))}
            </div>
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                Entra toda la gente de esas cuentas.
            </p>
        </div>
    );
}

/** Renombrar y decidir quién pertenece, en el mismo sitio. */
function AjustesDeCanal({
    canal,
    gente,
    cuentasDeLaFamilia,
    onListo,
}: {
    canal: CanalDeEquipo;
    gente: PersonaMencionable[];
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    onListo: () => void;
}) {
    const [nombre, setNombre] = useState(canal.nombre);
    const [dentro, setDentro] = useState<Set<string>>(new Set());
    // Las cuentas SÍ vienen en la lista de canales, así que se pueden marcar
    // desde el primer pintado — al contrario que la gente, que se pide aparte.
    const [cuentas, setCuentas] = useState<Set<string>>(new Set(canal.cuentas));
    const [cargado, setCargado] = useState(false);
    const [guardando, setGuardando] = useState(false);

    // Quién está dentro no viaja en la lista de canales —serían los miembros de
    // todos los canales en cada vuelta del reloj—, así que se pide al abrir.
    useEffect(() => {
        let vivo = true;
        void (async () => {
            try {
                const res = await hiloDelEquipoAction(canal.id);
                if (!vivo || !res.success) return;
                setDentro(new Set(res.data.equipo.map((p) => p.id)));
            } catch (error) {
                console.warn("[chat-equipo] no se pudo leer quién está en el canal", error);
            } finally {
                if (vivo) setCargado(true);
            }
        })();
        return () => {
            vivo = false;
        };
    }, [canal.id]);

    const guardar = async () => {
        if (guardando) return;
        setGuardando(true);
        try {
            const [r1, r2] = await Promise.all([
                renombrarCanalAction(canal.id, nombre),
                ponerMiembrosAction(
                    canal.id,
                    Array.from(dentro),
                    // Solo se mandan las cuentas si esta pantalla las puede
                    // ofrecer. Mandando un array vacío desde una cuenta que no
                    // las ve, un canal que cruzaba se quedaría sin ninguna al
                    // guardar solo la gente.
                    cuentasDeLaFamilia.length ? Array.from(cuentas) : undefined,
                ),
            ]);
            if (!r1.success) toast.error(r1.message);
            else if (!r2.success) toast.error(r2.message);
            else onListo();
        } catch (error) {
            console.warn("[chat-equipo] no se pudieron guardar los ajustes", error);
            toast.error("No se pudo guardar.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="my-1 rounded-md border border-border bg-muted/30 p-2">
            <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value.slice(0, TOPE_DEL_NOMBRE))}
                className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="max-h-40 overflow-y-auto">
                {!cargado ? (
                    <p className="px-1 py-1 text-xs text-muted-foreground">Cargando…</p>
                ) : (
                    gente.map((p) => (
                        <label
                            key={p.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                        >
                            <input
                                type="checkbox"
                                checked={dentro.has(p.id)}
                                onChange={(e) =>
                                    setDentro((antes) => {
                                        const copia = new Set(antes);
                                        if (e.target.checked) copia.add(p.id);
                                        else copia.delete(p.id);
                                        return copia;
                                    })
                                }
                            />
                            <span className="min-w-0 truncate">{comoSeLlama(p)}</span>
                        </label>
                    ))
                )}
            </div>
            <CuentasDelCanal
                cuentasDeLaFamilia={cuentasDeLaFamilia}
                marcadas={cuentas}
                onCambiar={setCuentas}
            />
            {/* Cancelar a la izquierda y la acción a la derecha, como el resto
                de la App. */}
            <div className="mt-2 flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={onListo} disabled={guardando}>
                    Cancelar
                </Button>
                <Button size="sm" onClick={() => void guardar()} disabled={guardando || !nombre.trim()}>
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                </Button>
            </div>
        </div>
    );
}

function AbrirDirecto({
    persona,
    onAbierto,
}: {
    persona: PersonaMencionable;
    onAbierto: (canalId: string) => void;
}) {
    const [abriendo, setAbriendo] = useState(false);

    const abrir = async () => {
        if (abriendo) return;
        setAbriendo(true);
        try {
            const res = await abrirDirectoAction(persona.id);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            onAbierto(res.data.canalId);
        } catch (error) {
            console.warn("[chat-equipo] no se pudo abrir el directo", error);
            toast.error("No se pudo abrir la conversación.");
        } finally {
            setAbriendo(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => void abrir()}
            disabled={abriendo}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-60"
        >
            {abriendo ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
                <Plus className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate">{comoSeLlama(persona)}</span>
        </button>
    );
}

/**
 * El selector de menciones: a quién se le está ofreciendo.
 *
 * # Por qué existe
 *
 * Porque la caja de escribir prometía «@ para mencionar» y **no había ninguna
 * lista**. La mención solo funcionaba escribiendo el nombre exacto, de memoria
 * y sin una letra de más — y cuando no casaba, el servidor la trataba como una
 * arroba cualquiera: ni aviso, ni error, ni nada. Un texto de ayuda que promete
 * algo que no existe es peor que no ponerlo.
 *
 * # Y `onMouseDown`, no `onClick`
 *
 * Porque el `onBlur` de la caja cierra la lista, y el `blur` llega **antes**
 * que el `click`: con `onClick` el botón desaparecía justo antes de que su
 * pulsación llegara y elegir con el ratón no hacía nada. Con `onMouseDown` se
 * elige antes de que la caja pierda el foco.
 */
function ListaDeMenciones({
    gente,
    elegido,
    onElegir,
    onSenalar,
}: {
    gente: PersonaMencionable[];
    elegido: number;
    onElegir: (persona: PersonaMencionable) => void;
    onSenalar: (i: number) => void;
}) {
    if (!gente.length) return null;

    return (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <p className="border-b border-border px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Mencionar
            </p>
            {/* Su propio scroll: la lista crece con el equipo, y sin tope un
                canal de treinta personas taparía la conversación entera. */}
            <div className="max-h-52 overflow-y-auto py-1">
                {gente.map((p, i) => (
                    <button
                        key={p.id}
                        type="button"
                        // Antes del `blur` de la caja, o el botón se va sin que
                        // llegue su pulsación.
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onElegir(p);
                        }}
                        onMouseEnter={() => onSenalar(i)}
                        className={[
                            "flex w-full flex-col items-start gap-0 px-2 py-1.5 text-left transition-colors",
                            i === elegido ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                        ].join(" ")}
                    >
                        <span className="w-full truncate text-sm">{comoSeLlama(p)}</span>
                        {p.name?.trim() && p.email ? (
                            <span className="w-full truncate text-[11px] text-muted-foreground">
                                {p.email}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * El registro de una llamada.
 *
 * **No se pinta como una burbuja**: nadie escribió eso, lo dejó la llamada al
 * terminar. Va centrado y en gris, como una marca del hilo — igual que en
 * cualquier mensajería. Pintado como un mensaje más, parecería que alguien
 * escribió «Llamada de voz · 3:07».
 */
function MarcaDeLlamada({
    mensaje,
    mio,
}: {
    mensaje: MensajeDeEquipo;
    mio: boolean;
}) {
    const fin = mensaje.llamada?.fin;
    const perdida = fin === "sin_respuesta" || fin === "no_disponible";
    const rota = fin === "sin_conexion" || fin === "rechazada";

    return (
        <div className="flex justify-center py-1">
            <span
                className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]",
                    perdida || rota
                        ? "border-destructive/30 bg-destructive/5 text-destructive"
                        : "border-border bg-muted/40 text-muted-foreground",
                ].join(" ")}
            >
                {perdida || rota ? (
                    <PhoneOff className="h-3 w-3 shrink-0" />
                ) : (
                    <Phone className="h-3 w-3 shrink-0" />
                )}
                {/* El mismo texto para los dos: la llamada es un hecho, no
                    algo que uno le contó al otro. Quién llamó lo dice el
                    «Saliente/Entrante» de al lado. */}
                <span>{mensaje.texto}</span>
                <span className="opacity-60">· {mio ? "saliente" : "entrante"}</span>
            </span>
        </div>
    );
}

function Burbuja({
    mensaje,
    mio,
    meMencionan,
    buscado = false,
    nombrePorId,
    onCitar,
    onSaltar,
    puedoTranscribir = false,
    onTranscrita,
}: {
    mensaje: MensajeDeEquipo;
    mio: boolean;
    meMencionan: boolean;
    /** El mensaje al que traía el aviso: se señala para encontrarlo de un vistazo. */
    buscado?: boolean;
    nombrePorId: Map<string, string>;
    /** Responder citando este mensaje. Sin permiso de escritura no se ofrece. */
    onCitar?: (m: MensajeDeEquipo) => void;
    /** Ir al mensaje citado, cuando la cita se pulsa. */
    onSaltar?: (id: string) => void;
    /**
     * Si esta persona puede pedir la transcripción de una nota de voz.
     *
     * Es **pertenecer al canal**, no poder leerlo: un administrador lee los
     * directos de su cuenta y eso no le deja gastar créditos transcribiendo la
     * conversación de otros dos.
     */
    puedoTranscribir?: boolean;
    /** Pintar la transcripción recién pagada sin esperar al reloj. */
    onTranscrita?: (id: string, texto: string) => void;
}) {
    const quien = mensaje.autorNombre?.trim() || nombrePorId.get(mensaje.autorId) || "Alguien";
    const hora = new Date(mensaje.creadoEn).toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div
            // El id es por donde lo encuentra el aviso de la mención.
            id={`mensaje-${mensaje.id}`}
            className={`flex flex-col gap-1 ${mio ? "items-end" : "items-start"}`}
        >
            <div className="group flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{mio ? "Tú" : quien}</span>
                <span>{hora}</span>
                {onCitar ? (
                    <button
                        type="button"
                        onClick={() => onCitar(mensaje)}
                        // Sale al posar el cursor, como las acciones de una
                        // tarjeta. Pero **fuera del flujo no hace falta**: es
                        // una sola palabra corta y no le quita ancho a nada.
                        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:text-foreground hover:underline"
                    >
                        Citar
                    </button>
                ) : null}
            </div>
            <div
                className={[
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm",
                    mio
                        ? "border-primary/30 bg-primary/10"
                        : "border-border bg-muted/40",
                    // Una mención se ve sin leer el texto: es lo que hace que
                    // volver al hilo desde el aviso valga para algo.
                    meMencionan ? "ring-2 ring-amber-400/60" : "",
                    // Y el que traía el aviso, además, señalado: en un canal
                    // con tráfico la mención puede no ser la única resaltada.
                    buscado ? "ring-2 ring-primary ring-offset-2" : "",
                ].join(" ")}
            >
                {/* La cita va DENTRO de la burbuja y encima del texto: es
                    contexto de esta respuesta, no un mensaje aparte. Fuera se
                    leería como dos mensajes seguidos. */}
                {mensaje.cita ? (
                    <RecuadroDeCita cita={mensaje.cita} onSaltar={onSaltar} />
                ) : null}
                {/* La NOTA DE VOZ, con el texto debajo si alguien lo pidió.
                    El audio no se quita: es lo que se dijo, con su tono y sus
                    pausas; el texto es una ayuda para leerlo de un vistazo. Es
                    la misma decisión que en Chats. */}
                {mensaje.audio ? (
                    <NotaDeVoz
                        mensaje={mensaje}
                        puedoPedirla={puedoTranscribir}
                        onTranscrita={onTranscrita}
                    />
                ) : null}
                {mensaje.texto}
            </div>
            {mensaje.chat ? <TarjetaDeChat chat={mensaje.chat} /> : null}
        </div>
    );
}

/**
 * Una nota de voz, y su botón de transcribir.
 *
 * # Bajo demanda, nunca sola
 *
 * Las notas de un CLIENTE en Chats se transcriben solas porque el asesor tiene
 * que saber qué le dijeron sin ponerse los auriculares. Un canal del equipo es
 * al revés: son compañeros hablando todo el día, y transcribir cada nota a seis
 * créditos el minuto es una factura que nadie pidió.
 *
 * # Y el precio se ve ANTES de pulsar
 *
 * El botón dice lo que va a costar, porque la duración **es** el precio. Un
 * botón que gasta créditos sin decir cuántos es un cheque en blanco, y eso
 * reaparece como «¿por qué bajaron mis créditos?».
 *
 * # Una vez pagada, se queda
 *
 * El texto se guarda en la fila, así que el botón desaparece y quien la pida
 * después la lee sin que cueste nada. Sin eso, en un canal de ocho personas la
 * misma nota se pagaría ocho veces.
 */
function NotaDeVoz({
    mensaje,
    puedoPedirla,
    onTranscrita,
}: {
    mensaje: MensajeDeEquipo;
    /** Solo quien PERTENECE al canal, no quien solo puede leerlo. */
    puedoPedirla: boolean;
    onTranscrita?: (id: string, texto: string) => void;
}) {
    const [pidiendo, setPidiendo] = useState(false);
    const audio = mensaje.audio;
    if (!audio) return null;

    const costo = costoDeLaNota(audio.segundos).creditos;
    // Una nota por encima del tope no se transcribe, así que **no se ofrece**:
    // un botón que al pulsarlo da error es peor que no tenerlo. Y se dice por
    // qué — sin eso, una nota sin botón al lado de otras con botón se lee como
    // que la función está rota.
    const muyLarga = audio.segundos > TOPE_DE_SEGUNDOS;

    const pedirla = async () => {
        if (pidiendo) return;
        setPidiendo(true);
        try {
            const res = await transcribirNotaDelEquipoAction(mensaje.id);
            if (!res.success) {
                // Sin créditos, muy larga, o un fallo de OpenAI: los tres dicen
                // qué pasó. Un botón que se queda igual no se distingue de uno
                // roto.
                toast.error(res.message);
                return;
            }
            onTranscrita?.(mensaje.id, res.data.transcripcion);
        } catch (error) {
            // Una acción no solo devuelve `success: false`: puede reventar, y
            // entonces el «Transcribiendo…» se quedaría puesto para siempre.
            console.warn("[chat-equipo] la transcripción reventó", error);
            toast.error("No se pudo transcribir. Inténtalo otra vez.");
        } finally {
            setPidiendo(false);
        }
    };

    return (
        <div className="mb-1 flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <audio
                    src={audio.url}
                    controls
                    preload="none"
                    className="h-9 min-w-0 flex-1"
                />
                {audio.segundos > 0 ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {comoSeLeeLaDuracion(audio.segundos)}
                    </span>
                ) : null}
            </div>

            {mensaje.transcripcion ? (
                <div className="rounded border-l-2 border-primary/40 bg-background/60 px-2 py-1 text-xs text-muted-foreground">
                    {mensaje.transcripcion}
                </div>
            ) : muyLarga ? (
                <span className="self-start text-[11px] text-muted-foreground">
                    Demasiado larga para transcribirla.
                </span>
            ) : puedoPedirla ? (
                <button
                    type="button"
                    onClick={() => void pedirla()}
                    disabled={pidiendo}
                    className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
                >
                    {pidiendo ? (
                        <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Transcribiendo…
                        </span>
                    ) : (
                        `Transcribir (${comoSeLeeElCosto(costo)})`
                    )}
                </button>
            ) : null}
        </div>
    );
}

/**
 * El mensaje citado, dentro de la respuesta.
 *
 * Se pinta con lo que trae la fila de la respuesta —el nombre y el extracto
 * están copiados—, así que **no depende del original para nada**. Lo único que
 * se pregunta por él es si sigue existiendo, y eso solo cambia dos cosas: el
 * recuadro deja de ser pulsable y lo dice.
 */
/**
 * La barra de búsqueda y su lista de resultados.
 *
 * **Se busca al enviar el formulario**, no en cada tecla: una consulta por
 * carácter son diez para escribir «facturas», y ver resultados a medio escribir
 * no ayuda a encontrar nada. Enter busca y Escape cierra, que es lo que la gente
 * ya intenta hacer.
 *
 * Y el alcance es explícito —este canal o todos— en vez de adivinarlo: quien
 * busca «factura» en el canal de ventas casi siempre quiere el de ventas, pero
 * quien no se acuerda de dónde lo leyó quiere todos, y eso no se puede deducir.
 */
function BarraDeBusqueda({
    texto,
    onTexto,
    soloEsteCanal,
    onAlcance,
    buscando,
    resultados,
    nombreDelCanal,
    onBuscar,
    onCerrar,
    onAbrirResultado,
}: {
    texto: string;
    onTexto: (v: string) => void;
    soloEsteCanal: boolean;
    onAlcance: (v: boolean) => void;
    buscando: boolean;
    /** `null` = todavía no se ha buscado. `[]` = se buscó y no hay nada. */
    resultados: ResultadoDeBusqueda[] | null;
    nombreDelCanal: string;
    onBuscar: () => void;
    onCerrar: () => void;
    onAbrirResultado: (r: ResultadoDeBusqueda) => void;
}) {
    return (
        <div className="shrink-0 border-b border-border bg-background">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    onBuscar();
                }}
                className="flex items-center gap-2 px-3 py-2 sm:px-6"
            >
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                    value={texto}
                    onChange={(e) => onTexto(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onCerrar();
                    }}
                    placeholder={`Buscar en ${soloEsteCanal ? nombreDelCanal : "todos los canales"}…`}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                    <input
                        type="checkbox"
                        checked={!soloEsteCanal}
                        onChange={(e) => onAlcance(!e.target.checked)}
                        className="h-3 w-3"
                    />
                    En todos
                </label>
                {buscando ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
                {resultados !== null ? (
                    <button
                        type="button"
                        onClick={onCerrar}
                        aria-label="Cerrar la búsqueda"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                ) : null}
            </form>

            {resultados !== null ? (
                <div className="max-h-64 overflow-y-auto border-t border-border/60 px-3 pb-2 sm:px-6">
                    {resultados.length === 0 ? (
                        // Decirlo, y no dejar la lista vacía: una lista que no
                        // aparece se lee como que el buscador no hizo nada.
                        <p className="py-3 text-center text-xs text-muted-foreground">
                            No hay mensajes con eso
                            {soloEsteCanal ? ` en ${nombreDelCanal}` : ""}.
                        </p>
                    ) : (
                        <ul className="flex flex-col py-1">
                            {resultados.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => onAbrirResultado(r)}
                                        className="w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                                    >
                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                            {/* El canal va en el resultado: sin
                                                él no se puede decidir si es el
                                                que se busca sin abrirlo. */}
                                            <span className="font-medium text-foreground/80">
                                                {r.canalNombre}
                                            </span>
                                            <span>{r.autorNombre?.trim() || "Alguien"}</span>
                                            <span>
                                                {new Date(r.creadoEn).toLocaleDateString([], {
                                                    day: "2-digit",
                                                    month: "short",
                                                })}
                                            </span>
                                        </div>
                                        <div className="line-clamp-2 text-xs">{r.texto}</div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function RecuadroDeCita({
    cita,
    onSaltar,
}: {
    cita: NonNullable<MensajeDeEquipo["cita"]>;
    onSaltar?: (id: string) => void;
}) {
    const sePuedeIr = cita.sigueAhi && Boolean(onSaltar);

    return (
        <div
            role={sePuedeIr ? "button" : undefined}
            tabIndex={sePuedeIr ? 0 : undefined}
            onClick={sePuedeIr ? () => onSaltar?.(cita.id) : undefined}
            onKeyDown={
                sePuedeIr
                    ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSaltar?.(cita.id);
                          }
                      }
                    : undefined
            }
            className={[
                "mb-1.5 border-l-2 border-primary/50 bg-background/50 px-2 py-1 text-xs",
                sePuedeIr ? "cursor-pointer hover:bg-background/80" : "",
            ].join(" ")}
        >
            <div className="font-medium text-foreground/80">
                {cita.autorNombre?.trim() || "Alguien"}
            </div>
            <div className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                {cita.extracto}
            </div>
            {/* Si el original se borró, la cita se queda —el texto está aquí—
                pero hay que decir que ya no se puede ir a él. Sin esto, pulsar
                no haría nada y se leería como un recuadro roto. */}
            {!cita.sigueAhi ? (
                <div className="mt-0.5 italic text-muted-foreground/70">
                    Este mensaje ya no está
                </div>
            ) : null}
        </div>
    );
}

/**
 * La conversación de Chats que señala un mensaje.
 *
 * Va **fuera de la burbuja**, debajo: dentro se confundiría con lo que alguien
 * escribió, y esto no lo escribió nadie — lo puso el botón de compartir.
 *
 * Y es un enlace de verdad (`<a href>`), no un botón que navega: así se puede
 * abrir en otra pestaña con el botón de en medio, que es justo lo que hace
 * quien no quiere perder el canal que está leyendo.
 *
 * **La comprobación de si se puede abrir NO está aquí.** Está en la pantalla de
 * Chats, que es la que sabe qué líneas ve esta persona; ofrecer el enlace y que
 * allí se explique es mejor que esconderlo, porque un botón que desaparece no
 * dice por qué. Ver `lib/chat-compartido.ts`.
 */
function TarjetaDeChat({ chat }: { chat: ChatCompartido }) {
    const numero = elNumeroQueSeEnsena(chat);

    return (
        <a
            href={aDondeLlevaElChat(chat)}
            className="flex w-full max-w-[85%] items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-primary/50 hover:bg-muted/40"
        >
            <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                    {chat.nombre?.trim() || numero || "Conversación"}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                    {/* El número solo si se sabe de verdad: los dígitos de un
                        `@lid` son un id de privacidad y enseñarlos como
                        teléfono es peor que no enseñar nada. */}
                    {[numero, chat.linea].filter(Boolean).join(" · ")}
                </span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </a>
    );
}

/**
 * Subir la nota al bucket, por la MISMA ruta que los adjuntos de una tarea.
 *
 * `/api/upload` ya comprueba sesión y que la carpeta sea de una cuenta sobre la
 * que se manda, así que no hace falta una ruta nueva — y una ruta nueva que
 * escribe en el bucket es una puerta más que auditar.
 *
 * La carpeta es la de **quien graba**, no la de la cuenta que paga: son dos
 * preguntas distintas. La carpeta solo tiene que pasar la puerta de la subida
 * —el id propio siempre la pasa— y quién paga la transcripción lo decide el
 * servidor después, con la cuenta y su familia.
 *
 * Devuelve `null` cuando no se pudo, y **lo dice**: una grabación que se pierde
 * en silencio se lee como que el botón de enviar no hace nada.
 */
async function subirLaNota(
    grabada: RecordedAudioData,
    quienGraba: string | null,
): Promise<string | null> {
    if (!quienGraba) return null;
    try {
        const cuerpo = new FormData();
        cuerpo.append("file", comoArchivoDeAudio(grabada));
        cuerpo.append("userID", quienGraba);
        cuerpo.append("workflowID", "chat-equipo");

        const res = await fetch("/api/upload", { method: "POST", body: cuerpo });
        if (!res.ok) {
            console.warn("[chat-equipo] no se pudo subir la nota de voz", {
                estado: res.status,
            });
            return null;
        }
        const datos = (await res.json()) as { url?: string };
        return datos.url?.trim() || null;
    } catch (error) {
        console.warn("[chat-equipo] falló la subida de la nota de voz", error);
        return null;
    }
}
