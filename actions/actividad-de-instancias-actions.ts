"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import {
    DIAS_DE_ACTIVIDAD,
    type LineaConActividad,
    type VistaDeLaActividad,
} from "@/lib/actividad-de-instancias";

/**
 * De dónde salen los tres conteos de «Actividad de instancias».
 *
 * ## El universo de líneas es `Instancias`, NUNCA los mensajes
 *
 * Es la decisión que sostiene la tarjeta entera. Agrupando `chat_messages` por
 * línea, una línea sin un solo mensaje **no tiene ninguna fila**, así que no
 * aparecería en el resultado: las rojas —lo único que esta tarjeta existe para
 * encontrar— desaparecerían justo del conteo que las cuenta. Se parte de las
 * líneas registradas y los mensajes se le pegan con un `LEFT JOIN`; sin
 * mensajes, ceros, y el cero es el dato.
 *
 * ## Qué cuenta como qué
 *
 * - **recibidos**: `fromMe = false`. Es lo que no se puede fingir: si entran,
 *   el webhook llega y la sesión está viva.
 * - **respuestas de la IA**: `fromMe = true` con `raw.sentByAi`. Esa marca la
 *   escribe el motor al enviar por el agente (`webhook.service.ts` y
 *   `workflow.service.ts`), y el `ON CONFLICT` de `persistChatMessage` la
 *   conserva a propósito cuando el sondeo de Evolution vuelve a guardar el
 *   mismo mensaje sin ella.
 * - **escritos por personas**: `fromMe = true` sin esa marca.
 *
 * **Y una advertencia que hay que saber para leer la columna**: los
 * seguimientos, los recordatorios y las campañas del motor **no escriben
 * `sentByAi`** (comprobado: ni `follow-up-runner` ni `reminders-runner` la
 * ponen). Así que suman en «personas» aunque no las escribiera nadie. No
 * afecta al color —siguen sin ser respuestas de la IA— pero sí a la columna:
 * una cuenta con muchos seguimientos parece más atendida de lo que está. El
 * día que el motor marque esos envíos, esta columna mejora sola.
 *
 * ## Los grupos entran, y es a propósito
 *
 * La regla de CLAUDE.md —toda consulta de CRM excluye los grupos— no aplica
 * aquí: esto no cuenta leads, cuenta **si pasan mensajes**. Un mensaje de
 * grupo demuestra que la línea está viva igual que cualquier otro, y filtrarlo
 * pintaría de rojo una línea que funciona.
 *
 * ## Es solo para el superadministrador
 *
 * Como la vigilancia de Chats: la puerta está **aquí** y no en la pantalla.
 * Devuelve `null` a quien no sea, así que el bloque ni se pinta. Y
 * «superadministrador» es la CUENTA por la que se actúa, no la persona —el
 * equipo de la casa se crea con rol `user`—, así que se pregunta por
 * `cuentaQueManda`, igual que el resto del panel.
 */
export async function leerLaActividadDeInstancias(): Promise<VistaDeLaActividad | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    const cuenta = await cuentaQueManda(user);
    if (!isSuperAdmin(cuenta.role)) return null;

    const empezo = Date.now();
    try {
        const lineas = await db.$queryRaw<LineaConActividad[]>`
            WITH actividad AS (
                SELECT
                    m."userId",
                    m."instanceName",
                    COUNT(*) FILTER (WHERE NOT m."fromMe")::int AS recibidos,
                    COUNT(*) FILTER (
                        WHERE m."fromMe" AND (m."raw" ->> 'sentByAi') = 'true'
                    )::int AS ia,
                    COUNT(*) FILTER (
                        WHERE m."fromMe" AND (m."raw" ->> 'sentByAi') IS DISTINCT FROM 'true'
                    )::int AS humanos
                FROM "chat_messages" m
                -- El ::int no sobra: Prisma manda el parámetro sin tipo y
                -- make_interval solo acepta int, así que sin el molde la
                -- consulta puede caer con «no existe la función».
                WHERE m."messageTimestamp" >= NOW() - make_interval(days => ${DIAS_DE_ACTIVIDAD}::int)
                GROUP BY 1, 2
            ),
            -- Una línea puede tener más de una fila en Instancias (restos de
            -- cambios de proveedor). Sin esto saldría dos veces y los conteos
            -- grandes contarían la misma línea dos veces.
            -- (Y sin acentos graves aquí dentro: cerrarían el template.)
            lineas AS (
                SELECT DISTINCT ON (i."userId", i."instanceName")
                    i."userId", i."instanceName", i."display_name"
                FROM "Instancias" i
                ORDER BY i."userId", i."instanceName", i."id"
            )
            SELECT
                l."userId",
                l."instanceName",
                COALESCE(NULLIF(TRIM(l."display_name"), ''), l."instanceName") AS "nombreDeLinea",
                COALESCE(NULLIF(TRIM(u."name"), ''), NULLIF(TRIM(u."email"), ''), l."userId")
                    AS "nombreDeCuenta",
                COALESCE(a.recibidos, 0)::int AS recibidos,
                COALESCE(a.ia, 0)::int        AS "respuestasIa",
                COALESCE(a.humanos, 0)::int   AS "escritosPorHumanos"
            FROM lineas l
            LEFT JOIN "User" u ON u."id" = l."userId"
            LEFT JOIN actividad a
                   ON a."userId" = l."userId"
                  AND a."instanceName" = l."instanceName"
        `;

        const tardoMs = Date.now() - empezo;
        // El mismo umbral que el resto de medidas del panel. Su presencia
        // significa que la ventana de 7 días ya no cabe en el BRIN y hay que
        // volver a mirar el plan, no que la pantalla esté rota.
        if (tardoMs > 300) {
            console.warn("[actividad] la consulta de actividad de instancias va cara", {
                tardoMs,
                lineas: lineas.length,
            });
        }

        return { lineas };
    } catch (error) {
        // Sin esto, un fallo aquí se ve como una tarjeta que no está: ni error,
        // ni hueco, ni motivo. Es el fallo mudo de siempre.
        console.warn("[actividad] no se pudo leer la actividad de instancias", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
