/**
 * Traduccion de identidades hacia Waha, para ENVIAR.
 *
 * Es la copia, del lado de la App, de `waha-jid.util.ts` del backend. Todo lo
 * nuestro trabaja con `@s.whatsapp.net`; Waha nombra a los contactos con
 * `@c.us`. Y WhatsApp a veces anade el DISPOSITIVO al numero
 * (`573233246305:39@s.whatsapp.net`): Waha rechaza un `chatId` con ese sufijo.
 *
 * Lo que NO se toca: el `@lid` (id de privacidad: sus digitos NO son un
 * telefono, y Waha acepta enviarle directamente), los grupos `@g.us` y las
 * difusiones.
 */

const CANONICAL_USER_SUFFIX = '@s.whatsapp.net';
const WAHA_USER_SUFFIX = '@c.us';

function sinSufijoDeDispositivo(jid: string): string {
  const arroba = jid.indexOf('@');
  if (arroba < 0) return jid;
  const usuario = jid.slice(0, arroba);
  const puntos = usuario.indexOf(':');
  if (puntos < 0) return jid;
  const numero = usuario.slice(0, puntos);
  const dispositivo = usuario.slice(puntos + 1);
  if (!/^\d+$/.test(dispositivo) || !numero) return jid;
  return `${numero}${jid.slice(arroba)}`;
}

export function canonicalToWahaJid(value?: string | null): string {
  const raw = sinSufijoDeDispositivo((value ?? '').trim());
  if (!raw) return '';
  if (raw.toLowerCase().endsWith(CANONICAL_USER_SUFFIX)) {
    return `${raw.slice(0, -CANONICAL_USER_SUFFIX.length)}${WAHA_USER_SUFFIX}`;
  }
  if (!raw.includes('@')) {
    const digits = raw.replace(/[^\d]/g, '');
    return digits ? `${digits}${WAHA_USER_SUFFIX}` : raw;
  }
  return raw;
}
