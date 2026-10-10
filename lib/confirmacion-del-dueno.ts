/**
 * ¿La respuesta del dueño a una acción pendiente es un «sí», un «no» u otra cosa?
 *
 * Antes se miraba solo el COMIENZO del mensaje: «ok pero a otro número»
 * empezaba por «ok» y ejecutaba la acción original, justo lo contrario de lo
 * que pedía. Ahora un «sí» tiene que ser SOLO un sí: cada palabra del mensaje
 * está en el vocabulario de confirmar, y al menos una confirma de verdad. Una
 * sola palabra de fuera («pero», «otro», un número…) lo convierte en «otra»:
 * la acción pendiente se descarta, se le avisa, y el mensaje se lee como una
 * orden nueva (que puede ser la corrección).
 *
 * Pura a propósito: la decide la App, sea cual sea el canal (texto, nota de
 * voz transcrita, y mañana una llamada).
 */

export type RespuestaALaConfirmacion = "si" | "no" | "otra";

// Palabras que confirman por sí solas.
const CONFIRMAN = new Set([
  "si", "sip", "sii", "siii", "dale", "ok", "okay", "okey", "oki", "vale",
  "confirmo", "confirmado", "confirmar", "confirmalo", "confirmala",
  "hazlo", "hagalo", "procede", "proceder", "adelante", "correcto", "listo",
  "perfecto", "bien", "claro", "exacto", "afirmativo", "envialo", "enviala", "envia",
  "mandalo", "mandala", "aplicalo", "aplicala", "aplica", "acepto", "deuna",
  "\u{1F44D}", "✅", "\u{1F44C}",
]);

// Palabras que acompañan a un sí sin cambiar nada («sí, por favor», «de una»).
const ACOMPANAN = new Set([
  "por", "favor", "porfa", "porfavor", "de", "una", "acuerdo", "asi", "es",
  "eso", "todo", "gracias", "senor", "hazlo", "ya", "mismo",
  "tal", "cual", "esta",
]);

// Palabras que cancelan por sí solas.
const CANCELAN = new Set([
  "no", "nop", "nope", "nel", "cancela", "cancelar", "cancelalo", "cancelala",
  "cancelado", "dejalo", "dejala", "olvidalo", "olvidala", "para", "detente",
  "detener", "negativo", "anula", "anulalo", "❌", "\u{1F44E}",
]);

const ACOMPANAN_AL_NO = new Set([
  "mejor", "gracias", "por", "favor", "ya", "asi", "eso", "nada", "todavia", "aun",
]);

function palabras(texto: string): string[] {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Emojis que deciden se separan como palabra; la puntuación se va.
    .replace(/(\u{1F44D}|✅|\u{1F44C}|❌|\u{1F44E})/gu, " $1 ")
    .replace(/[️\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[.,;:!¡?¿"'()*_~\-]/g, " ")
    // «de una» es un sí entero; suelto, «una» no confirma nada.
    .replace(/\bde una\b/g, "deuna")
    .split(/\s+/)
    .filter(Boolean);
}

export function queDiceLaRespuesta(texto: string | null | undefined): RespuestaALaConfirmacion {
  const p = palabras(String(texto ?? ""));
  if (!p.length || p.length > 8) return "otra";

  if (p.every((w) => CONFIRMAN.has(w) || ACOMPANAN.has(w)) && p.some((w) => CONFIRMAN.has(w))) {
    return "si";
  }
  if (p.every((w) => CANCELAN.has(w) || ACOMPANAN_AL_NO.has(w)) && p.some((w) => CANCELAN.has(w))) {
    return "no";
  }
  return "otra";
}
