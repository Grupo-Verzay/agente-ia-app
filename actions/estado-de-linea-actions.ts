'use server';

import { Prisma } from '@prisma/client';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';

/**
 * Si los envios de una linea estan fallando, y desde cuando.
 *
 * La tarjeta de Conexion dice «Conectado» porque le pregunta a Evolution por
 * `/instance/connect` y Evolution contesta `state: "open"`. Pero esa respuesta
 * puede ser mentira: el socket real de WhatsApp se cae y Evolution sigue
 * diciendo que la sesion esta abierta —una sesion zombi—. El 2026-09-10 un
 * cliente perdio la mañana con la linea MONTERREY_PENSIONADO_ALIADO: flujo,
 * seguimientos y envios manuales reventando con «Connection Closed», el aviso
 * en pantalla decia «Error 500 en la API al enviar mensaje» y la tarjeta seguia
 * en verde.
 *
 * Quien sabe la verdad es el que envia, y eso pasa en el backend: al fallar un
 * envio por sesion cerrada anota `send_failed_at` en la linea, y lo borra con el
 * primer envio que vuelve a salir bien. Aqui solo se lee.
 *
 * Se lee con SQL en crudo y NO se declara en `schema.prisma`: esas columnas las
 * crea la migracion del backend, y si la App desplegara antes con la columna
 * declarada reventaria cada consulta a `Instancias` (el #360). Sin columna,
 * esto contesta «no hay nada que avisar» y la tarjeta se queda como estaba.
 */
export async function envioFallidoDeLaLinea(instanceName: string): Promise<{
  caida: boolean;
  desde: string | null;
  motivo: string | null;
}> {
  const vacio = { caida: false, desde: null, motivo: null };
  const linea = String(instanceName ?? '').trim();
  if (!linea) return vacio;

  const me = await currentUser();
  if (!me?.id) return vacio;

  // De quien es la linea. Una accion que recibe un id no lo usa sin comprobar
  // antes de quien es el dato (ver CLAUDE.md).
  const fila = await db.instancia
    .findFirst({ where: { instanceName: linea }, select: { userId: true } })
    .catch(() => null);
  if (!fila?.userId) return vacio;
  await assertCanAccessTargetUser(fila.userId);

  try {
    const filas = await db.$queryRaw<
      { send_failed_at: Date | null; send_failed_reason: string | null }[]
    >(
      Prisma.sql`SELECT "send_failed_at", "send_failed_reason" FROM "Instancias" WHERE "instanceName" = ${linea} LIMIT 1`,
    );
    const marca = filas[0];
    if (!marca?.send_failed_at) return vacio;
    return {
      caida: true,
      desde: new Date(marca.send_failed_at).toISOString(),
      motivo: marca.send_failed_reason ?? null,
    };
  } catch {
    // La columna la crea el backend. Mientras no exista, no hay nada que avisar.
    return vacio;
  }
}
