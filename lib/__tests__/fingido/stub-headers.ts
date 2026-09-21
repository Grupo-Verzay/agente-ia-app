/** `headers()` fingido: solo hace falta `.get("host")` para armar el origen. */
export async function headers() {
    return new Map<string, string>([["host", "localhost"]]);
}
