/** `lib/contacto-de-la-guia.server.ts` sin base: un WhatsApp de ejemplo. */
export const WHATSAPP_DE_LA_CASA = "573000000000";
export function elEnlaceDeContacto(_numero: string | null | undefined, _modulo: string): string {
    return "https://wa.me/573000000000";
}
export async function elContactoDeLaGuia(_modulo: string): Promise<string> {
    return "https://wa.me/573000000000";
}
