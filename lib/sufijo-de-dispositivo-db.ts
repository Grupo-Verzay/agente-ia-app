import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Unifica el contacto que se partió en dos por el sufijo de dispositivo.
 *
 * WhatsApp numera el aparato desde el que se escribe —`573001:39@s.whatsapp.net`—
 * y ese `:39` NO es parte del número. El mismo contacto escribiendo desde el
 * teléfono y desde WhatsApp Web entra con dos identificadores, así que acaba con
 * dos conversaciones y dos fichas: es el cliente duplicado que se ve en Chats.
 *
 * Que no vuelva a nacer ninguno lo arregla `sinSufijoDeDispositivo`, en
 * `lib/whatsapp-jid.ts`. Esto es la otra mitad: juntar los que YA están
 * partidos.
 *
 * **Unificar es mover, no borrar.** Antes de quitar la fila con sufijo, lo suyo
 * pasa a la que se queda: los mensajes van a la conversación limpia y lo que
 * cuelga de la ficha —etiquetas, notas, tareas, citas, seguimientos— pasa a la
 * ficha limpia. Un `DELETE` a secas no sería un borrado de una copia vacía:
 * media docena de esas tablas van en cascada, así que se llevaría por delante
 * una nota o una cita que alguien escribió.
 */

/**
 * Cuántas conversaciones con sufijo se unifican por vuelta.
 *
 * Esto cuelga de la carga de la bandeja. La primera vuelta de una cuenta con
 * meses de duplicados no puede quedarse reescribiendo miles de filas mientras
 * alguien espera a que le abra Chats: se hace a trozos y la vuelta siguiente
 * sigue por donde iba.
 */
const TOPE_POR_VUELTA = 200;

/** El sufijo, en una sola expresión, para no escribirlo en diez consultas. */
const PATRON = ":[0-9]+@";

/**
 * Lo que cuelga de una ficha.
 *
 * `columna` es el nombre de la columna **en la base**, no el del campo de
 * Prisma: en SQL en crudo no hay traducción, y confundirlos es justo lo que
 * tenía rota esta limpieza desde el #549 (`assignedAdvisorId` contra
 * `assigned_advisor_id`, error 42703 en cada vuelta). Lo comprueba el banco
 * contra `information_schema`.
 *
 * `unicaCon` son las demás columnas de la llave única en la que participa la
 * sesión. Donde la hay, mover la fila puede chocar con una que la ficha buena
 * ya tiene —la misma etiqueta, el mismo estado de flujo—, y esa sí es una copia
 * de algo que ya está: se quita antes de mover.
 */
const LO_QUE_CUELGA: Array<{ tabla: string; columna: string; unicaCon: string[] }> = [
  { tabla: "Appointment", columna: "sessionId", unicaCon: [] },
  { tabla: "Registro", columna: "sessionId", unicaCon: [] },
  { tabla: "AssignmentLog", columna: "sessionId", unicaCon: [] },
  { tabla: "OperatorBridge", columna: "client_session_id", unicaCon: [] },
  { tabla: "SessionTag", columna: "sessionId", unicaCon: ["tagId"] },
  { tabla: "SessionTrigger", columna: "sessionId", unicaCon: [] },
  { tabla: "SessionWorkflowState", columna: "sessionId", unicaCon: ["workflowId"] },
  { tabla: "crm_follow_ups", columna: "sessionId", unicaCon: ["rule_key", "source_hash"] },
  { tabla: "lead_status_workflow_execution", columna: "sessionId", unicaCon: ["leadStatus"] },
  { tabla: "internal_notes", columna: "sessionId", unicaCon: [] },
  { tabla: "tasks", columna: "sessionId", unicaCon: [] },
  { tabla: "finance_transactions", columna: "sessionId", unicaCon: [] },
  { tabla: "finance_contacts", columna: "sessionId", unicaCon: [] },
  { tabla: "session_participants", columna: "sessionId", unicaCon: ["userId"] },
  { tabla: "collab_notifications", columna: "sessionId", unicaCon: [] },
];

/** `SessionTrigger.sessionId` es único él solo: dos filas no pueden convivir. */
const UNICA_ELLA_SOLA = new Set(["SessionTrigger"]);

export const TABLAS_QUE_CUELGAN_DE_LA_FICHA = LO_QUE_CUELGA;

type ParejaDeConversacion = {
  userId: string;
  instanceName: string;
  conSufijo: string;
  limpio: string;
};

type ParejaDeFicha = {
  malaId: number;
  buenaId: number;
  remoteJid: string;
  instanceId: string;
};

/**
 * Mueve los mensajes de la conversación con sufijo a la limpia, y quita la fila
 * de la conversación duplicada.
 *
 * Lo que no se puede mover es un mensaje que YA está guardado bajo el jid
 * limpio: misma llave, mismo `messageId` y mismo `fromMe`, o sea el mismo
 * mensaje. Ese se quita, que es lo contrario de perderlo.
 */
async function unificarUnaConversacion(pareja: ParejaDeConversacion): Promise<number> {
  const { userId, instanceName, conSufijo, limpio } = pareja;

  return db.$transaction(async (tx) => {
    const movidos = await tx.$executeRaw`
      UPDATE "chat_messages" m
         SET "remoteJid" = ${limpio},
             "remoteJidAlt" = NULLIF(regexp_replace(COALESCE(m."remoteJidAlt", ''), ${PATRON}, '@'), ''),
             "senderPn" = NULLIF(regexp_replace(COALESCE(m."senderPn", ''), ${PATRON}, '@'), ''),
             "updatedAt" = NOW()
       WHERE m."userId" = ${userId}
         AND m."instanceName" = ${instanceName}
         AND m."remoteJid" = ${conSufijo}
         AND NOT EXISTS (
           SELECT 1 FROM "chat_messages" o
            WHERE o."userId" = m."userId"
              AND o."instanceName" = m."instanceName"
              AND o."remoteJid" = ${limpio}
              AND o."messageId" = m."messageId"
              AND o."fromMe" = m."fromMe"
         )
    `;

    // Lo que queda es el MISMO mensaje, ya guardado bajo el jid limpio.
    await tx.$executeRaw`
      DELETE FROM "chat_messages"
       WHERE "userId" = ${userId}
         AND "instanceName" = ${instanceName}
         AND "remoteJid" = ${conSufijo}
    `;

    // Si la conversacion con sufijo trae el mensaje mas nuevo, ese es el que
    // tiene que verse en la fila que se queda. Sin esto, unificar haria que la
    // bandeja retrocediera al mensaje anterior.
    await tx.$executeRaw`
      UPDATE "chat_conversations" buena
         SET "lastMessageId" = mala."lastMessageId",
             "lastMessageFromMe" = mala."lastMessageFromMe",
             "lastMessageType" = mala."lastMessageType",
             "lastMessageContent" = mala."lastMessageContent",
             "lastMessageMediaUrl" = mala."lastMessageMediaUrl",
             "lastMessageRaw" = mala."lastMessageRaw",
             "lastMessageTimestamp" = mala."lastMessageTimestamp",
             "lastMessageDeleted" = mala."lastMessageDeleted",
             "pushName" = COALESCE(NULLIF(BTRIM(buena."pushName"), ''), mala."pushName"),
             "updatedAt" = NOW()
        FROM "chat_conversations" mala
       WHERE buena."userId" = ${userId}
         AND buena."instanceName" = ${instanceName}
         AND buena."remoteJid" = ${limpio}
         AND mala."userId" = ${userId}
         AND mala."instanceName" = ${instanceName}
         AND mala."remoteJid" = ${conSufijo}
         AND COALESCE(mala."lastMessageTimestamp", '1970-01-01'::timestamp)
           > COALESCE(buena."lastMessageTimestamp", '1970-01-01'::timestamp)
    `;

    // Sin gemela limpia no hay nada que juntar: la fila se queda, con su jid
    // sin el sufijo.
    const renombradas = await tx.$executeRaw`
      UPDATE "chat_conversations" c
         SET "remoteJid" = ${limpio},
             "remoteJidAlt" = NULLIF(regexp_replace(COALESCE(c."remoteJidAlt", ''), ${PATRON}, '@'), ''),
             "senderPn" = NULLIF(regexp_replace(COALESCE(c."senderPn", ''), ${PATRON}, '@'), ''),
             "updatedAt" = NOW()
       WHERE c."userId" = ${userId}
         AND c."instanceName" = ${instanceName}
         AND c."remoteJid" = ${conSufijo}
         AND NOT EXISTS (
           SELECT 1 FROM "chat_conversations" o
            WHERE o."userId" = c."userId"
              AND o."instanceName" = c."instanceName"
              AND o."remoteJid" = ${limpio}
         )
    `;

    if (renombradas === 0) {
      await tx.$executeRaw`
        DELETE FROM "chat_conversations"
         WHERE "userId" = ${userId}
           AND "instanceName" = ${instanceName}
           AND "remoteJid" = ${conSufijo}
      `;
    }

    return movidos;
  });
}

/**
 * Junta las conversaciones que se partieron por el sufijo de dispositivo.
 *
 * Se parte de `chat_conversations` —una fila por conversación— y no de
 * `chat_messages`: buscar el patrón sobre la tabla de mensajes es recorrerla
 * entera, y esto corre al abrir la bandeja. Con la conversación delante, los
 * mensajes se mueven por su llave exacta, que sí entra por índice.
 */
export async function unificarLasConversaciones(userIds: string[]): Promise<number> {
  if (!userIds.length) return 0;

  const parejas = await db.$queryRaw<ParejaDeConversacion[]>`
    SELECT c."userId", c."instanceName", c."remoteJid" AS "conSufijo",
           regexp_replace(c."remoteJid", ${PATRON}, '@') AS "limpio"
      FROM "chat_conversations" c
     WHERE c."userId" IN (${Prisma.join(userIds)})
       AND c."remoteJid" ~ ${PATRON}
     ORDER BY c."lastMessageTimestamp" DESC NULLS LAST
     LIMIT ${TOPE_POR_VUELTA}
  `;

  let unificadas = 0;
  for (const pareja of parejas) {
    await unificarUnaConversacion(pareja);
    unificadas += 1;
  }
  return unificadas;
}

/**
 * Pasa lo que cuelga de la ficha con sufijo a la ficha buena y quita la copia.
 *
 * Solo se toca la que cumple las CUATRO condiciones de siempre: tiene sufijo,
 * existe la ficha buena del mismo contacto en la misma línea, nadie la ha
 * tocado —sin asesor, sin nombre puesto a mano, sin estado de lead— y no se ha
 * vuelto a guardar desde que nació. Lo que cambia respecto de la primera
 * versión es que ya no es un borrado: lo suyo se mueva antes.
 */
export async function unificarLasFichas(userIds: string[]): Promise<number> {
  if (!userIds.length) return 0;

  // Las columnas van con su nombre DE LA BASE, y no todas se llaman igual que
  // el campo de Prisma: `custom_name` y `assigned_advisor_id` llevan `@map` y
  // `leadStatus` NO. En SQL en crudo Prisma no traduce, asi que escribirlas con
  // el nombre del campo es lo que tenia esta limpieza lanzando 42703 en cada
  // vuelta desde el #549. Que no se adivinan lo comprueba el banco contra
  // `information_schema`: escribiendo las tres "a juego" se rompe la que ya
  // estaba bien.
  const parejas = await db.$queryRaw<ParejaDeFicha[]>`
    SELECT mala."id" AS "malaId", buena."id" AS "buenaId",
           mala."remoteJid", mala."instanceId"
      FROM "Session" mala
      JOIN "Session" buena
        ON buena."userId" = mala."userId"
       AND buena."instanceId" = mala."instanceId"
       AND buena."id" <> mala."id"
       AND buena."remoteJid" = regexp_replace(mala."remoteJid", ${PATRON}, '@')
     WHERE mala."userId" IN (${Prisma.join(userIds)})
       AND mala."remoteJid" ~ ${PATRON}
       AND mala."assigned_advisor_id" IS NULL
       AND mala."custom_name" IS NULL
       AND mala."leadStatus" IS NULL
       AND mala."createdAt" = mala."updatedAt"
     LIMIT ${TOPE_POR_VUELTA}
  `;

  let unificadas = 0;
  for (const pareja of parejas) {
    await unificarUnaFicha(pareja);
    unificadas += 1;
  }
  return unificadas;
}

async function unificarUnaFicha(pareja: ParejaDeFicha): Promise<void> {
  const { malaId, buenaId } = pareja;

  await db.$transaction(async (tx) => {
    for (const { tabla, columna, unicaCon } of LO_QUE_CUELGA) {
      const t = Prisma.raw(`"${tabla}"`);
      const col = Prisma.raw(`"${columna}"`);

      if (UNICA_ELLA_SOLA.has(tabla) || unicaCon.length > 0) {
        // La fila que chocaria es una copia de algo que la ficha buena ya
        // tiene. Se quita; lo demas se mueve.
        const mismas = unicaCon.length
          ? Prisma.raw(unicaCon.map((c) => `AND o."${c}" = mala."${c}"`).join(" "))
          : Prisma.raw("");
        await tx.$executeRaw`
          DELETE FROM ${t} mala
           WHERE mala.${col} = ${malaId}
             AND EXISTS (
               SELECT 1 FROM ${t} o
                WHERE o.${col} = ${buenaId} ${mismas}
             )
        `;
      }

      await tx.$executeRaw`UPDATE ${t} SET ${col} = ${buenaId} WHERE ${col} = ${malaId}`;
    }

    // Las cuatro condiciones se vuelven a mirar aqui: entre el SELECT de arriba
    // y este borrado alguien pudo asignarse la ficha o ponerle nombre, y
    // entonces ya no es una copia sin estrenar.
    await tx.$executeRaw`
      DELETE FROM "Session"
       WHERE "id" = ${malaId}
         AND "assigned_advisor_id" IS NULL
         AND "custom_name" IS NULL
         AND "leadStatus" IS NULL
    `;
  });
}

/**
 * Junta lo que el sufijo de dispositivo partió en dos: las conversaciones
 * primero y las fichas después.
 *
 * El orden importa: las fichas se emparejan por `remoteJid`, así que juntar
 * antes las conversaciones deja los mensajes donde tienen que estar aunque la
 * ficha no llegue a unificarse.
 *
 * Nunca rompe la carga de la bandeja: si falla, se anota y se sigue. Y el aviso
 * dice el código de Postgres, que es el que separa "no se pudo" de "esa columna
 * no existe".
 */
export async function unificarPorSufijoDeDispositivo(userIds: string[]): Promise<void> {
  try {
    const conversaciones = await unificarLasConversaciones(userIds);
    const fichas = await unificarLasFichas(userIds);
    if (conversaciones > 0 || fichas > 0) {
      console.warn("[chats] unificadas las copias del sufijo de dispositivo", {
        conversaciones,
        fichas,
      });
    }
  } catch (error) {
    const meta = (error as { meta?: { code?: string; message?: string } })?.meta;
    console.warn("[chats] no se pudieron unificar las copias del sufijo de dispositivo", {
      error: String(error),
      codigoDePostgres: meta?.code ?? null,
      detalle: meta?.message ?? null,
    });
  }
}
