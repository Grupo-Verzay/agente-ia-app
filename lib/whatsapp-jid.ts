const WHATSAPP_USER_JID_SUFFIX = "@s.whatsapp.net";
const WHATSAPP_LID_JID_SUFFIX = "@lid";
const WHATSAPP_GROUP_JID_SUFFIX = "@g.us";
const WHATSAPP_BROADCAST_JID_SUFFIX = "@broadcast";

export const STATUS_BROADCAST_JID = "status@broadcast";

function cleanValue(value?: string | null) {
  return value?.trim() ?? "";
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
  const digits = remoteJid.replace(/@.*/, '').replace(/\D/g, '');
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
