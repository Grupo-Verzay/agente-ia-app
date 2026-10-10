import "server-only";

import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { asegurarIndice, asegurarTabla } from "@/lib/ddl-sin-bloquear";

/**
 * Las dos tablas del Modo Dueño. Son de la App (SQL en crudo, sin clave
 * foránea, creadas con `ddl-sin-bloquear`); el motor solo LEE `owner_identidad`
 * para reconocer un `@lid`.
 *
 * `owner_acciones` es a la vez:
 *  - el estado de la confirmación pendiente (antes un `Map` en memoria del
 *    backend: se perdía al reiniciar y no se veía entre réplicas);
 *  - la BITÁCORA: quién (cuenta + persona + número), por qué canal, qué pidió
 *    (texto exacto), qué se le mostró para confirmar, qué contestó, cuándo, y
 *    qué pasó. No la borra ningún barrido: es el respaldo frente al cliente;
 *  - el HISTORIAL para deshacer: `antes`/`despues` con SOLO los campos que
 *    cambian. Se guardan los de las últimas 5 acciones de cada cosa; las más
 *    viejas conservan la fila de la bitácora sin la foto.
 *
 * Estados: consulta · pendiente · reemplazada · ejecutando · ejecutada ·
 * fallida · cancelada · descartada · expirada · rechazada.
 */

export const MINUTOS_PARA_CONFIRMAR = 10;
export const FOTOS_POR_COSA = 5;

export type EstadoDeLaAccion =
  | "consulta"
  | "pendiente"
  | "reemplazada"
  | "ejecutando"
  | "ejecutada"
  | "fallida"
  | "cancelada"
  | "descartada"
  | "expirada"
  | "rechazada";

export type FilaDeAccion = {
  id: string;
  cuenta_id: string;
  persona_telefono: string;
  persona_nombre: string | null;
  canal: string;
  herramienta: string;
  modulo: string | null;
  pedido: string | null;
  resumen: string | null;
  args: Record<string, unknown> | null;
  irreversible: string | null;
  reversible: boolean;
  estado: EstadoDeLaAccion;
  respuesta: string | null;
  creada_en: Date;
  expira_en: Date | null;
  decidida_en: Date | null;
  ejecutada_en: Date | null;
  resultado: Record<string, unknown> | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  revierte_a: string | null;
  revertida_por: string | null;
};

let listas: Promise<void> | null = null;

export function asegurarLasTablasDelDueno(): Promise<void> {
  if (listas) return listas;
  listas = (async () => {
    await asegurarTabla(
      "owner_acciones",
      `CREATE TABLE IF NOT EXISTS owner_acciones (
        id               TEXT PRIMARY KEY,
        cuenta_id        TEXT NOT NULL,
        persona_telefono TEXT NOT NULL,
        persona_nombre   TEXT,
        canal            TEXT NOT NULL DEFAULT 'whatsapp_texto',
        herramienta      TEXT NOT NULL,
        modulo           TEXT,
        pedido           TEXT,
        resumen          TEXT,
        args             JSONB,
        irreversible     TEXT,
        reversible       BOOLEAN NOT NULL DEFAULT false,
        estado           TEXT NOT NULL,
        respuesta        TEXT,
        creada_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
        expira_en        TIMESTAMPTZ,
        decidida_en      TIMESTAMPTZ,
        ejecutada_en     TIMESTAMPTZ,
        resultado        JSONB,
        entidad_tipo     TEXT,
        entidad_id       TEXT,
        antes            JSONB,
        despues          JSONB,
        revierte_a       TEXT,
        revertida_por    TEXT
      )`,
    );
    await asegurarIndice(
      "owner_acciones_cuenta_idx",
      `CREATE INDEX IF NOT EXISTS owner_acciones_cuenta_idx ON owner_acciones (cuenta_id, creada_en DESC)`,
    );
    await asegurarIndice(
      "owner_acciones_pendiente_idx",
      `CREATE INDEX IF NOT EXISTS owner_acciones_pendiente_idx ON owner_acciones (cuenta_id, persona_telefono, estado)`,
    );
    await asegurarIndice(
      "owner_acciones_entidad_idx",
      `CREATE INDEX IF NOT EXISTS owner_acciones_entidad_idx ON owner_acciones (cuenta_id, entidad_tipo, entidad_id, ejecutada_en DESC)`,
    );
    await asegurarTabla(
      "owner_identidad",
      `CREATE TABLE IF NOT EXISTS owner_identidad (
        cuenta_id     TEXT NOT NULL,
        telefono      TEXT NOT NULL,
        lid           TEXT,
        codigo_hash   TEXT,
        codigo_expira TIMESTAMPTZ,
        intentos      INTEGER NOT NULL DEFAULT 0,
        verificado_en TIMESTAMPTZ,
        ultimo_uso    TIMESTAMPTZ,
        creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (cuenta_id, telefono)
      )`,
    );
    await asegurarIndice(
      "owner_identidad_lid_idx",
      `CREATE INDEX IF NOT EXISTS owner_identidad_lid_idx ON owner_identidad (cuenta_id, lid)`,
    );
  })().catch((error) => {
    listas = null;
    throw error;
  });
  return listas;
}

function json(valor: unknown): string | null {
  return valor === undefined || valor === null ? null : JSON.stringify(valor);
}

export type NuevaAccion = {
  cuentaId: string;
  personaTelefono: string;
  personaNombre: string | null;
  canal: string;
  herramienta: string;
  modulo: string | null;
  pedido: string | null;
  resumen?: string | null;
  args?: Record<string, unknown> | null;
  irreversible?: string | null;
  estado: EstadoDeLaAccion;
  resultado?: Record<string, unknown> | null;
  expiraEn?: Date | null;
  revierteA?: string | null;
};

export async function apuntarAccion(a: NuevaAccion): Promise<string> {
  await asegurarLasTablasDelDueno();
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO owner_acciones (
      id, cuenta_id, persona_telefono, persona_nombre, canal, herramienta, modulo,
      pedido, resumen, args, irreversible, estado, resultado, expira_en, revierte_a,
      decidida_en
    ) VALUES (
      ${id}, ${a.cuentaId}, ${a.personaTelefono}, ${a.personaNombre}, ${a.canal},
      ${a.herramienta}, ${a.modulo}, ${a.pedido}, ${a.resumen ?? null},
      ${json(a.args)}::jsonb, ${a.irreversible ?? null}, ${a.estado},
      ${json(a.resultado)}::jsonb, ${a.expiraEn ?? null}, ${a.revierteA ?? null},
      ${a.estado === "pendiente" || a.estado === "consulta" ? null : new Date()}
    )
  `;
  return id;
}

/** Deja sin efecto lo que esta persona tenía pendiente: UNA acción a la vez. */
export async function reemplazarPendientes(cuentaId: string, telefono: string): Promise<void> {
  await asegurarLasTablasDelDueno();
  await db.$executeRaw`
    UPDATE owner_acciones SET estado = 'reemplazada', decidida_en = now()
    WHERE cuenta_id = ${cuentaId} AND persona_telefono = ${telefono} AND estado = 'pendiente'
  `;
}

/** La última pendiente de esta persona, vigente o no. */
export async function laPendiente(cuentaId: string, telefono: string): Promise<FilaDeAccion | null> {
  await asegurarLasTablasDelDueno();
  const filas = await db.$queryRaw<FilaDeAccion[]>`
    SELECT * FROM owner_acciones
    WHERE cuenta_id = ${cuentaId} AND persona_telefono = ${telefono} AND estado = 'pendiente'
    ORDER BY creada_en DESC LIMIT 1
  `;
  return filas[0] ?? null;
}

/**
 * Decide una pendiente de forma ATÓMICA: solo una réplica (y solo una vez) la
 * pasa de `pendiente` a otro estado. Devuelve la fila si ganó.
 */
export async function decidirPendiente(
  id: string,
  estado: Extract<EstadoDeLaAccion, "ejecutando" | "cancelada" | "descartada" | "expirada">,
  respuesta: string | null,
): Promise<FilaDeAccion | null> {
  await asegurarLasTablasDelDueno();
  const filas = await db.$queryRaw<FilaDeAccion[]>`
    UPDATE owner_acciones
    SET estado = ${estado}, respuesta = ${respuesta}, decidida_en = now()
    WHERE id = ${id} AND estado = 'pendiente'
    RETURNING *
  `;
  return filas[0] ?? null;
}

export async function cerrarAccion(
  id: string,
  cierre: {
    estado: "ejecutada" | "fallida";
    resultado: Record<string, unknown> | null;
    entidadTipo?: string | null;
    entidadId?: string | null;
    antes?: Record<string, unknown> | null;
    despues?: Record<string, unknown> | null;
    reversible: boolean;
  },
): Promise<void> {
  await db.$executeRaw`
    UPDATE owner_acciones SET
      estado = ${cierre.estado},
      resultado = ${json(cierre.resultado)}::jsonb,
      ejecutada_en = now(),
      entidad_tipo = ${cierre.entidadTipo ?? null},
      entidad_id = ${cierre.entidadId ?? null},
      antes = ${json(cierre.antes)}::jsonb,
      despues = ${json(cierre.despues)}::jsonb,
      reversible = ${cierre.reversible}
    WHERE id = ${id}
  `;
}

export async function marcarRevertida(id: string, porId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE owner_acciones SET revertida_por = ${porId}, reversible = false WHERE id = ${id}
  `;
}

/**
 * Las fotos de antes/después se guardan de las últimas N acciones de cada cosa
 * (como las 5 versiones del entrenamiento). Las anteriores siguen en la
 * bitácora, sin foto y ya sin poder deshacerse.
 */
export async function podarFotos(cuentaId: string, entidadTipo: string, entidadId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE owner_acciones SET antes = NULL, despues = NULL, reversible = false
    WHERE id IN (
      SELECT id FROM owner_acciones
      WHERE cuenta_id = ${cuentaId} AND entidad_tipo = ${entidadTipo} AND entidad_id = ${entidadId}
        AND estado = 'ejecutada' AND (antes IS NOT NULL OR despues IS NOT NULL)
      ORDER BY ejecutada_en DESC
      OFFSET ${FOTOS_POR_COSA}
    )
  `;
}

export async function laAccion(cuentaId: string, idOPrefijo: string): Promise<FilaDeAccion | null> {
  await asegurarLasTablasDelDueno();
  const limpio = String(idOPrefijo ?? "").trim().toLowerCase();
  if (limpio.length < 6) return null;
  const filas = await db.$queryRaw<FilaDeAccion[]>`
    SELECT * FROM owner_acciones
    WHERE cuenta_id = ${cuentaId} AND id LIKE ${limpio + "%"}
    ORDER BY creada_en DESC LIMIT 2
  `;
  // Un prefijo que casa con dos no decide nada.
  return filas.length === 1 ? filas[0] : null;
}

export async function lasUltimasEjecutadas(cuentaId: string, limite = 10): Promise<FilaDeAccion[]> {
  await asegurarLasTablasDelDueno();
  return db.$queryRaw<FilaDeAccion[]>`
    SELECT * FROM owner_acciones
    WHERE cuenta_id = ${cuentaId} AND estado = 'ejecutada'
    ORDER BY ejecutada_en DESC
    LIMIT ${Math.max(1, Math.min(limite, 30))}
  `;
}
