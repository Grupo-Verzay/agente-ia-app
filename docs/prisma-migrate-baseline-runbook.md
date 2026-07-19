# Runbook — Migrar de `db push --accept-data-loss` a `prisma migrate deploy`

> **Estado:** procedimiento para ejecución **manual y controlada** contra la BD de
> producción. El PR asociado (cambio del `Dockerfile`) **queda en BORRADOR y NO se
> mergea** hasta completar el baseline en producción (paso e). Un merge prematuro
> despliega `migrate deploy` contra una BD sin baseline y **falla el arranque (P3005)**,
> tumbando la app.

---

## 1. Problema

`Dockerfile` arrancaba así:

```
CMD ["sh","-c","DATABASE_URL=\"$DIRECT_URL\" npx prisma db push --skip-generate --accept-data-loss && node server.js"]
```

`db push --accept-data-loss` compara el `schema.prisma` contra la BD **real** y
**borra** todo objeto que el schema no declare, **en cada despliegue**. Ya causó
pérdida irrecuperable (~19.223 `deleted` + 1.085 `lastMessageDeleted`) porque esas
columnas se habían creado por SQL crudo y el schema no las declaraba.

**Objetivo:** pasar a `prisma migrate deploy` (migraciones versionadas). `migrate deploy`
**solo aplica migraciones nuevas**; **nunca** borra objetos ausentes de las migraciones.

---

## 2. La BD es compartida por dos repos

- `agente-ia-app` → `prisma/schema.prisma` (el ÚNICO que escribía el esquema, vía `db push`)
- `api-webhook` → `src/database/prisma/schema.prisma`

### Resultado de la reconciliación de schemas (paso a) — YA REALIZADA

Comparados ambos schemas (frontend = 126 modelos, backend = 83):

**Objetos que existen en la BD pero el frontend NO declara** — con `db push` estaban en
peligro; con `migrate deploy` quedan **ignorados (seguros)**:

| Objeto | Tipo | Declarado en |
|---|---|---|
| `chat_lid_map` | tabla | ningún schema (raw SQL puro) |
| `ia_credit_alerts` | tabla | solo backend (`IaCreditAlert`) |

**Objetos que la tarea marcó "en riesgo" pero YA están declarados en el frontend**
(por tanto entran en el baseline y quedan protegidos):

- `chat_messages.deleted` — declarado (`deleted Boolean @default(false)`)
- `chat_conversations.lastMessageDeleted` — declarado
- índice `Session_userId_instanceId_remoteJid_key` — declarado como `@@unique([userId, instanceId, remoteJid])`
- `session_participants`, `collab_notifications`, `crm_follow_ups_archive`,
  `sales_outcome_learning`, `sales_playbook_feedback`, `macros` — todos declarados como modelos

**Conclusión:** tras cambiar a `migrate deploy`, ningún objeto anterior corre peligro.
`chat_lid_map` e `ia_credit_alerts` dejan de estar en riesgo porque `migrate deploy`
no toca lo que no está en las migraciones.

> **Regla permanente post-migración:** nunca correr `prisma db push` ni
> `prisma migrate dev` contra producción. Los objetos raw-SQL/backend-only
> (`chat_lid_map`, `ia_credit_alerts`) solo sobreviven mientras nadie los borre;
> `migrate deploy` no los borra, pero `db push`/`migrate dev` sí podrían.

---

## 3. Drift de `passPlainTxt` (paso b) — YA RESUELTO

- Frontend: columna quitada del schema (PR #16).
- Backend: quitada del schema (commit `62a85c6`).
- **La columna NUNCA existió en la BD.** El schema la declaraba pero la tabla `User`
  real no la tenía — por eso el Agente IA fallaba con **P2022 (columna inexistente)**.
  Es decir: **no se dropeó nada**; quitarla del schema solo eliminó una referencia a una
  columna fantasma. (No pierdas tiempo buscando un `DROP` en los logs: no ocurrió.)
- Estado actual: la columna **no existe** en la BD ni en ningún schema → el baseline
  generado desde el schema del frontend es **consistente**. No requiere acción.

> Contingencia: si `migrate status`/diff en la copia (paso d) revelara que la columna
> sí existe en la BD, decidir en ese momento: (A) `ALTER TABLE "User" DROP COLUMN IF
> EXISTS "passPlainTxt";` para alinear, o (B) declararla de nuevo. La opción por defecto
> es (A) porque el código ya no la usa.

### Tarea futura (no bloquea esta migración)

Declarar `chat_lid_map` e `ia_credit_alerts` como modelos en `prisma/schema.prisma`
(en una migración additiva posterior, ya con `migrate deploy` en marcha), para que
queden **trazadas en el esquema** y no dependan de que nadie corra `db push`/`migrate dev`
por error. Hoy están seguras (ver §2), pero declararlas las hace explícitas.

---

## 4. Pre-requisitos OBLIGATORIOS

- [ ] **Backup completo** de la BD (`pg_dump`) **y verificar que restaura** en una BD vacía.
- [ ] **Copia** de la BD para probar TODO el procedimiento antes de tocar producción.
- [ ] Acceso a `DIRECT_URL` (conexión directa, no el pooler) para correr las migraciones.
- [ ] `prisma` CLI disponible (`npx prisma`).

---

## 5. Orden de ejecución (OBLIGATORIO)

> a) y b) ya están hechos (ver §2 y §3). Continúa desde c).

### c) Backup completo + verificar restauración

```bash
# Backup
pg_dump "$DIRECT_URL" -Fc -f backup_pre_baseline_$(date +%Y%m%d_%H%M%S).dump

# Verificar restauración en una BD vacía de prueba
createdb verzay_restore_test
pg_restore -d "postgres://.../verzay_restore_test" --no-owner backup_pre_baseline_*.dump
# Comprobar conteos clave (ejemplo)
psql "postgres://.../verzay_restore_test" -c 'SELECT count(*) FROM chat_messages;'
```

### d) Crear copia y probar TODO el procedimiento ahí — UN SOLO COMANDO

Usa el script `scripts/baseline-dry-run.js`, que hace de corrido: backup de prod (solo
lectura) → crea/recrea la copia → restaura → genera `0_init` → resuelve el baseline en la
copia → verifica que `migrate deploy` es no-op → verifica los objetos protegidos (§6).
Imprime **OK/FALLO por paso** y se **detiene al primer fallo**. **Nunca toca producción**
(solo el `pg_dump` de lectura); es **idempotente** (recrea la copia y no deja basura).

```bash
# Primero instala dependencias del repo si no están (para tener el CLI de prisma):
npm install

# Luego corre el dry-run. Ajusta las dos conexiones:
PROD_URL="postgres://USUARIO:CLAVE@HOST_PROD:5432/NOMBRE_BD_PROD" \
STAGING_ADMIN_URL="postgres://USUARIO:CLAVE@HOST_PRUEBA:5432/postgres" \
node scripts/baseline-dry-run.js
```

- `PROD_URL`: conexión a producción. El script la usa **solo** para `pg_dump` (lectura).
- `STAGING_ADMIN_URL`: conexión de mantenimiento del servidor de PRUEBA (termina en
  `/postgres`), con permiso `CREATEDB`. La copia se crea ahí, **no** en producción.
- Opcional: `COPY_DB_NAME` (default `verzay_baseline_dryrun`), `KEEP_COPY=1` para conservar la copia.

Si el script termina con **"✔ DRY-RUN COMPLETO"**, el baseline es seguro. Si falla en
cualquier paso, se detiene y muestra el error; **producción no se tocó**.

> El `0_init` que genera el script (en un directorio temporal) es idéntico al que hay que
> commitear a la rama para el baseline real (paso e). También hay que eliminar las 7
> migraciones vestigiales del repo antes de mergear (nunca se aplicaron vía migrate; su
> DDL ya está en la BD y el `0_init` las contiene):
>
> ```bash
> git rm -r prisma/migrations/20260622181000_add_booking_question_team_service \
>           prisma/migrations/20260705233000_add_product_order \
>           prisma/migrations/20260706001000_add_client_panel_module \
>           prisma/migrations/20260709140000_add_operator_bridge \
>           prisma/migrations/20260709143000_add_sales_learning_playbook \
>           prisma/migrations/20260718220000_add_owner_mode_enabled \
>           prisma/migrations/20260718230000_add_owner_mode_phone
> ```

### e) Baseline en PRODUCCIÓN

Solo si d) fue 100% limpio (migrate deploy = no-op, objetos protegidos intactos):

```bash
# Con DIRECT_URL apuntando a PRODUCCIÓN:
DATABASE_URL="$DIRECT_URL" npx prisma migrate resolve --applied 0_init
DATABASE_URL="$DIRECT_URL" npx prisma migrate status   # "up to date"
```

Commitear `prisma/migrations/0_init/` y `prisma/migrations/migration_lock.toml` a la
rama del PR (`claude/prisma-migrate-baseline`).

### f) RECIÉN AHÍ mergear el PR

- El PR cambia el `Dockerfile` a `migrate deploy`.
- Al mergear a `main` se dispara el despliegue (CI → GHCR → Portainer).
- El contenedor arranca con `migrate deploy` → como el baseline ya está resuelto,
  **no hay migraciones pendientes → no-op → arranca normal.**

### g) Verificar que un despliegue sin cambios de schema es un no-op

- Revisar los logs del contenedor tras el deploy: `migrate deploy` debe imprimir
  **"No pending migrations to apply."** y **cero DDL**.
- Confirmar que la app arranca y responde.

---

## 6. Verificación de objetos protegidos (correr en d y tras g)

```sql
-- Columnas raw-SQL que NO deben desaparecer
SELECT column_name FROM information_schema.columns
  WHERE table_name='chat_messages' AND column_name='deleted';           -- 1 fila
SELECT column_name FROM information_schema.columns
  WHERE table_name='chat_conversations' AND column_name='lastMessageDeleted'; -- 1 fila

-- Tablas que solo usa el backend / raw-SQL
SELECT to_regclass('public.chat_lid_map');       -- no NULL
SELECT to_regclass('public.ia_credit_alerts');   -- no NULL

-- Índice único creado CONCURRENTLY
SELECT indexname FROM pg_indexes
  WHERE indexname='Session_userId_instanceId_remoteJid_key';            -- 1 fila

-- Conteos de datos sensibles (comparar antes/después: deben ser IGUALES)
SELECT count(*) FROM chat_messages WHERE deleted = true;
SELECT count(*) FROM chat_conversations WHERE "lastMessageDeleted" = true;
```

---

## 7. Plan de ROLLBACK

**Si el paso e (baseline) sale mal o migrate status muestra drift inesperado:**
- El `migrate resolve --applied` NO ejecuta DDL, así que por sí solo no daña datos.
  Basta con **no mergear el PR** y borrar la fila del baseline si se quiere reintentar:
  `DELETE FROM "_prisma_migrations" WHERE migration_name = '0_init';`
- El arranque sigue con `db push` (rama `main` sin cambios) hasta reintentar.

**Si el paso f (deploy con migrate deploy) falla el arranque:**
1. **Revertir el merge del Dockerfile** en `main` (revert del commit) → nuevo deploy
   vuelve al arranque anterior. *(Ojo: eso reactiva `db push`; hacerlo solo como medida
   temporal de disponibilidad, e investigar antes de re-desplegar.)*
2. Alternativa rápida sin redeploy: en Portainer, override del `command` del servicio a
   `node server.js` (saltando la migración) para restaurar disponibilidad mientras se
   diagnostica.

**Si ocurriera pérdida/corrupción de datos (no debería, migrate deploy no borra):**
- Restaurar desde `backup_pre_baseline_*.dump` (probado en paso c) en una BD nueva y
  repuntar la app.

---

## 8. Criterios de aceptación

- [ ] El arranque del contenedor ya no ejecuta `db push` ni `--accept-data-loss`.
- [ ] Un despliegue sin cambios de schema es un no-op (cero DDL en logs).
- [ ] Tras el deploy, `chat_messages.deleted`, `chat_conversations.lastMessageDeleted`,
      `chat_lid_map`, `ia_credit_alerts` y `Session_userId_instanceId_remoteJid_key`
      siguen intactos (§6).
- [ ] Existe este plan de rollback escrito (§7).

## 9. Qué requiere un humano con acceso a la BD (y qué no)

**Automatizado — un solo comando `node scripts/baseline-dry-run.js`** (necesita las
credenciales pero hace toda la prueba solo, con OK/FALLO por paso):
- Backup de producción (pg_dump, lectura).
- Crear/restaurar la copia.
- Generar `0_init`.
- Resolver el baseline **en la copia**.
- Verificar el no-op de `migrate deploy` **en la copia**.
- Verificar los objetos protegidos **en la copia**.

**Requiere un humano con acceso de ESCRITURA a producción** (poco y explícito):
1. **Correr el dry-run** con las credenciales reales (paso d) — el comando de arriba.
   (No modifica prod, pero necesita la conexión de prod para el pg_dump y de prueba
   para crear la copia.)
2. **Baseline en producción** (paso e), un solo comando de escritura:
   ```bash
   DATABASE_URL="$DIRECT_URL_PROD" npx prisma migrate resolve --applied 0_init
   ```
3. **Commitear** `prisma/migrations/0_init/` a la rama del PR y **eliminar** las 7
   migraciones vestigiales (paso d, bloque `git rm`).
4. **Mergear el PR #18** (paso f) — dispara el deploy.
5. **Revisar los logs del deploy** (paso g): confirmar "No pending migrations to apply."

> Nota: quien preparó este runbook (el asistente) **no tiene acceso a la BD** desde su
> entorno (no hay `.env` con `DATABASE_URL`), por eso no pudo correr ni las verificaciones
> de lectura; todas están encapsuladas en el script para que las ejecute quien tenga las
> credenciales.
