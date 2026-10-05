import "server-only";

import { db } from "@/lib/db";
import { chatPreferenceKey } from "@/lib/chat-preference-key";
import type { MapaDeBloqueos, MarcaDeBloqueo } from "@/lib/bloqueo-y-silencio";

/**
 * `chat_bloqueo_silencio`: tabla de la App, una fila por cuenta, línea e
 * identidad del contacto (la misma llave que las marcas de Chats). Con
 * `CREATE TABLE IF NOT EXISTS` y sin clave foránea. No se toca
 * `ChatConversationPreference`: el borrado de un chat se lleva esas filas, y
 * un bloqueo tiene que sobrevivir a que se borre y vuelva la conversación.
 */
let tablaLista: Promise<void> | null = null;

/** Solo se traga «ya existe» (dos réplicas a la vez); lo demás sube. */
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

function asegurarLaTabla(): Promise<void> {
  tablaLista ??= (async () => {
    await ddl(() => db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "chat_bloqueo_silencio" (
        "userId" TEXT NOT NULL,
        "instanceName" TEXT NOT NULL DEFAULT '',
        "remoteJid" TEXT NOT NULL,
        "bloqueadoEn" TIMESTAMP(3),
        "silenciadoEn" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("userId", "instanceName", "remoteJid")
      )
    `);
  })().catch((error) => {
    tablaLista = null;
    throw error;
  });
  return tablaLista;
}

function esTablaQueFalta(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; message?: string };
  return e?.meta?.code === "42P01" || e?.code === "42P01" || Boolean(e?.message?.includes("42P01"));
}

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
  await asegurarLaTabla();
  try {
    return await hacer();
  } catch (error) {
    if (!esTablaQueFalta(error)) throw error;
    tablaLista = null;
    await asegurarLaTabla();
    return hacer();
  }
}

type Fila = {
  userId: string;
  instanceName: string;
  remoteJid: string;
  bloqueadoEn: Date | null;
  silenciadoEn: Date | null;
  updatedAt: Date | null;
};

function comoMarca(fila: Fila): MarcaDeBloqueo {
  return {
    instanceName: fila.instanceName,
    remoteJid: fila.remoteJid,
    bloqueadoEn: fila.bloqueadoEn ? fila.bloqueadoEn.toISOString() : null,
    silenciadoEn: fila.silenciadoEn ? fila.silenciadoEn.toISOString() : null,
    updatedAt: fila.updatedAt ? fila.updatedAt.toISOString() : null,
  };
}

/** Las marcas de estas cuentas, indexadas como las demás marcas de Chats. Solo las que tienen algo puesto. */
export async function leerLosBloqueos(cuentas: string[]): Promise<MapaDeBloqueos> {
  if (!cuentas.length) return {};
  return conLaTabla(async () => {
    const filas = await db.$queryRaw<Fila[]>`
      SELECT "userId", "instanceName", "remoteJid", "bloqueadoEn", "silenciadoEn", "updatedAt"
      FROM "chat_bloqueo_silencio"
      WHERE "userId" = ANY(${cuentas}::text[])
    `;
    const mapa: MapaDeBloqueos = {};
    for (const fila of filas) {
      mapa[chatPreferenceKey(fila.userId, fila.instanceName, fila.remoteJid)] = comoMarca(fila);
    }
    return mapa;
  });
}

/**
 * Escribe la marca bajo TODAS las identidades. Solo la columna que se pide
 * (`campo`): bloquear no pisa el silencio ni al revés.
 */
export async function escribirLaMarca(
  cuenta: string,
  linea: string,
  identidades: string[],
  campo: "bloqueadoEn" | "silenciadoEn",
  valor: Date | null,
): Promise<MarcaDeBloqueo[]> {
  const unicas = [...new Set(identidades.filter(Boolean))];
  if (!unicas.length) return [];
  return conLaTabla(async () => {
    const filas: Fila[] = [];
    for (const jid of unicas) {
      const escritas =
        campo === "bloqueadoEn"
          ? await db.$queryRaw<Fila[]>`
              INSERT INTO "chat_bloqueo_silencio" ("userId", "instanceName", "remoteJid", "bloqueadoEn", "updatedAt")
              VALUES (${cuenta}, ${linea}, ${jid}, ${valor}, NOW())
              ON CONFLICT ("userId", "instanceName", "remoteJid")
              DO UPDATE SET "bloqueadoEn" = EXCLUDED."bloqueadoEn", "updatedAt" = NOW()
              RETURNING "userId", "instanceName", "remoteJid", "bloqueadoEn", "silenciadoEn", "updatedAt"
            `
          : await db.$queryRaw<Fila[]>`
              INSERT INTO "chat_bloqueo_silencio" ("userId", "instanceName", "remoteJid", "silenciadoEn", "updatedAt")
              VALUES (${cuenta}, ${linea}, ${jid}, ${valor}, NOW())
              ON CONFLICT ("userId", "instanceName", "remoteJid")
              DO UPDATE SET "silenciadoEn" = EXCLUDED."silenciadoEn", "updatedAt" = NOW()
              RETURNING "userId", "instanceName", "remoteJid", "bloqueadoEn", "silenciadoEn", "updatedAt"
            `;
      filas.push(...escritas);
    }
    return filas.map(comoMarca);
  });
}
