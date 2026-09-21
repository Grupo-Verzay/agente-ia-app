"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AudioLines,
    Building2,
    ExternalLink,
    Hash,
    Image as ImageIcon,
    Loader2,
    Lock,
    MessagesSquare,
    Mic,
    MicOff,
    Pencil,
    Phone,
    PhoneOff,
    Plus,
    Download,
    FileText,
    MoreHorizontal,
    Paperclip,
    Search,
    Send,
    SmilePlus,
    Square,
    Trash2,
    Video,
    X,
    Users,
    Video as VideoCamara,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    elCanalDeEntrada,
    elCanalRecordado,
    recordarElCanal,
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
    borrarMensajeDelEquipoAction,
    editarMensajeDelEquipoAction,
    reaccionarEnElEquipoAction,
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
import { FlechaAlFinal } from "@/components/shared/FlechaAlFinal";
import { useHiloPegadoAbajo } from "@/hooks/useHiloPegadoAbajo";
import { TOPE_DE_SEGUNDOS, costoDeLaNota } from "@/lib/transcripcion-de-voz";
import {
    TOPE_DE_ARCHIVOS,
    TOPE_DE_BYTES,
    comoSeLeeElNombre,
    comoSeLeeElTamano,
    laClaseDelAdjunto,
    type AdjuntoDelEquipo,
} from "@/lib/adjuntos-del-equipo";
import {
    EMOJIS_RAPIDOS,
    alternarEnLaLista,
    type ReaccionDeMensaje,
} from "@/lib/reacciones-del-equipo";
import {
    LO_QUE_QUEDA_AL_BORRAR,
    sePuedeBorrar,
    sePuedeEditar,
} from "@/lib/editar-del-equipo";
import { avisarDeQueSeLeyo, avisarDelCanalAbierto } from "@/hooks/useSinLeerDelEquipo";
// La barra de escribir es la MISMA que la de Chats, y por eso nada de esto se
// escribe aquí: los tres componentes se mudaron a `components/shared` —Chats
// los sigue usando, desde su sitio nuevo— y las clases de la columna flotante
// y de los botones redondos viven en `lib/barra-de-escribir.ts`. Copiadas, el
// día que se afine una de las dos barras la otra se queda atrás, y eso no se
// ve como un error: se ve como dos pantallas de la misma plataforma que no se
// parecen.
import { AbrirReunion } from "@/components/video/AbrirReunion";
import { EmojiPickerPanel } from "@/components/shared/EmojiPickerPanel";
// La barra de escribir es UNA: el «+» con sus herramientas, el alto de la
// caja y los botones redondos de la derecha salen del mismo sitio que los de
// Chats. Escritos aquí a mano es como el icono del dictado acabó siendo una T
// y como esta caja se quedó sin pegar desde el portapapeles.
import {
    BotonesDeLaDerecha,
    ZonaDeHerramientas,
    rellenoParaLosBotones,
    useAltoDeLaCaja,
    useBarraCompacta,
} from "@/components/shared/BarraDeEscribir";
import { FormatoDeTexto } from "@/components/shared/FormatoDeTexto";
import { TextoConFormato } from "@/components/shared/TextoConFormato";
import { TarjetaDeReunion } from "@/components/video/TarjetaDeReunion";
import { apartarLasReuniones } from "@/lib/enlaces-del-texto";
import { envolverSeleccion } from "@/lib/formato-whatsapp";
import {
    BOTON_DE_ENVIAR,
    BOTON_DE_HERRAMIENTA,
    BOTON_REDONDO_GRABANDO,
    archivosDelPortapapeles,
} from "@/lib/barra-de-escribir";
import { cn } from "@/lib/utils";

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
    cuentaId,
    personaId,
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
    /**
     * Quién entra, para volver al canal donde se estaba.
     *
     * Se resuelven en el SERVIDOR y bajan como props porque hacen falta
     * **antes de la primera consulta**: la respuesta también los trae, pero
     * para entonces ya se habría pedido el General y se vería el salto. Sin
     * ellos no se recuerda nada y el hilo abre en General, que es como se
     * comportaba antes.
     */
    cuentaId?: string;
    personaId?: string;
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

    // La barra de escribir, plegada: el «+» de la izquierda y el micrófono de
    // la derecha. Aquí van SIEMPRE plegados, no solo en pantalla estrecha como
    // en Chats: este hilo se lee en un panel lateral de 18 a 24 rem, así que
    // «ancho» no existe.
    const [herramientas, setHerramientas] = useState(false);
    const [emojis, setEmojis] = useState(false);
    const [voz, setVoz] = useState(false);

    // Los archivos elegidos y todavía sin mandar. Viven en el FORMULARIO, como
    // la cita y como el borrador de un comentario de tarea: son parte de lo
    // que se va a enviar, así que se mandan con él y se limpian al enviar.
    const [archivos, setArchivos] = useState<File[]>([]);
    const elegirArchivos = useRef<HTMLInputElement | null>(null);

    // El mensaje que se está editando, si se está editando alguno. Se edita en
    // la MISMA caja de escribir y no en la burbuja: ahí están el formato, los
    // emojis y el selector de menciones, y una segunda caja dentro de la
    // burbuja sería una copia de todo eso que el día que se afine se queda
    // atrás.
    const [editando, setEditando] = useState<MensajeDeEquipo | null>(null);
    // El mensaje que se va a borrar, mientras se confirma. **Uno solo para todo
    // el hilo**, y no un diálogo dentro de cada burbuja: con cien mensajes
    // abiertos serían cien diálogos montados para usar ninguno.
    const [porBorrar, setPorBorrar] = useState<MensajeDeEquipo | null>(null);

    const cajaDeEscribir = useRef<HTMLTextAreaElement | null>(null);
    const cajaDeHerramientas = useRef<HTMLDivElement | null>(null);
    const cajaDeEmojis = useRef<HTMLDivElement | null>(null);
    const cajaDeVoz = useRef<HTMLDivElement | null>(null);
    const abajoDelTodo = useRef<HTMLDivElement | null>(null);
    /** El contenedor que scrollea, para el anclaje al final. */
    const elHilo = useRef<HTMLDivElement | null>(null);
    // El último mensaje que ya se dio por leído. Sirve para no avisar al
    // contador en cada vuelta del reloj: solo cuando de verdad se marcó algo
    // nuevo. Sin esto, el contador —que va a 15 s— pasaría a preguntar cada 5.
    const yaMarcado = useRef<string | null>(null);
    // El ciclo lee el canal por referencia: si entrara en las dependencias,
    // cambiar de canal remontaría el `setInterval` y perdería su cadencia.
    const canalRef = useRef(canalId);
    canalRef.current = canalId;
    /** Lo último que se guardó como «aquí estaba», para no reescribirlo cada vuelta. */
    const yaRecordado = useRef<string | null>(null);

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

    const traer = useCallback(async (
        cual?: string,
        mensaje?: string | null,
        deRecuerdo?: boolean,
    ) => {
        const pedido = cual ?? canalRef.current;
        // Pedir un canal CONCRETO es reclamarlo ya, no cuando conteste el
        // servidor. Es lo que `cambiarDeCanal` hacía por su cuenta, y lo que
        // le faltaba a los otros dos que piden uno distinto del que hay:
        //
        // - la primera carga, desde que se abre en el canal recordado;
        // - `irAlMensaje`, cuando el resultado está en otro canal.
        //
        // Sin esto, el guardián de la vuelta rancia de tres líneas más abajo
        // compara contra el canal ANTERIOR —que en la primera carga es el
        // General— y **tira la respuesta buena**: la pantalla se queda en
        // General, el reloj vuelve a pedir el General, y desde fuera parece
        // que el recuerdo no se guardó. No hay error en ninguna parte, que es
        // lo que costó encontrarlo.
        if (cual) {
            canalRef.current = cual;
            setCanalId(cual);
        }
        // El mensaje solo se pide cuando se viene A POR ÉL. En las vueltas del
        // reloj no: el hilo se traería centrado en un mensaje viejo para
        // siempre y no se vería entrar nada nuevo.
        const res = await hiloDelEquipoAction(pedido, mensaje ?? undefined, deRecuerdo);
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

        // Y se recuerda para la próxima vez. Con los ids de la RESPUESTA, no
        // con los de las props: así la llave con la que se guarda es siempre
        // la de la cuenta que de verdad sirvió el hilo. Eso además cura solo
        // un recuerdo rancio —el servidor devolvió el General y es el General
        // lo que se guarda—, sin ninguna rama que lo borre.
        //
        // Aquí pasan las vueltas del reloj cada cinco segundos, así que solo
        // se escribe cuando cambia: una escritura en `localStorage` por
        // vuelta, en todas las pestañas del equipo, es pagar todo el día por
        // un dato que no se ha movido.
        const recuerdo = `${res.data.cuentaId}::${res.data.yo}::${res.data.canalId}`;
        if (yaRecordado.current !== recuerdo) {
            yaRecordado.current = recuerdo;
            recordarElCanal(res.data.cuentaId, res.data.yo, res.data.canalId);
        }
        return null;
    }, []);

    // ── La primera carga ────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo || datos) return;
        let vivo = true;
        void (async () => {
            try {
                // Se vuelve al canal donde se estaba. Lo pedido manda sobre
                // el recuerdo: quien llega por un aviso de mención va a algo
                // concreto, y abrirle el de ayer sería un enlace que no lleva
                // donde dice.
                const entrada = elCanalDeEntrada({
                    pedido: canalInicial,
                    recordado:
                        cuentaId && personaId
                            ? elCanalRecordado(cuentaId, personaId)
                            : null,
                });
                const malo = await traer(
                    entrada.canal,
                    aPorEsteRef.current,
                    entrada.deRecuerdo,
                );
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
    }, [activo, datos, traer, canalInicial, cuentaId, personaId]);

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
    // Lo decide `useHiloPegadoAbajo`, que comparten los cinco listados de la
    // plataforma. Antes esto era un `scrollIntoView` al cambiar el número de
    // mensajes, con los dos fallos de siempre: iba antes de que cargaran los
    // adjuntos y los audios —que empujan el contenido, así que el hilo se
    // quedaba a media altura— y arrastraba la vista de quien estuviera leyendo
    // arriba.
    const mensajes = datos?.mensajes;
    const { pegado, sinLeer, irAlFinal, soltar } = useHiloPegadoAbajo({
        ref: elHilo,
        clave: canalId,
        total: mensajes?.length ?? 0,
        ultimoId: mensajes?.length ? String(mensajes[mensajes.length - 1].id) : null,
    });

    // Salvo cuando se llega desde un aviso de mención: entonces manda el
    // mensaje, y solo la PRIMERA vez —`buscado`—. Si no, cada vuelta del reloj
    // devolvería la vista a la mención y no se podría seguir leyendo.
    const buscado = useRef(false);
    useEffect(() => {
        if (!aPorEste || buscado.current || !mensajes?.length) return;
        const nodo = document.getElementById(`mensaje-${aPorEste}`);
        if (!nodo) return;
        // Si no está —quedó fuera de los últimos que se traen— se sigue como
        // siempre: al final, que de eso ya se encarga el hook.
        buscado.current = true;
        // Se suelta el anclaje a propósito: sin esto, el primer adjunto que
        // cargue después volvería a pegar el hilo abajo y desharía el salto.
        soltar();
        nodo.scrollIntoView({ block: "center" });
    }, [mensajes?.length, aPorEste, soltar]);

    const canal = useMemo(
        () => datos?.canales.find((c) => c.id === canalId) ?? datos?.canales[0] ?? null,
        [datos, canalId],
    );

    const cambiarDeCanal = useCallback(
        async (cual: string) => {
            setListaAbierta(false);
            setTexto("");
            // Reclamar el canal —mover `canalRef` YA, no en el render
            // siguiente— lo hace `traer`, que es por donde pasan los TRES que
            // piden un canal concreto. Escrito además aquí eran dos sitios
            // diciendo lo mismo, y el día que uno se afine el otro se queda.
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

        // EDITAR es otro camino: el mismo botón, la misma caja, otra acción.
        // Se mira antes que nada porque editando no hay ni adjunto ni nota que
        // mandar — solo texto que corregir.
        if (editando) {
            if (!limpio || enviando) return;
            setEnviando(true);
            try {
                const res = await editarMensajeDelEquipoAction(editando.id, limpio);
                if (!res.success) {
                    toast.error(res.message);
                    return;
                }
                setTexto("");
                setArroba(null);
                setEditando(null);
                // Se pinta al momento, como el envío: el reloj lo confirma en
                // su vuelta, pero corregir una errata no puede sentirse lento.
                setDatos((antes) =>
                    !antes
                        ? antes
                        : {
                              ...antes,
                              mensajes: antes.mensajes.map((m) =>
                                  m.id === res.data.mensajeId
                                      ? {
                                            ...m,
                                            texto: res.data.texto,
                                            editadoEn: res.data.editadoEn,
                                        }
                                      : m,
                              ),
                          },
                );
            } catch (error) {
                console.error("[chat-equipo] la edición reventó", error);
                toast.error("No se pudo editar. Inténtalo de nuevo.");
            } finally {
                setEnviando(false);
            }
            return;
        }

        // Una nota de voz —o un archivo— ES el mensaje: con ellos el texto
        // sobra.
        if ((!limpio && !grabada && !archivos.length) || enviando) return;
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
            // Los ARCHIVOS: uno por mensaje, **en serie y en orden**.
            //
            // En serie porque son mensajes de una conversación y llegan en el
            // orden en que se eligieron; en paralelo saldrían desordenados y
            // no habría forma de saber cuál es el pie de cuál.
            //
            // Y el texto va con el PRIMERO —es su pie— y no con todos: con el
            // texto repetido, la misma frase saldría tres veces y la misma
            // mención habría hecho saltar la ventana que interrumpe tres veces.
            const subidos: Array<{
                url: string;
                nombre: string;
                mime: string | null;
                tamano: number;
            }> = [];
            for (const archivo of archivos) {
                const url = await subirElArchivo(archivo, datos?.yo ?? null);
                if (!url) {
                    // Se para aquí y se dice: publicar el resto sin uno de los
                    // archivos se leería como que se mandó todo, y el que
                    // falta no vuelve solo.
                    toast.error(`No se pudo subir «${archivo.name}».`);
                    return;
                }
                subidos.push({
                    url,
                    nombre: archivo.name,
                    mime: archivo.type || null,
                    tamano: archivo.size,
                });
            }

            const nuevos: MensajeDeEquipo[] = [];
            let elPrimero = true;
            // Con archivos, el mensaje de texto/nota ya no va por su cuenta: el
            // texto es el pie del primero. Sin archivos, `undefined` y el envío
            // de siempre.
            const tandas: Array<(typeof subidos)[number] | undefined> = subidos.length
                ? subidos
                : [undefined];
            for (const adjunto of tandas) {
                const res = await enviarAlEquipoAction(
                    elPrimero ? limpio : "",
                    canalId,
                    undefined,
                    // La cita es de la respuesta, no de cada archivo: va con el
                    // primero y ya. Repetida, el mismo recuadro saldría tres
                    // veces bajo tres fotos.
                    elPrimero ? citando?.id ?? null : null,
                    elPrimero ? audio : undefined,
                    adjunto,
                );
                if (!res.success) {
                    // Un botón que no dice por qué no hizo nada es un botón que
                    // se pulsa cinco veces.
                    toast.error(res.message);
                    // Lo que ya salió, sale: se pinta y no se finge que no
                    // pasó nada.
                    break;
                }
                nuevos.push(res.data.mensaje);
                elPrimero = false;
            }
            if (!nuevos.length) return;
            const res = { data: { canalId, mensaje: nuevos[nuevos.length - 1] } };
            setTexto("");
            setArroba(null);
            setArchivos([]);
            // La cita se limpia al enviar, como el texto: es parte de lo que se
            // acaba de mandar. Dejándola puesta, la respuesta siguiente saldría
            // citando lo mismo sin que nadie lo pidiera.
            setCitando(null);
            limpiarGrabacion();
            // Se pinta al momento y el reloj lo confirma en su vuelta: el
            // servidor manda, pero escribir no puede sentirse lento.
            setDatos((antes) => {
                if (!antes || res.data.canalId !== antes.canalId) return antes;
                // El reloj puede haberlos traído ya: sin esta comprobación el
                // mismo mensaje saldría dos veces durante unos segundos.
                const faltan = nuevos.filter(
                    (n) => !antes.mensajes.some((m) => m.id === n.id),
                );
                return faltan.length
                    ? { ...antes, mensajes: [...antes.mensajes, ...faltan] }
                    : antes;
            });
        } catch (error) {
            console.error("[chat-equipo] el envío reventó", error);
            toast.error("No se pudo enviar. Inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    }, [texto, enviando, canalId, citando, datos?.yo, limpiarGrabacion, archivos, editando]);

    /**
     * Lo que se elige con el botón de adjuntar.
     *
     * Se comprueba **aquí y no solo al subir**, porque aquí es donde se puede
     * decir: un archivo de 300 MB que se rechaza después de tres minutos de
     * barra se lee como que la App se colgó. El servidor lo vuelve a mirar —lo
     * que llega del navegador no decide lo que se guarda— pero lo que evita el
     * disgusto es esto.
     */
    const elegirLosArchivos = useCallback((lista: FileList | null) => {
        const nuevos = Array.from(lista ?? []);
        if (!nuevos.length) return;

        const grandes = nuevos.filter((f) => f.size > TOPE_DE_BYTES);
        const caben = nuevos.filter((f) => f.size <= TOPE_DE_BYTES);
        if (grandes.length) {
            // Y se dice CUÁL, no «alguno»: con cinco elegidos, «uno es
            // demasiado grande» obliga a mirarlos de uno en uno.
            toast.error(
                grandes.length === 1
                    ? `«${grandes[0].name}» pesa más de ${comoSeLeeElTamano(TOPE_DE_BYTES)}.`
                    : `${grandes.length} archivos pesan más de ${comoSeLeeElTamano(TOPE_DE_BYTES)}.`,
            );
        }
        if (!caben.length) return;

        setArchivos((antes) => {
            const juntos = [...antes, ...caben];
            if (juntos.length > TOPE_DE_ARCHIVOS) {
                toast.error(`Se mandan hasta ${TOPE_DE_ARCHIVOS} archivos de una vez.`);
            }
            return juntos.slice(0, TOPE_DE_ARCHIVOS);
        });
    }, []);

    /**
     * Poner o quitar una reacción. **Se pinta al momento y se confirma.**
     *
     * El reloj la traería en su vuelta, pero eso son hasta cinco segundos de
     * un chip que se pulsó y no cambió nada — y una reacción es un gesto de un
     * toque, así que ese retraso se lee como que no funciona. Si el servidor
     * dice que no, se devuelve tal cual estaba: la misma regla que borrar un
     * chat en la bandeja.
     */
    const reaccionar = useCallback(
        async (mensajeId: string, emoji: string) => {
            const yo = datos?.yo;
            if (!yo) return;
            const antesDeTodo = datos?.mensajes ?? [];
            setDatos((antes) =>
                !antes
                    ? antes
                    : {
                          ...antes,
                          mensajes: antes.mensajes.map((m) =>
                              m.id === mensajeId
                                  ? { ...m, reacciones: alternarEnLaLista(m.reacciones, emoji, yo) }
                                  : m,
                          ),
                      },
            );
            try {
                const res = await reaccionarEnElEquipoAction(mensajeId, emoji);
                if (!res.success) {
                    toast.error(res.message);
                    // Se devuelve lo que había, no se recalcula: recalcular
                    // sobre lo ya movido dejaría el chip en el estado
                    // contrario si llegan dos toques seguidos.
                    setDatos((antes) => (antes ? { ...antes, mensajes: antesDeTodo } : antes));
                }
            } catch (error) {
                console.warn("[chat-equipo] no se pudo reaccionar", error);
                toast.error("No se pudo reaccionar.");
                setDatos((antes) => (antes ? { ...antes, mensajes: antesDeTodo } : antes));
            }
        },
        [datos?.yo, datos?.mensajes],
    );

    /**
     * Borrar un mensaje propio.
     *
     * **La burbuja NO se quita**: se queda con su señal, que es lo que se
     * guarda en la base. Quitándola, una conversación de tres se llenaría de
     * huecos que nadie sabe explicar y una respuesta que la citaba hablaría
     * sola.
     */
    const borrarElMio = useCallback(async (mensajeId: string) => {
        try {
            const res = await borrarMensajeDelEquipoAction(mensajeId);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            setDatos((antes) =>
                !antes
                    ? antes
                    : {
                          ...antes,
                          mensajes: antes.mensajes.map((m) =>
                              m.id === res.data.mensajeId
                                  ? {
                                        ...m,
                                        borradoEn: res.data.borradoEn,
                                        // La llamada también: dejándola, la
                                        // lista seguiría pintando la marca de
                                        // llamada en vez de la señal de
                                        // borrado. Es lo mismo que acaba de
                                        // hacer la base.
                                        llamada: null,
                                        // Lo mismo que hace la base: la señal
                                        // se queda, el contenido no. Dejándolo
                                        // aquí, el texto seguiría en pantalla
                                        // hasta la vuelta siguiente del reloj.
                                        texto: "",
                                        adjunto: null,
                                        audio: null,
                                        transcripcion: null,
                                        chat: null,
                                        cita: null,
                                        reacciones: [],
                                    }
                                  : m,
                          ),
                      },
            );
            // Si se estaba editando justo ese, la caja se suelta: seguir
            // editando un mensaje que ya no está deja un botón que da error.
            setEditando((actual) => (actual?.id === mensajeId ? null : actual));
        } catch (error) {
            console.error("[chat-equipo] el borrado reventó", error);
            toast.error("No se pudo borrar. Inténtalo de nuevo.");
        }
    }, []);

    /** Empezar a editar: el texto se lleva a la caja de siempre. */
    const empezarAEditar = useCallback((mensaje: MensajeDeEquipo) => {
        setEditando(mensaje);
        setTexto(mensaje.texto);
        // Y se suelta lo que no se puede cambiar editando: la cita es de un
        // mensaje que ya salió y los archivos son de uno que todavía no. Con
        // ellos puestos, el botón de enviar haría dos cosas a la vez.
        setCitando(null);
        setArchivos([]);
        requestAnimationFrame(() => {
            const caja = cajaDeEscribir.current;
            if (!caja) return;
            caja.focus();
            caja.setSelectionRange(mensaje.texto.length, mensaje.texto.length);
        });
    }, []);

    /** Soltar la edición sin guardar nada. */
    const dejarDeEditar = useCallback(() => {
        setEditando(null);
        setTexto("");
        setArroba(null);
    }, []);

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
     * Cerrar lo flotante al pulsar fuera.
     *
     * Los tres en el mismo sitio y con la misma condición: una columna que se
     * queda abierta tapa la conversación, que es justo lo que esto viene a
     * evitar. `mousedown` y no `click`, como el resto de la plataforma: el
     * `click` llega después del `blur` de la caja.
     */
    useEffect(() => {
        if (!herramientas && !emojis && !voz) return;
        const fuera = (e: MouseEvent) => {
            const donde = e.target as Node;
            if (herramientas && !cajaDeHerramientas.current?.contains(donde)) setHerramientas(false);
            if (emojis && !cajaDeEmojis.current?.contains(donde)) setEmojis(false);
            if (voz && !cajaDeVoz.current?.contains(donde)) setVoz(false);
        };
        document.addEventListener("mousedown", fuera);
        return () => document.removeEventListener("mousedown", fuera);
    }, [herramientas, emojis, voz]);

    /**
     * La caja crece con el texto, hasta su tope.
     *
     * Hace falta **porque los botones se metieron dentro**: el asa de
     * `resize-y` vive en la esquina de abajo a la derecha, que es exactamente
     * donde están ahora el micrófono y el de enviar. Sin esto habría que
     * elegir entre un asa que no se puede coger o una caja de una sola línea
     * para siempre, y un mensaje de tres líneas escrito a ciegas es un mensaje
     * que se manda a medias.
     */
    // Quien decide es `lib/alto-de-la-caja-de-escribir.ts` y el enganche es el
    // MISMO que el de Chats. Aquí estaba escrito a mano con un `max-h-40`, o
    // sea un tope en PÍXELES: el fallo que este repositorio da por arreglado,
    // vivo en la barra de al lado porque el arreglo se hizo en una sola.
    // `reiniciarCon` es lo único propio: al cambiar de canal la caja es otra.
    useAltoDeLaCaja({ ref: cajaDeEscribir, texto, reiniciarCon: canal?.id });

    /**
     * Si la barra va plegada: **medido**, no supuesto.
     *
     * Este hilo se lee en dos sitios —el panel lateral de 18 a 24 rem, donde
     * no cabe nada en fila, y su propia RUTA a todo lo ancho, donde hay tanto
     * sitio como en Chats—. Escrito a mano iba plegado en los dos, y por eso
     * se reportó que «el desplegable abre distinto que en Chats».
     *
     * `medir` va en el `ref` de la barra: es un ref de callback a propósito,
     * porque aquí el compositor no existe en el primer render (el hilo pinta
     * antes su carga) y un efecto sobre un `useRef` se rendiría con `null` y
     * no volvería a mirar. Ver `useBarraCompacta`.
     */
    const { compacta, medir: medirLaBarra } = useBarraCompacta();

    /**
     * El estado del que salen los botones de la derecha **y** el hueco que la
     * caja les deja. Uno solo, porque si fueran dos podrían discrepar.
     *
     * `conVoz` es falso mientras se edita un mensaje: ahí lo único que se
     * puede hacer es guardar, y ofrecer un micrófono que no graba nada es un
     * botón que al pulsarlo no hace nada.
     */
    const laDerecha = useMemo(
        () => ({
            compacta,
            conVoz: !editando,
            hayDictado: dictado.supported,
            dictando: dictado.listening,
            grabando,
            hayAlgoQueEnviar: Boolean(texto.trim() || grabada || archivos.length),
        }),
        [compacta, editando, dictado.supported, dictado.listening, grabando, texto, grabada, archivos.length],
    );

    /**
     * Pegar con Ctrl+V.
     *
     * Esto **no existía aquí**: la caja no llevaba ningún `onPaste`, así que
     * pegar una captura no hacía absolutamente nada —ni error, ni aviso— y eso
     * se lee como que el chat del equipo no admite imágenes. Va por la misma
     * función que Chats (`archivosDelPortapapeles`) y por el mismo camino que
     * el clip (`elegirLosArchivos`), así que hereda su tope de tamaño, su tope
     * de cuántos y sus avisos.
     *
     * Y **solo actúa si el portapapeles trae FICHEROS**: el `preventDefault` va
     * dentro de esa condición, nunca antes, o pegar texto dejaría de
     * comportarse como siempre.
     */
    const alPegar = useCallback(
        (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
            if (!canal?.puedoEscribir || enviando || editando) return;
            const pegados = archivosDelPortapapeles(e.clipboardData?.items);
            if (!pegados.length) return;
            e.preventDefault();
            // Una captura pegada no trae nombre: el portapapeles la llama
            // «image.png» siempre. Sin renombrarla, tres capturas salen con el
            // mismo nombre y no hay forma de distinguirlas.
            const sello = new Date().toISOString().replace(/[:.]/g, "-");
            const conNombre = pegados.map((f, i) => {
                if (f.name && f.name !== "image.png") return f;
                const ext = (f.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
                return new File([f], `captura-${sello}${i ? `-${i + 1}` : ""}.${ext}`, {
                    type: f.type,
                });
            });
            const lista = new DataTransfer();
            for (const f of conNombre) lista.items.add(f);
            elegirLosArchivos(lista.files);
        },
        [canal?.puedoEscribir, enviando, editando, elegirLosArchivos],
    );

    /**
     * Poner (o quitar) una marca de formato de WhatsApp sobre lo seleccionado.
     *
     * Lo que entiende las marcas es `lib/formato-whatsapp.ts`, el mismo módulo
     * que usa Chats: aquí solo se le pasa la selección y se devuelve el cursor
     * a su sitio **después del pintado**, por lo mismo que `meterLaMencion`.
     */
    const aplicarFormato = useCallback(
        (marca: string) => {
            const caja = cajaDeEscribir.current;
            if (!caja) return;
            const r = envolverSeleccion(
                texto,
                caja.selectionStart ?? texto.length,
                caja.selectionEnd ?? texto.length,
                marca,
            );
            if (r.texto === texto) return;
            setTexto(r.texto.slice(0, TOPE_DEL_MENSAJE));
            requestAnimationFrame(() => {
                const c = cajaDeEscribir.current;
                if (!c) return;
                c.focus();
                c.setSelectionRange(r.inicio, r.fin);
            });
        },
        [texto],
    );

    /** Meter un emoji donde esté el cursor, y dejarlo detrás. */
    const meterElEmoji = useCallback(
        (emoji: string) => {
            const caja = cajaDeEscribir.current;
            const inicio = caja?.selectionStart ?? texto.length;
            const fin = caja?.selectionEnd ?? texto.length;
            const puesto = (texto.slice(0, inicio) + emoji + texto.slice(fin)).slice(
                0,
                TOPE_DEL_MENSAJE,
            );
            setTexto(puesto);
            setEmojis(false);
            const cursor = Math.min(inicio + emoji.length, puesto.length);
            requestAnimationFrame(() => {
                const c = cajaDeEscribir.current;
                if (!c) return;
                c.focus();
                c.setSelectionRange(cursor, cursor);
            });
        },
        [texto],
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
        // Los atajos de formato van DELANTE, y no se comen nada: solo miran
        // Ctrl/Cmd con B, I o Mayús+X, que no son ninguna de las teclas con
        // las que manda el selector de menciones. Todo lo demás pasa de largo,
        // tal cual llegó.
        if (e.ctrlKey || e.metaKey) {
            const tecla = e.key.toLowerCase();
            const marca =
                tecla === "b" && !e.shiftKey
                    ? "*"
                    : tecla === "i" && !e.shiftKey
                      ? "_"
                      : tecla === "x" && e.shiftKey
                        ? "~"
                        : null;
            if (marca) {
                e.preventDefault();
                aplicarFormato(marca);
                return;
            }
        }
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
        // Escape suelta la edición, **con la lista de menciones ya cerrada**:
        // con ella abierta manda la lista, que es la regla de siempre. Sin
        // esto, la única salida sería el botón «Cancelar» de la banda, y una
        // caja con el texto de otro mensaje dentro y sin escape evidente se
        // lee como que la App se quedó pillada.
        if (e.key === "Escape" && editando) {
            e.preventDefault();
            dejarDeEditar();
            return;
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
        // `relative` por la flecha de bajar al final, que se coloca contra ESTA
        // caja. Contra la que scrollea no vale: un absoluto dentro de un
        // contenedor con scroll se desplaza con el contenido.
        <div className="relative flex h-full min-h-0 w-full flex-col">
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

            <div
                ref={elHilo}
                className="flex-1 min-h-0 overflow-y-auto px-3 py-4 sm:px-6"
            >
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
                                yo={datos.yo}
                                // La MISMA puerta que transcribir: pertenecer,
                                // no poder leer. Una reacción la ven los dos y
                                // no la puede quitar ninguno, así que quien
                                // supervisa un directo ajeno no la pone.
                                puedoReaccionar={canal.pertenezco}
                                onReaccionar={reaccionar}
                                puedoEscribir={canal.puedoEscribir}
                                onEditar={empezarAEditar}
                                onBorrar={setPorBorrar}
                                origen={datos.origen}
                                reuniones={datos.reuniones}
                            />
                            ),
                        )}
                        <div ref={abajoDelTodo} />
                    </div>
                )}
            </div>
            {/* Fuera del contenedor que scrollea: dentro se iría con el
                contenido y solo se vería al llegar al final, que es justo
                cuando ya no hace falta. El padre es `relative`. */}
            <FlechaAlFinal
                visible={!pegado}
                sinLeer={sinLeer}
                onClick={irAlFinal}
                className="bottom-20"
            />

            <div
                ref={medirLaBarra}
                // La misma marca que la barra de Chats: el banco mide por ella.
                data-barra="escribir"
                className="shrink-0 border-t border-border bg-background px-3 py-3 sm:px-6"
            >
                {/* Editando: lo que se está tocando, encima de la caja y con
                    su salida. Sin este aviso, el texto de otro mensaje aparece
                    en la caja y se lee como que la App se ha equivocado. */}
                {editando ? (
                    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs">
                        <Pencil className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                            Editando tu mensaje
                        </span>
                        <button
                            type="button"
                            onClick={dejarDeEditar}
                            className="shrink-0 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Cancelar
                        </button>
                    </div>
                ) : null}
                {/* Los archivos elegidos, ENCIMA de la caja y con su papelera
                    cada uno. Elegir de más por error y no poder quitarlo
                    obliga a enviar y borrar después, que es peor. */}
                {archivos.length ? (
                    <div className="mx-auto mb-2 flex max-w-3xl flex-col gap-1">
                        {archivos.map((a, i) => (
                            <div
                                key={`${a.name}-${i}`}
                                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5"
                            >
                                {laClaseDelAdjunto({ mime: a.type, nombre: a.name }) ===
                                "imagen" ? (
                                    <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                ) : laClaseDelAdjunto({ mime: a.type, nombre: a.name }) ===
                                  "video" ? (
                                    <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                                ) : (
                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-xs">
                                    {comoSeLeeElNombre(a.name)}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {comoSeLeeElTamano(a.size)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setArchivos((antes) =>
                                            antes.filter((_, j) => j !== i),
                                        )
                                    }
                                    disabled={enviando}
                                    aria-label={`Quitar ${a.name}`}
                                    title="Quitar"
                                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                        {/* Varios archivos son varios mensajes, y el texto va
                            con el primero. Decirlo evita que alguien escriba un
                            pie para tres y aparezca en uno solo. */}
                        {archivos.length > 1 ? (
                            <p className="px-1 text-[11px] text-muted-foreground">
                                Se envía un mensaje por archivo; el texto va con el
                                primero.
                            </p>
                        ) : null}
                    </div>
                ) : null}
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
                                <TextoConFormato texto={citando.texto} />
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
                    {/* IZQUIERDA: las herramientas. Con sitio van EN FILA,
                        como en Chats; sin él se pliegan en la columna que sale
                        del «+». Quién lo decide es `ZonaDeHerramientas`, la
                        misma que pinta la de la bandeja: escrito aquí a mano
                        iba plegado siempre, y por eso «el desplegable abre
                        distinto que en Chats». */}
                    <ZonaDeHerramientas
                        compacta={compacta}
                        abierta={herramientas}
                        alAlternar={() => {
                            setHerramientas((v) => !v);
                            setEmojis(false);
                        }}
                        deshabilitado={enviando || !canal.puedoEscribir}
                        contenedorRef={cajaDeHerramientas}
                    >
                        <FormatoDeTexto
                            onAplicar={aplicarFormato}
                            disabled={enviando || !canal.puedoEscribir}
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                                setEmojis((v) => !v);
                                setHerramientas(false);
                            }}
                            disabled={enviando || !canal.puedoEscribir}
                            aria-label="Emojis"
                            title="Emojis"
                            className={cn(
                                BOTON_DE_HERRAMIENTA,
                                "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                        >
                            <SmilePlus className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                                elegirArchivos.current?.click();
                                setHerramientas(false);
                            }}
                            disabled={enviando || !canal.puedoEscribir || Boolean(editando)}
                            aria-label="Adjuntar archivos"
                            title="Imágenes, vídeos o archivos"
                            className={cn(
                                BOTON_DE_HERRAMIENTA,
                                "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                        >
                            <Paperclip className="h-4 w-4" />
                        </Button>
                    </ZonaDeHerramientas>
                    {/* Escondido, y FUERA de la zona: la columna se desmonta al
                        cerrarse, y con el input dentro el diálogo del sistema se
                        llevaría por delante su propio `onChange`. */}
                    <input
                        ref={elegirArchivos}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            elegirLosArchivos(e.target.files);
                            // Sin esto, volver a elegir el MISMO fichero no
                            // dispara `change` y parece que el clip no hace
                            // nada.
                            e.target.value = "";
                        }}
                    />
                    {/* Los emojis se abren sobre el ANCHO DE LA FILA, y cierran
                        la columna en vez de salir dentro de ella. El panel mide
                        300 px y este lateral, en su ancho estrecho, 288: colgado
                        del botón se saldría por el borde DERECHO de la pantalla
                        —que es donde vive el panel— y ahí se recorta, sin que
                        nadie pueda arrastrarlo de vuelta. */}
                    {emojis ? (
                        <div
                            ref={cajaDeEmojis}
                            className="absolute bottom-full left-0 right-0 z-50 mb-2"
                        >
                            <EmojiPickerPanel onSelect={meterElEmoji} />
                        </div>
                    ) : null}
                    {/* La caja se lleva TODO el ancho que queda, y los botones
                        de la derecha van dentro de ella, no al lado. */}
                    <div className="relative min-w-0 flex-1">
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
                                if (
                                    !e.key.startsWith("Arrow") &&
                                    e.key !== "Home" &&
                                    e.key !== "End"
                                )
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
                            onPaste={alPegar}
                            rows={1}
                            placeholder={
                                editando ? "Edita tu mensaje" : "@ para mencionar"
                            }
                            className={cn(
                                "min-h-10 w-full resize-none overflow-y-auto",
                                // El tope va en LÍNEAS y lo pone
                                // `useAltoDeLaCaja`; aquí había un `max-h-40`,
                                // o sea en píxeles, que es el fallo que Chats
                                // ya tenía arreglado.
                                // Y el hueco de la derecha sale de la MISMA
                                // lista que pinta los botones: de más, la
                                // última palabra se corta contra un hueco
                                // vacío; de menos, el texto pasa por debajo.
                                rellenoParaLosBotones(laDerecha),
                            )}
                            disabled={enviando || !canal.puedoEscribir}
                        />
                        {/* Los botones redondos: dictado, nota de voz y
                            enviar. **Cuáles salen y en qué orden lo decide
                            `losBotonesDeLaDerecha`**, que es puro y el mismo
                            que usa Chats — escrito aquí a mano, el dictado
                            llevaba un icono de texto (`Type`, o sea una T) y
                            en la ruta a todo lo ancho salía un solo botón
                            donde en la bandeja salen tres. */}
                        <BotonesDeLaDerecha
                            {...laDerecha}
                            menuAbierto={voz}
                            alAlternarMenu={() => setVoz((v) => !v)}
                            menuRef={cajaDeVoz}
                            menuDeshabilitado={
                                enviando || !canal.puedoEscribir || Boolean(editando)
                            }
                            dictado={
                                dictado.supported
                                    ? {
                                          alPulsar: () => {
                                              dictado.toggle(texto, setTexto);
                                              setVoz(false);
                                          },
                                          deshabilitado:
                                              enviando ||
                                              grabando ||
                                              !canal.puedoEscribir ||
                                              Boolean(editando),
                                          marcado: dictado.listening,
                                          etiqueta: dictado.listening
                                              ? "Dejar de dictar"
                                              : "Dictar por voz",
                                          titulo: dictado.listening
                                              ? "Dictando… pulsa para parar"
                                              : "Dictar por voz (escribe lo que hablas)",
                                          clase: dictado.listening
                                              ? `${BOTON_REDONDO_GRABANDO} animate-pulse`
                                              : undefined,
                                          icono: (
                                              <AudioLines
                                                  className={cn(
                                                      "h-3.5 w-3.5",
                                                      dictado.listening
                                                          ? "text-white"
                                                          : "text-black dark:text-white",
                                                  )}
                                              />
                                          ),
                                      }
                                    : null
                            }
                            nota={{
                                alPulsar: () => {
                                    if (grabando) terminarDeGrabar();
                                    else void empezarAGrabar();
                                    setVoz(false);
                                },
                                deshabilitado:
                                    enviando ||
                                    dictado.listening ||
                                    !canal.puedoEscribir ||
                                    Boolean(editando),
                                marcado: grabando,
                                etiqueta: grabando
                                    ? "Terminar la nota de voz"
                                    : "Grabar una nota de voz",
                                titulo: grabando
                                    ? `Grabando ${comoSeLeeLaDuracion(segundosGrabados)} — pulsa para terminar`
                                    : "Grabar una nota de voz",
                                clase: grabando ? BOTON_REDONDO_GRABANDO : undefined,
                                icono: grabando ? (
                                    <Square className="h-3.5 w-3.5 text-white" />
                                ) : (
                                    <Mic className="h-3.5 w-3.5 text-black dark:text-white" />
                                ),
                            }}
                            enviar={{
                                alPulsar: () => {
                                    if (dictado.listening) dictado.stop();
                                    void enviar(grabada);
                                },
                                deshabilitado:
                                    enviando ||
                                    grabando ||
                                    !canal.puedoEscribir ||
                                    !laDerecha.hayAlgoQueEnviar,
                                etiqueta: "Enviar",
                                clase: BOTON_DE_ENVIAR,
                                icono: enviando ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                ) : (
                                    <Send className="h-3.5 w-3.5 text-white" />
                                ),
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Borrar pregunta, y es un `AlertDialog` y no un `div` con fondo
                oscuro: se cierra con Escape, atrapa el foco dentro y un lector
                de pantalla se entera de que se abrió algo. Un borrado no se
                deshace, así que la pregunta dice lo que se pierde. */}
            <AlertDialog
                open={Boolean(porBorrar)}
                onOpenChange={(v) => {
                    if (!v) setPorBorrar(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar el mensaje?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se borra para todos y no se puede deshacer. En su sitio
                            queda «{LO_QUE_QUEDA_AL_BORRAR}».
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const cual = porBorrar;
                                setPorBorrar(null);
                                if (cual) void borrarElMio(cual.id);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
    const [reunion, setReunion] = useState(false);

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
                        className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40"
                    >
                        <Phone className="h-4 w-4" />
                    </button>
                )}
                {/* La reunión, en CUALQUIER canal y no solo en un directo.
                  *
                  * Es la diferencia con la llamada de al lado: una llamada de
                  * uno a uno necesita «el otro» —por eso solo sale en un
                  * directo—, y una reunión es un sitio al que se entra, así que
                  * un canal de área es justo donde tiene sentido. La puerta de
                  * verdad está en la acción: comprueba que se PERTENECE al
                  * canal, no que se pueda leer. */}
                <button
                    type="button"
                    onClick={() => setReunion(true)}
                    aria-label={`Abrir una reunión en ${canal.nombre}`}
                    title="Reunión de video"
                    className="mr-2 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950/40"
                >
                    <VideoCamara className="h-4 w-4" />
                </button>
                <AbrirReunion
                    canalId={canal.id}
                    nombreDelCanal={canal.nombre}
                    abierto={reunion}
                    onAbierto={setReunion}
                />
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
    yo,
    onCitar,
    onSaltar,
    puedoTranscribir = false,
    onTranscrita,
    puedoReaccionar = false,
    onReaccionar,
    puedoEscribir = false,
    onEditar,
    onBorrar,
    origen = "",
    reuniones,
}: {
    mensaje: MensajeDeEquipo;
    mio: boolean;
    meMencionan: boolean;
    /** El mensaje al que traía el aviso: se señala para encontrarlo de un vistazo. */
    buscado?: boolean;
    nombrePorId: Map<string, string>;
    /** Quién mira. Decide qué chip va marcado y qué se puede tocar. */
    yo: string;
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
    /**
     * Si se puede reaccionar aquí. **Pertenecer, no poder leer**: es el mismo
     * reparto con el que se transcribe, se cuenta lo sin leer y suena el aviso.
     * Un administrador lee los directos de su cuenta y eso no le deja dejar
     * huella dentro de la conversación de otros dos — una reacción la ven los
     * dos y no la puede quitar ninguno.
     */
    puedoReaccionar?: boolean;
    onReaccionar?: (mensajeId: string, emoji: string) => void;
    /** Si esta persona puede escribir en el canal. Editar y borrar lo piden. */
    puedoEscribir?: boolean;
    onEditar?: (m: MensajeDeEquipo) => void;
    onBorrar?: (m: MensajeDeEquipo) => void;
    /**
     * El origen de la plataforma, para saber qué enlace es de dentro.
     *
     * Llega del servidor y no se lee de `window`: esto también se pinta en el
     * servidor y leerlo ahí daría una salida distinta en cada lado.
     */
    origen?: string;
    /** Cómo se llama cada reunión nombrada en el hilo, por su código. */
    reuniones?: Record<string, { titulo: string | null; abierta: boolean; dentro: number }>;
}) {
    const [reaccionando, setReaccionando] = useState(false);
    const [masEmojis, setMasEmojis] = useState(false);
    const quien = mensaje.autorNombre?.trim() || nombrePorId.get(mensaje.autorId) || "Alguien";
    const borrado = Boolean(mensaje.borradoEn);
    const sePuedeTocar = { autorId: mensaje.autorId, borradoEn: mensaje.borradoEn, llamada: mensaje.llamada };
    const editable = sePuedeEditar({ mensaje: sePuedeTocar, yo, puedoEscribir });
    const borrable = sePuedeBorrar({ mensaje: sePuedeTocar, yo, puedoEscribir });
    const reacciones = mensaje.reacciones ?? [];
    // Las direcciones de reunión salen del texto y se pintan como tarjeta.
    // Se calcula una vez por burbuja: la conversación se repinta con cada
    // mensaje que entra, y esto recorre el texto entero.
    const { texto: sinReuniones, codigosDeReunion } = useMemo(() => {
        const { texto, codigos } = apartarLasReuniones(mensaje.texto, origen);
        return { texto, codigosDeReunion: codigos };
    }, [mensaje.texto, origen]);
    /** Quién reaccionó, con nombres. Es el detalle que pide el encargo. */
    const comoSeLeeQuienes = (r: ReaccionDeMensaje) =>
        r.quienes
            .map((id) => (id === yo ? "Tú" : nombrePorId.get(id) || "Alguien"))
            .join(", ");
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
            // El `group` es la BURBUJA ENTERA, no la línea del nombre y la
            // hora. Ahí era una franja de doce píxeles de alto: había que
            // acertarle con el cursor para que salieran «responder», «editar»
            // y «eliminar», así que desde fuera se lee como que el chat de
            // equipo no deja editar. En Chats el `group` es la fila completa
            // del mensaje desde siempre (`MessageBubble`).
            className={`group flex flex-col gap-1 ${mio ? "items-end" : "items-start"}`}
        >
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{mio ? "Tú" : quien}</span>
                <span>{hora}</span>
                {/* Que se sepa que se tocó. Sin la marca, un mensaje que
                    dice algo distinto de lo que se leyó ayer no tiene
                    explicación, y eso vale para todos menos para quien lo
                    editó. */}
                {mensaje.editadoEn && !borrado ? (
                    <span className="italic opacity-70">editado</span>
                ) : null}
                {/* Las acciones salen al posar el cursor, como las de una
                    tarjeta, y **no hacen falta fuera del flujo**: son dos
                    iconos pequeños en una fila que ya tiene sitio de sobra. En
                    táctil no hay cursor que posar, así que van siempre
                    puestas ahí (`max-md:opacity-100`) — esconderlas detrás de
                    un gesto que no existe es no tenerlas. */}
                {!borrado && (puedoReaccionar || onCitar || editable || borrable) ? (
                    <span className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                        {puedoReaccionar ? (
                            <Popover
                                open={reaccionando}
                                onOpenChange={(v) => {
                                    setReaccionando(v);
                                    if (!v) setMasEmojis(false);
                                }}
                            >
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        aria-label="Reaccionar"
                                        title="Reaccionar"
                                        className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                                    >
                                        <SmilePlus className="h-3.5 w-3.5" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    align={mio ? "end" : "start"}
                                    className="w-auto p-1"
                                >
                                    {masEmojis ? (
                                        <EmojiPickerPanel
                                            onSelect={(e) => {
                                                onReaccionar?.(mensaje.id, e);
                                                setMasEmojis(false);
                                                setReaccionando(false);
                                            }}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-0.5">
                                            {EMOJIS_RAPIDOS.map((e) => (
                                                <button
                                                    key={e}
                                                    type="button"
                                                    onClick={() => {
                                                        onReaccionar?.(mensaje.id, e);
                                                        setReaccionando(false);
                                                    }}
                                                    aria-label={`Reaccionar con ${e}`}
                                                    className="rounded p-1 text-lg leading-none hover:bg-muted"
                                                >
                                                    {e}
                                                </button>
                                            ))}
                                            {/* Los seis de un toque, y el resto
                                                detrás del «+»: una rejilla de
                                                trescientos convierte un gesto
                                                en una decisión. */}
                                            <button
                                                type="button"
                                                onClick={() => setMasEmojis(true)}
                                                aria-label="Más emojis"
                                                title="Más emojis"
                                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </PopoverContent>
                            </Popover>
                        ) : null}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Acciones del mensaje"
                                    title="Acciones"
                                    className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                                >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={mio ? "end" : "start"}>
                                {onCitar ? (
                                    <DropdownMenuItem onClick={() => onCitar(mensaje)}>
                                        Responder
                                    </DropdownMenuItem>
                                ) : null}
                                {editable ? (
                                    <DropdownMenuItem onClick={() => onEditar?.(mensaje)}>
                                        Editar
                                    </DropdownMenuItem>
                                ) : null}
                                {borrable ? (
                                    <DropdownMenuItem
                                        onClick={() => onBorrar?.(mensaje)}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        Eliminar
                                    </DropdownMenuItem>
                                ) : null}
                                {/* Quién reaccionó, con nombres. El `title` del
                                    chip lo dice también, pero en táctil no hay
                                    cursor que posar: sin esto, el detalle solo
                                    existe con ratón. */}
                                {reacciones.length ? (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                            Quién reaccionó
                                        </DropdownMenuLabel>
                                        {reacciones.map((r) => (
                                            <div
                                                key={r.emoji}
                                                className="flex max-w-[16rem] gap-2 px-2 py-1 text-xs"
                                            >
                                                <span className="shrink-0">{r.emoji}</span>
                                                <span className="min-w-0 break-words text-muted-foreground">
                                                    {comoSeLeeQuienes(r)}
                                                </span>
                                            </div>
                                        ))}
                                    </>
                                ) : null}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </span>
                ) : null}
            </div>
            <div
                className={[
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm",
                    borrado
                        ? "border-dashed border-border bg-transparent italic text-muted-foreground"
                        : mio
                          ? "border-primary/30 bg-primary/10"
                          : "border-border bg-muted/40",
                    // Una mención se ve sin leer el texto: es lo que hace que
                    // volver al hilo desde el aviso valga para algo.
                    meMencionan && !borrado ? "ring-2 ring-amber-400/60" : "",
                    // Y el que traía el aviso, además, señalado: en un canal
                    // con tráfico la mención puede no ser la única resaltada.
                    buscado ? "ring-2 ring-primary ring-offset-2" : "",
                ].join(" ")}
            >
                {/* Borrado: la fila se queda, el contenido no. La fila tiene que
                    quedarse porque si desapareciera el hilo tendría un hueco sin
                    explicación —y una cita que apunta aquí se quedaría hablando
                    con nadie—; el contenido no puede quedarse porque entonces
                    «borrar» sería esconderlo, y seguiría viajando al navegador
                    de todos. Lo que llega ya viene vacío de la base: esto solo
                    lo pinta. */}
                {borrado ? (
                    <span className="inline-flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        {LO_QUE_QUEDA_AL_BORRAR}
                    </span>
                ) : (
                    <>
                    {/* La cita va DENTRO de la burbuja y encima del texto: es
                        contexto de esta respuesta, no un mensaje aparte. Fuera se
                        leería como dos mensajes seguidos. */}
                    {mensaje.cita ? (
                        <RecuadroDeCita cita={mensaje.cita} onSaltar={onSaltar} />
                    ) : null}
                    {/* El adjunto va ARRIBA y el texto debajo: el texto es el pie
                        de lo que se manda, no al revés. Es lo que hace cualquier
                        mensajería y lo que ya hace la nota de voz aquí al lado. */}
                    {mensaje.adjunto ? <Adjunto adjunto={mensaje.adjunto} /> : null}
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
                    {/* Con las marcas ya pintadas, no en crudo. El botón de formato
                        escribe `*negrilla*` en la caja, así que sin esto se leería
                        el asterisco: un botón que produce algo que se ve roto es
                        peor que no tenerlo. Es el mismo componente que la burbuja
                        de Chats.

                        Y con los enlaces pulsables, que en Chats van apagados a
                        propósito: allí el texto lo escribe un contacto de
                        WhatsApp que puede ser cualquiera, y convertir en un
                        clic el enlace de un desconocido es una decisión de
                        producto, no un detalle de pintado. */}
                    <TextoConFormato texto={sinReuniones} enlaces origen={origen} />
                    {/* La reunión, como tarjeta y no como ochenta caracteres
                        de `base64url` ocupando tres renglones. */}
                    {codigosDeReunion.map((codigo) => (
                        <TarjetaDeReunion
                            key={codigo}
                            codigo={codigo}
                            titulo={reuniones?.[codigo]?.titulo}
                            abierta={reuniones?.[codigo]?.abierta}
                            dentro={reuniones?.[codigo]?.dentro}
                        />
                    ))}
                    </>
                )}
            </div>
            {/* Los chips van FUERA de la burbuja, colgando de su borde: dentro
                se leerían como parte de lo que se escribió. Y son botones —
                pulsar el de alguien es ponerse uno mismo, que es como se
                reacciona en cualquier sitio y ahorra abrir el menú. */}
            {!borrado && reacciones.length ? (
                <div
                    className={`-mt-1.5 flex max-w-[85%] flex-wrap gap-1 ${
                        mio ? "justify-end" : ""
                    }`}
                >
                    {reacciones.map((r) => (
                        <button
                            key={r.emoji}
                            type="button"
                            onClick={
                                puedoReaccionar
                                    ? () => onReaccionar?.(mensaje.id, r.emoji)
                                    : undefined
                            }
                            disabled={!puedoReaccionar}
                            title={comoSeLeeQuienes(r)}
                            aria-label={`${r.emoji} — ${comoSeLeeQuienes(r)}`}
                            className={[
                                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none",
                                r.mia
                                    ? "border-primary/50 bg-primary/15 text-foreground"
                                    : "border-border bg-muted/60 text-muted-foreground",
                                puedoReaccionar ? "hover:bg-muted" : "cursor-default",
                            ].join(" ")}
                        >
                            <span className="text-sm leading-none">{r.emoji}</span>
                            <span className="tabular-nums">{r.quienes.length}</span>
                        </button>
                    ))}
                </div>
            ) : null}
            {mensaje.chat && !borrado ? <TarjetaDeChat chat={mensaje.chat} /> : null}
        </div>
    );
}

/**
 * El adjunto de un mensaje: la vista previa, el vídeo en línea y la descarga.
 *
 * Lo que se pinta lo decide `laClaseDelAdjunto`, que es **pura y la misma que
 * usa el servidor**. Con una segunda regla aquí —mirar la extensión a ojo,
 * por ejemplo— habría dos formas de clasificar el mismo fichero y un día no
 * dirían lo mismo: un vídeo pintado como fichero se ve como que la función no
 * funciona, y nadie sabría por qué solo a veces.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El vídeo va con `preload="metadata"`**, no `auto`. Un hilo con diez
 *    vídeos y `auto` se descarga diez vídeos al abrir el canal, y esta pantalla
 *    se refresca **cada cinco segundos**.
 * 2. **Descargar es un enlace normal**, con `target="_blank"`. El bucket es
 *    otro origen, así que el atributo `download` lo ignora el navegador: lo
 *    honesto es abrirlo y que cada quien lo guarde, no prometer una descarga
 *    que no ocurre.
 * 3. **El nombre se recorta por el MEDIO** (`comoSeLeeElNombre`), conservando
 *    la extensión: recortando por el final, tres ficheros del mismo cliente se
 *    ven iguales y además se pierde de qué tipo son.
 */
function Adjunto({ adjunto }: { adjunto: AdjuntoDelEquipo }) {
    const clase = laClaseDelAdjunto(adjunto);
    const nombre = comoSeLeeElNombre(adjunto.nombre);

    if (clase === "imagen") {
        return (
            <div className="mb-1">
                <a href={adjunto.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={adjunto.url}
                        alt={adjunto.nombre}
                        loading="lazy"
                        className="max-h-72 w-auto max-w-full rounded-md border border-border object-contain"
                    />
                </a>
                <PieDelAdjunto adjunto={adjunto} nombre={nombre} />
            </div>
        );
    }

    if (clase === "video") {
        return (
            <div className="mb-1">
                <video
                    src={adjunto.url}
                    controls
                    preload="metadata"
                    className="max-h-72 w-full rounded-md border border-border bg-black"
                />
                <PieDelAdjunto adjunto={adjunto} nombre={nombre} />
            </div>
        );
    }

    return (
        <a
            href={adjunto.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1 flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 hover:bg-muted"
        >
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{nombre}</span>
                {adjunto.tamano > 0 ? (
                    <span className="block text-[11px] text-muted-foreground">
                        {comoSeLeeElTamano(adjunto.tamano)}
                    </span>
                ) : null}
            </span>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
        </a>
    );
}

/** El nombre, el peso y la descarga debajo de una imagen o de un vídeo. */
function PieDelAdjunto({
    adjunto,
    nombre,
}: {
    adjunto: AdjuntoDelEquipo;
    nombre: string;
}) {
    return (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{nombre}</span>
            {adjunto.tamano > 0 ? (
                <span className="shrink-0 tabular-nums">
                    {comoSeLeeElTamano(adjunto.tamano)}
                </span>
            ) : null}
            <a
                href={adjunto.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Descargar ${adjunto.nombre}`}
                title="Descargar"
                className="shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"
            >
                <Download className="h-3.5 w-3.5" />
            </a>
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
                <TextoConFormato texto={cita.extracto} />
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
    return subirAlBucket(comoArchivoDeAudio(grabada), quienGraba);
}

/**
 * Subir un archivo adjunto, por la MISMA ruta y con la misma función.
 *
 * Una nota de voz es un archivo más: lo único que cambia es de dónde sale el
 * `File`. Con dos funciones —una para la nota y otra para el adjunto—, el día
 * que se afine la carpeta, el aviso o cómo se lee la respuesta se afina en una
 * y la otra se queda atrás, que no se ve como un error sino como «a veces no
 * sube».
 */
async function subirElArchivo(
    archivo: File,
    quienSube: string | null,
): Promise<string | null> {
    return subirAlBucket(archivo, quienSube);
}

async function subirAlBucket(
    archivo: File,
    quienSube: string | null,
): Promise<string | null> {
    if (!quienSube) return null;
    try {
        const cuerpo = new FormData();
        cuerpo.append("file", archivo);
        cuerpo.append("userID", quienSube);
        cuerpo.append("workflowID", "chat-equipo");

        const res = await fetch("/api/upload", { method: "POST", body: cuerpo });
        if (!res.ok) {
            console.warn("[chat-equipo] no se pudo subir un archivo", {
                estado: res.status,
                nombre: archivo.name,
            });
            return null;
        }
        const datos = (await res.json()) as { url?: string };
        return datos.url?.trim() || null;
    } catch (error) {
        console.warn("[chat-equipo] falló la subida de un archivo", error);
        return null;
    }
}
