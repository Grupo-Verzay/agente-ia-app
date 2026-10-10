import "server-only";

import { createHash, randomInt, timingSafeEqual } from "crypto";

import { db } from "@/lib/db";
import { asegurarLasTablasDelDueno } from "@/lib/acciones-del-dueno-db";
import { elCodigo, elNumeroEsDelDueno, soloDigitos } from "@/lib/identidad-del-dueno";
import { parseOwnerPeople, type OwnerPerson } from "@/lib/owner-contacts";

/**
 * Segundo factor del Modo Dueño: el código de verificación (PIN).
 *
 * El número de WhatsApp dice QUIÉN dice ser; el código prueba que esa persona
 * también entra al panel. Diseño de `docs/modo-dueno-integracion-nestjs.md` §7:
 *
 * 1. En el panel (Perfil › Comportamiento › Modo Dueño) se genera un código de
 *    seis dígitos para UNA persona. Vale 15 minutos y se ve una sola vez.
 * 2. La persona lo escribe por WhatsApp. Su número queda verificado.
 * 3. Sin verificar puede CONSULTAR, pero nada que escriba se prepara.
 * 4. La verificación caduca a los 30 días sin usarse; cambiar el número de la
 *    persona la anula (la fila es por número).
 *
 * Y resuelve el `@lid`: quien escribe con su número oculto no trae dígitos que
 * comparar. Si manda un código vigente, ese `@lid` queda atado a la persona del
 * código y desde entonces se le reconoce (el motor lee `owner_identidad.lid`).
 */

export const MINUTOS_DEL_CODIGO = 15;
export const DIAS_DE_LA_VERIFICACION = 30;
export const INTENTOS_DEL_CODIGO = 5;

function huella(cuentaId: string, telefono: string, codigo: string): string {
  const pimienta = process.env.AUTH_SECRET ?? process.env.OWNER_COMMANDS_KEY ?? "";
  return createHash("sha256").update(`${cuentaId}:${telefono}:${codigo}:${pimienta}`).digest("hex");
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** La persona autorizada que casa con este número, o `null`. */
export function laPersonaDelNumero(
  cuenta: { ownerModePhone: string | null; notificationNumber: string | null },
  numero: string,
): OwnerPerson | null {
  const personas = parseOwnerPeople(cuenta.ownerModePhone);
  if (personas.length) return personas.find((p) => elNumeroEsDelDueno(numero, p.phone)) ?? null;
  // Sin lista: el número de notificaciones del titular, como siempre.
  return elNumeroEsDelDueno(numero, cuenta.notificationNumber)
    ? { name: "Dueño", phone: soloDigitos(cuenta.notificationNumber), role: "Dueño" }
    : null;
}

/** Genera (y reemplaza) el código de una persona. Devuelve el código en claro UNA vez. */
export async function generarCodigoDeVerificacion(cuentaId: string, telefono: string): Promise<string> {
  await asegurarLasTablasDelDueno();
  const tel = soloDigitos(telefono);
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expira = new Date(Date.now() + MINUTOS_DEL_CODIGO * 60_000);
  await db.$executeRaw`
    INSERT INTO owner_identidad (cuenta_id, telefono, codigo_hash, codigo_expira, intentos)
    VALUES (${cuentaId}, ${tel}, ${huella(cuentaId, tel, codigo)}, ${expira}, 0)
    ON CONFLICT (cuenta_id, telefono) DO UPDATE SET
      codigo_hash = EXCLUDED.codigo_hash, codigo_expira = EXCLUDED.codigo_expira, intentos = 0
  `;
  return codigo;
}

type FilaDeIdentidad = {
  telefono: string;
  lid: string | null;
  codigo_hash: string | null;
  codigo_expira: Date | null;
  intentos: number;
  verificado_en: Date | null;
  ultimo_uso: Date | null;
};

export type ResultadoDelCodigo =
  | { ok: true; telefono: string }
  | { ok: false; motivo: "sin_codigo" | "caducado" | "incorrecto" | "bloqueado" };

/**
 * Comprueba el código que llega por WhatsApp. Con número: el de esa persona.
 * Con `@lid` (sin número): cualquiera vigente de la cuenta, y el `@lid` queda
 * atado a quien lo generó.
 */
export async function verificarCodigo(params: {
  cuentaId: string;
  telefono?: string | null;
  lid?: string | null;
  texto: string;
  telefonosAutorizados: string[];
}): Promise<ResultadoDelCodigo> {
  await asegurarLasTablasDelDueno();
  const codigo = elCodigo(params.texto);
  const tel = soloDigitos(params.telefono);
  const autorizados = new Set(params.telefonosAutorizados.map(soloDigitos));

  const filas = tel
    ? await db.$queryRaw<FilaDeIdentidad[]>`
        SELECT * FROM owner_identidad WHERE cuenta_id = ${params.cuentaId} AND telefono = ${tel}`
    : await db.$queryRaw<FilaDeIdentidad[]>`
        SELECT * FROM owner_identidad
        WHERE cuenta_id = ${params.cuentaId} AND codigo_hash IS NOT NULL`;

  const conCodigo = filas.filter((f) => f.codigo_hash && autorizados.has(f.telefono));
  if (!conCodigo.length) return { ok: false, motivo: "sin_codigo" };

  const vigentes = conCodigo.filter((f) => f.codigo_expira && f.codigo_expira > new Date());
  if (!vigentes.length) return { ok: false, motivo: "caducado" };
  if (vigentes.every((f) => f.intentos >= INTENTOS_DEL_CODIGO)) return { ok: false, motivo: "bloqueado" };

  const acierto = vigentes.find(
    (f) => f.intentos < INTENTOS_DEL_CODIGO && iguales(f.codigo_hash!, huella(params.cuentaId, f.telefono, codigo)),
  );
  if (!acierto) {
    // Cada fallo gasta un intento de TODOS los códigos vigentes que podía
    // estar adivinando: cinco tiros y ya no queda nada que acertar.
    for (const f of vigentes) {
      await db.$executeRaw`
        UPDATE owner_identidad SET intentos = intentos + 1
        WHERE cuenta_id = ${params.cuentaId} AND telefono = ${f.telefono}`;
    }
    return { ok: false, motivo: "incorrecto" };
  }

  const lid = params.lid ? String(params.lid).trim() : null;
  await db.$executeRaw`
    UPDATE owner_identidad SET
      codigo_hash = NULL, codigo_expira = NULL, intentos = 0,
      verificado_en = now(), ultimo_uso = now(),
      lid = COALESCE(${lid}, lid)
    WHERE cuenta_id = ${params.cuentaId} AND telefono = ${acierto.telefono}
  `;
  return { ok: true, telefono: acierto.telefono };
}

/** ¿Este número pasó el código y no ha caducado? Si sí, lo da por usado hoy. */
export async function estaVerificado(cuentaId: string, telefono: string): Promise<boolean> {
  await asegurarLasTablasDelDueno();
  const tel = soloDigitos(telefono);
  const desde = new Date(Date.now() - DIAS_DE_LA_VERIFICACION * 86_400_000);
  const filas = await db.$queryRaw<{ ok: number }[]>`
    UPDATE owner_identidad SET ultimo_uso = now()
    WHERE cuenta_id = ${cuentaId} AND telefono = ${tel}
      AND verificado_en IS NOT NULL
      AND COALESCE(ultimo_uso, verificado_en) > ${desde}
    RETURNING 1 AS ok
  `;
  return filas.length > 0;
}

/** El número de la persona a la que se ató este `@lid`, si alguna. */
export async function elTelefonoDelLid(cuentaId: string, lid: string): Promise<string | null> {
  await asegurarLasTablasDelDueno();
  const filas = await db.$queryRaw<{ telefono: string }[]>`
    SELECT telefono FROM owner_identidad
    WHERE cuenta_id = ${cuentaId} AND lid = ${String(lid).trim()} AND verificado_en IS NOT NULL
    LIMIT 1
  `;
  return filas[0]?.telefono ?? null;
}

/** Quién está verificado (para el panel). */
export async function lasVerificaciones(cuentaId: string): Promise<Map<string, Date>> {
  await asegurarLasTablasDelDueno();
  const desde = new Date(Date.now() - DIAS_DE_LA_VERIFICACION * 86_400_000);
  const filas = await db.$queryRaw<{ telefono: string; verificado_en: Date }[]>`
    SELECT telefono, verificado_en FROM owner_identidad
    WHERE cuenta_id = ${cuentaId} AND verificado_en IS NOT NULL
      AND COALESCE(ultimo_uso, verificado_en) > ${desde}
  `;
  return new Map(filas.map((f) => [f.telefono, f.verificado_en]));
}

export async function revocarVerificacion(cuentaId: string, telefono: string): Promise<void> {
  await asegurarLasTablasDelDueno();
  await db.$executeRaw`
    DELETE FROM owner_identidad WHERE cuenta_id = ${cuentaId} AND telefono = ${soloDigitos(telefono)}
  `;
}
