/**
 * El id de WhatsApp de un mensaje, venga como venga.
 *
 * Waha lo serializa (`true_573001@c.us_3EB0A1B2_2101016…@lid`) y Evolution lo
 * entrega pelado (`3EB0A1B2`). El id de verdad es el TERCER trozo, nunca el
 * ultimo: en un grupo el cuarto es quien escribio (ver CLAUDE.md, «El id de un
 * mensaje de grupo»). Los ids de Evolution, Meta y Telegram se devuelven
 * intactos.
 *
 * Vive en `lib/` porque lo usan la pantalla de Chats y el relleno de historial
 * del servidor; antes estaba solo en la pantalla.
 */
export function idDeWhatsapp(id?: string | null): string {
  const limpio = (id ?? '').trim();
  const partes = limpio.split('_');
  if (partes.length >= 3 && (partes[0] === 'true' || partes[0] === 'false')) {
    return partes[2];
  }
  return limpio;
}
