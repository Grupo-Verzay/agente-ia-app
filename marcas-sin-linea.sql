-- ============================================================================
-- Cuantas marcas de borrado "de todas las lineas" se pueden arreglar solas.
--
-- SOLO LECTURA. La transaccion se abre con BEGIN READ ONLY, asi que Postgres
-- RECHAZA cualquier escritura aunque se cuele por error: no es una promesa del
-- que escribio esto, es el motor el que no deja. Ni un UPDATE, ni un DELETE.
--
-- Que se esta mirando
-- -------------------
-- `ChatConversationPreference` guarda la marca de "chat borrado". Su columna
-- `instanceName` dice de QUE linea es la marca; las antiguas se guardaron con
-- cadena vacia y por eso valen para TODAS las lineas de la cuenta: el contacto
-- desaparece de la bandeja entera y solo vuelve si escribe.
--
-- La marca en si no sobra -alguien borro ese chat a proposito-. Lo que sobra es
-- su ALCANCE. Asi que la pregunta no es cuantas hay que borrar, sino de cuantas
-- se puede deducir a que linea pertenecian. Eso se sabe mirando en que lineas
-- tiene mensajes ese contacto:
--
--   0 lineas  -> no hay rastro local; esa marca no esta ocultando nada visible
--   1 linea   -> ASIGNABLE: es la que el asesor tenia delante al borrar
--   2 o mas   -> ambigua; no se puede saber en cual pulso
--
-- Como correrla
-- -------------
--   psql -U postgres -d ia-crm -f marcas-sin-linea.sql
--
-- Si no se puede meter el fichero en el contenedor, el bloque 3 -que es el que
-- decide el plan- cabe en UNA linea y NO lleva ni una comilla simple, asi que
-- se pega entre comillas simples sin escapar nada y sin que la consola pueda
-- romperlo:
--
-- psql -U postgres -d ia-crm -c 'WITH viejas AS ( SELECT "id", "userId", "remoteJid" FROM "ChatConversationPreference" WHERE "deletedAt" IS NOT NULL AND length("instanceName") = 0 ), lineas_del_contacto AS ( SELECT v."id", m."instanceName" FROM viejas v JOIN "chat_messages" m ON m."userId" = v."userId" AND m."remoteJid" = v."remoteJid" UNION SELECT v."id", m."instanceName" FROM viejas v JOIN "chat_messages" m ON m."userId" = v."userId" AND m."remoteJidAlt" = v."remoteJid" UNION SELECT v."id", m."instanceName" FROM viejas v JOIN "chat_messages" m ON m."userId" = v."userId" AND m."senderPn" = v."remoteJid" ), recuento AS ( SELECT v."id", count(l."instanceName") AS n_lineas FROM viejas v LEFT JOIN lineas_del_contacto l ON l."id" = v."id" GROUP BY v."id" ) SELECT n_lineas AS lineas_en_las_que_aparece, count(*) AS marcas FROM recuento GROUP BY 1 ORDER BY 1;'
--
-- (Ahi el 0 / 1 / 2+ se lee igual que arriba: 1 es ASIGNABLE.)
--
-- Comprobado
-- ----------
-- Este fichero se ejecuto contra un Postgres 16 de verdad, con el mismo
-- esquema y datos de prueba que cubren los cinco casos —una linea encontrada
-- por `remoteJid`, por `remoteJidAlt` y por `senderPn`, una ambigua de dos
-- lineas, y una sin rastro—, mas dos filas de ruido que NO deben contarse (una
-- marca que si tiene linea y otra que solo esta archivada). Clasifico las cinco
-- bien y dejo el ruido fuera. Y se comprobo que el `BEGIN READ ONLY` rechaza de
-- verdad un DELETE: "cannot execute DELETE in a read-only transaction".
--
-- ============================================================================

\timing on

BEGIN READ ONLY;

-- Techo de tiempo. La tabla de mensajes son cientos de MB; si algo saliera mal
-- planificado, esto corta a los 3 minutos en vez de dejar la base ocupada.
SET LOCAL statement_timeout = '180s';


-- ---------------------------------------------------------------------------
-- 1) El total, para confirmar que seguimos hablando del mismo numero.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. Marcas de borrado sin linea (el total) ==='

SELECT count(*) AS marcas_sin_linea
FROM "ChatConversationPreference"
WHERE "deletedAt" IS NOT NULL
  AND length("instanceName") = 0;


-- ---------------------------------------------------------------------------
-- 2) De que epoca son y de quien.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. Por cuenta y por mes ==='

SELECT u."email",
       date_trunc('month', p."createdAt")::date AS mes,
       count(*) AS marcas
FROM "ChatConversationPreference" p
JOIN "User" u ON u."id" = p."userId"
WHERE p."deletedAt" IS NOT NULL
  AND length(p."instanceName") = 0
GROUP BY 1, 2
ORDER BY 3 DESC
LIMIT 40;


-- ---------------------------------------------------------------------------
-- 3) LA QUE IMPORTA: cuantas son asignables sin ambiguedad.
--
-- Las tres columnas de identidad (`remoteJid`, `remoteJidAlt`, `senderPn`) se
-- consultan en TRES uniones separadas, una por columna, y NO con un `OR` dentro
-- de un solo JOIN. Es deliberado: un `OR` sobre tres columnas no puede usar
-- ningun indice y recorre la tabla entera una vez por marca. Con 1081 marcas
-- contra `chat_messages` eso son 1081 recorridos completos. Cada union de aqui
-- entra por su propio indice.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. Cuantas se pueden asignar (0 = sin rastro, 1 = ASIGNABLE, 2+ = ambigua) ==='

WITH viejas AS (
  SELECT "id", "userId", "remoteJid"
  FROM "ChatConversationPreference"
  WHERE "deletedAt" IS NOT NULL
    AND length("instanceName") = 0
),
lineas_del_contacto AS (
      SELECT v."id", m."instanceName"
      FROM viejas v
      JOIN "chat_messages" m
        ON m."userId" = v."userId" AND m."remoteJid" = v."remoteJid"
  UNION
      SELECT v."id", m."instanceName"
      FROM viejas v
      JOIN "chat_messages" m
        ON m."userId" = v."userId" AND m."remoteJidAlt" = v."remoteJid"
  UNION
      SELECT v."id", m."instanceName"
      FROM viejas v
      JOIN "chat_messages" m
        ON m."userId" = v."userId" AND m."senderPn" = v."remoteJid"
),
recuento AS (
  SELECT v."id",
         count(l."instanceName") AS n_lineas
  FROM viejas v
  LEFT JOIN lineas_del_contacto l ON l."id" = v."id"
  GROUP BY v."id"
)
SELECT n_lineas AS lineas_en_las_que_aparece,
       count(*) AS marcas,
       CASE
         WHEN n_lineas = 0 THEN 'sin rastro local: no oculta nada visible'
         WHEN n_lineas = 1 THEN 'ASIGNABLE: se le puede poner su linea'
         ELSE 'ambigua: hay que decidir a mano'
       END AS que_significa
FROM recuento
GROUP BY 1
ORDER BY 1;


-- ---------------------------------------------------------------------------
-- 4) Una muestra de 20, para mirarlas con ojos.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. Muestra de 20 ==='

SELECT p."remoteJid",
       p."deletedAt"::date AS borrado,
       p."createdAt"::date AS creada,
       (p."purgedAt" IS NOT NULL) AS ya_purgada
FROM "ChatConversationPreference" p
WHERE p."deletedAt" IS NOT NULL
  AND length(p."instanceName") = 0
ORDER BY p."createdAt" DESC
LIMIT 20;

COMMIT;

\echo ''
\echo 'Listo. No se escribio nada: la transaccion iba en READ ONLY.'
