-- ============================================================================
-- Por que la linea "Verzay Ventas" (Waha) no contesta.
--
-- SOLO LECTURA: va dentro de BEGIN READ ONLY, asi que Postgres rechaza
-- cualquier escritura aunque se colara una. Ni un UPDATE, ni un DELETE.
--
--   psql -U postgres -d ia-crm -f linea-ventas-waha.sql
--
-- Los textos van con comillas-dolar ($$...$$) y no con comillas simples, asi
-- que el fichero entero se puede pegar tambien entre comillas simples en una
-- consola sin escapar nada.
-- ============================================================================

\timing on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1) La ficha de las dos lineas, una al lado de la otra.
--
-- Lo que el normalizador de Waha exige para NO descartar el mensaje:
--   instanceType = 'waha'  Y  instanceName = el `session` que manda Waha.
-- Si `tipo` no es waha, o el nombre no coincide con la sesion de Waha, el
-- mensaje se descarta antes de llegar a la IA.
--
-- `robot` es `bot_enabled`: apagado = el mensaje se guarda y se avisa, y ahi
-- se para. El chat se ve en el panel y la IA no contesta. Es el sintoma exacto.
--
-- `api_key_propia` es `meta_verify_token`: si la linea tiene una y no coincide
-- con la `X-Api-Key` que manda Waha, el mensaje tambien se descarta. Que una
-- linea la tenga y la otra no explica que una responda y la otra no.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 1. Las lineas de la cuenta (mirar tipo, robot y api_key_propia) ==='

SELECT i."instanceName"                          AS linea,
       i."instanceType"                          AS tipo,
       i."instanceId"                            AS instance_id,
       i."bot_enabled"                           AS robot,
       (i."meta_verify_token" IS NOT NULL)       AS api_key_propia,
       i."userId"                                AS cuenta
FROM "Instancias" i
WHERE i."instanceName" ILIKE $$%venta%$$
   OR i."instanceName" ILIKE $$%atencion%$$
   OR i."instanceName" ILIKE $$%atención%$$
ORDER BY i."instanceName";

-- ---------------------------------------------------------------------------
-- 2) ¿Hay restos con sufijo _V2?
--
-- Una linea Waha se llama IGUAL que la instancia; `_V2` no existe (ver
-- CLAUDE.md, "Una linea es UNA instancia"). Si aparece aqui un `_V2`, el numero
-- quedo partido en dos fichas y Waha puede estar hablando con la que no es.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. Restos con sufijo _V2 o nombres duplicados ==='

SELECT i."instanceName", i."instanceType", i."instanceId", i."bot_enabled"
FROM "Instancias" i
WHERE i."instanceName" LIKE $$%\_V2$$ ESCAPE $$\$$
ORDER BY i."instanceName";

SELECT lower(i."instanceName") AS nombre, count(*) AS fichas
FROM "Instancias" i
GROUP BY 1 HAVING count(*) > 1
ORDER BY 2 DESC;

-- ---------------------------------------------------------------------------
-- 3) El servidor de Waha (es de TODA la plataforma, no por linea).
--
-- Si faltara, ninguna linea Waha responderia; como "Atencion" si responde,
-- esto deberia salir lleno. Se comprueba igual para descartarlo del todo.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. Servidor de Waha configurado (Panel > Conexion) ==='

SELECT (s."waha_url"     IS NOT NULL AND btrim(s."waha_url")     <> $$$$) AS tiene_url,
       (s."waha_api_key" IS NOT NULL AND btrim(s."waha_api_key") <> $$$$) AS tiene_api_key
FROM "site_config" s;

-- ---------------------------------------------------------------------------
-- 4) ¿Esta la IA PAUSADA para tu contacto en esa linea?
--
-- `status = false` es "IA pausada por intervencion humana". Basta con que
-- alguien haya contestado a ese contacto desde el movil o desde la App para
-- que la IA se calle SOLO para el, en ESA linea. Explica que la misma cuenta
-- responda en una linea y no en la otra.
--
-- CAMBIA el numero por el del movil desde el que escribes, solo digitos.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 4. Tu contacto en cada linea: status=false es IA PAUSADA ==='

SELECT i."instanceName"  AS linea,
       s."remoteJid",
       s."remoteJidAlt",
       s."status"        AS ia_activa,
       s."updatedAt"     AS ultima_vez
FROM "Session" s
LEFT JOIN "Instancias" i
  ON i."instanceId" = s."instanceId" AND i."userId" = s."userId"
WHERE s."remoteJid"    LIKE $$%573001234567%$$
   OR s."remoteJidAlt" LIKE $$%573001234567%$$
ORDER BY s."updatedAt" DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 5) ¿Llego a guardarse ALGO de esa linea hoy?
--
-- Separa "el mensaje no llega al motor" de "llega y no se contesta":
--   filas hoy  = el webhook de Waha SI esta entrando  -> mirar robot y pausa
--   cero filas = el mensaje no llega  -> mirar el webhook en Waha y el punto 1
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 5. Mensajes guardados hoy, por linea ==='

SELECT m."instanceName" AS linea,
       count(*)                                        AS mensajes_hoy,
       count(*) FILTER (WHERE m."fromMe" = false)       AS del_cliente,
       max(m."messageTimestamp")                        AS ultimo
FROM "chat_messages" m
WHERE m."messageTimestamp" > now() - make_interval(days => 1)
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;

COMMIT;

\echo ''
\echo 'Listo. No se escribio nada: la transaccion iba en READ ONLY.'
