import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Cuanto tarda Chats en verse, un dia y una cuenta por fila.
 *
 * ## Que vigila y por que
 *
 * El frente de rendimiento de Chats se arreglo midiendo, pero **las reglas de
 * `CLAUDE.md` protegen de que alguien las deshaga leyendo, no de que esto se
 * degrade solo**: por datos que crecen, por una consulta nueva, por una linea
 * mas. Lo que hace falta es enterarse **antes de que lo diga un cliente**, sin
 * tener que acordarse de abrir DevTools.
 *
 * ## Una fila por cuenta y dia, NO una por carga
 *
 * Con upsert. Eso acota la tabla por construccion -cincuenta clientes son
 * cincuenta filas al dia- asi que no depende de que nadie se acuerde de
 * limpiarla, que es como crecen sin freno las tablas de registro.
 *
 * ## Y se escribe SIEMPRE, buena o mala
 *
 * Guardar solo lo malo es la trampa de este diseño, y esta escrita tres veces
 * en `CLAUDE.md` con otras palabras: **una tabla vacia no distingue "todo bien"
 * de "el vigilante se rompio"**. Es el mismo fallo mudo que este proyecto
 * persigue, aplicado al propio detector.
 *
 * Escribiendo siempre, la fila del dia responde las tres:
 *
 * - hay fila y sus numeros son buenos  -> va bien de verdad
 * - hay fila y son malos               -> hay algo que mirar
 * - **no hay fila** -> o nadie abrio Chats, o **el vigilante esta roto**
 *
 * ## Es del SERVIDOR, no de tu navegador
 *
 * Se escribe con el `userId` de la cuenta cuya bandeja se abrio. Si se degrada
 * en la cuenta de un cliente, sale igual, y por eso se puede saber antes que
 * el. Lo que aporta el navegador es solo el numero que solo el sabe: cuando se
 * vio la lista.
 */

/**
 * Por encima de esto, una carga fue mala.
 *
 * Cuatro segundos. Medido tras cerrar el frente, una carga normal pinta en
 * ~1,8 s, asi que esto deja margen para un dia flojo sin encender nada. **La
 * condicion de este numero es que esté callado cuando todo va bien**: si hace
 * ruido el primer mes, sube.
 */
export const UNA_CARGA_MALA_MS = 4000;

/**
 * Lo que se descarta por absurdo.
 *
 * Una pestaña de fondo, un portatil que despierta o un reloj que salta dan
 * numeros que no son de nadie. Contarlos ensuciaria la peor carga del dia -que
 * es justo lo que se mira- con algo que no es lento, es imposible.
 */
export const UN_NUMERO_IMPOSIBLE_MS = 120_000;

/** Una carga que tarde menos que esto es un error de medida, no una carga. */
const UN_NUMERO_DEMASIADO_BUENO_MS = 20;

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
  tablaLista ??= (async () => {
    // La crea la App, como `flows` y `chat_messages`: no se toca
    // `schema.prisma` para una tabla nuestra (ver el #360 en CLAUDE.md).
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "chats_vigilancia" (
        "userId" TEXT NOT NULL,
        "dia" DATE NOT NULL,
        "cargas" INTEGER NOT NULL DEFAULT 0,
        "malas" INTEGER NOT NULL DEFAULT 0,
        "mejorMs" INTEGER NOT NULL,
        "peorMs" INTEGER NOT NULL,
        "sumaMs" BIGINT NOT NULL,
        -- De la PEOR carga del dia: sin esto se sabe que fue lenta y no donde
        -- mirar, y se vuelve a DevTools, que es lo que esto viene a evitar.
        "peorDetalle" JSONB,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "tocadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("userId", "dia")
      )
    `;
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chats_vigilancia_dia_idx"
      ON "chats_vigilancia" ("dia" DESC)
    `;
  })().catch((error) => {
    // Que no se quede pegado el fallo: la siguiente vuelve a intentarlo.
    tablaLista = null;
    throw error;
  });
  return tablaLista;
}

export type MedicionDeUnaCarga = {
  /** Desde que se monto Chats hasta que la lista ya se ve. */
  hastaQueSeVioMs: number;
  /** Los que ya se calculaban, solo para saber CUAL se movio. */
  listaMs?: number;
  bootstrapMs?: number;
  precargaProntoMs?: number;
  precargaTardeMs?: number;
  /**
   * Cuantos de los trozos medidos NO llegaron.
   *
   * Un numero alto con un tiempo bueno es otra cosa distinta que un numero
   * bajo con un tiempo malo: la pantalla no tardo, es que se pinto a medias.
   */
  noLlegaron?: number;
  lineas?: number;
  chats?: number;
};

/**
 * Anota una carga en la fila de hoy de esa cuenta.
 *
 * **Nunca revienta y nunca bloquea.** Quien llama no se entera de que esto
 * existe: una vigilancia que puede tumbar la pantalla que vigila es peor que no
 * tenerla. Pero tampoco se calla: un fallo aqui deja de escribir filas, y sin
 * el aviso eso se leeria como "va todo bien".
 */
export async function anotarUnaCarga(
  userId: string,
  medicion: MedicionDeUnaCarga,
): Promise<void> {
  const ms = Math.round(Number(medicion.hastaQueSeVioMs));
  if (!userId || !Number.isFinite(ms)) return;
  if (ms < UN_NUMERO_DEMASIADO_BUENO_MS || ms > UN_NUMERO_IMPOSIBLE_MS) return;

  const esMala = ms > UNA_CARGA_MALA_MS;

  try {
    await asegurarLaTabla();
    await db.$executeRaw`
      INSERT INTO "chats_vigilancia"
        ("userId", "dia", "cargas", "malas", "mejorMs", "peorMs", "sumaMs", "peorDetalle")
      VALUES (
        ${userId}, CURRENT_DATE, 1, ${esMala ? 1 : 0},
        ${ms}, ${ms}, ${ms},
        ${esMala ? (detalleDeLaCarga(medicion) as Prisma.InputJsonValue) : Prisma.sql`NULL`}
      )
      ON CONFLICT ("userId", "dia") DO UPDATE SET
        "cargas"  = "chats_vigilancia"."cargas" + 1,
        "malas"   = "chats_vigilancia"."malas" + ${esMala ? 1 : 0},
        "mejorMs" = LEAST("chats_vigilancia"."mejorMs", EXCLUDED."mejorMs"),
        "peorMs"  = GREATEST("chats_vigilancia"."peorMs", EXCLUDED."peorMs"),
        "sumaMs"  = "chats_vigilancia"."sumaMs" + EXCLUDED."sumaMs",
        -- El detalle es el de la PEOR del dia, no el de la ultima: si no, la
        -- carga buena de despues borraria la pista de la que hay que mirar.
        "peorDetalle" = CASE
          WHEN EXCLUDED."peorMs" > "chats_vigilancia"."peorMs"
            THEN EXCLUDED."peorDetalle"
          ELSE "chats_vigilancia"."peorDetalle"
        END,
        "tocadoEn" = NOW()
    `;
  } catch (error) {
    console.warn("[vigilancia] no se pudo anotar la carga de Chats", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function detalleDeLaCarga(m: MedicionDeUnaCarga) {
  return {
    listaMs: numeroOApagado(m.listaMs),
    bootstrapMs: numeroOApagado(m.bootstrapMs),
    precargaProntoMs: numeroOApagado(m.precargaProntoMs),
    precargaTardeMs: numeroOApagado(m.precargaTardeMs),
    noLlegaron: numeroOApagado(m.noLlegaron),
    lineas: numeroOApagado(m.lineas),
    chats: numeroOApagado(m.chats),
  };
}

function numeroOApagado(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type DiaVigilado = {
  userId: string;
  dia: string;
  cargas: number;
  malas: number;
  mejorMs: number;
  peorMs: number;
  mediaMs: number;
  peorDetalle: Record<string, number | null> | null;
};

/** Los ultimos `dias` dias, de todas las cuentas. Para la pantalla y el cron. */
export async function leerLosDiasVigilados(dias: number): Promise<DiaVigilado[]> {
  try {
    await asegurarLaTabla();
    const filas = await db.$queryRaw<
      Array<{
        userId: string;
        dia: Date;
        cargas: number;
        malas: number;
        mejorMs: number;
        peorMs: number;
        sumaMs: bigint;
        peorDetalle: Record<string, number | null> | null;
      }>
    >`
      SELECT "userId", "dia", "cargas", "malas", "mejorMs", "peorMs", "sumaMs", "peorDetalle"
      FROM "chats_vigilancia"
      WHERE "dia" >= CURRENT_DATE - ${Math.max(1, Math.min(365, dias))}::int
      ORDER BY "dia" DESC, "peorMs" DESC
    `;
    return filas.map((f) => ({
      userId: f.userId,
      dia: f.dia.toISOString().slice(0, 10),
      cargas: Number(f.cargas),
      malas: Number(f.malas),
      mejorMs: Number(f.mejorMs),
      peorMs: Number(f.peorMs),
      // `sumaMs` es BIGINT y no viaja a un componente de cliente (la misma
      // regla que el `Decimal` de `price` en Clientes).
      mediaMs: Number(f.cargas) > 0 ? Math.round(Number(f.sumaMs) / Number(f.cargas)) : 0,
      peorDetalle: f.peorDetalle,
    }));
  } catch (error) {
    console.warn("[vigilancia] no se pudieron leer los dias vigilados", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
