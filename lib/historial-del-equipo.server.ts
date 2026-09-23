import "server-only";

import { db } from "@/lib/db";
import { minioClient } from "@/lib/minio";
import { llaveDelArchivoSubido } from "@/lib/llave-del-bucket";
import { CANAL_GENERAL } from "@/lib/canales-de-equipo";
import { losDirectosDe, vaciarElHistorial } from "@/lib/chat-de-equipo-db";

/**
 * Lo que de verdad hace limpiar una conversación del chat de equipo, y el
 * arranque de cero de un puesto que cambia de ocupante.
 *
 * Las reglas (quién, qué se advierte) están en `lib/historial-del-equipo.ts`;
 * aquí solo lo que toca la base y el bucket. **No decide ninguna puerta**: quien
 * llama ya comprobó que se puede —súper administrador para limpiar a mano,
 * quien configura el equipo para el puesto—.
 */

/** `42P01`: la tabla todavía no existe. Prisma lo esconde en `meta.code`. */
function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

/**
 * Una limpieza de una tabla que puede no existir todavía.
 *
 * Que falte la tabla no es un fallo aquí: `task_alerts` y `push_subscriptions`
 * las crea su propio módulo la primera vez que alguien las usa, y si no están
 * es que no hay nada que borrar. Cualquier OTRO error sí sube: estas limpiezas
 * son las que impiden que la persona nueva reciba lo de la anterior.
 */
async function siLaTablaExiste(hacer: () => Promise<number>): Promise<number> {
    try {
        return await hacer();
    } catch (error) {
        if (esTablaQueFalta(error)) return 0;
        throw error;
    }
}

/**
 * Quitar del bucket lo que colgaba de mensajes que ya no están.
 *
 * **Best-effort y nunca lanza**: la fila ya se fue cuando esto corre, así que un
 * fallo aquí deja un archivo huérfano y no una limpieza a medias. Pero no es
 * mudo. Qué se deja borrar lo decide `llaveDelArchivoSubido`, la misma regla
 * que `/api/upload/borrar`: una sola sobre qué direcciones son nuestras.
 */
export async function quitarDelBucket(urls: string[]): Promise<void> {
    const bucket = process.env.S3_BUCKET_NAME || "verzay-media";
    for (const url of urls) {
        try {
            const destino = llaveDelArchivoSubido(url, process.env.S3_PUBLIC_URL, bucket);
            if (!destino) continue;
            await minioClient.removeObject(bucket, destino.llave);
        } catch (error) {
            console.warn("[chat-equipo] no se pudo quitar del bucket un archivo borrado", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}

/**
 * Los avisos de mención que apuntaban a mensajes de este canal.
 *
 * Sin esto, la ventana que interrumpe y la campanita seguirían ofreciendo
 * «X te mencionó» y, al pulsar, un hilo vacío: un aviso que lleva a nada se
 * lee como que la App pierde mensajes. Se reconocen por su `enlace`, que es
 * el que escribe `enviarAlEquipoAction` (`/chat-equipo?canal=<id>&…`).
 *
 * El general se acota además por las cuentas de la familia: su `canalId` es el
 * mismo `'general'` en toda la plataforma.
 */
async function olvidarLosAvisosDelCanal(canalId: string, cuentas: string[]): Promise<number> {
    const prefijo = `/chat-equipo?canal=${encodeURIComponent(canalId)}&`;
    const general = canalId === CANAL_GENERAL;
    return siLaTablaExiste(() => db.$executeRaw`
        DELETE FROM "task_alerts"
        WHERE "taskId" IS NULL AND "tipo" = 'mencion'
          AND starts_with("enlace", ${prefijo})
          AND (NOT ${general}::boolean OR "ownerId" = ANY(${cuentas}::text[]))
    `);
}

/**
 * Limpiar una conversación: mensajes, reacciones, sus avisos de mención y sus
 * archivos.
 *
 * El bucket va de fondo y al final: es lo único que puede tardar, y la
 * conversación ya está vacía en la base cuando se llega ahí.
 */
export async function limpiarLaConversacion(input: {
    canalId: string;
    cuentas: string[];
}): Promise<{ mensajes: number; avisos: number }> {
    const { mensajes, archivos } = await vaciarElHistorial(input);
    const avisos = await olvidarLosAvisosDelCanal(input.canalId, input.cuentas);
    if (archivos.length) void quitarDelBucket(archivos);
    return { mensajes, avisos };
}

/**
 * Entra otra persona en un puesto: sus directos arrancan sin historial.
 *
 * Tres cosas, y las tres son de la persona ANTERIOR que la nueva heredaría
 * por tener el mismo id:
 *
 * 1. **Sus directos, vaciados.** El canal se queda —con los mismos dos
 *    miembros— porque el puesto sigue siendo el mismo: se habla con quien lo
 *    ocupe, que es lo que el directo representa. Lo que no se queda es lo que
 *    se dijo con la persona de antes. Se vacía para los DOS lados: un directo
 *    es una conversación, no dos copias, y dejarle a la otra parte el pasado
 *    sería dejárselo delante a la nueva en cuanto le conteste citando.
 * 2. **Sus menciones pendientes**, en cualquier canal: la ventana que
 *    interrumpe le saltaría a la persona nueva con «te mencionaron» dirigidas
 *    a la anterior.
 * 3. **Los dispositivos de la persona anterior** (`push_subscriptions`): los
 *    avisos del puesto seguirían llegando al teléfono de quien se fue. Es la
 *    única que no es historial, y es la que más se nota.
 *
 * Los canales de área y el general **no se tocan**: son de todo el equipo, y lo
 * que la persona anterior escribió ahí es parte de esas conversaciones.
 *
 * Lanza si algo falla: quien llama lo hace ANTES de darle el puesto a la
 * persona nueva, y un arranque a medias no puede acabar con la persona nueva
 * dentro y el historial todavía ahí.
 */
export async function arrancarDeCeroElPuesto(personaId: string): Promise<{
    directos: number;
    mensajes: number;
    avisos: number;
    dispositivos: number;
}> {
    const persona = personaId.trim();
    if (!persona) return { directos: 0, mensajes: 0, avisos: 0, dispositivos: 0 };

    const directos = await losDirectosDe(persona);
    let mensajes = 0;
    let avisos = 0;
    for (const canalId of directos) {
        const hecho = await limpiarLaConversacion({ canalId, cuentas: [] });
        mensajes += hecho.mensajes;
        avisos += hecho.avisos;
    }

    avisos += await siLaTablaExiste(() => db.$executeRaw`
        DELETE FROM "task_alerts"
        WHERE "taskId" IS NULL AND "tipo" = 'mencion' AND "destinatarioId" = ${persona}
    `);
    const dispositivos = await siLaTablaExiste(() => db.$executeRaw`
        DELETE FROM "push_subscriptions" WHERE "personaId" = ${persona}
    `);

    return { directos: directos.length, mensajes, avisos, dispositivos };
}
