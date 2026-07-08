import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { resolveLandingRoute } from "@/lib/pwa-landing";

export const dynamic = "force-dynamic";

/**
 * Ruta de arranque de la PWA (start_url del manifest). Decide server-side a dónde
 * entrar al abrir la app instalada: CRM dashboard → Chats → home, según el acceso
 * del usuario (ver resolveLandingRoute). Al ser un redirect en el servidor no hay
 * parpadeo.
 */
export default async function AbrirApp() {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/");

  redirect(await resolveLandingRoute(user));
}
