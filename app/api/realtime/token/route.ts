import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { signRealtimeToken } from "@/lib/realtime/realtime-token";

export const dynamic = "force-dynamic";

/**
 * Devuelve un token corto + la URL del servidor de tiempo real para que el
 * cliente abra el WebSocket. Autenticado con la sesión de NextAuth.
 *
 * Feature flag por entorno: si no están configurados REALTIME_JWT_SECRET y
 * REALTIME_URL, responde { enabled: false } y el cliente sigue funcionando
 * solo con el polling de fondo (sin cambios de comportamiento).
 *
 * REALTIME_URL se lee aquí (servidor) y se envía al cliente en la respuesta,
 * por eso NO necesita el prefijo NEXT_PUBLIC_ (que se hornea en build-time).
 */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const secret = process.env.REALTIME_JWT_SECRET;
  const url = process.env.REALTIME_URL;
  if (!secret || !url) {
    return NextResponse.json({ enabled: false });
  }

  // userIds cuyas conversaciones puede ver el usuario. El webhook emite a
  // room `user:{ownerId}`, así que un asesor debe unirse al room del dueño.
  const effectiveOwnerId = user.ownerId ?? user.id;
  const userIds = Array.from(
    new Set([effectiveOwnerId, user.id, user.sessionUserId].filter(Boolean)),
  ) as string[];

  const token = signRealtimeToken({ userIds }, secret, 3600);

  return NextResponse.json({ enabled: true, url, token });
}
