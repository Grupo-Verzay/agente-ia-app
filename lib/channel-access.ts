import "server-only";

import { db } from "@/lib/db";
import type { ChannelFlags } from "@/lib/channel-training";

/**
 * Flags de habilitación de canales del usuario (los define el plan/administrador).
 * currentUser()/USER_SELECT solo trae onFacebook/onInstagram, por eso se consultan
 * aquí los cinco. WhatsApp (QR) es la base y no tiene flag (siempre disponible).
 */
export async function getUserChannelFlags(userId: string): Promise<ChannelFlags> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      onCalls: true,
      onWhatsappCloud: true,
      onTelegram: true,
      onFacebook: true,
      onInstagram: true,
    },
  });
  return {
    onCalls: !!u?.onCalls,
    onWhatsappCloud: !!u?.onWhatsappCloud,
    onTelegram: !!u?.onTelegram,
    onFacebook: !!u?.onFacebook,
    onInstagram: !!u?.onInstagram,
  };
}
