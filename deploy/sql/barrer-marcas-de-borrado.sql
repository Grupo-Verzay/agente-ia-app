-- Barrido de las marcas de borrado residuales.
--
-- Contexto: hasta ahora, borrar un chat escribia una fila en
-- `ChatConversationPreference` con `deletedAt` y `purgedAt`, y esa fila se
-- quedaba para siempre. En una cuenta medida eran **1.044 de 1.200 filas**,
-- 399 de los 407 KB que bajaba la carga inicial de Chats y 871 ms de consulta.
--
-- El criterio es POR TIPO DE LINEA, el mismo que ahora aplica
-- `hardDeleteLocalChat`:
--
--   * Waha, Meta y Telegram -> la bandeja sale ENTERA de nuestra base. El
--     borrado ya se llevo las sesiones, las conversaciones y los mensajes, asi
--     que sin fila no queda nada que listar: **se borra**.
--   * Evolution (`Whatsapp`, o sin tipo) -> la lista la trae el telefono en
--     cada vuelta y el chat sigue existiendo en WhatsApp. La marca es lo unico
--     que lo mantiene fuera de la bandeja: **NO se toca**.
--
-- Se conservan tambien, en cualquier linea, las marcas de **anclado** y
-- **archivado**: esas no esconden nada, ordenan.
--
-- Y NO se tocan las filas SIN LINEA (`instanceName = ''`), que son las
-- anteriores a que la tabla guardara la columna: no se sabe de que instancia
-- son, asi que no se puede decidir por tipo.
--
-- ============================================================================
-- PASO 1 - CONTAR. No escribe nada. Ejecutar esto primero.
-- ============================================================================

SELECT
  i."instanceType",
  COUNT(*) AS filas
FROM "ChatConversationPreference" p
JOIN "Instancias" i ON i."instanceName" = p."instanceName"
WHERE p."instanceName" <> ''
  AND p."deletedAt" IS NOT NULL
  AND p."pinnedAt" IS NULL
  AND p."archivedAt" IS NULL
GROUP BY i."instanceType"
ORDER BY filas DESC;

-- Lo que este PASO 2 va a borrar, fila a fila, antes de borrarlo:

SELECT
  p."userId",
  p."instanceName",
  i."instanceType",
  p."remoteJid",
  p."deletedAt"
FROM "ChatConversationPreference" p
JOIN "Instancias" i ON i."instanceName" = p."instanceName"
WHERE p."instanceName" <> ''
  AND p."deletedAt" IS NOT NULL
  AND p."pinnedAt" IS NULL
  AND p."archivedAt" IS NULL
  AND LOWER(TRIM(COALESCE(i."instanceType", ''))) IN ('waha', 'meta', 'telegram')
ORDER BY p."deletedAt" DESC
LIMIT 50;

-- ============================================================================
-- PASO 2 - BORRAR. Solo despues de mirar el paso 1.
--
-- Va dentro de una transaccion a proposito: el `SELECT COUNT(*)` de dentro
-- dice cuantas se borraron ANTES de confirmar. Si el numero no cuadra con el
-- paso 1, se cierra con ROLLBACK y no ha pasado nada.
-- ============================================================================

BEGIN;

DELETE FROM "ChatConversationPreference" p
USING "Instancias" i
WHERE i."instanceName" = p."instanceName"
  -- Sin linea no se decide: no se sabe de que instancia es la marca.
  AND p."instanceName" <> ''
  -- Solo las borradas.
  AND p."deletedAt" IS NOT NULL
  -- Anclado y archivado se conservan. Una fila que ademas ancla o archiva no
  -- es solo una marca de borrado, y borrarla perderia la otra.
  AND p."pinnedAt" IS NULL
  AND p."archivedAt" IS NULL
  -- Y solo en las lineas cuya bandeja sale de nuestra base.
  AND LOWER(TRIM(COALESCE(i."instanceType", ''))) IN ('waha', 'meta', 'telegram');

-- Cuantas quedan. Deberian ser las de Evolution, las de anclado/archivado y
-- las que no tienen linea.
SELECT
  COUNT(*) FILTER (WHERE "deletedAt" IS NOT NULL) AS borradas_que_quedan,
  COUNT(*) FILTER (WHERE "pinnedAt" IS NOT NULL) AS ancladas,
  COUNT(*) FILTER (WHERE "archivedAt" IS NOT NULL) AS archivadas,
  COUNT(*) FILTER (WHERE "instanceName" = '') AS sin_linea,
  COUNT(*) AS total
FROM "ChatConversationPreference";

-- Si el resultado cuadra:
--   COMMIT;
-- Si no:
--   ROLLBACK;
