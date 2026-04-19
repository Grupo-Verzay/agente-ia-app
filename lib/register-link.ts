/**
 * Utilities for encoding/decoding ApiKey IDs in registration URLs.
 * The actual API key secret is NEVER included in the URL — only the record ID.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Encodes an ApiKey UUID into a URL-safe token.
 * Uses base64url so it's opaque but not sensitive.
 */
export function encodeApiKeyRef(apiKeyId: string): string {
  return Buffer.from(apiKeyId, "utf8").toString("base64url");
}

/**
 * Decodes a ref token back to an ApiKey UUID.
 * Returns null if the token is invalid or the decoded value is not a UUID.
 */
export function decodeApiKeyRef(ref: string): string | null {
  try {
    const decoded = Buffer.from(ref, "base64url").toString("utf8");
    return UUID_REGEX.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Builds a full registration URL for a given encoded ref token. */
export function buildRegisterUrl(ref: string): string {
  return `https://agente.ia-app.com/register?ref=${ref}`;
}
