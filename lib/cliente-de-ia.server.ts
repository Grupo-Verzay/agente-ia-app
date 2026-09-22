import "server-only";

import { db } from "@/lib/db";
import { exigirLaCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";

/**
 * Proveedor, modelo y CLAVE de IA de una cuenta, para usarlos en el servidor.
 *
 * Vivía en `actions/userAiconfig-actions.ts`, que es `'use server'`: todo lo
 * que ese fichero exporta es un POST al que se llega desde el navegador. Así
 * que esta función era un endpoint que devolvía la clave de OpenAI en claro a
 * quien la pidiera con su sesión — y esa clave suele ser la de la casa o la
 * del reseller, no la del cliente. Una acción ES un endpoint, lo llame quien
 * lo llame por dentro.
 *
 * Aquí, con `server-only`, deja de serlo: se sigue pudiendo llamar desde
 * cualquier acción o ruta, y el build se cae en el sitio si alguien la importa
 * desde un componente de cliente. La puerta de la cuenta se queda igual que
 * antes (`exigirLaCuentaDeLaAccion`), para que ningún llamador cambie de
 * comportamiento.
 *
 * **La clave que devuelve no se reenvía nunca al navegador.** Si hace falta
 * enseñar algo de ella, va por `lib/clave-de-ia-para-el-navegador.ts`.
 */

export type ResolvedAiClientDTO = {
  provider: string;
  model: string;
  apiKey: string;
};

export type ResultadoDelClienteDeIa = {
  success: boolean;
  message: string;
  data?: ResolvedAiClientDTO;
};

export async function resolveUserAiClient(userId: string): Promise<ResultadoDelClienteDeIa> {
  try {
    const cuenta = await exigirLaCuentaDeLaAccion(userId);
    const u = await db.user.findUnique({
      where: { id: cuenta },
      select: { id: true, defaultProviderId: true, defaultAiModelId: true },
    });
    if (!u) return { success: false, message: "user_not_found" };

    if (!u.defaultProviderId || !u.defaultAiModelId) {
      return { success: false, message: "user_missing_defaults" };
    }

    const cfg = await db.userAiConfig.findFirst({
      where: { userId: u.id, isActive: true, providerId: u.defaultProviderId },
      select: { apiKey: true },
    });

    if (!cfg?.apiKey) return { success: false, message: "user_missing_active_apikey" };

    const [provider, model] = await Promise.all([
      db.aiProvider.findUnique({ where: { id: u.defaultProviderId }, select: { name: true } }),
      db.aiModel.findUnique({ where: { id: u.defaultAiModelId }, select: { name: true } }),
    ]);

    if (!provider?.name || !model?.name) {
      return { success: false, message: "provider_or_model_invalid" };
    }

    return {
      success: true,
      message: "ok",
      data: { provider: provider.name, model: model.name, apiKey: cfg.apiKey },
    };
  } catch (e) {
    // El rechazo de la guarda lanza «No autorizado.»; quien llama solo mira
    // `success`, así que se convierte aquí y se dice.
    console.warn("[cliente-de-ia] no se pudo resolver el cliente de IA", userId, (e as Error)?.message);
    return { success: false, message: "resolve_ai_client_error" };
  }
}
