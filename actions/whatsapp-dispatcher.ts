'use server';

import { sendBaileysTextAction } from '@/actions/baileys-chat-actions';
import { sendChannelTextAction } from '@/actions/channel-chat-actions';
import { sendingMessages } from '@/actions/sending-messages-actions';
import { db } from '@/lib/db';

type DispatcherInstance = {
  instanceId: string | null;
  instanceName: string | null;
  instanceType: string | null;
  metaAccessToken?: string | null;
  metaPhoneNumberId?: string | null;
  metaChannel?: string | null;
};

export type WhatsAppDispatcherLine = {
  id: string;
  notificationNumber: string | null;
  instanceId: string;
  instanceName: string;
  instanceType: string | null;
  serverUrl: string | null;
  apiKey: string | null;
  provider: 'evolution' | 'baileys' | 'meta';
};

function normalizeBaseUrl(url: string | null | undefined): string {
  const value = (url ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isBaileys(instanceType: string | null | undefined) {
  return instanceType?.trim().toLowerCase() === 'baileys';
}

function isMetaWhatsApp(instance: Pick<DispatcherInstance, 'instanceType' | 'metaChannel'>) {
  return (
    instance.instanceType?.trim().toLowerCase() === 'meta' &&
    (!instance.metaChannel || instance.metaChannel.trim().toLowerCase() === 'whatsapp')
  );
}

function isWhatsappLike(instanceType: string | null | undefined) {
  const type = instanceType?.trim().toLowerCase();
  return !type || type === 'whatsapp' || type === 'baileys' || type === 'meta';
}

function canDispatchWhatsApp(instance: DispatcherInstance) {
  if (instance.instanceType?.trim().toLowerCase() === 'meta') {
    return isMetaWhatsApp(instance);
  }
  return isWhatsappLike(instance.instanceType);
}

function preferConfiguredInstance(
  instances: DispatcherInstance[],
  preferredInstanceName?: string | null,
) {
  const candidates = instances.filter((instance) => canDispatchWhatsApp(instance));
  if (preferredInstanceName) {
    const preferred = candidates.find((instance) => instance.instanceName === preferredInstanceName);
    if (preferred) return [preferred, ...candidates.filter((instance) => instance !== preferred)];
  }
  return [
    ...candidates.filter((instance) => isMetaWhatsApp(instance)),
    ...candidates.filter((instance) => isBaileys(instance.instanceType)),
    ...candidates.filter((instance) => !isMetaWhatsApp(instance) && !isBaileys(instance.instanceType)),
  ];
}

async function isEvolutionOpen(args: {
  serverUrl: string;
  apiKey: string | null;
  instanceName: string;
}) {
  if (!args.serverUrl || !args.apiKey || !args.instanceName) return false;

  try {
    const response = await fetch(
      `${args.serverUrl}/instance/connectionState/${encodeURIComponent(args.instanceName)}`,
      {
        method: 'GET',
        headers: { apikey: args.apiKey },
        cache: 'no-store',
      },
    );
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    const state = data?.instance?.state ?? data?.state ?? data?.connectionState;
    return String(state ?? '').toLowerCase() === 'open';
  } catch {
    return false;
  }
}

async function isBaileysOpen(instanceName: string) {
  const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, '');
  const secret = process.env.BAILEYS_SECRET || process.env.CRM_FOLLOW_UP_RUNNER_KEY || '';
  if (!backendUrl || !secret || !instanceName) return false;

  try {
    const response = await fetch(
      `${backendUrl}/whatsapp/baileys/status/${encodeURIComponent(instanceName)}`,
      {
        headers: { 'x-internal-secret': secret },
        cache: 'no-store',
      },
    );
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    const status = String(data?.status ?? data?.state ?? data?.connection ?? '').toLowerCase();
    return Boolean(data?.connected) || status === 'open' || status === 'connected';
  } catch {
    return false;
  }
}

function isMetaOpen(instance: DispatcherInstance) {
  return Boolean(instance.instanceName && instance.metaPhoneNumberId && instance.metaAccessToken);
}

async function findLineForUser(
  userId: string,
  preferredInstanceName?: string | null,
  options?: { requireConnected?: boolean },
): Promise<WhatsAppDispatcherLine | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      notificationNumber: true,
      apiKey: { select: { url: true, key: true } },
      instancias: {
        select: {
          instanceId: true,
          instanceName: true,
          instanceType: true,
          metaAccessToken: true,
          metaPhoneNumberId: true,
          metaChannel: true,
        },
      },
    },
  });

  if (!user) return null;

  const serverUrl = normalizeBaseUrl(user.apiKey?.url);
  const candidates = preferConfiguredInstance(user.instancias, preferredInstanceName);
  let fallback: WhatsAppDispatcherLine | null = null;

  for (const instance of candidates) {
    if (!instance.instanceName || !instance.instanceId) continue;

    const provider = isMetaWhatsApp(instance)
      ? 'meta'
      : isBaileys(instance.instanceType)
        ? 'baileys'
        : 'evolution';
    const line: WhatsAppDispatcherLine = {
      id: user.id,
      notificationNumber: user.notificationNumber ?? null,
      instanceId: instance.instanceId,
      instanceName: instance.instanceName,
      instanceType: instance.instanceType,
      serverUrl: provider === 'evolution' ? serverUrl : null,
      apiKey: provider === 'evolution' ? user.apiKey?.key ?? null : null,
      provider,
    };

    fallback ??= line;

    const connected = provider === 'meta'
      ? isMetaOpen(instance)
      : provider === 'baileys'
        ? await isBaileysOpen(instance.instanceName)
        : await isEvolutionOpen({
          serverUrl,
          apiKey: user.apiKey?.key ?? null,
          instanceName: instance.instanceName,
        });

    if (connected) return line;
  }

  return options?.requireConnected ? null : fallback;
}

async function findOfficialVerzayLine(preferredInstanceName?: string | null) {
  const superAdmins = await db.user.findMany({
    where: {
      role: 'super_admin',
      instancias: { some: { instanceName: { not: '' } } },
    },
    select: { id: true, name: true, company: true },
  });

  const ordered = superAdmins.sort((a, b) => {
    const aLabel = `${a.company ?? ''} ${a.name ?? ''}`.toLowerCase();
    const bLabel = `${b.company ?? ''} ${b.name ?? ''}`.toLowerCase();
    const aIsGrupo = aLabel.includes('grupo');
    const bIsGrupo = bLabel.includes('grupo');
    if (aIsGrupo !== bIsGrupo) return aIsGrupo ? -1 : 1;
    return aLabel.localeCompare(bLabel);
  });

  for (const admin of ordered) {
    const line = await findLineForUser(admin.id, preferredInstanceName, { requireConnected: true });
    if (line) return line;
  }

  return null;
}

export async function resolveWhatsAppDispatcherLine(args?: {
  ownerUserId?: string | null;
  preferredInstanceName?: string | null;
  includeAdminFallback?: boolean;
}): Promise<WhatsAppDispatcherLine | null> {
  const ownerUserId = args?.ownerUserId?.trim() || null;
  const includeAdminFallback = args?.includeAdminFallback ?? true;

  if (!ownerUserId) {
    return findOfficialVerzayLine(args?.preferredInstanceName);
  }

  const ownerLine = await findLineForUser(ownerUserId, args?.preferredInstanceName, { requireConnected: true });
  if (ownerLine) return ownerLine;

  if (!includeAdminFallback) return null;

  return findOfficialVerzayLine(args?.preferredInstanceName);
}

export async function sendViaWhatsAppDispatcher(args: {
  dispatcher: WhatsAppDispatcherLine;
  remoteJid: string;
  text: string;
  history?: Parameters<typeof sendingMessages>[0]['history'];
}) {
  if (args.dispatcher.provider === 'baileys') {
    const result = await sendBaileysTextAction(args.dispatcher.instanceName, args.remoteJid, {
      kind: 'text',
      text: args.text,
    });
    return {
      success: result.success,
      message: result.message,
      error: result.success ? undefined : result.message,
    };
  }

  if (args.dispatcher.provider === 'meta') {
    return sendChannelTextAction(args.dispatcher.instanceName, args.remoteJid, {
      kind: 'text',
      text: args.text,
    });
  }

  if (!args.dispatcher.serverUrl || !args.dispatcher.instanceId) {
    return {
      success: false,
      message: 'Dispatcher Evolution sin configuracion completa.',
      error: 'MISSING_EVOLUTION_DISPATCHER',
    };
  }

  return sendingMessages({
    url: `${args.dispatcher.serverUrl}/message/sendText/${encodeURIComponent(args.dispatcher.instanceName)}`,
    apikey: args.dispatcher.instanceId,
    remoteJid: args.remoteJid,
    text: args.text,
    history: args.history,
  });
}
