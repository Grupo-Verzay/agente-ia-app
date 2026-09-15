import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  colaDeLaClave,
  elegirLaLlave,
  type LlaveDeVerzay,
} from "@/lib/llaves-de-verzay-tipos";

/**
 * El registro de las llaves de OpenAI que pone Verzay.
 *
 * ## Por qué una tabla nuestra
 *
 * La llave que usa una cuenta ya vive en `user_ai_configs.apiKey`, que es del
 * BACKEND. Lo que no existía en ninguna parte es el registro de las llaves **de
 * la casa**: cómo se llama cada una, cuántas cuentas aguanta y cuál recibe a las
 * nuevas. Añadirle esas columnas a `user_ai_configs` sería el #360 otra vez: las
 * migraciones son del backend y la App no las toca.
 *
 * Así que se hace como `work_folders`, `flows` y `chats_vigilancia`: **una tabla
 * de la App, creada por la App** con `CREATE TABLE IF NOT EXISTS`.
 *
 * ## El contador no se guarda: se cuenta
 *
 * Cuántas cuentas cuelgan de una llave **no es una columna**. Es
 * `COUNT(DISTINCT "userId")` sobre `user_ai_configs` donde la clave coincide, que
 * es donde está la verdad. Un contador guardado se desincroniza en cuanto
 * alguien cambie su key desde Perfil —que es justo lo que el encargo 4 espera que
 * pase— y entonces el reparto decide sobre un número que ya no es cierto.
 *
 * Es la misma regla que ya costó los contadores de Chats: **un contador es un
 * `COUNT`, no un número guardado que alguien tiene que acordarse de mover.**
 *
 * ## La clave es un secreto de la casa
 *
 * Se guarda entera porque hay que escribirla en `user_ai_configs`, pero **no sale
 * de aquí**: lo que se devuelve a la pantalla es `cola`, los últimos cuatro
 * caracteres. Lo mismo que ya hacía `getAiKeyOriginInfo`.
 */

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
  tablaLista ??= (async () => {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "verzay_api_keys" (
        "id" TEXT PRIMARY KEY,
        "nombre" TEXT NOT NULL,
        "clave" TEXT NOT NULL,
        "porDefecto" BOOLEAN NOT NULL DEFAULT false,
        -- Cuantas cuentas aguanta. 0 = sin tope; lo decide Carlos por llave,
        -- que es el encargo: no hay un numero fijo escrito en el codigo.
        "cupo" INTEGER NOT NULL DEFAULT 0,
        "activa" BOOLEAN NOT NULL DEFAULT true,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    // La misma clave no puede estar dos veces: el contador se calcula POR la
    // clave, asi que dos filas con la misma se repartirian el mismo cupo sin
    // saberlo y las dos dirian estar llenas a la vez.
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "verzay_api_keys_clave_key"
      ON "verzay_api_keys" ("clave")
    `;
  })().catch((error) => {
    // Que el fallo no se quede pegado: la siguiente vuelve a intentarlo.
    tablaLista = null;
    throw error;
  });
  return tablaLista;
}

/**
 * Hace algo contra la tabla, y si la tabla no está, la crea y **reintenta una
 * vez**.
 *
 * El recuerdo de «ya la creé» es de este proceso, no de la base. Si la tabla
 * desaparece por debajo —una restauración, una migración, un entorno recién
 * levantado que este proceso ya visitó— el recuerdo sigue diciendo que existe y
 * **todas** las consultas fallan hasta que alguien reinicie el contenedor.
 *
 * Lo encontró el banco de pruebas: con la tabla borrada a mano, ocho
 * comprobaciones seguidas se caían con `42P01` y ninguna se recuperaba.
 *
 * El reintento es UNO: si tampoco va la segunda, el problema no es que faltara
 * la tabla y esconderlo detrás de un bucle sería peor.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
  await asegurarLaTabla();
  try {
    return await hacer();
  } catch (error) {
    if (!esTablaQueFalta(error)) throw error;
    console.warn("[llaves] la tabla del registro no estaba; se crea y se reintenta");
    tablaLista = null;
    await asegurarLaTabla();
    return hacer();
  }
}

/** `42P01` de Postgres: «relation does not exist». */
function esTablaQueFalta(error: unknown): boolean {
  const texto = error instanceof Error ? error.message : String(error);
  return texto.includes("42P01") || texto.includes("does not exist");
}

type Fila = {
  id: string;
  nombre: string;
  clave: string;
  porDefecto: boolean;
  cupo: number;
  activa: boolean;
  creadoEn: Date;
};

/** Con la clave entera. Solo para el servidor: nunca sale de este fichero. */
type LlaveConClave = LlaveDeVerzay & { clave: string };

async function leerLasFilas(): Promise<Fila[]> {
  return conLaTabla(() => db.$queryRaw<Fila[]>`
    SELECT "id", "nombre", "clave", "porDefecto", "cupo", "activa", "creadoEn"
    FROM "verzay_api_keys"
    ORDER BY "porDefecto" DESC, "nombre" ASC
  `);
}

/**
 * Cuántas cuentas cuelgan de cada clave, **de una sola consulta**.
 *
 * Por lista y no de una en una porque quien las pide es la pantalla: con una
 * consulta por llave, diez llaves son diez consultas — la regla de siempre.
 *
 * `COUNT(DISTINCT "userId")` y no `COUNT(*)`: una cuenta puede tener varias
 * filas en `user_ai_configs` —una por proveedor— y con la misma clave en dos de
 * ellas contaría doble. Es el mismo fallo que hizo que una línea de 576 chats
 * dijera 1036.
 */
async function contarCuentasPorClave(claves: string[]): Promise<Map<string, number>> {
  const cuenta = new Map<string, number>();
  if (!claves.length) return cuenta;

  const filas = await db.$queryRaw<Array<{ apiKey: string; cuantas: bigint }>>`
    SELECT "apiKey", COUNT(DISTINCT "userId")::bigint AS cuantas
    FROM "user_ai_configs"
    WHERE "apiKey" IN (${Prisma.join(claves)})
    GROUP BY "apiKey"
  `;
  for (const f of filas) cuenta.set(f.apiKey, Number(f.cuantas));
  return cuenta;
}

async function leerConClave(): Promise<LlaveConClave[]> {
  const filas = await leerLasFilas();
  const cuentas = await contarCuentasPorClave(filas.map((f) => f.clave));
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    clave: f.clave,
    cola: colaDeLaClave(f.clave),
    porDefecto: f.porDefecto,
    cupo: f.cupo,
    activa: f.activa,
    cuentas: cuentas.get(f.clave) ?? 0,
    creadoEn: f.creadoEn.toISOString(),
  }));
}

/** El registro entero, con su contador, **sin las claves**. */
export async function leerLasLlaves(): Promise<LlaveDeVerzay[]> {
  const conClave = await leerConClave();
  return conClave.map(({ clave, ...resto }) => resto);
}

/**
 * ¿Es esta clave una de las de Verzay?
 *
 * **La pregunta del encargo 4**, y por eso no acepta un `id` ni una `cola`: se
 * pregunta por la clave que la cuenta está usando AHORA. Si el cliente pone la
 * suya, deja de casar y la cuenta pasa a ilimitada sola; si la quita y vuelve la
 * nuestra, vuelve a casar. **No hay ninguna marca que nadie tenga que mover.**
 *
 * Una llave **desactivada sigue siendo de Verzay**: el interruptor decide si
 * recibe cuentas nuevas, no quién paga el consumo de las que ya tiene.
 */
export async function esLlaveDeVerzay(clave: string | null | undefined): Promise<boolean> {
  const limpia = clave?.trim();
  if (!limpia) return false;
  const filas = await conLaTabla(() => db.$queryRaw<Array<{ existe: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "verzay_api_keys" WHERE "clave" = ${limpia}
    ) AS existe
  `);
  return Boolean(filas[0]?.existe);
}

/**
 * ¿Paga el cliente su propia IA?
 *
 * Es la misma pregunta que se hace el motor antes de mirar los créditos
 * (`AiCreditsService.pagaElClienteSuIa`), y tiene que dar la **misma**
 * respuesta: si la pantalla dice «ilimitados» y el motor sigue descontando, o al
 * revés, no hay forma de saber cuál de los dos miente.
 *
 * La clave se elige igual que la elige el motor —su proveedor por defecto
 * activo, luego cualquiera activo, luego la primera— porque decidir sobre una
 * key distinta de la que el agente usa es decidir sobre otra cosa.
 *
 * **Sin key no es ilimitado.** Ese es el lado seguro: una cuenta sin
 * configuración de IA no puede correr el agente de todas formas, y darle
 * ilimitado taparía el problema de verdad.
 */
export async function pagaElClienteSuIa(userId: string): Promise<boolean> {
  try {
    const cuenta = await db.user.findUnique({
      where: { id: userId },
      select: {
        defaultProviderId: true,
        aiConfigs: { select: { providerId: true, apiKey: true, isActive: true } },
      },
    });
    if (!cuenta) return false;

    const elegida =
      (cuenta.defaultProviderId
        ? cuenta.aiConfigs.find(
            (c) => c.providerId === cuenta.defaultProviderId && c.isActive,
          ) ?? cuenta.aiConfigs.find((c) => c.providerId === cuenta.defaultProviderId)
        : undefined) ??
      cuenta.aiConfigs.find((c) => c.isActive) ??
      cuenta.aiConfigs[0];

    const clave = elegida?.apiKey?.trim();
    if (!clave) return false;

    return !(await esLlaveDeVerzay(clave));
  } catch (error) {
    // Se consume como siempre, que es el lado seguro. Pero se dice: dar
    // ilimitado por un fallo de lectura es regalar consumo que paga Verzay.
    console.warn("[llaves] no se pudo saber quien paga la IA de la cuenta", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * La clave que le toca a una cuenta NUEVA, o `null` si no hay ninguna con sitio.
 *
 * Quien decide es `elegirLaLlave`, que es puro y está probado: por defecto si le
 * cabe, si no la siguiente libre. Aquí solo se leen los datos.
 *
 * **Nunca toca a nadie.** Esta función no escribe: devuelve la clave y quien
 * crea la cuenta la escribe en `user_ai_configs`. Las cuentas que ya existen no
 * se miran siquiera, que es la condición explícita del encargo.
 */
export async function laLlaveParaUnaCuentaNueva(): Promise<{
  clave: string;
  nombre: string;
} | null> {
  try {
    const llaves = await leerConClave();
    const elegida = elegirLaLlave(llaves);
    if (!elegida) {
      if (llaves.length) {
        console.warn("[llaves] ninguna llave de Verzay tiene cupo libre", {
          registradas: llaves.length,
          activas: llaves.filter((l) => l.activa).length,
        });
      }
      return null;
    }
    return { clave: elegida.clave, nombre: elegida.nombre };
  } catch (error) {
    // Sin registro montado todavía, quien llama se queda como estaba. Pero se
    // dice: una cuenta nueva sin key es una cuenta sin IA, y eso desde fuera no
    // parece un error, parece que "el agente no contesta".
    console.warn("[llaves] no se pudo elegir llave para la cuenta nueva", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ── Escritura ────────────────────────────────────────────────────────────────

export async function guardarUnaLlave(input: {
  nombre: string;
  clave: string;
  cupo: number;
  porDefecto: boolean;
  activa: boolean;
}): Promise<string> {
  const id = randomUUID();

  await conLaTabla(() => db.$transaction(async (tx) => {
    // Por defecto hay UNA. Se apagan las demás dentro de la misma transacción:
    // con dos marcadas, `elegirLaLlave` toma la primera que aparezca y el
    // reparto deja de ser explicable.
    if (input.porDefecto) {
      await tx.$executeRaw`UPDATE "verzay_api_keys" SET "porDefecto" = false WHERE "porDefecto" = true`;
    }
    await tx.$executeRaw`
      INSERT INTO "verzay_api_keys" ("id", "nombre", "clave", "cupo", "porDefecto", "activa")
      VALUES (${id}, ${input.nombre}, ${input.clave}, ${input.cupo}, ${input.porDefecto}, ${input.activa})
    `;
  }));

  return id;
}

export async function actualizarUnaLlave(
  id: string,
  input: {
    nombre: string;
    /** Vacía = se conserva la que hay. Cambiarla mueve a todas sus cuentas. */
    clave: string | null;
    cupo: number;
    porDefecto: boolean;
    activa: boolean;
  },
): Promise<void> {
  await conLaTabla(() => db.$transaction(async (tx) => {
    if (input.porDefecto) {
      await tx.$executeRaw`
        UPDATE "verzay_api_keys" SET "porDefecto" = false
        WHERE "porDefecto" = true AND "id" <> ${id}
      `;
    }

    if (input.clave) {
      // Cambiar la clave de una llave que ya tiene cuentas: se les cambia
      // también a ellas, o el contador diría 0 y esas cuentas se quedarían
      // apuntando a una clave que ya no está registrada — o sea, tratadas como
      // "llave propia del cliente" e ilimitadas por error.
      const actual = await tx.$queryRaw<Array<{ clave: string }>>`
        SELECT "clave" FROM "verzay_api_keys" WHERE "id" = ${id}
      `;
      const anterior = actual[0]?.clave;
      if (anterior && anterior !== input.clave) {
        const movidas = await tx.$executeRaw`
          UPDATE "user_ai_configs" SET "apiKey" = ${input.clave}, "updatedAt" = NOW()
          WHERE "apiKey" = ${anterior}
        `;
        console.info("[llaves] clave cambiada; cuentas movidas con ella", { id, movidas });
      }
    }

    await tx.$executeRaw`
      UPDATE "verzay_api_keys"
      SET "nombre" = ${input.nombre},
          "cupo" = ${input.cupo},
          "porDefecto" = ${input.porDefecto},
          "activa" = ${input.activa},
          "clave" = COALESCE(${input.clave}, "clave"),
          "actualizadoEn" = NOW()
      WHERE "id" = ${id}
    `;
  }));
}

/** Una llave por su id, con la clave. Solo para el servidor. */
export async function leerUnaLlave(id: string): Promise<LlaveConClave | null> {
  const todas = await leerConClave();
  return todas.find((l) => l.id === id) ?? null;
}

/**
 * Borra una llave y **mueve sus cuentas** a otra.
 *
 * El caso real es que OpenAI bloquee la cuenta de una llave. Borrarla sin más
 * dejaría a sus cuentas apuntando a una clave muerta: el agente dejaría de
 * contestar y —peor— esa clave ya no estaría en el registro, así que el encargo
 * 4 las tomaría por «llave propia del cliente» y les daría créditos ilimitados
 * sobre una key que no funciona. **Huérfanas y sin servicio, sin un solo aviso.**
 *
 * Por eso el traspaso va **dentro de la misma transacción** que el borrado: o se
 * mueven y se borra, o no pasa ninguna de las dos cosas.
 *
 * `destinoId` solo puede faltar cuando la llave no tiene ninguna cuenta; quien
 * llama lo comprueba y se lo dice a la pantalla.
 */
export async function borrarUnaLlave(
  id: string,
  destinoId: string | null,
): Promise<{ movidas: number }> {
  return conLaTabla(() => db.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<Array<{ clave: string }>>`
      SELECT "clave" FROM "verzay_api_keys" WHERE "id" = ${id}
    `;
    const clave = filas[0]?.clave;
    if (!clave) throw new Error("Esa llave ya no estaba.");

    let movidas = 0;
    if (destinoId) {
      const destino = await tx.$queryRaw<Array<{ clave: string }>>`
        SELECT "clave" FROM "verzay_api_keys" WHERE "id" = ${destinoId}
      `;
      const claveDestino = destino[0]?.clave;
      if (!claveDestino) throw new Error("La llave de destino ya no existe.");
      if (claveDestino === clave) throw new Error("El destino no puede ser la misma llave.");

      movidas = await tx.$executeRaw`
        UPDATE "user_ai_configs" SET "apiKey" = ${claveDestino}, "updatedAt" = NOW()
        WHERE "apiKey" = ${clave}
      `;
    }

    await tx.$executeRaw`DELETE FROM "verzay_api_keys" WHERE "id" = ${id}`;
    return { movidas };
  }));
}
