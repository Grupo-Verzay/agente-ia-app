"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getInstancesByUserId } from "@/actions/instances-actions";
import { getApiKeyById } from "@/actions/api-action";
import { fetchChatsFromEvolution } from "@/actions/chat-actions";
import { fetchChatsFromBaileys } from "@/actions/baileys-chat-actions";

export async function getChatUnreadCountAction(): Promise<number> {
  try {
    const user = await currentUser();
    if (!user) return 0;

    const effectiveOwnerId = user.ownerId ?? user.id;
    const ownerApiKeyId =
      effectiveOwnerId !== user.id
        ? (await db.user.findUnique({ where: { id: effectiveOwnerId }, select: { apiKeyId: true } }))?.apiKeyId
        : user.apiKeyId;

    const [resInstancias, resApikey] = await Promise.all([
      getInstancesByUserId(effectiveOwnerId),
      getApiKeyById(ownerApiKeyId ?? ""),
    ]);

    const instancias = resInstancias.success && Array.isArray(resInstancias.data) ? resInstancias.data : [];
    const apiKey = resApikey.success && resApikey.data ? resApikey.data : null;

    if (!instancias.length || !apiKey) return 0;

    const instance = instancias.find((i) => i.instanceType === "Whatsapp")
      ?? instancias.find((i) => i.instanceType == null)
      ?? instancias.find((i) => i.instanceType === "baileys")
      ?? instancias[0];

    if (!instance) return 0;

    const isBaileys = instance.instanceType === "baileys";

    if (isBaileys) {
      const result = await fetchChatsFromBaileys(instance.instanceName);
      if (!result.success || !result.data) return 0;
      return result.data.filter((c) => (c.unreadCount ?? 0) > 0).length;
    }

    const result = await fetchChatsFromEvolution(
      { url: apiKey.url, key: apiKey.key },
      instance.instanceName,
    );
    if (!result.success || !result.data) return 0;
    return result.data.filter((c) => (c.unreadCount ?? 0) > 0).length;
  } catch {
    return 0;
  }
}
