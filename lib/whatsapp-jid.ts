const WHATSAPP_USER_JID_SUFFIX = "@s.whatsapp.net";
const WHATSAPP_LID_JID_SUFFIX = "@lid";
const WHATSAPP_GROUP_JID_SUFFIX = "@g.us";
const WHATSAPP_BROADCAST_JID_SUFFIX = "@broadcast";

export const STATUS_BROADCAST_JID = "status@broadcast";

/**
 * Quita el sufijo de dispositivo de un JID: `573001:39@s.whatsapp.net` -> `573001@s.whatsapp.net`.
 *
 * WhatsApp numera el APARATO desde el que se escribe y ese `:39` no es parte del
 * número. Dejarlo dentro produce dos cosas, y las dos se ven como contactos
 * duplicados:
 *
 * 1. La ficha y la conversación se guardan bajo un identificador distinto del
 *    del mismo contacto escribiendo desde otro aparato.
 * 2. `extractWhatsAppDigits` no ve el `:` —solo cuenta dígitos— así que el
 *    sufijo se le PEGA al número: `573233246305:39` sale como `57323324630539`,
 *    y con eso se fabricaban candidatos (`57323324630539@s.whatsapp.net`,
 *    `...@lid`) de un número que no existe. Es el mismo daño que el comentario
 *    de `buildWhatsAppJidCandidates` describe para los `@lid`.
 *
 * Va dentro de `cleanValue`, que es por donde entra TODO valor de este módulo:
 * así una sola regla decide, y no hay dos funciones que discrepen sobre qué es
 * el número. El backend hace lo mismo (`sinSufijoDeDispositivo`).
 */
export function sinSufijoDeDispositivo(value?: string | null) {
  return (value ?? "").replace(/:\d+@/, "@");
}

function cleanValue(value?: string | null) {
  return sinSufijoDeDispositivo(value?.trim() ?? "");
}

export function isStatusBroadcastJid(value?: string | null) {
  return cleanValue(value).toLowerCase() === STATUS_BROADCAST_JID;
}

export function isGroupJid(value?: string | null) {
  return cleanValue(value).toLowerCase().endsWith(WHATSAPP_GROUP_JID_SUFFIX);
}

export function isBroadcastJid(value?: string | null) {
  const normalized = cleanValue(value).toLowerCase();
  return normalized.endsWith(WHATSAPP_BROADCAST_JID_SUFFIX);
}

/**
 * JID con esquema "LID" de WhatsApp (`@lid`): identificador de PRIVACIDAD, NO un
 * teléfono. Sus dígitos parecen un número (15+) pero no lo son. El teléfono real
 * viaja aparte (senderPn / remoteJidAlt @s.whatsapp.net).
 */
export function isLidJid(value?: string | null) {
  return cleanValue(value).toLowerCase().endsWith(WHATSAPP_LID_JID_SUFFIX);
}

export function extractWhatsAppDigits(value?: string | null) {
  const raw = cleanValue(value);

  if (!raw || isGroupJid(raw) || isBroadcastJid(raw)) {
    return "";
  }

  return raw.replace(/[^\d]/g, "");
}

export function isLikelyIndividualJid(value?: string | null) {
  if (!cleanValue(value) || isGroupJid(value) || isBroadcastJid(value)) {
    return false;
  }

  return Boolean(extractWhatsAppDigits(value));
}

export function normalizeWhatsAppConversationJid(value: string) {
  const raw = cleanValue(value);

  if (!raw) {
    return "";
  }

  if (isStatusBroadcastJid(raw) || isGroupJid(raw) || isBroadcastJid(raw)) {
    return raw;
  }

  if (raw.includes("@")) {
    return raw;
  }

  const digits = extractWhatsAppDigits(raw);

  if (!digits) {
    return raw;
  }

  return `${digits}${WHATSAPP_USER_JID_SUFFIX}`;
}

export function pickExplicitWhatsAppPhoneJid(values: Array<string | null | undefined>) {
  const cleanedValues = values.map((value) => cleanValue(value)).filter(Boolean);

  const explicitUserJid = cleanedValues.find((value) =>
    value.toLowerCase().endsWith(WHATSAPP_USER_JID_SUFFIX),
  );
  if (explicitUserJid) {
    return explicitUserJid;
  }

  const digitsOnlyValue = cleanedValues.find((value) => !value.includes('@') && extractWhatsAppDigits(value));
  if (digitsOnlyValue) {
    const digits = extractWhatsAppDigits(digitsOnlyValue);
    if (digits) {
      return `${digits}${WHATSAPP_USER_JID_SUFFIX}`;
    }
  }

  return '';
}

export function buildWhatsAppJidCandidates(
  value: string,
  extraValues: Array<string | null | undefined> = [],
) {
  const candidates = new Set<string>();

  const addValue = (input?: string | null) => {
    const raw = cleanValue(input);

    if (!raw) {
      return;
    }

    candidates.add(raw);

    if (isStatusBroadcastJid(raw) || isGroupJid(raw) || isBroadcastJid(raw)) {
      return;
    }

    const canonical = normalizeWhatsAppConversationJid(raw);
    if (canonical) {
      candidates.add(canonical);
    }

    // Un @lid NO es un teléfono: sus dígitos son un ID de privacidad. Fabricar
    // `<lidDigits>@s.whatsapp.net` producía un JID falso que jamás casa con la
    // sesión real (guardada bajo el número) y podía casar con un contacto ajeno.
    // Para un @lid solo conservamos su forma literal; el teléfono real llega
    // aparte (senderPn / remoteJidAlt) como extraValue.
    if (isLidJid(raw)) {
      return;
    }

    const digits = extractWhatsAppDigits(raw);
    if (!digits) {
      return;
    }

    candidates.add(digits);
    candidates.add(`${digits}${WHATSAPP_USER_JID_SUFFIX}`);
    candidates.add(`${digits}${WHATSAPP_LID_JID_SUFFIX}`);
  };

  addValue(value);
  for (const extraValue of extraValues) {
    addValue(extraValue);
  }

  return Array.from(candidates);
}

export function pickPreferredWhatsAppRemoteJid(values: Array<string | null | undefined>) {
  const cleanedValues = values.map((value) => cleanValue(value)).filter(Boolean);

  const directGroupOrBroadcast = cleanedValues.find(
    (value) => isStatusBroadcastJid(value) || isGroupJid(value) || isBroadcastJid(value),
  );
  if (directGroupOrBroadcast) {
    return directGroupOrBroadcast;
  }

  const explicitUserJid = cleanedValues.find((value) =>
    value.toLowerCase().endsWith(WHATSAPP_USER_JID_SUFFIX),
  );
  if (explicitUserJid) {
    return explicitUserJid;
  }

  const normalizedIndividual = cleanedValues
    .map((value) => normalizeWhatsAppConversationJid(value))
    .find((value) => value.endsWith(WHATSAPP_USER_JID_SUFFIX));
  if (normalizedIndividual) {
    return normalizedIndividual;
  }

  const withSuffix = cleanedValues.find((value) => value.includes("@"));
  if (withSuffix) {
    return withSuffix;
  }

  return cleanedValues[0] ?? "";
}

// Prefijos ordenados de mayor a menor longitud para match greedy
const KNOWN_PREFIXES = [
  '1809','1829','1849',           // Rep. Dominicana
  '1787','1939',                  // Puerto Rico
  '593','591','595','598',        // Ecuador, Bolivia, Paraguay, Uruguay
  '506','503','502','504','505','507', // C. Rica, El Salvador, Guatemala, Honduras, Nicaragua, Panamá
  '57','58','51','52','56','54','55','53', // Colombia, Venezuela, Perú, México, Chile, Argentina, Brasil, Cuba
  '1',                            // USA / Canadá
];

function groupLocal(local: string): string {
  const len = local.length;
  if (len === 7)  return `${local.slice(0,3)} ${local.slice(3)}`;
  if (len === 8)  return `${local.slice(0,4)} ${local.slice(4)}`;
  if (len === 9)  return `${local.slice(0,2)} ${local.slice(2,5)} ${local.slice(5)}`;
  if (len === 10) return `${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6)}`;
  return local;
}

export function fmtPhone(remoteJid: string | null | undefined): string {
  if (!remoteJid) return '';
  // @lid es un ID interno de WhatsApp, no un número de teléfono real
  if (remoteJid.toLowerCase().endsWith('@lid')) return '';
  // El sufijo de dispositivo se quita ANTES de quedarse con los digitos: si no,
  // el ":39" se le pega al numero y sale "+57 323324630539" en la ficha del
  // contacto. Esta funcion no pasa por `cleanValue`, asi que lo hace ella.
  const digits = sinSufijoDeDispositivo(remoteJid).replace(/@.*/, '').replace(/\D/g, '');
  if (!digits) return '';

  const cc = KNOWN_PREFIXES.find(p => digits.startsWith(p));
  if (cc) return `+${cc} ${groupLocal(digits.slice(cc.length))}`;

  return `+${digits}`;
}

export function pickObservedAlternateRemoteJid(
  preferredRemoteJid: string,
  values: Array<string | null | undefined>,
) {
  const preferred = cleanValue(preferredRemoteJid);
  const seen = new Set<string>();

  for (const value of values) {
    const raw = cleanValue(value);
    if (!raw || raw === preferred || seen.has(raw) || !raw.includes("@")) {
      continue;
    }

    seen.add(raw);
    return raw;
  }

  return null;
}
