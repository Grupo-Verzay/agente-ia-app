'use server';

import { db } from '@/lib/db';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { laClaveQueSeGuarda } from '@/lib/clave-de-ia-para-el-navegador';
import { validateProviderApiKey } from '@/lib/ai-key-validation';
import { elEstadoDeLasClaves } from '@/lib/claves-por-canal.server';
import { esLineaDeLaSeccion, esSeccionDeLinea, type EstadoDeSeccion, type SeccionDeClaves } from '@/lib/claves-por-canal';
import { elAvatarPropio, guardarElAvatarPropio } from '@/lib/videollamada-ia-db';
import { updateMetaInstance, updateTelegramInstance } from '@/actions/instances-actions';

/**
 * El botón «Claves» de cada canal del Agente IA (`lib/claves-por-canal.ts`).
 *
 * La cuenta sale SIEMPRE de `laCuentaDeLaAccion`: el id que llega del
 * navegador se comprueba con `assertCanAccessTargetUser`. Ninguna respuesta
 * lleva una clave: a lo sumo sus 4 últimos caracteres.
 */

type Respuesta<T = undefined> = { success: true; message: string; data?: T } | { success: false; message: string };

export async function leerLasClavesDelCanalAction(
    userId: string | null,
    canal: string,
): Promise<Respuesta<EstadoDeSeccion[]>> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    try {
        return { success: true, message: 'ok', data: await elEstadoDeLasClaves(cuenta, String(canal ?? '')) };
    } catch (error) {
        console.error('[claves] no se pudo leer el estado de las claves', { cuenta, canal, error: String(error) });
        return { success: false, message: 'No se pudo comprobar el estado de las claves.' };
    }
}

/**
 * Llamadas con IA: la clave de OpenAI de la cuenta, que es la que el servidor
 * de llamadas lee (`no_openai_key`). NO toca el proveedor por defecto de la
 * mensajería ni la temperatura: solo la clave. Vacía = conservar la guardada.
 */
export async function guardarLaClaveDeLlamadasAction(userId: string | null, apiKey: string): Promise<Respuesta> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    try {
        const proveedor = await db.aiProvider.findFirst({
            where: { name: { equals: 'openai', mode: 'insensitive' } },
            select: { id: true, name: true },
        });
        if (!proveedor) return { success: false, message: 'OpenAI no está dado de alta en la plataforma.' };

        const existente = await db.userAiConfig.findUnique({
            where: { userId_providerId: { userId: cuenta, providerId: proveedor.id } },
            select: { apiKey: true },
        });
        const queSeGuarda = laClaveQueSeGuarda(apiKey, existente?.apiKey);
        if (!queSeGuarda.ok) return { success: false, message: 'Ingresa tu API key de OpenAI.' };
        if (!queSeGuarda.esNueva) return { success: true, message: 'Sin cambios: se conserva la clave guardada.' };

        const error = validateProviderApiKey(proveedor.name, queSeGuarda.clave);
        if (error) return { success: false, message: error };

        await db.userAiConfig.upsert({
            where: { userId_providerId: { userId: cuenta, providerId: proveedor.id } },
            update: { apiKey: queSeGuarda.clave, isActive: true },
            create: { userId: cuenta, providerId: proveedor.id, apiKey: queSeGuarda.clave, isActive: true },
        });
        return { success: true, message: 'Clave de OpenAI guardada.' };
    } catch (error) {
        console.error('[claves] no se pudo guardar la clave de llamadas', { cuenta, error: String(error) });
        return { success: false, message: 'No se pudo guardar la clave de OpenAI.' };
    }
}

/**
 * Videollamadas: la clave y el avatar (persona) de Tavus PROPIOS de la cuenta.
 * Clave vacía = conservar la guardada. Sin ellos la cuenta NO tiene
 * videollamada con IA: no hay avatar de respaldo (`elAvatarDeLaCuenta`).
 */
export async function guardarElAvatarDeTavusAction(
    userId: string | null,
    pedido: { clave?: unknown; personaId?: unknown },
): Promise<Respuesta> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    try {
        const actual = await elAvatarPropio(cuenta);
        const clave = laClaveQueSeGuarda(typeof pedido?.clave === 'string' ? pedido.clave : '', actual?.clave);
        if (!clave.ok) return { success: false, message: 'Ingresa la API key de Tavus.' };
        const personaId = String(pedido?.personaId ?? '').trim();
        if (!personaId) return { success: false, message: 'Ingresa el ID del avatar (persona) de Tavus.' };

        const hecho = await guardarElAvatarPropio(cuenta, { clave: clave.clave, personaId });
        if (!hecho.ok) return { success: false, message: hecho.motivo ?? 'No se pudo guardar.' };
        return { success: true, message: 'Avatar de Tavus guardado.' };
    } catch (error) {
        console.error('[claves] no se pudo guardar el avatar de Tavus', { cuenta, error: String(error) });
        return { success: false, message: 'No se pudo guardar el avatar de Tavus.' };
    }
}

export async function quitarElAvatarDeTavusAction(userId: string | null): Promise<Respuesta> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    try {
        const hecho = await guardarElAvatarPropio(cuenta, null);
        if (!hecho.ok) return { success: false, message: hecho.motivo ?? 'No se pudo quitar.' };
        return { success: true, message: 'Clave de Tavus quitada: la videollamada con IA queda desactivada hasta que pongas otra.' };
    } catch (error) {
        console.error('[claves] no se pudo quitar el avatar de Tavus', { cuenta, error: String(error) });
        return { success: false, message: 'No se pudo quitar el avatar de Tavus.' };
    }
}

/**
 * WhatsApp API, Telegram, Facebook e Instagram: cambia el token (y el id) de
 * UNA línea. La línea tiene que ser de la cuenta Y de esa sección: se mira en
 * la fila, no se fía del nombre que llega. Token vacío = conservar el guardado.
 */
export async function actualizarLaLineaDelCanalAction(
    userId: string | null,
    seccion: SeccionDeClaves,
    instanceName: string,
    pedido: { token?: string; identificador?: string },
): Promise<Respuesta> {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };
    if (!esSeccionDeLinea(seccion) || !instanceName) return { success: false, message: 'Línea no válida.' };
    try {
        const fila = await db.instancia.findFirst({
            where: { instanceName, userId: cuenta },
            select: { instanceName: true, instanceType: true, metaChannel: true },
        });
        if (!fila || !esLineaDeLaSeccion(seccion, fila)) {
            console.warn('[claves] se pidió cambiar una línea que no es de la cuenta o de ese canal', { cuenta, seccion, instanceName });
            return { success: false, message: 'Esa línea no es de esta cuenta.' };
        }

        const token = String(pedido?.token ?? '').trim();
        const identificador = String(pedido?.identificador ?? '').trim();

        if (seccion === 'linea-telegram') {
            if (!token) return { success: true, message: 'Sin cambios: se conserva el token guardado.' };
            return await updateTelegramInstance({ instanceName: fila.instanceName, botToken: token });
        }

        if (!token && !identificador) return { success: true, message: 'Sin cambios.' };
        return await updateMetaInstance({
            instanceName: fila.instanceName,
            ...(token ? { accessToken: token } : {}),
            ...(identificador
                ? seccion === 'linea-whatsapp-api'
                    ? { phoneNumberId: identificador }
                    : { pageId: identificador }
                : {}),
        });
    } catch (error) {
        console.error('[claves] no se pudo actualizar la línea', { cuenta, seccion, instanceName, error: String(error) });
        return { success: false, message: 'No se pudo actualizar la línea.' };
    }
}
