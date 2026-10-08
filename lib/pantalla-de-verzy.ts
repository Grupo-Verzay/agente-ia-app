/**
 * Lo que Verzy puede ENSEÑAR en la videollamada: pantallas reales de la cuenta
 * «Verzay Ventas», navegadas en vivo por el servidor (ver
 * `lib/pantalla-de-verzy.server.ts`).
 *
 * Puro: lo usan el servidor, la sala, el contexto del avatar y el banco.
 *
 * LA NAVEGACIÓN LA DECIDE EL PROMPT, NO EL CÓDIGO. Aquí no hay ninguna tabla
 * de páginas, ningún atajo, ningún «tema → pantalla» ni ningún momento del
 * guion atado a una ruta. El modelo elige la URL leyendo el entrenamiento de
 * Videollamadas que escribe el dueño, y el código solo la SANEA (que sea una
 * dirección de la plataforma y no algo que la saque de su sesión) y la carga.
 */

/** Prefijos que NO son una pantalla, o que sacarían a Verzy de su sesión. Es seguridad, no navegación. */
export const RUTAS_PROHIBIDAS = ["/api", "/_next", "/login", "/register", "/logout", "/auth", "/videollamada", "/reunion", "/abrir"] as const;

/**
 * Donde se ven los precios: la sección de planes de la landing. La vista de
 * planes de dentro de la plataforma (`/planes`, con sesión) ya no existe: lleva
 * aquí. Verzy, si pide «/planes» a secas, aterriza aquí directo, sin pasar por
 * la redirección (que dibujaba un salto en la pantalla compartida).
 */
export const LOS_PRECIOS_DE_LA_LANDING = "/inicio#pricing";

/** Tope del largo de una ruta, para que no se cuele cualquier cosa. */
export const TOPE_DE_LA_RUTA = 300;

/** Una dirección de la plataforma: camino, consulta y ancla, siempre empezando por «/». */
export type LugarDeVerzy = `/${string}`;

/**
 * La URL que pidió el modelo, saneada a una ruta de la plataforma, o `null`
 * si no se puede cargar. De una dirección completa («https://dominio/planes»)
 * se queda con la ruta, la consulta y el ancla: el dominio lo pone el servidor.
 * No traduce nada ni completa nada: lo que se carga es lo que se pidió.
 */
export function comoRutaDeVerzy(valor: unknown): LugarDeVerzy | null {
    let v = String(valor ?? "").trim();
    if (!v || v.length > TOPE_DE_LA_RUTA) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return null; // javascript:, mailto:…
    if (v.startsWith("//")) return null;
    if (/^https?:\/\//i.test(v)) {
        try {
            const u = new URL(v);
            v = `${u.pathname}${u.search}${u.hash}`;
        } catch {
            return null;
        }
    } else if (!v.startsWith("/")) {
        return null;
    }
    if (/\s/.test(v) || v.includes("\\") || v.includes("..")) return null;
    const camino = v.split(/[?#]/)[0].toLowerCase();
    // La raíz sola no es una pantalla: con sesión no lleva a nada que el
    // cliente pueda ver, y era lo que mandaba Verzy con la ruta vacía (404).
    if (camino === "" || camino === "/") return null;
    if (RUTAS_PROHIBIDAS.some((p) => camino === p || camino.startsWith(`${p}/`))) return null;
    if (camino === "/planes" || camino === "/planes/") return LOS_PRECIOS_DE_LA_LANDING;
    return v as LugarDeVerzy;
}

/** Separa una ruta en su camino (lo que se carga) y su ancla (a dónde se baja). */
export function laRutaYElAnclaDeVerzy(ruta: string): { camino: string; ancla: string | null } {
    const i = ruta.indexOf("#");
    if (i < 0) return { camino: ruta, ancla: null };
    const ancla = ruta.slice(i + 1).trim();
    return { camino: ruta.slice(0, i), ancla: ancla || null };
}

/**
 * La dirección de la conversación de WhatsApp del prospecto en Chats. No es
 * una regla de navegación: es un DATO que se le da al modelo en el contexto
 * para que, si su prompt lo pide, sepa qué URL abrir.
 */
export function laUrlDeLaConversacion(conversacion: { jid: string; linea: string | null } | null): string | null {
    if (!conversacion?.jid) return null;
    const q = new URLSearchParams({ jid: conversacion.jid });
    if (conversacion.linea) q.set("instance", conversacion.linea);
    return `/chats?${q.toString()}`;
}

/** Tope de una nota que se dicta en la llamada, para que no se cuele un párrafo entero. */
export const TOPE_DE_LA_NOTA = 500;

/** Añade la nota al final de las que ya hay, en su propia línea, sin repetirla. */
export function conLaNotaAgregada(antes: string, texto: string): string {
    const nueva = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA);
    const previo = String(antes ?? "").replace(/\s+$/, "");
    if (!nueva) return previo;
    if (previo.split("\n").some((l) => l.trim() === nueva)) return previo;
    return previo ? `${previo}\n${nueva}` : nueva;
}

export type OrdenDeLaPantalla =
    | { tipo: "ir"; datos: { lugar: LugarDeVerzy } }
    | { tipo: "nota"; datos: { texto: string } }
    | { tipo: "tamano"; datos: TamanoDeLaPantalla };

// ---------------------------------------------------------------- el tamaño de la pantalla
//
// El Chromium del servidor pinta con un tamaño de ventana, y la sala enseña ese
// video con `object-contain`. Si el formato de los dos no coincide, sobran
// franjas: con 1280×800 fijo en una sala ancha, quedaban dos franjas vacías a
// los lados. Así que la sala dice cuánto mide su hueco y la ventana del
// servidor toma ESE formato: el video llena la sala de lado a lado.

export type TamanoDeLaPantalla = { ancho: number; alto: number };

/** Con el que nace la ventana, antes de que la sala diga lo suyo. */
export const TAMANO_DE_FABRICA: TamanoDeLaPantalla = { ancho: 1280, alto: 800 };
/** El lado corto de la ventana: la plataforma se ve como en un portátil, ni más grande ni más chica. */
export const LADO_CORTO = 800;
/** Topes del lado largo: una sala absurda no puede pedir una ventana absurda. */
export const LADO_LARGO_MAXIMO = 2400;
/** Por debajo de este ancho la plataforma se parte en su vista de teléfono. */
export const ANCHO_MINIMO = 1024;

/**
 * La ventana del servidor para un hueco de `ancho`×`alto` en la sala: el MISMO
 * formato, con la plataforma a tamaño de portátil. Sala ancha: 800 de alto y
 * el ancho que pida su formato. Sala estrecha (un teléfono): 1024 de ancho y
 * el alto que pida, así el video ocupa todo el ancho sin franjas a los lados.
 * Lo que no es un tamaño de verdad devuelve null.
 */
export function elTamanoDeLaPantalla(ancho: unknown, alto: unknown): TamanoDeLaPantalla | null {
    const a = Number(ancho);
    const h = Number(alto);
    if (!Number.isFinite(a) || !Number.isFinite(h) || a < 50 || h < 50) return null;
    const formato = a / h;
    const tamano =
        formato >= ANCHO_MINIMO / LADO_CORTO
            ? { ancho: Math.round(LADO_CORTO * formato), alto: LADO_CORTO }
            : { ancho: ANCHO_MINIMO, alto: Math.round(ANCHO_MINIMO / formato) };
    return {
        ancho: Math.min(LADO_LARGO_MAXIMO, Math.max(ANCHO_MINIMO, tamano.ancho)),
        alto: Math.min(LADO_LARGO_MAXIMO, Math.max(LADO_CORTO / 2, tamano.alto)),
    };
}

export type ResultadoDeLaOrden = { ok: true; aviso?: string } | { ok: false; motivo: string };

/** Lo que llega del navegador a la ruta de la pantalla, saneado. */
export function laOrdenPedida(cuerpo: unknown): OrdenDeLaPantalla | null {
    const c = (cuerpo ?? {}) as { tipo?: unknown; lugar?: unknown; ruta?: unknown; url?: unknown; destino?: unknown; texto?: unknown };
    if (c.tipo === "ir") {
        // El nombre del campo no se interpreta: es la URL que eligió el modelo.
        const lugar = comoRutaDeVerzy(c.lugar ?? c.ruta ?? c.url ?? c.destino);
        return lugar ? { tipo: "ir", datos: { lugar } } : null;
    }
    if (c.tipo === "nota") {
        const texto = String(c.texto ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA);
        return texto ? { tipo: "nota", datos: { texto } } : null;
    }
    if (c.tipo === "tamano") {
        const t = cuerpo as { ancho?: unknown; alto?: unknown };
        const tamano = elTamanoDeLaPantalla(t.ancho, t.alto);
        return tamano ? { tipo: "tamano", datos: tamano } : null;
    }
    return null;
}

/**
 * El título de la nota donde Verzy apunta lo que dice el cliente en la
 * videollamada. UNA por prospecto: las notas siguientes se añaden debajo.
 * En mayúsculas, como guarda los títulos el módulo de Notas.
 */
export function elTituloDeLaNotaDeLaLlamada(nombre: string | null | undefined): string {
    const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    return `NOTAS DE LA VIDEOLLAMADA · ${limpio || "PROSPECTO"}`.toUpperCase();
}

/** Lo que se le cuenta a Verzy después de cada orden, para que no diga algo que no pasó. */
export function loQueSeLeCuentaAVerzy(orden: OrdenDeLaPantalla, r: ResultadoDeLaOrden): string {
    // Ajustar el tamaño es cosa de la sala: a Verzy no se le cuenta nada.
    if (orden.tipo === "tamano") return "";
    if (orden.tipo === "nota") {
        return r.ok
            ? `La nota quedó guardada en las Notas de la conversación del cliente en Verzay Ventas: «${orden.datos.texto}».`
            : `La nota NO se pudo guardar (${r.motivo}). No digas que quedó guardada.`;
    }
    const ruta = orden.datos.lugar;
    if (!r.ok) return `No se pudo abrir ${ruta} (${r.motivo}). No digas que lo estás mostrando.`;
    return r.aviso ? `En pantalla: ${ruta}. Aviso: ${r.aviso}.` : `En pantalla: ${ruta}, en vivo.`;
}

// ---------------------------------------------------------------- en vivo y en movimiento
//
// La pantalla NO son fotos: es un flujo de video (MJPEG) que sale del
// screencast del Chromium del servidor, y Verzy navega como una persona —el
// cursor se desliza, el buscador se escribe letra a letra, la nota también—.
// Estas son las reglas puras de ese movimiento y de ese flujo.

/** Fotogramas por segundo como mucho hacia cada sala. */
export const FPS_DEL_FLUJO = 20;
/** Con la pantalla quieta, el último fotograma se vuelve a mandar cada este rato. */
export const REPETIR_QUIETA_MS = 1_000;
/** Lo que tarda el cursor en ir de un sitio a otro. */
export const RECORRIDO_DEL_RATON_MS = 650;
/** Pausa entre letra y letra al escribir, como una persona que teclea rápido. */
export const PAUSA_ENTRE_LETRAS_MS = 55;
/** La frontera de cada parte del flujo MJPEG. */
export const FRONTERA_DEL_FLUJO = "verzyframe";

/** El tipo de la respuesta del flujo, con su frontera. */
export const TIPO_DEL_FLUJO = `multipart/x-mixed-replace; boundary=${FRONTERA_DEL_FLUJO}`;

/** La cabecera de una parte del flujo (lo que va antes de los bytes del JPEG). */
export function laCabeceraDeLaParte(bytes: number): string {
    return `--${FRONTERA_DEL_FLUJO}\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes}\r\n\r\n`;
}

/** Suavizado: arranca y frena despacio, como una mano. */
export function suavizado(t: number): number {
    const x = Math.min(1, Math.max(0, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Los puntos por los que pasa el cursor de un sitio a otro, uno cada `pasoMs`.
 * El último es SIEMPRE el destino exacto, y nunca hay menos de dos.
 */
export function elRecorridoDelRaton(
    desde: { x: number; y: number },
    hasta: { x: number; y: number },
    ms = RECORRIDO_DEL_RATON_MS,
    pasoMs = 16,
): { x: number; y: number }[] {
    const pasos = Math.max(2, Math.round(ms / pasoMs));
    const puntos: { x: number; y: number }[] = [];
    for (let i = 1; i <= pasos; i++) {
        const t = suavizado(i / pasos);
        puntos.push({ x: Math.round(desde.x + (hasta.x - desde.x) * t), y: Math.round(desde.y + (hasta.y - desde.y) * t) });
    }
    puntos[puntos.length - 1] = { x: Math.round(hasta.x), y: Math.round(hasta.y) };
    return puntos;
}

/**
 * Qué hay que TECLEAR para pasar de `antes` a `despues`: si `despues` sigue a
 * `antes`, solo la cola; si no (el texto cambió por otro lado), nada que
 * teclear y se escribe entero (`null`).
 */
export function loQueFaltaEscribir(antes: string, despues: string): string | null {
    if (despues === antes) return "";
    return despues.startsWith(antes) ? despues.slice(antes.length) : null;
}

/** Qué se escribe en el buscador de Chats para encontrar al prospecto. */
export function loQueSeBusca(nombre: string, telefono: string | null): string {
    const n = String(nombre ?? "").replace(/\s+/g, " ").trim();
    if (n.length >= 2) return n.split(" ").slice(0, 2).join(" ");
    return String(telefono ?? "").replace(/\D/g, "").slice(-7);
}


/**
 * Al abrir la pantalla, lo guardado se retoma SOLO si es un relevo en vivo:
 * alguien la miraba hace menos de `RELEVO_EN_VIVO_MS` (otra réplica, una
 * reconexión corta). Si no, es de otra llamada o de antes de un corte largo, y
 * abrirlo era saltar sola a una página que nadie pidió.
 */
export const RELEVO_EN_VIVO_MS = 20_000;
export function elDestinoQueSeRetoma(
    fila: { destino: string | null; pedidaEn: Date | string | null } | null | undefined,
    ahora: number = Date.now(),
): LugarDeVerzy | null {
    if (!fila?.pedidaEn) return null;
    const t = new Date(fila.pedidaEn).getTime();
    if (!Number.isFinite(t) || ahora - t > RELEVO_EN_VIVO_MS) return null;
    return comoRutaDeVerzy(fila.destino);
}
