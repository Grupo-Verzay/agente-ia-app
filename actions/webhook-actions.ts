'use server';

import { getInstances } from "./api-action";
import { assertUserCanUseApp } from "./billing/helpers/app-access-guard";

interface ToggleWebhookParams {
    userId: string;
    enable: boolean;
    webhookUrl: string;
}

export async function toggleWebhook({
    userId,
    enable,
    webhookUrl,
}: ToggleWebhookParams): Promise<{ success: boolean; message: string }> {
    try {
        await assertUserCanUseApp(userId);

        if (!userId || !webhookUrl) {
            return { success: false, message: 'No se pudo desactivar el webhook por falta de parámetros.' };
        };

        const instances = await getInstances(userId);

        if (!instances || instances.length === 0) {
            return { success: false, message: 'No se encontraron instancias activas' };
        };

        const { instanceName, instanceId, serverUrl } = instances[0] ?? {};

        if (!instanceName || !instanceId || !serverUrl) {
            return {
                success: false,
                message: 'Instancia incompleta: faltan datos requeridos',
            };
        };

        const evoAPI = `https://${serverUrl}/webhook/set/${instanceName}`;

        const response = await fetch(evoAPI,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: instanceId,
                },
                body: JSON.stringify({
                    webhook: {
                        enabled: enable,
                        url: webhookUrl,
                        base64: true,
                        events: ['MESSAGES_UPSERT'],
                    },
                }),
                cache: 'no-store',
            }
        );

        if (!response.ok) {
            const contentType = response.headers.get('content-type');
            let errorDetail = '';

            if (contentType?.includes('application/json')) {
                const json = await response.json();
                errorDetail = json?.message || JSON.stringify(json);
            } else {
                errorDetail = await response.text();
            }

            throw new Error(`Error del servidor webhook: ${errorDetail}`);
        };

        return { success: true, message: `Webhook ${enable ? 'activado' : 'desactivado'} correctamente` };
    } catch (err) {
        console.error('[TOGGLE_WEBHOOK_ERROR]', err);
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Error inesperado al actualizar el webhook',
        };
    }
}
