# prisma/ — base de datos

`schema.prisma` describe la base PostgreSQL **compartida** con el backend
(`api-webhook`). `migrations/` es histórico.

## Reglas de este módulo

- **El backend es el ÚNICO dueño de las migraciones** (`prisma migrate
  deploy` en su arranque). Este repo nunca hace `db push` ni migra: ya borró
  datos de forma irrecuperable. Un cambio de esquema = migración en `api-webhook`.
- Tablas propias de la App que no están en el esquema: SQL en crudo con los
  nombres de columna de la BASE, creadas con `lib/ddl-sin-bloquear.ts`
  (mira el catálogo primero, `lock_timeout` de 3 s, índices sin bloquear).
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS` pide candado exclusivo aunque la
  columna exista: tumbó la plataforma el 2026-10-05. Nunca a pelo.
- Para barrer por fecha sin cuenta, un índice BRIN.
- Una línea muerta no tiene filas: se cuenta desde `Instancias`.

## Detalle

- `docs/db-migrations-ownership.md`
- `docs/reglas/infraestructura-y-despliegue.md`
