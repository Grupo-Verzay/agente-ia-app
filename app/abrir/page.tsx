import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { canAccessChats } from "@/lib/pwa-landing";

export const dynamic = "force-dynamic";

/**
 * Ruta de arranque de la PWA (start_url del manifest). Decide server-side a
 * dónde entrar al abrir la app instalada:
 *   - Con acceso a Chats  → /chats (pantalla principal operativa).
 *   - Sin acceso (plan)   → /      (home).
 * Al ser un redirect en el servidor no hay parpadeo. Si más adelante se quiere
 * una preferencia de "pantalla de inicio" por usuario, se resuelve aquí.
 */
export default async function AbrirApp() {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/chats");

  const chats = await canAccessChats(user);
  redirect(chats ? "/chats" : "/");
}
