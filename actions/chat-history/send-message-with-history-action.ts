'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import { laClaveDelServidorDeLaCuenta } from '@/lib/clave-del-servidor.server';
import { enviarConHistorial, type SendMessageWithHistoryInput } from '@/lib/envio-con-historial.server';

/**
 * Mandar un texto por una línea, desde el NAVEGADOR (Mensajes, y lo que llame a
 * `useSendMessageWithHistory`).
 *
 * Estaba ABIERTA y era de las peores: recibía `instanceName`, `url` y `apikey`
 * —«manda este texto, a este número, por esta línea, con esta clave»— y la
 * llamaba la página PÚBLICA de agendar con la clave del servidor que le
 * entregábamos a cualquiera. Lo que aquí se mezclaba eran dos cosas distintas
 * con la misma firma, y ya están separadas:
 *
 * | | quién | dónde |
 * | --- | --- | --- |
 * | confirmar una reserva | la página pública, sin sesión | `confirmarLaCitaPublicaAction`, que arma el texto en el servidor a partir del id de la cita |
 * | mandar un texto cualquiera | alguien con sesión | **esta**, con puerta |
 * | el sistema (backend, runners) | sin sesión, con la línea ya resuelta | `enviarConHistorial` (`lib/envio-con-historial.server.ts`) |
 *
 * Tres cosas:
 *
 * 1. **Pide sesión y que la LÍNEA sea de una cuenta que quien llama alcanza**
 *    (`assertCanAccessTargetUser` con la dueña sacada de la FILA).
 * 2. **`url`, `apikey` y `payload` que lleguen del navegador se ignoran.** La
 *    clave del servidor la pone esta función desde la cuenta dueña de la línea;
 *    aceptarla de fuera sería dejar que quien llama elija contra qué servidor y
 *    con qué clave habla el nuestro.
 * 3. El resto —el formato de la notificación interna, las plantillas de Meta,
 *    el despachador por proveedor— es el mismo de siempre, porque es la misma
 *    función (`enviarConHistorial`).
 */
export async function sendMessageWithHistoryAction(input: SendMessageWithHistoryInput) {
  const instanceName = String(input?.instanceName ?? '').trim();
  if (!input?.message?.trim()) {
    return { success: false, message: 'Mensaje vacio.', error: 'Mensaje vacio.' };
  }
  if (!instanceName) {
    return { success: false, message: 'Falta la linea.', error: 'Falta la linea.' };
  }

  const persona = await currentUser();
  if (!persona) {
    return { success: false, message: 'No autorizado.', error: 'No autorizado.' };
  }

  const linea = await db.instancia.findFirst({
    where: { instanceName },
    select: { userId: true },
  });
  if (!linea?.userId) {
    return { success: false, message: 'La linea no existe.', error: 'La linea no existe.' };
  }

  try {
    await assertCanAccessTargetUser(linea.userId);
  } catch {
    console.warn('[envios] se pidio mandar por una linea que no se alcanza', { instanceName });
    return { success: false, message: 'No autorizado.', error: 'No autorizado.' };
  }

  const servidor = await laClaveDelServidorDeLaCuenta(linea.userId);
  return enviarConHistorial({
    ...input,
    instanceName,
    url: servidor ? `${servidor.url}/message/sendText/${encodeURIComponent(instanceName)}` : undefined,
    apikey: servidor?.key,
    payload: {},
  });
}
