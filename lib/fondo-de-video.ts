/**
 * Desenfocar o sustituir el fondo de la propia cámara.
 *
 * No es un hook a propósito: lo posee `useMediosDeLlamada`, que es quien tiene
 * la pista de la cámara y quien decide **cuál** se manda. Metido en un hook
 * aparte habría dos sitios decidiendo qué pista viaja por las seis conexiones
 * de la malla, y eso no se ve como un error: se ve como que a veces se manda la
 * cámara sin desenfocar.
 *
 * # Cómo funciona, en tres pasos
 *
 * 1. Un modelo separa a la persona del resto de la imagen y devuelve una
 *    **máscara**: blanco donde está la persona, negro donde el fondo.
 * 2. Sobre un `<canvas>` se pinta la máscara, se recorta la imagen con ella
 *    (`source-in`) y **debajo** (`destination-over`) se pone el fondo que toque
 *    — la misma imagen desenfocada, o un degradado.
 * 3. Del canvas sale una pista nueva (`captureStream`) que es la que se manda.
 *
 * La conexión no se entera de nada: es un `replaceTrack` dentro de una
 * conexión ya negociada, igual que compartir pantalla. **No se renegocia nada**,
 * que es la regla de la que cuelga toda esta parte.
 *
 * # Por qué el modelo se sirve desde aquí y no desde un CDN
 *
 * Son 6 MB que copia `scripts/vendorizar-segmentacion.mjs` a `public/` en cada
 * build, con la versión pinada en el lockfile. Pidiéndolos a jsdelivr, el día
 * que la red de una oficina no deje salir el botón dejaría de funcionar sin
 * nada que mirar — que es exactamente el caso que ya preocupa con TURN.
 *
 * **Y no se carga hasta que alguien lo pulsa.** Quien nunca toca el botón no
 * descarga un byte: no está en el paquete de JavaScript, son ficheros estáticos
 * que se piden a mano.
 *
 * # Lo que cuesta, dicho antes de que sorprenda
 *
 * Segmentar son unos milisegundos de CPU por fotograma. En un portátil normal
 * no se nota; en una máquina justa, con cuatro personas en la reunión, sí — y
 * por eso esto **se enciende a mano y nunca solo**. Si el navegador no puede
 * con ello, se apaga y se dice, que es mejor que una reunión a tirones sin
 * explicación.
 */

export const MODOS_DE_FONDO = ["ninguno", "desenfoque", "fondo"] as const;
export type ModoDeFondo = (typeof MODOS_DE_FONDO)[number];

export function esUnModoDeFondo(v: unknown): v is ModoDeFondo {
    return typeof v === "string" && (MODOS_DE_FONDO as readonly string[]).includes(v);
}

/** Dónde se recuerda, como el tamaño de la ventana y la distribución. */
export const LLAVE_DEL_FONDO = "reunion:fondo";
/**
 * Y qué fondo de serie estaba puesto, aparte del modo.
 *
 * Solo los presets se recuerdan entre reuniones: una imagen subida no cabe en
 * `localStorage` sin convertirla en un data-URL enorme, así que esa dura lo que
 * la pestaña. Es la misma línea que separa lo barato de recordar de lo que no.
 */
export const LLAVE_DEL_FONDO_ID = "reunion:fondo-id";

/**
 * A cuántos fotogramas por segundo sale la pista procesada.
 *
 * Veinticuatro y no treinta: cada fotograma es una pasada del modelo más un
 * pintado de canvas, y a treinta se nota en una máquina justa sin que la imagen
 * se vea mejor. Es cine, y para una cara hablando sobra.
 */
export const FOTOGRAMAS = 24;

/**
 * Cuánto se desenfoca el fondo.
 *
 * En píxeles de la imagen de origen (1280×720), no de lo que se ve. Doce deja
 * el fondo irreconocible —que es para lo que está— sin convertirlo en una
 * mancha de color, que es lo que pasa pasando de veinte.
 */
export const DESENFOQUE_PX = 12;

/**
 * Los fondos de sustitución que se ofrecen de serie.
 *
 * Son **degradados dibujados**, no fotos: una foto sería otro fichero que
 * servir, otra cosa que cargar antes del primer fotograma y otra dirección que
 * validar. Un degradado se pinta en dos líneas, no pesa nada y hace lo que se
 * le pide —tapar la habitación—, y la MISMA lista de colores sirve para el
 * lienzo (`dibujarFondoPreset`) y para la pastilla del menú (`swatchDeFondo`),
 * así que el chip que se elige y lo que se ve no pueden discrepar.
 *
 * `gris` es el que había antes (`#1e293b`→`#0f172a`), así que quien ya lo usaba
 * no ve ningún cambio.
 */
export type FondoPreset = {
    id: string;
    nombre: string;
    /** De dónde a dónde va el degradado. */
    colores: readonly [string, string];
    /** Radial (un foco centrado) en vez de diagonal. */
    radial?: boolean;
};

export const FONDOS_POR_DEFECTO: readonly FondoPreset[] = [
    { id: "gris", nombre: "Gris", colores: ["#1e293b", "#0f172a"] },
    { id: "azul", nombre: "Azul", colores: ["#0ea5e9", "#1e3a8a"] },
    { id: "verde", nombre: "Verde", colores: ["#10b981", "#065f46"] },
    { id: "calido", nombre: "Cálido", colores: ["#f59e0b", "#b45309"] },
    { id: "violeta", nombre: "Violeta", colores: ["#8b5cf6", "#4c1d95"] },
    { id: "foco", nombre: "Foco", colores: ["#334155", "#0b1120"], radial: true },
];

/** El preset de un id, o el primero si el id no se reconoce (nunca `undefined`). */
export function fondoPresetPorId(id: string | undefined | null): FondoPreset {
    return FONDOS_POR_DEFECTO.find((f) => f.id === id) ?? FONDOS_POR_DEFECTO[0];
}

/** El CSS del degradado para la pastilla del menú, del mismo par de colores. */
export function swatchDeFondo(p: FondoPreset): string {
    const [a, b] = p.colores;
    return p.radial
        ? `radial-gradient(circle at 50% 40%, ${a}, ${b})`
        : `linear-gradient(135deg, ${a}, ${b})`;
}

/**
 * Qué fondo de sustitución se está usando: uno de serie, o una imagen subida.
 *
 * La imagen viaja como `CanvasImageSource` (un `ImageBitmap`), no como una
 * dirección: lo que se pinta en el lienzo es un mapa de bits, y guardarla como
 * URL obligaría a volver a descargarla en cada fotograma.
 */
export type FondoElegido =
    | { tipo: "preset"; id: string }
    | { tipo: "imagen"; imagen: CanvasImageSource; nombre?: string };

/**
 * Tope de la imagen que se sube, en bytes.
 *
 * No es un límite técnico del lienzo —cabe una foto de móvil de sobra— sino de
 * cordura: una imagen de 40 MB tarda en decodificarse y no se ve mejor una vez
 * puesta de fondo detrás de una persona. Se comprueba ANTES de decodificar,
 * para poder decirlo en vez de colgar el navegador.
 */
export const TOPE_DE_IMAGEN_DE_FONDO = 12 * 1024 * 1024;

/**
 * Cargar la imagen que sube la persona, para usarla de fondo.
 *
 * **Lanza con un motivo legible** en vez de devolver algo roto: no es una
 * imagen, o pesa demasiado, o el navegador no la pudo decodificar. Quien llama
 * lo enseña; nunca se pinta un fondo a medias.
 */
export async function cargarImagenDeFondo(file: File): Promise<ImageBitmap> {
    if (!file.type.startsWith("image/")) {
        throw new Error("Ese archivo no es una imagen.");
    }
    if (file.size > TOPE_DE_IMAGEN_DE_FONDO) {
        throw new Error("La imagen es demasiado grande (máximo 12 MB).");
    }
    try {
        return await createImageBitmap(file);
    } catch {
        throw new Error("No se pudo leer la imagen.");
    }
}

type Segmentador = {
    setOptions(o: { modelSelection: number; selfieMode?: boolean }): void;
    onResults(cb: (r: { image: CanvasImageSource; segmentationMask: CanvasImageSource }) => void): void;
    send(input: { image: HTMLVideoElement }): Promise<void>;
    close(): Promise<void>;
    initialize?(): Promise<void>;
};

type ConElSegmentador = typeof globalThis & {
    SelfieSegmentation?: new (o: { locateFile: (f: string) => string }) => Segmentador;
};

/** De dónde salen los seis ficheros. Una constante, no tres cadenas sueltas. */
const CARPETA = "/segmentacion";

/**
 * Cargar el cargador, **una sola vez por pestaña**.
 *
 * Se guarda la PROMESA y no el resultado: dos pulsaciones seguidas del botón
 * —o dos reuniones abiertas en la misma pestaña— compartirían una sola descarga
 * en vez de lanzar dos de 6 MB. Es el mismo patrón que la caché de sesión.
 */
let cargando: Promise<ConElSegmentador["SelfieSegmentation"]> | null = null;

function cargarElSegmentador(): Promise<ConElSegmentador["SelfieSegmentation"]> {
    if (cargando) return cargando;
    cargando = new Promise((listo, fallo) => {
        const global = globalThis as ConElSegmentador;
        if (global.SelfieSegmentation) {
            listo(global.SelfieSegmentation);
            return;
        }
        const script = document.createElement("script");
        script.src = `${CARPETA}/selfie_segmentation.js`;
        script.async = true;
        script.onload = () => {
            const clase = (globalThis as ConElSegmentador).SelfieSegmentation;
            if (clase) listo(clase);
            else fallo(new Error("el segmentador se cargó y no se registró"));
        };
        script.onerror = () => {
            // Y se olvida el intento: un fallo de red no puede dejar el botón
            // muerto para el resto de la sesión. La próxima vez se reintenta.
            cargando = null;
            fallo(new Error("no se pudo descargar el segmentador"));
        };
        document.head.appendChild(script);
    });
    return cargando;
}

/**
 * El fondo de la propia cámara: enciende, apaga y entrega la pista que toca.
 *
 * Una clase y no un puñado de funciones porque esto tiene **estado con ciclo de
 * vida**: un modelo cargado, un `<video>` oculto, un canvas y un bucle. Repartir
 * eso en funciones sueltas obliga a pasarse los cuatro trozos en cada llamada,
 * y el día que uno se quede sin soltar se queda una cámara encendida y un bucle
 * corriendo sobre una reunión que ya terminó.
 */
export class ElFondoDeVideo {
    private segmentador: Segmentador | null = null;
    private video: HTMLVideoElement | null = null;
    private lienzo: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private salida: MediaStream | null = null;
    private corriendo = false;
    private origen: MediaStreamTrack | null = null;
    private modo: ModoDeFondo = "ninguno";
    /** Qué fondo de sustitución se pinta cuando `modo === "fondo"`. */
    private fondoElegido: FondoElegido | null = null;
    /** Para no solapar dos `send()`: el modelo no admite dos a la vez. */
    private ocupado = false;
    private reloj: number | null = null;

    get encendido(): boolean {
        return this.corriendo;
    }

    /**
     * Encender el fondo sobre una pista de cámara.
     *
     * Devuelve la pista **procesada**, que es la que hay que mandar. Si algo
     * falla —el modelo no carga, el navegador no puede con el wasm— **lanza**,
     * y quien llama se queda con la pista de siempre: es preferible mandar la
     * cámara sin desenfocar que no mandar nada.
     */
    async encender(
        pista: MediaStreamTrack,
        modo: ModoDeFondo,
        fondo?: FondoElegido,
    ): Promise<MediaStreamTrack> {
        if (modo === "ninguno") throw new Error("«ninguno» se apaga, no se enciende");

        // Cambiar de desenfoque a fondo —o de un fondo a otro— con el bucle ya
        // corriendo es cambiar dos variables: ni se recarga el modelo ni se
        // rehace la pista, así que la otra punta no ve ni un parpadeo. Por eso
        // elegir otro fondo, o subir una imagen, es instantáneo.
        if (this.corriendo && this.origen === pista) {
            this.modo = modo;
            if (modo === "fondo" && fondo) this.fondoElegido = fondo;
            const ya = this.salida?.getVideoTracks()[0];
            if (ya) return ya;
        }

        this.apagar();

        const Clase = await cargarElSegmentador();
        if (!Clase) throw new Error("no hay segmentador");

        const ajustes = pista.getSettings();
        const ancho = ajustes.width ?? 1280;
        const alto = ajustes.height ?? 720;

        // El `<video>` oculto es lo que se le da de comer al modelo: necesita un
        // elemento que se pueda dibujar, y una pista suelta no lo es. No se
        // añade al documento —`playsInline` y `muted` bastan para que reproduzca
        // — así que no ocupa ni se ve.
        const video = document.createElement("video");
        video.srcObject = new MediaStream([pista]);
        video.muted = true;
        video.playsInline = true;
        await video.play();

        const lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto;
        const ctx = lienzo.getContext("2d");
        if (!ctx) throw new Error("el navegador no da contexto 2D");

        const segmentador = new Clase({ locateFile: (f) => `${CARPETA}/${f}` });
        // `modelSelection: 1` es el modelo apaisado, que es el que se copia:
        // segmenta fotogramas anchos sin recortar, que es lo que son los de una
        // cámara. Con el 0 habría que mandarle un cuadrado y se perdería a quien
        // esté a un lado de la imagen.
        segmentador.setOptions({ modelSelection: 1 });
        segmentador.onResults((r) => this.pintar(r));

        this.segmentador = segmentador;
        this.video = video;
        this.lienzo = lienzo;
        this.ctx = ctx;
        this.origen = pista;
        this.modo = modo;
        // Si se enciende en modo fondo sin decir cuál, se cae al primero de
        // serie: un fondo sin elegir no puede quedarse sin pintar nada.
        this.fondoElegido =
            modo === "fondo"
                ? (fondo ??
                  this.fondoElegido ?? { tipo: "preset", id: FONDOS_POR_DEFECTO[0].id })
                : null;
        this.corriendo = true;

        this.salida = lienzo.captureStream(FOTOGRAMAS);
        const procesada = this.salida.getVideoTracks()[0];
        if (!procesada) {
            this.apagar();
            throw new Error("el canvas no dio pista de video");
        }

        // El bucle va con `setInterval` y NO con `requestAnimationFrame`: con
        // la pestaña de fondo el navegador para los fotogramas, y entonces la
        // cámara de quien está compartiendo se congelaría para todos los demás
        // en cuanto mirara otra pestaña. `setInterval` también se ralentiza,
        // pero no se para.
        this.reloj = window.setInterval(() => void this.unFotograma(), 1000 / FOTOGRAMAS);

        return procesada;
    }

    /**
     * Apagar y soltarlo todo.
     *
     * Idempotente a propósito: lo llaman el botón, el cambio de cámara, salir
     * de la reunión y el desmontaje. Con un camino que no suelte, queda un
     * bucle pintando sobre una reunión que terminó y un modelo ocupando memoria.
     */
    apagar(): void {
        this.corriendo = false;
        if (this.reloj !== null) {
            window.clearInterval(this.reloj);
            this.reloj = null;
        }
        // La pista de salida se PARA: es la que estaba viajando, y dejarla viva
        // deja a la otra punta mirando el último fotograma congelado.
        this.salida?.getTracks().forEach((t) => t.stop());
        this.salida = null;
        if (this.video) {
            this.video.srcObject = null;
            this.video = null;
        }
        // El modelo se cierra aparte y sin esperarlo: tarda, y quien apaga el
        // fondo quiere ver su cámara normal YA. Que falle no importa — lo que
        // importaba, el bucle y la pista, ya está suelto.
        const segmentador = this.segmentador;
        this.segmentador = null;
        void segmentador?.close().catch(() => {
            // Cerrar uno que ya se cerró no es un error que nadie tenga que ver.
        });
        this.lienzo = null;
        this.ctx = null;
        this.origen = null;
        this.modo = "ninguno";
        this.fondoElegido = null;
        this.ocupado = false;
    }

    private async unFotograma(): Promise<void> {
        if (!this.corriendo || this.ocupado) return;
        const video = this.video;
        const segmentador = this.segmentador;
        if (!video || !segmentador) return;
        // Un `<video>` que todavía no tiene fotograma da un error al dibujarlo,
        // y en un bucle eso son veinticuatro errores por segundo en la consola.
        if (!video.videoWidth || !video.videoHeight) return;
        this.ocupado = true;
        try {
            await segmentador.send({ image: video });
        } catch (error) {
            // Un fotograma que falla no apaga el fondo: el siguiente puede ir
            // bien. Lo que sí se hace es decirlo una vez — mudo, un fondo que
            // deja de actualizarse se ve como una cámara congelada.
            console.warn("[fondo] un fotograma no se pudo segmentar", error);
        } finally {
            this.ocupado = false;
        }
    }

    /**
     * Componer el fotograma: la persona recortada encima del fondo que toque.
     *
     * **El orden de las tres operaciones es el truco entero** y no es
     * intercambiable:
     *
     * 1. Se pinta la **máscara** sola.
     * 2. `source-in` pinta la imagen **solo donde la máscara era opaca**, o sea
     *    recorta a la persona.
     * 3. `destination-over` pinta el fondo **debajo de lo que ya hay**, que es
     *    lo único que deja meterlo sin tapar a la persona.
     *
     * Hecho al revés —fondo primero, persona encima con `source-over`— haría
     * falta una segunda pasada para recortar, o sea un canvas más por fotograma.
     */
    private pintar(r: { image: CanvasImageSource; segmentationMask: CanvasImageSource }): void {
        const ctx = this.ctx;
        const lienzo = this.lienzo;
        if (!ctx || !lienzo || !this.corriendo) return;

        const { width: w, height: h } = lienzo;
        ctx.save();
        ctx.clearRect(0, 0, w, h);

        ctx.globalCompositeOperation = "source-over";
        ctx.filter = "none";
        ctx.drawImage(r.segmentationMask, 0, 0, w, h);

        ctx.globalCompositeOperation = "source-in";
        ctx.drawImage(r.image, 0, 0, w, h);

        ctx.globalCompositeOperation = "destination-over";
        if (this.modo === "desenfoque") {
            // El desenfoque lo hace el CANVAS, no una segunda pasada del
            // modelo: `filter` es una propiedad del contexto y la acelera el
            // navegador. Calcularlo a mano sobre los píxeles costaría más que
            // segmentar.
            ctx.filter = `blur(${DESENFOQUE_PX}px)`;
            ctx.drawImage(r.image, 0, 0, w, h);
            ctx.filter = "none";
        } else {
            this.pintarElFondo(ctx, w, h);
        }
        ctx.restore();
    }

    /**
     * El fondo de sustitución: un degradado de serie, o la imagen que se subió.
     *
     * La imagen se pinta **cubriendo** (`cover`): se escala al mayor de los dos
     * lados y se centra, así que llena el recuadro sin deformarse y sin dejar
     * franjas — lo mismo que hace `object-cover` en una foto de la web. Un
     * `contain` dejaría bandas de color a los lados, que se leen como que el
     * fondo está mal puesto.
     */
    private pintarElFondo(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        const elegido = this.fondoElegido;
        if (elegido?.tipo === "imagen") {
            this.dibujarImagenCubriendo(ctx, elegido.imagen, w, h);
            return;
        }
        const preset = fondoPresetPorId(elegido?.tipo === "preset" ? elegido.id : undefined);
        dibujarFondoPreset(ctx, w, h, preset);
    }

    private dibujarImagenCubriendo(
        ctx: CanvasRenderingContext2D,
        imagen: CanvasImageSource,
        w: number,
        h: number,
    ): void {
        // `ImageBitmap` y `HTMLImageElement` traen `width`/`height` numéricos.
        const iw = (imagen as { width?: number }).width ?? w;
        const ih = (imagen as { height?: number }).height ?? h;
        if (!iw || !ih) {
            // Sin dimensiones no se puede cubrir sin deformar: se cae a un
            // degradado en vez de dibujar algo estirado.
            dibujarFondoPreset(ctx, w, h, FONDOS_POR_DEFECTO[0]);
            return;
        }
        const escala = Math.max(w / iw, h / ih);
        const dw = iw * escala;
        const dh = ih * escala;
        ctx.drawImage(imagen, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
}

/** Pinta un preset en el lienzo, del mismo par de colores que su pastilla. */
function dibujarFondoPreset(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    preset: FondoPreset,
): void {
    const [a, b] = preset.colores;
    const d = preset.radial
        ? ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h))
        : ctx.createLinearGradient(0, 0, w, h);
    d.addColorStop(0, a);
    d.addColorStop(1, b);
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, w, h);
}
