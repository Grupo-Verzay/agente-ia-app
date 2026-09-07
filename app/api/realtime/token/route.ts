import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
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

  // userIds cuyas conversaciones puede ver el usuario. El webhook emite a la
  // sala `user:{dueño de la línea}`, así que hay que unirse a la sala de CADA
  // cuenta cuyas líneas salen en la bandeja.
  //
  // Iban solo la propia, la del dueño y la de sesión. Pero la bandeja de Chats
  // junta también las líneas de las cuentas VINCULADAS (`linked_accounts`, en
  // los dos sentidos: las que esta cuenta tiene vinculadas y las que la tienen
  // vinculada a ella; ver `allSessionUserIds` en chats/page.tsx). Para esas
  // líneas no llegaba NINGÚN aviso en vivo: la fila de la lista se movía con
  // el reloj de 20 s y la conversación abierta se quedaba esperando a su
  // sondeo, que con Evolution lenta eran minutos. "Se ve en la columna y en
  // la conversación no", para todas las líneas de cuentas vinculadas, siempre.
  //
  // Mismo conjunto que la bandeja, calculado igual.
  const effectiveOwnerId = user.ownerId ?? user.id;
  const sessionUserId = user.sessionUserId ?? user.id;

  const [vinculadas, maestras] = await Promise.all([
    db.$queryRaw<{ id: string }[]>`
      SELECT "linked_user_id" AS id FROM "linked_accounts" WHERE "master_user_id" = ${effectiveOwnerId}
    `.catch((error) => {
      console.error("[realtime] no se pudieron leer las cuentas vinculadas:", error);
      return [] as { id: string }[];
    }),
    db.$queryRaw<{ id: string }[]>`
      SELECT "master_user_id" AS id FROM "linked_accounts" WHERE "linked_user_id" = ${sessionUserId}
    `.catch((error) => {
      console.error("[realtime] no se pudieron leer las cuentas maestras:", error);
      return [] as { id: string }[];
    }),
  ]);

  const userIds = Array.from(
    new Set(
      [
        effectiveOwnerId,
        user.id,
        user.sessionUserId,
        ...vinculadas.map((fila) => fila.id),
        ...maestras.map((fila) => fila.id),
      ].filter(Boolean),
    ),
  ) as string[];

  const token = signRealtimeToken({ userIds }, secret, 3600);

  return NextResponse.json({ enabled: true, url, token, cuentas: userIds.length });
}
