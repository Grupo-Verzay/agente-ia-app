import "server-only";

import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { esModuloConGuia, NOMBRE_DEL_MODULO } from "@/lib/introduccion-de-la-guia";

/**
 * A dónde lleva «Contáctanos» de una guía pública: el WhatsApp de la
 * plataforma (Panel › Configuración del sitio), con un mensaje que dice de qué
 * guía viene. Sin número configurado, el de la casa que ya usan Planes y
 * Créditos: una tarjeta de contacto que no lleva a ningún sitio es peor que
 * no tenerla.
 */
export const WHATSAPP_DE_LA_CASA = "573115616975";

export function elEnlaceDeContacto(numero: string | null | undefined, modulo: string): string {
    const limpio = (numero ?? "").replace(/\D/g, "") || WHATSAPP_DE_LA_CASA;
    const texto = `Hola, vengo de la guía de ${modulo} y tengo una duda.`;
    return `https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`;
}

/** El nombre con el que el mensaje dice de qué guía viene: el del módulo, nunca su clave. */
export function elNombreDeLaGuia(modulo: string): string {
    return esModuloConGuia(modulo) ? NOMBRE_DEL_MODULO[modulo] : modulo;
}

export async function elContactoDeLaGuia(modulo: string): Promise<string> {
    const nombre = elNombreDeLaGuia(modulo);
    try {
        const config = await getSiteConfig();
        return elEnlaceDeContacto(config.whatsappNumber, nombre);
    } catch {
        return elEnlaceDeContacto(null, nombre);
    }
}
