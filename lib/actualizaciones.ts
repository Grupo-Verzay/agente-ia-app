/**
 * ACTUALIZACIONES: lo que la casa publica para que lo vea toda la plataforma.
 *
 * Puro a propósito: de aquí tiran la acción (servidor), la pantalla que publica,
 * la ventana emergente (navegador) y el banco. Lo que toca la base vive en
 * `lib/actualizaciones-db.ts`.
 *
 * # Qué es una actualización
 *
 * Un texto breve y, opcionalmente, UN archivo —un video o un documento— subido
 * por `/api/upload`. Al publicarla, a cada persona que abra la plataforma le
 * salta UNA vez una ventana con ese contenido; en cuanto la cierra o la ve
 * completa, no le vuelve a salir.
 *
 * # La ventana enseña la MÁS RECIENTE que esa persona no ha visto
 *
 * Y solo esa. Con tres publicadas y ninguna vista, encadenar tres ventanas es
 * justo lo que enseña a despachar avisos sin leer; la más reciente es la que
 * dice cómo está la plataforma hoy. Y las anteriores ya no saltan nunca, sin
 * tener que marcarlas: `laActualizacionPendiente` solo mira la más reciente, así
 * que una novedad de ayer no se cuenta mañana.
 */
import { comoSeGuardaElAdjunto, laClaseDelAdjunto, type AdjuntoDelEquipo } from "@/lib/adjuntos-del-equipo";

/** Tope del texto: es un aviso, no un documento. El documento va de adjunto. */
export const TOPE_DE_TEXTO = 1000;

/** Tope de lo que se sube desde la pantalla (un video explicativo pesa). */
export const TOPE_DE_BYTES_DE_ACTUALIZACION = 200 * 1024 * 1024;

/** Carpeta del bucket: `<cuenta>/actualizaciones/<fichero>`, la forma de `/api/upload`. */
export const CARPETA_DE_ACTUALIZACIONES = "actualizaciones";

export type ArchivoDeActualizacion = AdjuntoDelEquipo;

export type Actualizacion = {
    id: string;
    texto: string;
    archivo: ArchivoDeActualizacion | null;
    publicadaEn: string; // ISO
    publicadaPor: string | null;
};

export type ClaseDeArchivo = "video" | "imagen" | "documento";

/** Cómo se pinta el archivo. Lo que no es video ni imagen es un documento. */
export function laClaseDelArchivo(archivo: ArchivoDeActualizacion | null | undefined): ClaseDeArchivo | null {
    if (!archivo?.url) return null;
    const clase = laClaseDelAdjunto(archivo);
    return clase === "archivo" ? "documento" : clase;
}

/** El texto tal como se guarda: sin espacios de sobra, con tope, sin `\r`. */
export function comoTextoDeActualizacion(crudo: unknown): string {
    if (typeof crudo !== "string") return "";
    return crudo.replace(/\r\n?/g, "\n").trim().slice(0, TOPE_DE_TEXTO).trim();
}

/**
 * Lo que se puede publicar, o por qué no.
 *
 * El texto es obligatorio: una ventana con solo un reproductor no dice qué
 * cambió ni por qué hay que mirarlo. El archivo es opcional, pero **si llega
 * tiene que ser nuestro** (`comoSeGuardaElAdjunto` → `llaveDelArchivoSubido`):
 * si no, la ventana de TODA la plataforma pintaría un `<video>` apuntando a
 * donde dijera quien publica.
 */
export function loQueSePublica(
    pedido: { texto?: unknown; archivo?: unknown } | null | undefined,
    bucket: { publicUrl: string | undefined; nombre: string },
):
    | { ok: true; texto: string; archivo: ArchivoDeActualizacion | null }
    | { ok: false; motivo: string } {
    const texto = comoTextoDeActualizacion(pedido?.texto);
    if (!texto) return { ok: false, motivo: "Escribe el texto de la actualización." };

    const crudo = pedido?.archivo as { url?: string } | null | undefined;
    if (!crudo || !crudo.url) return { ok: true, texto, archivo: null };

    const archivo = comoSeGuardaElAdjunto(crudo as never, bucket);
    if (!archivo) return { ok: false, motivo: "El archivo no es válido. Vuelve a subirlo." };
    return { ok: true, texto, archivo };
}

/**
 * La que le toca ver a esta persona: la MÁS RECIENTE que no ha visto.
 *
 * Si ya vio (o cerró) la más reciente, no le toca ninguna, aunque haya
 * anteriores sin ver: esas ya las tapó la nueva. `null` = no sale nada.
 */
export function laActualizacionPendiente<T extends { id: string; publicadaEn: string }>(
    publicadas: readonly T[],
    vistas: ReadonlySet<string> | readonly string[],
): T | null {
    if (!publicadas.length) return null;
    const vistasSet = vistas instanceof Set ? vistas : new Set(vistas as readonly string[]);
    const masReciente = [...publicadas].sort((a, b) => b.publicadaEn.localeCompare(a.publicadaEn))[0];
    return vistasSet.has(masReciente.id) ? null : masReciente;
}

/** Cómo se despidió la persona de la ventana. Las dos cuentan como «ya vista». */
export type ComoSeCerro = "vista" | "cerrada";

export function comoSeCerro(crudo: unknown): ComoSeCerro {
    return crudo === "vista" ? "vista" : "cerrada";
}
