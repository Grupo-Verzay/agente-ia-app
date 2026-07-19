# Propiedad del esquema de la BD y migraciones

## Resumen

- La BD PostgreSQL es **compartida** por dos servicios: `agente-ia-app` (frontend) y
  `api-webhook` (backend).
- **El backend (`api-webhook`) es el ÚNICO dueño de las migraciones.** Corre
  `prisma migrate deploy` en su arranque y mantiene la tabla `_prisma_migrations`.
- **El frontend NO gestiona el esquema.** Su arranque es solo `node server.js`.
- **Todo cambio de esquema de aquí en adelante se hace con una migración en el repo
  del BACKEND** (`api-webhook`), nunca desde el frontend.

## Qué se cambió y por qué

El `Dockerfile` del frontend arrancaba con:

```
CMD ["sh","-c","DATABASE_URL=\"$DIRECT_URL\" npx prisma db push --skip-generate --accept-data-loss && node server.js"]
```

`db push --accept-data-loss` comparaba el `schema.prisma` del frontend contra la BD y
**borraba** todo objeto que ese schema no declarara, **en cada despliegue**. Ya causó
pérdida irrecuperable (~19.223 `deleted` + 1.085 `lastMessageDeleted`).

Se cambió a:

```
CMD ["sh","-c","node server.js"]
```

**No** se reemplazó por `migrate deploy`, porque la BD es compartida y solo hay una tabla
`_prisma_migrations`, que **ya administra el backend**. Si el frontend corriera
`migrate deploy` con su propia carpeta de migraciones, vería las 10 migraciones del
backend como desconocidas → divergencia → fallaría el arranque de ambos servicios.

## Por qué el frontend sigue arrancando sin `db push`

Quitar `db push` **no** borra nada ni cambia el esquema: la BD ya contiene todas las
tablas/columnas que el cliente Prisma del frontend espera (las fue creando `db push`
históricamente, y el backend mantiene las suyas). El frontend genera su cliente Prisma
en build (`prisma generate`) y en runtime solo consulta; no necesita sincronizar el
esquema al arrancar.

> Verificación post-deploy (paso e del encargo): tras desplegar, confirmar que la app
> arranca y responde normalmente. Si apareciera un `P2022` (columna inexistente) sería
> señal de que el esquema del frontend espera algo que la BD no tiene → habría que
> agregarlo con una **migración en el backend** (no reactivar `db push`).

## Cómo cambiar el esquema de ahora en adelante

1. Editar el modelo en `api-webhook/src/database/prisma/schema.prisma`.
2. Generar la migración en el **backend**:
   `npx prisma migrate dev --name <cambio> --schema=src/database/prisma/schema.prisma`
   (en desarrollo/copia; nunca `migrate dev` contra producción).
3. Al desplegar el backend, su arranque corre `migrate deploy` y aplica el cambio.
4. Si el **frontend** necesita el nuevo campo en su cliente Prisma, replicar la
   declaración del modelo en `agente-ia-app/prisma/schema.prisma` (solo para generar el
   cliente) — pero **sin** ejecutar migraciones desde el frontend.

## Pendiente — las 7 migraciones huérfanas del frontend

En `agente-ia-app/prisma/migrations/` quedan 7 carpetas que **nunca se aplicaron vía
Prisma** (sus cambios entraron por `db push`) y por tanto **no están registradas** en
`_prisma_migrations`:

```
20260622181000_add_booking_question_team_service
20260705233000_add_product_order
20260706001000_add_client_panel_module
20260709140000_add_operator_bridge
20260709143000_add_sales_learning_playbook
20260718220000_add_owner_mode_enabled
20260718230000_add_owner_mode_phone
```

Sus cambios **YA están en la BD**. Para dejar el historial consistente (opción
recomendada por la revisión):

1. Portar esas 7 carpetas al repo del **backend**
   (`api-webhook/src/database/prisma/migrations/`).
2. Marcarlas como aplicadas en producción **sin re-ejecutarlas** (sus objetos ya existen):
   ```bash
   # Repo backend, con acceso de escritura a la BD:
   for m in 20260622181000_add_booking_question_team_service \
            20260705233000_add_product_order \
            20260706001000_add_client_panel_module \
            20260709140000_add_operator_bridge \
            20260709143000_add_sales_learning_playbook \
            20260718220000_add_owner_mode_enabled \
            20260718230000_add_owner_mode_phone; do
     npx prisma migrate resolve --applied "$m" --schema=src/database/prisma/schema.prisma
   done
   ```
3. Luego eliminar esas carpetas de `agente-ia-app/prisma/migrations/`.

> Alternativa: si se decide **no** portarlas, dejar constancia de que esos cambios
> (`booking_questions.teamServiceId`, `Product.order`, panel de cliente, operator bridge,
> sales learning/playbook, `User.owner_mode_enabled`, `User.owner_mode_phone`) están en
> la BD pero **fuera del historial de migraciones**.

## Objetos que existen en la BD y ningún schema declara

- `chat_lid_map` (tabla raw-SQL) e `ia_credit_alerts` (tabla que declara el backend).
- Con el frontend sin `db push` y el backend usando `migrate deploy`, **ninguno los
  borra**. Tarea futura opcional: declararlos como modelos para dejarlos trazados.

## Regla permanente

**Nunca** correr `prisma db push` ni `prisma migrate dev` contra producción desde ningún
repo. Los cambios de esquema van por migraciones versionadas en el **backend**.
