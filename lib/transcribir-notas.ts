import "server-only";

import { Prisma } from "@prisma/client";
import { Readable } from "stream";

import { db } from "@/lib/db";
import { pagaElClienteSuIa } from "@/lib/llaves-de-verzay";
import {
    TOKENS_POR_CREDITO,
    costoDeLaNota,
    esNotaDeVozDeCliente,
    queHacerConLaNota,
    type MotivoSinTranscribir,
} from "@/lib/transcripcion-de-voz";

/**
 * El paso que transcribe las notas de voz que entran en una conversación.
 *
 * # Dónde corre, y por qué ahí
 *
 * **La App no recibe los webhooks de WhatsApp**: los recibe el backend, que es
 * otro repositorio. Así que «cuando llega la nota» aquí significa **cuando la
 * App la ve por primera vez**, o sea en el reloj de la conversación abierta.
 *
 * Y corre **de fondo, sin bloquear la respuesta**: el resultado se guarda, así
 * que la vuelta siguiente del reloj —cinco segundos— ya lo trae. Es la regla de
 * siempre de Chats, *agotar la espera no es tirar la respuesta*, aplicada aquí:
 * la conversación no espera a OpenAI para pintarse.
 *
 * # La transcripción va en `raw`, NO en una columna nueva
 *
 * Es la misma decisión que ya tomaron `sentByAi` y `notaInterna`, con su motivo
 * escrito al lado en `persistedRowToEvolutionMessage`: **`chat_messages` la
 * escriben tres sitios distintos** —la App, el webhook del backend y el
 * chat-store— y añadirle columnas desde aquí es lo que reventó el #360.
 *
 * Se escribe con un **merge de JSONB** (`raw || jsonb_build_object(...)`), que
 * conserva todo lo que ya hubiera dentro. Escribir el objeto entero se llevaría
 * por delante la foto de Evolution, los acuses y las reacciones.
 */

/** Cuántas notas se atienden por vuelta. */
const TOPE_POR_VUELTA = 3;

type NotaPendiente = {
    /** El id de la fila, que es por donde se escribe. */
    fila: bigint;
    messageId: string;
    segundos: number;
};

/**
 * Los créditos que le quedan a una cuenta, o `null` si son ilimitados.
 *
 * Se lee **igual que lo lee el Perfil** (`getOwnIaCredits`): `total` menos
 * `floor(used / 3085)`, nunca por debajo de cero. Y `null` cuando la cuenta
 * paga su propia IA, que es la misma pregunta que se hace el motor.
 *
 * **Una sola lectura por vuelta, no una por nota.** Con una consulta por nota,
 * una conversación con diez notas pendientes son diez lecturas de la misma fila
 * — «muchas peticiones pequeñas son turno, no trabajo», por dentro.
 */
async function losCreditosQueQuedan(userId: string): Promise<number | null> {
    if (await pagaElClienteSuIa(userId)) return null;

    const fila = await db.iaCredit.findUnique({ where: { userId } });
    if (!fila) return 0;
    // En CRÉDITOS las dos partes. Nunca se compara `used` con `total` en la
    // misma expresión: son unidades distintas, y ese es el fallo de esta
    // familia que ya costó el «sin créditos» del voicebot.
    return Math.max(0, fila.total - Math.floor(fila.used / TOKENS_POR_CREDITO));
}

/**
 * Descontar lo que costó la nota.
 *
 * **Se escribe en TOKENS**, que es la unidad de `used`, y con `increment` para
 * que dos notas a la vez no se pisen. Es lo mismo que hace el motor en
 * `trackTokens`, que hasta ahora era el único sitio que sumaba consumo.
 *
 * Va **después** de tener el texto: cobrar antes y que la llamada falle sería
 * cobrar por algo que no se entregó.
 */
async function descontar(userId: string, tokens: number): Promise<void> {
    await db.iaCredit.updateMany({
        where: { userId },
        data: { used: { increment: tokens } },
    });
}

/** Guardar el texto —o el motivo— dentro de `raw`, sin tocar lo demás. */
async function guardarEnLaFila(
    fila: bigint,
    datos: { transcripcion?: string; motivo?: MotivoSinTranscribir },
): Promise<void> {
    const parche: Record<string, string> = {};
    if (datos.transcripcion) parche.transcripcion = datos.transcripcion;
    if (datos.motivo) parche.transcripcionMotivo = datos.motivo;
    if (!Object.keys(parche).length) return;

    await db.$executeRaw`
        UPDATE "chat_messages"
        SET "raw" = COALESCE("raw", '{}'::jsonb) || ${JSON.stringify(parche)}::jsonb,
            "updatedAt" = NOW()
        WHERE "id" = ${fila}
    `;
}

/**
 * Las notas de voz de esta conversación que todavía no se han mirado.
 *
 * **Se pregunta por la BASE y no por lo que traiga la pantalla**: la pantalla
 * trae una página, y lo que interesa es lo que falta por transcribir de lo que
 * ya está guardado. Se piden las más nuevas primero —es lo que alguien está
 * leyendo— y acotadas, que es lo que impide que abrir una conversación vieja
 * con doscientas notas dispare doscientas llamadas de golpe.
 *
 * Una nota ya mirada tiene `transcripcion` o `transcripcionMotivo` dentro de
 * `raw`, así que no vuelve a salir. **«Sin créditos» no deja marca a
 * propósito** (ver `queHacerConLaNota`): es de hoy, no de la nota.
 */
async function lasQueFaltan(input: {
    userIds: string[];
    instanceName?: string | null;
    candidatos: string[];
}): Promise<NotaPendiente[]> {
    if (!input.userIds.length || !input.candidatos.length) return [];

    const porLinea = input.instanceName
        ? Prisma.sql`AND "instanceName" = ${input.instanceName}`
        : Prisma.empty;

    const filas = await db.$queryRaw<Array<{ id: bigint; messageId: string; segundos: number | null }>>`
        SELECT "id", "messageId",
               COALESCE(
                   ("raw" -> 'message' -> 'audioMessage' ->> 'seconds')::int,
                   ("raw" -> 'audioMessage' ->> 'seconds')::int
               ) AS "segundos"
        FROM "chat_messages"
        WHERE "userId" IN (${Prisma.join(input.userIds)})
          ${porLinea}
          AND ("remoteJid" IN (${Prisma.join(input.candidatos)})
               OR "remoteJidAlt" IN (${Prisma.join(input.candidatos)})
               OR "senderPn" IN (${Prisma.join(input.candidatos)}))
          AND "fromMe" = FALSE
          AND "messageType" = 'audioMessage'
          AND NOT ("raw" ? 'transcripcion')
          AND NOT ("raw" ? 'transcripcionMotivo')
        ORDER BY "messageTimestamp" DESC
        LIMIT ${TOPE_POR_VUELTA}
    `;

    return filas.map((f) => ({
        fila: f.id,
        messageId: f.messageId,
        segundos: Number(f.segundos ?? 0),
    }));
}

/**
 * Transcribir lo que falte de esta conversación.
 *
 * **Nunca lanza.** Quien la llama está sirviendo una conversación abierta, y
 * eso manda: un fallo aquí no puede dejar a nadie sin sus mensajes. Pero
 * **tampoco es muda** — una transcripción que no sale sin decirlo se lee como
 * que la función está rota, y eso es una llamada a soporte.
 */
export async function transcribirLasNotasQueFalten(input: {
    /** La cuenta DUEÑA de la línea: es la que recibe el mensaje y la que paga. */
    duenoDeLaLinea: string;
    /** Bajo qué cuentas puede estar guardado el historial. */
    userIds: string[];
    instanceName?: string | null;
    /** Todas las identidades del contacto, como en el resto de Chats. */
    candidatos: string[];
    /** Para pedirle el audio a Evolution. */
    apiKeyData?: { url: string; key: string } | null;
}): Promise<void> {
    try {
        const pendientes = await lasQueFaltan({
            userIds: input.userIds,
            instanceName: input.instanceName,
            candidatos: input.candidatos,
        });
        if (!pendientes.length) return;

        // Una sola lectura de créditos para toda la vuelta.
        let quedan = await losCreditosQueQuedan(input.duenoDeLaLinea);

        for (const nota of pendientes) {
            const que = queHacerConLaNota({
                segundos: nota.segundos,
                creditosDisponibles: quedan,
            });

            if (que.hacer === "esperar") {
                // Sin créditos no se transcribe y el audio llega normal. No se
                // marca la fila: la cuenta puede recargar esta tarde y entonces
                // esta misma nota entra por aquí otra vez.
                console.info("[chats] no hay créditos para transcribir la nota de voz", {
                    cuenta: input.duenoDeLaLinea,
                    quedan,
                });
                return;
            }

            if (que.hacer === "saltar") {
                console.info("[chats] la nota de voz no se transcribe", {
                    messageId: nota.messageId,
                    segundos: nota.segundos,
                    motivo: que.motivo,
                });
                await guardarEnLaFila(nota.fila, { motivo: que.motivo });
                continue;
            }

            const texto = await transcribirUna({
                instanceName: input.instanceName,
                messageId: nota.messageId,
                apiKeyData: input.apiKeyData,
                duenoDeLaLinea: input.duenoDeLaLinea,
            });

            if (!texto) {
                await guardarEnLaFila(nota.fila, { motivo: "fallo" });
                continue;
            }

            await guardarEnLaFila(nota.fila, { transcripcion: texto });

            // Se cobra DESPUÉS de tener el texto: cobrar antes y que la llamada
            // falle sería cobrar por algo que no se entregó. Y no se cobra
            // cuando son ilimitados.
            if (quedan !== null) {
                await descontar(input.duenoDeLaLinea, que.costo.tokens);
                quedan = Math.max(0, quedan - que.costo.creditos);
            }
        }
    } catch (error) {
        console.warn("[chats] falló el paso de transcribir notas de voz", {
            cuenta: input.duenoDeLaLinea,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Una nota: se baja el audio y se le pide el texto a OpenAI.
 *
 * Reutiliza el mismo par de modelos que ya usan las grabaciones de llamadas
 * (`gpt-4o-transcribe`, y `whisper-1` si el primero falla), con la clave de IA
 * de la cuenta dueña de la línea — que es la misma clave sobre la que se decide
 * quién paga.
 *
 * Devuelve cadena vacía cuando no se pudo, y quien llama lo marca: **nunca
 * lanza**.
 */
async function transcribirUna(input: {
    instanceName?: string | null;
    messageId: string;
    apiKeyData?: { url: string; key: string } | null;
    duenoDeLaLinea: string;
}): Promise<string> {
    if (!input.instanceName || !input.apiKeyData?.url || !input.apiKeyData?.key) return "";

    const { getMediaBase64FromMessage } = await import("@/actions/chat-actions");
    const media = await getMediaBase64FromMessage(
        input.apiKeyData,
        input.instanceName,
        input.messageId,
    );
    if (!media.success || !media.data?.base64) return "";

    const clave = await laClaveDeOpenAi(input.duenoDeLaLinea);
    if (!clave) return "";

    const buffer = Buffer.from(media.data.base64, "base64");
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: clave });

    // El nombre del archivo es lo que le dice el formato a OpenAI, y una nota de
    // WhatsApp es opus dentro de ogg. Cada intento recrea el stream: subirlo lo
    // consume, así que reusarlo haría que el segundo modelo mandara un archivo
    // vacío y el respaldo no sirviera de nada.
    for (const modelo of ["gpt-4o-transcribe", "whisper-1"]) {
        try {
            const stream = Readable.from(buffer);
            (stream as unknown as { path: string }).path = "nota.ogg";
            const tr = await openai.audio.transcriptions.create({
                file: stream as never,
                model: modelo,
            });
            const texto = (tr.text ?? "").trim();
            if (texto) return texto;
        } catch (error) {
            console.warn("[chats] un modelo no pudo transcribir la nota", {
                modelo,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return "";
}

/**
 * La clave de OpenAI de la cuenta.
 *
 * Se elige **igual que la elige el motor** —su proveedor por defecto activo,
 * luego cualquiera activo, luego la primera—, que es el mismo criterio con el
 * que `pagaElClienteSuIa` decide quién paga. Decidir sobre una clave y
 * transcribir con otra sería cobrarle a quien no gasta.
 */
async function laClaveDeOpenAi(userId: string): Promise<string | null> {
    const cuenta = await db.user.findUnique({
        where: { id: userId },
        select: {
            defaultProviderId: true,
            aiConfigs: { select: { providerId: true, apiKey: true, isActive: true } },
        },
    });
    if (!cuenta) return null;

    const elegida =
        (cuenta.defaultProviderId
            ? cuenta.aiConfigs.find(
                  (c) => c.providerId === cuenta.defaultProviderId && c.isActive,
              ) ?? cuenta.aiConfigs.find((c) => c.providerId === cuenta.defaultProviderId)
            : undefined) ??
        cuenta.aiConfigs.find((c) => c.isActive) ??
        cuenta.aiConfigs[0];

    return elegida?.apiKey?.trim() || null;
}

export { costoDeLaNota, esNotaDeVozDeCliente };
