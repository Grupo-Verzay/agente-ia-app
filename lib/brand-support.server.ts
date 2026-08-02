import { db } from "@/lib/db";

/**
 * A qué WhatsApp escribe un cliente que necesita ayuda con su pago.
 *
 * Al de SU marca. Si la cuenta es de un reseller, el número que ese reseller
 * puso en su perfil; si es una cuenta directa, el de la plataforma. Sin esa
 * distinción, un cliente de Aizen-Bot terminaría escribiéndole a Verzay, que ni
 * lo conoce ni puede resolverle nada.
 *
 * Devuelve `null` cuando no hay número configurado. Quien llama debe entonces
 * no mostrar el botón: es mejor que no haya botón a que lo lleve a un chat
 * vacío con un número que no existe.
 *
 * Vive en `lib/` y no en una server action a propósito: lo usan el layout (que
 * pinta el bloqueo) y la tarjeta del plan, y exportarlo desde un fichero
 * `"use server"` lo dejaría invocable desde el navegador sin necesidad.
 */
export async function whatsappDeLaMarca(
    resellerUserId: string | null,
): Promise<string | null> {
    try {
        if (resellerUserId) {
            const reseller = await db.user.findUnique({
                where: { id: resellerUserId },
                select: { brandWhatsapp: true },
            });
            const propio = reseller?.brandWhatsapp?.trim();
            if (propio) return normalizarNumero(propio);
            // Sin número propio no se cae al de la plataforma: el cliente de un
            // reseller no debe acabar escribiéndole a Verzay.
            return null;
        }

        const cfg = await db.siteConfig.findUnique({
            where: { id: 1 },
            select: { whatsappNumber: true },
        });
        const dePlataforma = cfg?.whatsappNumber?.trim();
        return dePlataforma ? normalizarNumero(dePlataforma) : null;
    } catch {
        return null;
    }
}

/**
 * El número tal como lo espera un enlace wa.me: solo dígitos.
 *
 * Se escribe a mano en un formulario, así que llega con espacios, guiones,
 * paréntesis o un `+` delante. Cualquiera de esos caracteres rompe el enlace.
 */
function normalizarNumero(valor: string): string | null {
    const digitos = valor.replace(/\D/g, "");
    return digitos.length >= 7 ? digitos : null;
}
