import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { lasCuentasQueVeLaBandeja } from "@/lib/cuentas-asociadas";
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
  // cuenta cuyas líneas salen en la bandeja — y de NINGUNA más.
  //
  // Es exactamente el conjunto de la bandeja (`lasCuentasQueVeLaBandeja`): la
  // propia y las que cuelgan de ella hacia abajo. Antes se calculaba aquí con
  // su propia consulta y en los dos sentidos, así que una cuenta hija se unía a
  // la sala de su MADRE y recibía en vivo los avisos de sus líneas, que ni
  // salen en su bandeja ni puede tocar (punto 5 de la auditoría de alcance).
  // Una sala de más no es un aviso de más: es una conversación ajena llegando
  // al navegador.
  //
  // Si no se puede calcular, la propia, la de sesión y la efectiva: se pierden
  // avisos de las vinculadas —el reloj de 20 s los trae igual—, nunca se ganan
  // los de otra cuenta.
  const effectiveOwnerId = user.ownerId ?? user.id;
  let cuentas: string[];
  try {
    cuentas = await lasCuentasQueVeLaBandeja(user);
  } catch (error) {
    console.error("[realtime] no se pudieron calcular las cuentas de la bandeja:", error);
    cuentas = [effectiveOwnerId];
  }

  const userIds = Array.from(
    new Set([effectiveOwnerId, user.id, user.sessionUserId, ...cuentas].filter(Boolean)),
  ) as string[];

  const token = signRealtimeToken({ userIds }, secret, 3600);

  return NextResponse.json({ enabled: true, url, token, cuentas: userIds.length });
}
