'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fetchInstanceAction, type EvolutionInstance } from './fetch-intance-action';

interface ResponseFormat {
  success: boolean;
  message: string;
  data?: EvolutionInstance[];
}

/**
 * Estado en vivo (número, foto, estado de conexión) de UNA instancia de
 * WhatsApp, consultado a Evolution bajo demanda.
 *
 * Antes esta consulta se hacía al cargar Perfil/Conexión (bloqueando el
 * renderizado en el servidor): si Evolution estaba caído o lento, esas dos
 * páginas se quedaban cargando indefinidamente aunque el resto de la App
 * estuviera sano. Ahora la página se pinta al instante con los datos propios
 * (Instancia en la BD) y este estado se pide aparte, desde el cliente, sin
 * bloquear nada si tarda o falla.
 */
export async function getInstanceLiveStatusAction(instanceName: string): Promise<ResponseFormat> {
  const user = await currentUser();
  if (!user) return { success: false, message: 'No autorizado.' };
  if (!instanceName) return { success: false, message: 'Falta el nombre de la instancia.' };

  const effectiveId = user.effectiveId ?? user.id;

  const instancia = await db.instancia.findFirst({
    where: { userId: effectiveId, instanceName },
    select: { id: true },
  });
  if (!instancia) return { success: false, message: 'Instancia no encontrada.' };

  const dbUser = await db.user.findUnique({ where: { id: effectiveId }, select: { apiKeyId: true } });
  if (!dbUser?.apiKeyId) return { success: false, message: 'Sin API key configurada.' };

  const apiKey = await db.apiKey.findUnique({ where: { id: dbUser.apiKeyId }, select: { key: true, url: true } });
  if (!apiKey) return { success: false, message: 'API key no encontrada.' };

  return fetchInstanceAction({ evoApiKey: apiKey.key, evoUrl: apiKey.url, instanceName });
}
