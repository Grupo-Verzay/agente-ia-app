/**
 * El buscador del tablero de asesores (Usuarios › Pipeline). Puro.
 *
 * Buscaba con `toLowerCase().includes` sobre el nombre y el `remoteJid` crudo,
 * así que «maria» no encontraba a «María», y «+57 300 111» no encontraba
 * `573001112233@s.whatsapp.net` —los espacios y el «+» no están en el jid—.
 *
 * - El nombre se compara sin tildes, con la MISMA lista que el buscador de Mis
 *   notas (`sinTildes`): una sola regla de qué letra es cuál.
 * - Un número se compara por DÍGITOS, con el sufijo de dispositivo («:39») y
 *   el dominio fuera: son del jid, no del teléfono.
 */
import { sinTildes } from "@/lib/pantalla-de-notas";

export function pasaLaBusquedaDelContacto(
    contacto: { pushName?: string | null; remoteJid: string },
    consulta: string,
): boolean {
    const q = sinTildes(consulta.trim());
    if (!q) return true;
    if (sinTildes(contacto.pushName ?? "").includes(q)) return true;

    const numero = contacto.remoteJid.split("@")[0].split(":")[0];
    const digitos = q.replace(/\D/g, "");
    // Solo es «un número» si lo tecleado no lleva letras: «ana 3» no es un teléfono.
    const esUnNumero = digitos.length >= 3 && q.replace(/[\s+().-]/g, "") === digitos;
    if (esUnNumero) return numero.replace(/\D/g, "").includes(digitos);
    return sinTildes(numero).includes(q);
}
