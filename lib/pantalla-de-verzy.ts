/**
 * Lo que Verzy puede ENSEÑAR en la videollamada, y nada más: pantallas reales
 * de la cuenta «Verzay Ventas», navegadas en vivo por el servidor (ver
 * `lib/pantalla-de-verzy.server.ts`). Ninguna página de ejemplo, ningún video
 * promocional, ninguna vista hecha a propósito para la llamada.
 *
 * Puro: lo usan el servidor, la sala, el guion del avatar y el banco.
 */

export const DESTINOS_DE_VERZY = [
    { clave: "dashboard", titulo: "Panel de estadísticas", cuando: "para enseñar el resumen del negocio: chats, leads y ventas" },
    { clave: "chats", titulo: "Chats", cuando: "para enseñar la bandeja de Chats y la conversación de WhatsApp del cliente" },
    { clave: "ficha", titulo: "Ficha de contacto", cuando: "para enseñar la ficha del cliente con sus datos y sus notas" },
    { clave: "recordatorios", titulo: "Recordatorios", cuando: "para enseñar los recordatorios programados por WhatsApp" },
    { clave: "citas", titulo: "Agenda de citas", cuando: "para enseñar las citas agendadas en la agenda" },
    { clave: "embudo", titulo: "Embudo de ventas", cuando: "para enseñar el embudo de ventas con cada conversación en su etapa" },
] as const;

export type DestinoDeVerzy = (typeof DESTINOS_DE_VERZY)[number]["clave"];

export const NOMBRES_DE_LOS_DESTINOS: Record<DestinoDeVerzy, string> = Object.fromEntries(
    DESTINOS_DE_VERZY.map((d) => [d.clave, d.titulo]),
) as Record<DestinoDeVerzy, string>;

export function comoDestino(valor: unknown): DestinoDeVerzy | null {
    const v = String(valor ?? "").trim().toLowerCase();
    return (DESTINOS_DE_VERZY.find((d) => d.clave === v)?.clave as DestinoDeVerzy | undefined) ?? null;
}

/** La ruta REAL de la plataforma para cada destino. La ficha vive en Chats. */
export function laRutaDelDestino(destino: DestinoDeVerzy, conversacion: { jid: string; linea: string | null } | null): string {
    switch (destino) {
        case "dashboard":
            return "/crm/dashboard";
        case "chats":
        case "ficha": {
            if (!conversacion?.jid) return "/chats";
            const q = new URLSearchParams({ jid: conversacion.jid });
            if (conversacion.linea) q.set("instance", conversacion.linea);
            return `/chats?${q.toString()}`;
        }
        case "recordatorios":
            return "/reminders";
        case "citas":
            return "/schedule";
        case "embudo":
            return "/embudos";
    }
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
    | { tipo: "ir"; datos: { destino: DestinoDeVerzy } }
    | { tipo: "nota"; datos: { texto: string } }
    | { tipo: "recorrer"; datos: Record<string, never> };

export type ResultadoDeLaOrden = { ok: true; aviso?: string } | { ok: false; motivo: string };

/** Lo que llega del navegador a la ruta de la pantalla, saneado. */
export function laOrdenPedida(cuerpo: unknown): OrdenDeLaPantalla | null {
    const c = (cuerpo ?? {}) as { tipo?: unknown; destino?: unknown; texto?: unknown };
    if (c.tipo === "ir") {
        const destino = comoDestino(c.destino);
        return destino ? { tipo: "ir", datos: { destino } } : null;
    }
    if (c.tipo === "recorrer") return { tipo: "recorrer", datos: {} };
    if (c.tipo === "nota") {
        const texto = String(c.texto ?? "").replace(/\s+/g, " ").trim().slice(0, TOPE_DE_LA_NOTA);
        return texto ? { tipo: "nota", datos: { texto } } : null;
    }
    return null;
}

/** Lo que se le cuenta a Verzy después de cada orden, para que no diga algo que no pasó. */
export function loQueSeLeCuentaAVerzy(orden: OrdenDeLaPantalla, r: ResultadoDeLaOrden): string {
    if (orden.tipo === "nota") {
        return r.ok
            ? `La nota quedó guardada en la ficha del cliente en Verzay Ventas: «${orden.datos.texto}».`
            : `La nota NO se pudo guardar (${r.motivo}). No digas que quedó guardada.`;
    }
    if (orden.tipo === "recorrer") return "";
    const nombre = NOMBRES_DE_LOS_DESTINOS[orden.datos.destino];
    if (!r.ok) return `No se pudo abrir ${nombre} (${r.motivo}). No digas que lo estás mostrando.`;
    return r.aviso ? `En pantalla: ${nombre}. Aviso: ${r.aviso}.` : `En pantalla: ${nombre} de Verzay Ventas, en vivo.`;
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

// ---------------------------------------------------------------- la pantalla acompaña la voz
//
// Mientras Verzy habla, la pantalla NO se queda quieta: cada tramo de su
// discurso que nombra una sección la abre (`losDestinosQueNombra`) y, entre
// una y otra, la pantalla se recorre sola (`recorrer`) cada `RITMO_AL_HABLAR_MS`.
// En silencio no se mueve nada.

/** Cada cuánto se mueve la pantalla mientras Verzy habla. */
export const RITMO_AL_HABLAR_MS = 2_200;

/** Qué palabras de lo que dice Verzy abren qué pantalla, en orden de prioridad. */
export const PALABRAS_DE_CADA_DESTINO: ReadonlyArray<{ destino: DestinoDeVerzy; palabras: RegExp }> = [
    { destino: "citas", palabras: /\b(agenda|citas?|reuni[oó]n(es)?|agendad[oa]s?)\b/i },
    { destino: "recordatorios", palabras: /\b(recordatorios?|recordar(le|te)?)\b/i },
    { destino: "embudo", palabras: /\b(embudo|etapas?|pipeline|prospectos?)\b/i },
    { destino: "ficha", palabras: /\b(ficha|notas?|datos del cliente|tus datos)\b/i },
    { destino: "chats", palabras: /\b(chats?|whats ?app|conversaci[oó]n(es)?|mensajes?|bandeja)\b/i },
    { destino: "dashboard", palabras: /\b(panel|estad[ií]sticas?|resumen|reportes?|m[eé]tricas?|ventas del mes)\b/i },
];

/** Las secciones que nombra un trozo del discurso, en el orden en que aparecen. Puro. */
export function losDestinosQueNombra(texto: string): DestinoDeVerzy[] {
    const t = String(texto ?? "");
    const hallados: { destino: DestinoDeVerzy; en: number }[] = [];
    for (const { destino, palabras } of PALABRAS_DE_CADA_DESTINO) {
        const m = t.match(palabras);
        if (m && m.index !== undefined) hallados.push({ destino, en: m.index });
    }
    return hallados.sort((a, b) => a.en - b.en).map((h) => h.destino);
}

/**
 * Qué hace la pantalla en este tick mientras Verzy habla. Puro.
 * - Si su voz nombra una sección distinta de la que se ve: ir ahí.
 * - Si no, y ya pasó el ritmo desde el último movimiento: recorrer la que se ve.
 * - Sin pantalla compartida, o callada: nada.
 */
export function queHaceLaPantallaAlHablar(e: {
    hablando: boolean;
    enPantalla: DestinoDeVerzy | null;
    nombrados: DestinoDeVerzy[];
    desdeElUltimoMovimientoMs: number;
}): { tipo: "ir"; destino: DestinoDeVerzy } | { tipo: "recorrer" } | null {
    if (!e.hablando || !e.enPantalla) return null;
    const otro = e.nombrados.find((d) => d !== e.enPantalla);
    if (otro) return { tipo: "ir", destino: otro };
    if (e.desdeElUltimoMovimientoMs >= RITMO_AL_HABLAR_MS) return { tipo: "recorrer" };
    return null;
}
