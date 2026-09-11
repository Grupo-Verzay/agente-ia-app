-- ============================================================================
-- Cuantos contactos escriben a MAS DE UNA linea de la misma cuenta.
--
-- SOLO LECTURA: va dentro de BEGIN READ ONLY, asi que Postgres rechaza
-- cualquier escritura aunque se colara una.
--
--   psql -U postgres -d ia-crm -f contactos-en-varias-lineas.sql
--
-- Los textos van con comillas-dolar ($$...$$), no con comillas simples, asi que
-- el fichero se puede pegar tambien entre comillas simples sin escapar nada.
--
-- OJO AL LEER EL NUMERO: esto agrupa por `remoteJid` EXACTO. Un mismo contacto
-- puede estar guardado con formas distintas en cada linea -su numero en una y
-- su `@lid` en otra-, y entonces NO se cuenta aqui. O sea que el resultado es
-- un SUELO, no el total: los afectados son ese numero o mas.
-- ============================================================================

\timing on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1) El numero que se pidio.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. Contactos con conversacion en mas de una linea (suelo) ==='

SELECT count(*) AS contactos_afectados
FROM (
  SELECT "userId", "remoteJid"
  FROM "chat_conversations"
  GROUP BY 1, 2
  HAVING count(DISTINCT "instanceName") > 1
) x;

-- ---------------------------------------------------------------------------
-- 2) Repartido por cuantas lineas, y por cuenta.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. Por numero de lineas ==='

SELECT lineas, count(*) AS contactos
FROM (
  SELECT "userId", "remoteJid", count(DISTINCT "instanceName") AS lineas
  FROM "chat_conversations"
  GROUP BY 1, 2
) x
WHERE lineas > 1
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 2b. Las cuentas con mas casos ==='

SELECT u."email", count(*) AS contactos_en_varias_lineas
FROM (
  SELECT "userId", "remoteJid"
  FROM "chat_conversations"
  GROUP BY 1, 2
  HAVING count(DISTINCT "instanceName") > 1
) x
JOIN "User" u ON u."id" = x."userId"
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 3) Cuantos estan VIVOS: con mensajes en los ultimos 30 dias.
--
-- Los que importan. Un contacto que escribio a dos lineas hace un año no
-- notaria nada; el que escribe a las dos esta semana ve el solape ahora.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. De esos, los que tienen movimiento en 30 dias ==='

WITH multi AS (
  SELECT "userId", "remoteJid"
  FROM "chat_conversations"
  GROUP BY 1, 2
  HAVING count(DISTINCT "instanceName") > 1
)
SELECT count(*) AS contactos_vivos
FROM multi m
WHERE EXISTS (
  SELECT 1 FROM "chat_messages" cm
  WHERE cm."userId" = m."userId"
    AND cm."remoteJid" = m."remoteJid"
    AND cm."messageTimestamp" > now() - make_interval(days => 30)
);

-- ---------------------------------------------------------------------------
-- 4) Una muestra, para verlo con ojos: el mismo numero en varias lineas.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. Muestra: un contacto por fila, con sus lineas ==='

SELECT c."userId",
       c."remoteJid",
       count(*)                                  AS conversaciones,
       string_agg(DISTINCT c."instanceName", $$, $$) AS lineas,
       max(c."lastMessageTimestamp")             AS ultimo_mensaje
FROM "chat_conversations" c
GROUP BY 1, 2
HAVING count(DISTINCT c."instanceName") > 1
ORDER BY 5 DESC NULLS LAST
LIMIT 25;

-- ---------------------------------------------------------------------------
-- 5) Lo mismo en `Session` (la ficha de CRM), que va por `instanceId`.
--
-- Sirve de contraste: si aqui sale un numero parecido, las dos tablas estan
-- separando bien por linea y el solape es solo de pantalla.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. Contraste: lo mismo en Session ==='

SELECT count(*) AS contactos_con_sesion_en_varias_lineas
FROM (
  SELECT "userId", "remoteJid"
  FROM "Session"
  GROUP BY 1, 2
  HAVING count(DISTINCT "instanceId") > 1
) x;

COMMIT;

\echo ''
\echo 'Listo. No se escribio nada: la transaccion iba en READ ONLY.'
