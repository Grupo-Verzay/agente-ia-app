import { db } from "@/lib/db";

/**
 * DDL de "asegurar al usar" que NUNCA puede dejar la base en cola.
 *
 * Esta App crea en caliente columnas e índices que le faltan (no corre
 * migraciones al desplegar), y lo hace una vez por proceso: en cada arranque y
 * en cada una de las dos réplicas. Lo peligroso es que un
 * `ALTER TABLE … ADD COLUMN IF NOT EXISTS` pide un candado EXCLUSIVO sobre la
 * tabla aunque la columna ya exista, y un `CREATE INDEX IF NOT EXISTS` pide un
 * candado de lectura compartida que frena las escrituras. Si hay una consulta
 * larga leyendo esa tabla, el ALTER se pone en cola… y TODO lo que llega detrás
 * —cada lectura de Session, de las preferencias de Chats— se pone en cola
 * detrás del ALTER. El pool se agota y la plataforma entera sale en
 * «mantenimiento». Así se cayó el 2026-10-05.
 *
 * Dos reglas, y hacen falta las dos:
 *  1. Primero se PREGUNTA al catálogo (`information_schema`, `pg_indexes`),
 *     que no toma candado sobre la tabla. Si ya está, no se ejecuta nada: es el
 *     caso de siempre en producción.
 *  2. Lo que falte se ejecuta con `lock_timeout`: si no consigue el candado en
 *     unos segundos se rinde con un error, en vez de quedarse en la cola
 *     bloqueando a los demás. La promesa de quien llama se olvida y se
 *     reintenta en la próxima llamada.
 */

export const ESPERA_MAXIMA_DEL_CANDADO = "3s";

export async function columnaExiste(tabla: string, columna: string): Promise<boolean> {
  const filas = await db.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${tabla} AND column_name = ${columna}
    LIMIT 1
  `;
  return filas.length > 0;
}

export async function tablaExiste(tabla: string): Promise<boolean> {
  const filas = await db.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = ${tabla}
    LIMIT 1
  `;
  return filas.length > 0;
}

export async function indiceExiste(nombre: string): Promise<boolean> {
  const filas = await db.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname = ${nombre}
    LIMIT 1
  `;
  return filas.length > 0;
}

/** Ejecuta un DDL con un plazo para conseguir el candado. */
export async function ddlSinBloquear(sql: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${ESPERA_MAXIMA_DEL_CANDADO}'`);
    await tx.$executeRawUnsafe(sql);
  });
}

/** `ALTER TABLE … ADD COLUMN` solo si la columna no está. */
export async function asegurarColumna(tabla: string, columna: string, sql: string): Promise<void> {
  if (await columnaExiste(tabla, columna)) return;
  await ddlSinBloquear(sql);
}

/** `CREATE INDEX` (no CONCURRENTLY) solo si el índice no está. */
export async function asegurarIndice(nombre: string, sql: string): Promise<void> {
  if (await indiceExiste(nombre)) return;
  await ddlSinBloquear(sql);
}

/**
 * `CREATE TABLE` solo si la tabla no está. Con dos réplicas arrancando a la vez
 * las dos pueden creerla ausente: el que llega segundo recibe «ya existe»
 * (`42P07`, o `23505` en el catálogo) y eso es éxito, no fallo.
 */
export async function asegurarTabla(tabla: string, sql: string): Promise<void> {
  if (await tablaExiste(tabla)) return;
  try {
    await ddlSinBloquear(sql);
  } catch (error) {
    if (await tablaExiste(tabla)) return;
    throw error;
  }
}
