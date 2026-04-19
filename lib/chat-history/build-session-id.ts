import {
  buildWhatsAppJidCandidates,
  normalizeWhatsAppConversationJid,
} from '@/lib/whatsapp-jid';

export function normalizeChatHistoryRemoteJid(remoteJid: string): string {
  const safeRemoteJid = remoteJid?.trim();

  if (!safeRemoteJid) {
    throw new Error('remoteJid es requerido para construir el sessionId.');
  }

  const normalizedRemoteJid = normalizeWhatsAppConversationJid(safeRemoteJid);
  if (!normalizedRemoteJid) {
    throw new Error('remoteJid no es valido para construir el sessionId.');
  }

  return normalizedRemoteJid;
}

function normalizeLegacyChatHistoryRemoteJid(remoteJid: string): string {
  const safeRemoteJid = remoteJid?.trim();

  if (!safeRemoteJid) {
    throw new Error('remoteJid es requerido para construir el sessionId.');
  }

  if (safeRemoteJid.includes('@')) {
    return safeRemoteJid;
  }

  const digitsOnly = safeRemoteJid.replace(/[^\d]/g, '');

  if (!digitsOnly) {
    throw new Error('remoteJid no es valido para construir el sessionId.');
  }

  return `${digitsOnly}@s.whatsapp.net`;
}

export function extractInstanceNameFromSendTextUrl(url: string): string | null {
  const safeUrl = url?.trim();

  if (!safeUrl) return null;

  const marker = '/message/sendText/';
  const markerIndex = safeUrl.indexOf(marker);

  if (markerIndex === -1) return null;

  const rawInstanceName = safeUrl
    .slice(markerIndex + marker.length)
    .split(/[?#]/)[0]
    ?.trim();

  if (!rawInstanceName) return null;

  try {
    return decodeURIComponent(rawInstanceName).trim() || null;
  } catch {
    return rawInstanceName;
  }
}

export function buildChatHistorySessionId(instanceName: string, remoteJid: string): string {
  const safeInstance = instanceName?.trim();

  if (!safeInstance) {
    throw new Error('instanceName es requerido para construir el sessionId.');
  }

  return `${safeInstance}-${normalizeChatHistoryRemoteJid(remoteJid)}`;
}

export function buildChatHistorySessionIdCandidates(
  instanceName: string,
  remoteJid: string,
): string[] {
  const safeInstance = instanceName?.trim();

  if (!safeInstance) {
    throw new Error('instanceName es requerido para construir el sessionId.');
  }

  const candidates = buildWhatsAppJidCandidates(remoteJid);
  const sessionIds = new Set<string>();

  for (const candidate of candidates) {
    try {
      sessionIds.add(`${safeInstance}-${normalizeLegacyChatHistoryRemoteJid(candidate)}`);
    } catch {
      // Ignora aliases invalidos.
    }

    try {
      sessionIds.add(`${safeInstance}-${normalizeChatHistoryRemoteJid(candidate)}`);
    } catch {
      // Ignora aliases invalidos.
    }
  }

  return Array.from(sessionIds);
}
