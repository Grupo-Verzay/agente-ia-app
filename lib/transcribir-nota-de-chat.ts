import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * La base y la descarga de una nota de voz de Chats. La decisión —si se
 * transcribe, qué cuesta, por qué no salió— vive en `lib/transcripcion-de-voz`,
 * que es puro; el cobro, en `lib/creditos-de-transcripcion`, que lo comparte
 * con el chat del equipo.
 *
 * # Por qué fallaba: el audio se le pedía SOLO a Evolution
 *
 * Este es el «No se pudo transcribir.» de la captura, y no era un fallo de
 * OpenAI. El paso automático bajaba el audio con
 * `getBase64FromMediaMessage`, que es una ruta **de Evolution**, y se rendía en
 * su primera línea cuando no había clave:
 *
 * ```ts
 * if (!instanceName || !apiKeyData?.url || !apiKeyData?.key) return "";
 * ```
 *
 * Y una línea de **WhatsApp Mensajería (Waha) no tiene clave de Evolution**:
 * `resolverContexto` se la quita **a propósito** —preguntarle a Evolution por
 * una línea de Waha «devuelve correcto y vacío»—. Así que en esas líneas la
 * condición era falsa **siempre**: ni una sola nota se transcribía nunca, todas
 * se marcaban `fallo`, y esa marca era definitiva. Es la misma familia que el
 * #792: *el proveedor sale de la fila, no del parámetro.*
 *
 * **La respuesta estaba delante:** la burbuja ya reproduce ese audio, y lo hace
 * desde `chat_messages.mediaUrl` —la copia que guarda el backend—. Si el
 * `<audio>` puede sonar, nosotros podemos bajar los mismos bytes. Así que el
 * camino principal es `mediaUrl`, que funciona **en los dos proveedores**, y
 * Evolution queda como respaldo para las filas viejas que se guardaron sin él.
 */

export type NotaDeVozDeChat = {
    /** El id de la fila, que es por donde se escribe. */
    fila: bigint;
    messageId: string;
    segundos: number;
    mediaUrl: string | null;
    /** El texto ya pagado, si alguien la pidió antes. */
    transcripcion: string | null;
};

/**
 * La nota de voz de este mensaje, buscada **por la línea y por todas las
 * identidades del contacto**, como el resto de Chats.
 *
 * `messageId` no es único en la plataforma —es el id que le pone WhatsApp—, así
 * que jamás se busca solo por él: sin acotar por cuenta y línea, mandar un id a
 * mano leería la nota de otro.
 */
export async function laNotaDeVoz(input: {
    userIds: string[];
    instanceName: string;
    messageId: string;
    candidatos: string[];
}): Promise<NotaDeVozDeChat | null> {
    if (!input.userIds.length || !input.candidatos.length || !input.messageId) return null;

    const filas = await db.$queryRaw<
        Array<{
            id: bigint;
            messageId: string;
            mediaUrl: string | null;
            segundos: number | null;
            transcripcion: string | null;
        }>
    >`
        SELECT "id", "messageId", "mediaUrl",
               COALESCE(
                   ("raw" -> 'message' -> 'audioMessage' ->> 'seconds')::int,
                   ("raw" -> 'audioMessage' ->> 'seconds')::int
               ) AS "segundos",
               NULLIF("raw" ->> 'transcripcion', '') AS "transcripcion"
        FROM "chat_messages"
        WHERE "userId" IN (${Prisma.join(input.userIds)})
          AND "instanceName" = ${input.instanceName}
          AND "messageId" = ${input.messageId}
          AND ("remoteJid" IN (${Prisma.join(input.candidatos)})
               OR "remoteJidAlt" IN (${Prisma.join(input.candidatos)})
               OR "senderPn" IN (${Prisma.join(input.candidatos)}))
          AND "fromMe" = FALSE
          AND "messageType" = 'audioMessage'
        LIMIT 1
    `;

    const f = filas[0];
    if (!f) return null;
    return {
        fila: f.id,
        messageId: f.messageId,
        segundos: Number(f.segundos ?? 0),
        mediaUrl: f.mediaUrl,
        transcripcion: f.transcripcion,
    };
}

/**
 * Guardar el texto dentro de `raw`, **solo si no lo tenía ya**.
 *
 * # Va en `raw` y no en una columna nueva
 *
 * Es la misma decisión que ya tomaron `sentByAi` y `notaInterna`, con su motivo
 * escrito al lado: **`chat_messages` la escriben tres sitios distintos** —la
 * App, el webhook del backend y el chat-store— y añadirle columnas desde aquí
 * es lo que reventó el #360.
 *
 * Se escribe con un **merge de JSONB** (`raw || jsonb_build_object(...)`), que
 * conserva todo lo que ya hubiera dentro: escribir el objeto entero se llevaría
 * por delante la foto de Evolution, los acuses y las reacciones.
 *
 * # Y el `WHERE` es lo que hace que solo se pague una vez
 *
 * Dos asesores pulsando el botón a la vez sobre la misma nota escriben **una
 * sola** fila: el segundo toca cero y su llamada lo ve. Es el mismo candado que
 * `guardarLaTranscripcion` del chat del equipo, que allí es
 * `WHERE "transcripcion" IS NULL`.
 *
 * Devuelve si esta llamada fue la que escribió.
 */
export async function guardarLaTranscripcion(
    fila: bigint,
    texto: string,
): Promise<boolean> {
    // Los PARÉNTESIS no son estilo. En Postgres el `-` de restar una clave
    // liga MÁS FUERTE que el `||` de mezclar, así que sin ellos esto se lee
    // como `raw || (objeto_nuevo - 'transcripcionMotivo')`: la clave se le
    // quita al objeto que se acaba de construir —donde no está— y la marca
    // vieja **se quedaba puesta** junto al texto bueno. Lo cazó el banco.
    const tocadas = await db.$executeRaw`
        UPDATE "chat_messages"
        SET "raw" = (
                COALESCE("raw", '{}'::jsonb)
                || jsonb_build_object('transcripcion', ${texto}::text)
            ) - 'transcripcionMotivo',
            "updatedAt" = NOW()
        WHERE "id" = ${fila}
          AND COALESCE(NULLIF("raw" ->> 'transcripcion', ''), '') = ''
    `;
    return tocadas > 0;
}

/**
 * Bajarse el audio de la nota.
 *
 * **`mediaUrl` primero, y en los dos proveedores.** Es la copia que guarda el
 * backend y la misma dirección que el `<audio>` de la burbuja ya reproduce, así
 * que no hay nada que adivinar: si se oye, se puede transcribir.
 *
 * Evolution queda de **respaldo** para las filas viejas que se guardaron sin
 * `mediaUrl`, y solo cuando hay clave con la que preguntar. Al revés —Evolution
 * primero— sería volver al fallo: la mitad de las líneas no tiene clave.
 *
 * La **extensión del nombre** es lo que le dice el formato a OpenAI, y por eso
 * no es cosmética: una nota de WhatsApp es opus dentro de ogg.
 */
export async function bajarElAudioDeLaNota(input: {
    mediaUrl: string | null;
    instanceName: string;
    messageId: string;
    apiKeyData?: { url: string; key: string } | null;
}): Promise<{ bytes: Buffer; nombre: string } | null> {
    if (input.mediaUrl) {
        const bajado = await bajarDeLaUrl(input.mediaUrl);
        if (bajado) return bajado;
        console.warn("[chats] no se pudo bajar el audio de la nota desde su url", {
            messageId: input.messageId,
        });
    }

    if (!input.apiKeyData?.url || !input.apiKeyData?.key) return null;

    const { getMediaBase64FromMessage } = await import("@/actions/chat-actions");
    const media = await getMediaBase64FromMessage(
        input.apiKeyData,
        input.instanceName,
        input.messageId,
    );
    if (!media.success || !media.data?.base64) {
        console.warn("[chats] Evolution no devolvió el audio de la nota", {
            messageId: input.messageId,
            motivo: media.message,
        });
        return null;
    }
    return { bytes: Buffer.from(media.data.base64, "base64"), nombre: "nota.ogg" };
}

/** Diez segundos: quien pulsó el botón está mirando la pantalla. */
const PLAZO_DE_LA_DESCARGA_MS = 15000;

async function bajarDeLaUrl(
    url: string,
): Promise<{ bytes: Buffer; nombre: string } | null> {
    try {
        const res = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(PLAZO_DE_LA_DESCARGA_MS),
        });
        if (!res.ok) return null;
        const bytes = Buffer.from(await res.arrayBuffer());
        if (!bytes.length) return null;
        return { bytes, nombre: nombreDeLaUrl(url) };
    } catch {
        return null;
    }
}

/**
 * El nombre del fichero que se le manda a OpenAI.
 *
 * Solo importa su **extensión**, y por eso se cae a `.ogg` cuando la dirección
 * no trae ninguna reconocible: es lo que manda WhatsApp, y una extensión
 * inventada hace que OpenAI rechace el audio con un error que parece otra cosa.
 */
export function nombreDeLaUrl(url: string): string {
    const sinParametros = url.split("?")[0].split("#")[0];
    const ultimo = sinParametros.split("/").pop() ?? "";
    const extension = ultimo.includes(".") ? ultimo.split(".").pop()!.toLowerCase() : "";
    const conocidas = ["ogg", "oga", "opus", "mp3", "m4a", "mp4", "wav", "webm", "mpga"];
    return conocidas.includes(extension) ? `nota.${extension}` : "nota.ogg";
}
