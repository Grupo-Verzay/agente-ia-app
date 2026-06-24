import { NextResponse, type NextRequest } from "next/server";
import { buildColoredAvatarSvg } from "@/lib/avatar";

export const dynamic = "force-dynamic";

function coloredAvatarResponse(seed: string) {
  return new NextResponse(buildColoredAvatarSvg(seed), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      // Caché corto: el SVG es trivial de generar y así un cambio de diseño se
      // refleja pronto (evita avatares "viejos" cacheados tras un despliegue).
      "Cache-Control": "public, max-age=300",
    },
  });
}

// Hosts permitidos para el proxy (evita SSRF). Las fotos de perfil de WhatsApp
// vienen de *.whatsapp.net; agrega aquí otros orígenes legítimos si hiciera falta.
function isAllowedHost(hostname: string): boolean {
  return (
    hostname === "whatsapp.net" ||
    hostname.endsWith(".whatsapp.net") ||
    hostname.endsWith(".fbcdn.net")
  );
}

/**
 * Proxy de avatares: descarga la foto de perfil del lado servidor y la sirve.
 * Si la URL caducó (403) o falla, redirige al placeholder local (200), de modo
 * que el navegador nunca muestra un error 403/404 en consola.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u");
  const seed = request.nextUrl.searchParams.get("s") || raw || "";

  if (!raw) {
    return coloredAvatarResponse(seed);
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return coloredAvatarResponse(seed);
  }

  if (target.protocol !== "https:" || !isAllowedHost(target.hostname)) {
    return coloredAvatarResponse(seed);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      // Foto caducada/403 → avatar coloreado (mismo color del contacto).
      return coloredAvatarResponse(seed);
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // El navegador cachea la foto; las URLs de WhatsApp caducan igual, así
        // que un día es un buen equilibrio entre frescura y carga.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return coloredAvatarResponse(seed);
  }
}
