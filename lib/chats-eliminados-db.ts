import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  laLapidaQueManda,
  type AlcanceDeLaLapida,
  type Lapida,
} from "@/lib/chats-eliminados";

/**
 * Dónde vive la lápida de un chat o un lead eliminado: `chats_eliminados`, una
 * fila por (línea, identidad del contacto).
 *
 * Tabla de la App con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**. Ni
 * una columna en `Session` ni en `chat_messages`: las dos las escribe también
 * el backend, y añadirles columnas desde aquí es lo que reventó el #360. El
 * backend LEE esta tabla (con la misma regla, copiada) y tolera que no exista.
 *
 * La llave es la LÍNEA y no la cuenta, a propósito: la conversación de una
 * línea se guarda a veces bajo la cuenta de quien la mira (la bandeja
 * unificada), y la lápida tiene que tapar todas esas copias.
 *
 * Las filas de una misma eliminación comparten `grupo`: un contacto tiene
 * varias identidades (`remoteJid`, `remoteJidAlt`, `senderPn`, su `@lid`) y un
 * mensaje llega por una sola. Revivir o devolver la conversación se hace por el
 * grupo, para que valga para todas las identidades a la vez.
 *
 * No usa `server-only` a propósito: lo importa `lib/chat-persistence.ts`, que
 * tampoco lo lleva, y una docena de bancos empaquetan ese fichero.
 */

let tablaLista: Promise<void> | null = null;

/** Solo se traga «ya existe»: con dos réplicas el `IF NOT EXISTS` no basta. */
async function ddl(ejecutar: () => Promise<unknown>): Promise<void> {
  try {
    await ejecutar();
  } catch (error) {
    const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
    const codigo = String(e?.meta?.code ?? e?.code ?? "");
    const texto = String(e?.message ?? "");
    const yaEstaba = ["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c));
    if (!yaEstaba) throw error;
  }
}

export function asegurarLaTablaDeEliminados(): Promise<void> {
  tablaLista ??= (async () => {
    await ddl(() => db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "chats_eliminados" (
        "instanceName" TEXT NOT NULL,
        "remoteJid" TEXT NOT NULL,
        "userId" TEXT,
        "grupo" TEXT NOT NULL,
        "alcance" TEXT NOT NULL,
        "eliminadoEn" TIMESTAMP(3) NOT NULL,
        "historialHasta" TIMESTAMP(3),
        "revividoEn" TIMESTAMP(3),
        PRIMARY KEY ("instanceName", "remoteJid")
      )
    `);
    // Revivir y devolver van por el grupo.
    await ddl(() => db.$executeRaw`
      CREATE INDEX IF NOT EXISTS "chats_eliminados_grupo_idx"
      ON "chats_eliminados" ("grupo")
    `);
  })().catch((error) => {
    tablaLista = null;
    throw error;
  });
  return tablaLista;
}

function codigoDePostgres(error: unknown): string {
  const e = error as { code?: string; meta?: { code?: string }; message?: string };
  const codigo = e?.meta?.code ?? e?.code ?? "";
  if (codigo === "42P01") return codigo;
  return String(e?.message ?? "").includes("42P01") ? "42P01" : codigo;
}

/**
 * Reintenta UNA vez si falta la tabla. El recuerdo de «ya la creé» es del
 * proceso, no de la base: si alguien la quita por debajo, sin esto cada
 * mensaje fallaría hasta reiniciar.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
  await asegurarLaTablaDeEliminados();
  try {
    return await hacer();
  } catch (error) {
    if (codigoDePostgres(error) !== "42P01") throw error;
    tablaLista = null;
    await asegurarLaTablaDeEliminados();
    return hacer();
  }
}

export type FilaDeLapida = Lapida & {
  instanceName: string;
  remoteJid: string;
  grupo: string;
  userId: string | null;
};

function limpias(identidades: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(identidades.map((i) => (i ?? "").trim()).filter(Boolean)),
  );
}

/** Las lápidas de un contacto en una línea, por cualquiera de sus identidades. */
export async function lasLapidasDelContacto(
  instanceName: string | null | undefined,
  identidades: readonly (string | null | undefined)[],
): Promise<FilaDeLapida[]> {
  const linea = (instanceName ?? "").trim();
  const jids = limpias(identidades);
  if (!linea || jids.length === 0) return [];
  return conLaTabla(() => db.$queryRaw<FilaDeLapida[]>`
    SELECT "instanceName", "remoteJid", "userId", "grupo", "alcance",
           "eliminadoEn", "historialHasta", "revividoEn"
    FROM "chats_eliminados"
    WHERE "instanceName" = ${linea}
      AND "remoteJid" = ANY(${jids}::text[])
  `);
}

export type LapidaDelContacto = {
  lapida: FilaDeLapida;
  /** Los grupos de TODAS las filas encontradas: revivir los cubre a todos. */
  grupos: string[];
};

export async function laLapidaDelContacto(
  instanceName: string | null | undefined,
  identidades: readonly (string | null | undefined)[],
): Promise<LapidaDelContacto | null> {
  const filas = await lasLapidasDelContacto(instanceName, identidades);
  const lapida = laLapidaQueManda(filas);
  if (!lapida) return null;
  return { lapida, grupos: Array.from(new Set(filas.map((f) => f.grupo))) };
}

export type PonerLapidas = {
  instanceName: string;
  /** Un elemento por CONTACTO, con todas sus identidades. */
  contactos: readonly (readonly (string | null | undefined)[])[];
  userId: string | null;
  alcance: AlcanceDeLaLapida;
  eliminadoEn: Date;
};

/** Cuántas filas entran en una sentencia: van por `unnest`, son seis parámetros. */
const LAPIDAS_POR_SENTENCIA = 2000;

/**
 * Escribe la lápida de una eliminación, bajo TODAS las identidades de cada
 * contacto, y cada contacto con su propio `grupo` —revivir a uno no puede
 * revivir a los demás de la misma tanda—.
 *
 * Volver a eliminar renueva la marca y deshace el «revivido». Dos detalles:
 *
 * - `historialHasta` es hasta dónde se borró el HISTORIAL. Solo lo mueve
 *   eliminar el chat; eliminar después solo el lead no lo toca, para que lo
 *   que se borró con el chat no vuelva por esa puerta.
 * - Eliminar solo el lead encima de un chat eliminado que nadie revivió no
 *   rebaja el alcance a «ficha»: el chat sigue eliminado.
 *
 * Una eliminación MÁS VIEJA que la guardada no pisa nada (la fase 2 del
 * borrado en bloque repite la de la fase 1 con su misma hora), y a la misma
 * hora no se deshace un revivido que ya ocurrió.
 */
export async function ponerLapidas(
  cliente: Prisma.TransactionClient | typeof db,
  entrada: PonerLapidas,
): Promise<number> {
  const linea = entrada.instanceName.trim();
  if (!linea) return 0;

  // Una identidad, una fila: dos contactos no pueden compartirla, y
  // `ON CONFLICT` no puede tocar la misma fila dos veces en una sentencia.
  const jids: string[] = [];
  const grupos: string[] = [];
  const vistas = new Set<string>();
  for (const contacto of entrada.contactos) {
    const grupo = randomUUID();
    for (const jid of limpias(contacto)) {
      if (vistas.has(jid)) continue;
      vistas.add(jid);
      jids.push(jid);
      grupos.push(grupo);
    }
  }
  if (jids.length === 0) return 0;

  const cuando = entrada.eliminadoEn;
  const historial = entrada.alcance === "chat" ? cuando : null;
  let escritas = 0;
  for (let i = 0; i < jids.length; i += LAPIDAS_POR_SENTENCIA) {
    const trozoJids = jids.slice(i, i + LAPIDAS_POR_SENTENCIA);
    const trozoGrupos = grupos.slice(i, i + LAPIDAS_POR_SENTENCIA);
    escritas += await cliente.$executeRaw`
      INSERT INTO "chats_eliminados"
        ("instanceName", "remoteJid", "userId", "grupo", "alcance",
         "eliminadoEn", "historialHasta", "revividoEn")
      SELECT ${linea}, u.jid, ${entrada.userId}, u.grupo, ${entrada.alcance},
             ${cuando}::timestamp(3), ${historial}::timestamp(3), NULL
      FROM unnest(${trozoJids}::text[], ${trozoGrupos}::text[]) AS u(jid, grupo)
      ON CONFLICT ("instanceName", "remoteJid") DO UPDATE SET
        "eliminadoEn" = EXCLUDED."eliminadoEn",
        "historialHasta" = CASE
          WHEN EXCLUDED."alcance" = 'chat' THEN EXCLUDED."eliminadoEn"
          ELSE "chats_eliminados"."historialHasta"
        END,
        "alcance" = CASE
          WHEN EXCLUDED."alcance" = 'ficha'
           AND "chats_eliminados"."alcance" = 'chat'
           AND "chats_eliminados"."revividoEn" IS NULL THEN 'chat'
          ELSE EXCLUDED."alcance"
        END,
        "revividoEn" = NULL,
        "grupo" = EXCLUDED."grupo",
        "userId" = COALESCE(EXCLUDED."userId", "chats_eliminados"."userId")
      WHERE EXCLUDED."eliminadoEn" > "chats_eliminados"."eliminadoEn"
         OR (EXCLUDED."eliminadoEn" = "chats_eliminados"."eliminadoEn"
             AND "chats_eliminados"."revividoEn" IS NULL)
    `;
  }
  return escritas;
}

/** Antes de abrir una transacción que va a escribir lápidas. */
export async function prepararLapidas(): Promise<void> {
  await asegurarLaTablaDeEliminados();
}

/**
 * El contacto escribió después de eliminar: lo eliminado puede volver.
 *
 * Se quita además la marca de borrado de la bandeja de esa línea, que es lo
 * que ya hacía `levantarMarcasSiElContactoEscribio` al cargar —aquí ocurre en
 * el momento—. Sin eso, en una línea de Evolution la marca seguiría
 * escondiendo un chat que ya está vivo, y la fase 2 del borrado en bloque
 * vendría después a borrar la conversación nueva.
 */
export async function revivirElContacto(
  instanceName: string,
  grupos: readonly string[],
): Promise<number> {
  if (grupos.length === 0) return 0;
  const lista = Array.from(new Set(grupos));
  const revividas = await conLaTabla(() => db.$executeRaw`
    UPDATE "chats_eliminados"
    SET "revividoEn" = NOW()
    WHERE "grupo" = ANY(${lista}::text[])
      AND "revividoEn" IS NULL
  `);
  await levantarLasMarcasDeLaBandeja(instanceName, lista);
  return revividas;
}

/**
 * Una persona le escribió desde el panel a un contacto eliminado: la
 * conversación vuelve a verse —la acaba de abrir ella— y el lead sigue
 * eliminado hasta que el contacto conteste.
 */
export async function devolverLaConversacion(
  instanceName: string,
  grupos: readonly string[],
): Promise<number> {
  if (grupos.length === 0) return 0;
  const lista = Array.from(new Set(grupos));
  const devueltas = await conLaTabla(() => db.$executeRaw`
    UPDATE "chats_eliminados"
    SET "alcance" = 'ficha'
    WHERE "grupo" = ANY(${lista}::text[])
      AND "alcance" = 'chat'
      AND "revividoEn" IS NULL
  `);
  await levantarLasMarcasDeLaBandeja(instanceName, lista);
  return devueltas;
}

async function levantarLasMarcasDeLaBandeja(instanceName: string, grupos: string[]) {
  try {
    await db.$executeRaw`
      UPDATE "ChatConversationPreference" p
      SET "deletedAt" = NULL, "purgedAt" = NULL, "updatedAt" = NOW()
      FROM "chats_eliminados" e
      WHERE e."grupo" = ANY(${grupos}::text[])
        AND p."remoteJid" = e."remoteJid"
        AND p."instanceName" IN (${instanceName}, '')
        AND p."deletedAt" IS NOT NULL
    `;
  } catch (error) {
    // No tumba el mensaje: el contacto ya escribió y eso manda. Pero no es
    // mudo: una marca que no se levanta se ve como un chat que no vuelve.
    console.warn("[chats] no se pudo levantar la marca de borrado al revivir", {
      linea: instanceName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** ¿Hay alguna lápida en esta línea? (para no reimportar lo eliminado). */
export async function laLineaTieneEliminados(instanceName: string | null | undefined): Promise<boolean> {
  const linea = (instanceName ?? "").trim();
  if (!linea) return false;
  const filas = await conLaTabla(() => db.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM "chats_eliminados" WHERE "instanceName" = ${linea} LIMIT 1
  `);
  return filas.length > 0;
}
