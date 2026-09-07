'use server';

/**
 * Cambiar el proveedor de una linea de WhatsApp sin cambiar la linea.
 *
 * Una linea es un numero: su nombre de instancia, su historial, sus leads, sus
 * etiquetas, sus seguimientos y la memoria de la IA. Que el WhatsApp de ese
 * numero este conectado por Evolution o por WhatsApp Mensajeria (WAHA) es solo
 * por donde entra y sale el mensaje, y nunca hay dos encendidos a la vez.
 *
 * Por eso aqui NO se crea ni se borra ninguna fila de `Instancias`: se cambia
 * `instanceType` de la MISMA fila, conservando `instanceName` (con el que se
 * guardan conversaciones y mensajes) e `instanceId` (con el que se guardan las
 * sesiones del CRM). El backend decide por `instanceType` en cada envio, asi
 * que la IA, los seguimientos y los flujos salen por el proveedor nuevo sin
 * tocar nada mas.
 *
 * Antes WhatsApp Mensajeria se creaba como una segunda instancia, `NOMBRE_V2`.
 * El mismo numero quedaba partido en dos: dos tarjetas en Conexiones, dos filas
 * por contacto en Chats, dos leads en el CRM, y un flujo lanzado sobre la fila
 * vieja salia por Evolution, que estaba apagada, y agotaba el plazo. Si de
 * aquella epoca quedaron datos bajo `_V2`, se adoptan aqui (ver
 * `adoptarRestosDelSufijoV2`).
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { fetchInstanceAction } from '@/actions/fetch-intance-action';
import {
  createWahaSession,
  deleteWahaSession,
  getWahaSession,
  isWahaConfigured,
  setWahaSessionWebhook,
  wahaSessionAction,
} from '@/lib/waha';

type Resultado = { success: boolean; message: string };

const EVOLUTION = 'Whatsapp';
const WAHA = 'waha';

type Linea = {
  id: number;
  userId: string;
  instanceName: string;
  instanceId: string;
  instanceType: string | null;
};

/** La fila de la linea, comprobando que quien pide puede tocar esa cuenta. */
async function lineaDelUsuario(instanceName: string, tipos: Array<string | null>): Promise<Linea | null> {
  const nombre = instanceName?.trim();
  if (!nombre) return null;
  const fila = await db.instancia.findFirst({
    where: { instanceName: nombre, OR: tipos.map((t) => ({ instanceType: t })) },
    select: { id: true, userId: true, instanceName: true, instanceId: true, instanceType: true },
  });
  if (!fila) return null;
  await assertCanAccessTargetUser(fila.userId);
  return fila;
}

async function claveDeEvolution(userId: string): Promise<{ url: string; key: string } | null> {
  const cuenta = await db.user.findUnique({ where: { id: userId }, select: { apiKeyId: true } });
  if (!cuenta?.apiKeyId) return null;
  const clave = await db.apiKey.findUnique({ where: { id: cuenta.apiKeyId }, select: { url: true, key: true } });
  return clave?.url && clave?.key ? { url: clave.url, key: clave.key } : null;
}

/** `open` | `close` | `connecting` | null si Evolution no contesta o no la tiene. */
async function estadoEnEvolution(
  clave: { url: string; key: string } | null,
  instanceName: string,
): Promise<string | null> {
  if (!clave) return null;
  const res = await fetchInstanceAction({ evoApiKey: clave.key, evoUrl: clave.url, instanceName });
  if (!res.success) return null;
  return res.data?.find((i) => i.name === instanceName)?.connectionStatus ?? null;
}

/**
 * Pasar una linea de Evolution a WhatsApp Mensajeria (WAHA).
 *
 * Solo si Evolution esta desconectada: nunca hay dos proveedores encendidos.
 * La sesion de WAHA se llama como la instancia; si ya existe (de un intento
 * anterior) se reutiliza con el webhook al dia, y si no se crea. Despues hay
 * que escanear el QR desde la tarjeta.
 */
export async function cambiarProveedorAWaha(instanceName: string): Promise<Resultado> {
  try {
    const linea = await lineaDelUsuario(instanceName, [EVOLUTION, null]);
    if (!linea) {
      const yaWaha = await lineaDelUsuario(instanceName, [WAHA]);
      return yaWaha
        ? { success: true, message: 'Esta línea ya está en Waha.' }
        : { success: false, message: 'No se encontró la línea.' };
    }

    if (!(await isWahaConfigured())) {
      return {
        success: false,
        message: 'El servidor de Waha no está configurado. Se pone en Panel > Conexión.',
      };
    }

    const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
    if (!backendUrl) return { success: false, message: 'BACKEND_URL no configurado en el servidor.' };

    const clave = await claveDeEvolution(linea.userId);
    const estado = await estadoEnEvolution(clave, linea.instanceName);
    if (estado === 'open') {
      return {
        success: false,
        message: 'Esta línea sigue conectada por Evolution. Desvincúlala primero y vuelve a intentarlo.',
      };
    }

    // El backend compara esta cabecera contra `metaVerifyToken` antes de aceptar
    // el webhook, asi que el valor tiene que ser el mismo en los dos sitios.
    const secreto = randomUUID().replace(/-/g, '');
    const webhookUrl = `${backendUrl}/webhook/waha`;

    const existente = await getWahaSession(linea.instanceName);
    const preparada = existente
      ? await setWahaSessionWebhook({ session: linea.instanceName, webhookUrl, secret: secreto })
      : await createWahaSession({ session: linea.instanceName, webhookUrl, secret: secreto });
    if (!preparada.ok) {
      return { success: false, message: preparada.message ?? 'No se pudo preparar la sesión en WAHA.' };
    }
    if (existente && existente.status === 'STOPPED') {
      await wahaSessionAction(linea.instanceName, 'start');
    }

    await db.instancia.update({
      where: { id: linea.id },
      data: { instanceType: WAHA, metaVerifyToken: secreto, metaChannel: WAHA } as any,
    });
    await borrarTipoGuardadoEnConversaciones(linea);

    const restos = await adoptarRestosDelSufijoV2(linea);

    console.warn('[linea] proveedor cambiado a Waha', {
      instanceName: linea.instanceName,
      sesionReutilizada: Boolean(existente),
      ...restos,
    });

    revalidatePath('/connection');
    return {
      success: true,
      message: existente?.status === 'WORKING'
        ? 'Listo: la línea ya sale por Waha.'
        : 'Listo. Escanea el QR desde la tarjeta para conectar.',
    };
  } catch (error: any) {
    console.error('[cambiarProveedorAWaha]', error);
    return { success: false, message: error?.message ?? 'No se pudo cambiar el proveedor.' };
  }
}

/**
 * Volver una linea de WhatsApp Mensajeria (WAHA) a Evolution.
 *
 * La sesion de WAHA se cierra y se borra; la instancia se crea en Evolution si
 * no estaba, con el mismo nombre. Despues hay que escanear el QR desde la
 * tarjeta de Evolution.
 */
export async function cambiarProveedorAEvolution(instanceName: string): Promise<Resultado> {
  try {
    const linea = await lineaDelUsuario(instanceName, [WAHA]);
    if (!linea) {
      const yaEvolution = await lineaDelUsuario(instanceName, [EVOLUTION, null]);
      return yaEvolution
        ? { success: true, message: 'Esta línea ya está en Evolution.' }
        : { success: false, message: 'No se encontró la línea.' };
    }

    const clave = await claveDeEvolution(linea.userId);
    if (!clave) {
      return { success: false, message: 'Esta cuenta no tiene servidor de Evolution configurado.' };
    }

    // Primero Evolution: si falla, la sesion de WAHA sigue viva y no se pierde nada.
    const estado = await estadoEnEvolution(clave, linea.instanceName);
    if (estado === null) {
      const creada = await fetch(`https://${clave.url}/instance/create`, {
        method: 'POST',
        headers: { apikey: clave.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: linea.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      if (!creada?.ok) {
        return { success: false, message: 'Evolution no pudo crear la instancia. Inténtalo de nuevo en un momento.' };
      }
    }

    await wahaSessionAction(linea.instanceName, 'logout').catch(() => null);
    const borrada = await deleteWahaSession(linea.instanceName);
    if (!borrada.ok) {
      return { success: false, message: borrada.message ?? 'No se pudo cerrar la sesión de Waha.' };
    }

    await db.instancia.update({
      where: { id: linea.id },
      data: { instanceType: EVOLUTION, metaVerifyToken: null, metaChannel: 'whatsapp' } as any,
    });
    await borrarTipoGuardadoEnConversaciones(linea);

    console.warn('[linea] proveedor cambiado a Evolution', { instanceName: linea.instanceName });

    revalidatePath('/connection');
    return { success: true, message: 'Listo. Escanea el QR desde la tarjeta para conectar.' };
  } catch (error: any) {
    console.error('[cambiarProveedorAEvolution]', error);
    return { success: false, message: error?.message ?? 'No se pudo cambiar el proveedor.' };
  }
}

/**
 * Cada conversacion guarda el tipo de la instancia con el que entro, y la
 * bandeja lo prefiere al de la fila de `Instancias`. Al cambiar de proveedor
 * ese dato queda viejo: se borra para que mande el de la instancia.
 */
async function borrarTipoGuardadoEnConversaciones(linea: Linea): Promise<void> {
  try {
    await db.$executeRaw`
      UPDATE "chat_conversations" SET "instanceType" = NULL
      WHERE "userId" = ${linea.userId} AND "instanceName" = ${linea.instanceName}
    `;
  } catch (error) {
    console.warn('[linea] no se pudo limpiar el tipo guardado en las conversaciones', {
      instanceName: linea.instanceName,
      error: String(error),
    });
  }
}

/**
 * Lo que quedo bajo la instancia `NOMBRE_V2` de antes se pasa a la linea de
 * siempre: conversaciones, mensajes, memoria de la IA y sesiones del CRM. Lo
 * que ya existia bajo el nombre bueno manda; el duplicado de `_V2` se quita.
 * Nunca lanza: el cambio de proveedor no puede fallar por esto.
 */
async function adoptarRestosDelSufijoV2(linea: Linea): Promise<Record<string, number>> {
  const nombreViejo = `${linea.instanceName}_V2`;
  const idViejo = `waha-${nombreViejo}`;
  const u = linea.userId;
  const cuenta: Record<string, number> = {};
  const paso = async (nombre: string, fn: () => Promise<number>) => {
    try {
      cuenta[nombre] = await fn();
    } catch (error) {
      cuenta[nombre] = -1;
      console.warn(`[linea] adoptar restos de ${nombreViejo}: fallo en ${nombre}`, { error: String(error) });
    }
  };

  await paso('mensajesMovidos', () => db.$executeRaw`
    UPDATE "chat_messages" v SET "instanceName" = ${linea.instanceName}
    WHERE v."userId" = ${u} AND v."instanceName" = ${nombreViejo}
      AND NOT EXISTS (
        SELECT 1 FROM "chat_messages" n
        WHERE n."userId" = v."userId" AND n."instanceName" = ${linea.instanceName}
          AND n."remoteJid" = v."remoteJid" AND n."messageId" = v."messageId" AND n."fromMe" = v."fromMe"
      )
  `);
  await paso('mensajesDuplicadosQuitados', () => db.$executeRaw`
    DELETE FROM "chat_messages" WHERE "userId" = ${u} AND "instanceName" = ${nombreViejo}
  `);

  await paso('conversacionesMovidas', () => db.$executeRaw`
    UPDATE "chat_conversations" v SET "instanceName" = ${linea.instanceName}, "instanceType" = NULL
    WHERE v."userId" = ${u} AND v."instanceName" = ${nombreViejo}
      AND NOT EXISTS (
        SELECT 1 FROM "chat_conversations" n
        WHERE n."userId" = v."userId" AND n."instanceName" = ${linea.instanceName} AND n."remoteJid" = v."remoteJid"
      )
  `);
  await paso('conversacionesDuplicadasQuitadas', () => db.$executeRaw`
    DELETE FROM "chat_conversations" WHERE "userId" = ${u} AND "instanceName" = ${nombreViejo}
  `);

  // La memoria de la IA se guarda como `NOMBRE-<jid>`: se cambia solo el prefijo.
  // El `::int` no sobra: Prisma manda el numero como bigint y `SUBSTRING` no lo
  // acepta (`function substring(character varying, bigint) does not exist`).
  await paso('memoriaMovida', () => db.$executeRaw`
    UPDATE "n8n_chat_histories"
    SET "session_id" = ${linea.instanceName} || SUBSTRING("session_id" FROM ${nombreViejo.length + 1}::int)
    WHERE "session_id" LIKE ${`${nombreViejo}-%`}
  `);

  await paso('sesionesMovidas', () => db.$executeRaw`
    UPDATE "Session" v SET "instanceId" = ${linea.instanceId}
    WHERE v."userId" = ${u} AND v."instanceId" = ${idViejo}
      AND NOT EXISTS (
        SELECT 1 FROM "Session" n
        WHERE n."userId" = v."userId" AND n."instanceId" = ${linea.instanceId} AND n."remoteJid" = v."remoteJid"
      )
  `);
  await paso('sesionesDuplicadasQuitadas', () => db.$executeRaw`
    DELETE FROM "Session" WHERE "userId" = ${u} AND "instanceId" = ${idViejo}
  `);

  return cuenta;
}
