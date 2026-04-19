"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { encodeApiKeyRef, buildRegisterUrl } from "@/lib/register-link";

export interface RegisterLinkItem {
  id: string;
  serverUrl: string;
  ref: string;
  registerUrl: string;
}

export type GetRegisterLinksResult =
  | { success: true; links: RegisterLinkItem[] }
  | { success: false; error: string };

export async function getRegisterLinksAction(): Promise<GetRegisterLinksResult> {
  const user = await currentUser();

  if (!user || !isAdminLike(user.role)) {
    return { success: false, error: "Acceso denegado." };
  }

  const apiKeys = await db.apiKey
    .findMany({ select: { id: true, url: true }, orderBy: { createdAt: "asc" } })
    .catch(() => null);

  if (!apiKeys) {
    return { success: false, error: "Error al obtener las API Keys." };
  }

  const links: RegisterLinkItem[] = apiKeys.map((ak) => {
    const ref = encodeApiKeyRef(ak.id);
    return {
      id: ak.id,
      serverUrl: ak.url,
      ref,
      registerUrl: buildRegisterUrl(ref),
    };
  });

  return { success: true, links };
}
