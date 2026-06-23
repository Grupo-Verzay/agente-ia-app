import { createHmac } from "crypto";

/**
 * Firma un token HMAC-SHA256 simple para autenticar el handshake del WebSocket
 * contra el servidor de tiempo real (api-webhook), que lo verifica con el mismo
 * secreto (REALTIME_JWT_SECRET).
 *
 * Formato: base64url(payloadJSON).base64url(hmac)
 * Solo debe usarse en el servidor (route handler), nunca en el cliente.
 */
export function signRealtimeToken(
  payload: { userIds: string[]; [key: string]: unknown },
  secret: string,
  ttlSeconds = 3600,
): string {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}
