-- ============================================================================
-- Contactos con varias lineas a los que solo se les ve UNA.
--
-- SOLO LECTURA: BEGIN READ ONLY, asi que Postgres rechaza cualquier escritura.
-- Textos con comillas-dolar ($$...$$): se pega sin escapar nada.
--
--   psql -U postgres -d ia-crm -f lineas-ocultas-por-marca-antigua.sql
--
-- QUE BUSCA
-- ---------
-- La lista esconde una fila cuando su marca dice "borrada" o "archivada". La
-- marca se elige asi (`elegirPreferenciaDelChat`): primero la de SU linea y, si
-- esa linea no tiene ninguna, **se cae a la marca ANTIGUA sin linea** —una de
-- las 1081 que ya contamos—, que vale para todas.
--
-- De ahi el sintoma: el mismo contacto en Ventas y en Atencion, Ventas con
-- marca propia viva (se ve) y Atencion sin marca propia, que hereda la antigua
-- y desaparece. Las dos conversaciones existen; solo se pinta una.
--
-- La marca borrada se LEVANTA si el contacto escribio despues, asi que aqui se
-- descartan esas: solo cuentan las filas que de verdad quedan ocultas.
-- ============================================================================

\timing on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';

\echo ''
\echo '=== 1. Contactos con varias lineas y ALGUNA oculta por la marca antigua ==='

WITH multi AS (
  SELECT "userId", "remoteJid"
  FROM "chat_conversations"
  GROUP BY 1, 2
  HAVING count(DISTINCT "instanceName") > 1
),
antigua AS (
  SELECT "userId", "remoteJid", "deletedAt", "archivedAt"
  FROM "ChatConversationPreference"
  WHERE length("instanceName") = 0
    AND ("deletedAt" IS NOT NULL OR "archivedAt" IS NOT NULL)
),
ocultas AS (
  SELECT c."userId", c."remoteJid", c."instanceName"
  FROM "chat_conversations" c
  JOIN multi    m ON m."userId" = c."userId" AND m."remoteJid" = c."remoteJid"
  JOIN antigua  v ON v."userId" = c."userId" AND v."remoteJid" = c."remoteJid"
  -- Esa linea NO tiene marca propia: por eso hereda la antigua.
  LEFT JOIN "ChatConversationPreference" propia
    ON propia."userId"       = c."userId"
   AND propia."instanceName" = c."instanceName"
   AND propia."remoteJid"    = c."remoteJid"
  WHERE propia."id" IS NULL
    AND (
      -- Archivada: se esconde sin mas.
      v."archivedAt" IS NOT NULL
      -- Borrada y NO levantada: el ultimo no es del contacto, o es anterior.
      OR (
        v."deletedAt" IS NOT NULL
        AND (
          c."lastMessageFromMe" IS DISTINCT FROM false
          OR c."lastMessageTimestamp" IS NULL
          OR c."lastMessageTimestamp" <= v."deletedAt"
        )
      )
    )
)
SELECT count(DISTINCT ("userId", "remoteJid")) AS contactos_afectados,
       count(*)                                AS conversaciones_ocultas
FROM ocultas;

\echo ''
\echo '=== 2. Muestra: que linea se ve y cual no ==='

WITH multi AS (
  SELECT "userId", "remoteJid"
  FROM "chat_conversations"
  GROUP BY 1, 2
  HAVING count(DISTINCT "instanceName") > 1
),
antigua AS (
  SELECT "userId", "remoteJid", "deletedAt", "archivedAt"
  FROM "ChatConversationPreference"
  WHERE length("instanceName") = 0
    AND ("deletedAt" IS NOT NULL OR "archivedAt" IS NOT NULL)
)
SELECT c."remoteJid",
       c."instanceName"                       AS linea,
       (propia."id" IS NOT NULL)               AS tiene_marca_propia,
       c."lastMessageFromMe"                   AS ultimo_es_mio,
       c."lastMessageTimestamp"                AS ultimo,
       v."deletedAt"::date                     AS marca_antigua_borrada,
       CASE
         WHEN propia."id" IS NOT NULL THEN $$se ve (marca propia)$$
         WHEN v."archivedAt" IS NOT NULL THEN $$OCULTA (archivada antigua)$$
         WHEN v."deletedAt" IS NOT NULL
          AND (c."lastMessageFromMe" IS DISTINCT FROM false
               OR c."lastMessageTimestamp" IS NULL
               OR c."lastMessageTimestamp" <= v."deletedAt")
           THEN $$OCULTA (borrada antigua)$$
         ELSE $$se ve (marca levantada)$$
       END                                     AS que_pasa
FROM "chat_conversations" c
JOIN multi   m ON m."userId" = c."userId" AND m."remoteJid" = c."remoteJid"
JOIN antigua v ON v."userId" = c."userId" AND v."remoteJid" = c."remoteJid"
LEFT JOIN "ChatConversationPreference" propia
  ON propia."userId"       = c."userId"
 AND propia."instanceName" = c."instanceName"
 AND propia."remoteJid"    = c."remoteJid"
ORDER BY c."remoteJid", c."instanceName"
LIMIT 40;

\echo ''
\echo '=== 3. Por cuenta ==='

WITH multi AS (
  SELECT "userId", "remoteJid"
  FROM "chat_conversations"
  GROUP BY 1, 2
  HAVING count(DISTINCT "instanceName") > 1
),
antigua AS (
  SELECT "userId", "remoteJid", "deletedAt", "archivedAt"
  FROM "ChatConversationPreference"
  WHERE length("instanceName") = 0
    AND ("deletedAt" IS NOT NULL OR "archivedAt" IS NOT NULL)
)
SELECT u."email", count(DISTINCT c."remoteJid") AS contactos
FROM "chat_conversations" c
JOIN multi   m ON m."userId" = c."userId" AND m."remoteJid" = c."remoteJid"
JOIN antigua v ON v."userId" = c."userId" AND v."remoteJid" = c."remoteJid"
JOIN "User"  u ON u."id" = c."userId"
LEFT JOIN "ChatConversationPreference" propia
  ON propia."userId"       = c."userId"
 AND propia."instanceName" = c."instanceName"
 AND propia."remoteJid"    = c."remoteJid"
-- La MISMA condicion del bloque 1, no solo "le falta marca propia": si no, este
-- numero sale mas alto que aquel y no se entiende por que.
WHERE propia."id" IS NULL
  AND (
    v."archivedAt" IS NOT NULL
    OR (
      v."deletedAt" IS NOT NULL
      AND (
        c."lastMessageFromMe" IS DISTINCT FROM false
        OR c."lastMessageTimestamp" IS NULL
        OR c."lastMessageTimestamp" <= v."deletedAt"
      )
    )
  )
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;

COMMIT;

\echo ''
\echo 'Listo. No se escribio nada: la transaccion iba en READ ONLY.'
